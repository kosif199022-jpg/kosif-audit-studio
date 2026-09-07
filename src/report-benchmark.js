import { buildAuditorReportBlueprint } from "./audit-report-library.js";

/* The supplied annual reports are a methodology benchmark, not an archive. We
 * retain a compact numeric fact set so every displayed conclusion is
 * recomputable and traceable to a page in the packet. */
export const REFERENCE_PACKET = Object.freeze({
  fileName: "global_financial_and_audit_research_bundle.pdf",
  pageCount: 1187,
  sourceDirectories: 30,
  note: "المرفق علّم التطبيق شكل العمل ومناطق الإثبات؛ لا يُعامل كأرشيف ولا كدليل على ارتباط العميل.",
  reports: Object.freeze([
    { id: "amazon-2024", entity: "Amazon.com, Inc.", year: "2024", document: "Form 10-K", auditor: "Ernst & Young LLP", source: "الحزمة المرفقة، الصفحات المطبوعة 37–39، 43، 45", emphasis: ["القوائم متعددة السنوات", "التدفقات النقدية", "المسائل الحرجة"] },
    { id: "amazon-2023", entity: "Amazon.com, Inc.", year: "2023", document: "Form 10-K", auditor: "Ernst & Young LLP", source: "الحزمة المرفقة، الصفحات المطبوعة 37–39، 43، 45", emphasis: ["الربح التشغيلي", "التدفقات النقدية", "التقرير والرقابة"] },
    { id: "apple-2024", entity: "Apple Inc.", year: "2024", document: "Form 10-K", auditor: "Ernst & Young LLP", source: "الحزمة المرفقة، الصفحات المطبوعة 29–33، 48–50", emphasis: ["الإيراد حسب المنتج والخدمة", "المسائل الحرجة", "التدفقات النقدية"] },
    { id: "apple-2020", entity: "Apple Inc.", year: "2020", document: "Form 10-K", auditor: "Ernst & Young LLP", source: "الحزمة المرفقة، الصفحات المطبوعة 28–32، 56–58", emphasis: ["المقارنة الزمنية", "السياسات", "المسائل الحرجة"] },
    { id: "cisco-2024", entity: "Cisco Systems, Inc.", year: "2024", document: "Annual Report", auditor: "إفصاح الشركة في الحزمة", source: "الحزمة المرفقة، الصفحات المطبوعة 95–99", emphasis: ["الإيراد والهوامش", "الرقابة", "مخاطر التقنية"] },
    { id: "walmart-2023", entity: "Walmart Inc.", year: "2023", document: "Form 10-K", auditor: "Ernst & Young LLP", source: "الحزمة المرفقة، الصفحات المطبوعة 399–406", emphasis: ["التجزئة متعددة القطاعات", "الأداء المقارن", "الرقابة التشغيلية"] },
    { id: "adobe-2024", entity: "Adobe Inc.", year: "2024", document: "Form 10-K", auditor: "إفصاح الشركة في الحزمة", source: "الحزمة المرفقة، الصفحات المطبوعة 500–504", emphasis: ["الاشتراكات", "الإيراد", "الملكية الفكرية"] },
    { id: "jpmorgan-2023", entity: "JPMorgan Chase & Co.", year: "2023", document: "Form 10-K", auditor: "PricewaterhouseCoopers LLP", source: "الحزمة المرفقة، الصفحات المطبوعة 748–755", emphasis: ["صافي دخل الفائدة", "خسائر الائتمان", "السيولة والحوكمة"] },
  ]),
});

