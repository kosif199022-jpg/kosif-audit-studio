import assert from "node:assert/strict";
import test from "node:test";
import { createCompleteDemoEngagement, generateTrialBalance, initialEngagement } from "../src/data.js";
import { buildMappingMetrics, buildStandardsCoverage } from "../src/standards.js";
import { buildCouncilSnapshot, buildEvidenceLineage, buildRiskSample, createJournalEntries, sha256HexSync } from "../src/governance.js";
import { buildReportState, isAdjustmentPosted } from "../src/reporting.js";

test("ships a complete, reproducible 5,000-account demonstration engagement", () => {
  const accounts = generateTrialBalance();
  const engagement = createCompleteDemoEngagement(accounts);
  const mapping = buildMappingMetrics(accounts, engagement.standardMappings);

  assert.equal(accounts.length, 5_000);
  assert.equal(engagement.demo.accountCount, 5_000);
  assert.equal(engagement.demo.areaCount, 20);
  assert.equal(engagement.demo.synthetic, true);
  assert.equal(engagement.version, 7);
  assert.equal(engagement.demoDatasetVersion, "KOSIF-DEMO-5000-v7");
  assert.equal(engagement.rounds.length, 20);
  assert.equal(engagement.rounds.every(({ status, progress }) => status === "complete" && progress === 100), true);
  assert.equal(engagement.rounds.every(({ findings, findingIds, evidenceIds, standards, documents }) => findings === findingIds.length && evidenceIds.length > 0 && standards.length > 0 && documents.length === 2), true);
  assert.equal(engagement.evidence.length, 20);
  assert.equal(engagement.evidence.every(({ status, reviewedAt, hash }) => status === "approved" && reviewedAt && /^[a-f0-9]{64}$/.test(hash)), true);
  assert.equal(engagement.evidence.every(({ hash, hashInput }) => sha256HexSync(hashInput) === hash), true);
  assert.equal(engagement.findings.length, 20);
  assert.equal(engagement.findings.every(({ status, resolution }) => status === "closed" && resolution), true);
  assert.equal(engagement.adjustments.every(isAdjustmentPosted), true);
  assert.equal(mapping.unresolved, 0);
  assert.equal(mapping.mappingRate, 100);
  assert.equal(mapping.reviewed, 26);
  assert.equal(engagement.mappingConfirmed, true);
  assert.equal(engagement.analyticsReview.acknowledged, true);
  assert.equal(engagement.analyticsReview.reviewedSignals.length >= 6, true);
  assert.equal(engagement.periodLocks.some(({ id, status }) => id === "2025-12" && status === "locked"), true);
  assert.equal(engagement.council.rounds.length, 2);
  assert.equal(engagement.council.humanDecision.status, "approved");
  assert.equal(engagement.opinionAssessment.basis, "none");
  assert.equal(engagement.humanApproval, true);
  assert.equal(engagement.auditTrail.length, 12);
  assert.equal(engagement.auditTrail.every((item, index, items) => index === 0 || Date.parse(items[index - 1].at) >= Date.parse(item.at)), true);
  assert.equal(engagement.rounds.at(-1).completedAt < engagement.humanApprovedAt, true);
  assert.equal(engagement.evidence.at(-1).reviewedAt < engagement.humanApprovedAt, true);
  assert.equal(engagement.findings.at(-1).closedAt < engagement.humanApprovedAt, true);
  assert.equal(buildReportState(engagement, {
    isBalanced: true,
    balanceDifference: 0,
    accountCount: 5_000,
    unmapped: 0,
    datasetId: engagement.demo.commitment.datasetId,
    datasetDigest: engagement.demo.commitment.sha256,
    datasetPeriod: engagement.demo.commitment.period,
    datasetCurrency: engagement.demo.commitment.currency,
    datasetCommittedAt: engagement.demo.commitment.committedAt,
  }).reportReady, true);
});

test("populates every analytical and governed capability from the same demo population", () => {
  const accounts = generateTrialBalance();
  const engagement = createCompleteDemoEngagement(accounts);
  const mapping = buildMappingMetrics(accounts, engagement.standardMappings);
  const coverage = buildStandardsCoverage(accounts, engagement.standardMappings);
  const council = buildCouncilSnapshot(accounts, engagement, mapping);
  const lineage = buildEvidenceLineage(accounts, engagement, 36);
  const sample = buildRiskSample(accounts, 36);
  const journals = createJournalEntries(accounts, 24);

  assert.equal(coverage.reduce((total, item) => total + item.accountCount, 0) >= accounts.length, true);
  assert.equal(council.advisors.length, 4);
  assert.equal(council.consensus.status, "clear");
  assert.equal(lineage.length, 36);
  assert.equal(lineage.every(({ evidence, roundId, finding }) => evidence !== "—" && roundId !== "—" && finding !== "—"), true);
  assert.equal(new Set(lineage.map(({ evidence }) => evidence)).size >= 8, true);
  assert.equal(sample.length, 36);
  assert.equal(journals.length, 24);
  assert.deepEqual(initialEngagement.demo, engagement.demo);
});
