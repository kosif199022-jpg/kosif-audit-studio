import test from 'node:test';
import assert from 'node:assert/strict';
import {aiRequest,createRealtimeClient,executeVoiceTool,VOICE_WORKSPACES} from '../src/realtime-client.js';

test('realtime navigation only opens allow-listed workspaces',()=>{
 const opened=[];assert.deepEqual(executeVoiceTool({type:'function_call',name:'open_workspace',arguments:JSON.stringify({view:'reports'})},view=>opened.push(view)),{ok:true,opened:'reports'});assert.deepEqual(opened,['reports']);
 assert.equal(executeVoiceTool({type:'function_call',name:'open_workspace',arguments:JSON.stringify({view:'delete-all'})}).ok,false);assert.equal(executeVoiceTool({type:'function_call',name:'other',arguments:'{}'}).error,'tool_not_allowed');assert.equal(VOICE_WORKSPACES.includes('council'),true);
});

test('browser API requests keep the native fetch receiver', async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=function(url,options){assert.equal(this,globalThis);calls++;return Promise.resolve(Response.json({available:true,providers:[]}));};
 try{const result=await aiRequest('config');assert.equal(result.available,true);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});

test('non-JSON gateway failures become a safe actionable error', async()=>{
 await assert.rejects(
  aiRequest('realtime',{}, {fetcher:async()=>new Response('<html>upstream failure</html>',{status:502})}),
  error=>error.code==='request_failed' && /الاتصال/.test(error.message)
 );
});

test('microphone errors are translated and do not leave a live stream', async()=>{
 const statuses=[];
 const client=createRealtimeClient({
  PeerConnection:class {},
  AudioElement:class {},
  mediaDevices:{getUserMedia:async()=>{const error=new Error('no device');error.name='NotFoundError';throw error;}},
  onStatus:(state,message)=>statuses.push([state,message])
 });
 await assert.rejects(client.connect({consent:true}), error=>error.code==='mic_missing');
 assert.match(statuses.at(-1)[1],/ميكروفون/);
});

test('the realtime offer waits for ICE candidates before sending SDP', async()=>{
 let sentBody;
 let remoteDescription;
 let stopped=0;
 class Channel { readyState='open'; close(){} send(){} }
 class Peer {
  constructor(){this.iceGatheringState='gathering';this.connectionState='new';this.listeners={};}
  addEventListener(type,fn){(this.listeners[type] ||= new Set()).add(fn);}
  removeEventListener(type,fn){this.listeners[type]?.delete(fn);}
  createOffer(){return Promise.resolve({type:'offer',sdp:'v=0\\r\\nm=audio 9 RTP/AVP 0'});}
  async setLocalDescription(offer){this.localDescription={...offer,sdp:offer.sdp+'\\r\\na=candidate:ready'};queueMicrotask(()=>{this.iceGatheringState='complete';for(const fn of this.listeners.icegatheringstatechange||[])fn();});}
  createDataChannel(){return new Channel();}
  addTrack(){}
  async setRemoteDescription(description){remoteDescription=description;this.connectionState='connected';}
  close(){}
 }
 const client=createRealtimeClient({
  PeerConnection:Peer,
  AudioElement:class {play(){return Promise.resolve();} pause(){}},
  mediaDevices:{getUserMedia:async()=>({getAudioTracks:()=>[{enabled:true}],getTracks:()=>[{stop:()=>{stopped++;}}]})},
  fetcher:async(url,options)=>{sentBody=JSON.parse(options.body);return Response.json({sdp:'v=0\\r\\nm=audio 9 RTP/AVP 0'});}
 });
 await client.connect({consent:true,model:'gpt-realtime',voice:'marin'});
 assert.match(sentBody.sdp,/a=candidate:ready/);
 assert.match(remoteDescription.sdp,/^v=0/);
 client.disconnect();
 assert.equal(stopped,1);
});
