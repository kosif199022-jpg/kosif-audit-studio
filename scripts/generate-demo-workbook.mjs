import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

let artifactTool;
try {
  artifactTool = await import("@oai/artifact-tool");
} catch (error) {
  const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
  if (!runtimeModules) throw error;
  artifactTool = await import(pathToFileURL(path.join(runtimeModules, "@oai/artifact-tool/dist/artifact_tool.mjs")).href);
}
const { SpreadsheetFile, Workbook } = artifactTool;

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw new Error("Usage: generate-demo-workbook.mjs <source.json> <output.xlsx>");
const data = JSON.parse(await fs.readFile(sourcePath, "utf8"));

const PURPLE = "#28134A";
const PURPLE_2 = "#45266E";
const VIOLET = "#7254D8";
const LAVENDER = "#EEE8FF";
const GOLD = "#D8AE4C";
const GOLD_SOFT = "#FFF1C9";
const GREEN = "#2D7A55";
const GREEN_SOFT = "#E2F2E8";
const RED = "#AC4B42";
const LINE = "#DED5F0";
const MUTED = "#6D6680";
const WHITE = "#FFFFFF";
const MONEY_FORMAT = '#,##0.00;[Red](#,##0.00);-';

const workbook = Workbook.create();
const summary = workbook.worksheets.add("ملخص الارتباط");
const trialBalance = workbook.worksheets.add("ميزان المراجعة");
const sourceBalance = workbook.worksheets.add("قبل التسويات");
const reportingBasis = workbook.worksheets.add("أساس التقرير");
const standards = workbook.worksheets.add("الخريطة المعيارية");
const rounds = workbook.worksheets.add("الجولات");
const evidence = workbook.worksheets.add("الأدلة");
const findings = workbook.worksheets.add("الملاحظات");
const adjustments = workbook.worksheets.add("التسويات");
const gates = workbook.worksheets.add("البوابات");
const auditTrail = workbook.worksheets.add("سجل الرقابة");
const checks = workbook.worksheets.add("المصادر والفحوص");

for (const sheet of [summary, trialBalance, sourceBalance, reportingBasis, standards, rounds, evidence, findings, adjustments, gates, auditTrail, checks]) {
  sheet.showGridLines = false;
}

function timestampText(value) {
  if (!value) return "—";
  return String(value).replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function titleBlock(sheet, title, subtitle, lastColumn, note = data.disclosure) {
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.mergeCells(`A3:${lastColumn}3`);
  sheet.mergeCells(`A4:${lastColumn}4`);
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A3").values = [[note]];
  sheet.getRange("A4").values = [[`الإصدار: ${data.artifactVersion} | مجموعة البيانات: ${data.demo.commitment.datasetId} | المصدر: ${data.siteUrl}`]];
  sheet.getRange(`A1:${lastColumn}1`).format = { fill: PURPLE, font: { bold: true, color: WHITE, size: 17 }, horizontalAlignment: "right", verticalAlignment: "center" };
  sheet.getRange(`A2:${lastColumn}2`).format = { fill: PURPLE_2, font: { bold: true, color: GOLD_SOFT, size: 10 }, horizontalAlignment: "right", verticalAlignment: "center" };
  sheet.getRange(`A3:${lastColumn}3`).format = { fill: GOLD_SOFT, font: { color: PURPLE, size: 9 }, horizontalAlignment: "right", verticalAlignment: "center", wrapText: true };
  sheet.getRange(`A4:${lastColumn}4`).format = { fill: LAVENDER, font: { color: MUTED, size: 8 }, horizontalAlignment: "right", verticalAlignment: "center", wrapText: true };
  sheet.getRange("A1").format.rowHeight = 34;
  sheet.getRange("A2").format.rowHeight = 25;
  sheet.getRange("A3").format.rowHeight = 38;
  sheet.getRange("A4").format.rowHeight = 30;
}

function writeTable(sheet, startRow, headers, rows, widths, options = {}) {
  const startColumn = options.startColumn || 0;
  const header = sheet.getRangeByIndexes(startRow, startColumn, 1, headers.length);
  header.values = [headers];
  header.format = {
    fill: PURPLE_2,
    font: { bold: true, color: WHITE, size: 9 },
    horizontalAlignment: "right",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: PURPLE_2 },
  };
  header.format.rowHeight = 30;
  if (rows.length) {
    const body = sheet.getRangeByIndexes(startRow + 1, startColumn, rows.length, headers.length);
    body.values = rows;
    body.format = {
      font: { color: "#28134A", size: 8 },
      horizontalAlignment: "right",
      verticalAlignment: "center",
      wrapText: true,
      borders: { insideHorizontal: { style: "thin", color: LINE }, bottom: { style: "thin", color: LINE } },
    };
  }
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(startRow, startColumn + index, Math.max(2, rows.length + 1), 1).format.columnWidth = width;
  });
  return { headerRow: startRow + 1, firstDataRow: startRow + 2, lastDataRow: startRow + rows.length + 1 };
}

function sectionBand(sheet, range, label) {
  sheet.mergeCells(range);
  const cell = sheet.getRange(range.split(":")[0]);
  cell.values = [[label]];
  sheet.getRange(range).format = { fill: PURPLE, font: { bold: true, color: WHITE, size: 11 }, horizontalAlignment: "right", verticalAlignment: "center" };
}

