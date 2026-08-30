import assert from "node:assert/strict";
import test from "node:test";
import { generateTrialBalance, initialEngagement } from "../src/data.js";
import { buildAnalyticalReview } from "../src/analytics.js";
import { buildMappingMetrics } from "../src/standards.js";
import { buildEvidenceLineage } from "../src/governance.js";
import { buildAdjustmentBridge, buildReportState, isAdjustmentPosted } from "../src/reporting.js";

const accounts = generateTrialBalance();
const mapping = buildMappingMetrics(accounts, initialEngagement.standardMappings);
const metrics = {
  accountCount: accounts.length,
  isBalanced: true,
  balanceDifference: 0,
  unmapped: mapping.unresolved,
  datasetId: initialEngagement.demo.commitment.datasetId,
  datasetDigest: initialEngagement.demo.commitment.sha256,
  datasetPeriod: initialEngagement.demo.commitment.period,
  datasetCurrency: initialEngagement.demo.commitment.currency,
  datasetCommittedAt: initialEngagement.demo.commitment.committedAt,
};

const copyEngagement = () => structuredClone(initialEngagement);

test("blocks issuance when the standards map is resolved but not human-confirmed", () => {
  const engagement = copyEngagement();
  engagement.mappingConfirmed = false;
  const state = buildReportState(engagement, metrics);

  assert.equal(state.mappingApproved, false);
  assert.equal(state.gates.find(({ id }) => id === "mapping").pass, false);
  assert.equal(state.reportReady, false);
});

test("requires twenty rounds with explicit finding and evidence links", () => {
  const engagement = copyEngagement();
  engagement.rounds = engagement.rounds.slice(0, 19);
  const state = buildReportState(engagement, metrics);

  assert.equal(state.roundsComplete, false);
  assert.equal(state.gates.find(({ id }) => id === "rounds").pass, false);
  assert.equal(state.reportReady, false);
});

test("fails closed for a manual PBC request until response and reviewer conclusion are documented", () => {
  const engagement = copyEngagement();
  engagement.manualPbcRequests = [{
    id: "PBC-MANUAL-1",
    title: "مصادقة إضافية",
    roundId: engagement.rounds[0].id,
    owner: "فريق المراجعة",
    status: "pending",
    createdAt: "2026-08-28T12:00:00.000Z",
  }];
  let state = buildReportState(engagement, metrics);
  assert.equal(state.pendingManualPbc, 1);
  assert.equal(state.invalidEvidence, 0);
  assert.equal(state.missingEvidence, 0);
  assert.equal(state.pendingEvidence, 1);
  assert.equal(state.gates.find(({ id }) => id === "evidence").pass, false);
  assert.equal(state.reportReady, false);

  engagement.manualPbcRequests[0] = {
    ...engagement.manualPbcRequests[0],
    status: "approved",
    receivedAt: "2026-08-28T12:20:00.000Z",
    reviewStartedAt: "2026-08-28T12:40:00.000Z",
    approvedAt: "2026-08-28T13:00:00.000Z",
    approvedBy: "مدير المراجعة",
    responseReference: "RESP-1",
    conclusion: "استجابة كافية ومطابقة للطلب.",
  };
  state = buildReportState(engagement, metrics);
  assert.equal(state.pendingManualPbc, 0);
  assert.equal(state.pendingEvidence, 0);
  assert.equal(state.gates.find(({ id }) => id === "evidence").pass, true);
  assert.equal(state.reportReady, true);
});

test("requires every manual PBC lifecycle timestamp in chronological order", () => {
  const approvedRequest = {
    id: "PBC-MANUAL-CHRONOLOGY",
    title: "مصادقة إضافية",
    roundId: initialEngagement.rounds[0].id,
    owner: "فريق المراجعة",
    status: "approved",
    createdAt: "2026-08-28T12:00:00.000Z",
    receivedAt: "2026-08-28T12:20:00.000Z",
    reviewStartedAt: "2026-08-28T12:40:00.000Z",
    approvedAt: "2026-08-28T13:00:00.000Z",
    approvedBy: "مدير المراجعة",
    responseReference: "RESP-CHRONOLOGY",
    conclusion: "استجابة كافية ومطابقة للطلب.",
  };
  const corruptions = [
    (request) => { request.receivedAt = null; },
    (request) => { request.reviewStartedAt = null; },
    (request) => { request.receivedAt = "2026-08-28T12:50:00.000Z"; },
    (request) => { request.reviewStartedAt = "2026-08-28T13:10:00.000Z"; },
  ];

  for (const corrupt of corruptions) {
    const engagement = copyEngagement();
    const request = structuredClone(approvedRequest);
    corrupt(request);
    engagement.manualPbcRequests = [request];
    const state = buildReportState(engagement, metrics);
    assert.equal(state.manualPbcChronologyValid, false);
    assert.equal(state.pendingManualPbc, 1);
    assert.equal(state.reportReady, false);
  }
});

