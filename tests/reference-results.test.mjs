import assert from "node:assert/strict";
import test from "node:test";
import {
  ACC_AUDIT_ROUNDS,
  REFERENCE_RESULT_GROUPS,
  REFERENCE_SCENARIOS,
  buildReferenceComparison,
  getReferenceScenario,
} from "../src/reference-results.js";

test("keeps live v2 and v3 observations as separate reference datasets", () => {
  const v2 = getReferenceScenario("v2");
  const v3 = getReferenceScenario("v3");

  assert.equal(v2.currency, "SAR");
  assert.equal(v2.entityName, "محمود القصيف");
  assert.equal(v2.accountCount, 5_000);
  assert.equal(v2.auditRoundCount, 20);
  assert.equal(v2.findingCount, 20);
  assert.equal(v2.totalDebit, 2_544_568_750);
  assert.equal(v2.materiality, 6_349_212.5);

  assert.equal(v3.currency, "SAR");
  assert.equal(v3.entityName, "شركة محمود الدسوقي القابضة للتجارة والتوزيع");
  assert.equal(v3.accountCount, 330);
  assert.equal(v3.auditRoundCount, 20);
  assert.equal(v3.findingCount, 20);
  assert.equal(v3.documentRequestCount, 19);
  assert.equal(v3.totalDebit, 880_943_250);
  assert.equal(v3.materiality, 3_057_450);
  assert.notEqual(v2.id, v3.id);
});

test("records the live stable surface with claimed and rendered counts kept separate", () => {
  const stable = getReferenceScenario("stable");

  assert.equal(stable.source.publicUrl, "https://kosif-stable.kosif199022.workers.dev/");
  assert.equal(stable.entityName, "شركة الوادي القابضة للصناعات الغذائية");
  assert.equal(stable.currency, "SAR");
  assert.equal(stable.accountCount, 110);
  assert.equal(stable.auditRoundCount, 3);
  assert.equal(stable.findingCount, 16);
  assert.equal(stable.totalDebit, 533_905_000);
  assert.equal(stable.materiality, 1_853_000);
  assert.equal(stable.reportIssued, true);
  assert.equal(stable.claimedCounts.collectedDocumentCount, 14);
  assert.equal(stable.claimedCounts.documentRequestCount, 12);
  assert.equal(stable.claimedCounts.journalEntryCount, 8);
  assert.equal(stable.claimedCounts.reclassificationCount, 4);
  assert.equal(stable.renderedCounts.accountCount, 110);
  assert.equal(stable.renderedCounts.auditRoundCount, 3);
  assert.equal(stable.renderedCounts.findingCount, 16);
  assert.equal(stable.renderedCounts.pbcRequestCount, 0);
  assert.equal(stable.pbcRenderedCount, 0);
  assert.deepEqual(stable.exportFormats, ["JSON", "CSV", "DOC", "PDF"]);
  assert.deepEqual(stable.defects.map((defect) => defect.id), [
    "rendered-source-leakage",
    "analytics-rendering-failure",
    "pbc-count-mismatch",
  ]);
  assert.equal(Object.hasOwn(stable, "evidenceHashes"), false);
});

test("preserves the complete GitHub Acc contract and its ten-round arithmetic", () => {
  const acc = getReferenceScenario("github-acc-mahrousa-contract");
  const totals = ACC_AUDIT_ROUNDS.reduce(
    (result, round) => ({
      findings: result.findings + round.findings.total,
      resolved: result.resolved + round.findings.resolved,
      open: result.open + round.findings.open,
      evidence: result.evidence + round.evidenceItems,
    }),
    { findings: 0, resolved: 0, open: 0, evidence: 0 },
  );

  assert.equal(acc.datasetId, "mahrousa.synthetic.2026.1");
  assert.equal(acc.currency, "EGP");
  assert.equal(acc.accountCount, 5_000);
  assert.equal(acc.auditRoundCount, 10);
  assert.equal(acc.standardsCoverageCount, 51);
  assert.equal(acc.capabilityGroupCount, 29);
  assert.equal(acc.endpointPathCount, 92);
  assert.equal(acc.reportIssued, false);
  assert.equal(ACC_AUDIT_ROUNDS.length, 10);
  assert.deepEqual(totals, { findings: 37, resolved: 30, open: 7, evidence: 1_245 });
  assert.equal(totals.findings, acc.findingCount);
  assert.equal(totals.resolved, acc.resolvedFindingCount);
  assert.equal(totals.open, acc.openFindingCount);
  assert.equal(totals.evidence, acc.evidenceCount);
});

