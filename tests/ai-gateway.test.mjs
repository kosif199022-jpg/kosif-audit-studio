import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAi,invokeAiProvider,sanitizeAiSummary,sanitizeAiCompanyContext,sanitizeAiDocuments,buildRealtimeSession,RESEARCH_DOMAINS} from '../worker/ai-gateway.js';
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

test('company report context is whitelisted before external AI sees it',async()=>{
 assert.deepEqual(sanitizeAiCompanyContext({companyId:'apple',reportYear:'2024',reportType:'technology',checkCount:5,passedChecks:4,exceptions:1,passRate:80,findings:[{id:'EX-1',severity:'عالية',title:'فرق معلن',standardId:'IAS 1',reason:'سبب قابل للشرح',apiKey:testKey,secret:'drop'}],prompt:'drop'}),{companyId:'apple',reportYear:'2024',reportType:'technology',checkCount:5,passedChecks:4,exceptions:1,passRate:80,findings:[{id:'EX-1',severity:'عالية',title:'فرق معلن',standardId:'IAS 1',reason:'سبب قابل للشرح'}]});
 const {env}=setup(),{cookie}=await configured(env);let body;
 const r=await handleAi(req('run','POST',{provider:'openai',role:'quality',question:'راجع الشركة',summary:{accountCount:5},companyContext:{companyId:'apple',reportYear:'2024',checkCount:1,passedChecks:0,exceptions:1,findings:[{title:'فرق'}],secret:testKey},consent:true},cookie),env,async(url,options)=>{body=options.body;return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'ok'}]}]}));});
 assert.equal(r.status,200);assert.ok(body.includes('\\"companyId\\":\\"apple\\"'));assert.ok(!body.includes(testKey));assert.ok(!body.includes('secret'));
});

test('document excerpts are bounded, consent-gated, and carry page locators',async()=>{
 const id='a'.repeat(64);
 assert.deepEqual(sanitizeAiDocuments([{documentId:id,page:4,locator:'PDF p.4',text:'حقيقة قابلة للفحص',secret:testKey},{documentId:'bad',page:0,text:'drop'}]),[{documentId:id,page:4,locator:'PDF p.4',text:'حقيقة قابلة للفحص'}]);
 const {env}=setup(),{cookie}=await configured(env);let body='';const fetcher=async(url,options)=>{body=options.body;return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'أطلب المستند ص4'}]}]}));};
 assert.equal((await handleAi(req('run','POST',{provider:'openai',role:'isa',question:'راجع المقتطف',documents:[{documentId:id,page:4,text:'نص'}],consent:true},cookie),env,fetcher)).status,400);
 assert.equal((await handleAi(req('run','POST',{provider:'openai',role:'isa',question:'راجع المقتطف',documents:[{documentId:id,page:4,text:'نص'}],documentConsent:true,consent:true},cookie),env,fetcher)).status,200);
 assert.match(body,/documentId/);assert.ok(!body.includes(testKey));
});

test('realtime session uses a fixed safe voice contract and never returns the provider key',async()=>{
 const session=buildRealtimeSession({model:'evil',voice:'bad',shareSummary:true,summary:{accountCount:12,apiKey:testKey}});
 assert.equal(session.model,'gpt-realtime-2.1');assert.equal(session.audio.output.voice,'marin');assert.equal(session.tools[0].name,'open_workspace');assert.deepEqual(session.audio.input.transcription.language,'ar');assert.ok(!JSON.stringify(session).includes(testKey));
 const {env}=setup(),{cookie}=await configured(env);let sent;
 const response=await handleAi(new Request(origin+'/api/ai/realtime',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify({sdp:'v=0\r\nm=audio 9 RTP/AVP 0',consent:true})}),env,async(url,options)=>{sent={url,options};return new Response('v=0\r\nm=audio 9 RTP/AVP 0');});
 assert.equal(response.status,200);assert.equal(sent.url,'https://api.openai.com/v1/realtime/calls');assert.equal(sent.options.body instanceof FormData,true);assert.ok(!JSON.stringify(session).includes(testKey));
});

test('research keeps web search on allow-listed professional domains',async()=>{
 const {env}=setup(),{cookie}=await configured(env);let payload;const response=await handleAi(new Request(origin+'/api/ai/research',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify({question:'ما أثر ISA 530؟',consent:true})}),env,async(url,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'نتيجة',annotations:[{type:'url_citation',url:'https://www.iaasb.org/publications/isa-530',title:'ISA 530'},{type:'url_citation',url:'https://example.com/no',title:'drop'}]}]}]}));});
 assert.equal(response.status,200);assert.deepEqual(payload.tools[0].filters.allowed_domains,RESEARCH_DOMAINS);const body=await response.json();assert.equal(body.citations.length,1);assert.equal(body.citations[0].url,'https://www.iaasb.org/publications/isa-530');
});
