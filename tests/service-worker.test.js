import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function worker() {
 const handlers={};const deleted=[];
 vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),{
  URL,Response,fetch:async()=>new Response('shell'),
  self:{registration:{scope:'https://example.test/kosif/'},location:{origin:'https://example.test'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>handlers[name]=fn},
  caches:{keys:async()=>['other-app','kosif-audit-studio-v6','kosif-audit-studio-v4.0.0'],delete:async key=>deleted.push(key),open:async()=>({addAll:async()=>{},put:async()=>{}}),match:async()=>undefined}
 });return {handlers,deleted};
}
test('service worker does not intercept APIs, evidence, credentials or arbitrary assets',()=>{
 const {handlers}=worker();
 for(const path of ['/kosif/api/chat','/kosif/evidence/file.pdf','/elsewhere/app.js','/kosif/app.js?token=secret']){
  let intercepted=false;handlers.fetch({request:new Request(`https://example.test${path}`),respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false,path);
 }
 let intercepted=false;handlers.fetch({request:new Request('https://example.test/kosif/app.js',{headers:{Authorization:'Bearer private'}}),respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
});
test('cache upgrade preserves unrelated applications',async()=>{
 const {handlers,deleted}=worker();let pending;
 handlers.activate({waitUntil:promise=>pending=promise});await pending;assert.deepEqual(deleted,['kosif-audit-studio-v6']);
});
