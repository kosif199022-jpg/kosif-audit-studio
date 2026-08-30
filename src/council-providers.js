import { sha256HexSync } from "./governance.js";

export const PROVIDER_POLICY_VERSION = "KOSIF-SUMMARY-ONLY-v1";
export const PROVIDER_REGISTRY_SCHEMA_VERSION = 1;

const BASE_PROVIDERS = Object.freeze([
  Object.freeze({
    id: "kosif-local",
    name: "KOSIF المحلي",
    providerType: "deterministic",
    execution: "browser",
    status: "ready",
    configured: true,
    canRun: true,
    model: "KOSIF-COUNCIL-v4",
    dataPolicy: "local-only",
    retention: "browser-session",
  }),
  Object.freeze({ id: "gemini", name: "Gemini", providerType: "llm", execution: "server", status: "backend_required", configured: false, canRun: false, model: null, dataPolicy: "summary-only", retention: "provider-policy" }),
  Object.freeze({ id: "openai", name: "OpenAI", providerType: "llm", execution: "server", status: "backend_required", configured: false, canRun: false, model: null, dataPolicy: "summary-only", retention: "provider-policy" }),
  Object.freeze({ id: "claude", name: "Claude", providerType: "llm", execution: "server", status: "backend_required", configured: false, canRun: false, model: null, dataPolicy: "summary-only", retention: "provider-policy" }),
]);

const SAFE_STATUSES = new Set(["ready", "backend_required", "unconfigured", "configured", "healthy", "degraded", "failed"]);

export function createDefaultProviderRegistry(checkedAt = null) {
  return {
    schemaVersion: PROVIDER_REGISTRY_SCHEMA_VERSION,
    policyVersion: PROVIDER_POLICY_VERSION,
    checkedAt,
    externalExecutionAvailable: false,
    providers: BASE_PROVIDERS.map((provider) => ({ ...provider })),
  };
}

export function normalizeProviderRegistry(payload, checkedAt = new Date().toISOString()) {
  const defaults = createDefaultProviderRegistry(checkedAt);
  const incoming = new Map(
    (Array.isArray(payload?.providers) ? payload.providers : [])
      .filter((provider) => typeof provider?.id === "string")
      .map((provider) => [provider.id, provider]),
  );
  const providers = defaults.providers.map((base) => {
    if (base.id === "kosif-local") return base;
    const source = incoming.get(base.id);
    if (!source) return { ...base, status: "unconfigured" };
    const configured = source.configured === true;
    return {
      ...base,
      status: SAFE_STATUSES.has(source.status) ? source.status : configured ? "configured" : "unconfigured",
      configured,
      canRun: payload?.externalExecutionAvailable === true && source.canRun === true,
      model: configured && typeof source.model === "string" ? source.model.slice(0, 120) : null,
      lastCheckedAt: typeof source.lastCheckedAt === "string" ? source.lastCheckedAt : checkedAt,
      latencyMs: Number.isFinite(Number(source.latencyMs)) ? Number(source.latencyMs) : null,
      requestId: typeof source.requestId === "string" ? source.requestId.slice(0, 120) : null,
    };
  });
  return {
    schemaVersion: PROVIDER_REGISTRY_SCHEMA_VERSION,
    policyVersion: PROVIDER_POLICY_VERSION,
    checkedAt,
    externalExecutionAvailable: payload?.externalExecutionAvailable === true,
    providers,
  };
}

function safeMinor(value) {
  try {
    return BigInt(value || 0);
  } catch {
    return 0n;
  }
}

export function buildCouncilInputDigest({ accounts = [], engagement = {}, metrics = {}, analysisBasis = "posted-adjusted-trial-balance" }) {
  const adjustments = (engagement.adjustments || [])
    .map((item) => `${item.id}:${item.status}:${item.journalReference || ""}:${item.postedAt || ""}:${item.amountMinor || "0"}`)
    .sort();
  return sha256HexSync(JSON.stringify({
    datasetId: metrics.datasetId || engagement.sourceDataset?.datasetId || engagement.demo?.commitment?.datasetId || null,
    datasetDigest: metrics.datasetDigest || engagement.sourceDataset?.sha256 || engagement.demo?.commitment?.sha256 || null,
    accountCount: accounts.length,
    analysisBasis,
    adjustments,
    mappingConfirmed: engagement.mappingConfirmed === true,
    mappingConfirmedAt: engagement.standardMappings?.review?.confirmedAt || null,
  }));
}

