import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateTrialBalance, initialEngagement } from "../src/data.js";
import { buildAnalyticalReview } from "../src/analytics.js";
import { buildMappingMetrics } from "../src/standards.js";
import { buildReportState } from "../src/reporting.js";
import {
  buildAccountsCsv,
  buildTemporarySessionSnapshot,
  formatMinorUnits,
  timestampedFilename,
} from "../src/session-export.js";

const accounts = generateTrialBalance();

function demoMetrics() {
  const totalDebitMinor = accounts.reduce((total, account) => total + BigInt(account.debitMinor), 0n);
  const totalCreditMinor = accounts.reduce((total, account) => total + BigInt(account.creditMinor), 0n);
  const revenueMinor = accounts.reduce((total, account) => total + (account.category === "revenue" ? BigInt(account.creditMinor) : 0n), 0n);
  const mapping = buildMappingMetrics(accounts, initialEngagement.standardMappings);
  const revenue = Number(revenueMinor) / 100;
  const materialityMinor = (revenueMinor * 75n) / 10_000n;
  const performanceMaterialityMinor = (materialityMinor * 7_500n) / 10_000n;
  return {
    accountCount: accounts.length,
    totalDebit: Number(totalDebitMinor) / 100,
    totalCredit: Number(totalCreditMinor) / 100,
    revenue,
    materiality: revenue * 0.0075,
    materialityMinor: String(materialityMinor),
    performanceMateriality: revenue * 0.0075 * 0.75,
    performanceMaterialityMinor: String(performanceMaterialityMinor),
    balanceDifference: Number(totalDebitMinor - totalCreditMinor) / 100,
    isBalanced: totalDebitMinor === totalCreditMinor,
    unmapped: mapping.unresolved,
    mappingRate: mapping.mappingRate,
    mappingReviewed: mapping.reviewed,
    mappingSuggested: mapping.suggested,
    datasetId: initialEngagement.demo.commitment.datasetId,
    datasetDigest: initialEngagement.demo.commitment.sha256,
    datasetPeriod: initialEngagement.demo.commitment.period,
    datasetCurrency: initialEngagement.demo.commitment.currency,
    datasetCommittedAt: initialEngagement.demo.commitment.committedAt,
  };
}

const stages = Array.from({ length: 10 }, (_, index) => ({
  id: `stage-${index + 1}`,
  label: `مرحلة ${index + 1}`,
  view: "overview",
  status: "complete",
  detail: "مكتملة",
  statusLabel: "مكتمل",
  icon: () => null,
}));

