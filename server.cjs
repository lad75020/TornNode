require('dotenv').config({override:true});
const path = require('path');
const yargs = require('yargs');
const fs = require('fs');
const crypto = require('crypto');
const socketEvents = require('./socketEvents.cjs');
const RedisStore = require('connect-redis').RedisStore;
const jwt = require('jsonwebtoken');

const argv = yargs
    .option('port', {
        alias: 'p',
        description: 'Port to run the server on',
        type: 'number'
    })
    .option('host', {
        alias: 'H',
        description: 'Host to run the server on',
        type: 'string'
    })
    .option('log', {
        description: 'Logs',
        type: 'boolean'
    })
    .option('https', {
        description: 'HTTPS',
        type: 'boolean'
    })
    .option('test', {
        description: 'Test mode',
        type: 'boolean'
    })
    .help()
    .argv;


const port = (typeof argv.port === 'number' && !Number.isNaN(argv.port))
    ? argv.port
    : 3110;
const host = argv.host || 'localhost';
const https = argv.https;
const log = true;//argv.log || false;
// Mode single-thread: suppression de cluster/multithreading
const isTest = argv.test || false;
const MONGO_URI = isTest ? process.env.MONGODB_URI_TEST : process.env.MONGODB_URI;
// Configure Redis via @fastify/redis
let redisUrl;
if (isTest) {
    const host = process.env.REDIS_URL_TEST || '127.0.0.1';
    const port = process.env.REDIS_TEST_PORT || 18422;
    const username = process.env.REDIS_TEST_USERNAME || 'default';
    const password = process.env.REDIS_TEST_PASSWORD || '';
    const cred = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
    redisUrl = `redis://${cred}@${host}:${port}`;
} else {
    redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

// --- WebSocket session management ---
const wsTorn = require('./ws/wsTorn.cjs');
const wsTornAttacks = require('./ws/wsTornAttacks.cjs');
const wsStats = require('./ws/wsStats.cjs');
const wsInsertNetworth = require('./ws/wsInsertNetworth.cjs');
const wsCompanyStock = require('./ws/wsCompanyStock.cjs');
const wsCompanyDetails = require('./ws/wsCompanyDetails.cjs');
const wsCompanyProfile = require('./ws/wsCompanyProfile.cjs');

socketEvents.on('newSocket', async (socket, req) => {
    setInterval(() => wsCompanyStock(socket, req, fastify), 6*60*60*1000);
    setInterval(() => wsCompanyProfile(socket, req, fastify), 6*60*60*1000);
    setInterval(() => wsCompanyDetails(socket, req, fastify), 6*60*60*1000); 
});

let userImportSchedulerStarted = false;
const userImportSchedulerTimers = [];
function startUserImportScheduler() {
    if (userImportSchedulerStarted) return;
    userImportSchedulerStarted = true;
    const log = fastify.log;
    const running = {
        torn: false,
        attacks: false,
        stats: false,
        networth: false
    };
    const silentSocket = {
        send: () => {}
    };
    const buildReq = (user) => ({
        session: {
            TornAPIKey: user.TornAPIKey,
            userID: user.id
        }
    });
    async function fetchUsers() {
        if (!fastify.mongo) {
            return [];
        }
        const db = fastify.mongo?.db ? fastify.mongo.db('sessions') : fastify.mongo.client.db('sessions');
        const usersCollection = db.collection('users');
        return usersCollection.find({}, { projection: { id: 1, TornAPIKey: 1 } }).toArray();
    }
    async function runForAllUsers(taskName, taskFn) {
        const users = await fetchUsers();
        for (const user of users) {
            try {
                await taskFn(user);
            } catch (e) {
                try { log.warn(`[scheduler] ${taskName} user=${user.id} ${e.message}`); } catch {}
            }
        }
        try { log.info(`[scheduler] ${taskName} ran for ${users.length} users`); } catch {}
    }
    function schedule(taskName, intervalMs, taskFn, runImmediately = false) {
        if (runImmediately) {
            setImmediate(async () => {
                if (running[taskName]) return;
                running[taskName] = true;
                try {
                    await taskFn();
                } catch (e) {
                    try { log.warn(`[scheduler] ${taskName} error ${e.message}`); } catch {}
                } finally {
                    running[taskName] = false;
                }
            });
        }
        const timer = setInterval(async () => {
            if (running[taskName]) return;
            running[taskName] = true;
            try {
                await taskFn();
            } catch (e) {
                try { log.warn(`[scheduler] ${taskName} error ${e.message}`); } catch {}
            } finally {
                running[taskName] = false;
            }
        }, intervalMs);
        userImportSchedulerTimers.push(timer);
    }

    schedule('torn', 15*60*1000, async () => {
        await runForAllUsers('wsTorn', async (user) => {
            const req = buildReq(user);
            await wsTorn(silentSocket, req, fastify);
        });
    }, true);
    schedule('attacks', 15*60*1000, async () => {
        await runForAllUsers('wsTornAttacks', async (user) => {
            const req = buildReq(user);
            await wsTornAttacks(silentSocket, req, fastify);
        });
    }, true);
    schedule('stats', 12*60*60*1000, async () => {
        await runForAllUsers('wsStats', async (user) => {
            const req = buildReq(user);
            await wsStats(silentSocket, req, fastify);
        });
    }, true);
    schedule('networth', 24*60*60*1000, async () => {
        await runForAllUsers('wsInsertNetworth', async (user) => {
            const req = buildReq(user);
            await wsInsertNetworth(req, fastify, silentSocket);
        });
    }, true);

    try { log.info('[scheduler] user import warmup scheduled'); } catch {}
}

const fastify = require('fastify')({
    logger: log ? { level: process.env.FASTIFY_LOG_LEVEL || 'info', file: '/home/ubuntu/.tonstatsdubbo/rpi52.log', base: { service: 'tonstatsdubbo' } } : false,
    trustProxy: true
});


const fastifyCors = require('@fastify/cors');
const fastifyCookie = require('@fastify/cookie');
const fastifySession = require('@fastify/session');
const fastifyStatic = require('@fastify/static');
const fastifyFavicon = require('fastify-favicon');
const bodyParser = require('@fastify/formbody');
const fastifyCompress = require('@fastify/compress');
const fastifyWebsocket = require('@fastify/websocket');
const fastifyRateLimit = require('@fastify/rate-limit');
const fastifyJwt = require('@fastify/jwt');
const dailyPriceAverager = require('./dailyPriceAverager.cjs');
const fastifyRedis = require('@fastify/redis');

fastify.register(fastifyCors, {
    origin: true,
    credentials: true
});
fastify.register(fastifyCompress);
fastify.register(bodyParser);
fastify.register(fastifyRateLimit, {
    global: false
});
fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET
});
// Cookies & session AVANT la protection et les fichiers statiques pour que req.session soit disponible
fastify.register(fastifyCookie);

