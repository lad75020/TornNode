'use strict';

const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'sid';
const SESSION_TTL_SECONDS = 86_400;
const COOKIE_OPTIONS = Object.freeze({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });

function sessionKey(session) {
  const id = session && (session.sessionId || session.id);
  return id ? `sess:${id}` : null;
}

function callSessionMethod(session, name) {
  return new Promise((resolve, reject) => {
    try {
      const result = session[name]((error) => error ? reject(error) : resolve());
      if (result && typeof result.then === 'function') result.then(resolve, reject);
      else if (session[name].length === 0) resolve();
    } catch (error) { reject(error); }
  });
}

function createSessionService({ redis, users, now = () => Date.now(), cookieSecure = true, logger = null } = {}) {
  const cookieOptions = { ...COOKIE_OPTIONS, secure: cookieSecure };
  const socketsBySession = new Map();
  const externalFailure = (reason) => ({ ok: false, reason });
  const safeLog = (event) => { try { logger && logger.warn({ event }, 'authentication session failure'); } catch {} };

  async function renew(session) {
    const key = sessionKey(session);
    if (!key || !redis || typeof redis.expire !== 'function') throw new Error('session store unavailable');
    session.lastAuthenticatedActivityAt = now();
    if (typeof session.save === 'function') await callSessionMethod(session, 'save');
    // Save can set a store-default TTL; set the authoritative expiry last.
    const renewed = await redis.expire(key, SESSION_TTL_SECONDS);
    if (renewed !== 1) throw new Error('session record unavailable');
  }

  async function validateAndRenew(request) {
    const session = request && request.session;
    if (!session || !Number.isFinite(session.userId) || !sessionKey(session)) return externalFailure('unauthenticated');
    const activity = session.lastAuthenticatedActivityAt;
    const inactivity = now() - activity;
    if (!Number.isFinite(activity) || inactivity < 0 || inactivity >= SESSION_TTL_SECONDS * 1000) {
      return externalFailure('unauthenticated');
    }
    try {
      const userStore = typeof users === 'function' ? users() : users;
      if (!userStore || typeof userStore.findOne !== 'function') throw new Error('identity store unavailable');
      const user = await userStore.findOne({ id: session.userId }, { projection: { id: 1, username: 1, type: 1, TornAPIKey: 1 } });
      if (!user || user.id !== session.userId) return externalFailure('unauthenticated');
      // Refresh server-side context from the authoritative current record.
      session.username = user.username;
      session.userType = user.type;
      session.TornAPIKey = user.TornAPIKey;
      await renew(session);
      return { ok: true, session };
    } catch (_) {
      safeLog('auth_session_validation_unavailable');
      return externalFailure('unavailable');
    }
  }

  async function establish(request, user) {
    if (!request || !request.session || !user) throw new Error('session unavailable');
    await callSessionMethod(request.session, 'regenerate');
    Object.assign(request.session, {
      userId: user.id,
      username: user.username,
      userType: user.type,
      TornAPIKey: user.TornAPIKey,
      authenticatedAt: now(),
      lastAuthenticatedActivityAt: now()
    });
    await renew(request.session);
  }

  function registerSocket(request, socket) {
    const key = sessionKey(request && request.session);
    if (!key || !socket) return () => {};
    let sockets = socketsBySession.get(key);
    if (!sockets) socketsBySession.set(key, (sockets = new Set()));
    sockets.add(socket);
    const unregister = () => {
      sockets.delete(socket);
      if (sockets.size === 0) socketsBySession.delete(key);
    };
    if (typeof socket.once === 'function') socket.once('close', unregister);
    return unregister;
  }

  function closeSockets(key, exceptSocket) {
    const sockets = socketsBySession.get(key);
    if (!sockets) return;
    for (const socket of [...sockets]) {
      if (socket === exceptSocket) continue;
      try { socket.send(JSON.stringify({ type: 'auth', ok: false, error: 'unauthenticated' })); } catch {}
      try { socket.close(4401, 'unauthenticated'); } catch {}
      sockets.delete(socket);
    }
    if (sockets.size === 0) socketsBySession.delete(key);
  }

  async function destroy(request, { exceptSocket = null } = {}) {
    if (!request || !request.session || typeof request.session.destroy !== 'function') return;
    const key = sessionKey(request.session);
    await callSessionMethod(request.session, 'destroy');
    if (key) closeSockets(key, exceptSocket);
  }

  function clearCookie(reply) {
    reply.clearCookie(SESSION_COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
  }

  return { validateAndRenew, establish, renew, destroy, registerSocket, clearCookie, cookieOptions };
}

function createCooldownService({ redis, secret, now = () => Date.now() } = {}) {
  const digest = (value) => crypto.createHmac('sha256', secret || '').update(String(value).trim().toLocaleLowerCase('en-US')).digest('hex');
  const key = (scope, value) => `auth:failure:${scope}:${digest(value)}`;
  async function isBlocked(account, network) {
    try {
      const values = await Promise.all([redis.get(key('account', account)), redis.get(key('network', network))]);
      return values.some((value) => Number(value) >= 5);
    } catch (_) { throw new Error('cooldown unavailable'); }
  }
  async function failure(account, network) {
    try {
      for (const candidate of [key('account', account), key('network', network)]) {
        // INCR plus first-write expiry must be one Redis operation: a process
        // crash between separate commands would otherwise create a permanent key.
        await redis.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
          { keys: [candidate], arguments: ['900'] }
        );
      }
    } catch (_) { throw new Error('cooldown unavailable'); }
  }
  async function clear(account, network) { await Promise.all([redis.del(key('account', account)), redis.del(key('network', network))]); }
  return { isBlocked, failure, clear, key, now };
}

module.exports = { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, COOKIE_OPTIONS, createSessionService, createCooldownService };
