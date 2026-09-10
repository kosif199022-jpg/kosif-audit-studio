import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngagement } from '../v5/engagement-machine.js';
import { completionStatus, recordCompletionDecision } from '../v5/completion-engine.js';
import { buildProfessionalReportModel } from '../v5/report-model.js';
import { REPORT_RECIPES } from '../v5/report-recipes.js';
import { reviewReportSection, reportIssueReadiness, issueReport } from '../v5/report-approval.js';

test('audit completion stays blocked when materiality and human completion decisions are missing',()=>{
  const e=createEngagement({id:'ENG-AUDIT',engagementType:'audit'});e.documents.push({id:'DOC-1',status:'classified'});e.councilRounds.push({id:'RND-1',status:'completed',conflicts:[]});
  const status=completionStatus(e,{recipeId:'audit-report',materiality:null,traceabilityMetrics:{isolated:[]}});
  assert.equal(status.ready,false);
  assert.equal(status.requirements.find(r=>r.id==='MATERIALITY_APPROVED').status,'blocked');
  assert.ok(status.requirements.some(r=>r.id==='GOING_CONCERN'&&r.status==='pending'));
});

test('completion professional decisions are append-only and require a human actor',()=>{
  let e=createEngagement({id:'ENG-C',engagementType:'preparation'});
  assert.throws(()=>recordCompletionDecision(e,{checkId:'STATEMENT_PRESENTATION_REVIEW',status:'satisfied',actor:'AI',actorType:'ai',rationale:'ok'}),/human/);
  e=recordCompletionDecision(e,{checkId:'STATEMENT_PRESENTATION_REVIEW',status:'satisfied',actor:'Reviewer',actorType:'human',rationale:'تمت مراجعة العرض.'},{at:'2026-01-01T00:00:00Z'}).engagement;
  e=recordCompletionDecision(e,{checkId:'STATEMENT_PRESENTATION_REVIEW',status:'blocked',actor:'Reviewer',actorType:'human',rationale:'ظهرت مسألة لاحقة.'},{at:'2026-01-02T00:00:00Z'}).engagement;
  assert.equal(e.completionDecisions.length,2);
  assert.equal(e.completionDecisions[1].previousDecisionId,e.completionDecisions[0].id);
  assert.equal(completionStatus(e,{recipeId:'statement-of-financial-position',traceabilityMetrics:{isolated:[]}}).requirements.find(r=>r.id==='STATEMENT_PRESENTATION_REVIEW').status,'blocked');
});

test('a source-backed statement report can be issued only after completion and human issue decision',()=>{
  let e=createEngagement({id:'ENG-ISSUE',entity:'شركة الإصدار',period:'2026-12-31',engagementType:'preparation'});e.documents.push({id:'DOC-1',status:'classified'});e.councilRounds.push({id:'RND-1',status:'completed',positions:[],conflicts:[]});
  const statements={sfp:{currentAssets:{total:100n},nonCurrentAssets:{total:200n},totalAssets:300n,currentLiabilities:{total:50n},nonCurrentLiabilities:{total:70n},equity:{total:180n}},pl:{revenue:500n,expenses:400n,profit:100n}};
  const report=buildProfessionalReportModel({engagement:e,recipe:REPORT_RECIPES['statement-of-financial-position'],statements,traceabilityMetrics:{nodes:3,edges:2,isolated:[]},documentMetrics:{documentsAnalyzed:1,claims:2,risks:0}});
  let completion=completionStatus(e,{recipeId:report.recipeId,traceabilityMetrics:{isolated:[]}});
  assert.equal(completion.ready,false);assert.throws(()=>issueReport(report,completion,{actor:'Reviewer',actorType:'human',rationale:'إصدار'}),/not ready/);
  e=recordCompletionDecision(e,{checkId:'STATEMENT_PRESENTATION_REVIEW',status:'satisfied',actor:'Reviewer',actorType:'human',rationale:'تمت مراجعة القائمة.'}).engagement;
  completion=completionStatus(e,{recipeId:report.recipeId,traceabilityMetrics:{isolated:[]}});
  assert.equal(completion.ready,true);
  assert.equal(reportIssueReadiness(report,completion).ready,true);
  assert.throws(()=>issueReport(report,completion,{actor:'AI',actorType:'ai',rationale:'auto'}),/actorType=human/);
  const issued=issueReport(report,completion,{actor:'Reviewer',actorType:'human',rationale:'استوفيت إجراءات الإصدار.'});
  assert.equal(issued.status,'issued');assert.equal(issued.issueDecision.actorType,'human');
});

test('report section review history controls human review quality and issued reports are immutable',()=>{
  const e=createEngagement({id:'ENG-R',engagementType:'audit'});e.documents.push({id:'DOC-1',status:'classified'});e.councilRounds.push({id:'RND-1',status:'completed',positions:[],conflicts:[]});
  const report=buildProfessionalReportModel({engagement:e,recipe:REPORT_RECIPES['audit-report'],materiality:{overall:100n,performance:70n},traceabilityMetrics:{nodes:1,edges:0,isolated:[]},documentMetrics:{documentsAnalyzed:1,claims:0,risks:0}});
  const opinion=reviewReportSection(report,'opinion',{decision:'approved',actor:'Partner',actorType:'human',rationale:'تمت مراجعة صياغة الرأي.'});
  assert.equal(opinion.sections.find(s=>s.id==='opinion').review.decision,'approved');
  assert.equal(opinion.quality.humanReviewCompleted,false);
  assert.throws(()=>reviewReportSection(report,'opinion',{decision:'approved',actor:'AI',actorType:'ai',rationale:'auto'}),/actorType=human/);
  const frozen={...opinion,status:'issued'};
  assert.throws(()=>reviewReportSection(frozen,'opinion',{decision:'approved',actor:'Partner',actorType:'human',rationale:'مرة أخرى'}),/immutable/);
});