// Generate a 32-byte random secret for fastify-session crypto
const sessionCrypto = {
    sign: {
        key: crypto.randomBytes(32)
    },
    verify: {
        key: crypto.randomBytes(32)
    },
    encrypt: {
        key: crypto.randomBytes(32)
    },
    decrypt: {
        key: crypto.randomBytes(32)
    }
};

// Register a node-redis v4 client into @fastify/redis, then session with that client
// Root-level Redis client and plugins to expose fastify.redis globally
const { createClient } = require('redis');
const redisClient = createClient({ url: redisUrl });
redisClient.on('error', (e) => { try { fastify.log.error(`[redis] ${e.message}`); } catch {} });
redisClient.on('ready', () => { try { fastify.log.info('[redis] ready'); } catch {} });
// Connect in background to avoid plugin timeout if Redis is slow/unreachable
redisClient.connect().catch((e) => { try { fastify.log.error(`[redis] connect error: ${e.message}`); } catch {} });
fastify.register(fastifyRedis, { client: redisClient });
fastify.register(fastifySession, {
    secret: process.env.SESSION_SECRET,
    store: new RedisStore({ client: redisClient }),
    cookie: { secure: https, httpOnly: true, sameSite: 'none' },
    rolling: true,
    crypto: sessionCrypto
});
fastify.addHook('onClose', async (_i, done) => {
    try { await redisClient.quit(); } catch {} finally { done(); }
});
fastify.addHook('onClose', async (_i, done) => {
    userImportSchedulerTimers.forEach(clearInterval);
    done();
});
// Les plugins dépendant de la session doivent être enregistrés après fastify-session
fastify.after(() => {
    // Protection des routes SPA et index (requiert req.session)
    fastify.register(require('./routes/protectIndex.cjs'));
    // Fichiers statiques APRÈS la protection
    fastify.register(fastifyStatic, {
        root: path.join(__dirname, 'public'),
        prefix: '/',
        setHeaders: (res) => {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
    });
    fastify.register(fastifyFavicon, {
        path: path.join(__dirname, 'public')
    });
});

// fastify.redis is provided by @fastify/redis
// Register WebSocket with JWT auth
fastify.register(fastifyWebsocket, {
    options: { maxPayload: 10485760 },
    verifyClient: (info, done) => {
        // Extract token from query string
        try {
            const url = require('url');
            const query = url.parse(info.req.url, true).query;
            const token = query.token;
            if (!token) {
                info.req.user = null;
                info.req.authError = 'Missing JWT';
                return done(true);
            }
            jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                if (err) {
                    info.req.user = null;
                    info.req.authError = 'Invalid JWT';
                    return done(true);
                }
                info.req.user = decoded;
                return done(true);
            });
        } catch (e) {
            try { fastify.log && fastify.log.warn('[ws] verifyClient error: '+e.message); } catch {}
            info.req.user = null;
            info.req.authError = 'verifyClient exception';
            return done(true);
        }
    }
});

