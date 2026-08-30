import assert from "node:assert/strict";
import test from "node:test";
import { createFreshEngagement, generateTrialBalance, initialEngagement } from "../src/data.js";
import { buildMappingMetrics } from "../src/standards.js";
import { buildReportState } from "../src/reporting.js";

test("committing a new trial balance clears every derived result and approval", () => {
  const importedAt = "2026-08-28T16:00:00.000Z";
  const fresh = createFreshEngagement(initialEngagement, {
    source: "import",
    label: "customer-ledger.xlsx",
    rowCount: 2,
    importedAt,
    warnings: 0,
  }, importedAt);

  assert.equal(fresh.sourceDataset.rowCount, 2);
  assert.equal(fresh.sourceDataset.sessionOnly, true);
  assert.equal(fresh.rounds.filter(({ status }) => status === "complete").length, 0);
  assert.equal(fresh.rounds[0].status, "active");
  assert.equal(fresh.evidence.every(({ hash, fileName, status }) => !hash && !fileName && status === "pending"), true);
  assert.equal(fresh.findings.every(({ status, resolution }) => status === "open" && !resolution), true);
  assert.equal(fresh.adjustments.every(({ status, lines }) => status === "pending" && lines.length === 0), true);
  assert.equal(fresh.mappingConfirmed, false);
  assert.equal(fresh.analyticsReview.acknowledged, false);
  assert.equal(fresh.council.rounds.length, 0);
  assert.deepEqual(fresh.acceptance, {
    independence: false,
    conflicts: false,
    integrity: false,
    terms: false,
    approvedAt: null,
  });
  assert.equal(fresh.materialityPolicy.approvedBy, null);
  assert.equal(fresh.materialityPolicy.approvedAt, null);
  assert.equal(fresh.humanApproval, false);
  assert.equal(fresh.report.status, "draft");

  const accounts = generateTrialBalance().slice(0, 2);
  const mapping = buildMappingMetrics(accounts, fresh.standardMappings);
  const report = buildReportState(fresh, {
    accountCount: accounts.length,
    isBalanced: true,
    unmapped: mapping.unresolved,
  });
  assert.equal(report.reportReady, false);
});
