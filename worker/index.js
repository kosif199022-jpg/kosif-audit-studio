const providerDefinitions = [
  { id: "kosif-local", name: "KOSIF المحلي", execution: "browser", providerType: "deterministic", model: "KOSIF-COUNCIL-v4" },
  { id: "gemini", name: "Gemini", execution: "server", providerType: "llm", keyName: "GEMINI_API_KEY", modelName: "GEMINI_MODEL" },
  { id: "openai", name: "OpenAI", execution: "server", providerType: "llm", keyName: "OPENAI_API_KEY", modelName: "OPENAI_MODEL" },
  { id: "claude", name: "Claude", execution: "server", providerType: "llm", keyName: "ANTHROPIC_API_KEY", modelName: "ANTHROPIC_MODEL" },
];

const GENESIS_HASH = "0".repeat(64);
const CANONICAL_VERSION = "KOSIF-C14N-v1";
const WORKSPACE_MAX_BYTES = 131_072;
const ACCESS_ASSERTION_MAX_BYTES = 16_384;
const WORKSPACE_ALLOWED_KEYS = Object.freeze([
  "version",
  "demoDatasetVersion",
  "entity",
  "acceptance",
  "report",
  "standardMappings",
  "materialityPolicy",
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
]);
const WORKSPACE_FORBIDDEN_KEYS = new Set([
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
// Sites dispatch strips client-supplied identity values and forwards this
// platform-authenticated header to the Worker. It is authentication only;
// authorization is resolved from tenant_members below.
const AUTH_HEADER = "oai-authenticated-user-email";
const ACCESS_ASSERTION_HEADER = "cf-access-jwt-assertion";

export const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze(["council:read", "session:read", "engagement:create", "engagement:list", "engagement:read", "engagement:archive", "workspace:read", "workspace:write", "integrity:read"]),
  partner: Object.freeze(["council:read", "session:read", "engagement:create", "engagement:list", "engagement:read", "engagement:archive", "workspace:read", "workspace:write", "integrity:read"]),
  manager: Object.freeze(["council:read", "session:read", "engagement:create", "engagement:list", "engagement:read", "workspace:read", "workspace:write", "integrity:read"]),
  senior: Object.freeze(["council:read", "session:read", "engagement:list", "engagement:read", "workspace:read", "workspace:write", "integrity:read"]),
  viewer: Object.freeze(["council:read", "session:read", "engagement:list", "engagement:read", "workspace:read", "integrity:read"]),
});

export function authorizeRole(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role]?.includes(permission));
}

export const API_ROUTE_MANIFEST = Object.freeze([
  { method: "GET", path: "/api/council/providers", permission: "council:read" },
  { method: "POST", path: "/api/engagements", permission: "engagement:create" },
  { method: "GET", path: "/api/engagements/:id", permission: "engagement:read" },
  { method: "POST", path: "/api/engagements/:id/archive", permission: "engagement:archive" },
  { method: "GET", path: "/api/engagements/:id/integrity", permission: "integrity:read" },
  { method: "GET", path: "/api/session", permission: "session:read" },
  { method: "GET", path: "/api/engagements", permission: "engagement:list" },
  { method: "GET", path: "/api/engagements/:id/workspace", permission: "workspace:read" },
  { method: "PUT", path: "/api/engagements/:id/workspace", permission: "workspace:write" },
]);

const API_ROUTES = [
  { ...API_ROUTE_MANIFEST[0], pattern: /^\/api\/council\/providers$/ },
  { ...API_ROUTE_MANIFEST[1], pattern: /^\/api\/engagements$/ },
  { ...API_ROUTE_MANIFEST[2], pattern: /^\/api\/engagements\/(eng_[a-f0-9]{26})$/ },
  { ...API_ROUTE_MANIFEST[3], pattern: /^\/api\/engagements\/(eng_[a-f0-9]{26})\/archive$/ },
  { ...API_ROUTE_MANIFEST[4], pattern: /^\/api\/engagements\/(eng_[a-f0-9]{26})\/integrity$/ },
  { ...API_ROUTE_MANIFEST[5], pattern: /^\/api\/session$/ },
  { ...API_ROUTE_MANIFEST[6], pattern: /^\/api\/engagements$/ },
  { ...API_ROUTE_MANIFEST[7], pattern: /^\/api\/engagements\/(eng_[a-f0-9]{26})\/workspace$/ },
  { ...API_ROUTE_MANIFEST[8], pattern: /^\/api\/engagements\/(eng_[a-f0-9]{26})\/workspace$/ },
];

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...extraHeaders,
    },
  });
}

function secureStaticResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), geolocation=(), microphone=(self)");
  headers.set("content-security-policy", "default-src 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) output[key] = canonicalize(value[key]);
    }
    return output;
  }
  return typeof value === "string" ? value.normalize("NFC") : value;
}

function canonicalJSON(value) {
  return JSON.stringify(canonicalize(value));
}

function findForbiddenWorkspaceKey(value, path = []) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenWorkspaceKey(value[index], [...path, String(index)]);
      if (found) return found;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (WORKSPACE_FORBIDDEN_KEYS.has(key)) return [...path, key].join(".");
    const found = findForbiddenWorkspaceKey(nested, [...path, key]);
    if (found) return found;
  }
  return null;
}

export function normalizeWorkspaceState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "invalid_workspace_state" };
  }
  const forbidden = findForbiddenWorkspaceKey(value);
  if (forbidden) return { error: "forbidden_workspace_key", key: forbidden };
  const retained = {};
  for (const key of WORKSPACE_ALLOWED_KEYS) {
    if (value[key] !== undefined) retained[key] = value[key];
  }
  const stateJson = canonicalJSON(retained);
  const byteLength = new TextEncoder().encode(stateJson).byteLength;
  if (byteLength > WORKSPACE_MAX_BYTES) return { error: "workspace_too_large", byteLength };
  return { state: JSON.parse(stateJson), stateJson, byteLength };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function stableId(prefix, value) {
  return `${prefix}_${(await sha256(`${CANONICAL_VERSION}:${canonicalJSON(value)}`)).slice(0, 26)}`;
}

function normalizeSitesSubject(request) {
  const raw = request.headers.get(AUTH_HEADER);
  if (!raw) return null;
  const subject = raw.trim().toLowerCase();
  return subject && subject.length <= 320 ? subject : null;
}

function normalizeAccessConfig(env) {
  const audience = String(env?.POLICY_AUD || "").trim();
  const rawTeamDomain = String(env?.TEAM_DOMAIN || "").trim();
  if (!audience || audience.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(audience)) return null;
  if (!rawTeamDomain || rawTeamDomain.length > 253) return null;
  try {
    const url = new URL(rawTeamDomain);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null;
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(hostname)) return null;
    return { audience, teamDomain: `https://${hostname}` };
  } catch {
    return null;
  }
}

function decodeBase64Url(segment) {
  if (!segment || segment.length > ACCESS_ASSERTION_MAX_BYTES || !/^[A-Za-z0-9_-]+$/.test(segment)) throw new Error("invalid_jwt_segment");
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJwtJson(segment) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment)));
}

function validAccessEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function verifyCloudflareAccessSubject(request, env, options = {}) {
  const config = normalizeAccessConfig(env);
  const assertion = request.headers.get(ACCESS_ASSERTION_HEADER);
  if (!config || !assertion || assertion.length > ACCESS_ASSERTION_MAX_BYTES) return null;

  const parts = assertion.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) return null;

  try {
    const header = decodeJwtJson(parts[0]);
    const payload = decodeJwtJson(parts[1]);
    if (!header || typeof header !== "object" || Array.isArray(header)) return null;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.kid.length > 256) return null;
    if (payload.iss !== config.teamDomain) return null;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(config.audience)) return null;

    const nowSeconds = Number.isFinite(options.nowSeconds) ? options.nowSeconds : Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds) return null;
    if (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || payload.nbf > nowSeconds)) return null;
    if (payload.iat !== undefined && (!Number.isFinite(payload.iat) || payload.iat > nowSeconds + 60)) return null;
    const email = validAccessEmail(payload.email);
    if (!email) return null;

    const fetchImpl = options.fetchImpl || fetch;
    const cryptoImpl = options.cryptoImpl || crypto;
    if (typeof fetchImpl !== "function" || !cryptoImpl?.subtle?.importKey || !cryptoImpl?.subtle?.verify) return null;
    const certsUrl = `${config.teamDomain}/cdn-cgi/access/certs`;
    const response = await fetchImpl(certsUrl, { headers: { accept: "application/json" } });
    if (!response?.ok) return null;
    const keySet = await response.json();
    const keys = Array.isArray(keySet?.keys) ? keySet.keys : [];
    if (!keys.length || keys.length > 32) return null;
    const jwk = keys.find((candidate) => candidate?.kid === header.kid);
    if (!jwk || jwk.kty !== "RSA" || !jwk.n || !jwk.e) return null;
    if (jwk.alg && jwk.alg !== "RS256") return null;
    if (jwk.use && jwk.use !== "sig") return null;

    const publicKey = await cryptoImpl.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await cryptoImpl.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return valid ? email : null;
  } catch {
    return null;
  }
}

