import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngagement } from '../v5/engagement-machine.js';
import { recordCouncilRound, ingestEvidenceBatch } from '../v5/review-loop.js';
import { proposeAdjustment, decideAdjustment, buildAdjustedTrialBalance } from '../v5/adjustment-ledger.js';
import { REPORT_RECIPES } from '../v5/report-recipes.js';
import { buildProfessionalReportModel } from '../v5/report-model.js';
import { buildEngagementTraceability, traceabilityMetrics } from '../v5/traceability.js';

test('V5 path preserves evidence loop, human adjustment decision and report provenance',()=>{
  let e=createEngagement({id:'ENG-E2E',entity:'شركة E2E',period:'2026-12-31'});
  e.documents.push({id:'DOC-1',name:'tb.csv',type:'trial-balance',status:'classified'});
  e.issues.push({id:'ISS-1',title:'فرق في مصادقة البنك',severity:'high',status:'open',evidenceIds:[]});
  const r1=recordCouncilRound(e,{positions:[{seatId:'isa',title:'ISA',stance:'objection',statement:'نحتاج مصادقة مستقلة.',asks:[{title:'مصادقة بنك مستقلة',issueId:'ISS-1',priority:'critical'}]}],conflicts:[],verdict:'needs-evidence'});e=r1.engagement;
  assert.equal(e.requests.length,1);const req=e.requests[0];
  e=ingestEvidenceBatch(e,[{id:'EVD-1',title:'مصادقة البنك',documentIds:['DOC-1'],requestIds:[req.id],issueIds:['ISS-1'],criteriaSatisfied:['relevance','period'],sourceType:'external',reviewStatus:'received'}]).engagement;
  const r2=recordCouncilRound(e,{positions:[{seatId:'isa',title:'ISA',stance:'clear',statement:'تمت مراجعة الدليل الجديد.',asks:[]}],conflicts:[],verdict:'proceed'});e=r2.engagement;
  assert.equal(e.requests[0].status,'satisfied');
  e.issues=e.issues.map(i=>i.id==='ISS-1'?{...i,status:'closed',evidenceIds:['EVD-1']}:i);
  e.adjustments=proposeAdjustment(e.adjustments,{id:'AJ-0001',issueId:'ISS-1',title:'تسوية فرق البنك',rationale:'فرق مؤيد بالمصادقة.',evidenceIds:['EVD-1'],lines:[{accountId:'A',accountName:'النقدية',side:'debit',amountMinor:10000n},{accountId:'B',accountName:'فروق تسوية',side:'credit',amountMinor:10000n}]});
  e.adjustments=decideAdjustment(e.adjustments,'AJ-0001',{decision:'accepted',actor:'Reviewer',rationale:'تمت مطابقة المصادقة المستقلة.'});
  const atb=buildAdjustedTrialBalance([{id:'A',name:'النقدية',debit:100000n,credit:0n},{id:'B',name:'فروق تسوية',debit:0n,credit:100000n}],e.adjustments);
  assert.equal(atb.balanced,true);assert.deepEqual(atb.appliedAdjustmentIds,['AJ-0001']);
  const graph=buildEngagementTraceability(e),tm=traceabilityMetrics(graph);
  const model=buildProfessionalReportModel({engagement:e,recipe:REPORT_RECIPES['statement-of-financial-position'],statements:{sfp:{currentAssets:{total:110000n},nonCurrentAssets:{total:0n},totalAssets:110000n,currentLiabilities:{total:0n},nonCurrentLiabilities:{total:0n},equity:{total:110000n}},pl:{revenue:0n,expenses:0n,profit:0n}},traceabilityMetrics:tm,documentMetrics:{documentsAnalyzed:1,claims:2,risks:1}});
  const adjustment=model.sections.find(s=>s.id==='adjustment-summary');
  assert.ok(adjustment.sourceIds.includes('AJ-0001'));
  assert.equal(model.status,'draft');
});
