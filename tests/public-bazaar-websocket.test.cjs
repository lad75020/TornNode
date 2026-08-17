'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeSocket } = require('../routes/wsHandler.cjs');
const {
  claimPublicConnection,
  releasePublicConnection,
  allowPublicMessage,
  hasPublicSubscriptionCapacity,
  PUBLIC_CONNECTION_LIMIT_PER_IP,
  PUBLIC_MESSAGE_LIMIT,
  MAX_PUBLIC_SUBSCRIPTIONS,
} = require('../ws/wsBazaarPrice.cjs');

function socket() {
  const frames = [];
  let closed;
  return {
    frames,
    get closed() { return closed; },
    send(frame) { frames.push(frame); },
    close(...args) { closed = args; },
  };
}

test('anonymous authorization is opt-in and does not consult private session state', async () => {
  const ws = socket();
  let validated = false;
  const ok = await authorizeSocket({
    authSessions: {
      async validateAndRenew() { validated = true; throw new Error('should not be called'); },
    },
  }, ws, { url: '/wsb' }, { allowAnonymous: true });
  assert.equal(ok, true);
  assert.equal(validated, false);
  assert.deepEqual(ws.frames, []);
  assert.equal(ws.closed, undefined);
});

test('public socket resource guards bound connections, messages, and subscriptions', () => {
  const address = 'bazaar-resource-test';
  const keys = [];
  for (let index = 0; index < PUBLIC_CONNECTION_LIMIT_PER_IP; index += 1) {
    const key = claimPublicConnection({ ip: address });
    assert.equal(key, address);
    keys.push(key);
  }
  assert.equal(claimPublicConnection({ ip: address }), null);
  keys.forEach(releasePublicConnection);

  const ws = {
    frames: [],
    send(frame) { this.frames.push(frame); },
    close(...args) { this.closed = args; },
  };
  for (let index = 0; index < PUBLIC_MESSAGE_LIMIT; index += 1) {
    assert.equal(allowPublicMessage(ws), true);
  }
  assert.equal(allowPublicMessage(ws), false);
  assert.deepEqual(ws.closed, [4429, 'rate limit exceeded']);
  assert.equal(ws.frames.length, 1);

  const full = { bazaarSubscriptions: new Set(Array.from(
    { length: MAX_PUBLIC_SUBSCRIPTIONS },
    (_, index) => index + 1,
  )) };
  assert.equal(hasPublicSubscriptionCapacity(full, 1), true);
  assert.equal(hasPublicSubscriptionCapacity(full, MAX_PUBLIC_SUBSCRIPTIONS + 1), false);
});

test('private authorization still rejects an unauthenticated request', async () => {
  const ws = socket();
  const ok = await authorizeSocket({
    authSessions: { async validateAndRenew() { return { ok: false }; } },
  }, ws, { url: '/ws' });
  assert.equal(ok, false);
  assert.deepEqual(ws.closed, [4401, 'unauthenticated']);
  assert.deepEqual(ws.frames, ['{"type":"auth","ok":false,"error":"unauthenticated"}']);
});
