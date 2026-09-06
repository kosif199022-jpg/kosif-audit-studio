const CLOUD_WORKSPACE_KEYS = Object.freeze([
  "version",
  "demoDatasetVersion",
  "entity",
  "acceptance",
  "report",
  "standardMappings",
  "mappingConfirmed",
  "materialityPolicy",
  "opinionAssessment",
  "analyticsReview",
  "council",
  "periodLocks",
  "auditTrail",
  "rounds",
  "evidence",
  "findings",
  "adjustments",
  "externalAiRuns",
  "sourceDataset",
  "humanApproval",
  "humanApprovedAt",
]);

const FORBIDDEN_CLOUD_KEYS = new Set([
  "accounts",
  "trialBalance",
  "trialBalanceLines",
  "journalLines",
  "sourceFiles",
  "stagedAccounts",
  "stagedRows",
  "staging",
  "attachments",
  "fileBytes",
  "evidenceBytes",
  "apiKey",
  "apiKeys",
  "secret",
  "secrets",
  "password",
]);

function findForbiddenKey(value, path = []) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenKey(value[index], [...path, String(index)]);
      if (found) return found;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_CLOUD_KEYS.has(key)) return [...path, key].join(".");
    const found = findForbiddenKey(nested, [...path, key]);
    if (found) return found;
  }
  return null;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeEntityName(value) {
  return String(value || "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function localFiscalYear(engagement) {
  const years = [...String(engagement?.entity?.period || "").matchAll(/(?:19|20|21)\d{2}/g)]
    .map((match) => Number(match[0]));
  const unique = [...new Set(years)];
  return unique.length === 1 ? unique[0] : null;
}

function mergeObject(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  return { ...(base || {}), ...patch };
}

export function buildCloudWorkspaceState(engagement) {
  if (!engagement || typeof engagement !== "object" || Array.isArray(engagement)) {
    throw new TypeError("invalid_cloud_workspace_state");
  }
  if (engagement.sourceDataset?.source === "import") {
    throw new Error("cloud_imported_dataset_not_persistable");
  }

  const state = {};
  for (const key of CLOUD_WORKSPACE_KEYS) {
    if (engagement[key] !== undefined) state[key] = engagement[key];
  }

  const forbidden = findForbiddenKey(state);
  if (forbidden) throw new Error(`forbidden_cloud_workspace_key:${forbidden}`);
  return cloneJson(state);
}

export function selectCloudEngagement(rows, localEngagement) {
  if (!Array.isArray(rows)) return null;
  const entityName = normalizeEntityName(localEngagement?.entity?.name);
  const fiscalYear = localFiscalYear(localEngagement);
  if (!entityName || !fiscalYear) return null;

  const matches = rows.filter((row) => {
    if (!row || row.archived_at || row.status === "archived") return false;
    return normalizeEntityName(row.client_name_ar) === entityName
      && Number(row.fiscal_year) === fiscalYear;
  });
  return matches.length === 1 ? matches[0] : null;
}

export function mergeCloudWorkspaceState(localEngagement, cloudState) {
  if (!localEngagement || typeof localEngagement !== "object") return localEngagement;
  if (!cloudState || typeof cloudState !== "object" || Array.isArray(cloudState)) return localEngagement;
  if (cloudState.version !== 7 || cloudState.sourceDataset?.source === "import") return localEngagement;

  const merged = { ...localEngagement, ...cloudState, version: 7 };
  merged.entity = mergeObject(localEngagement.entity, cloudState.entity);
  merged.acceptance = mergeObject(localEngagement.acceptance, cloudState.acceptance);
  merged.report = mergeObject(localEngagement.report, cloudState.report);
  merged.standardMappings = {
    ...mergeObject(localEngagement.standardMappings, cloudState.standardMappings),
    overrides: mergeObject(localEngagement.standardMappings?.overrides, cloudState.standardMappings?.overrides),
    review: mergeObject(localEngagement.standardMappings?.review, cloudState.standardMappings?.review),
  };
  merged.materialityPolicy = mergeObject(localEngagement.materialityPolicy, cloudState.materialityPolicy);
  merged.analyticsReview = mergeObject(localEngagement.analyticsReview, cloudState.analyticsReview);
  merged.council = {
    ...mergeObject(localEngagement.council, cloudState.council),
    humanDecision: mergeObject(localEngagement.council?.humanDecision, cloudState.council?.humanDecision),
    rounds: Array.isArray(cloudState.council?.rounds)
      ? cloudState.council.rounds
      : localEngagement.council?.rounds,
  };

  for (const key of ["periodLocks", "auditTrail", "rounds", "evidence", "findings", "adjustments", "externalAiRuns"]) {
    if (!Array.isArray(cloudState[key]) && Array.isArray(localEngagement[key])) merged[key] = localEngagement[key];
  }
  return merged;
}
