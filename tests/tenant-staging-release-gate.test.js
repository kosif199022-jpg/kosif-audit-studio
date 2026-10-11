import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessTenantStagingConfig} from '../scripts/tenant-staging-release-gate.mjs';
const secureExample=[
 'name = "kosif-audit-staging-not-production"',
 'main = "gateway-worker.js"',
 '[env.staging]',
 'name = "kosif-audit-tenant-staging"',
 'main = "gateway-worker.js"',
 '[env.staging.vars]',
 'KOSIF_TENANCY_MODE = "strict"',
 'KOSIF_AUTH_ISSUER = "https://issuer.staging.example.invalid"',
 'KOSIF_AUTH_AUDIENCE = "kosif-staging"',
 'PERSISTENCE_ALLOWED_ORIGIN = "https://staging.example.invalid"',
 '[[env.staging.d1_databases]]',
 'binding = "KOSIF_DB"',
 'database_id = "dcb9a8e1-1aa2-4422-aefa-04bd90b0d30f"',
 '[[env.staging.r2_buckets]]',
 'binding = "KOSIF_DOCUMENTS"',
 'bucket_name = "kosif-tenant-staging-test"'
].join('\n');
test('current repository Wrangler config fails separate-staging gate, never silently certifies production resources',()=>{
 const config=readFileSync(new URL('../cloudflare/wrangler.toml',import.meta.url),'utf8');
 const status=assessTenantStagingConfig(config);
 assert.equal(status.readyForOfflineReview,false);
 assert.equal(status.liveDeploymentAuthorized,false);
 assert.ok(status.blockers.includes('dedicated_staging_environment_absent'));
 assert.ok(status.blockers.includes('staging_strict_tenancy_not_configured'));
 assert.ok(status.blockers.includes('staging_d1_binding_not_pinned'));
 assert.ok(status.blockers.includes('staging_r2_binding_not_pinned'));
});
test('explicitly scoped config can pass static inspection but never claims staging or security is live-verified',()=>{
 const status=assessTenantStagingConfig(secureExample);
 assert.equal(status.readyForOfflineReview,true);
 assert.equal(status.liveDeploymentAuthorized,false);
 assert.ok(status.requiresLiveProof.some(x=>x.includes('d1_migrations_r2')));
 assert.ok(status.requiresLiveProof.some(x=>x.includes('two_human_review')));
});
test('plaintext JWT or backup HMAC secrets and static browser-controlled admin are forbidden in wrangler config',()=>{
 for(const secret of ['KOSIF_AUTH_JWT_SECRET','KOSIF_BACKUP_HMAC_SECRET','KOSIF_BACKUP_ADMIN_SUBJECT']){
  const config=secureExample.replace('KOSIF_AUTH_AUDIENCE',secret+' = "not-a-real-secret"\nKOSIF_AUTH_AUDIENCE');
  const status=assessTenantStagingConfig(config);
  assert.equal(status.readyForOfflineReview,false);
  assert.ok(status.blockers.some(x=>x.includes(secret.toLowerCase())));
 }
});
test('staging gate rejects wildcard origin, missing issuer, unpinned resource and permissive tenant mode',()=>{
 const cases=[
  [secureExample.replace('https://staging.example.invalid','*'),'staging_origin_allowlist_not_strict'],
  [secureExample.replace('KOSIF_AUTH_ISSUER = "https://issuer.staging.example.invalid"\n',''),'kosif_auth_issuer_unconfigured'],
  [secureExample.replace('KOSIF_TENANCY_MODE = "strict"','KOSIF_TENANCY_MODE = "legacy"'),'staging_strict_tenancy_not_configured'],
  [secureExample.replace('database_id = "dcb9a8e1-1aa2-4422-aefa-04bd90b0d30f"',''),'staging_d1_binding_not_pinned'],
  [secureExample.replace('bucket_name = "kosif-tenant-staging-test"',''),'staging_r2_binding_not_pinned']
 ];
 for(const [sample,expected] of cases){
   const report=assessTenantStagingConfig(sample);
   assert.equal(report.readyForOfflineReview,false);
   assert.ok(report.blockers.includes(expected),expected+': '+JSON.stringify(report.blockers));
 }
});
test('invalid and oversize configuration fail without opening a deployment path',()=>{
 assert.equal(assessTenantStagingConfig(null).readyForOfflineReview,false);
 assert.equal(assessTenantStagingConfig('x'.repeat(200001)).readyForOfflineReview,false);
});

test('provisioned isolated D1/R2 staging config remains fail-closed until a real trusted issuer is configured',()=>{
 const cfg=readFileSync(new URL('../cloudflare/wrangler.staging.toml',import.meta.url),'utf8');
 const decision=assessTenantStagingConfig(cfg);
 assert.equal(decision.liveDeploymentAuthorized,false);
 assert.equal(decision.readyForOfflineReview,false);
 assert.deepEqual(decision.blockers,['kosif_auth_issuer_unconfigured']);
 assert.match(cfg,/name = "kosif-audit-tenant-staging-20261011"/);
 assert.match(cfg,/database_id = "2bf580c6-6a80-41bb-a59c-f96a6b4d3c0f"/);
 assert.match(cfg,/bucket_name = "kosif-audit-tenant-staging-docs-20261011"/);
 assert.match(cfg,/KOSIF_TENANCY_MODE = "strict"/);
 assert.match(cfg,/workers_dev = false/);
 assert.doesNotMatch(cfg,/^\s*(KOSIF_AUTH_JWT_SECRET|KOSIF_BACKUP_HMAC_SECRET|KOSIF_BACKUP_ADMIN_SUBJECT)\s*=/m);
 const production=readFileSync(new URL('../cloudflare/wrangler.toml',import.meta.url),'utf8');
 assert.doesNotMatch(production,/2bf580c6-6a80-41bb-a59c-f96a6b4d3c0f/);
 assert.doesNotMatch(production,/kosif-audit-tenant-staging-docs-20261011/);
});
