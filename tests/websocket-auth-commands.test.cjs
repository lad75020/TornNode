'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const { authorizeSocket }=require('../routes/wsHandler.cjs');
test('invalid websocket state emits one generic frame and closes 4401 before dispatch', async()=>{
 const frames=[];let closed;const socket={send(x){frames.push(x);},close(...x){closed=x;}};
 const ok=await authorizeSocket({authSessions:{async validateAndRenew(){return {ok:false,reason:'unavailable'};}}},socket,{session:{}});
 assert.equal(ok,false);assert.deepEqual(frames,['{"type":"auth","ok":false,"error":"unauthenticated"}']);assert.deepEqual(closed,[4401,'unauthenticated']);
});

test('websocket dependency errors fail closed with the same one-frame 4401 response', async () => {
 const frames=[]; let closed;
 const socket={send(x){frames.push(x);},close(...x){closed=x;}};
 const ok=await authorizeSocket({authSessions:{async validateAndRenew(){throw new Error('redis down');}}},socket,{session:{}});
 assert.equal(ok,false); assert.deepEqual(frames,['{"type":"auth","ok":false,"error":"unauthenticated"}']); assert.deepEqual(closed,[4401,'unauthenticated']);
});

test('invalid checkSession reports false before the required unauthenticated close', async () => {
 const frames=[]; let closed;
 const socket={send(x){frames.push(x);},close(...x){closed=x;}};
 const ok=await authorizeSocket({authSessions:{async validateAndRenew(){return {ok:false};}}},socket,{session:{}},{ checkSession: true });
 assert.equal(ok,false);assert.deepEqual(frames,['{"session_active":false}']);assert.deepEqual(closed,[4401,'unauthenticated']);
});

test('each private websocket command revalidates server state without a cookie response seam', async () => {
 let validations = 0; const socket = { send() {}, close() {} };
 const fastify = { authSessions: { async validateAndRenew() { validations += 1; return { ok: true }; } } };
 await authorizeSocket(fastify, socket, { session: { sessionId: 'one' } });
 await authorizeSocket(fastify, socket, { session: { sessionId: 'one' } });
 assert.equal(validations, 2);
 assert.equal(Object.hasOwn(socket, 'setCookie'), false);
});