test("reopens issuance when manual PBC work completes after final human approval", () => {
  const engagement = copyEngagement();
  engagement.manualPbcRequests = [{
    id: "PBC-MANUAL-AFTER-APPROVAL",
    title: "مصادقة متأخرة",
    roundId: engagement.rounds[0].id,
    owner: "فريق المراجعة",
    status: "approved",
    createdAt: "2026-08-28T14:05:00.000Z",
    receivedAt: "2026-08-28T14:20:00.000Z",
    reviewStartedAt: "2026-08-28T14:40:00.000Z",
    approvedAt: "2026-08-28T15:30:00.000Z",
    approvedBy: "مدير المراجعة",
    responseReference: "RESP-LATE",
    conclusion: "استجابة كافية، لكنها اكتملت بعد اعتماد التقرير.",
  }];

  const state = buildReportState(engagement, metrics);
  assert.equal(state.pendingManualPbc, 0);
  assert.equal(state.manualPbcChronologyValid, true);
  assert.equal(state.chronologyValid, false);
  assert.equal(state.gates.find(({ id }) => id === "human-approval").pass, false);
  assert.equal(state.reportReady, false);
});

test("reports invalid evidence separately from missing and manual PBC requests", () => {
  const engagement = copyEngagement();
  engagement.evidence[0].hash = "0".repeat(64);
  const state = buildReportState(engagement, metrics);
  assert.equal(state.invalidEvidence, 1);
  assert.equal(state.missingEvidence, 0);
  assert.equal(state.pendingManualPbc, 0);
  assert.equal(state.pendingEvidence, 1);
  assert.equal(state.gates.find(({ id }) => id === "evidence").pass, false);
});

test("accepts the live UI human-reviewed completion disposition", () => {
  const engagement = copyEngagement();
  engagement.rounds[0].result.disposition = "human-reviewed";
  assert.equal(buildReportState(engagement, metrics).reportReady, true);
});

test("rejects accepted adjustments without a posted balanced double entry", () => {
  const engagement = copyEngagement();
  engagement.adjustments[0].lines[0].debitMinor = "1";
  const state = buildReportState(engagement, metrics);

  assert.equal(isAdjustmentPosted(engagement.adjustments[0]), false);
  assert.equal(state.pendingAdjustments, 1);
  assert.equal(state.gates.find(({ id }) => id === "adjustments").pass, false);
  assert.equal(state.reportReady, false);
});

test("reconciles source, posted journals, and adjusted ratios without double-counting", () => {
  const bridge = buildAdjustmentBridge(accounts, initialEngagement.adjustments);
  const adjusted = buildAnalyticalReview(bridge.adjustedAccounts);
  assert.equal(bridge.postedCount, 3);
  assert.equal(bridge.postedDebit, 1_282_800);
  assert.equal(bridge.postedCredit, 1_282_800);
  assert.equal(bridge.journalizedDebit, bridge.beforeDebit + bridge.postedDebit);
  assert.equal(bridge.adjustedDebit, bridge.beforeDebit);
  assert.equal(bridge.adjustedCredit, bridge.beforeCredit);
  assert.equal(bridge.adjustedAccounts.every((account) => !(account.debit > 0 && account.credit > 0)), true);
  assert.equal(adjusted.ratioInputs.revenue, 110_573_213.25);
  assert.equal(adjusted.ratios.grossMarginPct, -0.36);
  assert.equal(adjusted.ratios.operatingMarginPct, -101.35);
});

test("rejects a human approval timestamp that precedes required work", () => {
  const engagement = copyEngagement();
  engagement.humanApprovedAt = "2026-08-27T12:00:00.000Z";
  const state = buildReportState(engagement, metrics);

  assert.equal(state.chronologyValid, false);
  assert.equal(state.gates.find(({ id }) => id === "human-approval").pass, false);
  assert.equal(state.reportReady, false);
});

test("fails closed when evidence metadata or linked conclusions are corrupt", () => {
  const corruptions = [
    (engagement) => { engagement.evidence[0].fileName = ""; },
    (engagement) => { engagement.evidence[0].hash = "not-a-sha256"; },
    (engagement) => { engagement.evidence[0].reviewedBy = ""; },
    (engagement) => { engagement.findings[0].evidenceIds = ["PBC-NOT-FOUND"]; },
    (engagement) => { engagement.rounds[1].id = engagement.rounds[0].id; },
  ];

  for (const corrupt of corruptions) {
    const engagement = copyEngagement();
    corrupt(engagement);
    const state = buildReportState(engagement, metrics);
    assert.equal(state.reportReady, false);
    assert.ok(state.passedGates < 12);
  }
});