async function authenticatedSubject(request, env) {
  return normalizeSitesSubject(request) || await verifyCloudflareAccessSubject(request, env);
}

async function tenantIdFor(subject) {
  return `ten_${(await sha256(`KOSIF-TENANT-v1:${subject}`)).slice(0, 26)}`;
}

function providerRegistry(env) {
  const checkedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    policyVersion: "KOSIF-SUMMARY-ONLY-v1",
    checkedAt,
    externalExecutionAvailable: false,
    providers: providerDefinitions.map((provider) => {
      if (provider.id === "kosif-local") {
        return { ...provider, status: "ready", configured: true, canRun: true, dataPolicy: "local-only", lastCheckedAt: checkedAt };
      }
      const configured = Boolean(env?.[provider.keyName] && env?.[provider.modelName]);
      return {
        id: provider.id,
        name: provider.name,
        execution: provider.execution,
        providerType: provider.providerType,
        status: configured ? "configured" : "unconfigured",
        configured,
        canRun: false,
        model: configured ? String(env[provider.modelName]).slice(0, 120) : null,
        dataPolicy: "summary-only",
        lastCheckedAt: checkedAt,
      };
    }),
    limitation: "External execution is disabled until authenticated, rate-limited server routes are configured.",
  };
}

function requireDatabase(env) {
  if (!env?.DB?.prepare || !env?.DB?.batch) throw new Error("database_unavailable");
  return env.DB;
}

async function ensureTenant(db, tenantId, subject, at) {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?1, ?2, ?3)").bind(tenantId, "مساحة KOSIF", at),
    db.prepare("INSERT OR IGNORE INTO tenant_members (tenant_id, subject, role, created_at) VALUES (?1, ?2, 'owner', ?3)").bind(tenantId, subject, at),
  ]);
}

async function memberRole(db, tenantId, subject) {
  const member = await db.prepare(
    "SELECT role FROM tenant_members WHERE tenant_id = ?1 AND subject = ?2",
  ).bind(tenantId, subject).first();
  return member?.role || null;
}

function validateEngagementInput(input) {
  const clientNameAr = String(input?.client_name_ar || "").trim();
  const fiscalYear = input?.fiscal_year;
  const periodStart = String(input?.period_start || "");
  const periodEnd = String(input?.period_end || "");
  const currency = String(input?.currency || "SAR").toUpperCase();
  const framework = String(input?.framework || "");
  const rulesetVersion = String(input?.ruleset_version || "").trim();
  const effectiveAt = String(input?.effective_at || "");
  if (clientNameAr.length < 2 || clientNameAr.length > 200) return { error: "invalid_client_name" };
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2200) return { error: "invalid_fiscal_year" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodStart > periodEnd) return { error: "invalid_period" };
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "invalid_currency" };
  if (!["IFRS", "IFRS_SME"].includes(framework)) return { error: "invalid_framework" };
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(rulesetVersion)) return { error: "invalid_ruleset_version" };
  if (!Number.isFinite(Date.parse(effectiveAt))) return { error: "effective_at_required" };
  return { clientNameAr, fiscalYear, periodStart, periodEnd, currency, framework, rulesetVersion, effectiveAt: new Date(effectiveAt).toISOString() };
}

async function appendLogValues({ engagementId, actor, action, payload, at, prevHash = GENESIS_HASH }) {
  const canonicalPayload = { engagement_id: engagementId, actor, action, payload, at };
  const entryHash = await sha256(`${prevHash}${canonicalJSON(canonicalPayload)}`);
  return { payloadJson: canonicalJSON(payload), prevHash, entryHash };
}

async function engagementForTenant(db, engagementId, tenantId) {
  return db.prepare(`
    SELECT id, tenant_id, client_name_ar, fiscal_year, period_start, period_end,
           currency, framework, status, ruleset_version, created_by, created_at,
           archived_at, prior_engagement_id
    FROM engagements WHERE id = ?1 AND tenant_id = ?2
  `).bind(engagementId, tenantId).first();
}