const source = (physicalPage, printedPage, statement, label) => ({ physicalPage, printedPage, statement, label });
const fact = (label, current, prior, unit = "USD millions") => ({ label, current, prior, unit });
const REPORT_DATA = [
  { id: "amazon-2024", companyId: "amazon", entity: "Amazon.com, Inc.", year: "2024", period: "Year ended December 31, 2024", type: "commerce", currency: "USD", sources: { income: source(1065, 45, "Consolidated Statements of Operations", "صافي المبيعات وتكاليف التشغيل"), balance: source(1067, 47, "Consolidated Balance Sheets", "الأصول والالتزامات"), cashFlow: source(1064, 43, "Consolidated Statements of Cash Flows", "النقد من التشغيل"), audit: source(1062, 41, "Report of Independent Registered Public Accounting Firm", "الرأي والرقابة") }, facts: { productSales: fact("Net product sales", 272311, 255887), serviceSales: fact("Net service sales", 365648, 318898), sales: fact("Total net sales", 637959, 574785), operatingExpenses: fact("Total operating expenses", 569366, 537933), operatingIncome: fact("Operating income", 68593, 36852), pretax: fact("Income before income taxes", 68614, 37557), tax: fact("Benefit (provision) for income taxes", 9265, 7120), equityMethod: fact("Equity-method investment activity, net of tax", -101, -12), netIncome: fact("Net income (loss)", 59248, 30425) } },
  { id: "amazon-2023", companyId: "amazon", entity: "Amazon.com, Inc.", year: "2023", period: "Year ended December 31, 2023", type: "commerce", currency: "USD", sources: { income: source(51, 38, "Consolidated Statements of Operations", "صافي المبيعات وتكاليف التشغيل"), balance: source(53, 40, "Consolidated Balance Sheets", "الأصول والالتزامات"), cashFlow: source(50, 37, "Consolidated Statements of Cash Flows", "النقد من التشغيل"), audit: source(48, 35, "Report of Independent Registered Public Accounting Firm", "الرأي والرقابة") }, facts: { productSales: fact("Net product sales", 255887, 242901), serviceSales: fact("Net service sales", 318898, 271082), sales: fact("Total net sales", 574785, 513983), operatingExpenses: fact("Total operating expenses", 537933, 501735), operatingIncome: fact("Operating income", 36852, 12248), pretax: fact("Income before income taxes", 37557, -5936), tax: fact("Benefit (provision) for income taxes", 7120, -3217), equityMethod: fact("Equity-method investment activity, net of tax", -12, -3), netIncome: fact("Net income (loss)", 30425, -2722) } },
  { id: "apple-2024", companyId: "apple", entity: "Apple Inc.", year: "2024", period: "Year ended September 28, 2024", type: "technology", currency: "USD", sources: { income: source(125, 29, "Consolidated Statements of Operations", "المبيعات والتكاليف والربح"), balance: source(127, 31, "Consolidated Balance Sheets", "الأصول والالتزامات"), cashFlow: source(129, 33, "Consolidated Statements of Cash Flows", "النقد من التشغيل"), audit: source(144, 48, "Report of Independent Registered Public Accounting Firm", "الرأي والمسائل الحرجة") }, facts: { productSales: fact("Products", 294866, 298085), serviceSales: fact("Services", 96169, 85200), sales: fact("Total net sales", 391035, 383285), costProducts: fact("Cost of products", 185233, 189282), costServices: fact("Cost of services", 25119, 24855), costOfSales: fact("Total cost of sales", 210352, 214137), grossMargin: fact("Gross margin", 180683, 169148), operatingExpenses: fact("Total operating expenses", 57467, 54847), operatingIncome: fact("Operating income", 123216, 114301), pretax: fact("Income before provision for income taxes", 123485, 113736), tax: fact("Provision for income taxes", 29749, 16741), netIncome: fact("Net income", 93736, 96995) } },
  { id: "apple-2020", companyId: "apple", entity: "Apple Inc.", year: "2020", period: "Year ended September 26, 2020", type: "technology", currency: "USD", sources: { income: source(945, 31, "Consolidated Statements of Operations", "المبيعات والربح"), balance: source(947, 33, "Consolidated Balance Sheets", "الأصول والالتزامات"), cashFlow: source(949, 35, "Consolidated Statements of Cash Flows", "النقد من التشغيل"), audit: source(973, 58, "Report of Independent Registered Public Accounting Firm", "الرأي والمسائل الحرجة") }, facts: { sales: fact("Total net sales", 274515, 260174), costOfSales: fact("Total cost of sales", 169559, 161782), grossMargin: fact("Gross margin", 104956, 98392), operatingExpenses: fact("Total operating expenses", 38668, 34462), operatingIncome: fact("Operating income", 66288, 63930), pretax: fact("Income before provision for income taxes", 67091, 65737), tax: fact("Provision for income taxes", 9680, 10481), netIncome: fact("Net income", 57411, 55256) } },
  { id: "cisco-2024", companyId: "cisco", entity: "Cisco Systems, Inc.", year: "2024", period: "Year ended July 27, 2024", type: "technology", currency: "USD", sources: { income: source(293, 99, "Consolidated Statements of Operations", "الإيراد والهامش"), balance: source(292, 98, "Consolidated Balance Sheets", "الأصول والالتزامات"), cashFlow: source(295, 101, "Consolidated Statements of Cash Flows", "النقد من التشغيل"), audit: source(288, 94, "Report of Independent Registered Public Accounting Firm", "الرأي والرقابة") }, facts: { productRevenue: fact("Product revenue", 39253, 43142), serviceRevenue: fact("Services revenue", 14550, 13856), revenue: fact("Total revenue", 53803, 56998), costOfSales: fact("Total cost of sales", 18975, 21245), grossMargin: fact("Gross margin", 34828, 35753), operatingExpenses: fact("Total operating expenses", 22647, 20722), operatingIncome: fact("Operating income", 12181, 15031), pretax: fact("Income before provision for income taxes", 12234, 15318), tax: fact("Provision for income taxes", 1914, 2705), netIncome: fact("Net income", 10320, 12613) } },
  { id: "walmart-2023", companyId: "walmart", entity: "Walmart Inc.", year: "2023", period: "Fiscal year ended January 31, 2023", type: "retail", currency: "USD", sources: { income: source(402, 29, "Consolidated Statements of Income", "الإيرادات والربح التشغيلي"), balance: source(404, 31, "Consolidated Balance Sheets", "الأصول والالتزامات"), cashFlow: source(406, 33, "Consolidated Statements of Cash Flows", "النقد من التشغيل"), audit: source(399, 26, "Report of Independent Registered Public Accounting Firm", "الرأي والرقابة") }, facts: { revenue: fact("Total revenues", 611289, 572754), sales: fact("Net sales", 605881, 567762), operatingIncome: fact("Operating income", 20428, 25942), pretax: fact("Income before income taxes", 17016, 18696), tax: fact("Provision for income taxes", 5724, 4756), netIncome: fact("Consolidated net income", 11292, 13940), attributableIncome: fact("Net income attributable to Walmart", 11680, 13673) } },
  { id: "adobe-2024", companyId: "adobe", entity: "Adobe Inc.", year: "2024", period: "Year ended November 29, 2024", type: "technology", currency: "USD", sources: { income: source(501, 71, "Consolidated Statements of Income", "الإيراد والربح"), balance: source(500, 70, "Consolidated Balance Sheets", "الأصول والالتزامات"), cashFlow: source(504, 74, "Consolidated Statements of Cash Flows", "النقد من التشغيل"), audit: source(498, 68, "Report of Independent Registered Public Accounting Firm", "الرأي والرقابة") }, facts: { subscription: fact("Subscription revenue", 20521, 18284), revenue: fact("Total revenue", 21505, 19409), costOfRevenue: fact("Total cost of revenue", 2358, 2354), operatingExpenses: fact("Total operating expenses", 12406, 10405), operatingIncome: fact("Operating income", 6741, 6650), pretax: fact("Income before income taxes", 6931, 6799), tax: fact("Provision for income taxes", 1371, 1371), netIncome: fact("Net income", 5560, 5428) } },
  { id: "jpmorgan-2023", companyId: "jpmorgan", entity: "JPMorgan Chase & Co.", year: "2023", period: "Year ended December 31, 2023", type: "bank", currency: "USD", sources: { income: source(751, 96, "Consolidated statements of income", "الإيرادات البنكية ومخصص الائتمان"), balance: source(753, 98, "Consolidated balance sheets", "الأصول والالتزامات وحقوق الملكية"), cashFlow: source(755, 100, "Consolidated statements of cash flows", "النقد من التشغيل"), audit: source(748, 93, "Report of Independent Registered Public Accounting Firm", "الرأي والمسائل الحرجة") }, facts: { noninterestRevenue: fact("Noninterest revenue", 68837, 61985), interestIncome: fact("Interest income", 170588, 92807), interestExpense: fact("Interest expense", 81321, 26097), netInterestIncome: fact("Net interest income", 89267, 66710), netRevenue: fact("Total net revenue", 158104, 128695), creditLossProvision: fact("Provision for credit losses", 9320, 6389), noninterestExpense: fact("Total noninterest expense", 87172, 76140), pretax: fact("Income before income tax expense", 61612, 46166), tax: fact("Income tax expense", 12060, 8490), netIncome: fact("Net income", 49552, 37676), totalAssets: fact("Total assets", 3875393, 3665743), totalLiabilities: fact("Total liabilities", 3547515, 3373411), equity: fact("Total stockholders’ equity", 327878, 292332) } },
];

