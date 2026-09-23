import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assistantSnapshot, routeAssistantQuery, ASSISTANT_QUICK_ASKS, ASSISTANT_CAPABILITIES, ASSISTANT_VIEW_WORDS } from '../v5/continuous-assistant.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const engagement = {
  entity: 'شركة الاختبار', period: '2026-12-31', stage: 'AWAITING_EVIDENCE',
  documents: [{ id: 'DOC-1', type: 'trial-balance' }],
  evidence: [{ id: 'EVD-1', reviewStatus: 'reviewed' }, { id: 'EVD-2', reviewStatus: 'received' }],
  requests: [{ id: 'REQ-1', title: 'مصادقة بنك مستقلة', status: 'requested', priority: 'critical' }, { id: 'REQ-2', title: 'محضر جرد', status: 'satisfied', priority: 'normal' }],
  issues: [{ id: 'ISS-1', title: 'فرق مخزون غير مؤيد', severity: 'high', status: 'open' }, { id: 'ISS-2', title: 'قضية محسومة', severity: 'critical', status: 'resolved' }],
  councilRounds: [{ id: 'RND-1', number: 2, verdict: 'needs-evidence' }],
  adjustments: [{ id: 'AJ-1', status: 'proposed' }, { id: 'AJ-2', status: 'accepted' }],
  reports: [{ id: 'RPT-001', version: 2, status: 'draft', title: 'قوائم مالية' }]
};
const snapshot = assistantSnapshot({ engagement, analysis: { rows: [{ id: 'ACC-1' }, { id: 'ACC-2' }], balanced: true }, materiality: { benchmark: 'assets', overall: 1000000n, performance: 750000n } });
const empty = assistantSnapshot({ engagement: { entity: 'ملف فارغ' }, analysis: null, materiality: null });
const readySnapshot = assistantSnapshot({ engagement: { entity: 'ملف مكتمل', documents: [{ id: 'DOC-1', type: 'trial-balance', status: 'classified' }], requests: [], issues: [], adjustments: [], councilRounds: [{ id: 'RND-1', number: 1, status: 'completed' }], reports: [] }, analysis: { rows: [{ id: 'ACC-1' }], balanced: true }, materiality: null });

test('assistant snapshot reads only open audit objects from engagement state', () => {
  assert.equal(snapshot.requests.open, 1);
  assert.equal(snapshot.requests.critical, 1);
  assert.equal(snapshot.issues.open, 1);
  assert.equal(snapshot.issues.high, 1);
  assert.equal(snapshot.evidence.count, 2);
  assert.equal(snapshot.evidence.reviewed, 1);
  assert.equal(snapshot.council.rounds, 1);
  assert.equal(snapshot.council.latestRound, 2);
  assert.equal(snapshot.adjustments.pending, 1);
  assert.equal(snapshot.adjustments.accepted, 1);
  assert.deepEqual(snapshot.documents.types, ['trial-balance']);
  assert.equal(snapshot.report.status, 'draft');
  assert.equal(snapshot.analysis.balanced, true);
});

test('assistant answers carry the numbers of the file and the state path they came from', () => {
  const next = routeAssistantQuery('ما الخطوة التالية؟', snapshot);
  assert.equal(next.intent, 'next');
  assert.match(next.reply, /المفتوح الآن: 1 طلب دليل و1 قضية/);
  assert.match(next.reply, /جاهزية التقرير \d+%/);
  assert.ok(next.cite.length > 0);

  const requests = routeAssistantQuery('كم طلب دليل مفتوح؟', snapshot);
  assert.match(requests.reply, /1 طلب مفتوح/);
  assert.match(requests.reply, /مصادقة بنك مستقلة/);
  assert.equal(requests.view, 'documents');

  const issues = routeAssistantQuery('ما القضايا المفتوحة؟', snapshot);
  assert.match(issues.reply, /فرق مخزون غير مؤيد/);
  assert.match(issues.reply, /عالية/);
  assert.doesNotMatch(issues.reply, /قضية محسومة/, 'closed issues must never be reported as open');
  assert.equal(issues.view, 'issues');

  const report = routeAssistantQuery('ما حالة التقرير؟', snapshot);
  assert.match(report.reply, /RPT-001/);
  assert.match(report.reply, /draft/);
  assert.equal(report.view, 'report');

  const materiality = routeAssistantQuery('ما الأهمية النسبية؟', snapshot);
  assert.match(materiality.reply, /الأهمية النسبية الإجمالية/);
  assert.match(materiality.reply, /assets/);
});

