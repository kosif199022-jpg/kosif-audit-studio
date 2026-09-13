// KOSIF Audit Studio — council.js
// مجلس المراجعين المحكوم: تسعة مقاعد ذات عقود أدوار، كل مقعد يقرأ مخرجات المحرك الحتمي والتحليلات فقط
// ويصدر «موقفًا» له سند ودرجة، ثم يكتشف المجلس التعارضات ويرفعها كحالات نزاع لا تُحسم إلا بشريًا.
// لا يوجد تصويت، ولا استدعاء لنماذج خارجية، ولا سلطة اعتماد.

import { fnv1a, absoluteMinor, formatMoneyMinor, isReviewedEvidence } from './engine.js';
import { misstatementVerdictLabel, conformityLabel } from './analytics.js';

export const SEAT_CONTRACTS = Object.freeze([
  { id: 'engagement', title: 'مدير الارتباط', domain: 'التخطيط وتنسيق العمل', may: ['تحديد الخطوة التالية', 'تلخيص حالة الملف'], mayNot: ['فتح بوابة مغلقة', 'اعتماد الاستنتاجات'] },
  { id: 'ifrs', title: 'خبير IFRS', domain: 'الاعتراف والقياس والعرض والإفصاح', may: ['ربط الرصيد بالمعيار', 'اقتراح مذكرة فنية'], mayNot: ['اعتماد المعالجة', 'تجاوز النص المحلي المعتمد'] },
  { id: 'isa', title: 'خبير ISA', domain: 'المخاطر والإجراءات والأدلة', may: ['ربط الخطر بالتأكيد والإجراء', 'طلب أدلة إضافية'], mayNot: ['إغلاق نتيجة', 'تخفيض خطر بلا دليل'] },
  { id: 'fraud', title: 'محلل الاحتيال', domain: 'ISA 240 والشذوذ', may: ['تفسير الإشارات', 'تصميم اختبارات إضافية'], mayNot: ['وصف واقعة بأنها احتيال', 'تعديل القيود'] },
  { id: 'data', title: 'محلل البيانات', domain: 'الاتزان والتصنيف والتحليلات', may: ['توضيح مصدر كل رقم', 'الإشارة إلى فجوات التصنيف'], mayNot: ['إعادة احتساب المصدر المالي خارج المحرك'] },
  { id: 'quality', title: 'مراجع الجودة', domain: 'ISQM / ISA 220 والتحدي', may: ['الاعتراض على أي موقف', 'إظهار التناقض'], mayNot: ['فتح بوابة بشرية', 'إصدار رأي'] },
  { id: 'controls', title: 'خبير الرقابة الداخلية', domain: 'ISA 315 والضوابط', may: ['رصد أوجه القصور', 'اقتراح استعراض ضوابط'], mayNot: ['الاعتماد على ضابط غير مختبر'] },
  { id: 'tax', title: 'خبير الزكاة والضريبة', domain: 'ZATCA — الزكاة وضريبة القيمة المضافة', may: ['فحص المعقولية', 'طلب الإقرارات'], mayNot: ['احتساب الوعاء النهائي', 'الجزم بمخالفة نظامية'] },
  { id: 'going-concern', title: 'خبير الاستمرارية والتقييم', domain: 'ISA 570 / ISA 540', may: ['قراءة المؤشرات', 'اختبار الفرضيات'], mayNot: ['الاستنتاج بشأن الاستمرارية', 'اعتماد تقييم'] }
]);

const STANCES = Object.freeze({ clear: 'لا اعتراض', caution: 'تحفظ', objection: 'اعتراض', blocked: 'يمنع الإكمال' });
export function stanceLabel(value) { return STANCES[value] ?? value; }

function position(seatId, stance, statement, basis = [], asks = []) {
  const contract = SEAT_CONTRACTS.find((seat) => seat.id === seatId);
  return { seatId, title: contract.title, domain: contract.domain, stance, statement, basis, asks, contract: { may: contract.may, mayNot: contract.mayNot } };
}

const money = (value, currency) => formatMoneyMinor(value ?? 0n, currency);

/**
 * يبني جلسة مجلس كاملة من حالة الملف. كل الأرقام تأتي من المحرك؛ المجلس يقرأ ولا يحسب.
 */