export function buildRedactedCouncilPackage({ accounts = [], engagement = {}, metrics = {}, snapshot }) {
  const areas = new Map();
  for (const account of accounts) {
    const key = String(account.category || "unclassified");
    const current = areas.get(key) || { category: key, accountCount: 0, debitMinor: 0n, creditMinor: 0n, highRiskCount: 0 };
    current.accountCount += 1;
    current.debitMinor += safeMinor(account.debitMinor);
    current.creditMinor += safeMinor(account.creditMinor);
    if (account.risk === "high") current.highRiskCount += 1;
    areas.set(key, current);
  }
  const datasetId = metrics.datasetId || engagement.sourceDataset?.datasetId || engagement.demo?.commitment?.datasetId || null;
  const datasetDigest = metrics.datasetDigest || engagement.sourceDataset?.sha256 || engagement.demo?.commitment?.sha256 || null;
  const inputDigest = buildCouncilInputDigest({ accounts, engagement, metrics });
  return {
    schemaVersion: 1,
    policyVersion: PROVIDER_POLICY_VERSION,
    dataScope: "summary-only",
    generatedAt: new Date().toISOString(),
    dataset: {
      datasetId,
      sha256: datasetDigest,
      accountCount: accounts.length,
      period: metrics.datasetPeriod || engagement.sourceDataset?.period || engagement.demo?.commitment?.period || null,
      currency: metrics.datasetCurrency || engagement.sourceDataset?.currency || engagement.demo?.commitment?.currency || null,
      balanced: metrics.isBalanced === true,
      inputDigest,
    },
    aggregates: [...areas.values()].map((area) => ({
      category: area.category,
      accountCount: area.accountCount,
      debitMinor: String(area.debitMinor),
      creditMinor: String(area.creditMinor),
      highRiskCount: area.highRiskCount,
    })),
    workflow: {
      mappingConfirmed: engagement.mappingConfirmed === true,
      rounds: (engagement.rounds || []).map(({ id, status, risk, standards, evidenceIds, findingIds }) => ({ id, status, risk, standards, evidenceCount: evidenceIds?.length || 0, findingCount: findingIds?.length || 0 })),
      evidence: (engagement.evidence || []).map(({ id, status, roundId, standardIds, assertions }) => ({ id, status, roundId, standardIds, assertions })),
      findings: (engagement.findings || []).map(({ id, status, severity, roundId, standardIds }) => ({ id, status, severity, roundId, standardIds })),
      adjustments: (engagement.adjustments || []).map(({ id, status, amountMinor, journalReference, postedAt }) => ({ id, status, amountMinor, journalReference, postedAt })),
    },
    localCouncil: snapshot ? {
      engineVersion: snapshot.engineVersion,
      analysisBasis: snapshot.analysisBasis,
      consensus: snapshot.consensus,
      advisors: snapshot.advisors.map(({ id, severity, verdict, standard, refs }) => ({ id, severity, verdict, standard, refs })),
    } : null,
    excluded: ["entity identity", "account codes and names", "attachment bytes", "evidence contents", "user credentials"],
    authority: "Advisory package only; it cannot select an audit opinion or approve a report.",
  };
}

export function buildLocalProviderRun({ snapshot, metrics = {}, engagement = {}, accounts = [], runId, generatedAt = new Date().toISOString() }) {
  const inputDigest = buildCouncilInputDigest({ accounts, engagement, metrics, analysisBasis: snapshot.analysisBasis });
  const outputDigest = sha256HexSync(JSON.stringify(snapshot.advisors.map(({ id, severity, verdict, detail, actions, refs }) => ({ id, severity, verdict, detail, actions, refs }))));
  return {
    runId,
    providerId: "kosif-local",
    providerType: "deterministic",
    execution: "browser",
    status: "success",
    model: snapshot.engineVersion,
    startedAt: generatedAt,
    completedAt: generatedAt,
    latencyMs: 0,
    serverRequestId: null,
    inputDigest,
    outputDigest,
    dataScope: "local-full-session",
    retention: "browser-session",
    errorCode: null,
  };
}