async function createEngagement(request, env, auth) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 32_768) return jsonResponse({ error: "payload_too_large" }, 413);
  let input;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  const validated = validateEngagementInput(input);
  if (validated.error) return jsonResponse({ error: validated.error }, 422);
  const db = requireDatabase(env);
  await ensureTenant(db, auth.tenantId, auth.subject, validated.effectiveAt);
  const role = await memberRole(db, auth.tenantId, auth.subject);
  if (!authorizeRole(role, auth.permission)) return jsonResponse({ error: "permission_denied" }, 403);
  const engagementId = await stableId("eng", {
    tenantId: auth.tenantId,
    clientNameAr: validated.clientNameAr,
    fiscalYear: validated.fiscalYear,
    periodStart: validated.periodStart,
    periodEnd: validated.periodEnd,
    rulesetVersion: validated.rulesetVersion,
    effectiveAt: validated.effectiveAt,
  });
  const existing = await engagementForTenant(db, engagementId, auth.tenantId);
  if (existing) return jsonResponse({ engagement: existing, idempotent: true }, 200);
  const log = await appendLogValues({ engagementId, actor: auth.subject, action: "engagement.created", payload: { ruleset_version: validated.rulesetVersion }, at: validated.effectiveAt });
  await db.batch([
    db.prepare(`
      INSERT INTO engagements (
        id, tenant_id, client_name_ar, fiscal_year, period_start, period_end,
        currency, framework, status, ruleset_version, created_by, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'planning', ?9, ?10, ?11)
    `).bind(engagementId, auth.tenantId, validated.clientNameAr, validated.fiscalYear, validated.periodStart, validated.periodEnd, validated.currency, validated.framework, validated.rulesetVersion, auth.subject, validated.effectiveAt),
    db.prepare(`
      INSERT INTO audit_log (engagement_id, actor, action, payload_json, at, canonical_version, prev_hash, entry_hash)
      VALUES (?1, ?2, 'engagement.created', ?3, ?4, ?5, ?6, ?7)
    `).bind(engagementId, auth.subject, log.payloadJson, validated.effectiveAt, CANONICAL_VERSION, log.prevHash, log.entryHash),
  ]);
  return jsonResponse({ engagement: await engagementForTenant(db, engagementId, auth.tenantId), idempotent: false }, 201);
}

async function getSession(env, auth) {
  const db = requireDatabase(env);
  const at = new Date().toISOString();
  await ensureTenant(db, auth.tenantId, auth.subject, at);
  const role = await memberRole(db, auth.tenantId, auth.subject);
  if (!authorizeRole(role, auth.permission)) return jsonResponse({ error: "permission_denied" }, 403);
  return jsonResponse({
    session: {
      subject: auth.subject,
      tenant_id: auth.tenantId,
      role,
      capabilities: [...(ROLE_PERMISSIONS[role] || [])],
    },
  });
}

async function listEngagements(env, auth) {
  const db = requireDatabase(env);
  await ensureTenant(db, auth.tenantId, auth.subject, new Date().toISOString());
  const role = await memberRole(db, auth.tenantId, auth.subject);
  if (!authorizeRole(role, auth.permission)) return jsonResponse({ error: "permission_denied" }, 403);
  const result = await db.prepare(`
    SELECT id, tenant_id, client_name_ar, fiscal_year, period_start, period_end,
           currency, framework, status, ruleset_version, created_by, created_at,
           archived_at, prior_engagement_id
    FROM engagements
    WHERE tenant_id = ?1
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  `).bind(auth.tenantId).all();
  return jsonResponse({ engagements: result.results || [] });
}

async function getEngagement(env, auth, engagementId) {
  const engagement = await engagementForTenant(requireDatabase(env), engagementId, auth.tenantId);
  return engagement ? jsonResponse({ engagement }) : jsonResponse({ error: "not_found" }, 404);
}

