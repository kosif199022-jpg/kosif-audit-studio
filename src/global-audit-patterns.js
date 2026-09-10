const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g;

export const GLOBAL_AUDIT_PATTERNS = Object.freeze([
  Object.freeze({
    id: "kam-cam",
    theme: "key-audit-matters",
    titleAr: "المسائل الرئيسية والحرجة للمراجعة",
    shortAr: "حوّل الخطر الجوهري إلى قصة مراجعة قابلة للتتبع: لماذا هو مهم، كيف عولج، وأين الإفصاح.",
    sourceExamples: Object.freeze([
      Object.freeze({ entity: "Mercedes-Benz Group", period: "2025", jurisdiction: "EU / Germany", locator: "Independent Auditor’s Report, pp. 390–391", sourceFamily: "Annual report / ISA" }),
      Object.freeze({ entity: "Amazon.com, Inc.", period: "2023", jurisdiction: "United States", locator: "Form 10-K, auditor report, printed pp. 35–36", sourceFamily: "SEC / PCAOB" }),
    ]),
    assertions: Object.freeze(["التقييم", "الوجود", "الاكتمال", "العرض والإفصاح"]),
    standards: Object.freeze(["ISA 701", "ISA 260", "ISA 315", "ISA 330", "ISA 500"]),
    riskSignals: Object.freeze(["تقدير معقد", "تعرض جوهري", "حكم مهني مرتفع", "معاملة غير اعتيادية", "تغير تنظيمي"]),
    procedures: Object.freeze([
      "وثّق سبب تصنيف المسألة على أنها من أكثر المسائل أهمية خلال المراجعة وربطها بالحسابات والإفصاحات ذات الصلة.",
      "اربط الخطر بإجراءات استجابة محددة ونتائج الاختبارات والأدلة بدل الاكتفاء بوصف عام.",
      "حدد أين استعان الفريق بخبير أو اختبر نموذجًا أو ضوابط أو بيانات خارجية، ووثّق نتيجة كل مسار.",
      "نفّذ مراجعة اتساق بين صياغة المسألة وملف العمل والإفصاح النهائي قبل إدراجها في مسودة التقرير.",
    ]),
    evidence: Object.freeze(["ورقة تقييم المخاطر", "ملخص إجراءات الاستجابة", "نتائج اختبارات الضوابط والتفاصيل", "مذكرة الخبير عند الحاجة", "مرجع صفحة الإفصاح"]),
  }),
  Object.freeze({
    id: "estimate-sensitivity",
    theme: "accounting-estimates",
    titleAr: "التقديرات المحاسبية وتحليل الحساسية",
    shortAr: "اختبر الافتراضات والنماذج وحساسية النتيجة بدل مراجعة الرقم النهائي فقط.",
    sourceExamples: Object.freeze([
      Object.freeze({ entity: "Amazon.com, Inc.", period: "2023", jurisdiction: "United States", locator: "Critical Accounting Estimates — inventories and income taxes", sourceFamily: "SEC filing" }),
      Object.freeze({ entity: "Mercedes-Benz Group", period: "2025", jurisdiction: "EU / Germany", locator: "KAM — residual values of operating leases", sourceFamily: "Annual report / ISA" }),
      Object.freeze({ entity: "Allianz SE", period: "2025", jurisdiction: "EU / Germany", locator: "KAM — claims provisions", sourceFamily: "Annual report / ISA" }),
    ]),
    assertions: Object.freeze(["التقييم", "الدقة", "الاكتمال", "العرض والإفصاح"]),
    standards: Object.freeze(["ISA 540", "ISA 315", "ISA 330", "ISA 500"]),
    riskSignals: Object.freeze(["عدم يقين تقدير", "افتراضات مستقبلية", "نموذج تقييم", "بيانات سوق", "تحيز إدارة"]),
    procedures: Object.freeze([
      "حدد الافتراضات المؤثرة والبيانات الداخلة في النموذج وافصل بين بيانات الإدارة والبيانات الخارجية.",
      "أعد أداء الحساب على أساس البيانات المصدرية الموثقة واختبر منطق النموذج وحدوده.",
      "نفّذ حساسية متدرجة على الافتراضات الجوهرية وحدد نقطة التحول التي يصبح عندها الأثر جوهريًا.",
      "قارن نتائج الفترة الحالية بالتقديرات السابقة والنتائج الفعلية للبحث عن تحيز منهجي في التقدير.",
    ]),
    evidence: Object.freeze(["نموذج التقدير المعتمد", "مصادر افتراضات السوق", "تحليل الحساسية", "Back-testing للفترات السابقة", "اعتماد الإدارة/لجنة المراجعة"]),
  }),
  Object.freeze({
    id: "icfr-controls",
    theme: "internal-control",
    titleAr: "الرقابة الداخلية وفعالية ICFR",
    shortAr: "افصل تصميم الرقابة عن تشغيلها واربط العيوب بالأثر المالي والحوكمة.",
    sourceExamples: Object.freeze([
      Object.freeze({ entity: "Toyota Motor Corporation", period: "FY2026", jurisdiction: "Japan / United States filing", locator: "ICFR management evaluation and auditor attestation, around printed pp. 141–142", sourceFamily: "20-F / SOX 404" }),
    ]),
    assertions: Object.freeze(["الاكتمال", "الحدوث", "الدقة", "التصنيف"]),
    standards: Object.freeze(["ISA 315", "ISA 330", "ISA 265", "ISA 260"]),
    riskSignals: Object.freeze(["اعتماد على الأنظمة", "ضوابط آلية", "تجاوز الإدارة", "قصور رقابي", "تغيير نظام"]),
    procedures: Object.freeze([
      "وثّق Walkthrough من بداية المعاملة حتى القيد والإفصاح مع تحديد نقاط الرقابة الرئيسية.",
      "اختبر تصميم الرقابة أولًا ثم فعالية التشغيل على عينة تغطي الفترة والتغيرات النظامية.",
      "اربط كل استثناء رقابي بالحسابات والتأكيدات والمخاطر التي يمكن أن تتأثر به.",
      "صنّف القصور وفق أثره واحتماله وارفع المسائل المهمة لمسار تواصل الحوكمة قبل التقرير.",
    ]),
    evidence: Object.freeze(["خرائط العمليات", "مصفوفة RCM", "عينات تشغيل الضوابط", "سجل الاستثناءات", "مراسلات الحوكمة"]),
  }),
  Object.freeze({
    id: "non-gaap-apm",
    theme: "reporting-quality",
    titleAr: "مصالحات Non-GAAP وAPM",
    shortAr: "أعد بناء الجسر من المقياس النظامي إلى المقياس المعدل وافحص الاتساق والتسمية وقابلية المقارنة.",
    sourceExamples: Object.freeze([
      Object.freeze({ entity: "PepsiCo", period: "2025", jurisdiction: "United States", locator: "GAAP / Non-GAAP reconciliations, printed pp. 129–130", sourceFamily: "Annual report" }),
      Object.freeze({ entity: "Amazon.com, Inc.", period: "2023", jurisdiction: "United States", locator: "Free cash flow reconciliations, printed pp. 28–30", sourceFamily: "Form 10-K" }),
    ]),
    assertions: Object.freeze(["الدقة", "التصنيف", "العرض والإفصاح", "الاتساق"]),
    standards: Object.freeze(["ISA 720", "ISA 500", "IFRS 18"]),
    riskSignals: Object.freeze(["مقياس بديل", "استبعاد متكرر", "تعريف متغير", "مصالحة غير مكتملة", "مقارنة مضللة"]),
    procedures: Object.freeze([
      "أعد بناء المقياس البديل من أرقام القوائم النظامية بندًا بندًا مع منع أي تعديل بلا مصدر.",
      "قارن تعريف المقياس والتعديلات بالفترة السابقة وحدد أي تغيير في السياسة أو التسمية.",
      "افحص ما إذا كانت البنود المستبعدة متكررة بطبيعتها أو قد تُعرض بصورة تضعف قابلية المقارنة.",
      "تحقق من اكتمال المصالحة والإيضاحات وحدود المقياس قبل استخدامه في التحليل أو التقرير.",
    ]),
    evidence: Object.freeze(["جدول المصالحة", "مصدر كل تعديل", "سياسة تعريف المقياس", "مقارنة الفترات", "مراجعة العرض والإفصاح"]),
  }),
  Object.freeze({
    id: "auditor-independence-fees",
    theme: "independence",
    titleAr: "استقلال المراجع ورسوم الخدمات",
    shortAr: "راقب مزيج الرسوم والموافقات المسبقة والخدمات غير التدقيقية كإشارة حوكمة لا كحكم آلي على الاستقلال.",
    sourceExamples: Object.freeze([
      Object.freeze({ entity: "MUFG", period: "FY2026", jurisdiction: "Japan / United States filing", locator: "Principal Accountant Fees and Services, around printed p. 152", sourceFamily: "20-F" }),
      Object.freeze({ entity: "Toyota Motor Corporation", period: "FY2026", jurisdiction: "Japan / United States filing", locator: "Audit & Supervisory Committee pre-approval policy, around printed pp. 143–144", sourceFamily: "20-F" }),
    ]),
    assertions: Object.freeze(["الاكتمال", "التصنيف", "العرض والإفصاح"]),
    standards: Object.freeze(["ISA 260", "IESBA Code"]),
    riskSignals: Object.freeze(["رسوم غير تدقيق مرتفعة", "نمو غير معتاد في الرسوم", "خدمة بلا موافقة مسبقة", "فترة تعيين طويلة"]),
    procedures: Object.freeze([
      "صنّف الرسوم إلى تدقيق وتدقيق ذي صلة وضريبة وخدمات أخرى مع مطابقة العقود والفواتير.",
      "احسب نسب الخدمات غير التدقيقية إلى رسوم التدقيق واتجاهها عبر الفترات دون تحويلها إلى حد استقلال آلي.",
      "تحقق من الموافقات المسبقة ونطاق كل خدمة ومن صاحب الصلاحية وتاريخ القرار.",
      "وثّق تقييم التهديدات والضمانات وأي مسألة أُحيلت للجنة المراجعة أو مسؤول الحوكمة.",
    ]),
    evidence: Object.freeze(["سجل الرسوم", "عقود الخدمات", "موافقات اللجنة", "تقييم الاستقلال", "إفصاح الرسوم النهائي"]),
  }),
  Object.freeze({
    id: "audit-committee-governance",
    theme: "governance",
    titleAr: "حوكمة لجنة المراجعة",
    shortAr: "حوّل مسؤوليات اللجنة إلى مصفوفة أعمال وقرارات وأدلة بدل قائمة وصفية ساكنة.",
    sourceExamples: Object.freeze([
      Object.freeze({ entity: "AstraZeneca", period: "2025", jurisdiction: "United Kingdom", locator: "Audit Committee Report, around printed pp. 83–89", sourceFamily: "Annual report" }),
    ]),
    assertions: Object.freeze(["العرض والإفصاح", "الاكتمال", "الاستمرارية"]),
    standards: Object.freeze(["ISA 260", "ISA 265", "ISA 570"]),
    riskSignals: Object.freeze(["حكم محاسبي مهم", "مخاطر سيبرانية", "استمرارية", "تغيير مراجع", "ضمان استدامة"]),
    procedures: Object.freeze([
      "ابنِ أجندة سنوية تربط كل مسؤولية للجنة بمسألة وقرار ومالك وتاريخ ودليل إغلاق.",
      "اربط التقديرات والأحكام المحاسبية الجوهرية بمحاضر المناقشة واعتراضات اللجنة ورد الإدارة.",
      "تابع الرقابة الداخلية والمخاطر السيبرانية والمراجعة الداخلية والخارجية في سجل واحد قابل للتتبع.",
      "تحقق من أن مسائل الاستمرارية والجدوى والتقارير غير المالية تمت مناقشتها وفق نطاق الارتباط الفعلي.",
    ]),
    evidence: Object.freeze(["محاضر اللجنة", "حزمة الاجتماع", "سجل القرارات", "تقارير الرقابة والمخاطر", "متابعة الإجراءات المفتوحة"]),
  }),
  Object.freeze({
    id: "market-fx-risk",
    theme: "market-risk",
    titleAr: "مخاطر السوق والعملات والحساسية",
    shortAr: "اربط التعرض الفعلي بسيناريوهات معدلات الفائدة والعملات والقيمة العادلة وبالإفصاح المنشور.",
    sourceExamples: Object.freeze([
      Object.freeze({ entity: "Amazon.com, Inc.", period: "2023", jurisdiction: "United States", locator: "Item 7A — market risk and FX sensitivity, printed pp. 32–33", sourceFamily: "Form 10-K" }),
    ]),
    assertions: Object.freeze(["التقييم", "الدقة", "العرض والإفصاح"]),
    standards: Object.freeze(["IFRS 7", "IAS 21", "ISA 540", "ISA 500"]),
    riskSignals: Object.freeze(["عملة أجنبية", "سعر فائدة", "قيمة عادلة", "استثمار متقلب", "تحوط"]),
    procedures: Object.freeze([
      "طابق أرصدة التعرض حسب العملة والأداة مع الدفاتر وسجلات الخزانة قبل بناء سيناريو الحساسية.",
      "أعد أداء حساسية موحدة بنقاط أساس/نسب محددة واحتفظ بكل افتراض وإصدار للحساب.",
      "افحص اتساق السيناريوهات مع الإفصاح وممارسات إدارة المخاطر وعدم خلط الأثر المحاسبي بالأثر الاقتصادي.",
      "اختبر عينة من أسعار الإقفال أو منحنيات العائد إلى مصادر مستقلة عند جوهرية التعرض.",
    ]),
    evidence: Object.freeze(["كشف العملات والأدوات", "أسعار مستقلة", "حساب الحساسية", "سياسة الخزانة", "مرجع الإفصاح"]),
  }),
  Object.freeze({
    id: "going-concern-viability",
    theme: "going-concern",
    titleAr: "الاستمرارية والجدوى والسيولة",
    shortAr: "اختبر نموذج الإدارة تحت ضغط واربط الافتراضات بالتدفقات والتعهدات والأحداث اللاحقة.",
    sourceExamples: Object.freeze([
      Object.freeze({ entity: "AstraZeneca", period: "2025", jurisdiction: "United Kingdom", locator: "Audit Committee review of going concern and viability analysis", sourceFamily: "Annual report" }),
    ]),
    assertions: Object.freeze(["الاستمرارية", "الاكتمال", "التقييم", "العرض والإفصاح"]),
    standards: Object.freeze(["ISA 570", "IAS 1", "ISA 560", "ISA 500"]),
    riskSignals: Object.freeze(["سيولة ضعيفة", "تعهدات تمويل", "تدفق نقدي سلبي", "اعتماد على تمويل", "حدث لاحق"]),
    procedures: Object.freeze([
      "أعد ربط نموذج التدفقات النقدية بأرصدة البداية والميزانية والتوقعات المعتمدة وحدد مصدر كل افتراض.",
      "اختبر سيناريوهات ضغط معقولة وعكسية لتحديد الهامش قبل خرق التعهدات أو نفاد السيولة.",
      "تحقق من التسهيلات المتاحة وشروطها وتواريخ الاستحقاق وخطط الإدارة البديلة بأدلة خارجية عند الإمكان.",
      "راجع الأحداث اللاحقة حتى تاريخ التقرير وحدد ما إذا كانت الإفصاحات تصف عدم اليقين الجوهري بصورة متسقة.",
    ]),
    evidence: Object.freeze(["نموذج التدفقات", "عقود التمويل والتعهدات", "سيناريوهات الضغط", "محاضر الإدارة/اللجنة", "فحص الأحداث اللاحقة"]),
  }),
  Object.freeze({
    id: "cyber-governance",
    theme: "cyber-risk",
    titleAr: "حوكمة الأمن السيبراني وأثره المالي",
    shortAr: "اربط تهديدات الأمن بالأنظمة المالية والضوابط والاستجابة للحوادث بدل تقييم تقني منفصل.",
    sourceExamples: Object.freeze([
      Object.freeze({ entity: "Amazon.com, Inc.", period: "2023", jurisdiction: "United States", locator: "Item 1C — Cybersecurity, printed pp. 16–17", sourceFamily: "Form 10-K" }),
      Object.freeze({ entity: "AstraZeneca", period: "2025", jurisdiction: "United Kingdom", locator: "Audit Committee cyber-risk oversight", sourceFamily: "Annual report" }),
    ]),
    assertions: Object.freeze(["الاكتمال", "الدقة", "الوجود", "الحدوث"]),
    standards: Object.freeze(["ISA 315", "ISA 330", "ISA 402"]),
    riskSignals: Object.freeze(["نظام مالي حرج", "مزود طرف ثالث", "حادث أمني", "تغيير صلاحيات", "انقطاع خدمة"]),
    procedures: Object.freeze([
      "حدد الأنظمة والتكاملات التي يمكن أن تؤثر على دفتر الأستاذ أو التقارير واربطها بمالك ورقابة رئيسية.",
      "راجع إدارة الوصول والتغييرات والنسخ الاحتياطي والاستجابة للحوادث للفترة ذات الصلة بالتقرير المالي.",
      "قيّم أثر حوادث الأمن والانقطاعات على اكتمال المعاملات والتقديرات والإفصاحات وليس على التقنية وحدها.",
      "للمزودين الخارجيين، وثّق حدود المسؤولية والضوابط التكميلية وأدلة الاعتماد قبل الاعتماد على مخرجاتهم.",
    ]),
    evidence: Object.freeze(["مصفوفة الأنظمة المالية", "سجلات الوصول والتغيير", "سجل الحوادث", "اختبارات الاستعادة", "تقارير مزودي الخدمة"]),
  }),
  Object.freeze({
    id: "sustainability-assurance",
    theme: "sustainability",
    titleAr: "ربط التقارير المالية بضمان الاستدامة",
    shortAr: "افصل نطاق الضمان غير المالي عن المراجعة المالية واربط نقاط الالتقاء والحوكمة بوضوح.",
    sourceExamples: Object.freeze([
      Object.freeze({ entity: "AstraZeneca", period: "2025", jurisdiction: "United Kingdom", locator: "Audit Committee oversight of sustainability reporting assurance", sourceFamily: "Annual report" }),
      Object.freeze({ entity: "Deutsche Telekom", period: "2025", jurisdiction: "EU / Germany", locator: "Supervisory Board review of combined sustainability statement and assurance", sourceFamily: "Annual report" }),
    ]),
    assertions: Object.freeze(["الاكتمال", "الدقة", "العرض والإفصاح", "الاتساق"]),
    standards: Object.freeze(["ISSA 5000", "ISA 720", "ISA 260"]),
    riskSignals: Object.freeze(["مؤشر غير مالي", "معلومة مشتركة", "تقدير انبعاثات", "حدود نطاق", "مزود بيانات"]),
    procedures: Object.freeze([
      "حدد نقاط التقاطع بين المقاييس غير المالية والقوائم المالية مثل المخصصات والأصول والالتزامات والافتراضات المناخية.",
      "وثّق حدود نطاق كل ارتباط ومن المسؤول عن الضمان لتجنب الإيحاء بأن المراجعة المالية تغطي معلومات غير مدققة.",
      "اختبر اتساق المقاييس المشتركة والتعريفات والفترات ومصادر البيانات بين التقريرين.",
      "اربط المسائل الجوهرية وقرارات اللجنة بمراجع مصدرية وإجراءات متابعة مستقلة.",
    ]),
    evidence: Object.freeze(["مصفوفة نطاق الضمان", "تعريفات المقاييس", "مصادر البيانات", "مصالحة مالية/غير مالية", "محاضر الحوكمة"]),
  }),
]);

