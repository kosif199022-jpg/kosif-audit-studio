import { formatMinorUnits, timestampedFilename } from "./session-export.js";

export const SESSION_WORKBOOK_SHEETS = Object.freeze([
  "ملخص الارتباط",
  "ميزان المراجعة",
  "قبل التسويات",
  "أساس التقرير",
  "الخريطة المعيارية",
  "الجولات",
  "الأدلة",
  "الملاحظات",
  "التسويات",
  "البوابات",
  "سجل الرقابة",
  "المصادر والفحوص",
]);

export function neutralizeWorkbookText(value) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function text(value) {
  return neutralizeWorkbookText(value);
}

function join(values, separator = " | ") {
  return (Array.isArray(values) ? values : []).map(text).join(separator);
}

function minor(value, exponent = 2) {
  return formatMinorUnits(String(value ?? "0"), exponent);
}

function adjustedAccounts(snapshot) {
  const changes = new Map(
    (snapshot?.trialBalance?.adjustedAccountChanges || []).map((change) => [change.id, change]),
  );
  return (snapshot?.trialBalance?.accounts || []).map((account) => ({
    ...account,
    ...(changes.get(account.id) || {}),
  }));
}

function rowsWithHeader(headers, rows) {
  return [headers.map(text), ...rows.map((row) => row.map((cell) => (
    typeof cell === "string" ? text(cell) : cell
  )))];
}

function buildSummary(snapshot) {
  const manifest = snapshot.manifest || {};
  const source = snapshot.provenance || {};
  const trialBalance = snapshot.trialBalance || {};
  const report = snapshot.reporting?.state || {};
  return rowsWithHeader(["الحقل", "القيمة"], [
    ["المنتج", manifest.product],
    ["تاريخ الإنشاء", manifest.generatedAt],
    ["مصدر البيانات", source.sourceLabel],
    ["نوع المصدر", source.source],
    ["معرف مجموعة البيانات", snapshot.summary?.datasetId || snapshot.engagement?.sourceDataset?.datasetId || snapshot.engagement?.demo?.commitment?.datasetId || "—"],
    ["عدد الحسابات", trialBalance.accountCount || 0],
    ["العملة", trialBalance.currency || "SAR"],
    ["إجمالي المدين قبل التسويات", minor(trialBalance.totalDebitMinor, trialBalance.exponent)],
    ["إجمالي الدائن قبل التسويات", minor(trialBalance.totalCreditMinor, trialBalance.exponent)],
    ["إجمالي المدين المعدل", minor(trialBalance.adjustedTotalDebitMinor, trialBalance.exponent)],
    ["إجمالي الدائن المعدل", minor(trialBalance.adjustedTotalCreditMinor, trialBalance.exponent)],
    ["حالة التقرير", report.reportReady ? "جاهز بعد الاعتماد البشري" : "مسودة محكومة"],
    ["البوابات المجتازة", `${report.passedGates || 0}/${report.gates?.length || 0}`],
    ["دورة المحاسبة والإقفال", `${snapshot.appliedAccounting?.summary?.cycleComplete || 0}/${snapshot.appliedAccounting?.summary?.cycleTotal || 0}`],
    ["جاهزية IFRS 18", `${snapshot.appliedAccounting?.summary?.ifrs18Passed || 0}/${snapshot.appliedAccounting?.summary?.ifrs18Total || 0}`],
    ["مواد المعرفة الفريدة المحصورة", snapshot.appliedAccounting?.knowledgeCoverage?.uniqueVideos || 0],
    ["تنبيه", manifest.limitation],
  ]);
}

function buildAccountsRows(accounts, adjusted = false) {
  return rowsWithHeader([
    "المعرف", "رمز الحساب", "اسم الحساب", "المجال", "الطبيعة", "العملة",
    "المدين", "الدائن", "المدين بوحدات صغرى", "الدائن بوحدات صغرى",
    "حالة الربط", "المعايير المحاسبية", "معايير المراجعة", "التأكيدات",
    ...(adjusted ? ["قيود التسوية المطبقة"] : []),
  ], accounts.map((account) => [
    account.id,
    account.code,
    account.name,
    account.areaLabel,
    account.nature,
    account.currency || "SAR",
    minor(account.debitMinor, account.exponent),
    minor(account.creditMinor, account.exponent),
    String(account.debitMinor || "0"),
    String(account.creditMinor || "0"),
    account.mappingStatus,
    join(account.effectiveStandardIds?.filter((id) => !String(id).startsWith("ISA "))),
    join(account.auditStandards),
    join(account.assertions),
    ...(adjusted ? [join(account.appliedAdjustmentIds)] : []),
  ]));
}

