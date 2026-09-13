import { normalizeText, fnv1a, isReviewedEvidence } from './engine.js';
import { REFERENCES, searchReferences, validDate } from './reference-registry.js';

export const AGENT_VERSION = '4.0.0';
export const TASK_STATUSES = Object.freeze({ queued: 'مخطط', active: 'قيد التنفيذ', blocked: 'بانتظار دليل', done: 'مكتمل' });
const rank = { critical: 0, high: 1, medium: 2, low: 3 };
const safeJson = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item);
const linked = (item, riskId) => (item.riskIds ?? item.linkedRiskIds ?? []).includes(riskId);
const reviewed = isReviewedEvidence;
const gatePassed = g => typeof g.pass === 'boolean' ? g.pass : ['ready', 'pass'].includes(g.status);

/** Operational change detection, not a cryptographic signature or an approval. */
export function contextStamp(c = {}) {
 const source = { rows: c.analysis?.rows ?? [], balanced: c.analysis?.balanced, materiality: c.materiality, engagement: c.engagement, risks: c.risks ?? [], evidence: c.evidence ?? [], workpapers: c.workpapers ?? [], pbc: c.pbc ?? [], findings: c.findings ?? [], journal: c.journalReview, opinion: c.opinion, gates: c.gates ?? [] };
 return `S-${fnv1a(safeJson(source)).toString(16).padStart(8, '0')}`;
}

export function councilStateStamp(session) {
 return `C-${fnv1a(safeJson(session ?? null)).toString(16)}`;
}

