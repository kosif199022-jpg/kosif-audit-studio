import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMoonSnapshot, parseStoredState, SOCPA_2025_WATCH } from '../moon-core.js';

test('parseStoredState rejects malformed data', () => {
  assert.equal(parseStoredState('{bad'), null);
  assert.equal(parseStoredState('null'), null);
});

test('snapshot never grants AI approval authority', () => {
  const snapshot = buildMoonSnapshot({ version: 1, rawRows: [{ a: 1 }], approval: { reviewer: 'A' } });
  assert.equal(snapshot.authority.aiCanApproveOpinion, false);
  assert.equal(snapshot.authority.aiCanLockArchive, false);
  assert.equal(snapshot.authority.humanApprovalRequired, true);
});

test('snapshot blocks archive until human approval and an intact event chain exist', () => {
  const snapshot = buildMoonSnapshot({ version: 1 });
  const archive = snapshot.gates.find((item) => item.id === 'archive');
  assert.equal(archive.status, 'blocked');
  assert.match(archive.detail, /اعتماد بشري/);
});

test('snapshot includes journal and evidence-register gates', () => {
  const snapshot = buildMoonSnapshot({
    version: 1,
    rawRows: [{ a: 1 }],
    journalReview: { summary: { total: 10, flagged: 2, reviewed: 1 } },
    evidence: [{ id: 'E-1', status: 'reviewed', riskIds: ['R-1'] }]
  });
  assert.equal(snapshot.gates.find((item) => item.id === 'journal')?.status, 'attention');
  assert.equal(snapshot.gates.find((item) => item.id === 'evidence-register')?.status, 'ready');
});

test('snapshot risk gate follows unresolved high-risk count', () => {
  const blocked = buildMoonSnapshot({
    version: 2,
    rawRows: [{ a: 1 }],
    riskDecisions: { R1: { status: 'addressed' } },
    riskSummary: { total: 3, highOpen: 1 }
  });
  const ready = buildMoonSnapshot({
    version: 2,
    rawRows: [{ a: 1 }],
    riskDecisions: { R1: { status: 'addressed' }, R2: { status: 'accepted' } },
    riskSummary: { total: 3, highOpen: 0 }
  });
  assert.equal(blocked.gates.find((item) => item.id === 'risk-response')?.status, 'attention');
  assert.equal(ready.gates.find((item) => item.id === 'risk-response')?.status, 'ready');
});

test('trace health increases when lineage metadata exists', () => {
  const poor = buildMoonSnapshot({ version: 1, rawRows: [{ a: 1 }], workpapers: [{ id: 'w1' }] });
  const rich = buildMoonSnapshot({
    version: 1,
    sourceName: 'tb.csv',
    rawRows: [{ a: 1 }],
    workpapers: [{ id: 'w1', riskIds: ['r1'], status: 'completed' }],
    findings: [{ id: 'f1', riskId: 'r1', status: 'closed' }],
    pbc: [{ id: 'p1', riskIds: ['r1'], status: 'reviewed' }],
    councilRuns: [{ id: 'c1' }],
    approval: { reviewer: 'A' }
  });
  assert.ok(rich.metrics.traceHealth > poor.metrics.traceHealth);
});

test('SOCPA 2025 watch includes IFRS 18 and IFRS 19', () => {
  assert.ok(SOCPA_2025_WATCH.some((item) => item.code === 'IFRS 18'));
  assert.ok(SOCPA_2025_WATCH.some((item) => item.code === 'IFRS 19'));
});
