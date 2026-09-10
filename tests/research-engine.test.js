import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planAuditSample,
  projectSampleMisstatement,
  identifyKamCandidates,
  scopeGroupAuditComponents,
  evaluateControlRemediation
} from '../research-engine.js';

const rows = [
  { id: 'A', code: '100', name: 'رصيد جوهري', net: 200000n },
  { id: 'B', code: '200', name: 'بند ب', net: 90000n },
  { id: 'C', code: '300', name: 'بند ج', net: 80000n },
  { id: 'D', code: '400', name: 'بند د', net: 70000n },
  { id: 'E', code: '500', name: 'بند هـ', net: 60000n },
  { id: 'F', code: '600', name: 'بند و', net: 50000n }
];

test('sample plan puts individually significant items in 100% certainty stratum', () => {
  const plan = planAuditSample(rows, {
    performanceMaterialityMinor: 100000n,
    risk: 'medium',
    controls: 'moderate',
    method: 'risk',
    maxResidualSample: 10
  });
  assert.deepEqual(plan.certaintyRows.map((row) => row.id), ['A']);
  assert.ok(plan.selectedRows.some((row) => row.id === 'A'));
  assert.equal(plan.humanApprovalRequired, true);
});

test('higher risk and weaker controls increase residual audit extent', () => {
  const low = planAuditSample(rows, {
    performanceMaterialityMinor: 100000n,
    risk: 'low',
    controls: 'strong',
    aggregationRisk: 'low',
    method: 'risk',
    maxResidualSample: 10
  });
  const high = planAuditSample(rows, {
    performanceMaterialityMinor: 100000n,
    risk: 'high',
    controls: 'weak',
    aggregationRisk: 'high',
    method: 'risk',
    maxResidualSample: 10
  });
  assert.ok(high.metrics.targetResidualCoveragePct > low.metrics.targetResidualCoveragePct);
  assert.ok(high.metrics.residualSampleCount >= low.metrics.residualSampleCount);
  assert.ok(high.metrics.residualSampleValueMinor >= low.metrics.residualSampleValueMinor);
});

test('sampling selection is deterministic for the same seed and inputs', () => {
  const first = planAuditSample(rows, {
    performanceMaterialityMinor: 100000n,
    risk: 'high',
    controls: 'moderate',
    method: 'random',
    seed: 77,
    maxResidualSample: 4
  });
  const second = planAuditSample(rows, {
    performanceMaterialityMinor: 100000n,
    risk: 'high',
    controls: 'moderate',
    method: 'random',
    seed: 77,
    maxResidualSample: 4
  });
  assert.deepEqual(first.selectedRows.map((row) => row.id), second.selectedRows.map((row) => row.id));
  assert.equal(first.id, second.id);
});

test('projection keeps certainty errors known and projects residual errors by ratio', () => {
  const plan = {
    selectedRows: [
      { id: 'CERT', net: 1000n },
      { id: 'S1', net: 1000n }
    ],
    certaintyRows: [{ id: 'CERT', net: 1000n }],
    metrics: { residualPopulationValueMinor: 4000n },
    parameters: { overallMaterialityMinor: 250n, performanceMaterialityMinor: 200n }
  };
  const projection = projectSampleMisstatement(plan, [
    { rowId: 'CERT', bookAmountMinor: 1000n, auditedAmountMinor: 900n },
    { rowId: 'S1', bookAmountMinor: 1000n, auditedAmountMinor: 950n }
  ]);
  assert.equal(projection.knownCertaintyNetMinor, 100n);
  assert.equal(projection.projectedResidualNetMinor, 200n);
  assert.equal(projection.totalProjectedNetMinor, 300n);
  assert.equal(projection.status, 'escalate');
});

test('KAM screen prioritizes significant revenue/estimate matters but keeps final determination human', () => {
  const candidates = identifyKamCandidates({
    materialityMinor: 100000n,
    risks: [
      {
        id: 'R-REV', title: 'الاعتراف بالإيراد', severity: 'high', score: 72,
        amount: 300000n, category: 'عقود وإيرادات', standards: ['IFRS 15', 'ISA 240'],
        rationale: 'عقود معقدة وتقديرات متغيرة', procedure: 'اختبار العقود والقطع', evidence: 'عقود وفواتير'
      },
      {
        id: 'R-LOW', title: 'مصروف تشغيلي', severity: 'low', score: 25,
        amount: 10000n, category: 'مصروفات', standards: ['IAS 1']
      }
    ],
    workpapers: [{ id: 'WP-1', riskIds: ['R-REV'], highJudgment: true, specialistRequired: true }],
    findings: [{ id: 'F-1', riskId: 'R-REV', severity: 'high', status: 'open' }]
  });
  assert.equal(candidates[0].riskId, 'R-REV');
  assert.ok(candidates[0].significanceScore >= 90);
  assert.equal(candidates[0].finalDeterminationRequired, true);
  assert.equal(candidates.some((item) => item.riskId === 'R-LOW'), false);
});

test('group audit scoping separates full scope, specific line items and targeted risk assessment', () => {
  const result = scopeGroupAuditComponents([
    { id: 'A', name: 'Component A', revenueMinor: 500n, assetsMinor: 500n, riskScore: 55 },
    { id: 'B', name: 'Component B', revenueMinor: 100n, assetsMinor: 100n, riskScore: 65 },
    { id: 'C', name: 'Component C', revenueMinor: 10n, assetsMinor: 10n, riskScore: 20 },
    { id: 'D', name: 'Component D', revenueMinor: 390n, assetsMinor: 390n, riskScore: 40 }
  ]);
  const byId = new Map(result.components.map((component) => [component.id, component]));
  assert.equal(byId.get('A').scope, 'full_scope');
  assert.equal(byId.get('B').scope, 'specific_line_items');
  assert.equal(byId.get('C').scope, 'targeted_risk_assessment');
  assert.equal(byId.get('D').scope, 'full_scope');
  assert.ok(result.metrics.revenueCoveragePct > 90);
  assert.equal(result.humanApprovalRequired, true);
});

test('control remediation requires design, implementation, operating effectiveness and sustainability evidence', () => {
  const evaluation = evaluateControlRemediation([
    { id: 'C1', deficiencySeverity: 'material weakness', designEffective: true, implemented: true, operatingEffective: true, sustainabilityEvidencePeriods: 1 },
    { id: 'C2', deficiencySeverity: 'significant deficiency', designEffective: true, implemented: true, operatingEffective: true, sustainabilityEvidencePeriods: 2 },
    { id: 'C3', deficiencySeverity: 'deficiency', designEffective: false, implemented: false, operatingEffective: false, sustainabilityEvidencePeriods: 0 }
  ], { minimumSustainabilityPeriods: 2 });
  const byId = new Map(evaluation.controls.map((control) => [control.id, control]));
  assert.equal(byId.get('C1').status, 'sustainability_monitoring');
  assert.equal(byId.get('C2').status, 'remediated');
  assert.equal(byId.get('C3').status, 'design_gap');
  assert.equal(evaluation.summary.openMaterialWeaknesses, 1);
});
