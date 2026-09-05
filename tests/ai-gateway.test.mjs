import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAi,invokeAiProvider,sanitizeAiSummary} from '../worker/ai-gateway.js';
const origin='https://kosif.example';
const testKey='not-a-real-provider-key-12345';
function setup(){const records=new Map();return {records,env:{AI_KEY_ENCRYPTION_SECRET:'a'.repeat(64),AI_SESSIONS:{get:async k=>records.get(k)||null,put:async(k,v)=>records.set(k,v),delete:async k=>records.delete(k)}}};}
function req(path,method='GET',data,cookie='',requestOrigin=origin){return new Request(origin+'/api/ai/'+path,{method,headers:{origin:requestOrigin,'content-type':'application/json',cookie},body:data===undefined?undefined:JSON.stringify(data)});}
async function configured(env){const r=await handleAi(req('config','PUT',{provider:'openai',model:'test-model',apiKey:testKey}),env);return {response:r,cookie:r.headers.get('set-cookie').split(';')[0]};}
test('keys are encrypted at rest, never returned, and sessions do not share configuration',async()=>{
 const {env,records}=setup();const {response,cookie}=await configured(env);assert.equal(response.status,200);
 assert.ok(!JSON.stringify([...records.values()]).includes(testKey));assert.ok(!JSON.stringify(await response.json()).includes(testKey));
 assert.ok(response.headers.get('set-cookie').includes('HttpOnly'));assert.ok(response.headers.get('set-cookie').includes('SameSite=Strict'));
 const privateView=await (await handleAi(req('config','GET',undefined,cookie),env)).json();assert.equal(privateView.providers[0].configured,true);
 const anonymous=await (await handleAi(req('config'),env)).json();assert.equal(anonymous.providers[0].configured,false);
 await handleAi(req('config','DELETE',undefined,cookie),env);assert.equal(records.size,0);
});
test('cross-origin writes, missing sessions and missing consent never invoke a provider',async()=>{
 const {env}=setup();let calls=0;const fetcher=async()=>{calls++;throw new Error('unexpected');};
 assert.equal((await handleAi(req('config','PUT',{},'','https://evil.example'),env,fetcher)).status,403);
 assert.equal((await handleAi(req('run','POST',{consent:true}),env,fetcher)).status,401);
 const {cookie}=await configured(env);assert.equal((await handleAi(req('run','POST',{provider:'openai',role:'assistant',question:'test'},cookie),env,fetcher)).status,400);assert.equal(calls,0);
});
test('summary redaction and provider failures do not leak keys or records',async()=>{
 assert.deepEqual(sanitizeAiSummary({accountCount:500,entity:'Secret client',apiKey:testKey,accounts:[{}]}),{accountCount:500,balanced:false,materialityMinor:'0',openFindings:0,pendingEvidence:0,completedRounds:0,totalRounds:0,passedGates:0,totalGates:0,synthetic:false});
 const {env}=setup(),{cookie}=await configured(env);let sent;
 const r=await handleAi(req('run','POST',{provider:'openai',role:'ifrs',question:'راجع هذا الملخص',summary:{accountCount:500,clientName:'Secret'},consent:true},cookie),env,async(url,options)=>{sent={url,options};return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'مراجعة استشارية'}]}]}));});
 assert.equal(r.status,200);assert.ok(!sent.options.body.includes('Secret'));assert.ok(!sent.options.body.includes(testKey));assert.equal(JSON.parse(sent.options.body).store,false);assert.equal(sent.options.redirect,'error');
 const bad=await invokeAiProvider({id:'openai',model:'test',key:testKey},'test','assistant',{},async()=>new Response(testKey,{status:401}));assert.equal(bad.error,'provider_auth');assert.ok(!JSON.stringify(bad).includes(testKey));
});
test('Gemini and Claude use fixed endpoints, header credentials and bounded output',async()=>{
 for(const id of ['gemini','claude']){let captured;const result=await invokeAiProvider({id,model:'test-model',key:testKey},'review','quality',{},async(url,options)=>{captured={url,options};return new Response(JSON.stringify(id==='gemini'?{candidates:[{content:{parts:[{text:'answer'}]}}]}:{content:[{type:'text',text:'answer'}]}));});assert.equal(result.text,'answer');assert.ok(!captured.url.includes(testKey));const body=JSON.parse(captured.options.body);assert.equal(id==='gemini'?body.generationConfig.maxOutputTokens:body.max_tokens,1200);}
});
