/**
 * Reference model for the auditor's report output.
 *
 * The links below point to first-party filings or standard-setter guidance.
 * We keep metadata and paraphrased workflow cues only; the application never
 * copies protected report text into a client's workpaper.
 */
export const AUDIT_REPORT_SOURCES = Object.freeze([
  {
    id: "apple-ey-2025",
    kind: "company-filing",
    title: "Apple 2025 Form 10-K — تقرير EY عن القوائم والرقابة الداخلية",
    publisher: "Apple / U.S. SEC",
    auditor: "Ernst & Young LLP",
    url: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm",
    insight: "يفصل التقرير رأي القوائم عن رأي الرقابة الداخلية ويثبت اسم المراجع وتاريخ التقرير ومدة خدمته.",
    output: "رأي القوائم · رأي ICFR · التوقيع والتاريخ · مدة خدمة المراجع",
  },
  {
    id: "microsoft-deloitte-2025",
    kind: "company-filing",
    title: "Microsoft 2025 Annual Report — تقرير Deloitte",
    publisher: "Microsoft Investor Relations",
    auditor: "Deloitte & Touche LLP",
    url: "https://www.microsoft.com/investor/reports/ar25/index.html",
    insight: "يُظهر التقرير دور لجنة المراجعة واتصالها بالإدارة والمراجع الداخلي والمراجع الخارجي حول الرقابة والتقرير المالي.",
    output: "مسؤوليات الحوكمة · رقابة التقرير المالي · قناة لجنة المراجعة",
  },
  {
    id: "amazon-ey-2025",
    kind: "company-filing",
    title: "Amazon 2025 Form 10-K — تقرير EY",
    publisher: "Amazon / U.S. SEC",
    auditor: "Ernst & Young LLP",
    url: "https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm",
    insight: "يضع تقرير المراجع بجوار القوائم والإيضاحات، ما يدعم ربط كل استنتاج بالإفصاح والحساب والإجراء.",
    output: "ربط الإيضاح · الحساب · الإجراء · الاستنتاج",
  },
  {
    id: "iaasb-isa701",
    kind: "standard-guidance",
    title: "ISA 701 — مسائل المراجعة الرئيسية",
    publisher: "IAASB",
    auditor: "المعيار الدولي",
    url: "https://www.iaasb.org/publications/international-standard-auditing-isa-701-new-communicating-key-audit-matters-independent-auditor-s-3",
    insight: "تُختار KAM من المسائل التي أُبلغت للحوكمة وكانت ذات أهمية أكبر في مراجعة الفترة الحالية.",
    output: "سبب الأهمية · استجابة المراجع · إحالة للإيضاح ذي الصلة",
  },
  {
    id: "pcaob-as3101",
    kind: "standard-guidance",
    title: "PCAOB AS 3101 — المسائل الحرجة في المراجعة",
    publisher: "PCAOB",
    auditor: "المعيار الأمريكي",
    url: "https://pcaobus.org/oversight/standards/auditing-standards/details/AS3101",
    insight: "تتطلب CAM توثيق سبب التعقيد أو الحكم الصعب وكيف عولجت المسألة، مع منع تحويلها إلى رأي منفصل.",
    output: "CAM/KAM · الاعتبارات الرئيسة · إجراءات المعالجة · الحساب أو الإفصاح",
  },
  {
    id: "pcaob-as2201",
    kind: "standard-guidance",
    title: "PCAOB AS 2201 — مراجعة الرقابة الداخلية على التقرير المالي",
    publisher: "PCAOB",
    auditor: "المعيار الأمريكي",
    url: "https://pcaobus.org/oversight/standards/auditing-standards/details/AS2201",
    insight: "يربط تقييم الرقابة بإطار مناسب تستخدمه الإدارة، ويُبقي استنتاج الرقابة مستقلًا عن رأي القوائم.",
    output: "أهداف الرقابة · اختبار التصميم والتشغيل · استنتاج ICFR",
  },
  {
    id: "ifrs-navigator",
    kind: "standard-guidance",
    title: "IFRS Accounting Standards Navigator — قائمة المعايير",
    publisher: "IFRS Foundation / IASB",
    auditor: "المعيار الدولي",
    url: "https://www.ifrs.org/issued-standards/list-of-standards/",
    insight: "يعمل كمرجع عالمي لتثبيت المعيار المطبق على الحساب والإفصاح، مع فصل النص المعياري عن الاجتهاد المهني المحلي.",
    output: "المعيار · نطاق التطبيق · الإفصاح · تاريخ السريان",
  },
  {
    id: "frc-auditing-standards",
    kind: "standard-guidance",
    title: "FRC — Auditing Standards",
    publisher: "Financial Reporting Council",
    auditor: "المملكة المتحدة",
    url: "https://www.frc.org.uk/library/standards-codes-policy/audit-assurance-and-ethics/auditing-standards/",
    insight: "يُظهر كيف تُترجم معايير المراجعة إلى متطلبات إفصاح وتنفيذ قابلة للفحص مع ضبط تاريخ السريان.",
    output: "تاريخ السريان · متطلبات الإفصاح · إجراءات المراجعة",
  },
  {
    id: "iesba-code",
    kind: "standard-guidance",
    title: "IESBA Code — الأخلاقيات والاستقلال",
    publisher: "International Ethics Standards Board for Accountants",
    auditor: "المعيار الدولي",
    url: "https://www.ethicsboard.org/iesba-code",
    insight: "يربط الاستقلال والنزاهة والموضوعية والسرية والسلوك المهني بقبول الارتباط واستمرار الاعتماد البشري.",
    output: "مبادئ الأخلاق · تهديدات الاستقلال · استجابات الحماية",
  },
  {
    id: "socpa-standards",
    kind: "standard-guidance",
    title: "SOCPA — المعايير المحاسبية المهنية",
    publisher: "الهيئة السعودية للمراجعين والمحاسبين",
    auditor: "المملكة العربية السعودية",
    url: "https://socpa.org.sa/Socpa/Professional-standards/Accounting-standards.aspx",
    insight: "يوفر نقطة الربط المحلية عند تطبيق المعايير الدولية كما اعتمدتها الهيئة داخل ارتباط سعودي.",
    output: "الاعتماد المحلي · الإطار المطبق · مرجع الهيئة",
  },
  {
    id: "sec-edgar",
    kind: "company-filing",
    title: "SEC EDGAR — الإفصاحات الأصلية للشركات",
    publisher: "U.S. Securities and Exchange Commission",
    auditor: "مصدر إفصاح رسمي",
    url: "https://www.sec.gov/edgar/search-and-access",
    insight: "يساعد على فتح الإيداع الأصلي وربط التقرير والقوائم والإيضاحات بالمصدر الرقابي بدلاً من نسخة ثانوية.",
    output: "الإيداع الأصلي · القوائم · تقرير المراجع · الإيضاحات",
  },
]);

