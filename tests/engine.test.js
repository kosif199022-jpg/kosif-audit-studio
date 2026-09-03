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
import * as AuditEngine from '../engine.js';

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

test('journal review explains period-end manual and unusual-user flags', () => {
  const review = typeof AuditEngine.analyzeJournalEntries === 'function'
    ? AuditEngine.analyzeJournalEntries([
      { id: 'J-1', date: '2025-12-27', user: 'rare.user', source: 'manual', amount: '100000', description: 'تسوية نهاية الفترة' },
      { id: 'J-2', date: '2025-12-15', user: 'system', source: 'automatic', amount: '1250.25', description: 'قيد مبيعات آلي' },
      { id: 'J-3', date: '2025-12-16', user: 'system', source: 'automatic', amount: '980.10', description: 'قيد مبيعات آلي' }
    ], { periodEnd: '2025-12-31', rareUserMaxEntries: 1 })
    : null;

  assert.ok(review, 'analyzeJournalEntries must exist');
  assert.equal(review.summary.total, 3);
  assert.equal(review.entries[0].id, 'J-1');
  assert.deepEqual(
    review.entries[0].flags.map((flag) => flag.rule),
    ['MANUAL_ENTRY', 'WEEKEND_POSTING', 'PERIOD_END', 'ROUND_AMOUNT', 'SENSITIVE_TEXT', 'RARE_USER']
  );
  assert.equal(review.entries[0].severity, 'critical');
  assert.equal(review.summary.flagged, 1);
});

test('journal review accepts Arabic CSV-shaped headers', () => {
  const review = AuditEngine.analyzeJournalEntries([
    {
      'رقم القيد': 'ق-100',
      'تاريخ القيد': '2025-12-31',
      'المستخدم': 'm.audit',
      'المصدر': 'يدوي',
      'المبلغ': '١٠٬٠٠٠',
      'البيان': 'قيد إقفال'
    }
  ], { periodEnd: '2025-12-31' });

  assert.equal(review.entries[0].id, 'ق-100');
  assert.equal(review.entries[0].amountMinor, 1000000n);
  assert.ok(review.entries[0].flags.some((flag) => flag.rule === 'MANUAL_ENTRY'));
  assert.ok(review.entries[0].flags.some((flag) => flag.rule === 'PERIOD_END'));
});

test('journal review uses the non-zero credit side when debit is zero', () => {
  const review = AuditEngine.analyzeJournalEntries([
    { id: 'J-CREDIT', date: '2025-12-31', user: 'system', source: 'automatic', debit: '0', credit: '10000', description: 'ترحيل' }
  ], { periodEnd: '2025-12-31', rareUserMaxEntries: 0 });

  assert.equal(review.entries[0].amountMinor, 1000000n);
  assert.ok(review.entries[0].flags.some((flag) => flag.rule === 'ROUND_AMOUNT'));
});

test('evidence quality rewards independent traceable reviewed evidence', () => {
  const strong = typeof AuditEngine.scoreEvidenceQuality === 'function'
    ? AuditEngine.scoreEvidenceQuality({
      sourceType: 'external',
      obtainedDirectly: true,
      status: 'reviewed',
      linkedRiskIds: ['R-1'],
      fileHash: 'sha256:abc',
      documentDate: '2025-12-20'
    })
    : null;
  const weak = typeof AuditEngine.scoreEvidenceQuality === 'function'
    ? AuditEngine.scoreEvidenceQuality({ sourceType: 'management', status: 'received' })
    : null;

  assert.ok(strong && weak, 'scoreEvidenceQuality must exist');
  assert.equal(strong.score, 100);
  assert.equal(strong.grade, 'strong');
  assert.ok(weak.score < strong.score);
  assert.ok(weak.gaps.includes('لا توجد بصمة تحقق للمستند.'));
  assert.ok(weak.gaps.includes('الدليل غير مرتبط بخطر مراجعة.'));
});

test('audit event chain detects changed historical payloads', () => {
  const append = AuditEngine.appendAuditEvent;
  const verify = AuditEngine.verifyAuditEventChain;
  const first = typeof append === 'function'
    ? append([], {
      type: 'ENGAGEMENT_CREATED',
      actor: 'Mahmoud',
      timestamp: '2025-12-01T08:00:00.000Z',
      payload: { entity: 'شركة الاختبار' }
    })
    : null;
  const second = first && typeof append === 'function'
    ? append(first, {
      type: 'MATERIALITY_APPROVED',
      actor: 'Mahmoud',
      timestamp: '2025-12-02T08:00:00.000Z',
      payload: { overallMinor: '850000' }
    })
    : null;

  assert.ok(second && typeof verify === 'function', 'audit event chain functions must exist');
  assert.equal(first.length, 1);
  assert.equal(second.length, 2);
  assert.equal(verify(second).valid, true);
  assert.equal(verify([{ ...second[0], payload: { entity: 'قيمة معدلة' } }, second[1]]).valid, false);
});

test('materiality revisions retain immutable history and reviewer rationale', () => {
  const createRevision = AuditEngine.createMaterialityRevision;
  const first = typeof createRevision === 'function'
    ? createRevision([], { overall: 850000n, performance: 595000n, trivial: 42500n }, {
      actor: 'Mahmoud',
      rationale: 'التخطيط الأولي',
      timestamp: '2025-12-01T08:00:00.000Z'
    })
    : null;
  const second = first && typeof createRevision === 'function'
    ? createRevision(first, { overall: 650000n, performance: 455000n, trivial: 32500n }, {
      actor: 'Mahmoud',
      rationale: 'ارتفاع مخاطر الإيراد',
      timestamp: '2025-12-05T08:00:00.000Z'
    })
    : null;

  assert.ok(first && second, 'createMaterialityRevision must exist');
  assert.equal(first.length, 1);
  assert.equal(second.length, 2);
  assert.equal(second[0].overallMinor, '850000');
  assert.equal(second[1].version, 2);
  assert.equal(second[1].rationale, 'ارتفاع مخاطر الإيراد');
});

test('evidence graph links received evidence and reports orphan records', () => {
  const rows = [
    { code: '100', name: 'حساب معلق', debit: 500, credit: 0 },
    { code: '200', name: 'رأس المال', debit: 0, credit: 500 }
  ];
  const risks = detectRisks(rows, 10000n);
  const graph = buildEvidenceGraph({
    rows,
    risks,
    workpapers: [],
    findings: [],
    pbc: [],
    evidence: [
      { id: 'E-1', title: 'كشف مستقل', riskIds: [risks[0].id], status: 'reviewed', score: 90 },
      { id: 'E-2', title: 'مستند غير مربوط', riskIds: [], status: 'received', score: 40 }
    ]
  });

  assert.ok(graph.nodes.some((node) => node.id === 'E-1' && node.type === 'evidence'));
  assert.ok(graph.edges.some((edge) => edge.from === risks[0].id && edge.to === 'E-1' && edge.relation === 'supported_by'));
  assert.equal(graph.metrics.risksWithoutEvidence, risks.length - 1);
  assert.equal(graph.metrics.orphanEvidence, 1);
});
