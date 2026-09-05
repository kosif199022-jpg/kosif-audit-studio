import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDemoAccounts, calculateMateriality } from '../engine.js';
import {
  buildFinancialStatements, computeRatios, benfordAnalysis, aggregateMisstatements,
  opinionDecisionTree, goingConcernIndicators, saudiCompliancePack, buildAnalyticsSnapshot
} from '../analytics.js';

const rows = generateDemoAccounts(5000);
const materiality = calculateMateriality({ benchmark: 'revenue', amountMinor: 5000000000n, risk: 'medium' });

test('financial statements are built from the classified trial balance and satisfy the accounting equation', () => {
  const statements = buildFinancialStatements(rows);
  assert.equal(statements.checks.trialBalanceBalanced, true);
  assert.equal(statements.checks.equationHolds, true);
  assert.equal(typeof statements.sfp.totalAssets, 'bigint');
  assert.ok(statements.sfp.currentAssets.lines.length > 0);
  assert.ok(statements.pl.revenue.total > 0n);
});

test('statements are deterministic for the same seed', () => {
  const a = buildFinancialStatements(generateDemoAccounts(500, 7));
  const b = buildFinancialStatements(generateDemoAccounts(500, 7));
  assert.equal(a.sfp.totalAssets, b.sfp.totalAssets);
  assert.equal(a.pl.profit, b.pl.profit);
});

test('ratios expose formula, status and guard against division by zero', () => {
  const ratios = computeRatios(buildFinancialStatements(rows));
  assert.ok(ratios.every((item) => item.formula && item.status));
  const empty = computeRatios(buildFinancialStatements([{ code: '1100', name: 'نقدية', debit: '100', credit: '0' }, { code: '3100', name: 'رأس المال', debit: '0', credit: '100' }]));
  assert.equal(empty.find((item) => item.id === 'netMargin').value, null);
});

test('benford analysis reads Arabic-Indic amounts and flags insufficient samples', () => {
  const small = benfordAnalysis(['١٢٣٤', '٢٣٤', 999]);
  assert.equal(small.total, 3);
  assert.equal(small.conformity, 'insufficient');
  assert.equal(small.digits[0].count, 1);
  const conforming = benfordAnalysis(Array.from({ length: 900 }, (_, index) => BigInt(Math.floor(10 ** (1 + (index % 900) / 300))) * 100n));
  assert.ok(conforming.total >= 100);
  assert.ok(conforming.digits.reduce((sum, item) => sum + item.count, 0) === conforming.total);
});

test('ISA 450 aggregation separates corrected, uncorrected, pending and trivial buckets', () => {
  const findings = [
    { id: 'a', title: 'A', severity: 'high', status: 'adjusted', amountMinor: '100000000' },
    { id: 'b', title: 'B', severity: 'high', status: 'passed', amountMinor: '300000000' },
    { id: 'c', title: 'C', severity: 'low', status: 'open', amountMinor: '100' },
    { id: 'd', title: 'D', severity: 'medium', status: 'open', amountMinor: '50000000' }
  ];
  const result = aggregateMisstatements(findings, materiality);
  assert.equal(result.corrected, 100000000n);
  assert.equal(result.uncorrected, 300000000n);
  assert.equal(result.trivial, 100n);
  assert.equal(result.pending, 50000000n);
  assert.equal(result.exposure, 350000000n);
  assert.ok(['material', 'approaching', 'below'].includes(result.verdict));
});

test('opinion decision tree is deterministic and always requires a human', () => {
  const below = { verdict: 'below' };
  const material = { verdict: 'material' };
  assert.equal(opinionDecisionTree({ balanced: false }).code, 'blocked');
  assert.equal(opinionDecisionTree({ balanced: true, misstatements: below }).code, 'unmodified');
  assert.equal(opinionDecisionTree({ balanced: true, misstatements: material }).code, 'qualified');
  assert.equal(opinionDecisionTree({ balanced: true, misstatements: material, pervasiveMisstatement: true }).code, 'adverse');
  assert.equal(opinionDecisionTree({ balanced: true, misstatements: below, scopeLimitation: 'pervasive' }).code, 'disclaimer');
  assert.equal(opinionDecisionTree({ balanced: true, misstatements: below, goingConcern: 'inadequate-disclosure' }).code, 'adverse');
  const emphasis = opinionDecisionTree({ balanced: true, misstatements: below, goingConcern: 'adequate-disclosure' });
  assert.equal(emphasis.code, 'unmodified');
  assert.match(emphasis.emphasis, /ISA 570/);
  assert.ok([below, material].every(() => opinionDecisionTree({ balanced: true }).requiresHuman));
});

test('going concern indicators and Saudi pack derive from statements only', () => {
  const statements = buildFinancialStatements(rows);
  const indicators = goingConcernIndicators(statements, computeRatios(statements));
  assert.equal(indicators.length, 5);
  assert.ok(indicators.every((item) => typeof item.hit === 'boolean'));
  const pack = saudiCompliancePack(statements, buildFinancialStatements(rows) && rows.map((row, index) => ({ ...row, net: 0n, name: row.name, code: row.code })));
  assert.equal(typeof pack.zakat.estimate, 'bigint');
  assert.equal(pack.vat.status, 'no-account');
});

test('analytics snapshot returns null without rows', () => {
  assert.equal(buildAnalyticsSnapshot({ rows: [] }), null);
  const snapshot = buildAnalyticsSnapshot({ rows, materiality, findings: [] });
  assert.equal(snapshot.misstatements.exposure, 0n);
  assert.equal(snapshot.benfordBalances.total, 5000);
});

test('missing materiality assessment blocks opinion generation', () => {
 assert.equal(opinionDecisionTree({ balanced: true }).code, 'blocked');
 assert.equal(opinionDecisionTree({ balanced: true, misstatements: { verdict: 'no-materiality' } }).code, 'blocked');
});