const PATTERN_BY_ID = new Map(GLOBAL_AUDIT_PATTERNS.map((pattern) => [pattern.id, pattern]));

export const GLOBAL_AUDIT_SOURCE_FAMILIES = Object.freeze([
  "SEC EDGAR", "Companies House", "FCA NSM", "ESMA ESEF", "SEDAR+", "ASIC", "HKEXnews", "SGX", "Saudi Tadawul",
  "Deloitte Transparency", "PwC Transparency", "EY Transparency", "KPMG Transparency", "IAASB", "IESBA", "PCAOB", "FRC", "IFIAR",
]);

export function normalizeAuditSearch(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .trim();
}

export function searchGlobalAuditPatterns(query = "", theme = "all") {
  const needle = normalizeAuditSearch(query);
  return GLOBAL_AUDIT_PATTERNS.filter((pattern) => {
    if (theme !== "all" && pattern.theme !== theme) return false;
    if (!needle) return true;
    const haystack = normalizeAuditSearch([
      pattern.titleAr,
      pattern.shortAr,
      ...pattern.assertions,
      ...pattern.standards,
      ...pattern.riskSignals,
      ...pattern.sourceExamples.flatMap((item) => [item.entity, item.period, item.jurisdiction, item.sourceFamily]),
    ].join(" "));
    return haystack.includes(needle);
  });
}

