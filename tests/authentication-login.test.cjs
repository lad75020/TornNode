'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { createAuthenticateHandler, DUMMY_BCRYPT_HASH } = require('../routes/authenticate.cjs');

function reply() { return { codeValue: 200, headers: {}, body: undefined, code(value) { this.codeValue = value; return this; }, header(k, v) { this.headers[k] = v; return this; }, send(value) { this.body = value; return value; } }; }

test('valid credentials establish only a server session and return success', async () => {
  const passkey = await bcrypt.hash('correct passkey', 10);
  let established;
  const handler = createAuthenticateHandler({
    users: { async findOne() { return { id: 4, username: 'Alice', passkey, type: 'basic', TornAPIKey: 'never-client' }; } },
    bcrypt,
    cooldown: { async isBlocked() { return false; }, async clear() {} },
    sessions: { async establish(request, user) { established = [request, user]; } }
  });
  const res = reply();
  await handler({ body: { username: ' Alice ', passkey: 'correct passkey' }, ip: '127.0.0.1', session: {} }, res);
  assert.equal(res.codeValue, 200);
  assert.deepEqual(res.body, { success: true });
  assert.ok(established);
  assert.equal(JSON.stringify(res.body).includes('token'), false);
  assert.equal(res.headers['Cache-Control'], 'no-store, private, max-age=0');
});

test('unknown users perform the fixed dummy bcrypt comparison and never establish a session', async () => {
  let comparedHash; let established = false;
  const handler = createAuthenticateHandler({
    users: { async findOne() { return null; } },
    bcrypt: { async compare(_passkey, hash) { comparedHash = hash; return false; } },
    cooldown: { async isBlocked() { return false; }, async failure() {}, async clear() {} },
    sessions: { async establish() { established = true; } }
  });
  const res = reply(); await handler({ body: { username: 'unknown', passkey: 'wrong' }, ip: '127.0.0.1' }, res);
  assert.equal(comparedHash, DUMMY_BCRYPT_HASH); assert.equal(established, false);
});
