import { buildAnalyticalReview } from "./analytics.js";
import {
  buildDatasetCommitment,
  buildCouncilSnapshot,
  buildEvidenceLineage,
  buildJournalHashChain,
  buildReconciliationCases,
  buildRiskSample,
  createJournalEntries,
} from "./governance.js";
import {
  buildAdjustmentBridge,
  buildReportState,
  isAdjustmentPosted,
} from "./reporting.js";
import { REFERENCE_SCENARIOS, buildReferenceComparison } from "./reference-results.js";
import { createDefaultProviderRegistry } from "./council-providers.js";
import {
  YOUTUBE_KNOWLEDGE_SOURCES,
  YOUTUBE_KNOWLEDGE_SUMMARY,
  YOUTUBE_TOPIC_MAP,
  buildAccountingCycleReadiness,
  buildAppliedAccountingSummary,
  buildIfrs18Readiness,
} from "./applied-accounting.js";
import {
  buildMappingMetrics,
  buildStandardsCoverage,
  officialSources,
  resolveAccountMapping,
  standardCatalog,
} from "./standards.js";

export const SNAPSHOT_SCHEMA_VERSION = 5;

const CANONICAL_NONNEGATIVE_INTEGER = /^(0|[1-9]\d*)$/;
const CANONICAL_INTEGER = /^(?:0|-?[1-9]\d*)$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const MAX_EXPORT_ACCOUNTS = 50_000;
const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);
const SUPPORTED_EXPONENT = 2;

function exportFail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function cleanStages(stages) {
  return (stages || []).map(({ id, label, view, status, detail, statusLabel }) => ({
    id,
    label,
    view,
    status,
    detail,
    statusLabel,
  }));
}

function asMinor(value) {
  try {
    const text = String(value ?? "0");
    if (!CANONICAL_INTEGER.test(text)) throw new TypeError("non-canonical minor units");
    return BigInt(text);
  } catch {
    exportFail("invalid_snapshot_export", "تعذر إنشاء اللقطة لأن قيمة مالية ليست عددًا صحيحًا غير سالب بصيغة معيارية.");
  }
}

function exportText(value, label, maxLength) {
  if (
    typeof value !== "string"
    || !value.trim()
    || value.length > maxLength
    || CONTROL_CHARACTERS.test(value)
  ) exportFail("invalid_snapshot_export", `${label} غير صالح للتصدير المحكوم.`);
  return value.trim();
}

function exportCurrency(value, label) {
  const currency = exportText(value, label, 3);
  if (!CURRENCY_CODE.test(currency)) exportFail("invalid_snapshot_export", `${label} غير صالحة للتصدير المحكوم.`);
  return currency;
}

function exportClosingRate(value, label) {
  if (value == null || value === "") return null;
  const text = String(value);
  if (!(/^(?:[1-9]\d*)(?:\.\d+)?$|^0\.\d*[1-9]\d*$/.test(text)) || text.length > 40 || !Number.isFinite(Number(text))) {
    exportFail("invalid_snapshot_export", `${label} غير صالح للتصدير المحكوم.`);
  }
  return text;
}

