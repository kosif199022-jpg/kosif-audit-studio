import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreEvidenceQuality, isReviewedEvidence, buildEvidenceGraph } from '../engine.js';
const e={id:'e',sourceType:'external',obtainedDirectly:true,fileHash:'a'.repeat(64),riskIds:['r'],status:'reviewed',documentDate:'2026-08-31'};
test('evidence dates must be valid and cannot be future dated against explicit review date',()=>{
 const score = date=>scoreEvidenceQuality({...e,documentDate:date,asOf:'2026-09-05'});
 assert.equal(score(e.documentDate).dateValid,true);
 assert.equal(score('2026-02-30').dateValid,false);
 assert.equal(score('2030-01-01').dateValid,false);
 assert.equal(score('nonsense').score,90);
});
test('reviewed evidence requires reviewed status, traceability and valid date; a link alone is insufficient',()=>{
 assert.equal(isReviewedEvidence({...e,asOf:'2026-09-05'}),true);
 assert.equal(isReviewedEvidence({...e,status:'received'}),false);
 assert.equal(isReviewedEvidence({...e,fileHash:''}),false);
 const g=buildEvidenceGraph({risks:[{id:'r',title:'Risk'}],evidence:[{...e,status:'received'}]});
 assert.equal(g.metrics.risksWithoutReviewedEvidence,1);
 const reviewed=buildEvidenceGraph({risks:[{id:'r',title:'Risk'}],evidence:[e]});
 assert.equal(reviewed.metrics.risksWithoutReviewedEvidence,0);
});
