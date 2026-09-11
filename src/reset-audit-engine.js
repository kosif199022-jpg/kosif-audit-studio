const DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g;

export const RESET_SCHEMA = "kosif.audit-reset.v1";
export const RESET_STORAGE_KEY = "kosif-audit-reset:v1";
export const RESET_MIGRATION_KEY = "kosif-audit-reset:migrated:v1";
export const RESET_THEME_KEY = "kosif-audit-reset:theme:v1";

export const DOCUMENT_TYPES = Object.freeze([
  ["trial_balance", "ميزان المراجعة"],
  ["general_ledger", "دفتر الأستاذ العام"],
  ["financial_statements", "القوائم المالية / المسودة"],
  ["chart_of_accounts", "دليل الحسابات"],
  ["bank_statement", "كشوف الحسابات البنكية"],
  ["bank_reconciliation", "التسويات البنكية"],
  ["receivables_aging", "أعمار الذمم المدينة"],
  ["payables_aging", "أعمار الذمم الدائنة"],
  ["inventory_listing", "كشف المخزون / محاضر الجرد"],
  ["fixed_assets", "سجل الأصول الثابتة"],
  ["revenue_support", "عقود وفواتير ومستندات الإيراد"],
  ["purchase_support", "فواتير ومرفقات المشتريات"],
  ["payroll", "مسيرات الرواتب ومنافع الموظفين"],
  ["tax_zakat", "الزكاة والضرائب والإقرارات"],
  ["legal", "المطالبات والقضايا والمراسلات القانونية"],
  ["governance", "محاضر الإدارة ولجنة المراجعة"],
  ["controls", "توثيق الرقابة الداخلية"],
  ["contracts", "العقود والاتفاقيات"],
  ["other", "مستند آخر"],
]);

export const REVIEWER_ROLES = Object.freeze([
  { id: "chair", title: "قائد مجلس المراجعين", focus: "ترجيح النتائج وتحديد ما إذا كانت الأدلة تكفي للجولة التالية أو التقرير." },
  { id: "statements", title: "مراجع القوائم والبيانات", focus: "سلامة مجموعة البيانات واتساق الميزان والدفتر والقوائم والإفصاحات." },
  { id: "evidence", title: "مراجع الأدلة", focus: "كفاية وملاءمة المستندات، وجود فجوات، وربط كل استنتاج بمصدر." },
  { id: "risk", title: "مراجع المخاطر والتقديرات", focus: "المخاطر الجوهرية والتقديرات والحساسية والاستمرارية والمؤشرات غير المعتادة." },
  { id: "quality", title: "مراجع الجودة", focus: "اتساق الاستنتاجات، القيود، نطاق العمل، وما يمنع إصدار القرار." },
]);

