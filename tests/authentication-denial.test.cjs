'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthenticateHandler, DENIED } = require('../routes/authenticate.cjs');
function reply() { return { status: 200, body: null, headers: {}, code(x) { this.status=x; return this; }, header(k,v) { this.headers[k]=v; return this; }, send(x) { this.body=x; } }; }
test('unknown, malformed, and cooldown logins share the generic 401 response and grant no session', async () => {
  const make = (blocked) => createAuthenticateHandler({ users:{ async findOne(){ return null; } }, bcrypt:{ async compare(){ return false; } }, cooldown:{ async isBlocked(){return blocked;}, async failure(){}, async clear(){} }, sessions:{ async establish(){ throw new Error('must not establish'); } } });
  for (const [handler, body] of [[make(false), { username:'unknown', passkey:'wrong' }], [make(false), { username: 1, passkey: null }], [make(true), { username:'any', passkey:'any' }]]) {
    const res=reply(); await handler({body,ip:'127.0.0.1'},res);
    assert.equal(res.status,401); assert.deepEqual(res.body,DENIED); assert.equal(res.headers['Set-Cookie'],undefined);
  }
});
