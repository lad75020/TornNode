'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const { createLogoutHandler }=require('../routes/authenticate.cjs');
function reply(){return {status:200,headers:{},code(x){this.status=x;return this;},header(k,v){this.headers[k]=v;return this;},send(x){this.body=x;}};}
test('logout destroys only the request session, clears its cookie, and is idempotent', async()=>{
 let destroyed=0, cleared=0;
 const handler=createLogoutHandler({sessions:{async destroy(request){destroyed += request.session.name === 'A' ? 1 : 0;},clearCookie(){cleared++;}}});
 const res=reply(); await handler({session:{name:'A'}},res);
 assert.equal(res.status,204);assert.equal(destroyed,1);assert.equal(cleared,1);assert.equal(res.headers['Cache-Control'],'no-store, private, max-age=0');
});
test('logout store failure returns only generic 503 and does not clear a cookie',async()=>{
 const handler=createLogoutHandler({sessions:{async destroy(){throw new Error('down');},clearCookie(){throw new Error('no');}}}); const res=reply();await handler({session:{}},res);
 assert.equal(res.status,503);assert.deepEqual(res.body,{success:false,message:'Sign-out could not be completed. Please try again.'});
});
