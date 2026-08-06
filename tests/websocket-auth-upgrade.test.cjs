'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { authorizeSocket } = require('../routes/wsHandler.cjs');
const { socketHarness } = require('./helpers/authTestHarness.cjs');

test('valid cookie-backed websocket upgrade is permitted without an auth frame', async () => {
  const socket = socketHarness(); let calls = 0;
  const ok = await authorizeSocket({ authSessions: { async validateAndRenew(request) { calls += 1; assert.equal(request.url, '/ws'); return { ok: true }; } } }, socket, { url: '/ws' });
  assert.equal(ok, true); assert.equal(calls, 1); assert.deepEqual(socket.frames, []); assert.equal(socket.closedArgs, undefined);
});

test('authentication query credentials cannot change missing-cookie rejection', async () => {
  const socket = socketHarness();
  const ok = await authorizeSocket({ authSessions: { async validateAndRenew(request) { assert.equal(request.url, '/ws?token=forbidden'); return { ok: false }; } } }, socket, { url: '/ws?token=forbidden' });
  assert.equal(ok, false); assert.deepEqual(socket.closedArgs, [4401, 'unauthenticated']);
});