export function buildPatternAuditPlan(patternId, context = {}) {
  const pattern = PATTERN_BY_ID.get(patternId);
  if (!pattern) throw new RangeError("نمط المراجعة غير معروف.");
  const entityName = String(context.entityName || "المنشأة الحالية").slice(0, 160);
  const reviewer = String(context.reviewer || "المراجع المسؤول").slice(0, 120);
  const materialityMinor = /^-?\d+$/.test(String(context.materialityMinor ?? "0")) ? String(context.materialityMinor) : "0";
  return Object.freeze({
    schema: "kosif.global-audit-plan.v1",
    patternId: pattern.id,
    titleAr: pattern.titleAr,
    entityName,
    reviewer,
    materialityMinor,
    assertions: [...pattern.assertions],
    standards: [...pattern.standards],
    riskSignals: [...pattern.riskSignals],
    procedures: pattern.procedures.map((procedure, index) => Object.freeze({
      id: `${pattern.id.toUpperCase()}-P${String(index + 1).padStart(2, "0")}`,
      procedure,
      status: "planned",
      owner: reviewer,
      evidenceRequired: pattern.evidence[index % pattern.evidence.length],
    })),
    evidenceRequests: pattern.evidence.map((title, index) => Object.freeze({ id: `${pattern.id.toUpperCase()}-E${String(index + 1).padStart(2, "0")}`, title, status: "requested" })),
    sourceExamples: pattern.sourceExamples.map((source) => ({ ...source })),
    authority: "advisory-only-human-review-required",
    guardrailAr: "هذه الخطة تستفيد من أنماط تقارير منشورة ولا تنشئ رأيًا مهنيًا تلقائيًا؛ يجب على المراجع تقييم الملاءمة والأدلة والنتيجة واعتمادها.",
  });
}

