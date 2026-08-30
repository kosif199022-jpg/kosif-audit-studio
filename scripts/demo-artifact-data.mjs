import fs from "node:fs/promises";
import { buildAnalyticalReview } from "../src/analytics.js";
import { generateTrialBalance, initialEngagement } from "../src/data.js";
import { buildAdjustmentBridge, buildReportState } from "../src/reporting.js";
import { buildMappingMetrics, buildStandardsCoverage, resolveAccountMapping, standardCatalog } from "../src/standards.js";
import { buildReferenceComparison } from "../src/reference-results.js";
import {
  APPLIED_MODEL_META,
  YOUTUBE_KNOWLEDGE_SOURCES,
  YOUTUBE_KNOWLEDGE_SUMMARY,
  YOUTUBE_TOPIC_MAP,
  buildAccountingCycleReadiness,
  buildAppliedAccountingSummary,
  buildIfrs18Readiness,
} from "../src/applied-accounting.js";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Usage: node scripts/demo-artifact-data.mjs <output.json>");

const enrichMapping = (account) => {
  const resolution = resolveAccountMapping(account, initialEngagement.standardMappings);
  return {
    ...account,
    mappingStatus: resolution.status,
    effectiveAccountingStandards: resolution.accountingStandardIds,
    effectiveAuditStandards: resolution.auditStandardIds,
    effectiveStandardIds: resolution.effectiveStandardIds,
  };
};

const sourceAccounts = generateTrialBalance();
const adjustmentBridge = buildAdjustmentBridge(sourceAccounts, initialEngagement.adjustments);
const unadjustedAccounts = sourceAccounts.map(enrichMapping);
const accounts = adjustmentBridge.adjustedAccounts.map(enrichMapping);
let totalDebitMinor = 0n;
let totalCreditMinor = 0n;
let revenueMinor = 0n;
for (const account of accounts) {
  totalDebitMinor += BigInt(account.debitMinor);
  totalCreditMinor += BigInt(account.creditMinor);
  if (account.category === "revenue") revenueMinor += BigInt(account.creditMinor) - BigInt(account.debitMinor);
}
const mapping = buildMappingMetrics(accounts, initialEngagement.standardMappings);
const revenue = Number(revenueMinor) / 100;
const materialityMinor = (revenueMinor * BigInt(initialEngagement.materialityPolicy.omRateBp)) / 10_000n;
const performanceMaterialityMinor = (materialityMinor * BigInt(initialEngagement.materialityPolicy.pmRateBp)) / 10_000n;
const materiality = Number(materialityMinor) / 100;
const metrics = {
  accountCount: accounts.length,
  totalDebit: Number(totalDebitMinor) / 100,
  totalCredit: Number(totalCreditMinor) / 100,
  balanceDifference: Number(totalDebitMinor >= totalCreditMinor ? totalDebitMinor - totalCreditMinor : totalCreditMinor - totalDebitMinor) / 100,
  isBalanced: totalDebitMinor === totalCreditMinor,
  revenue,
  materiality,
  materialityMinor: String(materialityMinor),
  performanceMateriality: Number(performanceMaterialityMinor) / 100,
  performanceMaterialityMinor: String(performanceMaterialityMinor),
  unmapped: mapping.unresolved,
  mappingRate: mapping.mappingRate,
  mappingReviewed: mapping.reviewed,
  datasetId: initialEngagement.demo.commitment.datasetId,
  datasetDigest: initialEngagement.demo.commitment.sha256,
  datasetPeriod: initialEngagement.demo.commitment.period,
  datasetCurrency: initialEngagement.demo.commitment.currency,
  datasetCommittedAt: initialEngagement.demo.commitment.committedAt,
};
const sourceTotalDebitMinor = sourceAccounts.reduce((total, account) => total + BigInt(account.debitMinor), 0n);
const sourceTotalCreditMinor = sourceAccounts.reduce((total, account) => total + BigInt(account.creditMinor), 0n);
const sourceRevenueMinor = sourceAccounts.reduce((total, account) => (
  total + (account.category === "revenue" ? BigInt(account.creditMinor) - BigInt(account.debitMinor) : 0n)
), 0n);
const sourceRevenue = Number(sourceRevenueMinor) / 100;
const sourceMaterialityMinor = (sourceRevenueMinor * BigInt(initialEngagement.materialityPolicy.omRateBp)) / 10_000n;
const sourcePerformanceMaterialityMinor = (sourceMaterialityMinor * BigInt(initialEngagement.materialityPolicy.pmRateBp)) / 10_000n;
const sourceMapping = buildMappingMetrics(sourceAccounts, initialEngagement.standardMappings);
const gateMetrics = {
  ...metrics,
  totalDebit: Number(sourceTotalDebitMinor) / 100,
  totalCredit: Number(sourceTotalCreditMinor) / 100,
  balanceDifference: Number(sourceTotalDebitMinor - sourceTotalCreditMinor) / 100,
  isBalanced: sourceTotalDebitMinor === sourceTotalCreditMinor,
  revenue: sourceRevenue,
  materiality: Number(sourceMaterialityMinor) / 100,
  materialityMinor: String(sourceMaterialityMinor),
  performanceMateriality: Number(sourcePerformanceMaterialityMinor) / 100,
  performanceMaterialityMinor: String(sourcePerformanceMaterialityMinor),
  unmapped: sourceMapping.unresolved,
  mappingRate: sourceMapping.mappingRate,
  mappingReviewed: sourceMapping.reviewed,
};
const analytics = buildAnalyticalReview(accounts);
const reportState = buildReportState(initialEngagement, gateMetrics);
const appliedAccounting = {
  summary: buildAppliedAccountingSummary(accounts, initialEngagement, gateMetrics),
  models: Object.entries(APPLIED_MODEL_META).map(([id, model]) => ({ id, ...model })),
  accountingCycle: buildAccountingCycleReadiness(accounts, initialEngagement, gateMetrics),
  ifrs18: buildIfrs18Readiness(accounts, initialEngagement),
  knowledgeCoverage: {
    ...YOUTUBE_KNOWLEDGE_SUMMARY,
    sources: YOUTUBE_KNOWLEDGE_SOURCES,
    topics: YOUTUBE_TOPIC_MAP,
  },
};