export const BENCHMARK_DIMENSIONS = Object.freeze([
  { id: "recalculation", label: "إعادة الحساب", reference: "القيمة المنشورة مقابل معادلة مستقلة" },
  { id: "comparatives", label: "المقارنة الزمنية", reference: "الفترة الحالية والسابق مع تغير محسوب" },
  { id: "statement", label: "اتساق القوائم", reference: "إيراد، تكلفة، ربح، وضريبة" },
  { id: "bank", label: "نموذج القطاع", reference: "صافي دخل الفائدة وخسائر الائتمان للبنوك" },
  { id: "sources", label: "مصدر كل رقم", reference: "صفحة فعلية في الحزمة المرفقة" },
  { id: "standards", label: "الربط المعياري", reference: "مبدأ العرض والإفصاح وISA 520" },
  { id: "exceptions", label: "استثناءات قابلة للتحدي", reference: "فرق قابل للإعادة بدل درجة تخمينية" },
  { id: "ai", label: "AI محكوم", reference: "سياق مشتق، حدود، واعتماد بشري" },
]);

const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const pct = value => Math.round(value * 1000) / 10;
const money = value => n(value).toLocaleString("en-US");
function check({ id, label, computed, reported, source: sourceRef, standardId, reason, unit = "USD millions", tolerance = 0 }) {
  const delta = n(computed) - n(reported);
  return { id, label, computed: n(computed), reported: n(reported), delta, pass: Math.abs(delta) <= tolerance, unit, source: sourceRef, standardId, reason };
}

