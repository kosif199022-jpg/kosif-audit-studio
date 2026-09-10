import test from 'node:test';
import assert from 'node:assert/strict';
import { stringifyState, parseState, encodedStateBytes } from '../v5/state-codec.js';
import { createEngagementPersistenceClient } from '../v5/engagement-persistence.js';
import { createEngagement } from '../v5/engagement-machine.js';
import { REPORT_RECIPES } from '../v5/report-recipes.js';
import { buildProfessionalReportModel } from '../v5/report-model.js';

test('state codec round-trips BigInt, Map and Set without losing types',()=>{
  const input={amount:12345678901234567890n,map:new Map([['a',1n]]),set:new Set(['x','y'])};
  const out=parseState(stringifyState(input));
  assert.equal(out.amount,12345678901234567890n);
  assert.equal(out.map.get('a'),1n);
  assert.equal(out.set.has('y'),true);
  assert.ok(encodedStateBytes(input)>0);
});

test('persistence client sends bearer token and optimistic version',async()=>{
  const calls=[];
  const fetchImpl=async(url,opts={})=>{calls.push({url,opts});return new Response(JSON.stringify({ok:true,version:4}),{status:200,headers:{'Content-Type':'application/json'}})};
  const c=createEngagementPersistenceClient({baseUrl:'https://example.test/',fetchImpl});
  await c.save('ENG-1','secret',{engagement:{id:'ENG-1',adjustments:[{amount:5n}]}},3);
  assert.equal(calls[0].url,'https://example.test/api/engagements/ENG-1/state');
  assert.equal(calls[0].opts.headers.Authorization,'Bearer secret');
  const body=JSON.parse(calls[0].opts.body);
  assert.equal(body.expectedVersion,3);
  assert.equal(body.state.payload.engagement.adjustments[0].amount.$kosifBigInt,'5');
});

test('report model refuses to fabricate cash flows and reserves opinion for human review',()=>{
  const e=createEngagement({id:'ENG-R',entity:'شركة الاختبار',period:'2026-12-31'});
  e.documents.push({id:'DOC-1',status:'classified'});
  e.councilRounds.push({id:'RND-001',number:1,status:'completed',positions:[],conflicts:[]});
  const model=buildProfessionalReportModel({engagement:e,recipe:REPORT_RECIPES['full-financial-statements'],traceabilityMetrics:{nodes:1,edges:0,isolated:[]},documentMetrics:{documentsAnalyzed:0,claims:0,risks:0}});
  const cash=model.sections.find(s=>s.id==='cash-flows');
  assert.equal(cash.status,'unavailable');
  assert.match(cash.unavailableReason,/لن ينشئ KOSIF/);
  const audit=buildProfessionalReportModel({engagement:e,recipe:REPORT_RECIPES['audit-report'],traceabilityMetrics:{nodes:1,edges:0,isolated:[]},documentMetrics:{documentsAnalyzed:0,claims:0,risks:0}});
  const opinion=audit.sections.find(s=>s.id==='opinion');
  assert.equal(opinion.humanReviewRequired,true);
  assert.equal(opinion.status,'human-required');
});
