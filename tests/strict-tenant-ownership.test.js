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

/* Server-enforced, engagement-only signed backup and restore PLAN (no writes). */
const BACKUP_SECRET='test-backup-secret-do-not-deploy-'+ 'B'.repeat(70);
const backupEnv=db=>({...envFor(db),KOSIF_BACKUP_HMAC_SECRET:BACKUP_SECRET,KOSIF_BACKUP_ADMIN_SUBJECT:'user-A'});
async function seededEngagement(){
 const db=new FakeDB(),identity=await signed(),created=await create(db,identity);
 assert.equal(created.status,201);
 const id=created.body.engagementId,access=created.body.accessToken;
 const state={schemaVersion:1,payload:{engagement:{id,companyId:'company-A',
   workspaceId:'workspace-A',entity:'Synthetic only'},councilRounds:[],documents:[{id:'DOC-1',sha256:'a'.repeat(64)}]}};
 const write=await handleEngagementApi(req('/api/engagements/'+id+'/state',{
   method:'PUT',identity,access,body:{expectedVersion:0,state}
 }),backupEnv(db));
 assert.equal(write.status,200);
 return {db,identity,id,access,state};
}
const backupRequest=(fixture,opts={})=>handleEngagementApi(
 req('/api/engagements/'+fixture.id+'/backup',{
   identity:opts.identity===undefined?fixture.identity:opts.identity,
   access:opts.access===undefined?fixture.access:opts.access
 }),opts.env||backupEnv(fixture.db));
const previewRequest=(fixture,archive,opts={})=>handleEngagementApi(
 req('/api/engagements/'+fixture.id+'/backup/preview',{
   method:'POST',identity:opts.identity===undefined?fixture.identity:opts.identity,
   access:opts.access===undefined?fixture.access:opts.access,body:archive
 }),opts.env||backupEnv(fixture.db));