function buildReportBasis(snapshot) {
  const bridge = snapshot.trialBalance?.adjustmentBridge || {};
  const state = snapshot.reporting?.state || {};
  const analytics = snapshot.analytics || {};
  const accountingCycle = (snapshot.appliedAccounting?.accountingCycle || []).map((item) => [
    "دورة الإقفال",
    item.title,
    join(item.standards),
    `${item.status === "complete" ? "مكتمل" : "يتطلب متابعة"} · ${item.detail}`,
  ]);
  const ifrs18Categories = (snapshot.appliedAccounting?.ifrs18?.rows || []).map((item) => [
    "IFRS 18",
    item.label,
    item.total,
    `${item.accountCount} حسابًا · تصنيف توجيهي غير مرحّل`,
  ]);
  const ifrs18Checks = (snapshot.appliedAccounting?.ifrs18?.readinessChecks || []).map((item) => [
    "جاهزية IFRS 18",
    item.label,
    item.pass ? "PASS" : "REVIEW",
    item.detail,
  ]);
  return rowsWithHeader(["القسم", "المؤشر", "القيمة", "الحالة/الشرح"], [
    ["الجسر", "مدين المصدر", minor(bridge.sourceDebitMinor), "ميزان المصدر"],
    ["الجسر", "دائن المصدر", minor(bridge.sourceCreditMinor), "ميزان المصدر"],
    ["الجسر", "مدين القيود المرحلة", minor(bridge.postedDebitMinor), "قيود متوازنة فقط"],
    ["الجسر", "دائن القيود المرحلة", minor(bridge.postedCreditMinor), "قيود متوازنة فقط"],
    ["الجسر", "مدين الميزان المعدل", minor(bridge.adjustedDebitMinor), "أساس التحليلات والتقرير"],
    ["الجسر", "دائن الميزان المعدل", minor(bridge.adjustedCreditMinor), "أساس التحليلات والتقرير"],
    ["التحليلات", "نسبة التداول", analytics.ratios?.currentRatio ?? 0, "بعد التسويات"],
    ["التحليلات", "السيولة السريعة", analytics.ratios?.quickRatio ?? 0, "بعد التسويات"],
    ["التحليلات", "هامش التشغيل %", analytics.ratios?.operatingMarginPct ?? 0, "بعد التسويات"],
    ["التقرير", "نوع الرأي المشتق", state.selectedOpinion || "not_determined", "مشتق حتميًا من مدخلات ISA 705"],
    ["التقرير", "جاهزية الاعتماد البشري", state.readyForHumanApproval ? "نعم" : "لا", "لا تعني إصدار التقرير"],
    ["التقرير", "جاهزية الإصدار", state.reportReady ? "PASS" : "BLOCKED", `${state.passedGates || 0}/${state.gates?.length || 0}`],
    ...accountingCycle,
    ...ifrs18Categories,
    ...ifrs18Checks,
  ]);
}

function buildStandards(snapshot) {
  return rowsWithHeader([
    "المعيار", "النوع", "العنوان", "الحسابات المرتبطة", "حسابات تحتاج مراجعة",
    "التعرض المالي", "المجالات", "السريان", "موضع المرجع المطبوع", "موضع ملف PDF",
  ], (snapshot.standards?.coverage || []).map((standard) => [
    standard.id,
    standard.type,
    standard.title,
    standard.accountCount || 0,
    standard.reviewRequiredAccountCount || 0,
    standard.totalExposure || 0,
    join(standard.areas),
    standard.effective,
    join((standard.referenceLocators || []).map((item) => `ص ${item.printedStart}–${item.printedEnd}`)),
    join((standard.referenceLocators || []).map((item) => `ص ${item.pdfStart}–${item.pdfEnd}`)),
  ]));
}

function buildRounds(snapshot) {
  return rowsWithHeader([
    "الجولة", "العنوان", "الحالة", "المالك", "المخاطر", "المعايير", "الأدلة",
    "الملاحظات", "بدأت", "اكتملت", "الاستنتاج", "التصرف",
  ], (snapshot.auditExecution?.rounds || []).map((round) => [
    round.id, round.title, round.status, round.owner, round.risk, join(round.standards),
    join(round.evidenceIds), join(round.findingIds), round.startedAt, round.completedAt,
    round.conclusion, round.result?.disposition,
  ]));
}

