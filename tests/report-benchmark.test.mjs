import test from "node:test";
import assert from "node:assert/strict";
import { BENCHMARK_DIMENSIONS, REFERENCE_PACKET, buildCompanyReportText, buildLocalAiReview, getBenchmarkReports, runCompanyAnalysis } from "../src/report-benchmark.js";

test("packet is a methodology input and covers eight reports from six companies", () => {
  assert.equal(REFERENCE_PACKET.pageCount, 1187);
  assert.equal(REFERENCE_PACKET.reports.length, 8);
  assert.equal(new Set(getBenchmarkReports().map(item => item.companyId)).size, 6);
  assert.equal(BENCHMARK_DIMENSIONS.some(item => item.id === "exceptions"), true);
});

test("all attached companies recompute their published statement checks", () => {
  for (const report of getBenchmarkReports()) {
    const analysis = runCompanyAnalysis(report.id);
    assert.ok(analysis.totals.checks >= 1, report.id);
    assert.equal(analysis.totals.exceptions, 0, `${report.id} has an unexpected source mismatch`);
    assert.equal(analysis.totals.passed, analysis.totals.checks);
    assert.ok(analysis.checks.every(item => item.source.physicalPage > 0 && item.standardId));
  }
});

test("a changed published input becomes a reproducible exception", () => {
  const clean = runCompanyAnalysis("apple-2024");
  const challenged = runCompanyAnalysis("apple-2024", { sales: 390000 });
  assert.equal(clean.totals.exceptions, 0);
  assert.ok(challenged.totals.exceptions > 0);
  const finding = challenged.findings.find(item => item.id === "EX-revenue-bridge");
  assert.match(finding.rationale, /1,035/);
  assert.equal(finding.standardId, "IAS 1 / ASC 220");
});

test("bank analysis uses credit-loss and balance-sheet equations", () => {
  const analysis = runCompanyAnalysis("jpmorgan-2023");
  assert.ok(analysis.checks.some(item => item.id === "bank-pretax-bridge"));
  assert.ok(analysis.checks.some(item => item.id === "balance-bridge"));
  assert.equal(analysis.totals.exceptions, 0);
});

test("company AI review and report text expose reasons, standards, and limits", () => {
  const analysis = runCompanyAnalysis("adobe-2024");
  const review = buildLocalAiReview({ companyAnalysis: analysis });
  const text = buildCompanyReportText(analysis);
  assert.equal(review.mode, "local-deterministic-company");
  assert.match(review.guardrail, /اعتماد المراجع/);
  assert.match(text, /الربط المعياري/);
  assert.match(text, /ص71/);
  assert.match(text, /لا يمثل رأيًا/);
});