test('assistant never fabricates an answer when the engagement is empty', () => {
  const balance = routeAssistantQuery('هل الميزان متزن؟', empty);
  assert.equal(balance.intent, 'analysis');
  assert.match(balance.reply, /لا يوجد ميزان مراجعة محمّل/);
  const readiness = routeAssistantQuery('ما الجاهزية؟', empty);
  assert.match(readiness.reply, /جاهزية التقرير \d+% · لا طلبات مفتوحة · لا قضايا مفتوحة/);
  assert.match(readiness.reply, /البوابات ما زالت مفتوحة/);
  const issues = routeAssistantQuery('كم قضية مفتوحة؟', empty);
  assert.match(issues.reply, /لم تُسجّل قضايا بعد|لا توجد قضايا مفتوحة/);
  const unknown = routeAssistantQuery('ما رأيك في الطقس اليوم؟', empty);
  assert.equal(unknown.intent, 'unknown');
  assert.match(unknown.reply, /لن أخمّن/);
  assert.equal(unknown.action, null);
  assert.equal(unknown.view, null);
});

test('assistant navigation and actions stay inside the audited workspaces', () => {
  assert.deepEqual(Object.keys(ASSISTANT_VIEW_WORDS).sort(), ['council', 'documents', 'financials', 'issues', 'overview', 'report']);
  assert.equal(routeAssistantQuery('افتح المجلس', snapshot).view, 'council');
  assert.equal(routeAssistantQuery('انتقل إلى القوائم المالية', snapshot).view, 'financials');
  assert.equal(routeAssistantQuery('المستندات', snapshot).view, 'documents');
  assert.equal(routeAssistantQuery('اعقد جولة جديدة', snapshot).action, 'convene');
  assert.equal(routeAssistantQuery('حمل النموذج التجريبي', snapshot).action, 'demo');
  const blockedDraft = routeAssistantQuery('ابن مسودة التقرير', snapshot);
  assert.equal(blockedDraft.action, null, 'a draft must not be built while gates are open');
  assert.match(blockedDraft.reply, /لا أبني مسودة قبل استيفاء البوابات/);
  assert.equal(routeAssistantQuery('ابن مسودة التقرير', readySnapshot).action, 'draft');
  assert.equal(routeAssistantQuery('اعقد جولة جديدة', empty).action, 'convene');
  assert.equal(routeAssistantQuery('ما الذي ينقص؟', snapshot).intent, 'blockers');
  assert.ok(ASSISTANT_QUICK_ASKS.length >= 4);
  assert.ok(ASSISTANT_CAPABILITIES.every(item => item.length > 10));
});

test('assistant is mounted in the V5 shell with voice fallback that never blocks typing', () => {
  const shell = read('index.html');
  for (const id of ['kosifAssistant', 'assistantToggle', 'assistantPanel', 'assistantLog', 'assistantChips', 'assistantForm', 'assistantInput', 'assistantMic', 'assistantSpeak', 'assistantClose', 'assistantStateBadge']) assert.match(shell, new RegExp(`id="${id}"`));
  assert.match(shell, /href="\.\/kosif-assistant\.css"/);
  const module = read('v5/continuous-assistant.js');
  assert.match(module, /SpeechRecognition/, 'live listening must be feature detected');
  assert.match(module, /speechSynthesis/, 'spoken answers must be feature detected');
  assert.doesNotMatch(module, /OPENAI|api\.openai|fetch\(/, 'the assistant stays local and deterministic');
  assert.match(read('v5/dashboard-suite.js'), /initAssistant/);
});
