const bcryptDefault = require('bcrypt');
const bcrypt = bcryptDefault;
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const { User, connectSessionsDb } = require('../utils/userModel.cjs');
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
  const username = body.username.trim();
  const passkey = body.passkey.trim();
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

const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Torn Node';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function getHeaderValue(headers, name) {
  const raw = headers?.[name];
  if (!raw) return '';
  return String(raw).split(',')[0].trim();
}

function getRequestHost(req) {
  const forwardedHost = getHeaderValue(req.headers, 'x-forwarded-host');
  const host = forwardedHost || getHeaderValue(req.headers, 'host') || req.hostname || 'localhost';
  return host.trim();
}

function getRequestProtocol(req) {
  const forwardedProto = getHeaderValue(req.headers, 'x-forwarded-proto');
  if (forwardedProto) return forwardedProto;
  if (req.protocol) return req.protocol;
  return req.socket?.encrypted ? 'https' : 'http';
}

function getWebAuthnContext(req) {
  const host = getRequestHost(req);
  const rpID = process.env.WEBAUTHN_RP_ID || host.split(':')[0].toLowerCase();
  const origin = process.env.WEBAUTHN_ORIGIN || `${getRequestProtocol(req)}://${host}`;
  return { rpID, origin };
}

function getChallengeRecord(req, expectedFlow) {
  const record = req.session?.webauthn;
  if (!record || record.flow !== expectedFlow) return null;
  if (!record.challenge || !record.createdAt) return null;
  if ((Date.now() - Number(record.createdAt)) > CHALLENGE_TTL_MS) return null;
  return record;
}

async function clearChallenge(req) {
  if (!req.session) return;
  delete req.session.webauthn;
  await req.session.save();
}

async function storeChallenge(req, payload) {
  req.session.webauthn = {
    ...payload,
    createdAt: Date.now()
  };
  await req.session.save();
}

function requireSessionUser(req, reply) {
  if (!req.session?.userID) {
    reply.code(401).send({ success: false, message: 'Authentication required' });
    return false;
  }
  return true;
}

async function establishSession(req, user) {
  await req.server.authSessions.establish(req, user);
  delete req.session.webauthn;
  await req.session.save();
  return { success: true };
}

function formatCredential(credential) {
  return {
    credentialID: credential.credentialID,
    name: credential.name || '',
    transports: Array.isArray(credential.transports) ? credential.transports : [],
    deviceType: credential.deviceType || 'singleDevice',
    backedUp: Boolean(credential.backedUp),
    createdAt: credential.createdAt,
    lastUsedAt: credential.lastUsedAt
  };
}

