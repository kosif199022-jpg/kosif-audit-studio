import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngagement } from '../v5/engagement-machine.js';
import { REPORT_RECIPES } from '../v5/report-recipes.js';
import { buildProfessionalReportModel } from '../v5/report-model.js';
import { reportSourceFingerprint, reportIsStale } from '../v5/report-source.js';
import { reportIssueReadiness } from '../v5/report-approval.js';
import { recommendSpecialists, specialistAdvisoryPositions } from '../v5/specialist-registry.js';
import { recordCouncilRound, ingestEvidenceBatch, buildCouncilDelta } from '../v5/review-loop.js';

test('report source fingerprint is order-stable but changes when accountable source state changes',()=>{
  const e=createEngagement({id:'ENG-F',entity:'شركة',period:'2026-12-31',engagementType:'preparation'});
  e.documents.push({id:'DOC-2',sha256:'b',version:1,status:'classified'},{id:'DOC-1',sha256:'a',version:1,status:'classified'});
  e.evidence.push({id:'EVD-2',reviewStatus:'received'},{id:'EVD-1',reviewStatus:'reviewed'});
  const first=reportSourceFingerprint(e),reordered=structuredClone(e);reordered.documents.reverse();reordered.evidence.reverse();
  assert.equal(reportSourceFingerprint(reordered),first);
  reordered.evidence.find(x=>x.id==='EVD-2').reviewStatus='reviewed';
  assert.notEqual(reportSourceFingerprint(reordered),first);
});

test('a previously ready report becomes stale and cannot be issued after source changes',()=>{
  const e=createEngagement({id:'ENG-STALE',entity:'شركة',period:'2026-12-31',engagementType:'preparation'});e.documents.push({id:'DOC-1',sha256:'a',version:1,status:'classified'});e.councilRounds.push({id:'RND-1',number:1,status:'completed',positions:[],conflicts:[],evidenceIds:[],issueIds:[]});
  const statements={sfp:{currentAssets:{total:100n},nonCurrentAssets:{total:200n},totalAssets:300n,currentLiabilities:{total:50n},nonCurrentLiabilities:{total:70n},equity:{total:180n}},pl:{revenue:500n,expenses:400n,profit:100n}};
  const report=buildProfessionalReportModel({engagement:e,recipe:REPORT_RECIPES['statement-of-financial-position'],statements,traceabilityMetrics:{nodes:2,edges:1,isolated:[]},documentMetrics:{documentsAnalyzed:1,claims:0,risks:0}});
  assert.equal(report.sourceFingerprint,reportSourceFingerprint(e));
  assert.equal(reportIsStale(report,e),false);
  assert.equal(reportIssueReadiness(report,{ready:true,blockers:[]},e).ready,true);
  e.documents.push({id:'DOC-2',sha256:'new',version:1,status:'classified'});
  assert.equal(reportIsStale(report,e),true);
  const readiness=reportIssueReadiness(report,{ready:true,blockers:[]},e);
  assert.equal(readiness.ready,false);assert.ok(readiness.blockers.some(b=>b.type==='stale-report'));
});

test('specialist registry recommends expertise without fabricating specialist conclusions',()=>{
  const e=createEngagement({id:'ENG-S'});e.issues.push({id:'ISS-1',title:'Goodwill impairment valuation requires sensitivity testing',rationale:'Fair value assumptions are significant',status:'open'},{id:'ISS-2',title:'دعوى قضائية والتزام محتمل',rationale:'خطاب المحامي غير متوفر',status:'open'},{id:'ISS-3',title:'اشتباه تلاعب واحتيال في قيود الإدارة',rationale:'management override',status:'open'});
  const recs=recommendSpecialists(e,[]),ids=recs.map(r=>r.id);
  assert.ok(ids.includes('valuation'));assert.ok(ids.includes('legal'));assert.ok(ids.includes('forensic'));
  const positions=specialistAdvisoryPositions(recs);
  assert.ok(positions.every(p=>p.stance==='caution'));
  assert.ok(positions.every(p=>/لا توجد خلاصة تخصصية مفترضة/.test(p.statement)));
  assert.ok(positions.every(p=>p.contract.mayNot.includes('approve-opinion')));
});

test('specialist advisory asks enter governed evidence requests and repeated rounds are deduplicated',()=>{
  let e=createEngagement({id:'ENG-S2'});e.documents.push({id:'DOC-1',status:'classified'});e.issues.push({id:'ISS-1',title:'ERP privileged access ITGC issue',status:'open'});
  const positions=specialistAdvisoryPositions(recommendSpecialists(e,[]));
  let result=recordCouncilRound(e,{positions,conflicts:[],verdict:'needs-evidence',verdictText:'Specialist work required'},{recordedAt:'2026-01-01T00:00:00Z'});e=result.engagement;
  assert.equal(e.requests.length,1);assert.match(e.requests[0].title,/IT Audit/);assert.equal(e.requests[0].status,'requested');
  result=recordCouncilRound(e,{positions,conflicts:[],verdict:'needs-evidence',verdictText:'Still awaiting specialist work'},{recordedAt:'2026-01-02T00:00:00Z'});e=result.engagement;
  assert.equal(e.requests.length,1);assert.equal(result.deduplicatedRequests.length,1);
});

test('council delta reports evidence and issue movement between rounds',()=>{
  let e=createEngagement({id:'ENG-D'});e.documents.push({id:'DOC-1',status:'classified'});e.issues.push({id:'ISS-1',title:'Issue one',status:'open'});
  let r=recordCouncilRound(e,{positions:[],conflicts:[],verdict:'needs-evidence'},{recordedAt:'2026-01-01T00:00:00Z'});e=r.engagement;const first=r.round;
  e=ingestEvidenceBatch(e,[{id:'EVD-1',title:'New evidence',reviewStatus:'received'}],{receivedAt:'2026-01-02T00:00:00Z'}).engagement;e.issues.push({id:'ISS-2',title:'Issue two',status:'open'});
  r=recordCouncilRound(e,{positions:[],conflicts:[],verdict:'proceed'},{recordedAt:'2026-01-03T00:00:00Z'});e=r.engagement;const delta=buildCouncilDelta(first,r.round,e);
  assert.deepEqual(delta.evidenceAdded,['EVD-1']);assert.deepEqual(delta.issuesAdded,['ISS-2']);
});
