'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const destroySession = require('../ws/wsDestroySession.cjs');
test('destroySession destroys only the caller before acknowledgement and closure', async () => {
 const events=[]; const socket={send(value){events.push(['send',value]);},close(...args){events.push(['close',args]);}};
 const sessionA={id:'A'}; const sessionB={id:'B'}; const destroyed=[];
 await destroySession(socket,{session:sessionA},{authSessions:{async destroy(request){destroyed.push(request.session.id);}}});
 assert.deepEqual(destroyed,['A']);assert.deepEqual(sessionB,{id:'B'});
 assert.deepEqual(events,[['send','{"type":"logout","ok":true}'],['close',[1000,'logout']]]);
});