function commonChecks(report) {
  const f = report.facts;
  const checks = [];
  const incomeSource = report.sources.income;
  const revenueA = f.productSales || f.productRevenue;
  const revenueB = f.serviceSales || f.serviceRevenue;
  const revenue = f.sales || f.revenue;
  if (revenueA && revenueB && revenue) checks.push(check({ id: "revenue-bridge", label: "مكونات الإيراد = إجمالي الإيراد", computed: revenueA.current + revenueB.current, reported: revenue.current, source: incomeSource, standardId: "IAS 1 / ASC 220", reason: "اختبار جمع مستقل لعرض مكونات الإيراد؛ الفرق يفتح استثناءً بدل تمريره." }));
  if (f.costProducts && f.costServices && f.costOfSales) checks.push(check({ id: "cost-bridge", label: "تكلفة المنتجات والخدمات = إجمالي التكلفة", computed: f.costProducts.current + f.costServices.current, reported: f.costOfSales.current, source: incomeSource, standardId: "IAS 1 / ASC 220", reason: "مطابقة مكونات تكلفة المبيعات مع الإجمالي المنشور." }));
  if (f.costOfSales && revenue && f.grossMargin) checks.push(check({ id: "gross-margin-bridge", label: "الإيراد − التكلفة = مجمل الربح", computed: revenue.current - f.costOfSales.current, reported: f.grossMargin.current, source: incomeSource, standardId: "IAS 1 / ASC 220", reason: "إعادة أداء صيغة المجمل من القوائم المنشورة." }));
  if (f.grossMargin && f.operatingExpenses && f.operatingIncome) checks.push(check({ id: "operating-bridge", label: "مجمل الربح − مصروفات التشغيل = الدخل التشغيلي", computed: f.grossMargin.current - f.operatingExpenses.current, reported: f.operatingIncome.current, source: incomeSource, standardId: "IAS 1 / ASC 220", reason: "فحص اتساق طبقات قائمة الدخل بعد إعادة أداء مجمل الربح." }));
  else if (revenue && f.costOfRevenue && f.operatingExpenses && f.operatingIncome) checks.push(check({ id: "operating-bridge", label: "الإيراد − التكلفة − المصروفات = الدخل التشغيلي", computed: revenue.current - f.costOfRevenue.current - f.operatingExpenses.current, reported: f.operatingIncome.current, source: incomeSource, standardId: "IAS 1 / ASC 220", reason: "فحص اتساق طبقات قائمة الدخل." }));
  if (revenue && f.operatingExpenses && f.operatingIncome && !f.costOfRevenue && !f.grossMargin && report.type !== "bank") checks.push(check({ id: "operating-expense-bridge", label: "الإيراد − مصروفات التشغيل = الدخل التشغيلي", computed: revenue.current - f.operatingExpenses.current, reported: f.operatingIncome.current, source: incomeSource, standardId: "IAS 1 / ASC 220", reason: "اختبار العرض الخاص بالقائمة عندما تُجمع التكاليف في بند واحد." }));
  if (f.operatingIncome && f.pretax && f.tax && f.netIncome) checks.push(check({ id: "tax-bridge", label: f.equityMethod ? "قبل الضريبة − الضريبة ± نشاط حقوق الملكية = صافي الدخل" : "قبل الضريبة − الضريبة = صافي الدخل", computed: f.pretax.current - f.tax.current + (f.equityMethod?.current || 0), reported: f.netIncome.current, source: incomeSource, standardId: "IAS 12 / ASC 740", reason: f.equityMethod ? "إعادة أداء أثر الضريبة ثم بند نشاط الاستثمار بطريقة حقوق الملكية." : "إعادة حساب أثر الضريبة مع احترام إشارة المصروف." }));
  if (report.type === "bank" && f.netRevenue && f.creditLossProvision && f.noninterestExpense && f.pretax && f.tax && f.netIncome) {
    checks.push(check({ id: "bank-pretax-bridge", label: "صافي الإيرادات − مخصص الائتمان − المصروفات = قبل الضريبة", computed: f.netRevenue.current - f.creditLossProvision.current - f.noninterestExpense.current, reported: f.pretax.current, source: incomeSource, standardId: "IAS 1 / IFRS 9 / ASC 310", reason: "للبنك لا نستخدم الهامش الإجمالي؛ نفحص صافي الإيرادات بعد خسائر الائتمان والمصروفات." }));
    checks.push(check({ id: "bank-tax-bridge", label: "قبل الضريبة − ضريبة الدخل = صافي الدخل", computed: f.pretax.current - f.tax.current, reported: f.netIncome.current, source: incomeSource, standardId: "IAS 12 / IFRS 9", reason: "إعادة أداء طبقة الضريبة في قائمة دخل البنك." }));
  }
  if (f.totalAssets && f.totalLiabilities && f.equity) checks.push(check({ id: "balance-bridge", label: "الأصول = الالتزامات + حقوق الملكية", computed: f.totalLiabilities.current + f.equity.current, reported: f.totalAssets.current, source: report.sources.balance, standardId: "IAS 1 / ASC 210", reason: "اختبار توازن مستقل لقائمة المركز المالي." }));
  return checks;
}

