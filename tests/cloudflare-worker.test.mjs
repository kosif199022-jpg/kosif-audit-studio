import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath,['scripts/prepare-cloudflare-build.mjs']);
const {default:worker}=await import('../dist/client/_worker.js');
test('direct Cloudflare rejects spoofed Sites identity and retains public static routes',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('KOSIF',{headers:{'content-type':'text/html'}})}};
 const spoofed=await worker.fetch(new Request('https://example.test/api/council/providers',{headers:{'oai-authenticated-user-email':'someone@example.test'}}),env);
 assert.equal(spoofed.status,401);
 const shell=await worker.fetch(new Request('https://example.test/audit/',{headers:{accept:'text/html'}}),env);
 assert.equal(shell.status,200);assert.equal(await shell.text(),'KOSIF');
 assert.ok(shell.headers.get('content-security-policy'));
});