const parseUnsignedWhole = (value) => {
  const normalized = String(value ?? "0").trim().replace(/[,_\s]/g, "");
  if (!/^\d+$/.test(normalized)) throw new TypeError("القيمة يجب أن تكون عددًا صحيحًا غير سالب.");
  return BigInt(normalized);
};

const ratioBp = (part, total) => total === 0n ? 0n : (part * 10_000n + total / 2n) / total;
const bpLabel = (bp) => `${(Number(bp) / 100).toFixed(2)}%`;

export function analyzeAuditorFees(input = {}) {
  const audit = parseUnsignedWhole(input.audit);
  const auditRelated = parseUnsignedWhole(input.auditRelated);
  const tax = parseUnsignedWhole(input.tax);
  const other = parseUnsignedWhole(input.other);
  const nonAudit = auditRelated + tax + other;
  const total = audit + nonAudit;
  const nonAuditToAuditBp = ratioBp(nonAudit, audit);
  const taxOtherToAuditBp = ratioBp(tax + other, audit);
  const flags = [];
  if (audit === 0n && nonAudit > 0n) flags.push("لا توجد رسوم تدقيق في المدخلات مع وجود خدمات أخرى؛ تحقق من نطاق الفترة والتصنيف.");
  if (nonAuditToAuditBp >= 10_000n) flags.push("الخدمات غير التدقيقية تساوي أو تتجاوز رسوم التدقيق؛ يلزم تقييم تهديدات الاستقلال والضمانات وموافقات الحوكمة.");
  if (taxOtherToAuditBp >= 5_000n) flags.push("رسوم الضريبة والخدمات الأخرى مرتفعة نسبةً إلى التدقيق؛ افحص طبيعة الخدمات والموافقة المسبقة.");
  return Object.freeze({
    audit: audit.toString(), auditRelated: auditRelated.toString(), tax: tax.toString(), other: other.toString(), nonAudit: nonAudit.toString(), total: total.toString(),
    nonAuditToAuditBp: nonAuditToAuditBp.toString(), nonAuditToAuditPct: bpLabel(nonAuditToAuditBp),
    taxOtherToAuditBp: taxOtherToAuditBp.toString(), taxOtherToAuditPct: bpLabel(taxOtherToAuditBp),
    flags,
    conclusionAr: flags.length ? "إشارات مراجعة وليست حكمًا على الاستقلال؛ وثّق التقييم البشري والموافقات." : "لم تظهر إشارة كمية مرتفعة من المزيج وحده؛ تبقى طبيعة الخدمات والموافقات والتعارضات بحاجة لتقييم بشري.",
  });
}

export function buildSensitivityScenarios(baseMinor, shocksBp = [-2000, -1000, -500, 500, 1000, 2000]) {
  const base = BigInt(String(baseMinor));
  return shocksBp.map((shockBp) => {
    if (!Number.isInteger(shockBp) || shockBp <= -10_000) throw new RangeError("نقطة الحساسية غير صالحة.");
    const factor = BigInt(10_000 + shockBp);
    const stressedMinor = (base * factor) / 10_000n;
    return Object.freeze({ shockBp, stressedMinor: stressedMinor.toString(), deltaMinor: (stressedMinor - base).toString() });
  });
}

export function getGlobalAuditThemes() {
  return [...new Map(GLOBAL_AUDIT_PATTERNS.map((pattern) => [pattern.theme, pattern.titleAr])).entries()].map(([id, label]) => ({ id, label }));
}