export function buildActionPlan(c = {}, { mode = 'risk-first', now = new Date().toISOString() } = {}) {
 const stamp = contextStamp(c);
 const tasks = [];
 const add = (id, title, why, view, options = {}) => tasks.push({ id, title, why, view, priority: 'high', type: 'procedure', referenceIds: ['socpa-audit'], steps: [], status: 'queued', assignee: c.engagement?.reviewer ?? '', dueDate: '', note: '', history: [], ...options });
 if (!c.analysis) add('intake', 'استيراد ميزان المراجعة', 'ابدأ من بيانات المصدر لبناء تحليل قابل للتتبع.', 'data', { priority: 'critical', steps: ['اربط أسماء الأعمدة', 'راجع العملة والفترة', 'افحص الاتزان وتكرار الحسابات'] });
 else if (!c.analysis.balanced) add('balance', 'معالجة فرق الميزان', 'التحليل اللاحق يعتمد على مصدر متزن.', 'data', { priority: 'critical', steps: ['قارن الإجماليات بالمصدر', 'راجع القيود المفقودة', 'أعد استيراد النسخة المصححة'] });
 if (c.analysis && !(c.materiality?.overall > 0n)) add('materiality', 'تحديد الأهمية النسبية', 'يلزم أساس موثق لتخطيط الإجراءات وتقييم التحريفات.', 'planning', { priority: 'critical', steps: ['اختر الأساس المناسب', 'وثق سبب النسبة', 'سجّل إصدار الأهمية'] });
 const risks = [...(c.risks ?? [])].filter(r => r.status === 'open').sort((a, b) => (rank[a.severity] ?? 2) - (rank[b.severity] ?? 2) || String(a.id).localeCompare(String(b.id)));
 for (const risk of risks.slice(0, 12)) {
  const evidence = (c.evidence ?? []).filter(x => linked(x, risk.id));
  const wp = (c.workpapers ?? []).filter(x => linked(x, risk.id));
  add(`risk-${risk.id}`, risk.title, `${risk.accountName ?? 'الحساب المرتبط'} · ${wp.length ? 'يوجد إجراء مرتبط' : 'يحتاج إجراءً'} · ${evidence.filter(reviewed).length ? 'يوجد دليل مراجع؛ اختبر الكفاية' : 'يحتاج دليلًا مراجعًا قابلًا للتتبع'}`, 'risks', { type: 'risk', riskId: risk.id, priority: risk.severity, evidenceIds: evidence.map(x => x.id), standardCodes: risk.standards ?? [], steps: ['حدد التأكيد والإجراء المناسبين', 'اجمع المصدر والأدلة المناقضة', 'وثّق الاختبار والنتيجة ومراجعة المسؤول'] });
 }
 if (c.analysis && !c.journalReview?.summary?.total) add('journal', 'تنفيذ فحص قيود اليومية', 'غياب الاختبار لا يعني غياب إشارات الغش.', 'journal', { referenceIds: ['isa240', 'socpa-audit'], steps: ['استورد بيانات القيود', 'افحص إشارات الإقفال والمستخدمين', 'وثق مراجعة كل قيد معلّم'] });
 else if (c.journalReview?.summary?.pendingReview) add('journal-review', 'حسم القيود المعلّمة', `${c.journalReview.summary.pendingReview} قيدًا ينتظر مراجعة بشرية.`, 'journal', { referenceIds: ['isa240'], steps: ['راجع المستند والصلاحية', 'سجل تفسير الاستثناء', 'وثق الاستجابة'] });
 const awaiting = (c.pbc ?? []).filter(x => x.status !== 'reviewed');
 if (awaiting.length) add('pbc', 'متابعة طلبات الأدلة', `${awaiting.length} طلبًا يحتاج متابعة أو مراجعة.`, 'pbc', { steps: ['راجع تاريخ الاستحقاق', 'تحقق من اكتمال الرد', 'اربط الدليل بورقة العمل'] });
 const concern = (c.analytics?.goingConcern ?? []).filter(x => x.hit);
 if (concern.length) add('going-concern', 'اختبار فرضيات الاستمرارية', `${concern.length} مؤشرات تستدعي تقييمًا موثقًا.`, 'analytics', { referenceIds: ['isa570'], steps: ['راجع تقييم الإدارة', 'اختبر التمويل والتوقعات', 'ابحث عن الأدلة المناقضة'] });
 if (c.analysis) add('council', 'جلسة تحدٍّ مع مجلس المراجعين', 'قابل النتائج بالمراجع ومواقف التخصصات قبل الإكمال.', 'council', { priority: 'medium', steps: ['التقط جلسة من البيانات الحالية', 'راجع الاعتراضات والسند', 'سجّل ردًا بشريًا على النزاعات'] });
 if (mode === 'completion') tasks.sort((a, b) => (['journal-review','pbc','council'].includes(b.id) ? 1 : 0) - (['journal-review','pbc','council'].includes(a.id) ? 1 : 0));
 return { id: `AP-${fnv1a(`${stamp}|${mode}|${now}`).toString(16)}`, version: AGENT_VERSION, createdAt: now, sourceStamp: stamp, mode, totalOpenRisks: risks.length, omittedRisks: Math.max(0, risks.length - 12), tasks, authority: 'خطة عمل مقترحة · الإكمال لا يعتمد خطرًا أو تقريرًا' };
}

export function transitionTask(task, status, { actor, note = '', now = new Date().toISOString() } = {}) {
 if (!Object.hasOwn(TASK_STATUSES, status)) throw new Error('حالة المهمة غير معروفة.');
 if (!String(actor ?? '').trim()) throw new Error('اسم المراجع مطلوب.');
 if (['done', 'blocked'].includes(status) && note.trim().length < 5) throw new Error('سجل مبررًا واضحًا من خمسة أحرف على الأقل.');
 return { ...task, status, note: note.trim(), updatedAt: now, history: [...(task.history ?? []), { from: task.status, to: status, actor: actor.trim(), note: note.trim(), at: now }].slice(-50) };
}

export function updateTaskDetails(task, { assignee, dueDate }) {
 if (dueDate && !validDate(dueDate)) throw new Error('تاريخ الاستحقاق غير صالح.');
 return { ...task, assignee: String(assignee ?? '').trim().slice(0, 120), dueDate: dueDate || '' };
}

