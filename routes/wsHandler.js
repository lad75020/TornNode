// wsHandler.js
const socketEvents = require('../socketEvents');
const dailyPriceAverager = require('../dailyPriceAverager');
module.exports = (fastify, client, isTest, redisClient) => {
    fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket , req /*, reply */ ) => {
            const connId = Date.now().toString(36)+Math.random().toString(36).slice(2,7);
            const PING_INTERVAL = parseInt(process.env.WS_PING_INTERVAL_MS || '30000');
            const PONG_TIMEOUT = parseInt(process.env.WS_PONG_TIMEOUT_MS || (PING_INTERVAL * 2).toString());
            let lastPong = Date.now();
            try { fastify.log.info({ connId, ip: req.socket.remoteAddress }, '[ws] new /ws connection'); } catch(_) {}

            // Si l'auth JWT a été décodée côté verifyClient, propager un userID dans la session
            try {
                if (!req.session) req.session = {};
                if (!req.session.userID && req.user && (req.user.userID || req.user.id || req.user.sub)) {
                    req.session.userID = req.user.userID || req.user.id || req.user.sub;
                }
            } catch {}

            socketEvents.emit('newSocket', socket, req, client);
            // Envoyer l'userID au front pour usage localStorage
            try {
                if (req?.session?.userID) {
                    // Création structure DB user (asynchrone sans bloquer l'envoi du message)
                    const ensureUserDbStructure = require('../utils/ensureUserDbStructure');
                    ensureUserDbStructure(client, req.session.userID, fastify.log).catch(()=>{});
                    socket.send(JSON.stringify({ type:'session', userID: req.session.userID, time: Date.now() }));
                } else if (req?.authError) {
                    // Retourner l'erreur côté client mais ne pas fermer brutalement
                    try { socket.send(JSON.stringify({ type:'auth', ok:false, error:req.authError })); } catch {}
                }
            } catch(_){ }

            // Keep-alive (similaire à /wsb)
            const pingInterval = setInterval(() => {
                if (socket.readyState === 1) {
                    // Vérifie timeout
                    if (Date.now() - lastPong > PONG_TIMEOUT) {
                        try { fastify.log.warn({ connId }, '[ws] pong timeout; closing'); } catch(_){ }
                        try { socket.terminate(); } catch(_){ }
                        clearInterval(pingInterval);
                        return;
                    }
                    try { socket.ping(); } catch(_) {}
                } else {
                    clearInterval(pingInterval);
                }
            }, PING_INTERVAL);

            socket.on('close', (code, reason) => {
                clearInterval(pingInterval);
                fastify.log.info(`[ws] close code=${code} reason=${reason}`);
            });

            socket.on('error', (err) => {
                fastify.log.error(`[ws] socket error: ${err.message}`);
            });

            socket.on('pong', () => { lastPong = Date.now(); });

            socket.on('message', async (raw, isBinary) => {
                const recvTs = Date.now();
                let msg;
                try {
                    if (isBinary) {
                        // Optionnel: garder binaire si besoin futur
                        msg = raw.toString();
                    } else {
                        msg = typeof raw === 'string' ? raw : raw.toString();
                    }
                } catch (_) {
                    msg = '';
                }
                const message = msg.trim();
                if (message.length > 1000) {
                    fastify.log.warn({ connId, len: message.length }, '[ws] message truncated');
                }
                fastify.log.debug({ connId, size: message.length, isBinary }, '[ws] received');

                switch (message) {
                    case 'ping':
                        fastify.log.debug({ connId }, '[ws] ping');
                        // Rafraîchit aussi le watchdog afin d'éviter la fermeture si les pings WS sont filtrés
                        lastPong = Date.now();
                        try { socket.send('pong'); } catch(_) {}
                        return;
                    case 'torn':
                        fastify.log.info({ connId }, '[ws] torn command');
                                                // Marquer l'état d'import logs + suivi progress
                                                socket.__importingLogs = true;
                                                socket.__logsProgress = 0;
                                                socket.__logsImportStartedAt = Date.now();
                                                // Wrapper pour intercepter les messages sortants progress  (monkey-patch temporaire send)
                                                const origSend = socket.send.bind(socket);
                                                socket.send = function patchedSend(payload, ...rest) {
                                                    try {
                                                        if (typeof payload === 'string' && payload.startsWith('{')) {
                                                            try {
                                                                const j = JSON.parse(payload);
                                                                if (j && j.type === 'importProgress' && j.kind === 'logs' && typeof j.percent === 'number') {
                                                                    socket.__logsProgress = j.percent;
                                                                    if (socket.__logsProgress >= 100 && socket.__importingLogs) {
                                                                        // Fin import logs: restaurer send
                                                                        socket.__importingLogs = false;
                                                                        socket.send = origSend;
                                                                        // Déclenche attacks si demandé ou auto si pas de demande explicite déjà en file
                                                                        if (socket.__deferredTornAttacks || socket.__autoTriggerAttacksAfterLogs) {
                                                                            const shouldAuto = socket.__deferredTornAttacks || socket.__autoTriggerAttacksAfterLogs;
                                                                            socket.__deferredTornAttacks = false;
                                                                            socket.__autoTriggerAttacksAfterLogs = false;
                                                                            try { require('../ws/wsTornAttacks')(socket, req, client); } catch(e){ fastify.log.error(e); }
                                                                        }
                                                                    }
                                                                } else if (j && j.type === 'importedData' && typeof j.logsImported === 'number') {
                                                                    // Log importedData (ancienne logique) -> rien, géré par percent maintenant
                                                                }
                                                            } catch { /* ignore parse */ }
                                                        }
                                                    } catch {}
                                                    return origSend(payload, ...rest);
                                                };
                                                // Lancer import logs
                                                require('../ws/wsTorn')(socket, req, client, fastify);
                        return;
                    case 'tornAttacks':
                                                if (socket.__importingLogs) {
                                                        // Toujours différer jusqu'à >=100% ou timeout
                                                        fastify.log.info({ connId, progress: socket.__logsProgress }, '[ws] tornAttacks command deferred (logs importing)');
                                                        socket.__deferredTornAttacks = true;
                                                        try { socket.send(JSON.stringify({ type:'deferred', reason:'logsImportInProgress', target:'tornAttacks', progress: socket.__logsProgress })); } catch {}
                                                        // Mettre en place un watchdog timeout si jamais 100% ne vient pas (ex: import très court ou bloqué)
                                                        if (!socket.__attacksWatchdog) {
                                                            socket.__attacksWatchdog = setTimeout(() => {
                                                                if (socket.__importingLogs && socket.__logsProgress < 100) {
                                                                    fastify.log.warn({ connId, progress: socket.__logsProgress }, '[ws] attacks watchdog firing before 100%');
                                                                    socket.__autoTriggerAttacksAfterLogs = true; // se déclenchera quand patch send voit 100%
                                                                }
                                                            }, Number(process.env.ATTACKS_DEFER_TIMEOUT_MS || 45000));
                                                        }
                                                        return;
                                                }
                                                if (socket.__logsProgress != null && socket.__logsProgress < 100) {
                                                        // Cas où import s’est terminé sans atteindre 100 (edge) -> forcer log puis lancer
                                                        fastify.log.warn({ connId, progress: socket.__logsProgress }, '[ws] tornAttacks started with progress<100 (edge)');
                                                }
                                                fastify.log.info({ connId }, '[ws] tornAttacks command (logs completed)');
                                                try { require('../ws/wsTornAttacks')(socket, req, client); } catch(e){ fastify.log.error(e); }
                        return;
                    case 'checkSession':
                        fastify.log.info({ connId }, '[ws] checkSession command');
                        require('../ws/wsCheckSession')( socket, req);
                        return;
                    case 'networth':
                        fastify.log.info({ connId }, '[ws] networth command');
                        require('../ws/wsInsertNetworth')( req, client, socket);
                        return;
                    case 'stats':
                        fastify.log.info({ connId }, '[ws] stats command');
                        try { require('../ws/wsStats')(socket, req, client, fastify); } catch(e){ fastify.log.error(e); }
                        return;
                    case 'destroySession':
                        fastify.log.info({ connId }, '[ws] destroySession command');
                        require('../ws/wsDestroySession')(socket, req);
                        return;
                    case 'deduplicate':
                        fastify.log.info({ connId }, '[ws] deduplicate command');
                        require('../ws/wsDeduplicate')(client, socket);
                        return;
                    case 'racingskill': {
                        fastify.log.info({ connId }, '[ws] racingskill command');
                        try { require('../ws/wsRacingSkill')(socket, req, client, fastify); } catch(e){ fastify.log.error(e); }
                        return;
                    }
                    case 'lastNetworth': {
                        fastify.log.info({ connId }, '[ws] lastNetworth command');
                        try {
                            require('../ws/wsLastNetworthStats')(socket, req, client);
                        } catch(e) {
                            fastify.log.error(`[ws] lastNetworth handler error: ${e.message}`);
                            try { socket.send(JSON.stringify({ type: 'lastNetworth', error: e.message })); } catch(_) {}
                        }
                        return;
                    }
                    case 'getNetworth': {
                        fastify.log.info({ connId }, '[ws] getNetworth command');
                        try { require('../ws/wsGetNetworth')(socket, req, client, fastify); } catch(e){
                            fastify.log.error(`[ws] getNetworth handler error: ${e.message}`);
                            try { socket.send(JSON.stringify({ type:'getNetworth', error: e.message })); } catch(_) {}
                        }
                        return;
                    }
                    case 'dailyPriceAveragesAll': {
                        fastify.log.info({ connId }, '[ws] dailyPriceAveragesAll command');
                        try { require('../ws/wsDailyPriceAverages')(socket, req, client, fastify); } catch(e){
                            fastify.log.error(`[ws] dailyPriceAveragesAll handler error: ${e.message}`);
                            try { socket.send(JSON.stringify({ type:'dailyPriceAveragesAll', ok:false, error:e.message })); } catch(_) {}
                        }
                        return;
                    }
                    default: {
                        // Permettre JSON messages futurs
                        if (message.startsWith('{') || message.startsWith('[')) {
                            try {
                                const parsed = JSON.parse(message);
                                if (parsed) {
                                    if (parsed.type === 'companyTrainRange') {
                                        try { return require('../ws/wsCompanyTrainRange')(socket, req, client, fastify, parsed); } catch(e){ fastify.log.error(e); return; }
                                    } else if (parsed.type === 'getTornAttacks') {
                                        try { return require('../ws/wsGetTornAttacks')(socket, req, client, fastify, parsed); } catch(e){ fastify.log.error(e); return; }
                                    } else if (parsed.type === 'updatePrice') {
                                        try { return require('../ws/wsUpdatePrice')(socket, req, client, fastify, parsed, redisClient, { isTest }); } catch(e){ fastify.log.error(e); return; }
                                    } else if (parsed.type === 'getAllTornItems') {
                                        try { return require('../ws/wsGetAllTornItems')(socket, req, client, fastify, parsed); } catch(e){ fastify.log.error(e); return; }
                                    } else if (parsed.type === 'getAllTornLogs') {
                                        try { return require('../ws/wsGetAllTornLogs')(socket, req, client, fastify, parsed); } catch(e){ fastify.log.error(e); return; }
                                    } else if (parsed.type === 'stopImport') {
                                        // Définir les flags d'arrêt pour les imports en cours
                                        try {
                                            const kinds = Array.isArray(parsed.kinds) ? parsed.kinds : ['logs','attacks'];
                                            socket.__stopImport = socket.__stopImport || {};
                                            kinds.forEach(k => { socket.__stopImport[k] = true; });
                                            try { socket.send(JSON.stringify({ type:'stopImportAck', kinds, time:Date.now() })); } catch(_) {}
                                        } catch(e){ fastify.log.error(e); }
                                        return;
                                    } else if (parsed.type === 'dailyPriceAverage') {
                                      (async () => {
                                        try {
                                          await dailyPriceAverager({ redisClient, mongoClient: client, fastify });
                                          const resp = { type:'dailyPriceAverage', ok:true, time:Date.now() };
                                          try { socket.send(JSON.stringify(resp)); } catch(_){}
                                        } catch (e) {
                                          const resp = { type:'dailyPriceAverage', ok:false, error:e.message, time:Date.now() };
                                        fastify.log.debug({ connId, parsedType: parsed && parsed.type }, '[ws] JSON parsed');
                                            try { socket.send(JSON.stringify(resp)); } catch(_){}
                                        }
                                      })();
                                      return;
                                    }
                                }
                                // Autres JSON non traités
                                fastify.log.info('[ws] JSON message reçu sans routeur type:', parsed);
                                return;
                            } catch(e) {
                                fastify.log.warn(`[ws] JSON invalid: ${e.message}`);
                            }
                        }
                        fastify.log.info(`[ws] Unknown ws message: ${message}`);
                        try { socket.send('Unknown message'); } catch(_) {}
                    }
                }
            });
        });
    });
};