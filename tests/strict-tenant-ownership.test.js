import test from 'node:test';
import assert from 'node:assert/strict';
import {handleEngagementApi} from '../cloudflare/engagement-api.js';
import {authorizeEngagementOperation} from '../cloudflare/engagement-auth.js';
import {authenticatedScope} from '../cloudflare/tenant-guard.js';

const SECRET='test-only-do-not-deploy-'+'x'.repeat(45);
const now=()=>Math.floor(Date.now()/1000);
const envFor=db=>({KOSIF_DB:db,KOSIF_TENANCY_MODE:'strict',KOSIF_AUTH_JWT_SECRET:SECRET,
  KOSIF_AUTH_ISSUER:'test-issuer',KOSIF_AUTH_AUDIENCE:'test-audience',PERSISTENCE_ALLOWED_ORIGIN:'https://app.test'});
const encoding=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function signed({sub='user-A',companyId='company-A',workspaceId='workspace-A',exp=now()+600,
    iat=now()-3,aud='test-audience',iss='test-issuer'}={}) {
  const head=encoding({alg:'HS256',typ:'JWT'}),payload=encoding({sub,companyId,workspaceId,exp,iat,aud,iss});
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(head+'.'+payload));
  return head+'.'+payload+'.'+Buffer.from(sig).toString('base64url');
}
class D1Stmt {
  constructor(db,sql){this.db=db;this.sql=sql.replace(/\s+/g,' ').trim();this.args=[]}
  bind(...args){this.args=args;return this}
  async run(){
    const s=this.sql,a=this.args,d=this.db;
    if(s.startsWith('INSERT INTO engagements ')){d.eng.set(a[0],{id:a[0],entity_name:a[1],period_end:a[2],jurisdiction:a[3],framework:a[4],created_at:a[5]});return{meta:{changes:1}}}
    if(s.startsWith('INSERT INTO engagement_sessions ')){d.sessions.set(a[0],{engagement_id:a[0],access_token_hash:a[1],state_json:null,state_hash:null,state_version:0});return{meta:{changes:1}}}
    if(s.startsWith('INSERT INTO engagement_ownership ')){d.owners.set(a[0],{company_id:a[1],workspace_id:a[2],owner_subject:a[3]});return{meta:{changes:1}}}
    if(s.startsWith('UPDATE engagement_sessions SET state_json')){const [state_json,state_hash,version,,id,expected]=a;const row=d.sessions.get(id);
      if(!row||row.state_version!==expected)return{meta:{changes:0}};Object.assign(row,{state_json,state_hash,state_version:version});return{meta:{changes:1}}}
    if(s.startsWith('INSERT INTO engagement_events')){d.events.push({engagement_id:a[0],sequence:a[1]});return{meta:{changes:1}}}
    return {meta:{changes:0}};
  }
  async first(){
    const s=this.sql,a=this.args,d=this.db;
    if(s.includes('FROM engagement_ownership')) return d.owners.get(a[0])||null;
    if(s.includes('FROM engagement_sessions'))return d.sessions.get(a[0])||null;
    if(s.includes('FROM engagements'))return d.eng.get(a[0])||null;
    return null;
  }
  async all(){return{results:this.db.events.filter(x=>x.engagement_id===this.args[0])}}
}
class FakeDB{
  constructor(){this.eng=new Map;this.sessions=new Map;this.owners=new Map;this.events=[]}
  prepare(sql){return new D1Stmt(this,sql)}
  async batch(statements){const results=[];for(const s of statements)results.push(await s.run());return results}
}
const req=(path,{method='GET',access=null,identity=null,body=null}={})=>
  new Request('https://worker.test'+path,{method,headers:{Origin:'https://app.test',
    ...(body?{'Content-Type':'application/json'}:{}),...(access?{Authorization:'Bearer '+access}:{}),
    ...(identity?{'X-KOSIF-Identity-Token':identity}:{})},body:body?JSON.stringify(body):undefined});
async function create(db,token,{companyId='company-A',workspaceId='workspace-A'}={}) {
  const response=await handleEngagementApi(req('/api/engagements',{method:'POST',identity:token,
    body:{companyId,workspaceId,entity:'Synthetic Co',periodEnd:'2026-12-31'}}),envFor(db));
  return {status:response.status,body:await response.json()};
}