async function archiveEngagement(request, env, auth, engagementId) {
  const db = requireDatabase(env);
  const engagement = await engagementForTenant(db, engagementId, auth.tenantId);
  if (!engagement) return jsonResponse({ error: "not_found" }, 404);
  if (engagement.archived_at) return jsonResponse({ engagement, idempotent: true });
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400); }
  const archivedAt = String(body?.effective_at || "");
  const rationaleAr = String(body?.rationale_ar || "").trim();
  if (!Number.isFinite(Date.parse(archivedAt)) || rationaleAr.length < 10) return jsonResponse({ error: "archive_rationale_and_effective_at_required" }, 422);
  const head = await db.prepare("SELECT entry_hash FROM audit_log WHERE engagement_id = ?1 ORDER BY seq DESC LIMIT 1").bind(engagementId).first();
  const at = new Date(archivedAt).toISOString();
  const log = await appendLogValues({ engagementId, actor: auth.subject, action: "engagement.archived", payload: { rationale_ar: rationaleAr }, at, prevHash: head?.entry_hash || GENESIS_HASH });
  await db.batch([
    db.prepare("UPDATE engagements SET status = 'archived', archived_at = ?1 WHERE id = ?2 AND tenant_id = ?3 AND archived_at IS NULL").bind(at, engagementId, auth.tenantId),
    db.prepare(`
      INSERT INTO audit_log (engagement_id, actor, action, payload_json, at, canonical_version, prev_hash, entry_hash)
      VALUES (?1, ?2, 'engagement.archived', ?3, ?4, ?5, ?6, ?7)
    `).bind(engagementId, auth.subject, log.payloadJson, at, CANONICAL_VERSION, log.prevHash, log.entryHash),
  ]);
  return jsonResponse({ engagement: await engagementForTenant(db, engagementId, auth.tenantId), idempotent: false });
}

async function integrityStatus(env, auth, engagementId) {
  const db = requireDatabase(env);
  if (!await engagementForTenant(db, engagementId, auth.tenantId)) return jsonResponse({ error: "not_found" }, 404);
  const result = await db.prepare(`
    SELECT seq, actor, action, payload_json, at, prev_hash, entry_hash
    FROM audit_log WHERE engagement_id = ?1 ORDER BY seq ASC
  `).bind(engagementId).all();
  let prevHash = GENESIS_HASH;
  for (const row of result.results || []) {
    const expected = await sha256(`${prevHash}${canonicalJSON({ engagement_id: engagementId, actor: row.actor, action: row.action, payload: JSON.parse(row.payload_json), at: row.at })}`);
    if (row.prev_hash !== prevHash || row.entry_hash !== expected) return jsonResponse({ valid: false, broken_seq: row.seq, head_hash: prevHash });
    prevHash = row.entry_hash;
  }
  return jsonResponse({ valid: true, broken_seq: null, entries: result.results?.length || 0, head_hash: prevHash });
}

async function latestWorkspaceRevision(db, engagementId, tenantId) {
  return db.prepare(`
    SELECT revision, state_json, state_hash, saved_by, saved_at
    FROM engagement_workspace_revisions
    WHERE engagement_id = ?1 AND tenant_id = ?2
    ORDER BY revision DESC
    LIMIT 1
  `).bind(engagementId, tenantId).first();
}

function workspaceResponse(row) {
  if (!row) return { revision: 0, state: null, state_hash: null, saved_by: null, saved_at: null };
  return {
    revision: Number(row.revision),
    state: JSON.parse(row.state_json),
    state_hash: row.state_hash,
    saved_by: row.saved_by,
    saved_at: row.saved_at,
  };
}

async function getWorkspace(env, auth, engagementId) {
  const db = requireDatabase(env);
  if (!await engagementForTenant(db, engagementId, auth.tenantId)) return jsonResponse({ error: "not_found" }, 404);
  return jsonResponse({ workspace: workspaceResponse(await latestWorkspaceRevision(db, engagementId, auth.tenantId)) });
}

