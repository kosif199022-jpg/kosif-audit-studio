const providerDefinitions = [
  { id: "kosif-local", name: "KOSIF المحلي", execution: "browser", providerType: "deterministic", model: "KOSIF-COUNCIL-v4" },
  { id: "gemini", name: "Gemini", execution: "server", providerType: "llm", keyName: "GEMINI_API_KEY", modelName: "GEMINI_MODEL" },
  { id: "openai", name: "OpenAI", execution: "server", providerType: "llm", keyName: "OPENAI_API_KEY", modelName: "OPENAI_MODEL" },
  { id: "claude", name: "Claude", execution: "server", providerType: "llm", keyName: "ANTHROPIC_API_KEY", modelName: "ANTHROPIC_MODEL" },
];

const GENESIS_HASH = "0".repeat(64);
const CANONICAL_VERSION = "KOSIF-C14N-v1";
// Sites dispatch strips client-supplied identity values and forwards this
// platform-authenticated header to the Worker. It is authentication only;
// authorization is resolved from tenant_members below.
const AUTH_HEADER = "oai-authenticated-user-email";

export const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze(["council:read", "engagement:create", "engagement:read", "engagement:archive", "integrity:read"]),
  partner: Object.freeze(["council:read", "engagement:create", "engagement:read", "engagement:archive", "integrity:read"]),
  manager: Object.freeze(["council:read", "engagement:create", "engagement:read", "integrity:read"]),
  senior: Object.freeze(["council:read", "engagement:read", "integrity:read"]),
  viewer: Object.freeze(["council:read", "engagement:read", "integrity:read"]),
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
]);

const API_ROUTES = [
  { ...API_ROUTE_MANIFEST[0], pattern: /^\/api\/council\/providers$/ },
  { ...API_ROUTE_MANIFEST[1], pattern: /^\/api\/engagements$/ },
  { ...API_ROUTE_MANIFEST[2], pattern: /^\/api\/engagements\/(eng_[a-f0-9]{26})$/ },
  { ...API_ROUTE_MANIFEST[3], pattern: /^\/api\/engagements\/(eng_[a-f0-9]{26})\/archive$/ },
  { ...API_ROUTE_MANIFEST[4], pattern: /^\/api\/engagements\/(eng_[a-f0-9]{26})\/integrity$/ },
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

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function stableId(prefix, value) {
  return `${prefix}_${(await sha256(`${CANONICAL_VERSION}:${canonicalJSON(value)}`)).slice(0, 26)}`;
}

function authenticatedSubject(request) {
  const raw = request.headers.get(AUTH_HEADER);
  if (!raw) return null;
  const subject = raw.trim().toLowerCase();
  return subject && subject.length <= 320 ? subject : null;
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

async function handleApi(request, env, url) {
  const route = API_ROUTES.find((item) => item.method === request.method && item.pattern.test(url.pathname));
  if (!route) return jsonResponse({ error: "route_not_authorized" }, 403);
  const subject = authenticatedSubject(request);
  if (!subject) return jsonResponse({ error: "authentication_required" }, 401);
  const auth = { subject, tenantId: await tenantIdFor(subject), permission: route.permission };
  const match = url.pathname.match(route.pattern);
  try {
    if (route.path === "/api/council/providers") {
      if (!authorizeRole("viewer", route.permission)) return jsonResponse({ error: "permission_denied" }, 403);
      return jsonResponse(providerRegistry(env));
    }
    if (route.path === "/api/engagements") return createEngagement(request, env, auth);
    const role = await memberRole(requireDatabase(env), auth.tenantId, auth.subject);
    if (!authorizeRole(role, route.permission)) return jsonResponse({ error: "permission_denied" }, 403);
    auth.role = role;
    if (route.path === "/api/engagements/:id") return getEngagement(env, auth, match[1]);
    if (route.path.endsWith("/archive")) return archiveEngagement(request, env, auth, match[1]);
    if (route.path.endsWith("/integrity")) return integrityStatus(env, auth, match[1]);
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
