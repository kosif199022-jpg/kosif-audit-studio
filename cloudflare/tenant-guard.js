// Strict-mode authenticated company/workspace ownership boundary.
// Existing bearer-only demos remain on legacy mode until an identity issuer and migration are configured.
// X-KOSIF-Identity-Token must be issued by a *separate trusted* authenticator, never by the browser.
const ID=/^[a-zA-Z0-9._:-]{1,128}$/;
export const strictTenantMode = env => env.KOSIF_TENANCY_MODE === 'strict';
function decodeBase64Url(part) {
  if (!/^[a-zA-Z0-9_-]+$/.test(part)) throw new Error('identity_token_invalid');
  const str=part.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-part.length%4)%4);
  return Uint8Array.from(atob(str),c=>c.charCodeAt(0));
}
function error(code,status=403){return {error:code,status};}
export async function authenticatedScope(request,env) {
  if (!strictTenantMode(env)) return {legacy:true};
  if (!env.KOSIF_AUTH_JWT_SECRET || String(env.KOSIF_AUTH_JWT_SECRET).length<32 || !env.KOSIF_AUTH_ISSUER || !env.KOSIF_AUTH_AUDIENCE) {
    return error('identity_verification_not_configured',503);
  }
  const token=request.headers.get('X-KOSIF-Identity-Token');
  if (!token) return error('identity_required',401);
  const parts=token.split('.');
  if (parts.length!==3 || token.length>8192) return error('identity_token_invalid',401);
  try {
    const header=JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claim=JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (header.alg!=='HS256' || header.typ!=='JWT') return error('identity_algorithm_invalid',401);
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.KOSIF_AUTH_JWT_SECRET),
      {name:'HMAC',hash:'SHA-256'},false,['verify']);
    if (!await crypto.subtle.verify('HMAC',key,decodeBase64Url(parts[2]),
      new TextEncoder().encode(parts[0]+'.'+parts[1]))) return error('identity_signature_invalid',401);
    const now=Math.floor(Date.now()/1000);
    if (claim.iss!==env.KOSIF_AUTH_ISSUER || claim.aud!==env.KOSIF_AUTH_AUDIENCE ||
        !Number.isSafeInteger(claim.exp) || claim.exp<=now || claim.exp>now+3600 ||
        !Number.isSafeInteger(claim.iat) || claim.iat<now-3600 || claim.iat>now+60 || claim.iat>claim.exp ||
        (claim.nbf!==undefined && (typeof claim.nbf!=='number'||claim.nbf>now))) return error('identity_claims_invalid',401);
    for (const key of ['sub','companyId','workspaceId'])
      if (typeof claim[key]!=='string' || !ID.test(claim[key])) return error('identity_scope_invalid',401);
    return {subject:claim.sub,companyId:claim.companyId,workspaceId:claim.workspaceId};
  } catch{return error('identity_token_invalid',401);}
}
export async function ownedEngagement(env,engagementId,scope) {
  if (scope.error) return scope;
  if (scope.legacy) return scope;
  try {
    const row=await env.KOSIF_DB.prepare(
      'SELECT company_id,workspace_id,owner_subject FROM engagement_ownership WHERE engagement_id=?')
      .bind(engagementId).first();
    if (!row) return error('engagement_owner_unregistered',403);
    if (row.company_id!==scope.companyId || row.workspace_id!==scope.workspaceId ||
        row.owner_subject!==scope.subject) return error('engagement_scope_forbidden',403);
    return {scope,row};
  } catch{return error('ownership_verification_unavailable',503);}
}
export function requestedScope(body,identity) {
  if (identity.error) return identity;
  if (identity.legacy) return identity;
  if (!body || body.companyId!==identity.companyId || body.workspaceId!==identity.workspaceId)
    return error('company_workspace_mismatch',403);
  return identity;
}


/**
 * Validates all explicit tenant markers in a persisted engagement state before
 * any PUT or GET may cross the strict-tenant boundary. Never assigns missing
 * ownership: untagged legacy descendants still need provenance migration.
 * No app/browser-supplied role or owner assertion is accepted as authority.
 */
export function validateEngagementTenantState(state,engagementId,identity){
  if(!state||typeof state!=='object'||Array.isArray(state)||
      !ID.test(String(engagementId||''))||
      !ID.test(String(identity?.companyId||''))||
      !ID.test(String(identity?.workspaceId||'')) ||
      identity?.legacy || identity?.error)
    return {error:'state_tenant_scope_invalid',status:403};
  const embedded=state?.payload?.engagement;
  if(!embedded||typeof embedded!=='object'||Array.isArray(embedded)||
     embedded.id!==engagementId||embedded.companyId!==identity.companyId||
     embedded.workspaceId!==identity.workspaceId)
    return {error:'state_company_workspace_mismatch',status:403};
  const queue=[[state,0]],visited=new WeakSet();let nodes=0;
  while(queue.length){
    const [node,depth]=queue.pop();
    if(!node||typeof node!=='object')continue;
    if(visited.has(node))continue;
    visited.add(node);
    if(++nodes>20_000||depth>64)
      return {error:'state_tenant_graph_too_large',status:413};
    for(const key of Object.keys(node)){
      if(['__proto__','constructor','prototype'].includes(key))
        return {error:'state_tenant_unsafe_key',status:400};
      const value=node[key];
      if(key==='companyId'&&value!==identity.companyId)
        return {error:'state_nested_company_scope_mismatch',status:403};
      if(key==='workspaceId'&&value!==identity.workspaceId)
        return {error:'state_nested_workspace_scope_mismatch',status:403};
      if(value&&typeof value==='object')queue.push([value,depth+1]);
    }
  }
  return {ok:true};
}
