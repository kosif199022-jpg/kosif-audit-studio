import test from "node:test";
import assert from "node:assert/strict";
import { inferReportTemplate, readTemplateDataRows } from "../src/report-template.js";
import {
  buildCouncilChallengeQuestions,
  buildCouncilEvidenceRequests,
  buildCouncilMatrix,
  planCouncilCoverage,
} from "../src/council-orchestration.js";
import { createTemplateReportDocxBlob } from "../src/professional-docx.js";

test("report learning retains a reusable schema rather than source paragraphs", () => {
  const sourceSentence = "Key audit matters included revenue recognition and internal control.";
  const template = inferReportTemplate({
    name: "international-report.pdf",
    type: "application/pdf",
    paragraphs: [sourceSentence, "Auditor responsibilities", "Basis for opinion"],
    headings: ["Financial statements", "Notes to the financial statements"],
    extraction: { method: "pdf-text", pagesRead: 5, pageCount: 200 },
  });
  assert.equal(template.retention, "schema-only");
  assert.ok(template.fields.includes("keyAuditMatters"));
  assert.ok(template.fields.includes("auditorResponsibility"));
  assert.ok(!JSON.stringify(template).includes(sourceSentence));
  assert.deepEqual(template.extraction, { method: "pdf-text", pagesRead: 5, pageCount: 200, detected: true });
});

test("template XLSX rows fill only fields declared by the learned schema", () => {
  const template = inferReportTemplate({ name: "template.xlsx", type: "xlsx" });
  const values = readTemplateDataRows([
    ["entity", "اسم المنشأة", "شركة الاختبار"],
    ["period", "الفترة", "2026"],
    ["apiKey", "سر", "must-not-enter"],
  ], template);
  assert.deepEqual(values, { entity: "شركة الاختبار", period: "2026" });
  assert.ok(!JSON.stringify(values).includes("must-not-enter"));
});

test("one selected reviewer records delegated coverage for every council role", () => {
  const seats = [{ id: "ifrs" }, { id: "isa" }, { id: "quality" }];
  const coverage = planCouncilCoverage(seats, ["isa"]);
  assert.equal(coverage.coverageMode, "delegated-coverage");
  assert.equal(coverage.effectiveSeats.length, 3);
  assert.ok(coverage.effectiveSeats.every((seat) => seat.delegatedBy === "isa"));
  assert.equal(planCouncilCoverage(seats, ["ifrs", "quality"]).coverageMode, "partial-council");
});

test("council matrix preserves each opinion and exposes disagreement without overriding it", () => {
  const results = [
    { id: "ifrs", severity: "low", verdict: "المعالجة مناسبة", standard: "IAS 12", refs: ["WP-1"], actions: ["تحقق من الإفصاح"] },
    { id: "quality", severity: "high", verdict: "الدليل غير كاف", standard: "ISA 500", refs: [], actions: ["اطلب مستندًا"] },
  ];
  const matrix = buildCouncilMatrix(results, [{ id: "ifrs", role: "مراجع IFRS" }, { id: "quality", role: "مراجع الجودة" }]);
  assert.equal(matrix.total, 2);
  assert.equal(matrix.conflicts, true);
  assert.equal(matrix.rows[0].verdict, "المعالجة مناسبة");
  assert.equal(matrix.evidenceGaps[0].id, "quality");
  assert.equal(buildCouncilChallengeQuestions(matrix, "CR-001")[0].previousRoundId, "CR-001");
});

test("council objections become a deterministic PBC plan linked to an audit round", () => {
  const now = "2026-09-07T12:00:00.000Z";
  const plan = buildCouncilEvidenceRequests([
    { id: "fraud", severity: "high", verdict: "اختبار القيود مطلوب" },
    { id: "ifrs", severity: "low", verdict: "لا اعتراض" },
  ], { roundId: "CR-004", auditRound: { id: "R-008", standards: ["ISA 240"] }, now });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].roundId, "R-008");
  assert.equal(plan[0].councilRoundId, "CR-004");
  assert.deepEqual(plan[0].standardIds, ["ISA 240"]);
  assert.equal(plan[0].createdAt, now);
  assert.equal(plan[0].due, "2026-09-14");
});

test("learned report schema exports a real RTL OOXML draft", async () => {
  const template = inferReportTemplate({ name: "report.json", type: "application/json", headings: ["Executive summary", "Key audit matters", "Auditor responsibilities"] });
  const blob = await createTemplateReportDocxBlob({ template, data: { entity: "شركة الاختبار", period: "2026", executiveSummary: "نتيجة قابلة للمراجعة" } });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 2)), "PK");
  assert.ok(blob.size > 5_000);
});