module.exports = async function (fastify, isTest) {
  const mongoBaseUri = isTest ? process.env.MONGODB_URI_TEST : process.env.MONGODB_URI;

  const cooldown = createCooldownService({ redis: fastify.redis, secret: fastify.authCooldownDigestSecret });
  fastify.post('/authenticate', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, createAuthenticateHandler({
    users: collectionFor(fastify), cooldown, sessions: fastify.authSessions, logger: fastify.log
  }));
  fastify.post('/logout', createLogoutHandler({ sessions: fastify.authSessions, logger: fastify.log }));
  fastify.get('/session', async (request, reply) => {
    const result = await fastify.authSessions.validateAndRenew(request);
    if (!result.ok) return noStore(reply).code(401).send({ authenticated: false });
    return noStore(reply).send({ authenticated: true });
  });

  fastify.get('/webauthn/credentials', async (req, reply) => {
    if (!requireSessionUser(req, reply)) return;

    try {
      await connectSessionsDb(mongoBaseUri);
      const user = await User.findOne({ id: req.session.userID }, { webauthnCredentials: 1 }).lean();
      return reply.send({
        success: true,
        credentials: Array.isArray(user?.webauthnCredentials) ? user.webauthnCredentials.map(formatCredential) : []
      });
    } catch (error) {
      return reply.send({ success: false, message: error.message });
    }
  });

  fastify.post('/webauthn/credentials/remove', async (req, reply) => {
    if (!requireSessionUser(req, reply)) return;

    const { credentialID } = req.body || {};
    if (!credentialID) {
      return reply.send({ success: false, message: 'credentialID is required' });
    }

    try {
      await connectSessionsDb(mongoBaseUri);
      const user = await User.findOne({ id: req.session.userID });
      if (!user) {
        return reply.code(404).send({ success: false, message: 'User not found' });
      }

      const before = Array.isArray(user.webauthnCredentials) ? user.webauthnCredentials.length : 0;
      user.webauthnCredentials = (user.webauthnCredentials || []).filter((item) => item.credentialID !== credentialID);

      if (user.webauthnCredentials.length === before) {
        return reply.code(404).send({ success: false, message: 'Access key not found' });
      }

      await user.save();
      return reply.send({
        success: true,
        credentials: user.webauthnCredentials.map(formatCredential)
      });
    } catch (error) {
      return reply.send({ success: false, message: error.message });
    }
  });

  fastify.post('/webauthn/register/options', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    if (!requireSessionUser(req, reply)) return;

    try {
      await connectSessionsDb(mongoBaseUri);
      const user = await User.findOne({ id: req.session.userID });
      if (!user) {
        return reply.code(404).send({ success: false, message: 'User not found' });
      }

      const { rpID, origin } = getWebAuthnContext(req);
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID,
        userName: user.username,
        userID: Buffer.from(`user:${user.id}`, 'utf8'),
        userDisplayName: user.username,
        timeout: 60000,
        attestationType: 'none',
        excludeCredentials: (user.webauthnCredentials || []).map((credential) => ({
          id: credential.credentialID,
          transports: credential.transports
        })),
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required'
        }
      });

      await storeChallenge(req, {
        flow: 'registration',
        challenge: options.challenge,
        userID: user.id,
        rpID,
        origin
      });

      return reply.send({ success: true, options });
    } catch (error) {
      return reply.send({ success: false, message: error.message });
    }
  });

  fastify.post('/webauthn/register/verify', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    if (!requireSessionUser(req, reply)) return;

    const { registrationResponse, name } = req.body || {};
    const challengeRecord = getChallengeRecord(req, 'registration');

    if (!registrationResponse) {
      return reply.send({ success: false, message: 'registrationResponse is required' });
    }
    if (!challengeRecord || challengeRecord.userID !== req.session.userID) {
      return reply.code(400).send({ success: false, message: 'Registration session expired, please try again' });
    }

    try {
      await connectSessionsDb(mongoBaseUri);

      const verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: challengeRecord.origin,
        expectedRPID: challengeRecord.rpID,
        requireUserVerification: true
      });

      if (!verification.verified || !verification.registrationInfo) {
        await clearChallenge(req);
        return reply.send({ success: false, message: 'Access key registration could not be verified' });
      }

      const {
        credential,
        credentialDeviceType,
        credentialBackedUp
      } = verification.registrationInfo;

      const existingUser = await User.findOne({ 'webauthnCredentials.credentialID': credential.id }, { id: 1 }).lean();
      if (existingUser) {
        await clearChallenge(req);
        return reply.send({ success: false, message: 'This access key is already registered' });
      }

      const user = await User.findOne({ id: req.session.userID });
      if (!user) {
        await clearChallenge(req);
        return reply.code(404).send({ success: false, message: 'User not found' });
      }

      const trimmedName = String(name || '').trim();
      const nextIndex = (user.webauthnCredentials || []).length + 1;
      user.webauthnCredentials.push({
        credentialID: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: Array.isArray(registrationResponse.response?.transports) ? registrationResponse.response.transports : [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        name: trimmedName || `Access key ${nextIndex}`,
        createdAt: new Date(),
        lastUsedAt: null
      });
      await user.save();
      await clearChallenge(req);

      return reply.send({
        success: true,
        credentials: user.webauthnCredentials.map(formatCredential)
      });
    } catch (error) {
      await clearChallenge(req);
      return reply.send({ success: false, message: error.message });
    }
  });

  fastify.post('/webauthn/authenticate/options', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    try {
      const { rpID, origin } = getWebAuthnContext(req);
      const options = await generateAuthenticationOptions({
        rpID,
        timeout: 60000,
        userVerification: 'required'
      });

      await storeChallenge(req, {
        flow: 'authentication',
        challenge: options.challenge,
        rpID,
        origin
      });

      return reply.send({ success: true, options });
    } catch (error) {
      return reply.send({ success: false, message: error.message });
    }
  });

  fastify.post('/webauthn/authenticate/verify', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const { authenticationResponse } = req.body || {};
    const challengeRecord = getChallengeRecord(req, 'authentication');

    if (!authenticationResponse) {
      return reply.send({ success: false, message: 'authenticationResponse is required' });
    }
    if (!challengeRecord) {
      return reply.code(400).send({ success: false, message: 'Sign-in session expired, please try again' });
    }

    try {
      await connectSessionsDb(mongoBaseUri);

      const user = await User.findOne({ 'webauthnCredentials.credentialID': authenticationResponse.id });
      if (!user) {
        await clearChallenge(req);
        return reply.send({ success: false, message: 'Unknown access key' });
      }

      const authenticator = (user.webauthnCredentials || []).find((item) => item.credentialID === authenticationResponse.id);
      if (!authenticator) {
        await clearChallenge(req);
        return reply.send({ success: false, message: 'Unknown access key' });
      }

      const verification = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: challengeRecord.origin,
        expectedRPID: challengeRecord.rpID,
        credential: {
          id: authenticator.credentialID,
          publicKey: Buffer.from(authenticator.publicKey, 'base64url'),
          counter: Number(authenticator.counter || 0),
          transports: authenticator.transports
        },
        requireUserVerification: true
      });

      if (!verification.verified) {
        await clearChallenge(req);
        return reply.send({ success: false, message: 'Access key verification failed' });
      }

      authenticator.counter = verification.authenticationInfo.newCounter;
      authenticator.deviceType = verification.authenticationInfo.credentialDeviceType;
      authenticator.backedUp = verification.authenticationInfo.credentialBackedUp;
      authenticator.lastUsedAt = new Date();
      await user.save();

      return reply.send(await establishSession(req, user));
    } catch (error) {
      await clearChallenge(req);
      return reply.send({ success: false, message: error.message });
    }
  });
};

module.exports.createAuthenticateHandler = createAuthenticateHandler;
module.exports.createLogoutHandler = createLogoutHandler;
module.exports.DENIED = DENIED;
module.exports.UNAVAILABLE = UNAVAILABLE;
module.exports.DUMMY_BCRYPT_HASH = DUMMY_BCRYPT_HASH;
