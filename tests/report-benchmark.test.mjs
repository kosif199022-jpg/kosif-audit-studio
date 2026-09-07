import test from "node:test";
import assert from "node:assert/strict";
import { BENCHMARK_DIMENSIONS, REFERENCE_PACKET, buildBenchmarkScore, buildLocalAiReview } from "../src/report-benchmark.js";

test("reference packet stays structured and report-safe", () => {
  assert.equal(REFERENCE_PACKET.pageCount, 1187);
  assert.equal(REFERENCE_PACKET.reports.length, 8);
  assert.equal(BENCHMARK_DIMENSIONS.length, 8);
  assert.equal(REFERENCE_PACKET.reports.some((item) => item.entity.includes("JPMorgan")), true);
});

test("benchmark score is bounded and reflects a complete demo", () => {
  const score = buildBenchmarkScore({
    engagement: { demo: { synthetic: true }, evidence: Array.from({ length: 8 }, () => ({})), findings: [{}], rounds: Array.from({ length: 20 }, () => ({})), humanApproval: true },
    metrics: { accountCount: 5000, mappingRate: 100, isBalanced: true },
    reportState: { passedGates: 12, gates: Array.from({ length: 12 }, () => ({})), openFindings: 0, pendingEvidence: 0, reportReady: true },
  });
  assert.equal(score.dimensions.length, 8);
  assert.equal(score.total >= 85, true);
  assert.equal(score.total <= 100, true);
  assert.equal(score.inputs.accounts, 5000);
});

test("local AI review remains deterministic in shape and advisory", () => {
  const review = buildLocalAiReview({
    engagement: { demo: { synthetic: true }, evidence: [], findings: [], rounds: [] },
    metrics: { accountCount: 5000, mappingRate: 100, isBalanced: true },
    reportState: { openFindings: 0, pendingEvidence: 0, reportReady: true },
  });
  assert.equal(review.mode, "local-deterministic");
  assert.equal(Array.isArray(review.findings), true);
  assert.match(review.guardrail, /استشارية/);
  assert.equal(review.reportSections.length >= 7, true);
});