export function answerAgent(query, c = {}) {
 const q = normalizeText(query).trim();
 const refs = ids => ids.map(id => REFERENCES.find(r => r.id === id)).filter(Boolean);
 const result = (intent, text, ids = ['socpa-audit'], actions = []) => ({ intent, text, references: refs(ids), actions, sourceStamp: contextStamp(c), ...(intent === 'council' ? { councilStamp: councilStateStamp(c.council) } : {}), mode: 'local-rules' });
 if (/اعتمد|اعتماد|وقع|اغلق.*خطر|رحل/.test(q)) return result('authority', 'الإيجنت لا يستطيع اعتماد التقرير أو إغلاق المخاطر أو ترحيل القيود. يمكنه تجهيز خطة وسند للمراجعة؛ القرار والتوقيع بشريان.', ['socpa-audit'], [{ label: 'فتح بوابات التقرير', view: 'reports' }]);
 if (/خطه|ابد[اأ]|التاليه|اولوي|ماذا بعد/.test(q)) {
  const plan = buildActionPlan(c);
  return result('plan', `الأولويات المقترحة من الملف الحالي:\n${plan.tasks.slice(0, 4).map((t, i) => `${i+1}. ${t.title}: ${t.why}`).join('\n')}\n${plan.omittedRisks ? `الخطة تعرض أعلى 12 خطرًا؛ يوجد ${plan.omittedRisks} خطرًا إضافيًا في سجل المخاطر.` : 'يمكنك تحويل التوصيات إلى خطة عمل قابلة للمتابعة.'}`, ['socpa-audit'], [{ label: 'إنشاء خطة عمل', action: 'plan' }]);
 }
 if (/خطر|مخاطر/.test(q)) {
  const risks = [...(c.risks ?? [])].filter(r => r.status === 'open').sort((a,b)=>(rank[a.severity]??2)-(rank[b.severity]??2));
  return result('risks', risks.length ? `${risks.length} إشارة مفتوحة. الأولوية:\n${risks.slice(0, 4).map(r => `• ${r.title} — ${r.accountName ?? ''}`).join('\n')}\nاختبر الإشارة بإجراء ودليل؛ لا تمثل وحدها نتيجة مراجعة.` : 'لا توجد إشارات متاحة في الملف الحالي. تحقق من استيراد الميزان واستكمال التقييم.', ['socpa-audit'], [{ label: 'فتح سجل المخاطر', view: 'risks' }]);
 }
 if (/دليل|ادله|فجوات|تغطيه/.test(q)) {
  const evidence = c.evidence ?? []; const adequate = evidence.filter(reviewed);
  const gaps = (c.risks ?? []).filter(r => !adequate.some(x => linked(x, r.id))).length;
  return result('evidence', `${evidence.length} سجل دليل، منها ${adequate.length} مراجع وذو بصمة ودرجة جودة مناسبة. ${gaps} خطرًا بلا دليل بهذه الصفات. الدرجة مؤشر تشغيلي؛ كفاية الدليل وملاءمته يقيّمهما المراجع.`, ['socpa-audit'], [{ label: 'فحص الأدلة', view: 'evidence' }]);
 }
 if (/جاهز|جاهزيه|بواب|عائق|حاله الملف/.test(q)) {
  const failed = (c.gates ?? []).filter(g => !gatePassed(g));
  return result('readiness', !c.analysis ? 'لم يُستورد ميزان بعد. ابدأ من البيانات لقراءة جاهزية فعلية.' : `${failed.length} بوابات لم تكتمل:\n${failed.map(g=>`• ${g.label}`).join('\n')}\nالجاهزية التشغيلية لا تمنح اعتمادًا مهنيًا.`, ['socpa-audit'], [{ label: 'بوابات التقرير', view: 'reports' }]);
 }
 if (/مجلس|المراجعين|اعتراض/.test(q)) {
  const council = c.council;
  const stale = council?.sourceStamp !== contextStamp(c);
  return result('council', !council ? 'لا جلسة محفوظة بعد. اعقد جلسة لتكوين مواقف من بيانات الملف الحالية.' : `${stale ? 'تحتاج الجلسة تحديثًا لأن مصدرها تغيّر أو لم تُسجل بصمته.\n' : ''}${council.verdictText}\n${council.positions?.filter(p=>['objection','blocked'].includes(p.stance)).map(p=>`• ${p.title}: ${p.statement}`).slice(0,3).join('\n') ?? ''}`, ['socpa-audit'], [{ label: 'فتح المجلس', view: 'council' }]);
 }
 const topicMatches = [
  [/ifrs\s*18|عرض.*قوائم|افصاح.*قوائم/, 'ifrs18'],
  [/smes|صغير|متوسط/, 'smes2025'],
  [/isa\s*570|استمراري/, 'isa570'],
  [/isa\s*240|غش|احتيال/, 'isa240'],
  [/اعتماد.*محلي|معايير.*سعود|socpa/, 'socpa-audit']
 ].filter(([pattern])=>pattern.test(q)).map(([,id])=>REFERENCES.find(r=>r.id===id));
 const matches = topicMatches.length ? topicMatches : searchReferences(query);
 if (!matches.length && /(?:isa|ifrs|ias)\s*\d+/.test(q)) return result('unsupported-reference', 'لا توجد في مرصد التحديثات بطاقة موثقة لهذا المعيار. افتح مكتبة المعايير التفصيلية وتحقق من المصدر والإصدار المعتمد قبل التطبيق.', [], [{label:'مكتبة المعايير',view:'standards'}]);
 if (matches.length || /معيار|مرجع|مراجع|ifrs|isa|استمراري/.test(q)) {
  const selected = matches.length ? matches : REFERENCES.filter(r=>['socpa-audit','socpa-updates'].includes(r.id));
  return result('references', selected.map(r=>`${r.code} — ${r.summary}${r.effectiveFrom ? ` السريان الدولي للفترات التي تبدأ في ${r.effectiveFrom} أو بعده.` : ''}`).join('\n\n') + '\nتحقق من الإصدار والاعتماد المحلي وبداية فترة الارتباط قبل التطبيق.', selected.map(r=>r.id), [{label:'فتح مرصد المراجع',view:'references'}]);
 }
 return result('unknown', 'أساعدك في أولويات الملف، المخاطر، فجوات الأدلة، بوابات الإكمال والمراجع. هذا مساعد محلي قائم على قواعد وبيانات الارتباط. جرّب: «جهّز خطة العمل» أو «ما فجوات الأدلة؟».', [], []);
}