titleBlock(summary, "KOSIF Audit Workpapers - حزمة أوراق عمل 5,000 حساب", `${data.entity.name} | ${data.entity.period} | ${data.entity.currency}`, "H");
sectionBand(summary, "A6:H6", "ملخص النتائج والبوابات");
summary.getRange("A7:H7").values = [["الحسابات", null, "إجمالي المدين", null, "فرق الميزان", null, "بوابات الإصدار", null]];
summary.getRange("A8:H8").values = [[data.metrics.accountCount, null, null, null, null, null, null, null]];
const adjustedTotalRow = data.accounts.length + 7;
summary.getRange("C8").formulas = [[`='ميزان المراجعة'!G${adjustedTotalRow}`]];
summary.getRange("E8").formulas = [[`=ABS('ميزان المراجعة'!G${adjustedTotalRow}-'ميزان المراجعة'!H${adjustedTotalRow})`]];
summary.getRange("G8").formulas = [["=COUNTIF('البوابات'!D7:D18,\"PASS\")"]];
summary.getRange("A9:H9").values = [["حساب", null, "SAR", null, "يجب أن يساوي صفرًا", null, `من ${data.reportState.gates.length}`, null]];
for (const row of [7, 8, 9]) {
  for (const pair of ["A:B", "C:D", "E:F", "G:H"]) {
    const [start, end] = pair.split(":");
    summary.mergeCells(`${start}${row}:${end}${row}`);
  }
}
for (const range of ["A7:B9", "C7:D9", "E7:F9", "G7:H9"]) {
  summary.getRange(range).format = { fill: GOLD_SOFT, font: { bold: true, color: PURPLE }, horizontalAlignment: "center", verticalAlignment: "center", borders: { preset: "outside", style: "medium", color: GOLD }, wrapText: true };
}
summary.getRange("A8:H8").format.font = { bold: true, color: GREEN, size: 14 };
summary.getRange("C8:E8").format.numberFormat = MONEY_FORMAT;
sectionBand(summary, "A11:H11", "الأهمية النسبية وسياسة التنفيذ");
summary.getRange("A12:H14").values = [
  ["أساس الأهمية", "إيرادات العقود", "نسبة الأهمية", data.metrics.materiality / data.metrics.revenue, "نسبة التنفيذ", data.metrics.performanceMateriality / data.metrics.materiality, null, null],
  ["إجمالي الإيراد", data.metrics.revenue, "الأهمية الكلية", data.metrics.materiality, "أهمية التنفيذ", data.metrics.performanceMateriality, null, null],
  ["السياسة", "KOSIF-MAT-075", "المعتمد", "شريك الارتباط", "الحالة", "معتمدة داخل سيناريو العرض", null, null],
];
summary.getRange("A12:H14").format = { fill: "#FFF9E8", font: { color: PURPLE, size: 9 }, horizontalAlignment: "right", verticalAlignment: "center", wrapText: true, borders: { insideHorizontal: { style: "thin", color: LINE } } };
summary.getRange("D12:F12").format.numberFormat = "0.00%";
summary.getRange("B13:F13").format.numberFormat = MONEY_FORMAT;
summary.getRange("D12:F12").format.font = { bold: true, color: "#0000FF" };
sectionBand(summary, "A16:H16", "التحليل حسب المجال");
const areaRows = [...data.analytics.areas].sort((a, b) => b.exposure - a.exposure).map((area) => [area.key, area.label, area.accountCount, area.exposure, area.highExposure, area.high, area.medium, area.low]);
const areaTable = writeTable(summary, 16, ["مفتاح المجال", "المجال", "الحسابات", "التعرض", "تعرض مرتفع", "مرتفع", "متوسط", "منخفض"], areaRows, [18, 27, 12, 19, 19, 12, 12, 12]);
summary.getRange(`D${areaTable.firstDataRow}:E${areaTable.lastDataRow}`).format.numberFormat = MONEY_FORMAT;
const appliedSummarySectionRow = areaTable.lastDataRow + 2;
sectionBand(summary, `A${appliedSummarySectionRow}:H${appliedSummarySectionRow}`, "القدرات المحاسبية التطبيقية وجاهزية العرض");
const appliedSummary = data.appliedAccounting.summary;
const appliedCapabilityTable = writeTable(summary, appliedSummarySectionRow, ["المؤشر", "الفعلي", "الإجمالي", "الحالة", "النطاق", "مصدر القرار", "نوع المخرج", "الحد المهني"], [
  ["النماذج التطبيقية", data.appliedAccounting.models.length, data.appliedAccounting.models.length, "متاحة", "سبعة سيناريوهات محلية", "مدخلات المستخدم والميزان", "حساب ومذكرة", "لا تنشئ قيدًا أو اعتمادًا تلقائيًا"],
  ["دورة المحاسبة والإقفال", appliedSummary.cycleComplete, appliedSummary.cycleTotal, `${appliedSummary.cycleComplete}/${appliedSummary.cycleTotal}`, "من التسجيل إلى الإصدار", "حالة الارتباط", "قائمة جاهزية", "اكتمال الخطوة لا يستبدل دليلها"],
  ["جاهزية IFRS 18", appliedSummary.ifrs18Passed, appliedSummary.ifrs18Total, `${appliedSummary.ifrs18Passed}/${appliedSummary.ifrs18Total}`, "التصنيف وMPM والتجميع والانتقال", "قرارات بشرية موثقة", "فحص استعداد", "لا يقدم المعيار كنافذ على فترة 2025"],
  ["مواد المعرفة الفريدة", data.appliedAccounting.knowledgeCoverage.uniqueVideos, data.appliedAccounting.knowledgeCoverage.listedAppearances, "جرد تعليمي", `${data.appliedAccounting.knowledgeCoverage.sources.length} مصدرًا`, "عناوين وأوصاف ومحاور متاحة", "فهرس مصادر", "ليست نصوصًا معيارية أو أدلة مراجعة"],
], [30, 14, 14, 18, 42, 38, 25, 52]);
const appliedModelsSectionRow = appliedCapabilityTable.lastDataRow + 2;
sectionBand(summary, `A${appliedModelsSectionRow}:H${appliedModelsSectionRow}`, "النماذج التطبيقية السبعة");
writeTable(summary, appliedModelsSectionRow, ["المعرف", "المعيار", "النموذج", "الوصف"], data.appliedAccounting.models.map((model) => [
  model.id, model.standardId, model.title, model.description,
]), [18, 15, 48, 95]);
summary.freezePanes.freezeRows(6);

