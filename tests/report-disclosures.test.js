import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngagement } from '../v5/engagement-machine.js';
import { REPORT_RECIPES } from '../v5/report-recipes.js';
import { buildProfessionalReportModel } from '../v5/report-model.js';
import { attachDisclosureSection } from '../v5/report-disclosures.js';
import { disclosureCandidates, recordDisclosureReview } from '../v5/disclosure-engine.js';

const rows=[{id:'INV-1',category:'مخزون',standards:['IAS 2']}];
function base(){const e=createEngagement({id:'ENG-N',entity:'شركة',engagementType:'preparation'});e.documents.push({id:'DOC-1',type:'trial-balance'});const report=buildProfessionalReportModel({engagement:e,recipe:REPORT_RECIPES['full-financial-statements'],traceabilityMetrics:{nodes:1,edges:0,isolated:[]},documentMetrics:{documentsAnalyzed:0,claims:0,risks:0}});return{e,report}}

test('notes section lists source-triggered disclosure topics and remains human reviewed',()=>{const {e,report}=base(),next=attachDisclosureSection(report,{rows,engagement:e}),notes=next.sections.find(s=>s.id==='notes');assert.equal(notes.status,'human-required');assert.equal(notes.humanReviewRequired,true);assert.ok(notes.tables[0].rows.some(r=>r[0].includes('المخزون')));assert.ok(notes.tables[0].rows.some(r=>String(r[1]).includes('IAS 2')));assert.match(notes.paragraphs[0],/لا ينشئ KOSIF إيضاحات افتراضية/)});

test('resolved detailed checklist is reflected in notes but does not auto-approve report section',()=>{let {e,report}=base();for(const c of disclosureCandidates({rows,engagement:e,recipeId:'full-financial-statements'}))e=recordDisclosureReview(e,{topicId:c.topicId,status:'not-applicable',actor:'Reviewer',actorType:'human',rationale:'قرار انطباق موثق'}).engagement;const next=attachDisclosureSection(report,{rows,engagement:e}),notes=next.sections.find(s=>s.id==='notes');assert.match(notes.paragraphs[0],/تم حسم/);assert.equal(notes.status,'human-required');assert.notEqual(notes.review?.decision,'approved')});