function canonicalRestoreAccount(account, index, datasetCurrency, datasetExponent) {
  if (!account || typeof account !== "object" || Array.isArray(account)) {
    exportFail("invalid_snapshot_export", `الحساب رقم ${index + 1} غير صالح للتصدير المحكوم.`);
  }
  const debitMinor = String(account.debitMinor ?? "");
  const creditMinor = String(account.creditMinor ?? "");
  if (!CANONICAL_NONNEGATIVE_INTEGER.test(debitMinor) || !CANONICAL_NONNEGATIVE_INTEGER.test(creditMinor)) {
    exportFail("invalid_snapshot_export", `جانبا الحساب رقم ${index + 1} ليسا بصيغة معيارية.`);
  }
  const debit = BigInt(debitMinor);
  const credit = BigInt(creditMinor);
  if (debit > MAX_SAFE_MINOR || credit > MAX_SAFE_MINOR) exportFail("unsafe_snapshot_export", `الحساب رقم ${index + 1} يتجاوز حد الحساب الآمن.`);
  if (debit > 0n && credit > 0n) exportFail("invalid_snapshot_export", `الحساب رقم ${index + 1} يحتوي مدينًا ودائنًا معًا.`);
  if (debit === 0n && credit === 0n) exportFail("invalid_snapshot_export", `الحساب رقم ${index + 1} صفري ولا يدخل في عقد الاستعادة.`);
  if (String(account.amountMinor ?? "") !== (debit + credit).toString()) {
    exportFail("invalid_snapshot_export", `رصيد الحساب رقم ${index + 1} لا يطابق جانبيه.`);
  }
  const balanceCurrency = exportCurrency(account.balanceCurrency || account.functionalCurrency || datasetCurrency, `عملة قياس الحساب رقم ${index + 1}`);
  if (balanceCurrency !== datasetCurrency) exportFail("mixed_dataset_currency", "لا يمكن تصدير مجموعة بيانات بأكثر من عملة قياس.");
  const exponent = Number(account.exponent);
  if (!Number.isInteger(exponent) || exponent !== datasetExponent) exportFail("mixed_dataset_exponent", "لا يمكن تصدير مجموعة بيانات بأكثر من دقة للوحدات الصغرى.");
  if (account.monetaryItem != null && typeof account.monetaryItem !== "boolean") {
    exportFail("invalid_snapshot_export", `صفة البند النقدي للحساب رقم ${index + 1} غير صالحة.`);
  }
  return {
    code: exportText(account.code, `رمز الحساب رقم ${index + 1}`, 120),
    name: exportText(account.name, `اسم الحساب رقم ${index + 1}`, 500),
    debitMinor,
    creditMinor,
    accountCurrency: exportCurrency(account.currency || datasetCurrency, `عملة الحساب رقم ${index + 1}`),
    balanceCurrency,
    exponent,
    monetaryItem: account.monetaryItem === true,
    closingRate: exportClosingRate(account.closingRate, `سعر الإقفال للحساب رقم ${index + 1}`),
  };
}

function canonicalAccount(account, mappingState) {
  const resolution = resolveAccountMapping(account, mappingState);
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    category: account.category,
    areaLabel: account.areaLabel,
    nature: account.nature,
    standard: account.standard,
    suggestedStandardIds: account.suggestedStandardIds || [],
    standards: account.standards || [],
    auditStandards: account.auditStandards || [],
    effectiveStandardIds: resolution.effectiveStandardIds,
    mappingStatus: resolution.status,
    assertions: account.assertions || [],
    risks: account.risks || [],
    procedures: account.procedures || [],
    evidence: account.evidence || [],
    inherentRisk: account.inherentRisk,
    assessedRisk: account.risk,
    debitMinor: String(account.debitMinor || "0"),
    creditMinor: String(account.creditMinor || "0"),
    amountMinor: String(account.amountMinor || "0"),
    currency: account.currency || "SAR",
    exponent: Number(account.exponent ?? 2),
  };
}

function canonicalAdjustmentJournal(adjustment) {
  return {
    id: adjustment.journalReference,
    period: "2025-12",
    postedAt: adjustment.postedAt,
    description: `قيد تسوية مراجعة — ${adjustment.title}`,
    status: "posted",
    totalMinor: String(adjustment.amountMinor || 0),
    adjustmentId: adjustment.id,
    lines: (adjustment.lines || []).map((line) => ({
      code: line.code,
      name: line.name,
      debitMinor: String(line.debitMinor || 0),
      creditMinor: String(line.creditMinor || 0),
    })),
  };
}

