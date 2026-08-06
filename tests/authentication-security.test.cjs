'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
const { COOKIE_OPTIONS, SESSION_COOKIE_NAME } = require('../routes/authSession.cjs');

test('browser authentication boundary has one secure opaque cookie and no token transport', () => {
  const root = path.join(__dirname, '..');
  const client = fs.readFileSync(path.join(root, 'client/src/hooks/useAppWebSocket.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');
  const protectedRoutes = fs.readFileSync(path.join(root, 'routes/protectIndex.cjs'), 'utf8');
  assert.equal(SESSION_COOKIE_NAME, 'sid');
  assert.deepEqual(COOKIE_OPTIONS, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  assert.doesNotMatch(client, /\?token=|localStorage\.setItem\(['"]jwt/);
  assert.doesNotMatch(server, /verifyClient|jsonwebtoken|JWT_SECRET/);
  assert.doesNotMatch(protectedRoutes, /authorization|Bearer/);
  assert.match(protectedRoutes, /no-store, private, max-age=0/);
});
