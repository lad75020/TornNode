require('dotenv').config({ override: !process.argv.includes('--test') });
const path = require('path');
const yargs = require('yargs');
const fs = require('fs');
const socketEvents = require('./socketEvents.cjs');
const RedisStore = require('connect-redis').RedisStore;
const { createSessionService, SESSION_COOKIE_NAME } = require('./routes/authSession.cjs');

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
function isolatedUrl(value, fallback, protocol) {
    if (!value) return fallback;
    try {
        const url = new URL(value.includes('://') ? value : `${protocol}://${value}`);
        return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ? url.href.replace(/\/$/, '') : fallback;
    } catch { return fallback; }
}
const MONGO_URI = isTest
    ? isolatedUrl(process.env.MONGODB_URI_TEST, 'mongodb://127.0.0.1:27018/tornnode_auth_test', 'mongodb')
    : process.env.MONGODB_URI;
// Configure Redis via @fastify/redis
let redisUrl;
if (isTest) {
    redisUrl = isolatedUrl(process.env.REDIS_URL_TEST, `redis://127.0.0.1:${process.env.REDIS_TEST_PORT || 18422}`, 'redis');
} else {
    redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

// --- WebSocket session management & scheduled jobs per socket (stabilisé) ---
const wsTorn = require('./ws/wsTorn.cjs');
const wsTornAttacks = require('./ws/wsTornAttacks.cjs');
const wsStats = require('./ws/wsStats.cjs');
const wsInsertNetworth = require('./ws/wsInsertNetworth.cjs');
const wsCompanyStock = require('./ws/wsCompanyStock.cjs');
const wsCompanyDetails = require('./ws/wsCompanyDetails.cjs');
const wsCompanyProfile = require('./ws/wsCompanyProfile.cjs');

socketEvents.on('newSocket', async (socket, req) => {
    // Isolated browser tests verify authentication boundaries only; production
    // background jobs must never run against test identities or test sockets.
    if (isTest) return;
    const db = fastify.mongo?.db || fastify.mongo?.client?.db('sessions');
    const usersCollection = db.collection('users');
    const users = await usersCollection.find({}, { projection: { id: 1, TornAPIKey: 1 } }).toArray();
    users.forEach(u => {
        const session = { TornAPIKey: u.TornAPIKey, userId: u.id };
        setInterval(() => wsTorn(socket, { session }, fastify), 15 * 60 * 1000);
        setInterval(() => wsTornAttacks(socket, { session }, fastify), 15 * 60 * 1000);
        setInterval(() => wsStats(socket, { session }, fastify), 12 * 60 * 60 * 1000);
        setInterval(() => wsInsertNetworth({ session }, fastify, socket), 24 * 60 * 60 * 1000);
        setInterval(() => wsCompanyStock(socket, { session }, fastify), 6 * 60 * 60 * 1000);
        setInterval(() => wsCompanyProfile(socket, { session }, fastify), 6 * 60 * 60 * 1000);
        setInterval(() => wsCompanyDetails(socket, { session }, fastify), 6 * 60 * 60 * 1000);
    });
    fastify.log.info(`Warmup completed, cached ${users.length} users`);
});

const trustedProxy = process.env.TRUSTED_PROXY === 'true';
const fastify = require('fastify')({
    logger: log ? (isTest
        ? { level: process.env.FASTIFY_LOG_LEVEL || 'info', base: { service: 'tonstatsdubbo-test' } }
        : { level: process.env.FASTIFY_LOG_LEVEL || 'info', file: '/Users/laurent/RPI5/rpi52.log', base: { service: 'tonstatsdubbo' } }) : false,
    trustProxy: trustedProxy
});


const fastifyCors = require('@fastify/cors');
const fastifyCookie = require('@fastify/cookie');
const fastifySession = require('@fastify/session');
const fastifyStatic = require('@fastify/static');
const fastifyFavicon = require('fastify-favicon');
const bodyParser = require('@fastify/formbody');
const fastifyCompress = require('@fastify/compress');
const fastifyWebsocket = require('@fastify/websocket');
const dailyPriceAverager = require('./dailyPriceAverager.cjs');
const fastifyRedis = require('@fastify/redis');

fastify.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN || false,
    credentials: true
});
fastify.register(fastifyCompress);
fastify.register(bodyParser);
// Cookies & session AVANT la protection et les fichiers statiques pour que req.session soit disponible
fastify.register(fastifyCookie);