// Register Mongo plugin then continue setup
fastify.register(require('@fastify/mongodb'), {
    url: MONGO_URI,
    forceClose: true,
    // Pass native MongoClient options at the root level
    compressors: ['snappy']
});
    fastify.after(() => {
        fastify.register(require('./ws/wsBazaarPrice.cjs'));
        require('./routes/authenticate.cjs')(fastify, isTest);
        require('./routes/subscribe.cjs')(fastify, isTest);
        require('./routes/memoryMcp.cjs')(fastify);
        //require('./routes/Utils.cjs')(fastify, isTest, chartType);
        require('./routes/wsHandler.cjs')(fastify, isTest);
   });    
    // Register routes après session pour garantir req.session
    // Warmup amélioré (instrumentation + validation)

// Encapsulation de l'initialisation asynchrone (évite top-level await en CJS)



    // Planifier la tâche quotidienne de calcul des moyennes de prix
    const scheduleDailyAverageJob = () => {
        const now = new Date();
        const nextMidnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
        // exécuter 1min après minuit UTC
        const runAt = new Date(nextMidnightUtc.getTime() + 60 * 1000);
        const delay = runAt.getTime() - now.getTime();
        setTimeout(async () => {
            try {
                await dailyPriceAverager({ redisClient: fastify.redis, fastify });
            } catch (errJob) { fastify.log.error(`[scheduler] dailyPriceAverager error ${errJob.message}`); }
            scheduleDailyAverageJob();
        }, delay);
        fastify.log.info(`[scheduler] daily price average job scheduled in ${Math.round(delay/1000)}s`);
    };

    if (!isTest) {
        try {
            const pidDir = '/home/ubuntu/.tonstatsdubbo';
            if (!fs.existsSync(pidDir)) fs.mkdirSync(pidDir, { recursive: true });
            const pidFile = path.join(pidDir, 'tonstatsdubbo.pid');
            fs.writeFileSync(pidFile, process.pid.toString());
        } catch(e) {
            fastify.log.warn('Impossible d\'écrire le pid file: ' + e.message);
        }
    }

    // Root route: serve static index
    fastify.get('/', (req, reply) => {
        try {
            return reply.sendFile('index.html');
        } catch (e) {
            try { fastify.log && fastify.log.error('[root] handler error: ' + e.message); } catch {}
            return reply.code(500).send('Internal Server Error');
        }
    });

    const startServer = () => {
        fastify.listen({ port, host }, (err, address) => {
        if (err) {
            try { fastify.log.error(err); } catch {}
            process.exitCode = 1;
            return;
        }
        fastify.ready(() => {
            const warmupItemsCache = require('./utils/warmupItemsCache.cjs');
            warmupItemsCache({ fastify, redisClient: fastify.redis })
                .catch(e => fastify.log.error('[warmup] exception '+e.message));
            startUserImportScheduler();
            try { fastify.log.info(`ROUTES:\n${fastify.printRoutes()}`); } catch {}
        });
        fastify.log.info(`Server running at ${address}`);
        });

        scheduleDailyAverageJob();
    };

    startServer();