test("rejects unknown standard identifiers in rounds, evidence, or findings", () => {
  const corruptions = [
    (engagement) => {
      engagement.rounds[0].standards = ["UNKNOWN 999"];
      engagement.rounds[0].result.standards = ["UNKNOWN 999"];
    },
    (engagement) => { engagement.evidence[0].standardIds = ["UNKNOWN 999"]; },
    (engagement) => { engagement.findings[0].standardIds = ["UNKNOWN 999"]; },
  ];
  for (const corrupt of corruptions) {
    const engagement = copyEngagement();
    corrupt(engagement);
    const state = buildReportState(engagement, metrics);
    assert.equal(state.standardsValid, false);
    assert.equal(state.reportReady, false);
    assert.equal(state.gates.find(({ id }) => id === "rounds").pass, false);
  }
});

test("requires real segregation, council work, and timestamped acceptance", () => {
  const corruptions = [
    (engagement) => { engagement.acceptance.approvedAt = null; },
    (engagement) => { engagement.periodLocks[0].approvedBy = engagement.periodLocks[0].preparedBy; },
    (engagement) => { engagement.council.rounds = []; },
  ];

  for (const corrupt of corruptions) {
    const engagement = copyEngagement();
    corrupt(engagement);
    assert.equal(buildReportState(engagement, metrics).reportReady, false);
  }
});

test("rejects hollow metadata, invalid ISA 705 inputs, and placeholder governance", () => {
  const corruptions = [
    (engagement) => { engagement.materialityPolicy = null; },
    (engagement) => { engagement.opinionAssessment.basis = "garbage"; },
    (engagement) => { engagement.report.status = "draft"; },
    (engagement) => { engagement.evidence[0].hash = "0".repeat(64); },
    (engagement) => { engagement.evidence[0].attachedAt = null; },
    (engagement) => { engagement.evidence[0].fileSize = null; },
    (engagement) => { engagement.evidence[0].findingIds = ["F-NOT-FOUND"]; },
    (engagement) => { engagement.council.rounds = [{}]; },
  ];

  for (const corrupt of corruptions) {
    const engagement = copyEngagement();
    corrupt(engagement);
    assert.equal(buildReportState(engagement, metrics).reportReady, false);
  }
});

test("rejects out-of-order work even when every status says complete", () => {
  const corruptions = [
    (engagement) => { engagement.council.humanDecision.decidedAt = "2026-08-22T09:00:00.000Z"; },
    (engagement) => { engagement.evidence[0].attachedAt = "2026-08-29T00:00:00.000Z"; },
    (engagement) => { engagement.rounds[0].startedAt = "2026-08-29T00:00:00.000Z"; },
    (engagement) => { engagement.findings[0].closedAt = "2026-08-26T06:00:00.000Z"; },
    (engagement) => { engagement.adjustments[0].postedAt = "not-a-date"; },
  ];

  for (const corrupt of corruptions) {
    const engagement = copyEngagement();
    corrupt(engagement);
    assert.equal(buildReportState(engagement, metrics).reportReady, false);
  }
});

test("requires a non-empty population that matches its dataset descriptor", () => {
  assert.equal(buildReportState(initialEngagement, { ...metrics, accountCount: 0 }).reportReady, false);
  assert.equal(buildReportState(initialEngagement, { ...metrics, datasetCommittedAt: "2026-08-27T00:00:00.000Z" }).reportReady, false);

  const engagement = copyEngagement();
  engagement.demo = null;
  engagement.sourceDataset = {
    source: "import",
    label: "fixture.xlsx",
    rowCount: 1,
    importedAt: "2026-08-22T09:00:00.000Z",
    sessionOnly: true,
  };
  assert.equal(buildReportState(engagement, metrics).reportReady, false);
});

test("rejects imported-work chronology that predates the committed dataset", () => {
  const engagement = copyEngagement();
  engagement.sourceDataset = {
    source: "import",
    label: "fixture.xlsx",
    rowCount: 5_000,
    importedAt: "2026-08-28T16:00:00.000Z",
    sessionOnly: true,
  };
  const state = buildReportState(engagement, metrics);

  assert.equal(state.chronologyValid, false);
  assert.equal(state.reportReady, false);
});

test("links sampled accounts by explicit category before generic assertions", () => {
  const lineage = buildEvidenceLineage(accounts, initialEngagement, 36);
  const evidenceById = new Map(initialEngagement.evidence.map((item) => [item.id, item]));
  const accountById = new Map(accounts.map((item) => [item.id, item]));

  assert.equal(lineage.length, 36);
  assert.equal(lineage.every((item) => {
    const account = accountById.get(item.accountId);
    const evidence = evidenceById.get(item.evidence);
    return evidence?.categoryKeys?.includes(account?.category);
  }), true);
});