const sessionSecret = process.env.SESSION_SECRET || (isTest ? 'test-only-session-secret-must-be-at-least-32-characters' : null);
if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters');
const cooldownDigestSecret = process.env.AUTH_COOLDOWN_DIGEST_SECRET || (isTest ? 'test-only-cooldown-digest-secret' : null);
if (!cooldownDigestSecret || cooldownDigestSecret.length < 16) throw new Error('AUTH_COOLDOWN_DIGEST_SECRET must be set');
fastify.decorate('authCooldownDigestSecret', cooldownDigestSecret);

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
    secret: sessionSecret,
    store: new RedisStore({ client: redisClient }),
    cookieName: SESSION_COOKIE_NAME,
    cookie: { secure: isTest ? process.env.AUTH_TEST_COOKIE_SECURE === 'true' : true, httpOnly: true, sameSite: 'lax', path: '/' },
    rolling: false,
    saveUninitialized: false
});
fastify.decorate('authSessions', createSessionService({
    redis: redisClient,
    users: () => { const db = fastify.mongo?.db || fastify.mongo?.client?.db('sessions'); return db?.collection('users'); },
    cookieSecure: isTest ? process.env.AUTH_TEST_COOKIE_SECURE === 'true' : true,
    logger: fastify.log
}));
fastify.addHook('onClose', async (_i, done) => {
    try { await redisClient.quit(); } catch {} finally { done(); }
});
// Les plugins dépendant de la session doivent être enregistrés après fastify-session
fastify.after(() => {
    // Protection des routes SPA et index (requiert req.session)
    // Register at the root scope so the /index.html request hook also guards
    // the static route that @fastify/vite registers in its child scope.
    require('./routes/protectIndex.cjs')(fastify);
    // Fichiers statiques APRÈS la protection
    fastify.register(fastifyStatic, {
        root: isTest
            ? [path.join(__dirname, 'client', 'dist'), path.join(__dirname, 'public')]
            : path.join(__dirname, 'public'),
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
fastify.register(fastifyWebsocket, {
    options: { maxPayload: 10485760 }
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
    fastify.register(async function registerViteAndRoot(instance) {
        if (!isTest) {
            const fastifyVite = require('@fastify/vite');
            try {
                await instance.register(fastifyVite, {
                    root: 'client',
                    // Resolve the Vite Fastify cache relative to the Vite root:
                    // client/dist/vite.config.json.
                    distDir: 'dist',
                    dev: false,
                    spa: true
                });
                await instance.vite.ready();
            } catch (e) {
                try { instance.log.error('[vite] init failed '+e.message); } catch {}
                throw e;
            }
        }

        // Root route: serve SPA if authenticated, otherwise serve static login page
        instance.get('/', (req, reply) => {
            try {

                    return isTest ? reply.sendFile('index.html') : reply.html();
  
            } catch (e) {
                try { fastify.log && fastify.log.error('[root] handler error: ' + e.message); } catch {}
                return reply.code(500).send('Internal Server Error');
            }
        });
    });
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
            const pidDir = '/home/laurent/.tonstatsdubbo';
            if (!fs.existsSync(pidDir)) fs.mkdirSync(pidDir, { recursive: true });
            const pidFile = path.join(pidDir, 'tonstatsdubbo.pid');
            fs.writeFileSync(pidFile, process.pid.toString());
        } catch(e) {
            fastify.log.warn('Impossible d\'écrire le pid file: ' + e.message);
        }
    }

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
            try { fastify.log.info(`ROUTES:\n${fastify.printRoutes()}`); } catch {}
        });
        fastify.log.info(`Server running at ${address}`);
    });

    scheduleDailyAverageJob();
