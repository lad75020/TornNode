'use strict';
const fs = require('node:fs'); const path = require('node:path');
const test = require('node:test'); const assert = require('node:assert/strict');
const register = require('../routes/protectIndex.cjs');
test('public market is the sole unguarded SPA boundary', async () => {
 const routes=[]; const hooks=[];
 const app={authSessions:{},get(path, options, handler){ routes.push({path, protected:Boolean(handler), handler:handler||options}); },addHook(name, handler){ hooks.push({name,handler}); }};
 await register(app);
 assert.deepEqual(routes.map(({path,protected: guarded})=>[path,guarded]),[
  ['/public-bazaar',false],
  ['/chart',true], ['/chart/*',true],
  ['/memory',true], ['/memory/*',true],
  ['/ws-torn-test',true], ['/ws-torn-test/*',true]
 ]);
 assert.deepEqual(hooks.map(({name})=>name),['onRequest']);
 });

 test('public bazaar client stays on the anonymous market socket', () => {
 const source = fs.readFileSync(path.join(__dirname, '../client/src/PublicBazaarPage.jsx'), 'utf8');
 assert.match(source, /useAppWebSocket\('\/wsb', 'public'\)/);
 assert.doesNotMatch(source, /useAppWebSocket\('\/ws'(?:'|`)/);
 assert.doesNotMatch(source, /new WebSocket\([^\n]*\/ws(?:'|`)/);
 });