export async function buildTemporarySessionSnapshot({
  accounts,
  engagement,
  metrics,
  dataProfile,
  stages,
  generatedAt = new Date().toISOString(),
}) {
  const currentAccounts = Array.isArray(accounts) ? accounts : [];
  if (currentAccounts.length < 1 || currentAccounts.length > MAX_EXPORT_ACCOUNTS) {
    exportFail("invalid_snapshot_export", `عدد الحسابات القابل للتصدير يجب أن يكون بين 1 و${MAX_EXPORT_ACCOUNTS}.`);
  }
  const sourceDescriptor = engagement?.sourceDataset || engagement?.demo?.commitment || {};
  const datasetCurrency = exportCurrency(
    dataProfile?.currency || sourceDescriptor.currency || currentAccounts[0]?.balanceCurrency || currentAccounts[0]?.functionalCurrency || "SAR",
    "عملة قياس مجموعة البيانات",
  );
  const datasetExponent = Number(dataProfile?.exponent ?? sourceDescriptor.exponent ?? currentAccounts[0]?.exponent ?? SUPPORTED_EXPONENT);
  if (!Number.isInteger(datasetExponent) || datasetExponent !== SUPPORTED_EXPONENT) {
    exportFail("unsupported_exponent", `تدعم هذه النسخة دقة عملة واحدة مقدارها ${SUPPORTED_EXPONENT} فقط.`);
  }
  const datasetPeriod = exportText(dataProfile?.period || sourceDescriptor.period || engagement?.entity?.period, "فترة مجموعة البيانات", 300);
  const restoreCommittedAt = String(dataProfile?.committedAt || sourceDescriptor.committedAt || generatedAt);
  let canonicalCommittedAt;
  try {
    canonicalCommittedAt = new Date(restoreCommittedAt).toISOString();
  } catch {
    exportFail("invalid_snapshot_export", "وقت التزام مجموعة البيانات غير صالح.");
  }
  if (canonicalCommittedAt !== restoreCommittedAt) exportFail("invalid_snapshot_export", "وقت التزام مجموعة البيانات ليس ISO UTC معياريًا.");
  const restoreAccounts = currentAccounts.map((account, index) => canonicalRestoreAccount(account, index, datasetCurrency, datasetExponent));
  if (new Set(restoreAccounts.map(({ code }) => code)).size !== restoreAccounts.length) {
    exportFail("invalid_snapshot_export", "لا يمكن تصدير لقطة تحتوي رموز حسابات مكررة.");
  }
  const restoreTotalDebitMinor = restoreAccounts.reduce((total, account) => total + BigInt(account.debitMinor), 0n);
  const restoreTotalCreditMinor = restoreAccounts.reduce((total, account) => total + BigInt(account.creditMinor), 0n);
  if (restoreTotalDebitMinor > MAX_SAFE_MINOR || restoreTotalCreditMinor > MAX_SAFE_MINOR) exportFail("unsafe_snapshot_export", "إجماليات مجموعة البيانات تتجاوز حد الحساب الآمن.");
  if (restoreTotalDebitMinor !== restoreTotalCreditMinor) exportFail("unbalanced_snapshot_export", "لا يمكن تصدير عقد استعادة لميزان غير متوازن.");
  const restoreCommitment = buildDatasetCommitment(restoreAccounts, {
    period: datasetPeriod,
    currency: datasetCurrency,
    exponent: datasetExponent,
    committedAt: canonicalCommittedAt,
  });
  const mapping = buildMappingMetrics(currentAccounts, engagement?.standardMappings);
  const adjustmentBridge = buildAdjustmentBridge(currentAccounts, engagement?.adjustments || []);
  const analytics = buildAnalyticalReview(adjustmentBridge.adjustedAccounts);
  const coverage = buildStandardsCoverage(currentAccounts, engagement?.standardMappings);
  const journalDrafts = createJournalEntries(currentAccounts, 24);
  const journalHashChain = await buildJournalHashChain(journalDrafts);
  const adjustmentJournalDrafts = (engagement?.adjustments || []).filter(isAdjustmentPosted).map(canonicalAdjustmentJournal);
  const adjustmentJournalHashChain = await buildJournalHashChain(adjustmentJournalDrafts);
  const reportState = buildReportState(engagement, metrics);
  const safeStages = cleanStages(stages);
  const totalDebitMinor = currentAccounts.reduce((total, account) => total + asMinor(account.debitMinor), 0n);
  const totalCreditMinor = currentAccounts.reduce((total, account) => total + asMinor(account.creditMinor), 0n);
  const differenceMinor = totalDebitMinor >= totalCreditMinor
    ? totalDebitMinor - totalCreditMinor
    : totalCreditMinor - totalDebitMinor;
  const postedAdjustmentMinor = asMinor(adjustmentBridge.postedDebitMinor);
  const adjustedDebitMinor = asMinor(adjustmentBridge.adjustedDebitMinor);
  const adjustedCreditMinor = asMinor(adjustmentBridge.adjustedCreditMinor);
  const adjustedDifferenceMinor = adjustedDebitMinor >= adjustedCreditMinor
    ? adjustedDebitMinor - adjustedCreditMinor
    : adjustedCreditMinor - adjustedDebitMinor;
  const source = dataProfile?.source || "session";
  const canonicalAccounts = currentAccounts.map((account) => canonicalAccount(account, engagement?.standardMappings));
  const appliedAccounting = {
    summary: buildAppliedAccountingSummary(adjustmentBridge.adjustedAccounts, engagement, metrics),
    accountingCycle: buildAccountingCycleReadiness(adjustmentBridge.adjustedAccounts, engagement, metrics),
    ifrs18: buildIfrs18Readiness(adjustmentBridge.adjustedAccounts, engagement),
    knowledgeCoverage: {
      ...YOUTUBE_KNOWLEDGE_SUMMARY,
      sources: YOUTUBE_KNOWLEDGE_SOURCES,
      topics: YOUTUBE_TOPIC_MAP,
    },
  };

  return {
    manifest: {
      product: "KOSIF Audit Studio",
      format: "kosif-session-snapshot",
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      generatedAt,
      scope: "committed-current-workspace",
      temporary: true,
      synthetic: source === "demo",
      source,
      sourceLabel: dataProfile?.label || "بيانات الجلسة الحالية",
      limitation: "نسخة عمل مؤقتة. الاستعادة تعيد فقط حقول الميزان الخام الملتزم بها، ثم تعيد اشتقاق التصنيف وتفتح كل سلطات المراجعة.",
    },
    entity: engagement?.entity || {},
    provenance: {
      source,
      sourceLabel: dataProfile?.label || "بيانات الجلسة الحالية",
      rowCount: currentAccounts.length,
      importedAt: dataProfile?.importedAt || null,
      validationWarnings: Number(dataProfile?.warnings || 0),
      synthetic: source === "demo",
      generatedInBrowser: true,
      sentToServer: false,
      uncommittedStagingIncluded: false,
      attachmentsIncluded: false,
      demoSeed: source === "demo" ? engagement?.demo || null : null,
    },
    restorePayload: {
      contractVersion: 1,
      dataset: {
        period: datasetPeriod,
        currency: datasetCurrency,
        exponent: datasetExponent,
        committedAt: canonicalCommittedAt,
        totalDebitMinor: restoreTotalDebitMinor.toString(),
        totalCreditMinor: restoreTotalCreditMinor.toString(),
      },
      accounts: restoreAccounts,
      commitment: restoreCommitment,
    },
    trialBalance: {
      currency: datasetCurrency,
      exponent: datasetExponent,
      accountCount: currentAccounts.length,
      totalDebitMinor: String(totalDebitMinor),
      totalCreditMinor: String(totalCreditMinor),
      differenceMinor: String(differenceMinor),
      balanced: differenceMinor === 0n,
      postedAdjustmentDebitMinor: String(postedAdjustmentMinor),
      postedAdjustmentCreditMinor: String(postedAdjustmentMinor),
      adjustedTotalDebitMinor: String(adjustedDebitMinor),
      adjustedTotalCreditMinor: String(adjustedCreditMinor),
      adjustedDifferenceMinor: String(adjustedDifferenceMinor),
      adjustedBalanced: adjustedDifferenceMinor === 0n,
      accounts: canonicalAccounts,
      adjustmentBridge: {
        sourceDebitMinor: adjustmentBridge.beforeDebitMinor,
        sourceCreditMinor: adjustmentBridge.beforeCreditMinor,
        postedDebitMinor: adjustmentBridge.postedDebitMinor,
        postedCreditMinor: adjustmentBridge.postedCreditMinor,
        journalizedDebitMinor: adjustmentBridge.journalizedDebitMinor,
        journalizedCreditMinor: adjustmentBridge.journalizedCreditMinor,
        adjustedDebitMinor: adjustmentBridge.adjustedDebitMinor,
        adjustedCreditMinor: adjustmentBridge.adjustedCreditMinor,
      },
      adjustedAccountChanges: adjustmentBridge.adjustedAccounts
        .filter((account) => account.appliedAdjustmentIds?.length)
        .map((account) => ({
          id: account.id,
          code: account.code,
          name: account.name,
          debitMinor: account.debitMinor,
          creditMinor: account.creditMinor,
          amountMinor: account.amountMinor,
          appliedAdjustmentIds: account.appliedAdjustmentIds,
        })),
    },
    summary: {
      ...metrics,
      datasetId: restoreCommitment.datasetId,
      datasetDigest: restoreCommitment.sha256,
      datasetPeriod: restoreCommitment.period,
      datasetCurrency: restoreCommitment.currency,
      datasetExponent: restoreCommitment.exponent,
      datasetCommittedAt: restoreCommitment.committedAt,
      stageCount: safeStages.length,
      completedStages: safeStages.filter((stage) => stage.status === "complete").length,
      resultFamilies: 12,
    },
    stages: safeStages,
    referenceResults: {
      comparison: buildReferenceComparison(),
      scenarios: REFERENCE_SCENARIOS,
      separationRule: "كل مجموعة مستقلة بمصدر وعملة وهوية؛ لا تجمع الإجماليات أو تستبدل نتائج الجلسة الحالية.",
    },
    analytics,
    appliedAccounting,
    standards: {
      mapping,
      coverage,
      decisions: engagement?.standardMappings || null,
      mappingConfirmed: Boolean(engagement?.mappingConfirmed),
      catalog: standardCatalog,
      officialSources,
    },
    governance: {
      riskSample: buildRiskSample(currentAccounts, 36),
      councilSnapshot: buildCouncilSnapshot(adjustmentBridge.adjustedAccounts, engagement, mapping, {
        analysisBasis: "posted-adjusted-trial-balance",
        datasetDigest: metrics?.datasetDigest,
      }),
      providerRegistry: engagement?.council?.providerRegistry || createDefaultProviderRegistry(),
      evidenceLineage: buildEvidenceLineage(currentAccounts, engagement, 36),
      journalHashChain,
      adjustmentJournalHashChain,
      reconciliations: buildReconciliationCases(journalHashChain),
      periodLocks: engagement?.periodLocks || [],
      auditTrail: engagement?.auditTrail || [],
      materialityPolicy: engagement?.materialityPolicy || null,
    },
    auditExecution: {
      acceptance: engagement?.acceptance || {},
      rounds: engagement?.rounds || [],
      evidence: engagement?.evidence || [],
      manualPbcRequests: engagement?.manualPbcRequests || [],
      reviewerNotes: engagement?.reviewerNotes || [],
      customProfessionalSources: engagement?.customProfessionalSources || [],
      findings: engagement?.findings || [],
      adjustments: engagement?.adjustments || [],
      adjustmentJournals: adjustmentJournalDrafts,
      analyticsReview: engagement?.analyticsReview || {},
      council: engagement?.council || {},
    },
    reporting: {
      report: engagement?.report || {},
      humanApproval: Boolean(engagement?.humanApproval),
      humanApprovedAt: engagement?.humanApprovedAt || null,
      state: reportState,
      artifacts: [
        { id: "demo-pdf", format: "pdf", scope: "fixed-demo", currentSession: source === "demo" && accounts.length === 5000, available: true, path: "/downloads/kosif-audit-report-5000.pdf" },
        { id: "demo-xlsx", format: "xlsx", scope: "fixed-demo", currentSession: source === "demo" && accounts.length === 5000, available: true, path: "/downloads/kosif-audit-workpapers-5000.xlsx" },
        { id: "session-print-pdf", format: "pdf", scope: "live-print-report", currentSession: true, requiresReportReady: false, available: true, draftWatermark: !reportState.reportReady },
        { id: "session-xlsx", format: "xlsx", scope: "live-workpapers", currentSession: true, requiresReportReady: false, available: true },
        { id: "session-json", format: "json", scope: "live-snapshot", requiresReportReady: false, available: true },
        { id: "session-csv", format: "csv", scope: "live-trial-balance", currentSession: true, requiresReportReady: false, available: true },
        { id: "risk-sample-json", format: "json", scope: "live-risk-sample", currentSession: true, requiresReportReady: false, available: true },
        { id: "council-redacted-json", format: "json", scope: "live-council-summary", currentSession: true, requiresReportReady: false, available: true, redacted: true },
        { id: "governed-json", format: "json", scope: "live-governed-report", requiresReportReady: true, available: reportState.reportReady },
      ],
    },
    engagement: {
      ...engagement,
      demo: source === "demo" ? engagement?.demo : undefined,
    },
    limitations: {
      encrypted: false,
      authoritativeAuditRecord: false,
      importRestoreSupported: "data-only-fail-closed",
      attachmentsIncluded: false,
      uncommittedStagingIncluded: false,
    },
  };
}

