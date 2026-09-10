import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/gateway-worker.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql.replace(/\s+/g,' ').trim();this.args=[]}
  bind(...args){this.args=args;return this}
  async run(){const s=this.sql,a=this.args,d=this.db;
    if(/^CREATE /i.test(s))return{meta:{changes:0}};
    if(/^INSERT INTO engagements/i.test(s)){d.engagements.set(a[0],{id:a[0],entity_name:a[1],period_end:a[2],jurisdiction:a[3],framework:a[4],created_at:a[5]});return{meta:{changes:1}}}
    if(/^INSERT INTO engagement_sessions/i.test(s)){d.sessions.set(a[0],{engagement_id:a[0],access_token_hash:a[1],state_json:null,state_hash:null,state_version:0,created_at:a[2],updated_at:a[3]});return{meta:{changes:1}}}
    if(/^UPDATE engagement_sessions SET state_json/i.test(s)){const [state_json,state_hash,next,updated,id,expected]=a,row=d.sessions.get(id);if(!row||row.state_version!==expected)return{meta:{changes:0}};Object.assign(row,{state_json,state_hash,state_version:next,updated_at:updated});return{meta:{changes:1}}}
    if(/^INSERT INTO engagement_events/i.test(s)){d.events.push({engagement_id:a[0],sequence:a[1],event_type:'STATE_SNAPSHOT_SAVED',object_type:'ENGAGEMENT',object_id:a[2],payload_hash:a[3],created_at:a[4]});return{meta:{changes:1}}}
    return{meta:{changes:1}};
  }
  async first(){const s=this.sql,a=this.args,d=this.db;
    if(/SELECT access_token_hash, state_version, state_hash, state_json FROM engagement_sessions/i.test(s))return d.sessions.get(a[0])||null;
    if(/SELECT id,entity_name,period_end,jurisdiction,framework,created_at FROM engagements/i.test(s))return d.engagements.get(a[0])||null;
    if(/SELECT state_version,state_hash FROM engagement_sessions/i.test(s)){const r=d.sessions.get(a[0]);return r?{state_version:r.state_version,state_hash:r.state_hash}:null}
    return null;
  }
  async all(){const s=this.sql,a=this.args,d=this.db;if(/FROM engagement_events/i.test(s))return{results:d.events.filter(e=>e.engagement_id===a[0]).sort((x,y)=>y.sequence-x.sequence)};return{results:[]}}
}
class FakeDB { constructor(){this.engagements=new Map;this.sessions=new Map;this.events=[]} prepare(sql){return new Statement(this,sql)} async batch(statements){return Promise.all(statements.map(s=>s.run()))} }
const request=(url,opts={})=>new Request(url,{...opts,headers:{Origin:'https://app.test',...(opts.headers||{})}});

test('worker engagement persistence requires bearer token and rejects stale writes',async()=>{
  const db=new FakeDB,env={KOSIF_DB:db,ALLOWED_ORIGIN:'https://app.test'};
  let response=await worker.fetch(request('https://worker.test/api/engagements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity:'شركة اختبار',periodEnd:'2026-12-31'})}),env);
  assert.equal(response.status,201);const created=await response.json();assert.match(created.engagementId,/^ENG-/);assert.ok(created.accessToken);
  response=await worker.fetch(request(`https://worker.test/api/engagements/${created.engagementId}`),env);assert.equal(response.status,401);
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${created.accessToken}`};
  const state={schemaVersion:1,payload:{engagement:{id:created.engagementId,entity:'شركة اختبار'}}};
  response=await worker.fetch(request(`https://worker.test/api/engagements/${created.engagementId}/state`,{method:'PUT',headers,body:JSON.stringify({expectedVersion:0,state})}),env);
  assert.equal(response.status,200);assert.equal((await response.json()).version,1);
  response=await worker.fetch(request(`https://worker.test/api/engagements/${created.engagementId}/state`,{method:'PUT',headers,body:JSON.stringify({expectedVersion:0,state})}),env);
  assert.equal(response.status,409);assert.equal((await response.json()).currentVersion,1);
  response=await worker.fetch(request(`https://worker.test/api/engagements/${created.engagementId}`,{headers:{Authorization:`Bearer ${created.accessToken}`}}),env);
  assert.equal(response.status,200);const loaded=await response.json();assert.equal(loaded.version,1);assert.equal(loaded.state.payload.engagement.id,created.engagementId);
  response=await worker.fetch(request(`https://worker.test/api/engagements/${created.engagementId}`,{headers:{Authorization:'Bearer wrong'}}),env);assert.equal(response.status,403);
});