titleBlock(trialBalance, "ميزان المراجعة المعدل - 5,000 حساب", `${data.entity.name} | بعد القيود المرحلة، مع حفظ ميزان المصدر في ورقة مستقلة`, "V");
const tbRows = data.accounts.map((account, index) => [
  index + 1,
  account.id,
  account.code,
  account.name,
  account.areaLabel,
  account.nature,
  account.debit,
  account.credit,
  account.amount,
  account.currency,
  account.functionalCurrency,
  account.monetaryItem ? "نقدي" : "غير نقدي",
  account.closingRate ?? "—",
  account.risk,
  account.mappingStatus === "reviewed" ? "قرار مراجع" : "اقتراح منهجي",
  (account.effectiveAccountingStandards || []).join(" | "),
  (account.effectiveAuditStandards || []).join(" | "),
  (account.assertions || []).join(" | "),
  (account.procedures || []).join(" | "),
  (account.evidence || []).join(" | "),
  account.debitMinor,
  account.creditMinor,
]);
const tb = writeTable(trialBalance, 5, ["#", "المعرف", "رمز الحساب", "اسم الحساب", "المجال", "الطبيعة", "مدين SAR", "دائن SAR", "القيمة", "عملة الحساب", "العملة الوظيفية", "طبيعة البند", "سعر الإقفال", "المخاطر", "مصدر الربط", "المعايير المحاسبية الفعلية", "معايير المراجعة الفعلية", "التأكيدات", "الإجراءات", "الأدلة", "مدين - هللات", "دائن - هللات"], tbRows, [8, 15, 15, 42, 28, 23, 18, 18, 18, 12, 14, 14, 14, 12, 18, 34, 34, 28, 48, 40, 22, 22]);
trialBalance.getRange(`G${tb.firstDataRow}:I${tb.lastDataRow}`).format.numberFormat = MONEY_FORMAT;
trialBalance.getRange(`A${tb.lastDataRow + 1}:F${tb.lastDataRow + 1}`).merge();
trialBalance.getRange(`A${tb.lastDataRow + 1}`).values = [["الإجمالي والفحص"]];
trialBalance.getRange(`G${tb.lastDataRow + 1}`).formulas = [[`=ROUND(SUM(G${tb.firstDataRow}:G${tb.lastDataRow}),2)`]];
trialBalance.getRange(`H${tb.lastDataRow + 1}`).formulas = [[`=ROUND(SUM(H${tb.firstDataRow}:H${tb.lastDataRow}),2)`]];
trialBalance.getRange(`I${tb.lastDataRow + 1}`).formulas = [[`=ABS(G${tb.lastDataRow + 1}-H${tb.lastDataRow + 1})`]];
trialBalance.getRange(`A${tb.lastDataRow + 1}:V${tb.lastDataRow + 1}`).format = { fill: GREEN_SOFT, font: { bold: true, color: GREEN }, borders: { preset: "doubleBottom", style: "medium", color: GREEN } };
trialBalance.getRange(`G${tb.lastDataRow + 1}:I${tb.lastDataRow + 1}`).format.numberFormat = MONEY_FORMAT;
trialBalance.freezePanes.freezeRows(6);
trialBalance.freezePanes.freezeColumns(3);

