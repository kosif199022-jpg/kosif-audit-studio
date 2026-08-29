import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMoneyMinor,
  validateTrialBalance,
  calculateMateriality,
  generateDemoAccounts,
  detectRisks,
  selectAuditSample,
  parseCsv,
  buildEvidenceGraph
} from '../engine.js';

test('Arabic and Western money parsing uses minor units', () => {
  assert.equal(parseMoneyMinor('١٬٢٣٤٫٥٦'), 123456n);
  assert.equal(parseMoneyMinor('(1,234.50)'), -123450n);
  assert.equal(parseMoneyMinor('500'), 50000n);
});

test('generated 5000-account demo is exactly balanced', () => {
  const demo = generateDemoAccounts(5000, 380019);
  const analysis = validateTrialBalance(demo);
  assert.equal(demo.length, 5000);
  assert.equal(analysis.balanced, true);
  assert.equal(analysis.imbalance, 0n);
});

test('materiality is deterministic and risk-sensitive', () => {
  const medium = calculateMateriality({ benchmark: 'revenue', amountMinor: 100000000n, risk: 'medium' });
  const high = calculateMateriality({ benchmark: 'revenue', amountMinor: 100000000n, risk: 'high' });
  assert.equal(medium.overall, 850000n);
  assert.equal(high.overall, 650000n);
  assert.ok(high.overall < medium.overall);
});

test('risk engine detects suspense and related-party accounts', () => {
  const rows = [
    { code: '111', name: 'حساب معلق', debit: 200000, credit: 0 },
    { code: '211', name: 'طرف ذو علاقة', debit: 0, credit: 200000 }
  ];
  const risks = detectRisks(rows, 10000000n);
  assert.ok(risks.some((risk) => risk.rule === 'SUSPENSE'));
  assert.ok(risks.some((risk) => risk.rule === 'RELATED-PARTY'));
});

test('sampling is repeatable for a fixed seed', () => {
  const rows = generateDemoAccounts(100, 7);
  const first = selectAuditSample(rows, { method: 'random', size: 10, seed: 99 }).map((row) => row.id);
  const second = selectAuditSample(rows, { method: 'random', size: 10, seed: 99 }).map((row) => row.id);
  assert.deepEqual(first, second);
});

test('CSV parser supports Arabic headers', () => {
  const rows = parseCsv('كود الحساب,اسم الحساب,مدين,دائن\n100,الصندوق,500,0\n200,رأس المال,0,500');
  const analysis = validateTrialBalance(rows);
  assert.equal(rows.length, 2);
  assert.equal(analysis.balanced, true);
});

test('evidence graph exposes uncovered risks', () => {
  const rows = [{ code: '100', name: 'حساب معلق', debit: 500, credit: 0 }, { code: '200', name: 'رأس المال', debit: 0, credit: 500 }];
  const risks = detectRisks(rows, 10000n);
  const graph = buildEvidenceGraph({ rows, risks, workpapers: [], findings: [], pbc: [] });
  assert.equal(graph.metrics.risksWithoutProcedure, risks.length);
  assert.ok(graph.nodes.length >= rows.length + risks.length);
});
