import assert from "node:assert/strict";
import test from "node:test";
import { generateTrialBalance, initialEngagement } from "../src/data.js";
import { buildMappingMetrics } from "../src/standards.js";
import { buildAdjustmentBridge } from "../src/reporting.js";
import {
  buildCouncilSnapshot,
  buildDatasetCommitment,
  buildEvidenceLineage,
  buildJournalHashChain,
  buildReconciliationCases,
  buildRiskSample,
  createJournalEntries,
  sha256BytesHex,
  sha256Hex,
  verifyJournalHashChain,
} from "../src/governance.js";

const accounts = generateTrialBalance();

test("keeps SHA-256 available outside secure browser contexts", async () => {
  assert.equal(
    await sha256Hex("abc", null),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("hashes the exact evidence bytes rather than file metadata", async () => {
  const bytes = new Uint8Array([0, 1, 2, 3, 127, 128, 254, 255]);
  assert.equal(
    await sha256BytesHex(bytes, null),
    "46d7c9e30f06774ee03af126b95c971f6fe6cc8b70ed27377bd4495b72b9b20a",
  );
});

test("binds report state to a canonical trial-balance dataset commitment", () => {
  const first = buildDatasetCommitment(accounts, { period: "2025", currency: "SAR", committedAt: "2026-08-28T12:00:00.000Z" });
  const second = buildDatasetCommitment(accounts, { period: "2025", currency: "SAR", committedAt: "2026-08-28T12:00:00.000Z" });
  const tampered = accounts.map((account, index) => index === 3 ? { ...account, debitMinor: String(BigInt(account.debitMinor) + 1n) } : account);
  const changed = buildDatasetCommitment(tampered, { period: "2025", currency: "SAR", committedAt: "2026-08-28T12:00:00.000Z" });
  const backdated = buildDatasetCommitment(accounts, { period: "2025", currency: "SAR", committedAt: "2026-08-27T12:00:00.000Z" });

  assert.equal(first.sha256, second.sha256);
  assert.equal(first.datasetId, second.datasetId);
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(changed.sha256, first.sha256);
  assert.notEqual(backdated.sha256, first.sha256);
});

test("builds and verifies a balanced SHA-256 journal chain", async () => {
  const drafts = createJournalEntries(accounts, 12);
  const chain = await buildJournalHashChain(drafts);

  assert.equal(chain.length, 12);
  assert.equal(chain.every(({ hash }) => /^[a-f0-9]{64}$/.test(hash)), true);
  assert.equal(chain.every(({ lines }) => (
    lines.reduce((sum, line) => sum + BigInt(line.debitMinor), 0n)
      === lines.reduce((sum, line) => sum + BigInt(line.creditMinor), 0n)
  )), true);
  assert.equal(await verifyJournalHashChain(chain), true);

  const tampered = chain.map((entry, index) => index === 4 ? { ...entry, description: "changed" } : entry);
  assert.equal(await verifyJournalHashChain(tampered), false);
});

test("keeps generated journal entries balanced when the source starts on the credit side", () => {
  const creditFirst = [accounts[1], accounts[0], accounts[3], accounts[2]];
  const drafts = createJournalEntries(creditFirst, 2);

  assert.equal(drafts.length, 2);
  assert.equal(drafts.every(({ lines, totalMinor }) => {
    const debit = lines.reduce((sum, line) => sum + BigInt(line.debitMinor), 0n);
    const credit = lines.reduce((sum, line) => sum + BigInt(line.creditMinor), 0n);
    return debit === credit && debit === BigInt(totalMinor);
  }), true);
});

test("risk sample is deterministic, unique, bounded, and includes targeted high-risk rows", () => {
  const first = buildRiskSample(accounts, 36);
  const second = buildRiskSample(accounts, 36);

  assert.deepEqual(second, first);
  assert.equal(first.length, 36);
  assert.equal(new Set(first.map(({ id }) => id)).size, 36);
  assert.ok(first.some(({ risk, basis }) => risk === "high" && basis === "مخاطر مرتفعة"));
});

test("council snapshot keeps advisory seats separate from human authority", () => {
  const metrics = buildMappingMetrics(accounts, initialEngagement.standardMappings);
  const snapshot = buildCouncilSnapshot(accounts, initialEngagement, metrics);

  assert.equal(snapshot.advisors.length, 4);
  assert.equal(snapshot.advisors.every(({ severity }) => ["low", "medium", "high"].includes(severity)), true);
  assert.equal("approved" in snapshot.consensus, false);
  assert.equal("opinion" in snapshot.consensus, false);
  assert.match(snapshot.engineVersion, /^KOSIF-COUNCIL/);
});

test("council uses the adjusted basis, actual 2025 mappings, and dataset commitment", () => {
  const metrics = buildMappingMetrics(accounts, initialEngagement.standardMappings);
  const adjusted = buildAdjustmentBridge(accounts, initialEngagement.adjustments).adjustedAccounts;
  const snapshot = buildCouncilSnapshot(adjusted, initialEngagement, metrics, {
    analysisBasis: "posted-adjusted-trial-balance",
    datasetDigest: initialEngagement.demo.commitment.sha256,
  });
  const technical = snapshot.advisors.find(({ id }) => id === "technical");

  assert.equal(snapshot.analysisBasis, "posted-adjusted-trial-balance");
  assert.equal(snapshot.datasetDigest, initialEngagement.demo.commitment.sha256);
  assert.equal(snapshot.engineVersion, "KOSIF-COUNCIL-v4");
  assert.equal(technical.severity, "low");
  assert.equal(technical.refs.includes("IFRS 18"), false);
  assert.ok(technical.refs.some((reference) => reference === "IAS 1" || reference === "IFRS 9"));
});

test("council does not call a 100% suggestion map approved or accept a hollow adjustment", () => {
  const engagement = structuredClone(initialEngagement);
  const metrics = buildMappingMetrics(accounts, engagement.standardMappings);
  engagement.mappingConfirmed = false;
  engagement.adjustments[0].lines[0].debitMinor = "1";
  const snapshot = buildCouncilSnapshot(accounts, engagement, metrics);
  const technical = snapshot.advisors.find(({ id }) => id === "technical");
  const completion = snapshot.advisors.find(({ id }) => id === "completion");

  assert.equal(metrics.mappingRate, 100);
  assert.equal(technical.severity, "medium");
  assert.match(technical.verdict, /غير معتمدة/);
  assert.equal(completion.severity, "medium");
  assert.match(completion.verdict, /تسويات غير مرحلة/);
});

test("evidence lineage and reconciliation cases preserve review references", () => {
  const lineage = buildEvidenceLineage(accounts, initialEngagement, 6);
  const cases = buildReconciliationCases(createJournalEntries(accounts, 12));

  assert.equal(lineage.length, 6);
  assert.equal(lineage.every(({ code, standard, assertion, procedure }) => code && standard && assertion && procedure), true);
  assert.equal(cases.length, 12);
  assert.ok(cases.some(({ method }) => method === "exact"));
  assert.ok(cases.some(({ method }) => method === "split"));
  assert.ok(cases.some(({ method }) => method === "combined"));
  assert.ok(cases.some(({ status }) => status === "review"));
});
