'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { createAuthenticateHandler, UNAVAILABLE } = require('../routes/authenticate.cjs');
test('dependency failures are a generic 503 without a granting cookie', async () => {
 const handler=createAuthenticateHandler({users:{async findOne(){throw new Error('mongo unreachable');}},bcrypt:{async compare(){return false;}},cooldown:{async isBlocked(){return false;}},sessions:{}});
 const res={status:200,headers:{},code(x){this.status=x;return this;},header(k,v){this.headers[k]=v;return this;},send(x){this.body=x;}};
 await handler({body:{username:'a',passkey:'b'},ip:'127.0.0.1'},res);
 assert.equal(res.status,503);assert.deepEqual(res.body,UNAVAILABLE);assert.equal(res.headers['Set-Cookie'],undefined);
});
