import assert from "node:assert/strict";
import test from "node:test";
import { createFreshEngagement, createImportedAccount } from "../src/data.js";
import { buildDatasetCommitment } from "../src/governance.js";
import { parseSessionSnapshotText } from "../src/session-import.js";
import { buildTemporarySessionSnapshot, SNAPSHOT_SCHEMA_VERSION } from "../src/session-export.js";

const sourceCommittedAt = "2026-08-28T10:00:00.000Z";
const restoredAt = "2026-08-30T12:00:00.000Z";
const rawAccounts = [
  {
    code: "1100",
    name: "النقد",
    debitMinor: "10000",
    creditMinor: "0",
    accountCurrency: "SAR",
    balanceCurrency: "SAR",
    exponent: 2,
    monetaryItem: true,
    closingRate: null,
  },
  {
    code: "3000",
    name: "رأس المال",
    debitMinor: "0",
    creditMinor: "10000",
    accountCurrency: "SAR",
    balanceCurrency: "SAR",
    exponent: 2,
    monetaryItem: false,
    closingRate: null,
  },
];

function commitmentAccounts(accounts = rawAccounts) {
  return accounts.map((account) => ({
    ...account,
    currency: account.accountCurrency,
    functionalCurrency: account.balanceCurrency,
  }));
}

function snapshotFixture() {
  const commitment = buildDatasetCommitment(commitmentAccounts(), {
    period: "2025",
    currency: "SAR",
    exponent: 2,
    committedAt: sourceCommittedAt,
  });
  return {
    manifest: {
      product: "KOSIF Audit Studio",
      format: "kosif-session-snapshot",
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      sourceLabel: "جلسة اختبار",
    },
    restorePayload: {
      contractVersion: 1,
      dataset: {
        period: "2025",
        currency: "SAR",
        exponent: 2,
        committedAt: sourceCommittedAt,
        totalDebitMinor: "10000",
        totalCreditMinor: "10000",
      },
      accounts: structuredClone(rawAccounts),
      commitment,
    },
    // These sections are intentionally untrusted and must never drive restore.
    entity: { name: "اسم مزور", period: "2099", currency: "عملة مزورة" },
    trialBalance: { accounts: [{ ...rawAccounts[0], category: "revenue", inherentRisk: "low" }] },
    governance: { materialityPolicy: { omRateBp: 9_999, approvedBy: "مهاجم" } },
    auditExecution: { acceptance: { independence: true }, evidence: [{ status: "approved" }] },
  };
}

test("restores only committed raw rows, derives classifications, and reopens every authority gate", () => {
  const restored = parseSessionSnapshotText(JSON.stringify(snapshotFixture()), { restoredAt });
  assert.equal(restored.accounts.length, 2);
  assert.equal(restored.accounts[0].source, "untrusted-local-restore");
  assert.equal(restored.accounts[0].category, "cash");
  assert.equal(restored.accounts[0].risk, "medium");
  assert.equal(restored.dataProfile.committedAt, restoredAt);
  assert.equal(restored.dataProfile.schemaVersion, 2);
  assert.equal(restored.engagement.sourceDataset.importedAt, restoredAt);
  assert.equal(restored.engagement.entity.name, "منشأة مستعادة محليًا");
  assert.equal(restored.engagement.entity.period, "2025");
  assert.equal(restored.engagement.materialityPolicy.omRateBp, 75);
  assert.equal(restored.engagement.materialityPolicy.approvedBy, null);
  assert.equal(restored.engagement.acceptance.independence, false);
  assert.equal(restored.engagement.mappingConfirmed, false);
  assert.equal(restored.engagement.humanApproval, false);
  assert.equal(restored.engagement.report.status, "draft");
  assert.equal(restored.engagement.evidence.every(({ status }) => status === "pending"), true);
  assert.match(restored.engagement.auditTrail[0].detail, /لم تُستعد هوية منشأة/);
  assert.equal(restored.preview.rowCount, 2);
  assert.equal(restored.preview.digest, snapshotFixture().restorePayload.commitment.sha256);
});

test("rejects tampering, unsafe keys, duplicates, and unbalanced snapshots", () => {
  const tampered = snapshotFixture();
  tampered.restorePayload.accounts[0].name = "نقد معدل";
  assert.throws(() => parseSessionSnapshotText(JSON.stringify(tampered), { restoredAt }), (error) => error.code === "commitment_mismatch");

  const unsafe = JSON.stringify(snapshotFixture()).replace("{", '{"__proto__":{},');
  assert.throws(() => parseSessionSnapshotText(unsafe, { restoredAt }), (error) => error.code === "unsafe_key");

  const duplicate = snapshotFixture();
  duplicate.restorePayload.accounts[1].code = duplicate.restorePayload.accounts[0].code;
  assert.throws(() => parseSessionSnapshotText(JSON.stringify(duplicate), { restoredAt }), (error) => error.code === "duplicate_accounts");

  const unbalanced = snapshotFixture();
  unbalanced.restorePayload.accounts[1].creditMinor = "9000";
  unbalanced.restorePayload.dataset.totalCreditMinor = "9000";
  assert.throws(() => parseSessionSnapshotText(JSON.stringify(unbalanced), { restoredAt }), (error) => error.code === "unbalanced_snapshot");
});