titleBlock(sourceBalance, "ميزان المراجعة قبل التسويات", `${data.entity.name} | المصدر الملتزم قبل قيود المراجعة`, "O");
const sourceBalanceRows = data.unadjustedAccounts.map((account, index) => [
  index + 1, account.id, account.code, account.name, account.areaLabel, account.nature,
  account.debit, account.credit, account.amount, account.currency, account.functionalCurrency,
  account.monetaryItem ? "نقدي" : "غير نقدي", account.closingRate ?? "—", account.risk,
  (account.effectiveAccountingStandards || []).join(" | "),
]);
const sourceTb = writeTable(sourceBalance, 5, ["#", "المعرف", "رمز الحساب", "اسم الحساب", "المجال", "الطبيعة", "مدين SAR", "دائن SAR", "القيمة", "عملة الحساب", "العملة الوظيفية", "طبيعة البند", "سعر الإقفال", "المخاطر", "المعايير المحاسبية الفعلية"], sourceBalanceRows, [8, 15, 15, 42, 28, 23, 18, 18, 18, 12, 14, 14, 14, 12, 34]);
sourceBalance.getRange(`G${sourceTb.firstDataRow}:I${sourceTb.lastDataRow}`).format.numberFormat = MONEY_FORMAT;
sourceBalance.getRange(`A${sourceTb.lastDataRow + 1}:F${sourceTb.lastDataRow + 1}`).merge();
sourceBalance.getRange(`A${sourceTb.lastDataRow + 1}`).values = [["إجمالي المصدر"]];
sourceBalance.getRange(`G${sourceTb.lastDataRow + 1}`).formulas = [[`=ROUND(SUM(G${sourceTb.firstDataRow}:G${sourceTb.lastDataRow}),2)`]];
sourceBalance.getRange(`H${sourceTb.lastDataRow + 1}`).formulas = [[`=ROUND(SUM(H${sourceTb.firstDataRow}:H${sourceTb.lastDataRow}),2)`]];
sourceBalance.getRange(`I${sourceTb.lastDataRow + 1}`).formulas = [[`=ABS(G${sourceTb.lastDataRow + 1}-H${sourceTb.lastDataRow + 1})`]];
sourceBalance.getRange(`A${sourceTb.lastDataRow + 1}:O${sourceTb.lastDataRow + 1}`).format = { fill: GREEN_SOFT, font: { bold: true, color: GREEN }, borders: { preset: "doubleBottom", style: "medium", color: GREEN } };
sourceBalance.getRange(`G${sourceTb.lastDataRow + 1}:I${sourceTb.lastDataRow + 1}`).format.numberFormat = MONEY_FORMAT;
sourceBalance.freezePanes.freezeRows(6);
sourceBalance.freezePanes.freezeColumns(3);

titleBlock(reportingBasis, "أساس التقرير والاستمرارية", "جسر قبل / قيود / بعد، مصدر الرقم، وسيناريوهات تحليلية غير إثباتية", "H");
sectionBand(reportingBasis, "A6:H6", "جسر التسويات");
const bridgeRows = [
  ["ميزان المصدر", data.adjustmentBridge.beforeDebit, data.adjustmentBridge.beforeCredit, 0, "ملف المصدر الملتزم"],
  ["قيود المراجعة المرحلة", data.adjustmentBridge.postedDebit, data.adjustmentBridge.postedCredit, data.adjustmentBridge.postedCount, "قيود مزدوجة متوازنة"],
  ["إجمالي رقابة الترحيل", data.adjustmentBridge.journalizedDebit, data.adjustmentBridge.journalizedCredit, data.adjustmentBridge.postedCount, "المصدر + أطراف القيود"],
  ["الميزان المعدل الصافي", data.adjustmentBridge.adjustedDebit, data.adjustmentBridge.adjustedCredit, data.adjustmentBridge.postedCount, "بعد إعادة صافي الحسابات"],
];
const bridgeTable = writeTable(reportingBasis, 6, ["المرحلة", "مدين", "دائن", "عدد القيود", "الأساس"], bridgeRows, [32, 20, 20, 14, 48]);
reportingBasis.getRange(`B${bridgeTable.firstDataRow}:C${bridgeTable.lastDataRow}`).format.numberFormat = MONEY_FORMAT;
sectionBand(reportingBasis, "A13:H13", "مؤشرات الاستمرارية - سيناريوهات تحليلية وليست أدلة مراجعة");
const ratios = data.analytics.ratios;
const scenarioRows = [
  ["المسجل بعد التسويات", ratios.currentRatio, ratios.quickRatio, ratios.operatingMarginPct / 100, "قيود الجلسة المرحلة فقط"],
  ["ضغط تحليلي", ratios.currentRatio * 0.9 / 1.05, ratios.quickRatio * 0.9 / 1.05, (ratios.operatingMarginPct - 5) / 100, "الأصول المتداولة -10% والالتزامات +5%"],
  ["تعافٍ تحليلي", ratios.currentRatio * 1.08 / 0.98, ratios.quickRatio * 1.08 / 0.98, (ratios.operatingMarginPct + 5) / 100, "الأصول المتداولة +8% والالتزامات -2%"],
];
const scenarioTable = writeTable(reportingBasis, 13, ["السيناريو", "نسبة التداول", "السيولة السريعة", "هامش التشغيل", "الافتراض"], scenarioRows, [30, 18, 18, 18, 52]);
reportingBasis.getRange(`B${scenarioTable.firstDataRow}:C${scenarioTable.lastDataRow}`).format.numberFormat = "0.00x";
reportingBasis.getRange(`D${scenarioTable.firstDataRow}:D${scenarioTable.lastDataRow}`).format.numberFormat = "0.0%";
sectionBand(reportingBasis, "A20:H20", "مصدر الرقم والقطع والحدود");
const sourceLedgerRows = [
  ["معرف المجموعة", data.metrics.datasetId, "هوية مصدر كل رقم"],
  ["بصمة المجموعة", data.metrics.datasetDigest, "SHA-256 لالتزام بيانات العرض"],
  ["الفترة", data.metrics.datasetPeriod, "تاريخ قطع التقرير"],
  ["العملة", data.metrics.datasetCurrency, "عملة العرض"],
  ["وقت الالتزام", timestampText(data.metrics.datasetCommittedAt), "يسبق تنفيذ الجولات"],
  ["وقت إنشاء الحزمة", timestampText(data.generatedAt), "لقطة ثابتة"],
  ["بصمات الأدلة الاصطناعية", "synthetic-fixture-digest", "ليست بصمات محتوى ملفات؛ الملفات الحقيقية تعاد تجزئتها من البايتات"],
  ["أساس الرأي", data.reportState.reportOpinion, "اختيار واعتماد بشريان؛ لا يستنتجهما المحرك"],
];
const sourceLedgerTable = writeTable(reportingBasis, 20, ["الحقل", "القيمة", "التفسير"], sourceLedgerRows, [32, 78, 72]);
const cycleSectionRow = sourceLedgerTable.lastDataRow + 2;
sectionBand(reportingBasis, `A${cycleSectionRow}:H${cycleSectionRow}`, "دورة المحاسبة والإقفال - 12 خطوة");
const cycleTable = writeTable(reportingBasis, cycleSectionRow, ["الخطوة", "العنوان", "المعايير", "الحالة", "الدليل / الإجراء المتبقي"], data.appliedAccounting.accountingCycle.map((item) => [
  item.id, item.title, (item.standards || []).join(" | "), item.status === "complete" ? "مكتمل" : "يحتاج مراجعة", item.detail,
]), [20, 38, 34, 18, 72]);
const ifrs18CategoriesSectionRow = cycleTable.lastDataRow + 2;
sectionBand(reportingBasis, `A${ifrs18CategoriesSectionRow}:H${ifrs18CategoriesSectionRow}`, "IFRS 18 - تصنيف بنود الربح أو الخسارة");
const ifrs18CategoriesTable = writeTable(reportingBasis, ifrs18CategoriesSectionRow, ["الفئة", "الحسابات", "الإجمالي", "أساس العرض", "الحالة"], data.appliedAccounting.ifrs18.rows.map((item) => [
  item.label, item.accountCount, item.total, "تصنيف أولي يحتاج حكمًا موثقًا", item.accountCount ? "محسوب" : "لا بنود",
]), [30, 16, 24, 75, 20]);
reportingBasis.getRange(`C${ifrs18CategoriesTable.firstDataRow}:C${ifrs18CategoriesTable.lastDataRow}`).format.numberFormat = MONEY_FORMAT;
const ifrs18ChecksSectionRow = ifrs18CategoriesTable.lastDataRow + 2;
sectionBand(reportingBasis, `A${ifrs18ChecksSectionRow}:H${ifrs18ChecksSectionRow}`, "IFRS 18 - فحوص الجاهزية");
writeTable(reportingBasis, ifrs18ChecksSectionRow, ["الفحص", "الحالة", "التفصيل"], data.appliedAccounting.ifrs18.readinessChecks.map((item) => [
  item.label, item.pass ? "PASS" : "REVIEW", item.detail,
]), [52, 18, 112]);
reportingBasis.freezePanes.freezeRows(6);