function buildEvidence(snapshot) {
  return rowsWithHeader([
    "طلب الدليل", "العنوان", "الجولة", "الحالة", "المالك", "المعايير", "التأكيدات",
    "اسم الملف", "الحجم", "SHA-256", "طريقة التحقق", "المراجع", "الاستنتاج",
  ], (snapshot.auditExecution?.evidence || []).map((item) => [
    item.id, item.title, item.roundId, item.status, item.owner, join(item.standardIds),
    join(item.assertions), item.fileName, item.fileSize || 0, item.hash, item.verificationMethod,
    item.reviewedBy, item.conclusion,
  ]));
}

function buildFindings(snapshot) {
  return rowsWithHeader([
    "الملاحظة", "العنوان", "الجولة", "المجال", "الخطورة", "الحالة", "المعايير",
    "الأدلة", "الملخص", "التوصية", "أغلقها", "تاريخ الإغلاق", "المعالجة",
  ], (snapshot.auditExecution?.findings || []).map((item) => [
    item.id, item.title, item.roundId, item.area, item.severity, item.status,
    join(item.standardIds), join(item.evidenceIds), item.summary, item.recommendation,
    item.closedBy, item.closedAt, item.resolution,
  ]));
}

function buildAdjustments(snapshot) {
  return rowsWithHeader([
    "التسوية", "العنوان", "الحالة", "المبلغ", "الوحدات الصغرى", "مرجع القيد",
    "تاريخ الترحيل", "راجعها", "طرف المدين", "طرف الدائن", "توازن القيد",
  ], (snapshot.auditExecution?.adjustments || []).map((item) => {
    const debit = (item.lines || []).filter((line) => BigInt(line.debitMinor || 0) > 0n);
    const credit = (item.lines || []).filter((line) => BigInt(line.creditMinor || 0) > 0n);
    const totalDebit = debit.reduce((total, line) => total + BigInt(line.debitMinor || 0), 0n);
    const totalCredit = credit.reduce((total, line) => total + BigInt(line.creditMinor || 0), 0n);
    return [
      item.id, item.title, item.status, minor(item.amountMinor), String(item.amountMinor || "0"),
      item.journalReference, item.postedAt, item.reviewedBy,
      join(debit.map((line) => `${line.code} ${line.name}`)),
      join(credit.map((line) => `${line.code} ${line.name}`)),
      totalDebit > 0n && totalDebit === totalCredit ? "متوازن" : "غير مكتمل",
    ];
  }));
}

function buildGates(snapshot) {
  return rowsWithHeader(["البوابة", "الاسم", "الحالة", "التفصيل"],
    (snapshot.reporting?.state?.gates || []).map((gate) => [
      gate.id, gate.label, gate.pass ? "PASS" : "BLOCKED", gate.detail,
    ]));
}

function buildAuditTrail(snapshot) {
  return rowsWithHeader(["المعرف", "الإجراء", "المنفذ", "التوقيت", "التفصيل"],
    (snapshot.governance?.auditTrail || []).map((item) => [
      item.id, item.action, item.actor, item.at, item.detail,
    ]));
}

