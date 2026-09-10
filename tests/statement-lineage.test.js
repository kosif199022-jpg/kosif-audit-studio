import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeAdjustment, decideAdjustment } from '../v5/adjustment-ledger.js';
import { buildStatementComparison } from '../v5/statement-comparison.js';
import { buildStatementLineage, statementLineageSummary } from '../v5/statement-lineage.js';

function rows(){return[
  {id:'A-CASH',code:'1100',name:'البنك',category:'نقدية وبنوك',debit:1000n,credit:0n},
  {id:'A-INV',code:'1200',name:'المخزون',category:'مخزون',debit:500n,credit:0n},
  {id:'L-AP',code:'2100',name:'الموردون',category:'موردون والتزامات',debit:0n,credit:600n},
  {id:'E-CAP',code:'3100',name:'رأس المال',category:'حقوق ملكية',debit:0n,credit:400n},
  {id:'R-SALES',code:'4100',name:'المبيعات',category:'إيرادات',debit:0n,credit:700n},
  {id:'X-EXP',code:'5100',name:'المصروفات',category:'مصروفات',debit:200n,credit:0n}
]}
function acceptedAdjustment(){let list=proposeAdjustment([],{id:'AJ-0001',title:'تسوية مخزون',issueId:'ISS-1',evidenceIds:['EVD-1'],councilRoundId:'RND-1',lines:[{accountId:'A-INV',side:'debit',amountMinor:100n},{accountId:'L-AP',side:'credit',amountMinor:100n}]});return decideAdjustment(list,'AJ-0001',{decision:'accepted',actor:'Reviewer',rationale:'supported',decidedAt:'2026-09-10T00:00:00Z'})}

test('statement comparison rows preserve the account IDs that compose each financial line',()=>{const comparison=buildStatementComparison(rows(),acceptedAdjustment()),currentAssets=comparison.rows.find(r=>r.id==='currentAssets'),profit=comparison.rows.find(r=>r.id==='profit');assert.deepEqual(new Set(currentAssets.accountIds),new Set(['A-CASH','A-INV']));assert.deepEqual(new Set(profit.accountIds),new Set(['R-SALES','X-EXP']));assert.deepEqual(currentAssets.adjustmentIds,['AJ-0001'])});

test('current assets lineage reconciles original and adjusted values exactly to underlying accounts',()=>{const lineage=buildStatementLineage(rows(),acceptedAdjustment(),'currentAssets');assert.equal(lineage.line.original,1500n);assert.equal(lineage.line.adjusted,1600n);assert.equal(lineage.line.difference,100n);assert.equal(lineage.checks.originalReconciles,true);assert.equal(lineage.checks.adjustedReconciles,true);assert.equal(lineage.checks.originalSum,1500n);assert.equal(lineage.checks.adjustedSum,1600n);const inventory=lineage.accounts.find(a=>a.id==='A-INV');assert.equal(inventory.originalContribution,500n);assert.equal(inventory.adjustedContribution,600n);assert.equal(inventory.difference,100n);assert.deepEqual(inventory.adjustmentIds,['AJ-0001']);assert.deepEqual(inventory.issueIds,['ISS-1']);assert.deepEqual(inventory.evidenceIds,['EVD-1']);assert.deepEqual(inventory.councilRoundIds,['RND-1'])});

test('profit lineage uses revenue minus expenses rather than summing natural balances',()=>{const lineage=buildStatementLineage(rows(),acceptedAdjustment(),'profit'),sales=lineage.accounts.find(a=>a.id==='R-SALES'),expense=lineage.accounts.find(a=>a.id==='X-EXP');assert.equal(sales.originalContribution,700n);assert.equal(expense.originalContribution,-200n);assert.equal(lineage.checks.originalSum,500n);assert.equal(lineage.line.original,500n);assert.equal(lineage.checks.originalReconciles,true)});

test('proposed and rejected adjustments do not appear as statement lineage effects',()=>{let proposed=proposeAdjustment([],{id:'AJ-0002',title:'مقترح',lines:[{accountId:'A-INV',side:'debit',amountMinor:50n},{accountId:'L-AP',side:'credit',amountMinor:50n}]});const proposedLine=buildStatementLineage(rows(),proposed,'currentAssets');assert.equal(proposedLine.line.difference,0n);assert.equal(proposedLine.adjustments.length,0);proposed=decideAdjustment(proposed,'AJ-0002',{decision:'rejected',actor:'Reviewer',rationale:'not supported'});const rejectedLine=buildStatementLineage(rows(),proposed,'currentAssets');assert.equal(rejectedLine.line.difference,0n);assert.equal(rejectedLine.adjustments.length,0)});

test('statement lineage is read-only and exposes a compact reconciliation summary',()=>{const original=rows(),before=structuredClone(original),lineage=buildStatementLineage(original,acceptedAdjustment(),'totalAssets');assert.deepEqual(original,before);assert.deepEqual(statementLineageSummary(lineage),{lineId:'totalAssets',label:'إجمالي الأصول',accounts:2,changedAccounts:1,adjustments:1,originalReconciles:true,adjustedReconciles:true})});

test('unknown statement line is rejected instead of fabricating lineage',()=>{assert.throws(()=>buildStatementLineage(rows(),acceptedAdjustment(),'cash-flows'),/Unknown statement line/)});
