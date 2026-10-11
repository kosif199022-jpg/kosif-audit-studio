import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import gateway from '../cloudflare/gateway-worker.js';

async function digest(v){
 const a=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
 return [...a].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const FORM_DOCUMENT_ID='DOC-EXISTING';
function request(token,id=FORM_DOCUMENT_ID){
 const form=new FormData();
 form.append('engagementId','ENG-A');
 form.append('documentId',id);
 form.append('file',new Blob(['synthetic-only'],{type:'text/plain'}),'canary.txt');
 return new Request('https://worker.test/api/documents/analyze',{
  method:'POST',
  headers:{Authorization:'Bearer '+token,'X-KOSIF-Engagement':'ENG-A',Origin:'https://app.test'},
  body:form
 });
}
async function envFor({existingOwner='ENG-B',changes=1}={}){
 let writes=0,r2puts=0,commands=[];
 const token='synthetic-engagement-token',hash=await digest(token);
 const db={prepare(sql){const stmt={args:[],bind(...v){this.args=v;return this},
  async first(){
   if(sql.includes('SELECT access_token_hash FROM engagement_sessions'))return this.args[0]==='ENG-A'?{access_token_hash:hash}:null;
   if(sql.includes('SELECT engagement_id, storage_key, mime_type, name FROM documents'))
     return existingOwner?{engagement_id:existingOwner,storage_key:'r2-old',mime_type:'text/plain',name:'original.txt'}:null;
   return null;
  },
  async run(){commands.push(sql);writes++;return {success:true,meta:{changes}}}
 };return stmt}};
 return {token,env:{KOSIF_DB:db,KOSIF_DOCUMENTS:{async put(){r2puts++;return {}}},
  PERSISTENCE_ALLOWED_ORIGIN:'https://app.test',ALLOWED_ORIGIN:'https://app.test'},
  counts:()=>({writes,r2puts,commands})};
}
test('A owner cannot overwrite a globally keyed document ID belonging to engagement B even with valid A bearer',async()=>{
 const f=await envFor({existingOwner:'ENG-B'});
 const result=await gateway.fetch(request(f.token),f.env,{});
 assert.equal(result.status,409);
 assert.equal((await result.json()).error,'document_id_not_available');
 assert.equal(f.counts().writes,0);
 assert.equal(f.counts().r2puts,0);
});
test('a matching engagement ID is allowed to reupload, but D1 upsert is conditional on owner',async()=>{
 const f=await envFor({existingOwner:'ENG-A',changes:1});
 const result=await gateway.fetch(request(f.token),f.env,{});
 assert.equal(result.status,200);
 assert.equal((await result.json()).ok,true);
 assert.equal(f.counts().r2puts,1);
 assert.equal(f.counts().writes,1);
 const sql=f.counts().commands[0];
 assert.match(sql,/INSERT INTO documents/);
 assert.match(sql,/ON CONFLICT\(id\) DO UPDATE SET/);
 assert.match(sql,/WHERE documents.engagement_id=excluded.engagement_id/);
 assert.doesNotMatch(sql,/INSERT OR REPLACE INTO documents/);
});
test('racing D1 collision with changes=0 fails rather than claiming upload success',async()=>{
 const f=await envFor({existingOwner:null,changes:0});
 const result=await gateway.fetch(request(f.token),f.env,{});
 assert.equal(result.status,409);
 assert.equal((await result.json()).error,'document_id_not_available');
 assert.equal(f.counts().writes,1);
});
test('a failed D1 write yields 503 rather than issuing a purported successful document',async()=>{
 const f=await envFor({existingOwner:null,changes:1});
 const original=f.env.KOSIF_DB.prepare.bind(f.env.KOSIF_DB);
 f.env.KOSIF_DB.prepare=(sql)=>{
  const stmt=original(sql);
  if(sql.includes('INSERT INTO documents'))stmt.run=async()=>{throw Error('transient database outage')};
  return stmt;
 };
 const response=await gateway.fetch(request(f.token),f.env,{});
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'document_persistence_unavailable');
});
test('all document data operations still require bearer and consistent engagement header before reading a user document ID',async()=>{
 const f=await envFor({existingOwner:'ENG-B'});
 const unauthorized=await gateway.fetch(request('incorrect'),f.env,{});
 assert.equal(unauthorized.status,403);
 assert.equal(f.counts().writes,0);
 assert.equal(f.counts().r2puts,0);
});
