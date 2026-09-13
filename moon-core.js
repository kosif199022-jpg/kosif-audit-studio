import { verifyAuditEventChain } from './engine.js';

export const KOSIF_STORAGE_KEY = 'kosif-audit-studio:v1';

const asArray = (value) => Array.isArray(value) ? value : [];
const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function parseStoredState(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function gate(id, label, status, reason, actionView = null) {
  return { id, label, status, reason, detail: reason, actionView };
}

export function buildMoonSnapshot(input = {}) {
  const state = asObject(input);
  const rows = asArray(state.rawRows);
  const workpapers = asArray(state.workpapers);
  const findings = asArray(state.findings);
  const pbc = asArray(state.pbc);
  const councilRuns = asArray(state.councilRuns);
  const evidence = asArray(state.evidence);
  const auditEvents = asArray(state.auditEvents);
  const riskDecisions = asObject(state.riskDecisions);
  const riskSummary = asObject(state.riskSummary);
  const journalSummary = asObject(state.journalReview?.summary);

  const completedWorkpapers = workpapers.filter((item) => item?.status === 'completed').length;
  const openFindings = findings.filter((item) => ['open', 'management-response'].includes(item?.status)).length;
  const reviewedPbc = pbc.filter((item) => item?.status === 'reviewed').length;
  const linkedWorkpapers = workpapers.filter((item) => asArray(item?.riskIds).length > 0).length;
  const linkedFindings = findings.filter((item) => item?.riskId || item?.workpaperId).length;
  const linkedPbc = pbc.filter((item) => asArray(item?.riskIds).length > 0).length;
  const reviewedEvidence = evidence.filter((item) => item?.status === 'reviewed').length;
  const linkedEvidence = evidence.filter((item) => asArray(item?.riskIds ?? item?.linkedRiskIds).length > 0).length;
  const riskDecisionCount = Object.keys(riskDecisions).length;
  const riskCount = Number(riskSummary.total ?? 0);
  const highOpenRisks = Number(riskSummary.highOpen ?? 0);

  const hasData = rows.length > 0;
  const hasMateriality = Boolean(state.materiality);
  const hasWorkpapers = workpapers.length > 0;
  const hasEvidenceWorkflow = pbc.length > 0;
  const reviewOperationallyClear = hasWorkpapers && openFindings === 0;
  const hasHumanApproval = Boolean(state.approval);
  const hasJournalReview = Number(journalSummary.total ?? 0) > 0;
  const journalPending = Math.max(0, Number(journalSummary.flagged ?? 0) - Number(journalSummary.reviewed ?? 0));
  const eventChain = verifyAuditEventChain(auditEvents);
  const archiveReady = hasHumanApproval && auditEvents.length > 0 && eventChain.valid;

  const gates = [
    gate('data', 'البيانات', hasData ? 'ready' : 'blocked', hasData ? `${rows.length.toLocaleString('en-US')} صف محفوظ في لقطة الارتباط.` : 'يلزم تحميل ميزان مراجعة قبل أي تحليل.', 'data'),
    gate('planning', 'التخطيط', hasMateriality ? 'ready' : hasData ? 'attention' : 'blocked', hasMateriality ? 'توجد نسخة أهمية نسبية محفوظة وتبقى خاضعة للاعتماد المهني.' : 'لا توجد نسخة أهمية نسبية محفوظة.', 'planning'),
    gate('risk-response', 'المخاطر والاستجابة', riskCount > 0 && highOpenRisks === 0 ? 'ready' : hasData ? 'attention' : 'blocked', riskCount > 0 ? (highOpenRisks > 0 ? `${highOpenRisks.toLocaleString('en-US')} مخاطر مرتفعة أو حرجة ما زالت بلا استجابة بشرية.` : `تمت الاستجابة للمخاطر المرتفعة؛ ${riskDecisionCount.toLocaleString('en-US')} قرارًا بشريًا محفوظًا.`) : 'لا توجد استجابات بشرية محفوظة للمخاطر حتى الآن.', 'risks'),
    gate('journal', 'فحص قيود اليومية', hasJournalReview ? (journalPending > 0 ? 'attention' : 'ready') : hasData ? 'attention' : 'blocked', hasJournalReview ? (journalPending > 0 ? `${journalPending.toLocaleString('en-US')} قيدًا معلّمًا ينتظر المراجعة البشرية.` : 'اكتمل فحص القيود المعلّمة وتوثيق حالة المراجعة.') : 'لم يُنفذ فحص قيود اليومية بعد.', 'journal'),
    gate('fieldwork', 'التنفيذ', completedWorkpapers > 0 ? 'ready' : hasWorkpapers ? 'attention' : hasData ? 'attention' : 'blocked', completedWorkpapers > 0 ? `${completedWorkpapers.toLocaleString('en-US')} ورقة عمل مكتملة من ${workpapers.length.toLocaleString('en-US')}.` : hasWorkpapers ? 'برنامج العمل موجود لكن لا توجد ورقة مكتملة.' : 'لم يُنشأ برنامج عمل من المخاطر بعد.', 'workpapers'),
    gate('evidence', 'الأدلة وPBC', reviewedPbc > 0 ? 'ready' : hasEvidenceWorkflow ? 'attention' : hasData ? 'attention' : 'blocked', reviewedPbc > 0 ? `${reviewedPbc.toLocaleString('en-US')} طلب دليل تمت مراجعته من ${pbc.length.toLocaleString('en-US')}.` : hasEvidenceWorkflow ? 'طلبات الأدلة موجودة ولم تصل أي منها إلى حالة تمت مراجعتها.' : 'لا توجد دورة PBC محفوظة بعد.', 'pbc'),
    gate('evidence-register', 'سجل الأدلة', reviewedEvidence > 0 ? 'ready' : evidence.length > 0 ? 'attention' : hasData ? 'attention' : 'blocked', reviewedEvidence > 0 ? `${reviewedEvidence.toLocaleString('en-US')} دليلًا تمت مراجعته من ${evidence.length.toLocaleString('en-US')}.` : evidence.length > 0 ? 'وصلت أدلة لكنها لم تعتمد مراجعتها بعد.' : 'لا توجد أدلة مستلمة ومسجلة حتى الآن.', 'evidence'),
    gate('review', 'المراجعة', reviewOperationallyClear ? 'ready' : hasWorkpapers ? 'attention' : 'blocked', reviewOperationallyClear ? 'لا توجد نتائج مفتوحة في الحالة المحفوظة؛ هذا مؤشر تشغيلي وليس اعتماد جودة.' : openFindings > 0 ? `${openFindings.toLocaleString('en-US')} نتيجة ما زالت مفتوحة أو بانتظار رد الإدارة.` : 'يلزم تنفيذ أوراق عمل قبل اعتبار المراجعة جاهزة تشغيليًا.', 'risks'),
    gate('reporting', 'التقرير', hasHumanApproval ? 'ready' : 'attention', hasHumanApproval ? 'توجد مراجعة بشرية مسجلة لبوابات الملف.' : 'لا يوجد تسجيل مراجعة بشرية نهائية في الحالة الحالية.', 'reports'),
    gate('archive', 'الأرشيف', archiveReady ? 'ready' : hasHumanApproval ? 'attention' : 'blocked', archiveReady ? `سلسلة الأحداث سليمة وتضم ${auditEvents.length.toLocaleString('en-US')} حدثًا؛ يمكن إنشاء لقطة أرشيف.` : hasHumanApproval ? 'الاعتماد البشري مسجل، لكن سجل الأحداث مفقود أو غير سليم.' : 'يلزم اعتماد بشري نهائي وسجل أحداث سليم قبل إنشاء لقطة الأرشيف.', 'reports')
  ];

  const traceChecks = [
    state.sourceName ? 1 : 0,
    workpapers.length ? linkedWorkpapers / workpapers.length : 0,
    findings.length ? linkedFindings / findings.length : 0,
    pbc.length ? linkedPbc / pbc.length : 0,
    evidence.length ? linkedEvidence / evidence.length : 0,
    councilRuns.length ? 1 : 0,
    hasHumanApproval ? 1 : 0
  ];
  const traceHealth = Math.round((traceChecks.reduce((sum, value) => sum + value, 0) / traceChecks.length) * 100);

  return {
    generatedAt: new Date().toISOString(),
    product: 'Moon compatibility layer over KOSIF Audit Studio',
    engagement: asObject(state.engagement),
    metrics: {
      rows: rows.length,
      workpapers: workpapers.length,
      completedWorkpapers,
      findings: findings.length,
      openFindings,
      pbc: pbc.length,
      reviewedPbc,
      evidence: evidence.length,
      reviewedEvidence,
      journalEntries: Number(journalSummary.total ?? 0),
      journalFlagged: Number(journalSummary.flagged ?? 0),
      councilRuns: councilRuns.length,
      riskDecisionCount,
      traceHealth,
      auditEvents: auditEvents.length,
      eventChainValid: eventChain.valid
    },
    gates,
    authority: {
      aiCanRecommend: true,
      aiCanApproveOpinion: false,
      aiCanLockArchive: false,
      humanApprovalRequired: true
    },
    provenance: {
      sourceName: state.sourceName ?? null,
      storageSchemaVersion: state.version ?? null,
      hasMaterialitySnapshot: hasMateriality,
      hasHumanApproval,
      eventChainValid: eventChain.valid
    }
  };
}

export const SOCPA_2025_WATCH = Object.freeze([
  {
    code: 'IFRS 18',
    titleAr: 'العرض والإفصاح في القوائم المالية',
    status: 'adopted',
    effective: '2027-01-01',
    note: 'معتمد ضمن طبعة 2025، وسيحل محل IAS 1 للفترات التي تبدأ في 1 يناير 2027 أو بعده، مع السماح بالتطبيق الأسبق.',
    sourcePages: 'SOCPA 2025: 5، 13، 18'
  },
  {
    code: 'IFRS 19',
    titleAr: 'المنشآت التابعة التي لا تخضع للمساءلة العامة: الإفصاحات',
    status: 'adopted',
    effective: '2027-01-01',
    note: 'أدرجته الهيئة ضمن تحديثات الاعتماد المؤرخة 26 ديسمبر 2024؛ يجب أن يظهر كإطار إفصاح قابل للتحديد عند انطباقه.',
    sourcePages: 'SOCPA 2025: 5، 13، 41'
  },
  {
    code: 'IFRS 17',
    titleAr: 'عقود التأمين',
    status: 'active',
    effective: '2023-01-01',
    note: 'موجود ضمن طبعة 2025، وقد حل محل IFRS 4 لفترات التقرير السنوية التي تبدأ في 1 يناير 2023 أو بعده.',
    sourcePages: 'SOCPA 2025: 5، 13، 31'
  },
  {
    code: 'IAS 8',
    titleAr: 'أساس إعداد القوائم المالية',
    status: 'transition',
    effective: '2027-01-01',
    note: 'تتضمن طبعة 2025 التعديلات الاستتباعية من IFRS 18، ومنها تغيير مسمى IAS 8 ونقل موضوعات من IAS 1 إليه.',
    sourcePages: 'SOCPA 2025: 6، 14، 21-22'
  },
  {
    code: 'SA-LIQ',
    titleAr: 'التقرير المالي على أساس التصفية',
    status: 'local',
    effective: null,
    note: 'مرجع سعودي محلي مستقل ضمن طبعة 2025 للحالات التي لا تعد فيها الاستمرارية أساس الإعداد المناسب.',
    sourcePages: 'SOCPA 2025: 7، 18، 22، 1432+'
  },
  {
    code: 'SA-ZAKAT',
    titleAr: 'معيار محاسبة الزكاة (المعدل)',
    status: 'local',
    effective: null,
    note: 'يظل ضمن المعايير المحلية المكملة، ويجب فصل متطلباته المحلية عن نص IFRS الدولي داخل محرك المعرفة.',
    sourcePages: 'SOCPA 2025: 7، 18-21، 1389+'
  }
]);