async function saveWorkspace(request, env, auth, engagementId) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 196_608) return jsonResponse({ error: "payload_too_large" }, 413);
  let input;
  try { input = await request.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400); }
  if (!Number.isInteger(input?.base_revision) || input.base_revision < 0) {
    return jsonResponse({ error: "invalid_base_revision" }, 422);
  }
  const normalized = normalizeWorkspaceState(input.state);
  if (normalized.error === "workspace_too_large") return jsonResponse({ error: normalized.error, byte_length: normalized.byteLength }, 413);
  if (normalized.error) return jsonResponse({ error: normalized.error, key: normalized.key || null }, 422);

  const db = requireDatabase(env);
  const engagement = await engagementForTenant(db, engagementId, auth.tenantId);
  if (!engagement) return jsonResponse({ error: "not_found" }, 404);
  if (engagement.archived_at) return jsonResponse({ error: "engagement_archived" }, 409);

  const current = await latestWorkspaceRevision(db, engagementId, auth.tenantId);
  const currentRevision = Number(current?.revision || 0);
  if (currentRevision !== input.base_revision) {
    return jsonResponse({ error: "workspace_revision_conflict", current_revision: currentRevision }, 409);
  }

  const revision = currentRevision + 1;
  const savedAt = new Date().toISOString();
  const stateHash = await sha256(normalized.stateJson);
  const head = await db.prepare("SELECT entry_hash FROM audit_log WHERE engagement_id = ?1 ORDER BY seq DESC LIMIT 1").bind(engagementId).first();
  const log = await appendLogValues({
    engagementId,
    actor: auth.subject,
    action: "workspace.saved",
    payload: { revision, state_hash: stateHash },
    at: savedAt,
    prevHash: head?.entry_hash || GENESIS_HASH,
  });

  try {
    await db.batch([
      db.prepare(`
        INSERT INTO engagement_workspace_revisions (
          engagement_id, tenant_id, revision, state_json, state_hash, saved_by, saved_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `).bind(engagementId, auth.tenantId, revision, normalized.stateJson, stateHash, auth.subject, savedAt),
      db.prepare(`
        INSERT INTO audit_log (engagement_id, actor, action, payload_json, at, canonical_version, prev_hash, entry_hash)
        VALUES (?1, ?2, 'workspace.saved', ?3, ?4, ?5, ?6, ?7)
      `).bind(engagementId, auth.subject, log.payloadJson, savedAt, CANONICAL_VERSION, log.prevHash, log.entryHash),
    ]);
  } catch (error) {
    const refreshed = await latestWorkspaceRevision(db, engagementId, auth.tenantId);
    const refreshedRevision = Number(refreshed?.revision || 0);
    if (refreshedRevision !== input.base_revision) {
      return jsonResponse({ error: "workspace_revision_conflict", current_revision: refreshedRevision }, 409);
    }
    if (String(error?.message || "").includes("archived_engagement_is_read_only")) {
      return jsonResponse({ error: "engagement_archived" }, 409);
    }
    throw error;
  }

  return jsonResponse({
    workspace: {
      revision,
      state: normalized.state,
      state_hash: stateHash,
      saved_by: auth.subject,
      saved_at: savedAt,
    },
  }, 201);
}

async function handleApi(request, env, url) {
  const route = API_ROUTES.find((item) => item.method === request.method && item.pattern.test(url.pathname));
  if (!route) return jsonResponse({ error: "route_not_authorized" }, 403);
  const subject = await authenticatedSubject(request, env);
  if (!subject) return jsonResponse({ error: "authentication_required" }, 401);
  const auth = { subject, tenantId: await tenantIdFor(subject), permission: route.permission };
  const match = url.pathname.match(route.pattern);
  try {
    if (route.path === "/api/council/providers") {
      if (!authorizeRole("viewer", route.permission)) return jsonResponse({ error: "permission_denied" }, 403);
      return jsonResponse(providerRegistry(env));
    }
    if (route.path === "/api/session") return getSession(env, auth);
    if (route.path === "/api/engagements" && route.method === "GET") return listEngagements(env, auth);
    if (route.path === "/api/engagements" && route.method === "POST") return createEngagement(request, env, auth);
    const role = await memberRole(requireDatabase(env), auth.tenantId, auth.subject);
    if (!authorizeRole(role, route.permission)) return jsonResponse({ error: "permission_denied" }, 403);
    auth.role = role;
    if (route.path === "/api/engagements/:id") return getEngagement(env, auth, match[1]);
    if (route.path.endsWith("/archive")) return archiveEngagement(request, env, auth, match[1]);
    if (route.path.endsWith("/integrity")) return integrityStatus(env, auth, match[1]);
    if (route.path.endsWith("/workspace") && route.method === "GET") return getWorkspace(env, auth, match[1]);
    if (route.path.endsWith("/workspace") && route.method === "PUT") return saveWorkspace(request, env, auth, match[1]);
  } catch (error) {
    if (error?.message === "database_unavailable") return jsonResponse({ error: "database_unavailable" }, 503);
    return jsonResponse({ error: "request_failed" }, 500);
  }
  return jsonResponse({ error: "route_not_authorized" }, 403);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);

    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return secureStaticResponse(response);
    }
    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return secureStaticResponse(await env.ASSETS.fetch(new Request(indexUrl, request)));
  },
};