function buildFindings(report, checks) {
  const findings = checks.filter(item => !item.pass).map(item => ({ id: `EX-${item.id}`, severity: Math.abs(item.delta) > 10 ? "عالية" : "متوسطة", title: `فرق في ${item.label}`, rationale: `النتيجة المحسوبة ${money(item.computed)} مقابل المنشور ${money(item.reported)}؛ الفرق ${money(item.delta)} ${item.unit}.`, reason: item.reason, nextStep: "راجع مصدر الاستيراد أو سياسة العرض وأعد تشغيل الاختبار بعد توثيق التغيير.", standardId: item.standardId, source: item.source }));
  if (!findings.length) findings.push({ id: "OK-RECALC", severity: "معلومة", title: "لم يظهر فرق حسابي في الاختبارات المتاحة", rationale: "تساوت الصيغ المعاد أداؤها مع القيم المنشورة ضمن البيانات المهيكلة.", reason: "هذا لا يثبت كفاية الأدلة ولا يصدر رأيًا مهنيًا.", nextStep: "اربط دفتر الأستاذ والأدلة التفصيلية وشغّل اختبارات المراجعة الخاصة بالارتباط.", standardId: "ISA 520", source: report.sources.income });
  return findings;
}

export function getBenchmarkReports() { return REPORT_DATA.map(({ facts, ...report }) => ({ ...report, facts: Object.fromEntries(Object.entries(facts).map(([key, value]) => [key, { ...value }])) })); }
export function getBenchmarkReport(id) { return getBenchmarkReports().find(report => report.id === id) || getBenchmarkReports()[0]; }
export function getBenchmarkCompanies() {
  const groups = new Map();
  for (const report of REPORT_DATA) { if (!groups.has(report.companyId)) groups.set(report.companyId, { id: report.companyId, entity: report.entity, reports: [] }); groups.get(report.companyId).reports.push({ id: report.id, year: report.year, period: report.period }); }
  return [...groups.values()];
}