function neutralizeSpreadsheetFormula(value) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  const text = neutralizeSpreadsheetFormula(value).replace(/"/g, '""');
  return `"${text}"`;
}

export function buildAccountsCsv(accounts, mappingState) {
  const columns = [
    ["code", "account_code"],
    ["name", "account_name"],
    ["debitMinor", "debit", true],
    ["creditMinor", "credit", true],
    ["currency", "currency"],
    ["exponent", "currency_exponent", true],
    ["debitMinor", "debit_minor", true, "minor"],
    ["creditMinor", "credit_minor", true, "minor"],
    ["category", "category_id"],
    ["areaLabel", "area_label"],
    ["nature", "nature"],
    ["inherentRisk", "inherent_risk"],
    ["risk", "assessed_risk"],
    ["mappingStatus", "mapping_status"],
    ["resolvedAccountingStandards", "accounting_standard_ids"],
    ["resolvedAuditStandards", "audit_standard_ids"],
    ["assertions", "assertions"],
  ];
  const rows = [columns.map(([, label]) => csvCell(label)).join(",")];
  for (const account of accounts || []) {
    const resolution = resolveAccountMapping(account, mappingState);
    const resolved = {
      ...account,
      mappingStatus: resolution.status,
      resolvedAccountingStandards: resolution.effectiveStandardIds.filter((id) => !id.startsWith("ISA ")),
      resolvedAuditStandards: resolution.effectiveStandardIds.filter((id) => id.startsWith("ISA ")),
    };
    rows.push(columns.map(([key, , numeric, mode]) => {
      let value = Array.isArray(resolved?.[key]) ? resolved[key].join(" | ") : resolved?.[key];
      if (mode !== "minor" && (key === "debitMinor" || key === "creditMinor")) value = formatMinorUnits(value, account?.exponent ?? 2);
      return numeric ? `"${String(value ?? "0").replace(/"/g, '""')}"` : csvCell(value);
    }).join(","));
  }
  return `\uFEFF${rows.join("\r\n")}`;
}

export function formatMinorUnits(value, exponent = 2) {
  const digits = Math.max(0, Number(exponent) || 0);
  const minor = asMinor(value);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  if (!digits) return `${negative ? "-" : ""}${absolute}`;
  const padded = absolute.toString().padStart(digits + 1, "0");
  return `${negative ? "-" : ""}${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
}

export function downloadTextFile(contents, filename, type) {
  const blob = new Blob([contents], { type });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
}

export function timestampedFilename(prefix, extension, date = new Date()) {
  const timestamp = date.toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${timestamp}.${extension}`;
}
