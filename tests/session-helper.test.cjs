'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createSessionService, SESSION_TTL_SECONDS } = require('../routes/authSession.cjs');

function makeRedis() {
  const values = new Map(); const expiries = new Map();
  return {
    values, expiries,
    async expire(key, seconds) { expiries.set(key, seconds); return 1; },
    async del(key) { values.delete(key); expiries.delete(key); return 1; }
  };
}

test('validated session renews exactly 86,400 seconds and clears only its cookie', async () => {
  const redis = makeRedis();
  const session = { userId: 7, username: 'a', userType: 't', TornAPIKey: 'server-only', lastAuthenticatedActivityAt: 0, sessionId: 'one', async save() {} };
  const service = createSessionService({ redis, users: { async findOne() { return { id: 7, username: 'a', type: 't', TornAPIKey: 'server-only' }; } }, now: () => 1234 });
  const valid = await service.validateAndRenew({ session });
  assert.deepEqual(valid, { ok: true, session });
  assert.equal(session.lastAuthenticatedActivityAt, 1234);
  assert.equal(redis.expiries.get('sess:one'), SESSION_TTL_SECONDS);
  const reply = { cookieArgs: null, clearCookie(...args) { this.cookieArgs = args; } };
  service.clearCookie(reply);
  assert.deepEqual(reply.cookieArgs, ['sid', { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 0 }]);
});

test('missing user and dependency failures fail closed without renewal', async () => {
  const redis = makeRedis();
  const session = { userId: 7, sessionId: 'one', lastAuthenticatedActivityAt: 0 };
  const service = createSessionService({ redis, now: () => 1, users: { async findOne() { return null; } } });
  assert.deepEqual(await service.validateAndRenew({ session }), { ok: false, reason: 'unauthenticated' });
  const unavailable = createSessionService({ now: () => 1, redis: { async expire() { throw new Error('down'); } }, users: { async findOne() { return { id: 7 }; } } });
  assert.deepEqual(await unavailable.validateAndRenew({ session }), { ok: false, reason: 'unavailable' });
});

test('destroying a browser session closes only sockets registered to that session', async () => {
  const service = createSessionService({ redis: makeRedis() });
  const makeRequest = (sessionId) => ({
    session: { sessionId, destroy(callback) { callback(); } }
  });
  const makeSocket = () => Object.assign(new EventEmitter(), {
    frames: [], closed: null,
    send(frame) { this.frames.push(JSON.parse(frame)); },
    close(code, reason) { this.closed = { code, reason }; this.emit('close'); }
  });
  const requestA = makeRequest('one');
  const requestB = makeRequest('two');
  const socketA = makeSocket();
  const socketB = makeSocket();
  service.registerSocket(requestA, socketA);
  service.registerSocket(requestB, socketB);

  await service.destroy(requestA);

  assert.deepEqual(socketA.frames, [{ type: 'auth', ok: false, error: 'unauthenticated' }]);
  assert.deepEqual(socketA.closed, { code: 4401, reason: 'unauthenticated' });
  assert.equal(socketB.closed, null);
});
