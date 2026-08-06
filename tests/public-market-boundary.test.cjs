'use strict';
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