test('server issues HMAC-signed, engagement-only backup and non-mutating restore preview',async()=>{
 const fixture=await seededEngagement(),before=structuredClone(fixture.db.sessions.get(fixture.id));
 const response=await backupRequest(fixture),body=await response.json();
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(body.archive.companyId,'company-A');
 assert.equal(body.archive.workspaceId,'workspace-A');
 assert.equal(body.archive.adminSubject,'user-A');
 assert.equal(body.archive.stateVersion,1);
 assert.equal(body.archive.state.payload.engagement.id,fixture.id);
 assert.ok(body.archive.scopeExclusions.includes('ledger'));
 assert.ok(body.archive.scopeExclusions.includes('r2_document_bytes'));
 assert.match(body.signature,/^[A-Za-z0-9_-]{43}$/);
 assert.doesNotMatch(JSON.stringify(body),new RegExp(fixture.access));
 const pre=await previewRequest(fixture,body),result=await pre.json();
 assert.equal(pre.status,200);
 assert.equal(result.ok,true);
 assert.equal(result.serverSigned,true);
 assert.equal(result.restoreAllowed,false);
 assert.equal(result.writePerformed,false);
 assert.equal(result.versionConflict,false);
 assert.deepEqual(fixture.db.sessions.get(fixture.id),before);
 assert.equal(fixture.db.events.length,1);
});
test('backup denied for cross-company, other-subject, missing identity and invalid bearer',async()=>{
 const f=await seededEngagement();
 const b=await signed({sub:'user-B',companyId:'company-B',workspaceId:'workspace-B'});
 for(const options of [
   {identity:b},{identity:await signed({sub:'user-Z'})},
   {identity:null},{access:'wrong'}]){
   const resp=await backupRequest(f,options);
   assert.ok([401,403].includes(resp.status));
 }
});
test('server backup is disabled for absent signing secret, absent admin allowlist and non-strict mode',async()=>{
 const f=await seededEngagement();
 for(const env of [
  {...backupEnv(f.db),KOSIF_BACKUP_HMAC_SECRET:null},
  {...backupEnv(f.db),KOSIF_BACKUP_ADMIN_SUBJECT:null},
  {...backupEnv(f.db),KOSIF_TENANCY_MODE:'legacy'}
 ]){
   const resp=await backupRequest(f,{env});
   assert.equal(resp.status,503);
 }
 const denied=await backupRequest(f,{env:{...backupEnv(f.db),KOSIF_BACKUP_ADMIN_SUBJECT:'admin-else'}});
 assert.equal(denied.status,403);
});
test('server refuses tampering after signing and does not write any data',async()=>{
 const f=await seededEngagement();
 const signedBackup=await (await backupRequest(f)).json();
 const altered=structuredClone(signedBackup);
 altered.archive.state.payload.engagement.entity='Injected malicious organization';
 const r=await previewRequest(f,altered);
 assert.equal(r.status,400);
 assert.equal((await r.json()).error,'backup_signature_invalid');
 assert.equal(f.db.sessions.get(f.id).state_version,1);
 const alteredSig=structuredClone(signedBackup);alteredSig.signature='A'.repeat(43);
 const s=await previewRequest(f,alteredSig);
 assert.equal(s.status,400);
 assert.equal(f.db.sessions.get(f.id).state_version,1);
});
test('cross-tenant restore request fails even with a signed archive and correct engagement bearer',async()=>{
 const f=await seededEngagement();
 const archive=await (await backupRequest(f)).json();
 const other=await signed({sub:'user-B',companyId:'company-B',workspaceId:'workspace-B'});
 const denied=await previewRequest(f,archive,{identity:other});
 assert.equal(denied.status,403);
 assert.equal(f.db.sessions.get(f.id).state_version,1);
});
test('restore preview shows version conflict instead of applying overwrite',async()=>{
 const f=await seededEngagement();
 const archive=await (await backupRequest(f)).json();
 const newer=await handleEngagementApi(req('/api/engagements/'+f.id+'/state',{
   method:'PUT',identity:f.identity,access:f.access,
   body:{expectedVersion:1,state:{...f.state,payload:{...f.state.payload,notes:['version 2']}}}
 }),backupEnv(f.db));
 assert.equal(newer.status,200);
 const resp=await previewRequest(f,archive),plan=await resp.json();
 assert.equal(resp.status,200);
 assert.equal(plan.versionConflict,true);
 assert.equal(plan.currentVersion,2);
 assert.equal(plan.restoreAllowed,false);
 assert.equal(f.db.sessions.get(f.id).state_version,2);
});
test('reject foreign-company state embedded in server row before signing backup',async()=>{
 const f=await seededEngagement();
 const row=f.db.sessions.get(f.id);
 row.state_json=JSON.stringify({schemaVersion:1,payload:{engagement:{
   id:f.id,companyId:'company-B',workspaceId:'workspace-A'}}});
 const denied=await backupRequest(f);
 assert.equal(denied.status,400);
 assert.equal((await denied.json()).error,'backup_nested_company_scope_mismatch');
});

test('reject cross-company and cross-workspace records nested inside a signed engagement backup',async()=>{
 const f=await seededEngagement();
 const row=f.db.sessions.get(f.id);
 for(const nested of [{id:'foreign',companyId:'company-B'}, {id:'foreign',workspaceId:'workspace-B'}]){
   row.state_json=JSON.stringify({...f.state,payload:{...f.state.payload,
     auditFindings:[{evidence:{payload:nested}}]}});
   const response=await backupRequest(f);
   assert.equal(response.status,400);
   const result=await response.json();
   assert.match(result.error,/backup_nested_(company|workspace)_scope_mismatch/);
 }
});
test('backup signer refuses using the identity JWT secret as the HMAC backup signing secret',async()=>{
 const f=await seededEngagement();
 const response=await backupRequest(f,{env:{...backupEnv(f.db),
   KOSIF_BACKUP_HMAC_SECRET:SECRET}});
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'backup_signing_secret_not_configured');
});
test('expired server-signed archives cannot be previewed even by an authenticated admin',async()=>{
 const {issueEngagementBackup}=await import('../cloudflare/engagement-backup.js');
 const f=await seededEngagement();
 const identity={subject:'user-A',companyId:'company-A',workspaceId:'workspace-A'};
 const signedOld=await issueEngagementBackup(backupEnv(f.db),f.id,identity,
   f.db.sessions.get(f.id),Date.now()-3*24*60*60*1000);
 const response=await previewRequest(f,signedOld);
 assert.equal(response.status,400);
 assert.equal((await response.json()).error,'backup_expired_or_invalid');
 assert.equal(f.db.sessions.get(f.id).state_version,1);
});