export function runCompanyAnalysis(reportId, overrides = {}) {
  const base = getBenchmarkReport(reportId);
  const facts = Object.fromEntries(Object.entries(base.facts).map(([key, value]) => [key, { ...value, current: overrides[key] == null ? value.current : Number(overrides[key]) }]));
  const report = { ...base, facts };
  const checks = commonChecks(report);
  const passed = checks.filter(item => item.pass).length;
  const findings = buildFindings(report, checks);
  const changeRows = Object.entries(facts).filter(([, item]) => item.prior !== 0).map(([key, item]) => ({ key, label: item.label, current: item.current, prior: item.prior, change: item.current - item.prior, changePct: pct((item.current - item.prior) / Math.abs(item.prior)) }));
  const standards = [...new Map(checks.map(item => [item.standardId, { standardId: item.standardId, title: item.reason, rationale: `الاختبار ${item.label} يربط الرقم بالحكم الحسابي قبل تفسيره مهنياً.` }])).values()];
  const reportBlueprint = buildAuditorReportBlueprint({ engagement: { entity: { name: report.entity, period: report.period }, findings }, metrics: { accountCount: 0, mappingRate: 0, isBalanced: checks.every(item => item.pass) }, reportState: { openFindings: findings[0]?.id.startsWith("OK-") ? 0 : findings.length, pendingEvidence: 1, reportReady: false } });
  return { report, checks, findings, changeRows, standards, reportBlueprint, totals: { checks: checks.length, passed, exceptions: checks.length - passed, passRate: checks.length ? pct(passed / checks.length) : 0 }, generatedAt: new Date().toISOString(), engine: "KOSIF deterministic statement lab v2" };
}

export function buildCompanyReportText(analysis) {
  const { report, checks, findings, standards, totals, changeRows } = analysis;
  const lines = [`KOSIF — تقرير تحليلي قابل لإعادة الأداء`, `${report.entity} · ${report.period}`, `المحرك: ${analysis.engine}`, `نتيجة الاختبارات: ${totals.passed}/${totals.checks} ناجحة (${totals.passRate}%)`, "", "الاختبارات والمعادلات:"];
  checks.forEach(item => lines.push(`- ${item.label}: محسوب ${money(item.computed)} / منشور ${money(item.reported)} / فرق ${money(item.delta)} / ${item.pass ? "مطابق" : "استثناء"} / ${item.standardId} / ص${item.source.printedPage}`));
  lines.push("", "التغيرات:");
  changeRows.slice(0, 12).forEach(item => lines.push(`- ${item.label}: ${money(item.current)} مقابل ${money(item.prior)} (${item.changePct}%)`));
  lines.push("", "الملاحظات:");
  findings.forEach(item => lines.push(`- ${item.severity}: ${item.title}. ${item.rationale} السبب: ${item.reason} الإجراء: ${item.nextStep}`));
  lines.push("", "الربط المعياري:");
  standards.forEach(item => lines.push(`- ${item.standardId}: ${item.rationale}`));
  lines.push("", "حدود الاستخدام: الأرقام مأخوذة من القوائم المنشورة في الحزمة لأغراض إعادة الأداء. التقرير تحليلي قابل للمراجعة ولا يمثل رأيًا مستقلاً موقعاً ولا يغني عن أدلة الارتباط.");
  return lines.join("\n");
}

