import test from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../cloudflare/gateway-worker.js';
import { authorizeEngagementOperation } from '../cloudflare/engagement-auth.js';
import { createDocumentIntelligenceClient } from '../v5/document-client.js';

async function hash(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function dbWith(id,tokenHash){return{prepare(sql){return{args:[],bind(...args){this.args=args;return this},async first(){if(/SELECT access_token_hash FROM engagement_sessions/.test(sql)&&this.args[0]===id)return{access_token_hash:tokenHash};return null}}}}}

test('document engagement authorization is compatibility mode without D1 and fail-closed with D1',async()=>{
  let r=await authorizeEngagementOperation(new Request('https://w.test/api/documents/analyze'),{},'ENG-1');assert.equal(r.required,false);assert.equal(r.authorized,true);
  const token='correct-secret',env={KOSIF_DB:dbWith('ENG-1',await hash(token))};
  r=await authorizeEngagementOperation(new Request('https://w.test/api/documents/analyze'),env,'ENG-1');assert.equal(r.status,401);
  r=await authorizeEngagementOperation(new Request('https://w.test/api/documents/analyze',{headers:{Authorization:'Bearer wrong'}}),env,'ENG-1');assert.equal(r.status,403);
  r=await authorizeEngagementOperation(new Request('https://w.test/api/documents/analyze',{headers:{Authorization:`Bearer ${token}`}}),env,'ENG-1');assert.equal(r.authorized,true);assert.equal(r.required,true);
});

test('document browser client sends engagement identity and bearer token but no OpenAI key',async()=>{
  let captured;const fetchImpl=async(url,opts)=>{captured={url,opts};return new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}})};
  const client=createDocumentIntelligenceClient({baseUrl:'https://worker.test',fetchImpl,accessToken:'eng-token'});
  await client.analyze(new Blob(['hello'],{type:'text/plain'}),{engagementId:'ENG-55',documentId:'DOC-1'});
  assert.equal(captured.opts.headers.Authorization,'Bearer eng-token');assert.equal(captured.opts.headers['X-KOSIF-Engagement'],'ENG-55');
  assert.equal('OPENAI_API_KEY' in captured.opts.headers,false);assert.equal(captured.url,'https://worker.test/api/documents/analyze');
});

test('gateway rejects unauthenticated protected upload and engagement identity mismatch before document analysis',async()=>{
  const token='upload-secret',env={KOSIF_DB:dbWith('ENG-A',await hash(token)),PERSISTENCE_ALLOWED_ORIGIN:'https://app.test'};
  let form=new FormData();form.append('engagementId','ENG-A');form.append('file',new Blob(['x'],{type:'text/plain'}),'x.txt');
  let response=await gateway.fetch(new Request('https://worker.test/api/documents/analyze',{method:'POST',headers:{Origin:'https://app.test','X-KOSIF-Engagement':'ENG-A'},body:form}),env,{});assert.equal(response.status,401);
  form=new FormData();form.append('engagementId','ENG-B');form.append('file',new Blob(['x'],{type:'text/plain'}),'x.txt');
  response=await gateway.fetch(new Request('https://worker.test/api/documents/analyze',{method:'POST',headers:{Origin:'https://app.test','X-KOSIF-Engagement':'ENG-A',Authorization:`Bearer ${token}`},body:form}),env,{});assert.equal(response.status,409);assert.equal((await response.json()).error,'engagement_id_mismatch');
});

test('protected document preflight explicitly permits Authorization header',async()=>{
  const env={KOSIF_DB:dbWith('ENG-A','x'),PERSISTENCE_ALLOWED_ORIGIN:'https://app.test'};
  const response=await gateway.fetch(new Request('https://worker.test/api/documents/analyze',{method:'OPTIONS',headers:{Origin:'https://app.test','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,x-kosif-engagement'}}),env,{});
  assert.equal(response.status,204);assert.match(response.headers.get('Access-Control-Allow-Headers')||'',/Authorization/);assert.match(response.headers.get('Access-Control-Allow-Headers')||'',/X-KOSIF-Engagement/);
});
