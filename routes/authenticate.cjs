'use strict';

const bcryptDefault = require('bcrypt');
const { createCooldownService } = require('./authSession.cjs');

const DENIED = Object.freeze({ success: false, message: 'Invalid username or passkey' });
const UNAVAILABLE = Object.freeze({ success: false, message: 'Authentication is temporarily unavailable. Please try again.' });
// This is deliberately constant so unknown-account comparisons have the same bcrypt work.
const DUMMY_BCRYPT_HASH = '$2b$10$JhtTPoYfbEtcLLQZGLkjCuWTSZx36CeTSg6IKcFaXWHA1nLDzeAy2';

function noStore(reply) {
  return reply.header('Cache-Control', 'no-store, private, max-age=0').header('Pragma', 'no-cache').header('Expires', '0');
}

function credentials(body) {
  if (!body || typeof body.username !== 'string' || typeof body.passkey !== 'string') return null;
  const username = body.username.trim(); const passkey = body.passkey.trim();
  if (!username || !passkey || username.length > 128 || passkey.length > 1024) return null;
  return { username, passkey, normalizedUsername: username.toLocaleLowerCase('en-US') };
}

function createAuthenticateHandler({ users, bcrypt = bcryptDefault, cooldown, sessions, logger = null }) {
  return async function authenticate(request, reply) {
    const input = credentials(request.body);
    const username = input ? input.normalizedUsername : '__invalid__';
    const network = request.ip || request.socket?.remoteAddress || 'unknown';
    try {
      if (await cooldown.isBlocked(username, network)) return noStore(reply).code(401).send(DENIED);
      const user = input ? await users.findOne({ username: input.username }) : null;
      const valid = await bcrypt.compare(input ? input.passkey : '', user?.passkey || DUMMY_BCRYPT_HASH);
      if (!input || !user || !valid) {
        await cooldown.failure(username, network);
        return noStore(reply).code(401).send(DENIED);
      }
      await cooldown.clear(username, network);
      await sessions.establish(request, user);
      return noStore(reply).code(200).send({ success: true });
    } catch (_) {
      try { logger && logger.warn({ event: 'authentication_unavailable' }, 'authentication dependency failure'); } catch {}
      return noStore(reply).code(503).send(UNAVAILABLE);
    }
  };
}

function createLogoutHandler({ sessions, logger = null }) {
  return async function logout(request, reply) {
    try {
      await sessions.destroy(request);
      sessions.clearCookie(reply);
      return noStore(reply).code(204).send();
    } catch (_) {
      try { logger && logger.warn({ event: 'logout_unavailable' }, 'session destruction failure'); } catch {}
      return noStore(reply).code(503).send({ success: false, message: 'Sign-out could not be completed. Please try again.' });
    }
  };
}

function collectionFor(fastify) {
  const db = fastify.mongo?.db || fastify.mongo?.client?.db('sessions');
  if (!db) throw new Error('mongo unavailable');
  return db.collection('users');
}

module.exports = async function registerAuthentication(fastify) {
  const cooldown = createCooldownService({ redis: fastify.redis, secret: fastify.authCooldownDigestSecret });
  fastify.post('/authenticate', createAuthenticateHandler({
    users: collectionFor(fastify), cooldown, sessions: fastify.authSessions, logger: fastify.log
  }));
  fastify.post('/logout', createLogoutHandler({ sessions: fastify.authSessions, logger: fastify.log }));
  fastify.get('/session', async (request, reply) => {
    const result = await fastify.authSessions.validateAndRenew(request);
    if (!result.ok) return noStore(reply).code(401).send({ authenticated: false });
    return noStore(reply).send({ authenticated: true });
  });
};

module.exports.createAuthenticateHandler = createAuthenticateHandler;
module.exports.DENIED = DENIED;
module.exports.UNAVAILABLE = UNAVAILABLE;
module.exports.createLogoutHandler = createLogoutHandler;
module.exports.DUMMY_BCRYPT_HASH = DUMMY_BCRYPT_HASH;