titleBlock(standards, "الخريطة المعيارية الكاملة", `${data.standards.length} معيارًا مع النطاق والقياس والعرض والمراجع المرفقة`, "O");
const coverageById = new Map(data.standardsCoverage.map((item) => [item.id, item]));
const standardRows = data.standards.map((standard) => {
  const coverage = coverageById.get(standard.id) || {};
  return [standard.id, standard.type === "accounting" ? "محاسبي" : "مراجعة", standard.family, standard.title, standard.summary, (standard.scope || []).join(" | "), (standard.recognitionMeasurement || []).join(" | "), (standard.presentationDisclosure || []).join(" | "), (standard.judgments || []).join(" | "), (standard.requirements || []).join(" | "), standard.effective, standard.source, (standard.references || []).map((reference) => `${reference.title} (${reference.location})`).join(" | "), coverage.accountCount || 0, coverage.totalExposure || 0];
});
const std = writeTable(standards, 5, ["المعيار", "النوع", "العائلة", "العنوان", "الملخص", "النطاق", "الاعتراف والقياس", "العرض والإفصاح", "الأحكام", "المتطلبات", "السريان", "المصدر", "المراجع المرفقة", "الحسابات", "التعرض"], standardRows, [16, 12, 12, 34, 55, 45, 55, 55, 45, 55, 36, 42, 58, 12, 20]);
standards.getRange(`O${std.firstDataRow}:O${std.lastDataRow}`).format.numberFormat = MONEY_FORMAT;
standards.freezePanes.freezeRows(6);

titleBlock(rounds, "جولات المراجعة العشرون", "كل جولة مرتبطة بنتيجة ودليل ومعايير ومستندات واستنتاج", "N");
const roundRows = data.rounds.map((item) => [item.id, item.referenceId, item.title, item.status, item.progress / 100, item.risk, item.owner, item.threshold, (item.standards || []).join(" | "), (item.findingIds || []).join(" | "), (item.evidenceIds || []).join(" | "), (item.documents || []).map((doc) => doc.name).join(" | "), item.conclusion, timestampText(item.completedAt)]);
const rnd = writeTable(rounds, 5, ["الجولة", "المرجع", "الموضوع", "الحالة", "الإنجاز", "الخطر", "المالك", "الحد", "المعايير", "النتائج", "الأدلة", "المستندات", "الاستنتاج", "وقت الإقفال"], roundRows, [14, 12, 42, 13, 12, 12, 24, 18, 40, 18, 18, 52, 65, 24]);
rounds.getRange(`E${rnd.firstDataRow}:E${rnd.lastDataRow}`).format.numberFormat = "0%";
rounds.getRange(`H${rnd.firstDataRow}:H${rnd.lastDataRow}`).format.numberFormat = MONEY_FORMAT;
rounds.freezePanes.freezeRows(6);

