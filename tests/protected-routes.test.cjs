'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const { guard }=require('../routes/protectIndex.cjs');
function reply(){return {status:200,headers:{},code(x){this.status=x;return this;},header(k,v){this.headers[k]=v;return this;},send(){this.sent=true;}};}
test('private route rejects without session, while accepted request renews and public remains unguarded', async()=>{
 const denied=reply(); const no=guard({authSessions:{async validateAndRenew(){return {ok:false};}}}); await no({session:{}},denied); assert.equal(denied.status,302);assert.equal(denied.headers.Location,'/');assert.equal(denied.headers['Pragma'],'no-cache');
 const accepted=reply(); let renewed=false; const yes=guard({authSessions:{async validateAndRenew(){renewed=true;return {ok:true};}}}); await yes({session:{}},accepted);assert.equal(renewed,true);assert.equal(accepted.sent,undefined);
});
