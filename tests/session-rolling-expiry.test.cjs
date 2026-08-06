'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionService, SESSION_TTL_SECONDS } = require('../routes/authSession.cjs');

test('a session inactive for exactly 24 hours is rejected and is never renewed', async () => {
  const expires = [];
  const service = createSessionService({
    now: () => 86_400_000,
    redis: { async expire(key, seconds) { expires.push([key, seconds]); return 1; } },
    users: { async findOne() { return { id: 9, username: 'u', type: 't', TornAPIKey: 'server-only' }; } }
  });
  const session = { userId: 9, sessionId: 'expired', lastAuthenticatedActivityAt: 0, async save() {} };
  assert.deepEqual(await service.validateAndRenew({ session }), { ok: false, reason: 'unauthenticated' });
  assert.deepEqual(expires, []);
});

test('activity at 23:59 rolls expiry back to exactly 86,400 seconds', async () => {
  const expiries = [];
  const service = createSessionService({
    now: () => 86_399_000,
    redis: { async expire(key, seconds) { expiries.push([key, seconds]); return 1; } },
    users: { async findOne() { return { id: 9, username: 'u', type: 't', TornAPIKey: 'server-only' }; } }
  });
  const session = { userId: 9, sessionId: 'live', lastAuthenticatedActivityAt: 0, async save() {} };
  assert.equal((await service.validateAndRenew({ session })).ok, true);
  assert.deepEqual(expiries, [['sess:live', SESSION_TTL_SECONDS]]);
  assert.equal(session.lastAuthenticatedActivityAt, 86_399_000);
});
