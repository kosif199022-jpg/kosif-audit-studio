import { buildAuditorReportBlueprint } from "./audit-report-library.js";

/**
 * Structured index of the reference packet supplied for the demo.
 *
 * The PDF is used as a methodology benchmark only. We deliberately store
 * descriptors and observed sections instead of copying report text or
 * importing the source document into the product.
 */
export const REFERENCE_PACKET = Object.freeze({
  fileName: "global_financial_and_audit_research_bundle.pdf",
  pageCount: 1187,
  sourceDirectories: 30,
  note: "فهرس منهجي مستخلص من الحزمة المرفقة؛ لا يمثل رأيًا مهنيًا في أي شركة.",
  reports: Object.freeze([
    {
      id: "amazon-2024",
      entity: "Amazon.com, Inc.",
      year: "2024",
      document: "Form 10-K",
      auditor: "Ernst & Young LLP",
      emphasis: ["الرأي والرقابة الداخلية", "المسائل الضريبية الحرجة", "مخاطر السوق والسيولة", "إيضاحات متعددة السنوات"],
    },
    {
      id: "amazon-2023",
      entity: "Amazon.com, Inc.",
      year: "2023",
      document: "Annual Report / Form 10-K",
      auditor: "Ernst & Young LLP",
      emphasis: ["مؤشرات التشغيل والتدفق النقدي", "المخاطر التشغيلية", "المعلومات الأخرى", "التقارير المالية والرقابة"],
    },
    {
      id: "apple-2024",
      entity: "Apple Inc.",
      year: "2024",
      document: "Form 10-K",
      auditor: "Ernst & Young LLP",
      emphasis: ["المسائل الحرجة", "الرقابة على التقرير المالي", "الاستمرارية والإفصاحات", "الشركات التابعة والحوكمة"],
    },
    {
      id: "apple-2020",
      entity: "Apple Inc.",
      year: "2020",
      document: "Form 10-K",
      auditor: "Ernst & Young LLP",
      emphasis: ["المقارنة الزمنية", "المسائل الحرجة", "الإيضاحات والسياسات", "التوقيعات والشهادات"],
    },
    {
      id: "cisco-2024",
      entity: "Cisco Systems, Inc.",
      year: "2024",
      document: "Annual Report",
      auditor: "إفصاح شركة مدرجة",
      emphasis: ["الاستدامة وأهداف الانبعاثات", "الحوكمة وإدارة المخاطر", "الموظفون وسلسلة التوريد", "ربط الاستراتيجية بالمؤشرات"],
    },
    {
      id: "walmart-2023",
      entity: "Walmart Inc.",
      year: "2023",
      document: "Form 10-K",
      auditor: "Ernst & Young LLP",
      emphasis: ["التجزئة متعددة القطاعات", "المخاطر القانونية والتشغيلية", "الرقابة الداخلية", "الأداء المقارن"],
    },
    {
      id: "adobe-2024",
      entity: "Adobe Inc.",
      year: "2024",
      document: "Form 10-K",
      auditor: "إفصاح شركة تقنية",
      emphasis: ["الإيراد القائم على الاشتراكات", "الملكية الفكرية", "الذكاء الاصطناعي والمنتج", "مخاطر السوق"],
    },
    {
      id: "jpmorgan-2023",
      entity: "JPMorgan Chase & Co.",
      year: "2023",
      document: "Form 10-K",
      auditor: "PricewaterhouseCoopers LLP",
      emphasis: ["مخاطر الائتمان والخسائر", "السيولة واختبارات الضغط", "المخاطر السوقية", "المسائل الحرجة والحوكمة"],
    },
  ]),
});

export const BENCHMARK_DIMENSIONS = Object.freeze([
  { id: "opinion", label: "الرأي وأساسه", reference: "رأي مستقل + أساس رأي قابل للقراءة" },
  { id: "controls", label: "الرقابة الداخلية", reference: "استنتاج منفصل وإطار ضوابط" },
  { id: "kam", label: "KAM / CAM", reference: "مسألة جوهرية مع سبب واستجابة" },
  { id: "risk", label: "المخاطر والإفصاح", reference: "مخاطر تشغيلية وقانونية وسوقية" },
  { id: "governance", label: "الحوكمة", reference: "مسار لجنة المراجعة والاتصال" },
  { id: "sustainability", label: "الاستدامة والأثر", reference: "أهداف ومؤشرات ومسؤولية" },
  { id: "traceability", label: "التتبع وإعادة الإنتاج", reference: "مصدر، معيار، دليل، نتيجة" },
  { id: "ai", label: "مساعدة AI محكومة", reference: "تحليل قابل للتكرار مع مراجعة بشرية" },
]);

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function ratio(value, total) {
  return total > 0 ? (value / total) * 100 : 0;
}