export function draftMemo(c = {}, riskId = '') {
 const risk = (c.risks ?? []).find(r=>r.id===riskId) ?? (c.risks ?? []).find(r=>r.status==='open');
 const evidence = risk ? (c.evidence ?? []).filter(x=>linked(x,risk.id)) : [];
 return `# مذكرة مراجعة — مسودة بشرية للمراجعة\n\nالمنشأة: ${c.engagement?.entity ?? 'غير محددة'}\nالموضوع: ${risk?.title ?? 'تخطيط ملف الارتباط'}\nبصمة حالة المصدر: ${contextStamp(c)}\n\n## الوقائع من الملف\n${risk ? `${risk.accountName ?? ''} — ${risk.title}\nدرجة الإشارة: ${risk.severity}\nالمعايير المرتبطة في المحرك: ${(risk.standards ?? []).join('، ') || 'يلزم التحديد'}` : 'لم تسجل مخاطر لتحليلها بعد.'}\n\n## الأدلة المتاحة\n${evidence.length ? evidence.map(x=>`- ${x.title ?? x.fileName ?? x.id} | ${x.status} | ${x.fileHash ? 'بصمة موجودة' : 'بلا بصمة'}`).join('\n') : 'لم تسجل أدلة مرتبطة بهذا الموضوع.'}\n\n## خطة الاختبار المقترحة\n- حدد التأكيد والهدف ونطاق الاختبار.\n- قابل المصدر بالمستندات المؤيدة والأدلة المناقضة.\n- وثق الاستثناءات والاستجابة وأثرها على بقية الملف.\n\n## أسئلة التحدي\n- ما الدليل الذي قد يغير الفرضية الحالية؟\n- هل يوجد تفسير بديل للإشارة؟\n- ما حدود البيانات والعينة والإصدار المعياري؟\n\n## الاستنتاج البشري\nلم يسجل استنتاج في هذه المسودة. يكتب المراجع نتيجة إجراءاته وسندها ثم يسجل المراجعة باسمه.\n\n## مرجع رسمي\n${REFERENCES[0].url}\nملخص تطبيقي؛ تحقق من النص والإصدار المعتمد.\n`;
}