export function convene({
  analysis = null, materiality = null, risks = [], findings = [], workpapers = [], pbc = [], evidence = [],
  journalReview = null, analytics = null, opinion = null, gates = [], graph = null, currency = 'SAR', now = new Date().toISOString()
} = {}) {
  const positions = [];
  const balanced = Boolean(analysis?.balanced);
  const materialitySet = Boolean(materiality?.overall > 0n);
  const openHigh = risks.filter((risk) => ['critical', 'high'].includes(risk.severity) && risk.status === 'open');
  const evidenceRiskIds = new Set(evidence.filter(isReviewedEvidence).flatMap((item) => item.riskIds ?? (item.riskId ? [item.riskId] : [])));
  const noEvidence = risks.filter((risk) => !evidenceRiskIds.has(risk.id));
  const noEvidenceCount = noEvidence.length;
  const openFindings = findings.filter((finding) => ['open', 'management-response'].includes(finding.status));
  const closedGates = gates.filter((gate) => typeof gate.pass === 'boolean' ? !gate.pass : !['ready', 'pass'].includes(gate.status));
  const statements = analytics?.statements ?? null;
  const ratios = Object.fromEntries((analytics?.ratios ?? []).map((item) => [item.id, item]));
  const misstatements = analytics?.misstatements ?? null;

  // 1. مدير الارتباط
  positions.push(position('engagement',
    !balanced ? 'blocked' : !materialitySet ? 'objection' : openHigh.length ? 'caution' : 'clear',
    !balanced ? 'لا يمكن تقدم الملف قبل حل فرق الميزان؛ كل التحليلات اللاحقة مبنية عليه.'
      : !materialitySet ? 'الأهمية النسبية غير معتمدة؛ يتعذر تصميم الاستجابة للمخاطر.'
        : `الخطوة التالية: ربط ${openHigh.length} خطر مرتفع مفتوح بإجراء ودليل قبل الانتقال للإكمال.`,
    [balanced ? 'الميزان متزن حسابيًا' : `فرق الميزان ${money(analysis?.imbalance, currency)}`, materialitySet ? `الأهمية الإجمالية ${money(materiality.overall, currency)}` : 'لا توجد أهمية معتمدة'],
    openHigh.slice(0, 3).map((risk) => `استجابة موثقة للخطر: ${risk.title} — ${risk.accountName}`)
  ));

  // 2. IFRS
  const ifrsRisks = openHigh.filter((risk) => (risk.standards ?? []).some((standard) => /^(IFRS|IAS)/.test(standard)));
  const unclassified = statements?.unclassified?.count ?? 0;
  positions.push(position('ifrs',
    ifrsRisks.length ? 'objection' : unclassified ? 'caution' : 'clear',
    ifrsRisks.length ? `${ifrsRisks.length} رصيد جوهري يتطلب مذكرة اعتراف وقياس قبل الإكمال (${[...new Set(ifrsRisks.flatMap((risk) => risk.standards))].slice(0, 4).join('، ')}).`
      : unclassified ? `${unclassified} حساب خارج بنود القوائم؛ العرض وفق IAS 1 غير مكتمل حتى تصنيفها.`
        : 'لم تظهر فجوة معيارية مرتفعة؛ يبقى فحص الإفصاحات والأحداث اللاحقة.',
    ifrsRisks.slice(0, 3).map((risk) => `${risk.title} — ${risk.accountName}`),
    ifrsRisks.length ? ['مذكرة فنية لكل رصيد مع مرجع النص المحلي المعتمد وإصداره'] : []
  ));

  // 3. ISA
  const risksWithoutProcedure = risks.filter((risk) => !workpapers.some((wp) => (wp.riskIds ?? []).includes(risk.id)));
  positions.push(position('isa',
    !risks.length ? 'caution' : noEvidenceCount > risks.length / 2 ? 'objection' : noEvidenceCount ? 'caution' : 'clear',
    risks.length ? `${risksWithoutProcedure.length} خطر بلا إجراء و${noEvidenceCount} خطر بلا دليل مراجع ذي بصمة وتاريخ صالح؛ لا يجوز تخفيض خطر بلا استجابة (ISA 330).`
      : 'لا توجد مخاطر مرصودة بعد؛ تقييم المخاطر لم يكتمل (ISA 315).',
    [`${workpapers.length} ورقة عمل`, `${evidence.length} دليل مسجل`, `${pbc.filter((item) => item.status === 'reviewed').length}/${pbc.length} طلب مستندات تمت مراجعته`],
    noEvidence.slice(0, 3).map((risk) => `دليل من مصدر مستقل للخطر: ${risk.title}`)
  ));

  // 4. الاحتيال
  const journal = journalReview?.summary;
  const benford = analytics?.benfordBalances;
  const journalFlagged = journal?.flagged ?? journal?.pendingReview ?? 0;
  positions.push(position('fraud',
    !journal?.total ? 'caution' : journalFlagged > 0 && journal?.pendingReview > 0 ? 'objection' : benford?.conformity === 'nonconformity' ? 'caution' : 'clear',
    !journal ? 'لم تُفحص قيود اليومية؛ اختبار ISA 240 للقيود اليدوية والإقفال لم ينفذ بعد.'
      : journal.pendingReview > 0 ? `${journal.pendingReview} قيد معلّم بانتظار المراجعة؛ الإشارات لا تثبت احتيالًا لكنها لا تُغلق بلا تفسير.`
        : 'قيود اليومية المعلّمة تمت مراجعتها؛ يبقى اختبار تجاوز الإدارة للضوابط.',
    [benford ? `بنفورد على الأرصدة: ${conformityLabel(benford.conformity)}` : 'لم يُنفذ اختبار بنفورد', journal ? `${journal.total} قيد مفحوص` : 'لا قيود'],
    journal?.pendingReview > 0 ? ['تفسير موثق ومرفق لكل قيد يدوي مرتفع الدرجة'] : []
  ));

  // 5. البيانات
  positions.push(position('data',
    !balanced ? 'blocked' : statements && !statements.checks.equationHolds ? 'objection' : unclassified ? 'caution' : 'clear',
    !balanced ? 'الميزان غير متزن؛ أرفض بناء أي قائمة أو نسبة عليه.'
      : statements && !statements.checks.equationHolds ? `المعادلة المحاسبية غير محققة بفرق ${money(statements.checks.equationDelta, currency)}؛ التصنيف الآلي يحتاج مراجعة.`
        : `كل رقم في القوائم المشتقة يتتبع إلى حساب في الميزان؛ ${analysis?.metrics?.accounts ?? 0} حساب في ${analysis?.metrics?.categories ?? 0} فئة.`,
    [statements ? `إجمالي الأصول ${money(statements.sfp.totalAssets, currency)}` : 'لا قوائم', `${analysis?.metrics?.duplicates ?? 0} كود مكرر`],
    unclassified ? [`تصنيف ${unclassified} حساب غير مصنف يدويًا`] : []
  ));

  // 6. الجودة — يتحدى مسودة الرأي والبوابات
  const gateBlocked = closedGates;
  const opinionTooOptimistic = opinion?.code === 'unmodified' && (openFindings.some((f) => f.severity === 'critical') || gateBlocked.length > 0);
  positions.push(position('quality',
    opinionTooOptimistic ? 'objection' : openFindings.length ? 'caution' : 'clear',
    opinionTooOptimistic ? `مسودة الرأي «${opinion.label}» تتعارض مع ${gateBlocked.length} بوابة غير مكتملة و${openFindings.length} نتيجة مفتوحة؛ لا يُقرأ الرأي قبل الإغلاق.`
      : openFindings.length ? `${openFindings.length} نتيجة غير مغلقة؛ اختبر اكتمال النتائج ولا تعتبر غياب الاستثناء دليلًا.`
        : 'لم أجد تناقضًا بين المواقف والبوابات؛ يبقى تحدي الفرضيات قبل التوقيع.',
    [opinion ? `مسودة الرأي الحالية: ${opinion.label}` : 'لا مسودة رأي', `${gateBlocked.length} بوابة غير مكتملة`],
    opinionTooOptimistic ? ['إغلاق النتائج الحرجة والبوابات قبل إعادة توليد مسودة الرأي'] : []
  ));

  // 7. الرقابة الداخلية
  const entries = journalReview?.entries ?? [];
  const controlSignals = entries.filter((entry) => (entry.flags ?? []).some((flag) => ['RARE_USER', 'PERIOD_END', 'MANUAL_ENTRY'].includes(flag.rule ?? flag))).length;
  const sodSignals = entries.filter((entry) => (entry.flags ?? []).some((flag) => (flag.rule ?? flag) === 'RARE_USER') && entry.severity === 'high').length;
  positions.push(position('controls',
    sodSignals > 0 ? 'objection' : 'caution',
    sodSignals > 0 ? `${sodSignals} قيد مرتفع الدرجة من مستخدمين قليلي الظهور؛ يشير إلى ضعف في ضوابط الصلاحيات والاعتماد قبل الترحيل.`
      : journal?.total ? 'لم ترصد إشارات فصل مهام في العينة، لكن الاعتماد على الضوابط يتطلب اختبار تشغيلها لا وجودها فقط.'
        : 'لا بيانات قيود لتقييم الضوابط؛ الاستراتيجية الجوهرية بالكامل هي الافتراض الحالي.',
    [journal ? `${journal.total} قيد، ${controlSignals} منها بإشارة ضبطية` : 'لا قيود'],
    sodSignals ? ['استعراض مصفوفة صلاحيات النظام المحاسبي وسجل الاعتماد'] : []
  ));

  // 8. الزكاة والضريبة
  const saudi = analytics?.saudi;
  positions.push(position('tax',
    saudi?.vat.status === 'danger' ? 'objection' : saudi?.vat.status === 'warning' || saudi?.vat.status === 'no-account' ? 'caution' : 'clear',
    !saudi ? 'لا قوائم لفحص المعقولية.'
      : saudi.vat.status === 'no-account' ? 'لا يوجد حساب لضريبة القيمة المضافة في الميزان؛ إما دليل حسابات ناقص أو الضريبة مدمجة في حساب آخر.'
        : saudi.vat.status === 'danger' ? `فرق ${saudi.vat.variancePct}٪ بين الضريبة المسجلة والإيراد × 15٪؛ يلزم مطابقة الإقرارات الربعية قبل الإكمال.`
          : `معقولية الضريبة ضمن الحد (${saudi.vat.variancePct ?? 0}٪)؛ الزكاة التقديرية ${money(saudi.zakat.estimate, currency)} تُقابل بالإقرار لا بالتقدير.`,
    saudi ? [`مسجل: ${money(saudi.vat.recorded, currency)}`, `متوقع: ${money(saudi.vat.expectedOutput, currency)}`] : [],
    saudi && saudi.vat.status !== 'success' ? ['إقرارات ضريبة القيمة المضافة للسنة ومطابقتها بالدفاتر'] : []
  ));

  // 9. الاستمرارية والتقييم
  const gcHits = (analytics?.goingConcern ?? []).filter((item) => item.hit);
  const estimateRisks = risks.filter((risk) => /مخصص|تقدير|ecl|انخفاض|impair/i.test(`${risk.title} ${risk.rule}`));
  positions.push(position('going-concern',
    gcHits.length >= 2 ? 'objection' : gcHits.length || estimateRisks.length ? 'caution' : 'clear',
    gcHits.length >= 2 ? `${gcHits.length} مؤشرات مالية متزامنة (${gcHits.map((item) => item.label).join('، ')})؛ تقييم الإدارة للاثني عشر شهرًا القادمة إلزامي قبل أي رأي.`
      : gcHits.length ? `مؤشر واحد (${gcHits[0].label}) لا يكفي وحده، لكنه يستدعي ورقة عمل استمرارية موثقة.`
        : 'لا مؤشرات مالية من القوائم المشتقة؛ يبقى فحص التعهدات البنكية والأحداث اللاحقة.',
    [ratios.current ? `نسبة التداول ${ratios.current.value ?? '—'}` : '', estimateRisks.length ? `${estimateRisks.length} خطر تقديري (ISA 540)` : ''].filter(Boolean),
    gcHits.length ? ['تقييم الإدارة للاستمرارية وخطط التمويل والتدفقات النقدية المتوقعة'] : []
  ));

  // كشف التعارضات — أزواج محددة لا مقارنة عمياء
  const byId = Object.fromEntries(positions.map((item) => [item.seatId, item]));
  const conflicts = [];
  const conflict = (a, b, reason) => conflicts.push({ id: `C-${fnv1a(`${a}|${b}|${reason}`).toString(16).toUpperCase().slice(0, 6)}`, seats: [a, b], titles: [byId[a].title, byId[b].title], reason, resolution: null });
  if (byId.quality.stance === 'objection' && byId.engagement.stance === 'clear') conflict('quality', 'engagement', 'مدير الارتباط يرى الملف جاهزًا للإكمال بينما الجودة تعترض على مسودة الرأي.');
  if (journal && byId.fraud.stance !== 'clear' && byId.controls.stance === 'clear') conflict('fraud', 'controls', 'محلل الاحتيال يرى إشارات في القيود بينما الرقابة الداخلية لا ترصد قصورًا؛ أحدهما يحتاج أدلة إضافية.');
  if (byId.data.stance === 'clear' && byId.ifrs.stance === 'caution' && unclassified) conflict('data', 'ifrs', 'البيانات تعتبر التتبع كاملًا بينما IFRS يرى العرض ناقصًا بسبب حسابات غير مصنفة.');
  if (byId['going-concern'].stance === 'objection' && opinion?.code === 'unmodified') conflict('going-concern', 'quality', 'مؤشرات الاستمرارية متعددة بينما مسودة الرأي غير معدلة وبلا فقرة عدم تأكد جوهري.');
  if (misstatements?.verdict === 'material' && byId.isa.stance === 'clear') conflict('isa', 'quality', `${misstatementVerdictLabel(misstatements.verdict)} بينما مقعد ISA لا يعترض.`);

  const weights = { clear: 0, caution: 1, objection: 2, blocked: 3 };
  const tension = positions.reduce((sum, item) => sum + weights[item.stance], 0);
  const maxTension = positions.length * 3;
  const consensus = Math.round(100 - (tension / maxTension) * 100);
  const blocked = positions.filter((item) => item.stance === 'blocked');
  const objections = positions.filter((item) => item.stance === 'objection');
  const verdict = blocked.length ? 'blocked' : objections.length ? 'objections' : positions.some((item) => item.stance === 'caution') ? 'cautions' : 'clear';
  const verdictText = {
    blocked: 'المجلس يوقف الإكمال: يوجد مانع حسابي قبل أي حكم مهني.',
    objections: `${objections.length} اعتراض مفتوح و${conflicts.length} حالة نزاع تحتاج حسمًا بشريًا.`,
    cautions: 'لا اعتراضات، لكن توجد تحفظات موثقة يجب الرد عليها في أوراق العمل.',
    clear: 'لا اعتراض من أي مقعد؛ يبقى الاعتماد البشري والتوقيع خارج سلطة المجلس.'
  }[verdict];
  const asks = [...new Set(positions.flatMap((item) => item.asks))];

  return {
    id: `CR-${fnv1a(`${now}|${positions.map((item) => item.stance).join('')}`).toString(16).toUpperCase()}`,
    createdAt: now,
    consensus,
    verdict,
    verdictText,
    positions,
    conflicts,
    asks,
    blockers: [...blocked, ...objections].map((item) => `${item.title}: ${item.statement}`),
    authority: 'استشاري — لا اعتماد ولا رأي ولا ترحيل'
  };
}

export function resolveConflict(session, conflictId, { reviewer, decision, note }) {
  if (!String(reviewer ?? '').trim()) throw new Error('اسم المراجع مطلوب.');
  if (!['uphold', 'override'].includes(decision)) throw new Error('قرار حسم غير صالح.');
  if (!String(note ?? '').trim()) throw new Error('مبرر القرار مطلوب.');
  if (!session.conflicts.some(item => item.id === conflictId)) throw new Error('لم يتم العثور على النزاع.');
  const conflicts = session.conflicts.map((item) => item.id === conflictId
    ? { ...item, resolution: { reviewer, decision, note, recordedAt: new Date().toISOString() } }
    : item);
  return { ...session, conflicts, unresolvedConflicts: conflicts.filter(item => !item.resolution).length };
}

export function councilVerdictLabel(value) {
  return { blocked: 'إكمال موقوف', objections: 'اعتراضات مفتوحة', cautions: 'تحفظات', clear: 'لا اعتراض' }[value] ?? value;
}
