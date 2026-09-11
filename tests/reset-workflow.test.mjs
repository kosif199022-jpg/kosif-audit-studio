import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  REVIEWER_ROLES,
  buildCouncilRound,
  buildFinalReport,
  createEmptyAuditState,
  deriveRequestedDocuments,
  inferDocumentType,
  sanitizeState,
} from "../src/reset-audit-engine.js";

const readable = (type, text = "بيانات مراجعة قابلة للقراءة") => ({
  id: `DOC-${type}`,
  documentId: `HASH-${type}`,
  name: `${type}.txt`,
  type,
  snippetCount: 1,
  snippets: [{ text }],
  availability: "available",
});

const activeCouncil = {
  status: "active",
  members: REVIEWER_ROLES.map((member) => ({ ...member, enabled: true })),
};

test("new KOSIF workflow starts completely empty with no demo engagement", () => {
  const state = createEmptyAuditState();
  assert.equal(state.documents.length, 0);
  assert.equal(state.rounds.length, 0);
  assert.equal(state.requests.length, 0);
  assert.equal(state.finalReport, null);
  assert.equal(state.council.status, "not_started");
  assert.equal(state.company.name, "");
});

test("document type inference understands the core company audit files", () => {
  assert.equal(inferDocumentType("ميزان المراجعة 2026.xlsx"), "trial_balance");
  assert.equal(inferDocumentType("دفتر الأستاذ العام.csv"), "general_ledger");
  assert.equal(inferDocumentType("القوائم المالية النهائية.pdf"), "financial_statements");
  assert.equal(inferDocumentType("Bank Reconciliation December.xlsx"), "bank_reconciliation");
});

test("first review requests the four core files when they are missing", () => {
  const needs = deriveRequestedDocuments([readable("other")], []);
  assert.deepEqual(new Set(needs.map((item) => item.type)), new Set([
    "trial_balance", "general_ledger", "financial_statements", "chart_of_accounts",
  ]));
});

test("round cannot start before the council is active", () => {
  assert.throws(() => buildCouncilRound({
    documents: [readable("trial_balance")],
    requests: [],
    council: { status: "not_started", members: REVIEWER_ROLES },
    previousRounds: [],
  }), /شغّل مجلس المراجعين/);
});

test("round produces numbered document requests and a clear needs-documents verdict", () => {
  const result = buildCouncilRound({
    documents: [readable("trial_balance", "حساب مصروفات")],
    requests: [],
    council: activeCouncil,
    previousRounds: [],
    now: "2026-09-11T00:00:00.000Z",
  });
  assert.equal(result.round.number, 1);
  assert.equal(result.round.outcome, "needs_documents");
  assert.ok(result.requests.length >= 3);
  assert.ok(result.requests.every((request) => request.roundNumber === 1));
  assert.match(result.round.verdict, /غير كافية/);
});

test("material portfolio signals create supporting-document requests", () => {
  const documents = [
    readable("trial_balance", "نقد في البنك | ذمم مدينة من العملاء | مخزون | ايرادات مبيعات"),
    readable("general_ledger"),
    readable("financial_statements"),
    readable("chart_of_accounts"),
  ];
  const needs = deriveRequestedDocuments(documents, []);
  const types = new Set(needs.map((item) => item.type));
  assert.ok(types.has("bank_statement"));
  assert.ok(types.has("bank_reconciliation"));
  assert.ok(types.has("receivables_aging"));
  assert.ok(types.has("inventory_listing"));
  assert.ok(types.has("revenue_support"));
});

test("complete core portfolio can finish a round ready for human decision", () => {
  const documents = [
    readable("trial_balance", "مصروفات تشغيلية"),
    readable("general_ledger"),
    readable("financial_statements"),
    readable("chart_of_accounts"),
  ];
  const result = buildCouncilRound({ documents, requests: [], council: activeCouncil, previousRounds: [] });
  assert.equal(result.requests.length, 0);
  assert.equal(result.round.outcome, "ready_for_decision");
  assert.match(result.round.verdict, /القرار النهائي/);
});

test("document unavailability becomes an explicit scope limitation instead of silent closure", () => {
  const documents = [
    readable("trial_balance", "مصروفات تشغيلية"),
    readable("general_ledger"),
    readable("financial_statements"),
  ];
  const requests = [{
    id: "REQ-R1-01",
    roundNumber: 1,
    documentType: "chart_of_accounts",
    title: "دليل الحسابات",
    reason: "مطلوب للتصنيف",
    priority: "medium",
    status: "unavailable",
    unavailableReason: "لم توفره الإدارة",
  }];
  const result = buildCouncilRound({ documents, requests, council: activeCouncil, previousRounds: [{ number: 1 }] });
  assert.equal(result.round.outcome, "scope_limitation");
  assert.match(result.round.verdict, /قيد نطاق/);
});

test("final report is blocked while requests remain open and requires a named human reviewer", () => {
  const state = createEmptyAuditState();
  state.documents = [readable("trial_balance")];
  state.rounds = [{ number: 1, outcome: "ready_for_decision", verdict: "كافٍ ضمن النطاق." }];
  state.requests = [{ id: "REQ-1", status: "requested" }];
  assert.throws(() => buildFinalReport(state, { reviewerName: "مراجع مسؤول" }), /مستندات مطلوبة مفتوحة/);
  state.requests = [];
  assert.throws(() => buildFinalReport(state, { reviewerName: "م" }), /اسم المراجع/);
  const report = buildFinalReport(state, { reviewerName: "المراجع المسؤول", now: "2026-09-11T01:00:00.000Z" });
  assert.equal(report.status, "approved");
  assert.equal(report.approvedBy, "المراجع المسؤول");
  assert.match(report.guardrail, /المراجع البشري/);
});

test("invalid persisted state cannot reintroduce the legacy demo dataset", () => {
  const restored = sanitizeState({ schema: "old-schema", documents: [{ id: "legacy" }] });
  assert.equal(restored.documents.length, 0);
  assert.equal(restored.rounds.length, 0);
});

test("production entry mounts ResetApp while legacy cloud hydration and global launcher are disabled", async () => {
  const main = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(main, /import\("\.\/ResetApp\.jsx"\)/);
  assert.match(main, /<CloudPersistenceBoundary disabled>/);
  assert.match(main, /<GlobalAuditLauncher disabled \/>/);
});