/**
 * Score the live engagement against the report-production capabilities seen
 * in the packet. This is a coverage score, not a claim that the app replaces
 * an audit firm or a signed report.
 */
export function buildBenchmarkScore({ engagement = {}, metrics = {}, reportState = {} } = {}) {
  const evidenceScore = clamp(ratio(engagement.evidence?.length || 0, 8));
  const gatesScore = clamp(ratio(reportState.passedGates || 0, reportState.gates?.length || 12));
  const mappingScore = clamp(metrics.mappingRate ?? 0);
  const integrityScore = metrics.isBalanced ? 100 : 35;
  const reportScore = reportState.reportReady ? 100 : clamp(gatesScore * 0.7 + (engagement.humanApproval ? 30 : 0));
  const traceScore = clamp((mappingScore * 0.45) + (evidenceScore * 0.25) + (gatesScore * 0.3));
  const aiScore = engagement.demo?.synthetic === true ? 92 : 76;
  const values = {
    opinion: reportScore,
    controls: gatesScore,
    kam: clamp((engagement.findings?.length ? 68 : 40) + (engagement.rounds?.length ? 20 : 0)),
    risk: clamp((reportState.openFindings === 0 ? 90 : 58) + (reportState.pendingEvidence === 0 ? 10 : 0)),
    governance: gatesScore,
    sustainability: 72,
    traceability: traceScore,
    ai: aiScore,
  };
  const dimensions = BENCHMARK_DIMENSIONS.map((dimension) => ({
    ...dimension,
    score: Math.round(values[dimension.id]),
    status: values[dimension.id] >= 85 ? "قوي" : values[dimension.id] >= 65 ? "قابل للتحسين" : "يحتاج إجراء",
  }));
  const total = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
  return {
    total,
    dimensions,
    label: total >= 85 ? "جاهزية عرض مؤسسية" : total >= 70 ? "جاهزية تشغيلية متقدمة" : "مسودة تحتاج متابعة",
    inputs: {
      accounts: metrics.accountCount ?? 0,
      mappingRate: metrics.mappingRate ?? 0,
      evidence: engagement.evidence?.length ?? 0,
      gates: `${reportState.passedGates ?? 0}/${reportState.gates?.length ?? 0}`,
      reportReady: Boolean(reportState.reportReady),
    },
  };
}

/**
 * Local, deterministic AI demonstration. It is useful when an external API
 * key is not configured and makes the interview demo reproducible.
 */
export function buildLocalAiReview({ engagement = {}, metrics = {}, reportState = {} } = {}) {
  const blueprint = buildAuditorReportBlueprint({ engagement, metrics, reportState });
  const findings = [];
  if (!metrics.isBalanced) findings.push({ severity: "عالية", title: "الميزان غير متوازن", rationale: "لا يمكن اعتماد استنتاج مالي قبل تفسير فرق المدين والدائن.", nextStep: "أعد فحص مصدر الاستيراد والقيم بالوحدات الصغرى." });
  if ((metrics.mappingRate ?? 0) < 95) findings.push({ severity: "متوسطة", title: "تغطية معيارية دون 95%", rationale: "بعض الحسابات تحتاج ربطًا أو مراجعة قبل تشغيل إجراءات موجهة بالمعيار.", nextStep: "افتح مركز المعايير وراجع الحسابات غير المحلولة." });
  if ((reportState.pendingEvidence ?? 0) > 0) findings.push({ severity: "متوسطة", title: "أدلة معلقة", rationale: "المسودة قد تبدو مكتملة بصريًا بينما لا تزال طلبات إثبات مفتوحة.", nextStep: "اربط كل طلب بدليل وبصمة وبنتيجة اختبار." });
  if ((reportState.openFindings ?? 0) === 0) findings.push({ severity: "منخفضة", title: "لا توجد نتائج مفتوحة في سيناريو العرض", rationale: "البيانات التجريبية صُممت لعرض مسار الإصدار من البداية إلى النهاية.", nextStep: "استبدل مصدر العرض بميزان الشركة عند بدء ارتباط حقيقي." });
  return {
    mode: "local-deterministic",
    generatedAt: new Date().toISOString(),
    title: "مراجعة AI محلية قابلة للتكرار",
    summary: `حلل الإيجنت ${metrics.accountCount || 0} حسابًا عبر ${blueprint.sections.length} أقسام تقرير و${blueprint.keyAuditMatters.length} مسألة مرشحة.`,
    findings,
    reportSections: blueprint.sections.map((section) => ({ id: section.id, label: section.label, status: section.status })),
    guardrail: "مخرجات استشارية؛ لا تغيّر الرأي ولا تتجاوز اعتماد المراجع البشري.",
  };
}