titleBlock(evidence, "طلبات الأدلة العشرون", "اسم الملف والبصمة والمراجع والاستنتاج وروابط الجولة والنتيجة", "P");
const evidenceRows = data.evidence.map((item) => [item.id, item.title, item.area, item.status, item.owner, item.due, item.roundId, (item.findingIds || []).join(" | "), (item.standardIds || []).join(" | "), (item.assertions || []).join(" | "), item.fileName, item.hashAlgorithm, item.hash, item.reviewedBy, timestampText(item.reviewedAt), item.conclusion]);
writeTable(evidence, 5, ["الطلب", "العنوان", "المجال", "الحالة", "المالك", "الاستحقاق", "الجولة", "النتائج", "المعايير", "التأكيدات", "الملف", "الخوارزمية", "SHA-256", "المراجع", "وقت المراجعة", "الاستنتاج"], evidenceRows, [15, 45, 25, 13, 24, 16, 14, 18, 40, 30, 35, 14, 70, 22, 24, 66]);
evidence.freezePanes.freezeRows(6);

titleBlock(findings, "نتائج المراجعة العشرون", "الشدة والمعايير والدليل والمعالجة والمراجع ووقت الإغلاق", "M");
const findingRows = data.findings.map((item) => [item.id, item.title, item.area, item.severity, item.status, item.roundId, (item.evidenceIds || []).join(" | "), (item.standardIds || []).join(" | "), item.summary, item.recommendation, item.resolution, item.closedBy, timestampText(item.closedAt)]);
writeTable(findings, 5, ["النتيجة", "العنوان", "المجال", "الشدة", "الحالة", "الجولة", "الأدلة", "المعايير", "الملخص", "التوصية", "المعالجة", "أغلقها", "وقت الإغلاق"], findingRows, [15, 40, 25, 12, 13, 14, 18, 38, 58, 58, 65, 22, 24]);
findings.freezePanes.freezeRows(6);

titleBlock(adjustments, "قيود التسوية المرحلة", "كل تسوية مرتبطة بقيد مزدوج متوازن ومراجع ووقت ترحيل", "N");
const adjustmentRows = data.adjustments.map((item) => [item.id, item.title, item.amount, item.status, item.journalReference, item.reviewedBy, timestampText(item.reviewedAt), timestampText(item.postedAt), item.lines?.[0]?.code, Number(item.lines?.[0]?.debitMinor || 0) / 100, item.lines?.[1]?.code, Number(item.lines?.[1]?.creditMinor || 0) / 100, item.currency, item.lines?.length === 2 ? "متوازن" : "يحتاج فحصًا"]);
const adj = writeTable(adjustments, 5, ["التسوية", "العنوان", "القيمة", "الحالة", "مرجع اليومية", "المراجع", "وقت المراجعة", "وقت الترحيل", "حساب المدين", "مدين", "حساب الدائن", "دائن", "العملة", "الفحص"], adjustmentRows, [15, 38, 18, 13, 18, 22, 24, 24, 18, 18, 18, 18, 11, 14]);
adjustments.getRange(`C${adj.firstDataRow}:C${adj.lastDataRow}`).format.numberFormat = MONEY_FORMAT;
adjustments.getRange(`J${adj.firstDataRow}:L${adj.lastDataRow}`).format.numberFormat = MONEY_FORMAT;
adjustments.freezePanes.freezeRows(6);

titleBlock(gates, "بوابات إصدار التقرير", "تقييم واحد مشترك بين شاشة النتائج والتقرير والتنزيل", "F");
const gateRows = data.reportState.gates.map((gate, index) => [index + 1, gate.id, gate.label, gate.pass ? "PASS" : "BLOCKED", gate.detail, timestampText(data.generatedAt)]);
const gate = writeTable(gates, 5, ["#", "المعرف", "البوابة", "الحالة", "الدليل", "وقت اللقطة"], gateRows, [8, 22, 48, 16, 42, 24]);
gates.getRange(`D${gate.firstDataRow}:D${gate.lastDataRow}`).conditionalFormats.add("containsText", { text: "PASS", format: { fill: GREEN_SOFT, font: { color: GREEN, bold: true } } });
gates.getRange(`D${gate.firstDataRow}:D${gate.lastDataRow}`).conditionalFormats.add("containsText", { text: "BLOCKED", format: { fill: "#F8E6E1", font: { color: RED, bold: true } } });
gates.freezePanes.freezeRows(6);

titleBlock(auditTrail, "سجل الرقابة", "كل حدث متاح في سيناريو العرض مع الفاعل والتوقيت والتفصيل", "E");
const trailRows = data.auditTrail.map((item) => [item.id, item.action, item.actor, timestampText(item.at), item.detail]);
writeTable(auditTrail, 5, ["الحدث", "الإجراء", "الفاعل", "الوقت", "التفصيل"], trailRows, [18, 36, 26, 24, 85]);
auditTrail.freezePanes.freezeRows(6);

