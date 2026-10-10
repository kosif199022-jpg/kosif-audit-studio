/**
 * SERVER-ONLY signed engagement state archive and non-mutating restore preview.
 * NOT a complete company backup (excludes attached R2 document bytes, external
 * ledgers, and orphan localStorage), nor approval to execute restoration.
 */
const SCHEMA='kosif-engagement-backup-v1';
const encoder=new TextEncoder();
const secureId=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v);
const utf8=v=>encoder.encode(v);
const base64url=bytes=>{
  let value='';
  for(const byte of bytes)value+=String.fromCharCode(byte);
  return btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
};
const fromB64Url=v=>{
  if(typeof v!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(v))throw Error('backup_signature_invalid');
  return Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));
};
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async text=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8(text))));
async function hmacKey(env){
  const secret=env.KOSIF_BACKUP_HMAC_SECRET;
  if(typeof secret!=='string'||secret.length<48||secret===env.KOSIF_AUTH_JWT_SECRET)return null;
  return crypto.subtle.importKey('raw',utf8(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function backupGate(env,identity){
  if(env.KOSIF_TENANCY_MODE!=='strict'||identity?.legacy||identity?.error)
    return {error:'strict_tenant_backup_required',status:503};
  if(typeof env.KOSIF_BACKUP_ADMIN_SUBJECT!=='string'||
      !secureId(env.KOSIF_BACKUP_ADMIN_SUBJECT))
    return {error:'backup_role_not_configured',status:503};
  if(!secureId(identity.subject)||identity.subject!==env.KOSIF_BACKUP_ADMIN_SUBJECT)
    return {error:'backup_admin_subject_required',status:403};
  if(!await hmacKey(env))return {error:'backup_signing_secret_not_configured',status:503};
  return {authorized:true};
}
function assertStateScope(state,engagementId,identity){
  // Reject explicit foreign-tenant records at any depth. This guard is an
  // additional check, NOT proof that untagged legacy records are tenant-owned.
  const pending=[state],seen=new WeakSet();let count=0;
  while(pending.length){
    const node=pending.pop();
    if(!node||typeof node!=='object'||seen.has(node))continue;
    seen.add(node);
    if(++count>20_000)throw Error('backup_state_graph_too_large');
    if(typeof node.companyId==='string'&&node.companyId!==identity.companyId)
      throw Error('backup_nested_company_scope_mismatch');
    if(typeof node.workspaceId==='string'&&node.workspaceId!==identity.workspaceId)
      throw Error('backup_nested_workspace_scope_mismatch');
    for(const child of Object.values(node))if(child&&typeof child==='object')pending.push(child);
  }
  const e=state?.payload?.engagement;
  if(!e||e.id!==engagementId||e.companyId!==identity.companyId||
    e.workspaceId!==identity.workspaceId)throw Error('backup_state_scope_mismatch');
}
function snapshotAllowed(row,engagementId,identity){
  if(!secureId(engagementId)||!secureId(identity?.companyId)||!secureId(identity?.workspaceId)||
     !secureId(identity?.subject))throw Error('backup_scope_invalid');
  if(!row?.state_json||typeof row.state_json!=='string')throw Error('backup_state_not_available');
  if(row.state_json.length>1_800_000)throw Error('backup_state_too_large');
  let state;
  try{state=JSON.parse(row.state_json)}catch{throw Error('backup_state_corrupt')}
  assertStateScope(state,engagementId,identity);
  const version=Number(row.state_version);
  if(!Number.isSafeInteger(version)||version<0)throw Error('backup_version_invalid');
  return {state,version};
}
export async function issueEngagementBackup(env,engagementId,identity,row,now=Date.now()){
  const {state,version}=snapshotAllowed(row,engagementId,identity);
  const stateHash=await sha(JSON.stringify(state));
  if(row.state_hash&&row.state_hash!==stateHash)throw Error('backup_state_hash_mismatch');
  const archive={
    schema:SCHEMA,classification:'company-confidential-server-authenticated-engagement-only',
    engagementId,companyId:identity.companyId,workspaceId:identity.workspaceId,
    adminSubject:identity.subject,stateVersion:version,stateHash,
    createdAt:new Date(now).toISOString(),expiresAt:new Date(now+24*60*60*1000).toISOString(),
    scopeExclusions:['r2_document_bytes','ledger','catalog','inventory','purchasing','orphan_browser_storage'],
    state
  };
  const key=await hmacKey(env);
  const signature=base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,utf8(JSON.stringify(archive)))));
  return {archive,signature};
}
export async function previewEngagementRestore(env,engagementId,identity,row,envelope,now=Date.now()){
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||
     !envelope.archive||typeof envelope.archive!=='object')throw Error('backup_envelope_invalid');
  const archive=envelope.archive;
  const raw=JSON.stringify(archive);
  if(utf8(raw).length>1_800_000)throw Error('backup_package_too_large');
  const key=await hmacKey(env);
  let verified=false;
  try{verified=await crypto.subtle.verify('HMAC',key,fromB64Url(envelope.signature),utf8(raw))}
  catch{verified=false}
  if(!verified)throw Error('backup_signature_invalid');
  if(archive.schema!==SCHEMA||archive.engagementId!==engagementId||
     archive.companyId!==identity.companyId||archive.workspaceId!==identity.workspaceId||
     archive.adminSubject!==identity.subject)throw Error('backup_scope_mismatch');
  const created=Date.parse(archive.createdAt),expiry=Date.parse(archive.expiresAt);
  if(!Number.isFinite(created)||!Number.isFinite(expiry)||created>now+60_000||
     expiry<=now||expiry-created>24*60*60*1000+60_000)throw Error('backup_expired_or_invalid');
  if(!Number.isSafeInteger(archive.stateVersion)||archive.stateVersion<0)throw Error('backup_version_invalid');
  assertStateScope(archive.state,engagementId,identity);
  if(await sha(JSON.stringify(archive.state))!==archive.stateHash)throw Error('backup_state_hash_mismatch');
  const current=snapshotAllowed(row,engagementId,identity);
  return {
    ok:true,restoreAllowed:false,writePerformed:false,serverSigned:true,
    approval:'requires_separate_restore_authorization_and_two_person_review',
    scope:{engagementId,companyId:identity.companyId,workspaceId:identity.workspaceId},
    backupVersion:archive.stateVersion,currentVersion:current.version,
    versionConflict:archive.stateVersion!==current.version,
    stateHash:archive.stateHash,
    included:'engagement_state_only',excluded:archive.scopeExclusions
  };
}
