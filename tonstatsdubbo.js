require('dotenv').config({override:true});
const { MongoClient } = require('mongodb');
const path = require('path');
const yargs = require('yargs');
const fs = require('fs');
const crypto = require('crypto');
const socketEvents = require('./socketEvents');
const { createClient } = require('redis');
const RedisStore = require('connect-redis').RedisStore;
const jwt = require('jsonwebtoken');

const argv = yargs
    .option('port', {
        alias: 'p',
        description: 'Port to run the server on',
        type: 'number'
    })
    .option('host', {
        alias: 'h',
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
    .option('mongo', {
        description: 'MongoDB URL',
        type: 'string'
    }).option('charts', {
        description: 'Charts configuration',
        type: 'string'
    })   
    .help()
    .alias('help', 'h')
    .argv;

const min = 40000;
const max = 65534;
const port = argv.port || Math.floor(Math.random() * (max - min + 1)) + min;
const host = argv.host || 'localhost';
const https = argv.https;
const log = argv.log || false;
// Mode single-thread: suppression de cluster/multithreading
const isTest = argv.test || false;
const chartType = argv.charts || 'google';
const MONGO_URI = isTest ? process.env.MONGODB_URI_TEST : process.env.MONGODB_URI;
const redisOptsProd = isTest ? {
    username: 'default',
    password: process.env.REDIS_TEST_PASSWORD,
    socket: {
        host: process.env.REDIS_URL_TEST,
        port: 18422
    }
} : {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
};
const redisClient = createClient(redisOptsProd);
redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect();

// --- WebSocket session management & scheduled jobs per socket (stabilisé) ---
const wsTorn = require('./ws/wsTorn');
const wsTornAttacks = require('./ws/wsTornAttacks');
const wsStats = require('./ws/wsStats');
const wsInsertNetworth = require('./ws/wsInsertNetworth');
    
const client = new MongoClient(MONGO_URI, {
    compressors: ["snappy"]
  });

socketEvents.on('newSocket', async (socket, req, client) => {
    const usersCollection = client.db('sessions').collection('users');
    const users = await usersCollection.find({}, { projection: { id: 1, TornAPIKey:1 } }).toArray();
    users.forEach(u => {
        setInterval(() => wsTorn(socket, { session : {TornAPIKey : u.TornAPIKey, userID : u.id}}, client, fastify), 15*60*1000);
        setInterval(() =>wsTornAttacks(socket, { session : {TornAPIKey : u.TornAPIKey, userID : u.id}}, client), 15*60*1000);
        setInterval(() =>wsStats(socket, { session : {TornAPIKey : u.TornAPIKey, userID : u.id}}, client), 12*60*60*1000);
        setInterval(() =>wsInsertNetworth(socket, { session : {TornAPIKey : u.TornAPIKey, userID : u.id}}, client), 24*60*60*1000);
    }); 
    fastify.log.info(`Warmup completed, cached ${users.length} users`);
});

const fastify = require('fastify')({
    logger: log ? { level: process.env.FASTIFY_LOG_LEVEL || 'info', file: '/home/laurent/tornnode/test.log', base: { service: 'tonstatsdubbo' } } : false,
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
const dailyPriceAverager = require('./dailyPriceAverager');

fastify.register(fastifyCors, {
    origin: ['https://torn.dubertrand.fr', 'https://rpi5.dubertrand.corp'],
    credentials: true
});
fastify.register(fastifyCompress);
fastify.register(bodyParser);
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

fastify.register(fastifySession, {
    secret: process.env.SESSION_SECRET,
    store: new RedisStore({ client: redisClient }),
    cookie: { secure: https, httpOnly: true, sameSite: 'none' },
    rolling: true,
    crypto: sessionCrypto
});
// Protection des routes SPA et index
fastify.register(require('./routes/protectIndex'));
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

fastify.decorate('redis', redisClient);
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

client.connect().then(async () => {
    // Register routes
    // Enregistrer correctement le plugin wsBazaarPrice via fastify.register afin que fastify-plugin fonctionne
    fastify.decorate('mongo', client);
    fastify.register(require('./ws/wsBazaarPrice'), { redisClient });
    require('./routes/authenticate')(fastify, isTest);
    require('./routes/Utils')(fastify, isTest, chartType);
    require('./routes/wsHandler')(fastify, client, isTest, redisClient);
        // Warmup amélioré (instrumentation + validation)

    const warmupItemsCache = require('./utils/warmupItemsCache');
    warmupItemsCache({ fastify, mongoClient: client, redisClient })
        .catch(e => fastify.log.error('[warmup] exception '+e.message));

    
    fastify.get('/', (req, reply) => {
        if (req.session.TornAPIKey)
            return reply.sendFile('index.html');
        return reply.sendFile('login.html');
    });

    // Démarrage direct sans cluster
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
    fastify.listen({port, host}, (err, address) => {
        if (err) {

            fastify.log.error(err);
            process.exit(1);
        }

        fastify.log.info(`Server running at ${address}`);

        fastify.ready((e) => {
            if (e) fastify.log.error(e);
            else fastify.log.info(`ROUTES:\n${fastify.printRoutes()}`);
            // Planifier la tâche quotidienne de calcul des moyennes de prix
            const scheduleDailyAverageJob = () => {
                const now = new Date();
                const nextMidnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
                // exécuter 1min après minuit UTC
                const runAt = new Date(nextMidnightUtc.getTime() + 60 * 1000);
                const delay = runAt.getTime() - now.getTime();
                setTimeout(async () => {
                    try {
                        await dailyPriceAverager({ redisClient, mongoClient: client, fastify });
                    } catch (errJob) { fastify.log.error(`[scheduler] dailyPriceAverager error ${errJob.message}`); }
                    scheduleDailyAverageJob();
                }, delay);
                fastify.log.info(`[scheduler] daily price average job scheduled in ${Math.round(delay/1000)}s`);
            };

                scheduleDailyAverageJob();

        });
    });
});

