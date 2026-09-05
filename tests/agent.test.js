import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActionPlan, contextStamp, councilStateStamp, answerAgent, transitionTask, draftMemo } from '../agent.js';

const now = '2026-09-05T09:00:00.000Z';
const ctx = { analysis: { balanced: true, totalDebit: 10000n, totalCredit: 10000n, rows: [{ code: '100', net: 10000n }] }, materiality: { overall: 1000n }, risks: [{ id: 'r1', severity: 'high', status: 'open', title: 'فحص الإيراد', accountName: 'المبيعات', standards: ['IFRS 15'], assertions: ['الحدوث'] }], workpapers: [], evidence: [], pbc: [], findings: [], gates: [{ label: 'الأدلة', pass: false }], engagement: { reviewer: 'سارة' } };

test('no data yields intake actions, never an audit conclusion', () => {
 const p = buildActionPlan({}, { now });
 assert.equal(p.tasks[0].view, 'data');
 assert.equal(p.tasks.some(t => t.type === 'risk'), false);
 assert.match(answerAgent('هل أعتمد التقرير', {}).text, /بشري|لا يستطيع/);
});
test('plans are deterministic, source linked and JSON safe', () => {
 const a = buildActionPlan(ctx, { now }); const b = buildActionPlan(ctx, { now });
 assert.deepEqual(a, b);
 assert.ok(a.tasks.some(t => t.riskId === 'r1' && t.referenceIds.includes('socpa-audit')));
 assert.doesNotThrow(() => JSON.stringify(a));
 assert.equal(ctx.risks[0].status, 'open');
});
test('source stamp changes when a same-total account, evidence or materiality changes', () => {
 assert.notEqual(contextStamp(ctx), contextStamp({ ...ctx, analysis: { ...ctx.analysis, rows: [{ code: '200', net: 10000n }] } }));
 assert.notEqual(contextStamp(ctx), contextStamp({ ...ctx, evidence: [{ id: 'e1', status: 'reviewed', hash: 'abc' }] }));
 assert.notEqual(contextStamp(ctx), contextStamp({ ...ctx, materiality: { overall: 1001n } }));
});
test('task completion requires rationale, actor and valid transitions; does not mutate original', () => {
 const t = buildActionPlan(ctx, { now }).tasks[0];
 assert.throws(() => transitionTask(t, 'done', { actor: 'سارة' }), /مبرر/);
 assert.throws(() => transitionTask(t, 'done', { note: 'تم فحص المصدر' }), /المراجع/);
 assert.throws(() => transitionTask(t, 'approved', { actor: 'سارة' }), /حالة/);
 const next = transitionTask(t, 'done', { actor: 'سارة', note: 'تم فحص المصدر', now });
 assert.equal(next.status, 'done'); assert.equal(t.status, 'queued');
 assert.equal(ctx.risks[0].status, 'open');
});
test('assistant answers are grounded and unknown prompts do not fabricate', () => {
 const reply = answerAgent('أعلى المخاطر', ctx);
 assert.match(reply.text, /فحص الإيراد/);
 assert.ok(reply.references.length > 0);
 assert.equal(answerAgent('ما سعر سهم مجهول غداً', ctx).intent, 'unknown');
});
test('memo explicitly distinguishes unknown evidence and a human conclusion', () => {
 const m = draftMemo(ctx, 'r1');
 assert.match(m, /مسودة/); assert.match(m, /فحص الإيراد/); assert.match(m, /لم تسجل/); assert.match(m, /الاستنتاج البشري/);
});
test('natural reference questions resolve the named standard and do not invent an unknown one', () => {
 assert.ok(answerAgent('ما هو IFRS 18؟',ctx).references.some(r=>r.id==='ifrs18'));
 assert.ok(answerAgent('ما متطلبات معيار المنشآت الصغيرة والمتوسطة؟',ctx).references.some(r=>r.id==='smes2025'));
 assert.equal(answerAgent('اشرح ISA 999',ctx).references.length,0);
});
test('council answer provenance changes after a new session or a conflict decision', () => {
 const session = { id:'c', conflicts:[{id:'c1',resolution:null}] };
 assert.notEqual(councilStateStamp(null),councilStateStamp(session));
 assert.notEqual(councilStateStamp(session),councilStateStamp({...session,conflicts:[{id:'c1',resolution:{decision:'uphold'}}]}));
 assert.equal(answerAgent('ما حالة المجلس',ctx).councilStamp,councilStateStamp(undefined));
});
