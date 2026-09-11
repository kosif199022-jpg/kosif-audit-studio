import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function cloudWorkspace() {
  return import("../src/cloud-workspace.js");
}

test("cloud workspace snapshot keeps governed decisions but never raw/local-only data", async () => {
  const { buildCloudWorkspaceState } = await cloudWorkspace();
  const engagement = {
    version: 7,
    demoDatasetVersion: "KOSIF-DEMO-5000-v7",
    demo: { synthetic: true, huge: true },
    entity: { name: "شركة الاختبار", period: "السنة المنتهية في 31 ديسمبر 2025م" },
    acceptance: { independence: true },
    report: { status: "ready" },
    standardMappings: { overrides: {}, review: {} },
    mappingConfirmed: true,
    materialityPolicy: { version: "2026.1" },
    opinionAssessment: { basis: "none", isPervasive: false },
    analyticsReview: { acknowledged: true },
    council: { rounds: [], humanDecision: { status: "approved" } },
    periodLocks: [], auditTrail: [], rounds: [], evidence: [], findings: [], adjustments: [], externalAiRuns: [],
    sourceDataset: { source: "demo", datasetId: "demo-1" },
    humanApproval: true,
    humanApprovedAt: "2026-08-28T15:00:00.000Z",
    accounts: [{ code: "1000", debitMinor: "100" }],
    trialBalance: [{ code: "1000" }],
  };

  const state = buildCloudWorkspaceState(engagement);
  assert.equal(state.mappingConfirmed, true);
  assert.equal(state.humanApproval, true);
  assert.equal(state.humanApprovedAt, "2026-08-28T15:00:00.000Z");
  assert.deepEqual(state.opinionAssessment, engagement.opinionAssessment);
  assert.equal("accounts" in state, false);
  assert.equal("trialBalance" in state, false);
  assert.equal("demo" in state, false);

  assert.throws(
    () => buildCloudWorkspaceState({ ...engagement, entity: { ...engagement.entity, apiKey: "secret" } }),
    /forbidden_cloud_workspace_key/,
  );
  assert.throws(
    () => buildCloudWorkspaceState({ ...engagement, sourceDataset: { source: "import", datasetId: "import-1" } }),
    /cloud_imported_dataset_not_persistable/,
  );
});

test("cloud engagement selection requires one exact entity and fiscal-year match", async () => {
  const { selectCloudEngagement } = await cloudWorkspace();
  const local = { entity: { name: " شركة محمود القصيف القابضة ", period: "السنة المنتهية في 31 ديسمبر 2025م" } };
  const exact = { id: "eng_0123456789abcdef0123456789", client_name_ar: "شركة محمود القصيف القابضة", fiscal_year: 2025, status: "planning" };
  const prior = { id: "eng_1123456789abcdef0123456789", client_name_ar: "شركة محمود القصيف القابضة", fiscal_year: 2024, status: "planning" };
  const other = { id: "eng_2123456789abcdef0123456789", client_name_ar: "شركة أخرى", fiscal_year: 2025, status: "planning" };

  assert.equal(selectCloudEngagement([prior, exact, other], local)?.id, exact.id);
  assert.equal(selectCloudEngagement([other], local), null, "never bind an unrelated sole engagement");
  assert.equal(selectCloudEngagement([exact, { ...exact, id: "eng_3123456789abcdef0123456789" }], local), null, "ambiguous exact matches fail closed");
  assert.equal(selectCloudEngagement([{ ...exact, status: "archived", archived_at: "2026-01-01T00:00:00Z" }], local), null);
});

test("cloud hydration merges governed state conservatively and rejects incompatible schemas", async () => {
  const { mergeCloudWorkspaceState } = await cloudWorkspace();
  const local = {
    version: 7,
    demoDatasetVersion: "KOSIF-DEMO-5000-v7",
    entity: { name: "محلي", activity: "تقنية" },
    acceptance: { independence: true, conflicts: true },
    report: { status: "draft", opinion: "مسودة" },
    standardMappings: { overrides: { A: "IAS 1" }, review: { reviewer: "أ" } },
    materialityPolicy: { version: "2026.1", omRateBp: 75 },
    analyticsReview: { acknowledged: false },
    council: { engineVersion: "v4", humanDecision: { status: "pending", reviewer: "شريك" }, rounds: [] },
    rounds: [{ id: "R-local" }], evidence: [], findings: [], adjustments: [], periodLocks: [], auditTrail: [],
    mappingConfirmed: false,
    opinionAssessment: { basis: "none" },
    humanApproval: false,
    humanApprovedAt: null,
  };
  const cloud = {
    version: 7,
    entity: { name: "سحابي" },
    report: { status: "ready" },
    standardMappings: { review: { confirmedAt: "2026-09-01T00:00:00Z" } },
    mappingConfirmed: true,
    opinionAssessment: { basis: "misstatement", isPervasive: false },
    humanApproval: true,
    humanApprovedAt: "2026-09-01T01:00:00Z",
    rounds: [{ id: "R-cloud" }],
  };

  const merged = mergeCloudWorkspaceState(local, cloud);
  assert.equal(merged.entity.name, "سحابي");
  assert.equal(merged.entity.activity, "تقنية");
  assert.equal(merged.report.status, "ready");
  assert.equal(merged.report.opinion, "مسودة");
  assert.equal(merged.standardMappings.overrides.A, "IAS 1");
  assert.equal(merged.standardMappings.review.confirmedAt, "2026-09-01T00:00:00Z");
  assert.equal(merged.mappingConfirmed, true);
  assert.equal(merged.humanApproval, true);
  assert.deepEqual(merged.rounds, [{ id: "R-cloud" }]);
  assert.deepEqual(mergeCloudWorkspaceState(local, { version: 6, humanApproval: true }), local);
});

test("reset production entry deliberately does not hydrate the legacy cloud engagement", async () => {
  const main = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const reset = await readFile(new URL("../src/ResetApp.jsx", import.meta.url), "utf8");
  assert.match(main, /import\("\.\/ResetApp\.jsx"\)/);
  assert.doesNotMatch(main, /CloudPersistenceBoundary|\.\/App\.jsx/);
  assert.match(reset, /RESET_STORAGE_KEY/);
  assert.match(reset, /resetLegacyStorageOnce/);
});

test("Worker cloud contract remains available for archived legacy files but is outside reset production", async () => {
  const worker = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");
  for (const key of ["mappingConfirmed", "opinionAssessment", "humanApproval", "humanApprovedAt"]) {
    assert.match(worker, new RegExp(`\\"${key}\\"`));
  }
});
