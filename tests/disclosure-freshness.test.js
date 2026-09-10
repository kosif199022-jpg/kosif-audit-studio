import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngagement } from '../v5/engagement-machine.js';
import { REPORT_RECIPES } from '../v5/report-recipes.js';
import { buildProfessionalReportModel } from '../v5/report-model.js';
import { attachDisclosureSection } from '../v5/report-disclosures.js';
import { recordDisclosureReview } from '../v5/disclosure-engine.js';
import { reportSourceFingerprint, reportIsStale } from '../v5/report-source.js';

const rows=[{id:'INV-1',category:'مخزون',standards:['IAS 2']}];

test('a disclosure review changes report source fingerprint and makes the previous draft stale',()=>{
  let engagement=createEngagement({id:'ENG-DS',entity:'شركة',engagementType:'preparation'});
  engagement.documents.push({id:'DOC-1',type:'trial-balance',sha256:'abc',version:1,status:'classified'});
  const base=buildProfessionalReportModel({engagement,recipe:REPORT_RECIPES['full-financial-statements'],traceabilityMetrics:{nodes:1,edges:0,isolated:[]},documentMetrics:{documentsAnalyzed:0,claims:0,risks:0}});
  const report=attachDisclosureSection(base,{rows,engagement});
  report.sourceFingerprint=reportSourceFingerprint(engagement);
  assert.equal(reportIsStale(report,engagement),false);
  engagement=recordDisclosureReview(engagement,{topicId:'INVENTORIES',status:'applicable',actor:'Reviewer',actorType:'human',rationale:'يوجد مخزون جوهري بالقوائم',sourceIds:['INV-1']},{at:'2026-09-10T00:00:00Z'}).engagement;
  assert.equal(reportIsStale(report,engagement),true);
});
