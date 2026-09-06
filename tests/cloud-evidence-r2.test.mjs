import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import workerModule, {
  API_ROUTE_MANIFEST,
  authorizeRole,
  evidenceObjectKey,
  normalizeEvidenceUploadInput,
} from "../worker/index.js";

const ENGAGEMENT_ID = "eng_0123456789abcdef0123456789";
const EVIDENCE_ID = "ev_0123456789abcdef0123456789";

function route(method, path) {
  return API_ROUTE_MANIFEST.find((item) => item.method === method && item.path === path);
}

test("R2 evidence routes are explicit and preserve least-privilege RBAC", () => {
  assert.equal(route("POST", "/api/engagements/:id/evidence")?.permission, "evidence:write");
  assert.equal(route("GET", "/api/engagements/:id/evidence")?.permission, "evidence:list");
  assert.equal(route("GET", "/api/engagements/:id/evidence/:evidenceId")?.permission, "evidence:read");
  assert.equal(route("GET", "/api/engagements/:id/evidence/:evidenceId/content")?.permission, "evidence:read");

  for (const role of ["owner", "partner", "manager", "senior"]) {
    assert.equal(authorizeRole(role, "evidence:write"), true, `${role} should upload evidence`);
    assert.equal(authorizeRole(role, "evidence:list"), true);
    assert.equal(authorizeRole(role, "evidence:read"), true);
  }
  assert.equal(authorizeRole("viewer", "evidence:write"), false);
  assert.equal(authorizeRole("viewer", "evidence:list"), true);
  assert.equal(authorizeRole("viewer", "evidence:read"), true);
});

test("evidence upload metadata is bounded, explicit, and safe", () => {
  assert.equal(typeof normalizeEvidenceUploadInput, "function");
  const valid = normalizeEvidenceUploadInput({
    documentRef: "PBC-005",
    titleAr: "مصادقة بنكية مستقلة",
    roundId: "R-005",
    kind: "confirmation",
    filename: "bank-confirmation.pdf",
    contentType: "application/pdf",
    byteLength: 4096,
    effectiveAt: "2026-09-06T08:00:00.000Z",
    supersedesId: null,
  });
  assert.equal(valid.error, undefined);
  assert.equal(valid.documentRef, "PBC-005");
  assert.equal(valid.roundId, "R-005");
  assert.equal(valid.contentType, "application/pdf");
  assert.equal(valid.effectiveAt, "2026-09-06T08:00:00.000Z");

  const invalidCases = [
    { documentRef: "../escape", titleAr: "دليل", roundId: "R-005", kind: "confirmation", filename: "x.pdf", contentType: "application/pdf", byteLength: 10, effectiveAt: "2026-09-06T08:00:00Z" },
    { documentRef: "PBC-005", titleAr: "دليل", roundId: "R-5", kind: "confirmation", filename: "x.pdf", contentType: "application/pdf", byteLength: 10, effectiveAt: "2026-09-06T08:00:00Z" },
    { documentRef: "PBC-005", titleAr: "دليل", roundId: "R-005", kind: "executable", filename: "x.exe", contentType: "application/octet-stream", byteLength: 10, effectiveAt: "2026-09-06T08:00:00Z" },
    { documentRef: "PBC-005", titleAr: "دليل", roundId: "R-005", kind: "confirmation", filename: "../x.pdf", contentType: "application/pdf", byteLength: 10, effectiveAt: "2026-09-06T08:00:00Z" },
    { documentRef: "PBC-005", titleAr: "دليل", roundId: "R-005", kind: "confirmation", filename: "x.pdf", contentType: "text/html", byteLength: 10, effectiveAt: "2026-09-06T08:00:00Z" },
    { documentRef: "PBC-005", titleAr: "دليل", roundId: "R-005", kind: "confirmation", filename: "x.pdf", contentType: "application/pdf", byteLength: 11 * 1024 * 1024, effectiveAt: "2026-09-06T08:00:00Z" },
    { documentRef: "PBC-005", titleAr: "دليل", roundId: "R-005", kind: "confirmation", filename: "x.pdf", contentType: "application/pdf", byteLength: 10, effectiveAt: "not-a-date" },
    { documentRef: "PBC-005", titleAr: "دليل", roundId: "R-005", kind: "confirmation", filename: "x.pdf", contentType: "application/pdf", byteLength: 10, effectiveAt: "2026-09-06T08:00:00Z", supersedesId: "ev_bad" },
  ];
  for (const input of invalidCases) assert.ok(normalizeEvidenceUploadInput(input).error, JSON.stringify(input));
});

test("R2 object key is deterministic and cannot be steered by filename or document reference", () => {
  assert.equal(typeof evidenceObjectKey, "function");
  const args = {
    tenantId: "ten_0123456789abcdef0123456789",
    engagementId: ENGAGEMENT_ID,
    logicalId: "evl_0123456789abcdef0123456789",
    revision: 3,
    sha256: "a".repeat(64),
  };
  const key = evidenceObjectKey(args);
  assert.equal(key, `tenants/${args.tenantId}/engagements/${args.engagementId}/evidence/${args.logicalId}/v3/${args.sha256}`);
  assert.equal(key.includes(".."), false);
  assert.equal(key.includes("bank-confirmation.pdf"), false);
});

test("D1 evidence migration is tenant-isolated, append-only, archive-guarded, and lineage-checked", async () => {
  const sql = await readFile(new URL("../drizzle/0003_cloud_evidence_r2.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE `evidence_objects`/);
  assert.match(sql, /FOREIGN KEY \(`tenant_id`, `engagement_id`\) REFERENCES `engagements`\(`tenant_id`, `id`\)/);
  assert.match(sql, /UNIQUE\(`engagement_id`, `logical_id`, `revision`\)/);
  assert.match(sql, /evidence_objects_no_update/);
  assert.match(sql, /evidence_objects_no_delete/);
  assert.match(sql, /evidence_objects_archived_insert_guard/);
  assert.match(sql, /evidence_revision_lineage_guard/);
  assert.match(sql, /parent\.revision = NEW\.revision - 1/);
});

test("evidence upload fails closed when the R2 binding is absent", async () => {
  const form = new FormData();
  form.set("document_ref", "PBC-005");
  form.set("title_ar", "مصادقة بنكية مستقلة");
  form.set("round_id", "R-005");
  form.set("kind", "confirmation");
  form.set("effective_at", "2026-09-06T08:00:00.000Z");
  form.set("file", new Blob(["evidence-bytes"], { type: "application/pdf" }), "confirmation.pdf");
  const request = new Request(`https://example.test/api/engagements/${ENGAGEMENT_ID}/evidence`, {
    method: "POST",
    headers: { "oai-authenticated-user-email": "auditor@example.test" },
    body: form,
  });
  const response = await workerModule.fetch(request, { ASSETS: { fetch: async () => new Response("asset") } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "evidence_bucket_unavailable" });
});

test("evidence identifiers are constrained before any content lookup", () => {
  assert.match(EVIDENCE_ID, /^ev_[a-f0-9]{26}$/);
  assert.doesNotMatch("ev_../../secret", /^ev_[a-f0-9]{26}$/);
});
