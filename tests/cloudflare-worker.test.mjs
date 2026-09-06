import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';

execFileSync(process.execPath,['scripts/prepare-cloudflare-build.mjs']);
const {default:worker}=await import('../dist/client/_worker.js');
const cryptoApi=globalThis.crypto||webcrypto;

function base64url(value){
 const bytes=value instanceof Uint8Array?value:Buffer.from(value);
 return Buffer.from(bytes).toString('base64url');
}

async function accessFixture(){
 const keyPair=await cryptoApi.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const publicJwk=await cryptoApi.subtle.exportKey('jwk',keyPair.publicKey);
 Object.assign(publicJwk,{kid:'packaged-worker-kid',alg:'RS256',use:'sig'});
 const now=Math.floor(Date.now()/1000);
 const header=base64url(JSON.stringify({alg:'RS256',kid:publicJwk.kid,typ:'JWT'}));
 const payload=base64url(JSON.stringify({
  iss:'https://kosif.cloudflareaccess.com',
  aud:['aud_packaged_worker_test'],
  email:'auditor@example.test',
  iat:now-30,
  nbf:now-30,
  exp:now+300,
 }));
 const signingInput=`${header}.${payload}`;
 const signature=new Uint8Array(await cryptoApi.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,new TextEncoder().encode(signingInput)));
 return {publicJwk,token:`${signingInput}.${base64url(signature)}`};
}

test('direct Cloudflare rejects spoofed Sites identity and retains public static routes',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('KOSIF',{headers:{'content-type':'text/html'}})}};
 const spoofed=await worker.fetch(new Request('https://example.test/api/council/providers',{headers:{'oai-authenticated-user-email':'someone@example.test'}}),env);
 assert.equal(spoofed.status,401);
 const shell=await worker.fetch(new Request('https://example.test/audit/',{headers:{accept:'text/html'}}),env);
 assert.equal(shell.status,200);assert.equal(await shell.text(),'KOSIF');
 assert.ok(shell.headers.get('content-security-policy'));
});

test('packaged Cloudflare worker accepts only a signed Access assertion for configured Access identity',async()=>{
 const {publicJwk,token}=await accessFixture();
 const originalFetch=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(url,init={})=>{
  calls.push({url:String(url),init});
  return new Response(JSON.stringify({keys:[publicJwk]}),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const env={
   TEAM_DOMAIN:'https://kosif.cloudflareaccess.com',
   POLICY_AUD:'aud_packaged_worker_test',
   ASSETS:{fetch:async()=>new Response('must-not-run',{status:500})},
  };
  const response=await worker.fetch(new Request('https://example.test/api/council/providers',{headers:{'cf-access-jwt-assertion':token}}),env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.schemaVersion,1);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://kosif.cloudflareaccess.com/cdn-cgi/access/certs');
  assert.equal(calls[0].init.headers.accept,'application/json');
 }finally{
  globalThis.fetch=originalFetch;
 }
});