const sourceById = new Map(AUDIT_REPORT_SOURCES.map((source) => [source.id, source]));

const unique = (values) => [...new Set(values.filter(Boolean))];

function candidateFromFinding(finding, index) {
  const standards = unique([...(finding.standardIds || []), finding.standard].filter(Boolean));
  return {
    id: `KAM-${String(index + 1).padStart(2, "0")}`,
    title: finding.title || finding.summary || `مسألة مراجعة ${index + 1}`,
    accountOrDisclosure: finding.area || finding.roundId || "إفصاح مرتبط بالنتيجة",
    whySignificant: finding.summary || finding.recommendation || "تحتاج المسألة حكمًا مهنيًا أو استجابة موجهة بالمخاطر.",
    auditorResponse: finding.recommendation || "اربط الإجراء بالعينة والدليل والنتيجة قبل إغلاق المسألة.",
    references: unique([finding.id, finding.roundId, ...standards, ...(finding.evidenceIds || [])]),
    sourceIds: ["iaasb-isa701", "pcaob-as3101"],
  };
}

/**
 * Build an application-native auditor-report skeleton from the live engagement.
 * It is deliberately a draft model: it does not change the opinion and it
 * cannot bypass the human approval gate.
 */
export function buildAuditorReportBlueprint({ engagement = {}, metrics = {}, reportState = {} } = {}) {
  const findings = Array.isArray(engagement.findings) ? engagement.findings : [];
  const highFindings = findings
    .filter((finding) => ["high", "critical"].includes(finding.severity))
    .sort((first, second) => (second.amount || 0) - (first.amount || 0));
  const kamCandidates = highFindings.slice(0, 4).map(candidateFromFinding);
  if (!kamCandidates.length) {
    kamCandidates.push({
      id: "KAM-01",
      title: "الإيرادات والعقود",
      accountOrDisclosure: "إيرادات العقود والإفصاح المرتبط بها",
      whySignificant: "مجال يربط الاعتراف والقطع والاكتمال بمخاطر حكم مهني مرتفعة.",
      auditorResponse: "اختبر القطع، وافحص العقود والعينات والتحصيلات اللاحقة، واربط الاستنتاج بالإيضاح.",
      references: ["ISA 240", "IFRS 15", "REQ-REV-01"],
      sourceIds: ["iaasb-isa701", "pcaob-as3101"],
    });
  }

  const opinion = engagement.report?.opinion || "رأي مشتق — مسودة محكومة";
  const reportReady = Boolean(reportState.reportReady || engagement.humanApproval);
  const controlStatus = reportReady && reportState.periodLocked ? "مسودة استنتاج رقابة قابلة للمراجعة" : "بانتظار أدلة واختبارات الرقابة";
  const goingConcern = (metrics.materiality || 0) > 0
    ? "تُعرض كمجال حكم: اربط السيولة والتدفقات والتمويل والأحداث اللاحقة بأدلة الإدارة."
    : "لا يمكن إعداد استنتاج استمرارية قبل اكتمال بيانات القياس والتدفقات.";

  return {
    model: "ISA 700 · ISA 701 · ISA 705 · ISA 570 · PCAOB AS 3101/2201",
    status: reportReady ? "ready-for-human-signoff" : "draft",
    entity: engagement.entity?.name || "المنشأة الحالية",
    period: engagement.entity?.period || "الفترة الحالية",
    opinion,
    sections: [
      { id: "opinion", label: "الرأي", status: reportReady ? "جاهز للمراجعة البشرية" : "مسودة", detail: opinion, sourceIds: ["apple-ey-2025", "amazon-ey-2025"] },
      { id: "basis", label: "أساس الرأي", status: "مطلوب", detail: "اربط الرأي بالأهمية والتحريفات وقيود النطاق وسلامة الدليل.", sourceIds: ["iaasb-isa701"] },
      { id: "internal-control", label: "الرقابة الداخلية على التقرير المالي", status: controlStatus, detail: "افصل استنتاج الرقابة عن رأي القوائم، وسجّل الإطار والاختبارات والاستثناءات.", sourceIds: ["apple-ey-2025", "microsoft-deloitte-2025", "pcaob-as2201"] },
      { id: "going-concern", label: "الاستمرارية", status: "حكم مهني", detail: goingConcern, sourceIds: ["iaasb-isa701"] },
      { id: "other-information", label: "المعلومات الأخرى", status: "مسار مستقل", detail: "سجّل ما قُرئ، وما إذا وُجد تحريف جوهري غير مصحح في المعلومات الأخرى.", sourceIds: ["microsoft-deloitte-2025"] },
      { id: "governance", label: "التواصل مع الحوكمة", status: "قابل للتتبع", detail: "أظهر لجنة المراجعة والقرارات والمجالات التي صعدت إلى KAM/CAM.", sourceIds: ["microsoft-deloitte-2025", "pcaob-as3101"] },
      { id: "tenure", label: "هوية المراجع ومدة خدمته", status: "إفصاح", detail: "ثبّت اسم مكتب المراجعة وتاريخ التقرير ومدة الخدمة عند توافرها في الإفصاح.", sourceIds: ["apple-ey-2025"] },
    ],
    keyAuditMatters: kamCandidates,
    sourceIds: unique(kamCandidates.flatMap((item) => item.sourceIds).concat([
      "apple-ey-2025",
      "microsoft-deloitte-2025",
      "amazon-ey-2025",
      "ifrs-navigator",
      "frc-auditing-standards",
      "iesba-code",
      "socpa-standards",
      "sec-edgar",
    ])),
    trace: {
      accountCount: metrics.accountCount ?? 0,
      materiality: metrics.materiality ?? 0,
      evidenceCount: engagement.evidence?.length ?? 0,
      findingCount: findings.length,
      reportReady,
    },
  };
}

export function getAuditReportSource(id) {
  return sourceById.get(id) || null;
}