/* Prevent poisoning a valid owner's engagement with nested foreign company state.
   This protects persistence, not just later backup export. */
test('strict state PUT rejects explicitly foreign tenant ownership at any nested depth without saving or events',async()=>{
 const fixture=await seededEngagement(),before=structuredClone(fixture.db.sessions.get(fixture.id)),beforeEvents=fixture.db.events.length;
 const forgedStates=[
  {councilRounds:[{id:'R-1',positions:[{seatId:'x',companyId:'company-B'}]}]},
  {documents:[{id:'DOC-2',metadata:{companyId:'company-A',workspaceId:'workspace-B'}}]},
  {PBC:[{id:'pbc',scope:{companyId:null}}]},
  {issues:[{metadata:{tenant:{workspaceId:7}}}]}
 ];
 for(const patch of forgedStates){
  const state={schemaVersion:1,payload:{engagement:{id:fixture.id,companyId:'company-A',workspaceId:'workspace-A'},...patch}};
  const response=await handleEngagementApi(req('/api/engagements/'+fixture.id+'/state',{
   method:'PUT',access:fixture.access,identity:fixture.identity,
   body:{expectedVersion:1,state}}),backupEnv(fixture.db));
  assert.equal(response.status,403);
  const error=(await response.json()).error;
  assert.match(error,/state_nested_.*_scope_mismatch/);
  assert.deepEqual(fixture.db.sessions.get(fixture.id),before);
  assert.equal(fixture.db.events.length,beforeEvents);
 }
});
test('strict state PUT rejects dangerous property names, malformed nested tenant owner, and oversized state graph',async()=>{
 const f=await seededEngagement();
 const base={schemaVersion:1,payload:{engagement:{id:f.id,companyId:'company-A',workspaceId:'workspace-A'}}};
 const withUnsafe=JSON.parse(JSON.stringify(base));
 withUnsafe.payload.engagement.meta=JSON.parse('{"__proto__":{"companyId":"company-B"}}');
 const denied=await handleEngagementApi(req('/api/engagements/'+f.id+'/state',{
  method:'PUT',access:f.access,identity:f.identity,
  body:{expectedVersion:1,state:withUnsafe}}),backupEnv(f.db));
 assert.equal(denied.status,400);
 assert.equal((await denied.json()).error,'state_tenant_unsafe_key');
 const withDepth=structuredClone(base);let nested=withDepth.payload.engagement;
 for(let i=0;i<80;i++){nested.nested={};nested=nested.nested}
 const deep=await handleEngagementApi(req('/api/engagements/'+f.id+'/state',{
  method:'PUT',access:f.access,identity:f.identity,
  body:{expectedVersion:1,state:withDepth}}),backupEnv(f.db));
 assert.equal(deep.status,413);
 assert.equal((await deep.json()).error,'state_tenant_graph_too_large');
 assert.equal(f.db.sessions.get(f.id).state_version,1);
});
test('strict GET fails closed for old D1 snapshot polluted with foreign company data, never returns the stored state',async()=>{
 const f=await seededEngagement();
 const saved=f.db.sessions.get(f.id),original=saved.state_json;
 const polluted=JSON.parse(original);
 polluted.payload.documents=[{id:'DOC-foreign',companyId:'company-B',title:'SECRET_COMPANY_B'}];
 saved.state_json=JSON.stringify(polluted);
 const response=await handleEngagementApi(req('/api/engagements/'+f.id,{
  access:f.access,identity:f.identity}),backupEnv(f.db));
 assert.equal(response.status,409);
 const body=await response.json();
 assert.equal(body.error,'stored_state_tenant_scope_invalid');
 assert.doesNotMatch(JSON.stringify(body),/SECRET_COMPANY_B/);
 assert.equal(saved.state_json,JSON.stringify(polluted),'GET must not modify prior records');
 saved.state_json=original;
 const allowed=await handleEngagementApi(req('/api/engagements/'+f.id,{
  access:f.access,identity:f.identity}),backupEnv(f.db));
 assert.equal(allowed.status,200);
});
test('strict state accepts repeated matching nested scope while maintaining cross-company issuer and bearer denials',async()=>{
 const f=await seededEngagement(),before=f.db.sessions.get(f.id).state_version;
 const state={schemaVersion:1,payload:{engagement:{id:f.id,companyId:'company-A',workspaceId:'workspace-A'},
  requests:[{id:'REQ-1',companyId:'company-A',workspaceId:'workspace-A',detail:{companyId:'company-A'}}]}};
 const good=await handleEngagementApi(req('/api/engagements/'+f.id+'/state',{
  method:'PUT',access:f.access,identity:f.identity,body:{expectedVersion:before,state}}),backupEnv(f.db));
 assert.equal(good.status,200);assert.equal(f.db.sessions.get(f.id).state_version,before+1);
 const b=await signed({sub:'user-B',companyId:'company-B',workspaceId:'workspace-B'});
 const wrong=await handleEngagementApi(req('/api/engagements/'+f.id,{
  access:f.access,identity:b}),backupEnv(f.db));
 assert.equal(wrong.status,403);
 const okay=await handleEngagementApi(req('/api/engagements/'+f.id,{
  access:f.access,identity:f.identity}),backupEnv(f.db));
 assert.equal(okay.status,200);
});