titleBlock(checks, "المصادر والفحوص", "مصالحات مرئية تمنع اختلاف الملف عن بيانات التطبيق", "G");
sectionBand(checks, "A6:G6", "فحوص المصالحة");
const checkHeaders = ["الفحص", "الفعلي", "المتوقع", "الفرق", "السماح", "الحالة", "الملاحظة"];
const checkTable = writeTable(checks, 6, checkHeaders, [
  ["اتزان الميزان", null, null, null, 0, null, "مدين مقابل دائن"],
  ["عدد الحسابات المعدلة", null, data.accounts.length, null, 0, null, "كل صفوف الميزان المعدل"],
  ["عدد حسابات المصدر", null, data.unadjustedAccounts.length, null, 0, null, "كل صفوف ميزان المصدر"],
  ["عدد الجولات", null, data.rounds.length, null, 0, null, "كل الجولات"],
  ["عدد الأدلة", null, data.evidence.length, null, 0, null, "كل طلبات الأدلة"],
  ["عدد النتائج", null, data.findings.length, null, 0, null, "كل النتائج"],
  ["عدد القيود", null, data.adjustments.length, null, 0, null, "كل قيود التسوية"],
  ["بوابات PASS", null, data.reportState.gates.length, null, 0, null, "كل بوابات الإصدار"],
  ["عدد المعايير", null, data.standards.length, null, 0, null, "كل سجلات الكتالوج"],
  ["أحداث سجل الرقابة", null, data.auditTrail.length, null, 0, null, "كل أحداث سيناريو العرض"],
  ["اتزان أطراف القيود", null, 0, null, 0, null, "مدين القيود مقابل دائنها"],
], [30, 18, 18, 18, 14, 16, 45]);
const formulaRows = [
  [`=ABS('ميزان المراجعة'!G${tb.lastDataRow + 1}-'ميزان المراجعة'!H${tb.lastDataRow + 1})`, "=0", "=B8-C8", "=IF(ABS(D8)<=E8,\"OK\",\"FAIL\")"],
  [`=COUNTA('ميزان المراجعة'!C${tb.firstDataRow}:C${tb.lastDataRow})`, `=${data.accounts.length}`, "=B9-C9", "=IF(ABS(D9)<=E9,\"OK\",\"FAIL\")"],
  [`=COUNTA('قبل التسويات'!C${sourceTb.firstDataRow}:C${sourceTb.lastDataRow})`, `=${data.unadjustedAccounts.length}`, "=B10-C10", "=IF(ABS(D10)<=E10,\"OK\",\"FAIL\")"],
  [`=COUNTA('الجولات'!A${rnd.firstDataRow}:A${rnd.lastDataRow})`, `=${data.rounds.length}`, "=B11-C11", "=IF(ABS(D11)<=E11,\"OK\",\"FAIL\")"],
  [`=COUNTA('الأدلة'!A7:A${data.evidence.length + 6})`, `=${data.evidence.length}`, "=B12-C12", "=IF(ABS(D12)<=E12,\"OK\",\"FAIL\")"],
  [`=COUNTA('الملاحظات'!A7:A${data.findings.length + 6})`, `=${data.findings.length}`, "=B13-C13", "=IF(ABS(D13)<=E13,\"OK\",\"FAIL\")"],
  [`=COUNTA('التسويات'!A${adj.firstDataRow}:A${adj.lastDataRow})`, `=${data.adjustments.length}`, "=B14-C14", "=IF(ABS(D14)<=E14,\"OK\",\"FAIL\")"],
  [`=COUNTIF('البوابات'!D${gate.firstDataRow}:D${gate.lastDataRow},\"PASS\")`, `=${data.reportState.gates.length}`, "=B15-C15", "=IF(ABS(D15)<=E15,\"OK\",\"FAIL\")"],
  [`=COUNTA('الخريطة المعيارية'!A${std.firstDataRow}:A${std.lastDataRow})`, `=${data.standards.length}`, "=B16-C16", "=IF(ABS(D16)<=E16,\"OK\",\"FAIL\")"],
  [`=COUNTA('سجل الرقابة'!A7:A${data.auditTrail.length + 6})`, `=${data.auditTrail.length}`, "=B17-C17", "=IF(ABS(D17)<=E17,\"OK\",\"FAIL\")"],
  ["=ABS(SUM('التسويات'!J7:J100)-SUM('التسويات'!L7:L100))", "=0", "=B18-C18", "=IF(ABS(D18)<=E18,\"OK\",\"FAIL\")"],
];
for (let index = 0; index < formulaRows.length; index += 1) {
  const excelRow = 8 + index;
  checks.getRange(`B${excelRow}`).formulas = [[formulaRows[index][0]]];
  checks.getRange(`C${excelRow}`).formulas = [[formulaRows[index][1]]];
  checks.getRange(`D${excelRow}`).formulas = [[formulaRows[index][2]]];
  checks.getRange(`F${excelRow}`).formulas = [[formulaRows[index][3]]];
}
checks.getRange(`F${checkTable.firstDataRow}:F${checkTable.lastDataRow}`).conditionalFormats.add("containsText", { text: "OK", format: { fill: GREEN_SOFT, font: { color: GREEN, bold: true } } });
checks.getRange(`F${checkTable.firstDataRow}:F${checkTable.lastDataRow}`).conditionalFormats.add("containsText", { text: "FAIL", format: { fill: "#F8E6E1", font: { color: RED, bold: true } } });
sectionBand(checks, "A19:G19", "المصادر والحدود");
const sourceRows = [
  ["التزام مجموعة البيانات", `${data.demo.commitment.datasetId} | ${data.demo.commitment.sha256}`, "SHA-256 للترتيب والقيم والفترة والعملة ووقت الالتزام"],
  ["التطبيق المنشور", data.siteUrl, "المصدر التشغيلي لهذا الإصدار"],
  ["Cloudflare v2", "https://kosif-stable-capabilities-v2.kosif199022.workers.dev/", "مجموعة مرجعية مستقلة"],
  ["Cloudflare v3", "https://kosif-stable-capabilities-v3.kosif199022.workers.dev/", "مجموعة مرجعية مستقلة"],
  ["Cloudflare Stable", "https://kosif-stable.kosif199022.workers.dev/", "مرجع قدرات حي؛ أعدنا الوظائف المفيدة دون نسخ أعطال الرصد"],
  ["GitHub Acc", "https://github.com/kosif199022-jpg/Acc", "عقد قدرات وfixture اصطناعي EGP"],
  ["GitHub mahmoud1990", "https://github.com/kosif199022-jpg/mahmoud1990", "مختبر نتائج مستقل"],
  ["الإفصاح", data.disclosure, "لا تُجمع المجاميع بين المجموعات المرجعية"],
];
writeTable(checks, 19, ["المصدر", "الرابط / البيان", "ملاحظة"], sourceRows, [30, 85, 65]);
sectionBand(checks, "A29:G29", "المجموعات المرجعية المستقلة");
const referenceRows = data.referenceComparison.map((item) => [item.label, item.datasetId || "LIVE", item.currency, item.accounts ?? "—", item.rounds ?? "—", item.findings ?? "—", item.totalDebit ?? "—"]);
const referenceTable = writeTable(checks, 29, ["المصدر", "المجموعة", "العملة", "الحسابات", "الجولات", "النتائج", "إجمالي المدين"], referenceRows, [35, 28, 12, 14, 14, 14, 22]);
checks.getRange(`G${referenceTable.firstDataRow}:G${referenceTable.lastDataRow}`).format.numberFormat = MONEY_FORMAT;
sectionBand(checks, "A36:G36", "المجلس وأقفال الفترات");
const councilRows = data.council.rounds.map((item) => [item.id, timestampText(item.generatedAt), item.engineVersion, item.consensus.status, item.advisorResults.length, item.population, item.sampleSize]);
writeTable(checks, 36, ["الجولة", "الوقت", "المحرك", "الحالة", "المقاعد", "المجتمع", "العينة"], councilRows, [16, 25, 28, 18, 14, 16, 14]);
const lockRows = data.periodLocks.map((item) => [item.id, item.label, item.status, item.preparedBy || "—", item.approvedBy || "—", timestampText(item.lockedAt), item.reason]);
const lockTable = writeTable(checks, 40, ["الفترة", "الاسم", "الحالة", "أعدها", "اعتمدها", "وقت القفل", "السبب"], lockRows, [16, 22, 16, 22, 22, 25, 55]);
const knowledgeSectionRow = lockTable.lastDataRow + 2;
sectionBand(checks, `A${knowledgeSectionRow}:G${knowledgeSectionRow}`, "جرد مصادر التعلّم المستخدمة في تصميم القدرات");
const knowledgeSourcesTable = writeTable(checks, knowledgeSectionRow, ["النوع", "المعرف", "العنوان", "الظهور", "تاريخ الجرد", "الرابط", "حد الاستخدام"], data.appliedAccounting.knowledgeCoverage.sources.map((source) => [
  source.type === "playlist" ? "قائمة تشغيل" : "فيديو",
  source.id,
  source.title,
  source.count,
  data.appliedAccounting.knowledgeCoverage.capturedAt,
  source.type === "playlist" ? `https://youtube.com/playlist?list=${source.id}` : `https://youtube.com/watch?v=${source.id}`,
  "مصدر تعليمي غير ملزم؛ يرجع للنص الرسمي عند الحكم",
]), [18, 38, 45, 12, 18, 78, 58]);
const topicSectionRow = knowledgeSourcesTable.lastDataRow + 2;
sectionBand(checks, `A${topicSectionRow}:G${topicSectionRow}`, "مصفوفة محاور تدريبية غير حصرية - قد يظهر الفيديو في أكثر من محور");
writeTable(checks, topicSectionRow, ["المحور", "الفيديوهات الفريدة المرتبطة بالعنوان", "طبيعة العدد", "الاستخدام", "المرجع الملزم"], data.appliedAccounting.knowledgeCoverage.topics.map((item) => [
  item.topic,
  item.uniqueVideoCount,
  "غير حصري",
  "خريطة تدريبية لتصميم الحالات والنماذج",
  "النص الرسمي والحكم المهني",
]), [58, 24, 18, 70, 58]);
checks.freezePanes.freezeRows(7);

for (const sheet of [summary, trialBalance, sourceBalance, reportingBasis, standards, rounds, evidence, findings, adjustments, gates, auditTrail, checks]) {
  const used = sheet.getUsedRange();
  if (used) used.format.verticalAlignment = "center";
}

await fs.mkdir(new URL(".", `file://${outputPath}`).pathname, { recursive: true }).catch(() => {});
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