const artifact = {
  artifactVersion: "KOSIF-DEMO-5000-v7",
  generatedAt: "2026-08-28T15:00:00.000Z",
  product: "KOSIF Audit Studio",
  siteUrl: "https://kosif-audit-studio.taunt-apron-speak.chatgpt.site",
  disclosure: "بيانات تركيبية حتمية للتجربة والعرض، وليست قوائم مالية حقيقية أو تقرير مراجع مستقل أو رأيًا صالحًا للاعتماد الخارجي.",
  entity: initialEngagement.entity,
  demo: initialEngagement.demo,
  metrics,
  unadjustedMetrics: {
    totalDebit: adjustmentBridge.beforeDebit,
    totalCredit: adjustmentBridge.beforeCredit,
  },
  adjustmentBridge: {
    ...adjustmentBridge,
    adjustedAccounts: undefined,
  },
  analytics,
  appliedAccounting,
  reportState,
  accounts,
  unadjustedAccounts,
  standards: standardCatalog,
  standardsCoverage: buildStandardsCoverage(accounts, initialEngagement.standardMappings),
  rounds: initialEngagement.rounds,
  evidence: initialEngagement.evidence,
  findings: initialEngagement.findings,
  adjustments: initialEngagement.adjustments,
  materialityPolicy: initialEngagement.materialityPolicy,
  council: initialEngagement.council,
  periodLocks: initialEngagement.periodLocks,
  auditTrail: initialEngagement.auditTrail,
  referenceComparison: buildReferenceComparison(),
};

await fs.writeFile(outputPath, JSON.stringify(artifact));