test("records the GitHub mahmoud audit lab without blending it into live totals", () => {
  const lab = getReferenceScenario("mahmoud");

  assert.equal(lab.accountCount, 5_000);
  assert.equal(lab.journalEntryCount, 1_601);
  assert.equal(lab.totalDebit, 8_007_025_560);
  assert.equal(lab.materiality, 12_041_264.54);
  assert.equal(lab.analytics.riskFlagCount, 167);
  assert.equal(lab.analytics.anomalyCount, 185);
  assert.equal(lab.analytics.benfordNed, 6.5);
  assert.equal(lab.analytics.altmanZ, 0.31);
  assert.equal(lab.analytics.compositeRisk, 66.9);
  assert.equal(lab.sourceKind, "github-generated-artifact");
});

test("deep-freezes scenarios, provenance, limitations, rounds, and comparisons", () => {
  const acc = REFERENCE_SCENARIOS.githubAcc;
  const comparison = buildReferenceComparison();

  assert.equal(Object.isFrozen(REFERENCE_SCENARIOS), true);
  assert.equal(Object.isFrozen(acc), true);
  assert.equal(Object.isFrozen(acc.source), true);
  assert.equal(Object.isFrozen(acc.limitations), true);
  assert.equal(Object.isFrozen(acc.rounds), true);
  assert.equal(Object.isFrozen(acc.rounds[0].findings), true);
  assert.equal(Object.isFrozen(REFERENCE_SCENARIOS.cloudflareStable.claimedCounts), true);
  assert.equal(Object.isFrozen(REFERENCE_SCENARIOS.cloudflareStable.renderedCounts), true);
  assert.equal(Object.isFrozen(REFERENCE_SCENARIOS.cloudflareStable.exportFormats), true);
  assert.equal(Object.isFrozen(REFERENCE_SCENARIOS.cloudflareStable.defects), true);
  assert.equal(Object.isFrozen(REFERENCE_SCENARIOS.cloudflareStable.defects[2]), true);
  assert.equal(Object.isFrozen(comparison), true);
  assert.equal(Object.isFrozen(comparison[0]), true);
  assert.equal(Object.isFrozen(comparison[0].limitations), true);
  assert.throws(() => {
    acc.rounds[0].findings.open = 99;
  }, TypeError);
  assert.throws(() => {
    comparison.push({ id: "mixed-dataset" });
  }, TypeError);
});

test("exposes exactly three provenance groups and immutable comparison rows", () => {
  const groups = Object.values(REFERENCE_RESULT_GROUPS);
  const comparison = buildReferenceComparison(["v2", "v3", "stable", "acc", "lab"]);

  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((group) => group.scenarioIds.length), [3, 1, 1]);
  assert.equal(comparison.length, 5);
  assert.deepEqual(comparison.map((row) => row.sourceKind), [
    "live-surface-observation",
    "live-surface-observation",
    "live-surface-observation",
    "github-source-contract",
    "github-generated-artifact",
  ]);
  assert.equal(comparison[0].verifiedAt, "2026-08-28T00:00:00.000Z");
  assert.equal(comparison[1].verifiedAt, "2026-08-28T00:00:00.000Z");
  assert.equal(comparison[2].verifiedAt, "2026-08-29T00:00:00.000Z");
  assert.equal(comparison[2].pbcRenderedCount, 0);
  assert.equal(comparison[2].reclassifications, 4);
  assert.deepEqual(comparison[2].exportFormats, ["JSON", "CSV", "DOC", "PDF"]);
  assert.equal(Object.isFrozen(comparison[2].claimedCounts), true);
  assert.equal(Object.isFrozen(comparison[2].renderedCounts), true);
  assert.equal(Object.isFrozen(comparison[2].defects), true);
  assert.equal(getReferenceScenario("unknown"), null);
});