export function buildLocalAiReview({ engagement = {}, metrics = {}, reportState = {}, companyAnalysis } = {}) {
  if (companyAnalysis) {
    const { report, findings, totals, standards } = companyAnalysis;
    return { mode: "local-deterministic-company", generatedAt: new Date().toISOString(), title: `مراجع AI محلي — ${report.entity} ${report.year}`, summary: `أُعيد حساب ${totals.checks} اختبارات؛ ${totals.exceptions} استثناءات؛ نسبة المطابقة ${totals.passRate}%.`, findings, standards, guardrail: "تحليل مشتق من أرقام منشورة؛ لا يغيّر الرأي ولا يتجاوز اعتماد المراجع البشري." };
  }
  const blueprint = buildAuditorReportBlueprint({ engagement, metrics, reportState });
  const findings = [];
  if (!metrics.isBalanced) findings.push({ severity: "عالية", title: "الميزان غير متوازن", rationale: "لا يمكن اعتماد استنتاج مالي قبل تفسير فرق المدين والدائن.", nextStep: "أعد فحص مصدر الاستيراد والقيم بالوحدات الصغرى.", standardId: "ISA 520" });
  if ((metrics.mappingRate ?? 0) < 95) findings.push({ severity: "متوسطة", title: "تغطية معيارية دون 95%", rationale: "بعض الحسابات تحتاج ربطًا أو مراجعة قبل تشغيل إجراء موجه بالمعيار.", nextStep: "افتح مركز المعايير وراجع الحسابات غير المحلولة.", standardId: "ISA 315" });
  if ((reportState.pendingEvidence ?? 0) > 0) findings.push({ severity: "متوسطة", title: "أدلة معلقة", rationale: "المسودة قد تبدو مكتملة بصريًا بينما لا تزال طلبات إثبات مفتوحة.", nextStep: "اربط كل طلب بدليل وبصمة وبنتيجة اختبار.", standardId: "ISA 500" });
  if ((reportState.openFindings ?? 0) === 0) findings.push({ severity: "منخفضة", title: "لا توجد نتائج مفتوحة في سيناريو العرض", rationale: "البيانات التجريبية صُممت لعرض مسار الإصدار من البداية إلى النهاية.", nextStep: "استبدل مصدر العرض بميزان الشركة عند بدء ارتباط حقيقي.", standardId: "ISA 230" });
  return { mode: "local-deterministic", generatedAt: new Date().toISOString(), title: "مراجعة AI محلية قابلة للتكرار", summary: `حلل الإيجنت ${metrics.accountCount || 0} حسابًا عبر ${blueprint.sections.length} أقسام تقرير.`, findings, reportSections: blueprint.sections.map(section => ({ id: section.id, label: section.label, status: section.status })), guardrail: "مخرجات استشارية؛ لا تغيّر الرأي ولا تتجاوز اعتماد المراجع البشري." };
}

/* Kept for compatibility with the previous view; coverage is deliberately
 * not fabricated. The lab reports actual pass/fail counts after execution. */
export function buildBenchmarkScore({ engagement = {}, metrics = {}, reportState = {} } = {}) {
  return { total: null, label: "يُقاس بالتشغيل والفرق المحسوب", dimensions: BENCHMARK_DIMENSIONS.map(item => ({ ...item, score: null, status: "يظهر بعد تشغيل شركة" })), inputs: { accounts: metrics.accountCount ?? 0, mappingRate: metrics.mappingRate ?? 0, evidence: engagement.evidence?.length ?? 0, gates: `${reportState.passedGates ?? 0}/${reportState.gates?.length ?? 0}`, reportReady: Boolean(reportState.reportReady) } };
}
