import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeAdjustment, decideAdjustment } from '../v5/adjustment-ledger.js';
import { buildStatementComparison, comparisonModeRows } from '../v5/statement-comparison.js';

function tb(){return[{id:'A1',code:'1000',name:'البنك',category:'نقدية وبنوك',debit:100000n,credit:0n},{id:'E1',code:'3000',name:'رأس المال',category:'حقوق ملكية',debit:0n,credit:100000n}]}
function acceptedAdjustment(){let a=proposeAdjustment([],{id:'AJ-1',title:'زيادة رأس المال',type:'CORRECTION',rationale:'مستند دعم',lines:[{accountId:'A1',code:'1000',accountName:'البنك',side:'debit',amountMinor:1000n},{accountId:'E1',code:'3000',accountName:'رأس المال',side:'credit',amountMinor:1000n}]});return decideAdjustment(a,'AJ-1',{decision:'accepted',actor:'Reviewer',rationale:'تمت مراجعة المستند'})}

test('statement comparison preserves original rows and applies accepted adjustments only',()=>{const original=tb(),snapshot=structuredClone(original),c=buildStatementComparison(original,acceptedAdjustment());assert.deepEqual(original,snapshot);assert.equal(c.originalStatements.sfp.totalAssets,100000n);assert.equal(c.adjustedStatements.sfp.totalAssets,101000n);assert.equal(c.rows.find(r=>r.id==='totalAssets').difference,1000n);assert.deepEqual(c.rows.find(r=>r.id==='totalAssets').adjustmentIds,['AJ-1']);assert.equal(c.adjustedTB.balanced,true)});

test('proposed and rejected adjustments do not alter adjusted statement values',()=>{let proposed=proposeAdjustment([],{id:'AJ-1',title:'x',rationale:'x',lines:[{accountId:'A1',side:'debit',amountMinor:1000n},{accountId:'E1',side:'credit',amountMinor:1000n}]});let c=buildStatementComparison(tb(),proposed);assert.equal(c.changedRows.length,0);const rejected=decideAdjustment(proposed,'AJ-1',{decision:'rejected',actor:'Reviewer',rationale:'غير مدعوم'});c=buildStatementComparison(tb(),rejected);assert.equal(c.changedRows.length,0);assert.deepEqual(c.acceptedAdjustmentIds,[])});

test('comparison modes expose original adjusted and difference without recalculation by UI',()=>{const c=buildStatementComparison(tb(),acceptedAdjustment()),o=comparisonModeRows(c,'original').find(r=>r.id==='equity'),a=comparisonModeRows(c,'adjusted').find(r=>r.id==='equity'),d=comparisonModeRows(c,'difference').find(r=>r.id==='equity');assert.equal(o.value,100000n);assert.equal(a.value,101000n);assert.equal(d.value,1000n)});
