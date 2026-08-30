import assert from "node:assert/strict";
import test from "node:test";
import { fetchProviderRegistry } from "../src/council-api.js";
import {
  buildLocalProviderRun,
  buildRedactedCouncilPackage,
  createDefaultProviderRegistry,
  normalizeProviderRegistry,
} from "../src/council-providers.js";
import { generateTrialBalance, initialEngagement } from "../src/data.js";
import { buildCouncilSnapshot } from "../src/governance.js";
import { buildAdjustmentBridge } from "../src/reporting.js";
import { buildMappingMetrics } from "../src/standards.js";

const accounts = generateTrialBalance();
const mapping = buildMappingMetrics(accounts, initialEngagement.standardMappings);
const metrics = {
  ...mapping,
  accountCount: accounts.length,
  isBalanced: true,
  datasetId: initialEngagement.demo.commitment.datasetId,
  datasetDigest: initialEngagement.demo.commitment.sha256,
  datasetPeriod: initialEngagement.demo.commitment.period,
  datasetCurrency: initialEngagement.demo.commitment.currency,
};

test("starts with one runnable local provider and no invented external connection", () => {
  const registry = createDefaultProviderRegistry();
  assert.equal(registry.providers.length, 4);
  assert.equal(registry.providers.find(({ id }) => id === "kosif-local").canRun, true);
  assert.equal(registry.providers.filter(({ providerType }) => providerType === "llm").every(({ configured, canRun, status }) => !configured && !canRun && status === "backend_required"), true);
});

test("normalizes the server manifest without leaking secret-like input fields", () => {
  const registry = normalizeProviderRegistry({
    externalExecutionAvailable: false,
    providers: [
      { id: "openai", configured: true, status: "configured", model: "gpt-server-model", apiKey: "sk-secret", token: "secret-token", canRun: true },
    ],
  }, "2026-08-28T18:00:00.000Z");
  const serialized = JSON.stringify(registry);
  const openai = registry.providers.find(({ id }) => id === "openai");
  assert.equal(openai.configured, true);
  assert.equal(openai.canRun, false);
  assert.equal(openai.model, "gpt-server-model");
  assert.equal(serialized.includes("sk-secret"), false);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("apiKey"), false);
});

test("exports a summary-only council package without entity, account names, or evidence content", () => {
  const adjusted = buildAdjustmentBridge(accounts, initialEngagement.adjustments).adjustedAccounts;
  const snapshot = buildCouncilSnapshot(adjusted, initialEngagement, mapping, { analysisBasis: "posted-adjusted-trial-balance", datasetDigest: metrics.datasetDigest });
  const reviewPackage = buildRedactedCouncilPackage({ accounts, engagement: initialEngagement, metrics, snapshot });
  const serialized = JSON.stringify(reviewPackage);

  assert.equal(reviewPackage.dataScope, "summary-only");
  assert.equal(reviewPackage.dataset.accountCount, 5_000);
  assert.equal(reviewPackage.aggregates.length, 20);
  assert.match(reviewPackage.dataset.inputDigest, /^[a-f0-9]{64}$/);
  assert.equal(serialized.includes(initialEngagement.entity.name), false);
  assert.equal(serialized.includes(accounts[0].name), false);
  assert.equal(serialized.includes(accounts[0].code), false);
  assert.ok(reviewPackage.excluded.includes("evidence contents"));
});

test("records deterministic local provenance separately from human authority", () => {
  const adjusted = buildAdjustmentBridge(accounts, initialEngagement.adjustments).adjustedAccounts;
  const snapshot = buildCouncilSnapshot(adjusted, initialEngagement, mapping, { analysisBasis: "posted-adjusted-trial-balance", datasetDigest: metrics.datasetDigest });
  const run = buildLocalProviderRun({ snapshot, metrics, engagement: initialEngagement, accounts, runId: "CR-003-KOSIF-LOCAL", generatedAt: "2026-08-28T18:00:00.000Z" });

  assert.equal(run.providerId, "kosif-local");
  assert.equal(run.providerType, "deterministic");
  assert.equal(run.execution, "browser");
  assert.equal(run.status, "success");
  assert.match(run.inputDigest, /^[a-f0-9]{64}$/);
  assert.match(run.outputDigest, /^[a-f0-9]{64}$/);
  assert.equal("opinion" in run, false);
  assert.equal("approved" in run, false);
});

test("provider readiness check sends no engagement data", async () => {
  const calls = [];
  const registry = await fetchProviderRegistry({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ providers: [], externalExecutionAvailable: false }), { status: 200 });
    },
  });

  assert.equal(registry.providers.length, 4);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/council/providers");
  assert.equal(calls[0].options.method, "GET");
  assert.equal("body" in calls[0].options, false);
});

