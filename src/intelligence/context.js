import { contextStamp } from './agent.js';

export const VIEW_MAP = { data: 'data-intake', planning: 'settings', risks: 'risk', journal: 'integrity', pbc: 'reviewer-workspace', references: 'intelligence', workflow: 'intelligence' };
export function createAgentContext(accounts, engagement, metrics, reportState) {
 const risks = (engagement.findings || []).map(f => ({ ...f, title: f.title || f.description || f.id, status: f.status === 'closed' ? 'closed' : 'open', standards: f.standardIds || [] }));
 const evidence = (engagement.evidence || []).map(e => ({ ...e, riskIds: e.findingIds || [], fileHash: e.hash,
  reviewRecorded: e.status === 'approved' && /^[a-f0-9]{64}$/i.test(e.hash || '') && !!e.reviewedBy && !!e.conclusion && Number.isFinite(Date.parse(e.reviewedAt)) && Date.parse(e.reviewedAt) >= Date.parse(e.attachedAt) && !!e.verifiedAt,
 }));
 const c = {
  analysis: accounts.length ? { rows: accounts.map(a => ({ id: a.id, code: a.code, debitMinor: a.debitMinor, creditMinor: a.creditMinor })), balanced: metrics.isBalanced } : null,
  engagement: { entity: engagement.entity?.name, period: engagement.entity?.period, reviewer: engagement.acceptance?.approvedBy || '', datasetDigest: metrics.datasetDigest, governance: { acceptance: engagement.acceptance, mappings: engagement.standardMappings, report: engagement.report, locks: engagement.periodLocks, analyticsReview: engagement.analyticsReview, adjustments: engagement.adjustments } },
  materiality: { overall: BigInt(metrics.materialityMinor || 0), performance: BigInt(metrics.performanceMaterialityMinor || 0) },
  risks, evidence, findings: risks,
  workpapers: (engagement.rounds || []).map(r => ({ ...r, riskIds: r.findingIds || [] })),
  pbc: [...(engagement.evidence || []), ...(engagement.manualPbcRequests || [])].map(p => ({ ...p, status: p.status === 'approved' ? 'reviewed' : p.status })),
  gates: reportState.gates || [], opinion: reportState.selectedOpinion,
  // Trial-balance-derived demonstration entries are not imported journal evidence.
  journalReview: null,
 };
 const last = engagement.council?.rounds?.at(-1);
 if (last) c.council = { ...last, sourceStamp: last.agentSourceStamp || '', verdictText: 'راجع جلسة المجلس المحفوظة وموقف المراجع البشري.', positions: [] };
 return c;
}

export function specialistReview(context) {
 const missing = (context.gates || []).filter(g => !g.pass);
 const open = (context.risks || []).filter(r => r.status === 'open');
 const definitions = [
  ['engagement', 'مدير الارتباط', ['acceptance', 'rounds'], 'ثبّت نطاق الارتباط ومسؤوليات الفريق وتسلسل الإجراءات.', 'socpa-audit'],
  ['ifrs', 'المراجع الفني IFRS', ['mapping'], 'قابل الربط والسياسات بالإصدار المعتمد والفترة الفعلية.', 'ifrs18'],
  ['isa', 'مراجع إجراءات ISA', ['rounds', 'evidence'], 'اختبر اكتمال الإجراء وسنده والأدلة المناقضة.', 'socpa-audit'],
  ['fraud', 'مراجع الغش', [], 'اطلب دفتر اليومية الأصلي واختبر تجاوز الإدارة؛ الميزان وحده لا يكفي.', 'isa240'],
  ['data', 'مراجع البيانات', ['balance'], 'تحقق من المصدر والاتزان وبصمة المجتمع قبل إعادة الأداء.', 'socpa-audit'],
  ['quality', 'مراجع الجودة', ['human-approval', 'opinion'], 'قابل الاستنتاج ببوابات الإكمال وفصل المهام وتوقيت الاعتماد.', 'socpa-audit'],
  ['controls', 'مراجع الرقابة', ['period-lock'], 'اختبر تصميم الضوابط وتنفيذها ودليل فاعليتها.', 'socpa-audit'],
  ['tax', 'مراجع الزكاة والضريبة', [], 'افتح المختبر وافحص التسويات والافتراضات والمصدر المحلي.', 'socpa-updates'],
  ['going-concern', 'مراجع الاستمرارية والتقييم', [], 'اطلب توقعات الإدارة والتمويل والحساسية والأدلة المناقضة.', 'isa570'],
 ];
 return { sourceStamp: contextStamp(context), openRisks: open.length, seats: definitions.map(([id,title,gateIds,question,referenceId]) => ({ id,title,question,referenceId, blockers: missing.filter(g => gateIds.includes(g.id)).map(g => g.label), status: gateIds.some(id => missing.some(g => g.id === id)) ? 'requires_action' : 'human_review' })), authority: 'تحديات استشارية محلية؛ لا تصويت ولا اعتماد أو تعديل لنتائج المجلس الحالي.' };
}