test("rejects classification injection and mixed dataset measurement", () => {
  const injected = snapshotFixture();
  injected.restorePayload.accounts[0].category = "revenue";
  assert.throws(() => parseSessionSnapshotText(JSON.stringify(injected), { restoredAt }), (error) => error.code === "unexpected_field");

  const mixedCurrency = snapshotFixture();
  mixedCurrency.restorePayload.accounts[1].balanceCurrency = "USD";
  assert.throws(() => parseSessionSnapshotText(JSON.stringify(mixedCurrency), { restoredAt }), (error) => error.code === "mixed_dataset_currency");

  const mixedExponent = snapshotFixture();
  mixedExponent.restorePayload.accounts[1].exponent = 3;
  assert.throws(() => parseSessionSnapshotText(JSON.stringify(mixedExponent), { restoredAt }), (error) => error.code === "mixed_dataset_exponent");
});

test("rejects unsupported schema, oversized input, excessive depth, and unsafe amounts", () => {
  const old = snapshotFixture();
  old.manifest.schemaVersion = SNAPSHOT_SCHEMA_VERSION - 1;
  assert.throws(() => parseSessionSnapshotText(JSON.stringify(old), { restoredAt }), (error) => error.code === "unsupported_snapshot");
  assert.throws(() => parseSessionSnapshotText("{}", { restoredAt, maxBytes: 1 }), (error) => error.code === "snapshot_too_large");

  const tooDeep = snapshotFixture();
  let cursor = tooDeep;
  for (let index = 0; index < 50; index += 1) {
    cursor.extra = {};
    cursor = cursor.extra;
  }
  assert.throws(() => parseSessionSnapshotText(JSON.stringify(tooDeep), { restoredAt }), (error) => error.code === "snapshot_too_deep");

  const unsafeAmount = snapshotFixture();
  unsafeAmount.restorePayload.accounts[0].debitMinor = String(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
  assert.throws(() => parseSessionSnapshotText(JSON.stringify(unsafeAmount), { restoredAt }), (error) => error.code === "unsafe_amount");
});

test("v2 commitments are unambiguous across delimiter-like text", () => {
  const first = buildDatasetCommitment([
    { code: "11\u001fA", name: "B", debitMinor: "1", creditMinor: "0", currency: "SAR", functionalCurrency: "SAR", exponent: 2 },
  ], { period: "2025", currency: "SAR", exponent: 2, committedAt: sourceCommittedAt });
  const second = buildDatasetCommitment([
    { code: "11", name: "A\u001fB", debitMinor: "1", creditMinor: "0", currency: "SAR", functionalCurrency: "SAR", exponent: 2 },
  ], { period: "2025", currency: "SAR", exponent: 2, committedAt: sourceCommittedAt });
  assert.notEqual(first.sha256, second.sha256);
  assert.equal(first.schemaVersion, 2);
});

test("exports a fail-closed restore contract that round-trips only raw data", async () => {
  const importedAccounts = rawAccounts.map((account, index) => createImportedAccount({
    ...account,
    currency: account.accountCurrency,
    functionalCurrency: account.balanceCurrency,
  }, index));
  const commitment = buildDatasetCommitment(importedAccounts, {
    period: "2025",
    currency: "SAR",
    exponent: 2,
    committedAt: sourceCommittedAt,
  });
  const profile = { ...commitment, source: "import", label: "fixture.csv", rowCount: 2, committedAt: sourceCommittedAt };
  const engagement = createFreshEngagement({ entity: { period: "2025" } }, profile, sourceCommittedAt);
  const snapshot = await buildTemporarySessionSnapshot({
    accounts: importedAccounts,
    engagement,
    metrics: { accountCount: 2, isBalanced: true, datasetDigest: commitment.sha256 },
    dataProfile: profile,
    stages: [],
    generatedAt: sourceCommittedAt,
  });
  const restored = parseSessionSnapshotText(JSON.stringify(snapshot), { restoredAt });
  assert.equal(snapshot.restorePayload.commitment.sha256, commitment.sha256);
  assert.deepEqual(restored.accounts.map(({ code, debitMinor, creditMinor }) => ({ code, debitMinor, creditMinor })), [
    { code: "1100", debitMinor: "10000", creditMinor: "0" },
    { code: "3000", debitMinor: "0", creditMinor: "10000" },
  ]);

  const mixed = importedAccounts.map((account, index) => index ? { ...account, functionalCurrency: "USD", balanceCurrency: "USD" } : account);
  await assert.rejects(
    buildTemporarySessionSnapshot({ accounts: mixed, engagement, metrics: {}, dataProfile: profile, stages: [] }),
    (error) => error.code === "mixed_dataset_currency",
  );
});
