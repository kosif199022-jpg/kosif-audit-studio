/**
 * Static OFFLINE release preflight. It does not connect to Cloudflare,
 * read secrets, verify JWT issuer ownership, apply migrations or deploy.
 *
 * Usage: node scripts/tenant-staging-release-gate.mjs --config cloudflare/wrangler.staging.toml
 * This script intentionally fails against the current production-oriented
 * cloudflare/wrangler.toml until a dedicated staging config is reviewed.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const safeValue=value=>{
 const raw=String(value||'').trim();
 const match=raw.match(/^["']([^"']*)["']/);
 return match?match[1]:raw.replace(/\s+#.*$/,'');
};

export function assessTenantStagingConfig(contents){
 const flags=[],issues=[];
 if(typeof contents!=='string'||contents.length>200000)
   return {readyForOfflineReview:false,liveDeploymentAuthorized:false,
     blockers:['staging_config_invalid']};
 const sections=new Map();let current='root';
 sections.set(current,[]);
 for(const original of contents.split(/\r?\n/)){
   const line=original.trim();
   if(!line||line.startsWith('#'))continue;
   const heading=line.match(/^\[{1,2}([a-zA-Z0-9_.-]+)\]{1,2}\s*$/);
   if(heading){
     current=heading[1];
     if(!sections.has(current))sections.set(current,[]);
     continue;
   }
   const match=line.match(/^([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
   if(match)sections.get(current).push([match[1],safeValue(match[2])]);
 }
 const val=(section,key)=>sections.get(section)?.find(([k])=>k===key)?.[1];
 const exists=section=>sections.has(section);
 const stage=exists('env.staging');
 if(!stage)issues.push('dedicated_staging_environment_absent');
 const vars='env.staging.vars',d1='env.staging.d1_databases',r2='env.staging.r2_buckets';
 if(val(vars,'KOSIF_TENANCY_MODE')!=='strict')issues.push('staging_strict_tenancy_not_configured');
 for(const field of ['KOSIF_AUTH_ISSUER','KOSIF_AUTH_AUDIENCE']){
   const value=val(vars,field);
   if(!value||value==='*'||/^(placeholder|change[-_]me|your[-_]|example)/i.test(value))
     issues.push(field.toLowerCase()+'_unconfigured');
 }
 const allowed=val(vars,'PERSISTENCE_ALLOWED_ORIGIN');
 if(!allowed||allowed.includes('*')||!allowed.startsWith('https://')||allowed.includes('localhost'))
   issues.push('staging_origin_allowlist_not_strict');
 if(val(d1,'binding')!=='KOSIF_DB'||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(val(d1,'database_id')||''))
   issues.push('staging_d1_binding_not_pinned');
 if(val(r2,'binding')!=='KOSIF_DOCUMENTS'||!/^[a-z0-9][a-z0-9-]{2,62}$/.test(val(r2,'bucket_name')||''))
   issues.push('staging_r2_binding_not_pinned');
 const configSecrets=['KOSIF_AUTH_JWT_SECRET','KOSIF_BACKUP_HMAC_SECRET','KOSIF_BACKUP_ADMIN_SUBJECT'];
 for(const [section,properties] of sections){
   for(const [key] of properties)if(configSecrets.includes(key))
     issues.push('server_only_secret_or_admin_in_plaintext_config_'+key.toLowerCase());
 }
 if(val('env.staging','main')&&val('env.staging','main')!=='gateway-worker.js')
   issues.push('staging_gateway_entrypoint_unexpected');
 if(!exists('env.staging.d1_databases')||!exists('env.staging.r2_buckets'))
   flags.push('bindings_need_live_cloudflare_verification');
 flags.push('jwt_issuer_trust_not_automatically_verified');
 flags.push('d1_migrations_r2_access_and_object_ownership_not_verified');
 flags.push('server_only_secrets_and_two_human_review_not_verified');
 flags.push('company_a_b_live_restore_not_verified');
 return {readyForOfflineReview:issues.length===0,liveDeploymentAuthorized:false,
   blockers:issues,requiresLiveProof:flags,
   next:'Configure a separate staging environment, secrets outside source, apply approved migrations and run authenticated A/B tests. Never auto-deploy.'};
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(isMain){
 const ix=process.argv.indexOf('--config');
 if(ix<0||!process.argv[ix+1]){
  process.stderr.write('Use --config <explicit-staging-wrangler-file>; no default or deployment.\n');
  process.exitCode=2;
 }else{
  try{
   const status=assessTenantStagingConfig(readFileSync(resolve(process.argv[ix+1]),'utf8'));
   process.stdout.write(JSON.stringify(status,null,2)+'\n');
   if(!status.readyForOfflineReview)process.exitCode=2;
  }catch{
   process.stderr.write('Cannot read staging configuration; gate remains closed.\n');
   process.exitCode=2;
  }
 }
}
