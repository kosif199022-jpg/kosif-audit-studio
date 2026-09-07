import assert from "node:assert/strict";
import test from "node:test";
import { AUDIT_REPORT_SOURCES, buildAuditorReportBlueprint } from "../src/audit-report-library.js";
import { createCompleteDemoEngagement, generateTrialBalance } from "../src/data.js";
import { buildMappingMetrics } from "../src/standards.js";
import { buildReportState } from "../src/reporting.js";

test("keeps official audit report sources first-party and traceable", () => {
  assert.equal(AUDIT_REPORT_SOURCES.length, 6);
  assert.equal(new Set(AUDIT_REPORT_SOURCES.map((source) => source.id)).size, AUDIT_REPORT_SOURCES.length);
  assert.equal(AUDIT_REPORT_SOURCES.every((source) => /^https:\/\//.test(source.url)), true);
  assert.equal(AUDIT_REPORT_SOURCES.some((source) => source.url.includes("sec.gov")), true);
  assert.equal(AUDIT_REPORT_SOURCES.some((source) => source.url.includes("iaasb.org")), true);
  assert.equal(AUDIT_REPORT_SOURCES.some((source) => source.url.includes("pcaobus.org")), true);
});

test("builds a deterministic seven-part auditor report blueprint from the 5,000-account demo", () => {
  const accounts = generateTrialBalance();
  const engagement = createCompleteDemoEngagement(accounts);
  const mapping = buildMappingMetrics(accounts, engagement.standardMappings);
  const metrics = {
    accountCount: accounts.length,
    materiality: 125_000,
    unmapped: mapping.unresolved,
  };
  const reportState = buildReportState(engagement, {
    ...metrics,
    isBalanced: true,
    balanceDifference: 0,
    datasetId: engagement.demo.commitment.datasetId,
    datasetDigest: engagement.demo.commitment.sha256,
    datasetPeriod: engagement.demo.commitment.period,
    datasetCurrency: engagement.demo.commitment.currency,
    datasetCommittedAt: engagement.demo.commitment.committedAt,
  });
  const blueprint = buildAuditorReportBlueprint({
    engagement,
    metrics,
    reportState,
  });

  assert.equal(blueprint.entity, "شركة محمود الدسوقي العالمية");
  assert.equal(blueprint.sections.length, 7);
  assert.equal(blueprint.keyAuditMatters.length > 0, true);
  assert.equal(blueprint.trace.accountCount, 5_000);
  assert.equal(blueprint.trace.findingCount, engagement.findings.length);
  assert.equal(blueprint.sourceIds.includes("iaasb-isa701"), true);
  assert.equal(blueprint.sourceIds.includes("pcaob-as3101"), true);
  assert.deepEqual(
    buildAuditorReportBlueprint({ engagement, metrics, reportState }),
    blueprint,
  );
});