test("builds a complete temporary snapshot from the current committed workspace", async () => {
  const metrics = demoMetrics();
  const snapshot = await buildTemporarySessionSnapshot({
    accounts,
    engagement: initialEngagement,
    metrics,
    stages,
    dataProfile: { source: "demo", label: "بيانات العرض الشاملة", rowCount: 5_000, warnings: 0 },
    generatedAt: "2026-08-28T14:30:00.000Z",
  });

  assert.equal(snapshot.manifest.format, "kosif-session-snapshot");
  assert.equal(snapshot.manifest.schemaVersion, 5);
  assert.equal(snapshot.restorePayload.contractVersion, 1);
  assert.equal(snapshot.restorePayload.accounts.length, 5_000);
  assert.equal(snapshot.restorePayload.commitment.schemaVersion, 2);
  assert.equal(snapshot.manifest.temporary, true);
  assert.equal(snapshot.provenance.sentToServer, false);
  assert.equal(snapshot.provenance.uncommittedStagingIncluded, false);
  assert.equal(snapshot.trialBalance.accounts.length, 5_000);
  assert.equal(snapshot.trialBalance.totalDebitMinor, snapshot.trialBalance.totalCreditMinor);
  assert.equal(snapshot.trialBalance.balanced, true);
  assert.equal(snapshot.trialBalance.postedAdjustmentDebitMinor, snapshot.trialBalance.postedAdjustmentCreditMinor);
  assert.equal(snapshot.trialBalance.adjustedTotalDebitMinor, snapshot.trialBalance.adjustedTotalCreditMinor);
  assert.equal(snapshot.trialBalance.adjustedBalanced, true);
  assert.equal(snapshot.trialBalance.adjustmentBridge.postedDebitMinor, "128280000");
  assert.equal(snapshot.trialBalance.adjustedAccountChanges.length, 6);
  assert.equal(snapshot.analytics.ratios.grossMarginPct, -0.36);
  assert.equal(snapshot.analytics.ratios.operatingMarginPct, -101.35);
  assert.equal(snapshot.analytics.areas.length, 20);
  assert.equal(snapshot.analytics.benford.length, 9);
  assert.equal(snapshot.appliedAccounting.summary.cycleTotal, 12);
  assert.equal(snapshot.appliedAccounting.ifrs18.readinessChecks.length, 4);
  assert.equal(snapshot.appliedAccounting.knowledgeCoverage.uniqueVideos, 465);
  assert.ok(snapshot.appliedAccounting.knowledgeCoverage.topics.length >= 10);
  assert.equal(snapshot.appliedAccounting.ifrs18.totals.operatingProfit, -883769.4);
  assert.equal(snapshot.summary.resultFamilies, 12);
  assert.equal(snapshot.standards.coverage.length, 61);
  assert.equal(Object.keys(snapshot.standards.decisions.overrides).length, 26);
  assert.equal(snapshot.governance.riskSample.length, 36);
  assert.equal(snapshot.governance.evidenceLineage.length, 36);
  assert.equal(snapshot.governance.journalHashChain.length, 24);
  assert.equal(snapshot.governance.journalHashChain.every(({ hash }) => /^[a-f0-9]{64}$/.test(hash)), true);
  assert.equal(snapshot.governance.adjustmentJournalHashChain.length, 3);
  assert.equal(snapshot.governance.adjustmentJournalHashChain.every(({ hash }) => /^[a-f0-9]{64}$/.test(hash)), true);
  assert.equal(snapshot.governance.reconciliations.length, 12);
  assert.equal(snapshot.auditExecution.rounds.length, 20);
  assert.equal(snapshot.auditExecution.evidence.length, 20);
  assert.equal(snapshot.auditExecution.findings.length, 20);
  assert.equal(snapshot.auditExecution.adjustments.length, 3);
  assert.equal(snapshot.auditExecution.adjustmentJournals.length, 3);
  assert.equal(snapshot.referenceResults.comparison.length, 5);
  assert.equal(snapshot.referenceResults.scenarios.cloudflareStable.renderedCounts.pbcRequestCount, 0);
  assert.equal(snapshot.referenceResults.scenarios.githubAcc.findingCount, 37);
  assert.equal(snapshot.reporting.state.gates.length, 12);
  assert.equal(snapshot.reporting.state.reportReady, true);
  assert.equal(snapshot.stages.every((stage) => !("icon" in stage)), true);
  assert.equal("appearance" in snapshot, false);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test("uses the active data profile as provenance and preserves draft state", async () => {
  const imported = accounts.slice(0, 2).map((account, index) => ({ ...account, id: `I-${index + 1}`, code: `99${index + 1}` }));
  const draft = { ...initialEngagement, humanApproval: false, report: { ...initialEngagement.report, status: "draft" } };
  const metrics = { ...demoMetrics(), accountCount: 2, humanApproval: false };
  const snapshot = await buildTemporarySessionSnapshot({
    accounts: imported,
    engagement: draft,
    metrics,
    stages: [],
    dataProfile: { source: "import", label: "ميزان مستورد", rowCount: 2, warnings: 1, importedAt: "2026-08-28T15:00:00.000Z" },
  });

  assert.equal(snapshot.provenance.source, "import");
  assert.equal(snapshot.provenance.synthetic, false);
  assert.equal(snapshot.provenance.demoSeed, null);
  assert.equal(snapshot.trialBalance.accounts.length, 2);
  assert.equal(snapshot.engagement.humanApproval, false);
  assert.equal(snapshot.reporting.report.status, "draft");
});

test("exports exact, spreadsheet-safe CSV for every current account", () => {
  const reviewedBase = accounts.find((account) => account.mapped === false);
  const malicious = {
    ...reviewedBase,
    code: "\t001",
    name: "=HYPERLINK(\"https://example.invalid\")",
    debitMinor: "900719925474099312345",
  };
  const csv = buildAccountsCsv([malicious], initialEngagement.standardMappings);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("\r\n"));
  assert.match(csv, /"'\t001"/);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
  assert.match(csv, /"9007199254740993123\.45"/);
  assert.match(csv, /"900719925474099312345"/);
  assert.match(csv, /"reviewed"/);
  assert.equal(formatMinorUnits("-12345", 2), "-123.45");
  assert.equal(timestampedFilename("kosif", "json", new Date("2026-08-28T14:30:00.000Z")), "kosif-2026-08-28T14-30-00-000Z.json");
});

test("shares one canonical 12-gate evaluator between results and reporting", () => {
  const state = buildReportState(initialEngagement, demoMetrics());
  assert.equal(state.gates.length, 12);
  assert.equal(state.passedGates, 12);
  assert.equal(state.reportReady, true);
  assert.match(state.reportOpinion, /رأي غير معدل/);
});

test("exposes the result center and temporary downloads in the rendered app contract", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const center = await readFile(new URL("../src/components/ResultsCenter.jsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../src/data.js", import.meta.url), "utf8");

  assert.match(data, /id: "results", label: "مركز النتائج"/);
  assert.match(app, /activeView === "results"/);
  assert.match(app, /لقطة الجلسة المؤقتة/);
  assert.match(center, /تنزيل الجلسة المؤقتة JSON/);
  assert.match(center, /تنزيل XLSX الحالي/);
  assert.match(center, /كل بوابات التقرير/);
  assert.match(center, /كل نتائج المعايير/);
  assert.match(center, /label: "النماذج التطبيقية"[\s\S]*count: Object\.keys\(APPLIED_MODEL_META\)\.length/);
  assert.match(center, /دورة الإقفال[\s\S]*جاهزية IFRS 18/);
});