export function normalizeArabic(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(DIACRITICS, "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\s+/g, " ")
    .trim();
}

export function makeId(prefix = "ID") {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function inferDocumentType(name = "") {
  const n = normalizeArabic(name);
  const rules = [
    ["trial_balance", /(ميزان|trial balance|tb\b)/],
    ["general_ledger", /(استاذ|ledger|gl\b|قيود يوميه|دفتر عام)/],
    ["financial_statements", /(قوائم ماليه|financial statements|financial report|annual report)/],
    ["chart_of_accounts", /(دليل الحسابات|chart of accounts|coa\b)/],
    ["bank_reconciliation", /(تسويه بنكي|bank reconciliation)/],
    ["bank_statement", /(كشف حساب|bank statement)/],
    ["receivables_aging", /(اعمار.*مدين|receivable|aging.*ar\b)/],
    ["payables_aging", /(اعمار.*دائن|payable|aging.*ap\b)/],
    ["inventory_listing", /(مخزون|جرد|inventory|stock)/],
    ["fixed_assets", /(اصل ثابت|اصول ثابته|fixed asset|ppe)/],
    ["revenue_support", /(ايراد|مبيعات|sales|revenue|فاتور.*بيع)/],
    ["purchase_support", /(مشتريات|purchase|فاتور.*شراء)/],
    ["payroll", /(رواتب|payroll|employee benefit)/],
    ["tax_zakat", /(زكاه|ضريب|vat|tax)/],
    ["legal", /(قانون|قضاي|legal|litigation)/],
    ["governance", /(محضر|لجنه المراجعه|board|audit committee)/],
    ["controls", /(رقابه داخليه|internal control|icfr|rcm)/],
    ["contracts", /(عقد|عقود|contract|agreement)/],
  ];
  return rules.find(([, pattern]) => pattern.test(n))?.[0] || "other";
}

export function typeLabel(type) {
  return DOCUMENT_TYPES.find(([id]) => id === type)?.[1] || "مستند آخر";
}

export function createEmptyAuditState() {
  return {
    schema: RESET_SCHEMA,
    company: { name: "", period: "", activity: "", objective: "مراجعة المستندات وإصدار تقرير محكوم بعد اكتمال الأدلة." },
    documents: [],
    council: {
      status: "not_started",
      startedAt: null,
      members: REVIEWER_ROLES.map((role) => ({ ...role, enabled: true })),
    },
    rounds: [],
    requests: [],
    finalReport: null,
    auditTrail: [],
  };
}

export function sanitizeState(candidate) {
  const empty = createEmptyAuditState();
  if (!candidate || candidate.schema !== RESET_SCHEMA || typeof candidate !== "object") return empty;
  return {
    ...empty,
    ...candidate,
    company: { ...empty.company, ...(candidate.company || {}) },
    documents: Array.isArray(candidate.documents) ? candidate.documents.slice(0, 400) : [],
    council: {
      ...empty.council,
      ...(candidate.council || {}),
      members: Array.isArray(candidate.council?.members) ? candidate.council.members.slice(0, 12) : empty.council.members,
    },
    rounds: Array.isArray(candidate.rounds) ? candidate.rounds.slice(0, 100) : [],
    requests: Array.isArray(candidate.requests) ? candidate.requests.slice(0, 1000) : [],
    finalReport: candidate.finalReport && typeof candidate.finalReport === "object" ? candidate.finalReport : null,
    auditTrail: Array.isArray(candidate.auditTrail) ? candidate.auditTrail.slice(0, 3000) : [],
  };
}

export function readDocumentText(document, limit = 60_000) {
  const snippets = Array.isArray(document?.snippets) ? document.snippets : [];
  return snippets.map((item) => String(item?.text || "")).join(" \n ").slice(0, limit);
}

const portfolioHas = (documents, type) => documents.some((doc) => doc.type === type && doc.availability !== "unavailable");

const requiredCore = Object.freeze([
  { type: "trial_balance", title: "ميزان المراجعة", priority: "critical", reason: "هو نقطة البداية لربط الأرصدة والتعرضات وإجراءات المراجعة." },
  { type: "general_ledger", title: "دفتر الأستاذ العام", priority: "high", reason: "يلزم لتتبع الحركات خلف أرصدة الميزان واختبار القيود والتفاصيل." },
  { type: "financial_statements", title: "مسودة القوائم المالية", priority: "high", reason: "تلزم لمقارنة العرض والإفصاح بالأرصدة والمعلومات التي ستصدر للمستخدمين." },
  { type: "chart_of_accounts", title: "دليل الحسابات", priority: "medium", reason: "يساعد على فهم التصنيف وربط الحسابات بالدورات والمخاطر بصورة صحيحة." },
]);

const supportRules = Object.freeze([
  { type: "bank_statement", title: "كشوف الحسابات البنكية", priority: "high", trigger: /(بنك|نقد|cash|bank)/, reason: "ظهر تعرض نقدي/بنكي في المستندات المتاحة ويحتاج دليلًا خارجيًا أو كشفًا داعمًا." },
  { type: "bank_reconciliation", title: "التسويات البنكية", priority: "high", trigger: /(بنك|نقد|cash|bank)/, reason: "التعرضات البنكية تحتاج تسويات تربط كشف البنك بدفاتر الشركة." },
  { type: "receivables_aging", title: "أعمار الذمم المدينة", priority: "high", trigger: /(ذمم مدين|عملاء|receivable|customer)/, reason: "ظهرت أرصدة عملاء/ذمم وتحتاج تحليل أعمار لتقييم الوجود والتحصيل والتقدير." },
  { type: "inventory_listing", title: "كشف المخزون ومحضر الجرد", priority: "high", trigger: /(مخزون|جرد|inventory|stock)/, reason: "ظهر مخزون ضمن البيانات ويحتاج كشفًا تفصيليًا ودليل جرد وتقييم." },
  { type: "fixed_assets", title: "سجل الأصول الثابتة", priority: "medium", trigger: /(اصول ثابته|معدات|ممتلكات|ppe|fixed asset)/, reason: "ظهرت أصول ثابتة وتحتاج سجلًا تفصيليًا للحركة والإهلاك والوجود." },
  { type: "revenue_support", title: "عقود وفواتير ومستندات الإيراد", priority: "high", trigger: /(ايراد|مبيعات|revenue|sales)/, reason: "ظهر إيراد/مبيعات وتحتاج عينات عقود وفواتير وإثبات تنفيذ/تسليم." },
  { type: "payables_aging", title: "أعمار الذمم الدائنة", priority: "medium", trigger: /(ذمم دائن|مورد|payable|supplier)/, reason: "ظهرت التزامات للموردين وتحتاج أعمارًا وتفاصيل لاختبارات الاكتمال والقطع." },
]);

export function deriveRequestedDocuments(documents = [], previousRequests = []) {
  const currentText = normalizeArabic(documents.map((doc) => `${doc.name || ""} ${doc.description || ""} ${readDocumentText(doc, 20_000)}`).join(" "));
  const existingOpenTypes = new Set(previousRequests.filter((item) => ["requested", "uploaded"].includes(item.status)).map((item) => item.documentType));
  const existingUnavailableTypes = new Set(previousRequests.filter((item) => item.status === "unavailable").map((item) => item.documentType));
  const needs = [];

  for (const requirement of requiredCore) {
    if (!portfolioHas(documents, requirement.type) && !existingOpenTypes.has(requirement.type) && !existingUnavailableTypes.has(requirement.type)) {
      needs.push(requirement);
    }
  }

  if (portfolioHas(documents, "trial_balance") || portfolioHas(documents, "general_ledger")) {
    for (const rule of supportRules) {
      if (rule.trigger.test(currentText) && !portfolioHas(documents, rule.type) && !existingOpenTypes.has(rule.type) && !existingUnavailableTypes.has(rule.type)) {
        needs.push(rule);
      }
    }
  }

  return needs;
}

function documentSignals(document) {
  const text = normalizeArabic(readDocumentText(document, 35_000));
  const signals = [];
  if (!document.snippetCount && !document.snippets?.length) signals.push("لم يتوفر نص مقروء محفوظ لهذا المستند.");
  if (/استمراري|going concern/.test(text)) signals.push("إشارة إلى الاستمرارية أو السيولة؛ تحتاج تقييمًا وربطًا بالتدفقات والتمويل.");
  if (/مخصص|تقدير|قيمه عادله|impairment|fair value|estimate/.test(text)) signals.push("يتضمن تقديرًا أو قيمة محاسبية تحتاج اختبار افتراضات وحساسية.");
  if (/طرف ذو علاقه|related party/.test(text)) signals.push("يتضمن أطرافًا ذات علاقة؛ يحتاج اكتمال الإفصاح وطبيعة المعاملات.");
  if (/دعوى|قضيه|legal|litigation/.test(text)) signals.push("إشارة قانونية قد تتطلب مراسلات محامٍ وتقييم مخصص/إفصاح.");
  if (/احتيال|fraud|تجاوز الاداره|management override/.test(text)) signals.push("إشارة خطر غش/تجاوز إدارة تحتاج استجابة مراجعة موسعة.");
  if (/عمله اجنبيه|دولار|يورو|fx|foreign currency/.test(text)) signals.push("تعرض عملات أجنبية؛ يحتاج تحققًا من أسعار الإقفال والمعالجة والإفصاح.");
  return signals.slice(0, 6);
}

export function buildCouncilRound({ documents = [], requests = [], council, previousRounds = [], now = new Date().toISOString() }) {
  if (!documents.length) throw new Error("ارفع مستندًا واحدًا على الأقل قبل بدء المراجعة.");
  const enabledMembers = (council?.members || []).filter((member) => member.enabled !== false);
  if (council?.status !== "active" || enabledMembers.length < 2) throw new Error("شغّل مجلس المراجعين بعضوين على الأقل قبل بدء الجولة.");

  const roundNumber = previousRounds.length + 1;
  const newNeeds = deriveRequestedDocuments(documents, requests);
  const outstanding = requests.filter((request) => request.status === "requested");
  const unavailable = requests.filter((request) => request.status === "unavailable");
  const unreadable = documents.filter((document) => document.loadError || (!document.snippetCount && !document.snippets?.length));
  const documentReviews = documents.map((document) => ({
    documentId: document.documentId || document.id,
    name: document.name,
    type: document.type,
    typeLabel: typeLabel(document.type),
    status: document.loadError ? "unreadable" : "reviewed",
    summary: document.loadError
      ? `تعذر الاعتماد على النص المستخرج: ${document.loadError}`
      : `تمت مراجعة الفهرس المحلي (${document.snippetCount || document.snippets?.length || 0} مقطعًا) وربطه بنوع المستند ووصفه.`,
    signals: documentSignals(document),
  }));

  const requestsToCreate = newNeeds.map((need, index) => ({
    id: `REQ-R${roundNumber}-${String(index + 1).padStart(2, "0")}`,
    roundNumber,
    documentType: need.type,
    title: need.title,
    reason: need.reason,
    priority: need.priority,
    status: "requested",
    documentId: null,
    unavailableReason: "",
    createdAt: now,
    resolvedAt: null,
  }));

  let outcome = "needs_documents";
  let verdict = "الأدلة الحالية غير كافية بعد. أنشأ المجلس طلبات محددة يجب استكمالها قبل اتخاذ قرار نهائي.";
  if (!requestsToCreate.length && !outstanding.length) {
    if (unavailable.length || unreadable.length) {
      outcome = "scope_limitation";
      verdict = "اكتملت دورة الطلبات المتاحة، لكن توجد مستندات غير متوفرة أو غير قابلة للقراءة. يمكن إعداد قرار نهائي يوضح قيد نطاق الأدلة، ويظل الحكم النهائي للمراجع البشري.";
    } else {
      outcome = "ready_for_decision";
      verdict = "لم يحدد المجلس فجوة مستندية إضافية من النطاق الحالي. الأدلة المتاحة كافية للانتقال إلى إعداد القرار النهائي، بعد اعتماد المراجع البشري.";
    }
  }

  const roleOpinions = enabledMembers.map((member) => {
    if (member.id === "evidence") return { roleId: member.id, title: member.title, text: requestsToCreate.length || outstanding.length ? `هناك ${requestsToCreate.length + outstanding.length} طلبات أدلة مفتوحة أو جديدة؛ لا أوصي بالإقفال قبل معالجتها.` : unavailable.length ? "انتهت الطلبات المتاحة مع قيود موثقة؛ يجب إظهار أثر عدم توافر الأدلة في القرار." : "لم أجد طلب أدلة جديدًا من الفجوات المستندية الحالية." };
    if (member.id === "statements") return { roleId: member.id, title: member.title, text: portfolioHas(documents, "trial_balance") && portfolioHas(documents, "financial_statements") ? "توفر ميزان وقوائم ضمن الملف؛ انتقل إلى فحص الاتساق مع الدفتر والأدلة الداعمة." : "مجموعة البيانات المالية الأساسية غير مكتملة، لذلك يلزم استكمال المستندات الأساسية." };
    if (member.id === "risk") return { roleId: member.id, title: member.title, text: documentReviews.some((item) => item.signals.length) ? "ظهرت إشارات مخاطر وتقديرات في النصوص؛ يجب إبقاؤها ضمن نطاق الجولات وربطها بالأدلة قبل القرار." : "لم تظهر من النصوص المقروءة إشارة خطر إضافية واضحة، مع بقاء مسؤولية التقييم المهني على المراجع." };
    if (member.id === "quality") return { roleId: member.id, title: member.title, text: outcome === "ready_for_decision" ? "المسار المستندي الحالي قابل للإقفال من ناحية الاكتمال الإجرائي، مع ضرورة مراجعة التقرير واعتماده بشريًا." : "لا أوصي بإصدار تقرير نهائي خالٍ من القيود قبل إغلاق الطلبات أو توثيق سبب عدم توفرها." };
    return { roleId: member.id, title: member.title, text: verdict };
  });

  return {
    round: {
      id: `ROUND-${String(roundNumber).padStart(3, "0")}`,
      number: roundNumber,
      createdAt: now,
      documentCount: documents.length,
      outcome,
      verdict,
      documentReviews,
      roleOpinions,
      requestIds: requestsToCreate.map((item) => item.id),
      unavailableRequestIds: unavailable.map((item) => item.id),
      unreadableDocumentIds: unreadable.map((item) => item.documentId || item.id),
    },
    requests: requestsToCreate,
  };
}

export function buildFinalReport(state, { reviewerName = "", now = new Date().toISOString() } = {}) {
  const lastRound = state.rounds?.at?.(-1) || state.rounds?.[state.rounds.length - 1];
  if (!lastRound || lastRound.outcome === "needs_documents") throw new Error("لا يمكن إصدار القرار قبل جولة تنتهي بكفاية الأدلة أو بقيد نطاق موثق.");
  const reviewer = String(reviewerName || "").trim();
  if (reviewer.length < 3) throw new Error("اكتب اسم المراجع المسؤول قبل اعتماد التقرير.");
  const unavailable = state.requests.filter((item) => item.status === "unavailable");
  const open = state.requests.filter((item) => item.status === "requested");
  if (open.length) throw new Error("لا تزال هناك مستندات مطلوبة مفتوحة.");
  const conclusion = lastRound.outcome === "scope_limitation"
    ? "تعذر الحصول على بعض أدلة المراجعة المطلوبة. يجب تقييم أثر قيد النطاق على نوع التقرير وصياغته وفق الإطار والمعايير المطبقة."
    : "وفق المستندات والجولات المسجلة، لم يحدد مجلس المراجعين فجوة مستندية إضافية ضمن النطاق الحالي. القرار النهائي أدناه معتمد من المراجع المسؤول ولا يمثل رأيًا آليًا مستقلًا.";
  return {
    schema: "kosif.final-audit-report.v1",
    status: "approved",
    approvedAt: now,
    approvedBy: reviewer,
    company: { ...state.company },
    roundsCount: state.rounds.length,
    documentsCount: state.documents.length,
    requestsCount: state.requests.length,
    unavailableRequests: unavailable.map((item) => ({ id: item.id, title: item.title, reason: item.unavailableReason })),
    basis: lastRound.verdict,
    conclusion,
    decisionClass: lastRound.outcome === "scope_limitation" ? "scope-limited" : "evidence-sufficient",
    guardrail: "اعتماد المراجع البشري هو السلطة النهائية. مجلس KOSIF يقدم تحليلًا وتنظيمًا للأدلة ولا يحل محل الحكم المهني أو المتطلبات النظامية.",
  };
}