test('strict mode rejects unverified and mismatched company/workspace creation',async()=>{
 const db=new FakeDB,t=await signed();
 assert.equal((await create(db,null)).status,401);
 assert.equal((await create(db,t,{companyId:'company-B'})).status,403);
 assert.equal((await create(db,t,{workspaceId:'workspace-B'})).status,403);
 assert.equal(db.eng.size,0);
 assert.equal((await create(db,t)).status,201);
 assert.equal(db.eng.size,1);
 assert.equal(db.owners.size,1);
});
test('denies expired, wrong audience/issuer and forged identity assertions',async()=>{
 for (const props of [{exp:now()-1},{aud:'other'},{iss:'other'}]) {
   const t=await signed(props);
   const outcome=await authenticatedScope(req('/api/engagements',{identity:t}),envFor(new FakeDB()));
   assert.equal(outcome.status,401);
 }
 const good=await signed(),parts=good.split('.');
 parts[1]=encoding({sub:'root',companyId:'company-B',workspaceId:'workspace-B',iat:now(),exp:now()+600,iss:'test-issuer',aud:'test-audience'});
 assert.equal((await authenticatedScope(req('/api/engagements',{identity:parts.join('.')}),envFor(new FakeDB()))).status,401);
});
test('strict mode fails closed without identity verifier, secret or D1',async()=>{
 const db=new FakeDB,t=await signed();
 const invalid={...envFor(db),KOSIF_AUTH_JWT_SECRET:undefined};
 let r=await handleEngagementApi(req('/api/engagements',{method:'POST',identity:t,body:{companyId:'company-A',workspaceId:'workspace-A'}}),invalid);
 assert.equal(r.status,503);
 r=await handleEngagementApi(req('/api/engagements',{method:'POST',identity:t,body:{companyId:'company-A',workspaceId:'workspace-A'}}),{...envFor(db),KOSIF_DB:null});
 assert.equal(r.status,503);
 const result=await authorizeEngagementOperation(req('/api/documents',{identity:t}),{...envFor(db),KOSIF_DB:null},'ENG-1');
 assert.equal(result.authorized,false);assert.equal(result.status,503);
});
test('per-engagement bearer plus signed identity together prevent tenant leakage and state writes',async()=>{
 const db=new FakeDB,a=await signed(),b=await signed({sub:'user-B',companyId:'company-B',workspaceId:'workspace-B'});
 const created=await create(db,a);assert.equal(created.status,201);
 const id=created.body.engagementId,token=created.body.accessToken;
 const p='/api/engagements/'+encodeURIComponent(id);
 const allowed=await handleEngagementApi(req(p,{access:token,identity:a}),envFor(db));assert.equal(allowed.status,200);
 const wrongCompany=await handleEngagementApi(req(p,{access:token,identity:b}),envFor(db));assert.equal(wrongCompany.status,403);
 const missingIdentity=await handleEngagementApi(req(p,{access:token}),envFor(db));assert.equal(missingIdentity.status,401);
 const wrongBearer=await handleEngagementApi(req(p,{access:'wrong',identity:a}),envFor(db));assert.equal(wrongBearer.status,403);
 const withDifferentUser=await signed({sub:'other-user',companyId:'company-A',workspaceId:'workspace-A'});
 const wrongOwner=await handleEngagementApi(req(p,{access:token,identity:withDifferentUser}),envFor(db));assert.equal(wrongOwner.status,403);
 const state={schemaVersion:1,payload:{engagement:{id,companyId:'company-A',workspaceId:'workspace-A'}}};
 const denial=await handleEngagementApi(req(p+'/state',{method:'PUT',access:token,identity:b,body:{expectedVersion:0,state}}),envFor(db));
 assert.equal(denial.status,403);assert.equal(db.sessions.get(id).state_version,0);
 const okay=await handleEngagementApi(req(p+'/state',{method:'PUT',access:token,identity:a,body:{expectedVersion:0,state}}),envFor(db));
 assert.equal(okay.status,200);assert.equal(db.sessions.get(id).state_version,1);
 const docDenial=await authorizeEngagementOperation(req('/api/documents',{access:token,identity:b}),envFor(db),id);
 assert.equal(docDenial.authorized,false);assert.equal(docDenial.status,403);
 const docOkay=await authorizeEngagementOperation(req('/api/documents',{access:token,identity:a}),envFor(db),id);
 assert.equal(docOkay.authorized,true);
});
test('strict mode fails closed for legacy unowned engagements even with correct bearer',async()=>{
 const db=new FakeDB,identity=await signed(),created=await create(db,identity);
 const id=created.body.engagementId,token=created.body.accessToken;
 db.owners.delete(id);
 const outcome=await handleEngagementApi(req('/api/engagements/'+id,{access:token,identity}),envFor(db));
 assert.equal(outcome.status,403);
});

test('strict mode rejects a signed-in user storing another company identifier inside state',async()=>{
 const db=new FakeDB,a=await signed(),created=await create(db,a);
 const id=created.body.engagementId;
 const response=await handleEngagementApi(req('/api/engagements/'+id+'/state',{
   method:'PUT',access:created.body.accessToken,identity:a,body:{expectedVersion:0,
    state:{schemaVersion:1,payload:{engagement:{id,companyId:'company-B',workspaceId:'workspace-A'}}}}
 }),envFor(db));
 assert.equal(response.status,403);assert.equal(db.sessions.get(id).state_version,0);
});
test('strict mode document gateway requires D1 rather than falling back to public analyzer',async()=>{
 const gateway=(await import('../cloudflare/gateway-worker.js')).default;
 const env={...envFor(null),KOSIF_DB:null};
 const upload=await gateway.fetch(req('/api/documents/analyze',{method:'POST'}),env,{});
 assert.equal(upload.status,503);
 const read=await gateway.fetch(req('/api/engagements/ENG-X/documents'),env,{});
 assert.equal(read.status,503);
});
