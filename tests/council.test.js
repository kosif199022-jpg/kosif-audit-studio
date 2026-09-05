import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDemoAccounts, calculateMateriality, validateTrialBalance, detectRisks } from '../engine.js';
import { buildAnalyticsSnapshot, opinionDecisionTree } from '../analytics.js';
import { convene, resolveConflict, SEAT_CONTRACTS } from '../council.js';

const rows = generateDemoAccounts(2000, 11);
const analysis = validateTrialBalance(rows);
const materiality = calculateMateriality({ benchmark: 'revenue', amountMinor: 5000000000n, risk: 'medium' });
const risks = detectRisks(analysis.rows, materiality.overall).map((risk) => ({ ...risk, status: 'open' }));
const analytics = buildAnalyticsSnapshot({ rows, materiality, findings: [] });

test('council seats have explicit contracts and every position carries stance, basis and contract', () => {
  assert.equal(SEAT_CONTRACTS.length, 9);
  const session = convene({ analysis, materiality, risks, analytics, opinion: opinionDecisionTree({ balanced: true, misstatements: analytics.misstatements }) });
  assert.equal(session.positions.length, 9);
  assert.ok(session.positions.every((item) => ['clear', 'caution', 'objection', 'blocked'].includes(item.stance)));
  assert.ok(session.positions.every((item) => item.contract.mayNot.length > 0));
  assert.match(session.authority, /استشاري/);
});

test('an unbalanced trial balance blocks the council', () => {
  const session = convene({ analysis: { ...analysis, balanced: false, imbalance: 100n }, materiality, risks: [], analytics: null });
  assert.equal(session.verdict, 'blocked');
  assert.ok(session.positions.some((item) => item.stance === 'blocked'));
});

test('quality seat objects when an unmodified opinion draft meets open gates, producing a conflict the human must resolve', () => {
  const session = convene({
    analysis, materiality, risks: [], analytics, gates: [{ label: 'x', pass: false }],
    opinion: { code: 'unmodified', label: 'رأي غير معدل' }
  });
  const quality = session.positions.find((item) => item.seatId === 'quality');
  assert.equal(quality.stance, 'objection');
  const conflict = session.conflicts.find((item) => item.seats.includes('quality'));
  assert.ok(conflict);
  const resolved = resolveConflict(session, conflict.id, { reviewer: 'م', decision: 'uphold', note: 'إغلاق البوابات أولًا' });
  assert.equal(resolved.conflicts.find((item) => item.id === conflict.id).resolution.decision, 'uphold');
  assert.equal(session.conflicts.find((item) => item.id === conflict.id).resolution, null);
});

test('consensus is deterministic for the same inputs and timestamp', () => {
  const a = convene({ analysis, materiality, risks, analytics, now: '2026-09-03T00:00:00.000Z' });
  const b = convene({ analysis, materiality, risks, analytics, now: '2026-09-03T00:00:00.000Z' });
  assert.equal(a.id, b.id);
  assert.equal(a.consensus, b.consensus);
  assert.ok(a.consensus >= 0 && a.consensus <= 100);
});

test('status-shaped gates cannot be silently treated as passed', () => {
 const s = convene({ analysis, materiality, gates: [{ status: 'blocked' }, { status: 'attention' }], opinion: { code: 'unmodified', label: 'غير معدل' } });
 assert.equal(s.positions.find(p => p.seatId === 'quality').stance, 'objection');
 assert.match(s.positions.find(p => p.seatId === 'quality').basis.join(' '), /2/);
});
test('missing risk and journal inputs do not yield clear specialist positions', () => {
 const s = convene({ analysis, materiality });
 assert.notEqual(s.positions.find(p => p.seatId === 'isa').stance, 'clear');
 assert.notEqual(s.positions.find(p => p.seatId === 'fraud').stance, 'clear');
});
test('conflict resolution rejects missing identities, arbitrary decisions and unknown IDs', () => {
 const s = { conflicts: [{ id: 'c', resolution: null }] };
 assert.throws(() => resolveConflict(s, 'c', { reviewer: '', decision: 'uphold', note: 'سبب' }));
 assert.throws(() => resolveConflict(s, 'c', { reviewer: 'سارة', decision: 'approve', note: 'سبب' }));
 assert.throws(() => resolveConflict(s, 'missing', { reviewer: 'سارة', decision: 'uphold', note: 'سبب' }));
});