test('server backup signing refuses pre-migration D1 rows with null-tenant nested records, despite matched root scope',async()=>{
 const f=await seededEngagement();
 const saved=f.db.sessions.get(f.id),unmodified=saved.state_json;
 const forged=JSON.parse(unmodified);
 forged.payload.documents.push({id:'DOC-foreign-null',companyId:null,workspaceId:'workspace-A'});
 saved.state_json=JSON.stringify(forged);
 // Even a configured administrator cannot certify an invalid pre-migration snapshot.
 const response=await backupRequest(f);
 assert.equal(response.status,400);
 assert.equal((await response.json()).error,'backup_source_state_nested_company_scope_mismatch');
 assert.equal(saved.state_json,JSON.stringify(forged));
 saved.state_json=unmodified;
 const allowed=await backupRequest(f);
 assert.equal(allowed.status,200);
});
test('server backup GET and preview preserve security failure for unsafe nested keys in preexisting D1 state',async()=>{
 const f=await seededEngagement(),saved=f.db.sessions.get(f.id),unchanged=structuredClone(saved);
 const foreign=JSON.parse(saved.state_json);
 foreign.payload.engagement.extra=JSON.parse('{"constructor":{"companyId":"company-A"}}');
 saved.state_json=JSON.stringify(foreign);
 let response=await backupRequest(f);
 assert.equal(response.status,400);
 assert.equal((await response.json()).error,'backup_source_state_tenant_unsafe_key');
 response=await handleEngagementApi(req('/api/engagements/'+f.id,{
  access:f.access,identity:f.identity}),backupEnv(f.db));
 assert.equal(response.status,409);
 Object.assign(saved,unchanged);
 response=await backupRequest(f);
 assert.equal(response.status,200);
});
