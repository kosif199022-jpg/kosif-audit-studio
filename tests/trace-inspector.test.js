import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngagement } from '../v5/engagement-machine.js';
import { inspectTraceObject, traceObjectSummary } from '../v5/trace-inspector.js';
import { recordCashFlowVersion } from '../v5/cash-flow-workflow.js';

function fixture(){const e=createEngagement({id:'ENG-T',entity:'شركة'});e.documents.push({id:'DOC-1',name:'bank.pdf',sha256:'abc',version:1});e.evidence.push({id:'EVD-1',title:'مصادقة',documentIds:['DOC-1'],requestIds:[],issueIds:[],reviewStatus:'reviewed'});e.issues.push({id:'ISS-1',title:'فرق بنك',severity:'high',status:'closed',evidenceIds:['EVD-1'],riskIds:[]});e.adjustments.push({id:'AJ-1',title:'تسوية',status:'accepted',issueId:'ISS-1',evidenceIds:['EVD-1']});e.reports.push({id:'RPT-1',title:'تقرير',status:'draft',version:1,sourceIds:['AJ-1','DOC-1']});return e}

test('inspector resolves a governed object and walks upstream to its source document',()=>{const e=fixture(),result=inspectTraceObject(e,'AJ-1');assert.equal(result.found,true);assert.equal(result.type,'adjustment');assert.equal(result.label,'تسوية');assert.ok(result.ancestors.some(path=>path.some(n=>n.id==='DOC-1')&&path.at(-1).id==='AJ-1'));assert.ok(result.incoming.some(x=>x.from==='ISS-1'));assert.ok(result.outgoing.some(x=>x.to==='RPT-1'))});

test('document inspection shows downstream impact through evidence issue adjustment and report',()=>{const result=inspectTraceObject(fixture(),'DOC-1'),ids=result.downstream.map(x=>x.id);assert.ok(ids.includes('EVD-1'));assert.ok(ids.includes('ISS-1'));assert.ok(ids.includes('AJ-1'));assert.ok(ids.includes('RPT-1'));const summary=traceObjectSummary(result);assert.equal(summary.type,'document');assert.ok(summary.downstreamCount>=4)});

test('graph-only cash flow movement nodes can be inspected even without top-level engagement records',()=>{let e=createEngagement({id:'ENG-CF'});e.documents.push({id:'DOC-O'},{id:'DOC-C'},{id:'DOC-M'});e=recordCashFlowVersion(e,{openingCashMinor:100n,closingCashMinor:130n,openingSourceIds:['DOC-O'],closingSourceIds:['DOC-C'],movements:[{id:'CFM-1',label:'تحصيل',section:'operating',direction:'inflow',amountMinor:30n,sourceIds:['DOC-M']}]},{actor:'Reviewer',actorType:'human',rationale:'matched'}).engagement;const result=inspectTraceObject(e,'CFV-001:CFM-1');assert.equal(result.found,true);assert.equal(result.type,'cash-flow-movement');assert.equal(result.meta.amountMinor,30n);assert.ok(result.incoming.some(x=>x.from==='DOC-M'));assert.ok(result.outgoing.some(x=>x.to==='CFV-001'))});

test('unknown source ID fails transparently without fabricating a node',()=>{const result=inspectTraceObject(fixture(),'ACCOUNT-UNKNOWN');assert.deepEqual(traceObjectSummary(result),{found:false,id:'ACCOUNT-UNKNOWN',upstreamPaths:0,downstreamCount:0});assert.equal(result.type,'unknown');assert.equal(result.record,null)});

test('inspection is read-only and does not mutate engagement state',()=>{const e=fixture(),before=structuredClone(e);inspectTraceObject(e,'RPT-1');assert.deepEqual(e,before)});