function buildSources(snapshot) {
  const providerRegistry = snapshot.governance?.providerRegistry?.providers || [];
  const sources = (snapshot.standards?.officialSources || []).map((source) => [
    "مصدر رسمي", source.id, source.issuer, source.title, source.status, source.lastVerified, source.url,
  ]);
  const providers = providerRegistry.map((provider) => [
    "محرك تحليل", provider.id, provider.name, provider.execution, provider.status,
    provider.model || "غير مهيأ", provider.dataPolicy,
  ]);
  const referenceSurfaces = Object.values(snapshot.referenceResults?.scenarios || {}).map((scenario) => [
    "مرجع مستقل",
    scenario.id,
    scenario.label,
    `${scenario.accountCount ?? "—"} حساب · ${scenario.auditRoundCount ?? "—"} جولة · ${scenario.findingCount ?? "—"} نتيجة`,
    scenario.reportIssued == null ? "غير مثبت" : scenario.reportIssued ? "ظاهر كصادر" : "محجوب",
    scenario.verifiedAt || "—",
    scenario.source?.publicUrl || scenario.source?.repository || "—",
  ]);
  const checks = [
    ["فحص", "source", snapshot.provenance?.sourceLabel, "مصدر الجلسة", snapshot.provenance?.source, snapshot.manifest?.generatedAt, "لا تُرسل البيانات للخادم عند التصدير"],
    ["فحص", "dataset", snapshot.summary?.datasetId || "—", "التزام مجموعة البيانات", snapshot.summary?.datasetDigest || "—", snapshot.summary?.datasetCommittedAt || "—", "تطابق الهوية شرط لإصدار التقرير"],
    ["فحص", "attachments", "المرفقات", "بايتات الملفات", "غير مضمنة", snapshot.manifest?.generatedAt, "تُصدر البيانات الوصفية والبصمات فقط"],
  ];
  const learningSources = (snapshot.appliedAccounting?.knowledgeCoverage?.sources || []).map((source) => [
    "مصدر تدريب",
    source.id,
    "YouTube",
    `${source.title} · ${source.count} مقطعًا`,
    "خريطة موضوعات غير ملزمة",
    snapshot.appliedAccounting?.knowledgeCoverage?.capturedAt || "—",
    source.type === "playlist"
      ? `https://youtube.com/playlist?list=${source.id}`
      : `https://youtube.com/watch?v=${source.id}`,
  ]);
  return rowsWithHeader(["النوع", "المعرف", "الجهة/الاسم", "الوصف", "الحالة", "آخر تحقق/النموذج", "المصدر/السياسة"], [
    ...sources, ...referenceSurfaces, ...providers, ...learningSources, ...checks,
  ]);
}

export function buildSessionWorkpaperModel(snapshot, date = new Date(snapshot?.manifest?.generatedAt || Date.now())) {
  if (!snapshot?.manifest || !snapshot?.trialBalance) {
    throw new TypeError("A complete KOSIF session snapshot is required.");
  }
  const sourceAccounts = snapshot.trialBalance.accounts || [];
  const currentAdjustedAccounts = adjustedAccounts(snapshot);
  const datasetId = String(
    snapshot.summary?.datasetId
      || snapshot.engagement?.sourceDataset?.datasetId
      || snapshot.engagement?.demo?.commitment?.datasetId
      || "session",
  ).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48);
  const filename = timestampedFilename(`kosif-workpapers-${datasetId}`, "xlsx", date);
  const sheets = {
    "ملخص الارتباط": buildSummary(snapshot),
    "ميزان المراجعة": buildAccountsRows(currentAdjustedAccounts, true),
    "قبل التسويات": buildAccountsRows(sourceAccounts, false),
    "أساس التقرير": buildReportBasis(snapshot),
    "الخريطة المعيارية": buildStandards(snapshot),
    "الجولات": buildRounds(snapshot),
    "الأدلة": buildEvidence(snapshot),
    "الملاحظات": buildFindings(snapshot),
    "التسويات": buildAdjustments(snapshot),
    "البوابات": buildGates(snapshot),
    "سجل الرقابة": buildAuditTrail(snapshot),
    "المصادر والفحوص": buildSources(snapshot),
  };
  return { filename, sheetNames: SESSION_WORKBOOK_SHEETS, sheets };
}

function applySheetLayout(sheet, rows) {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  sheet["!cols"] = Array.from({ length: columnCount }, (_, columnIndex) => ({
    wch: Math.min(42, Math.max(12, ...rows.slice(0, 250).map((row) => String(row[columnIndex] ?? "").length + 2))),
  }));
  if (rows.length && columnCount) {
    const endColumn = String.fromCharCode(64 + Math.min(columnCount, 26));
    sheet["!autofilter"] = { ref: `A1:${endColumn}${rows.length}` };
  }
  sheet["!rtl"] = true;
}

export async function createSessionWorkbookBytes(snapshot, options = {}) {
  const XLSX = await import("xlsx");
  const model = buildSessionWorkpaperModel(snapshot, options.date);
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: "KOSIF Audit Studio · أوراق عمل الجلسة الحالية",
    Subject: snapshot.manifest?.limitation || "حزمة عمل مؤقتة",
    Author: "KOSIF Audit Studio",
    CreatedDate: options.date || new Date(snapshot.manifest.generatedAt || Date.now()),
  };
  for (const name of model.sheetNames) {
    const rows = model.sheets[name];
    const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: false });
    applySheetLayout(sheet, rows);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true, cellDates: false });
  return { bytes, filename: model.filename, model };
}

export function downloadWorkbookBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
}
