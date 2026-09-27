#!/usr/bin/env node
/* Jev bridge credential migration and rotation — run only from .github/workflows/jev-bridge-rotate.yml.
 *
 * jev-claude-bridge shipped with its access token hard-coded as `const ACCESS_TOKEN = "…"`, and its public root
 * advertised the /mcp/<token> path. This tool moves the bridge to an ACCESS_TOKEN Worker secret, gives it a fresh random
 * token, and switches every consumer (aghnam-jev-api, jev-public) to the same token, without an outage:
 *
 *   snapshot  record the deployed version of the bridge and of each consumer (the rollback point; no credentials)
 *   prepare   generate the new token; fetch the bridge source once, cut the hard-coded token out of it and wrap the
 *             module so it reads env.ACCESS_TOKEN, serves a token-free /health and scrubs every public response
 *   stage     bridge secrets ACCESS_TOKEN=new and LEGACY_ACCESS_TOKEN=old, then deploy the wrapped code;
 *             both tokens work, so consumers still on the old one keep running
 *   switch    each consumer's JEV_BRIDGE_TOKEN := new, then an end-to-end call through its public Jev endpoint
 *   finalize  delete LEGACY_ACCESS_TOKEN: the old token stops working only now, after every check has passed
 *   rollback  put everything back explicitly, then prove the old path works again end to end:
 *             - consumers: JEV_BRIDGE_TOKEN is written back to the previous value (the only thing rotation changed on
 *               them). This does not rely on version rollback: Cloudflare refuses to roll back a Worker whose secrets
 *               changed unless forced, and does not document which secret values a forced rollback uses.
 *             - bridge: the snapshot version is redeployed (forced); if that fails, the saved original source is
 *               re-uploaded. The original code checks its hard-coded token, so it works whatever the secrets hold.
 *             - order: while LEGACY_ACCESS_TOKEN exists the wrapped bridge still accepts the old token, so consumers
 *               go back first; after finalize it does not, so the bridge goes back first.
 *
 * Never printed, written to logs, or uploaded as an artifact: either token, the bridge source, or any response body.
 * Secrets live in STATE_DIR (mode 0600) for the lifetime of the job, and the workflow deletes that directory. Every
 * value is masked (::add-mask::) the moment it exists, before any use.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BRIDGE = 'jev-claude-bridge';
/* each consumer and its public Jev endpoint, used for the end-to-end check */
export const CONSUMERS = { 'aghnam-jev-api': '/api/public-jev', 'jev-public': '/api/decide' };
const MARK = '/* jev-bridge-migrate: wrapped */';

export class MigrationError extends Error {}
const fail = (msg) => { throw new MigrationError(msg); };

/* ------------------------------------------------------------------------------------------------ source transform */

/** Cuts the hard-coded token out of the bridge module and wraps its default export. Returns {code, legacyToken}.
 *  Error messages never quote the source. */
export function transformBridgeSource(source) {
  if (typeof source !== 'string' || !source.trim()) fail('bridge source is empty');
  if (source.includes(MARK)) fail('bridge source is already migrated; nothing to do');
  const decl = /\b(?:const|let|var)\s+ACCESS_TOKEN\s*=\s*(['"`])([^'"`\s]{16,})\1\s*;?/g;
  const found = [...source.matchAll(decl)];
  if (found.length !== 1) fail(`expected exactly one hard-coded ACCESS_TOKEN declaration, found ${found.length}`);
  const legacyToken = found[0][2];
  if (legacyToken.includes('${')) fail('ACCESS_TOKEN is a template expression, not a literal');
  let code = source.replace(decl, 'let ACCESS_TOKEN; /* now the ACCESS_TOKEN Worker secret, set per request */');
  const stray = code.split(legacyToken).length - 1;
  if (stray) fail(`the old token literal appears ${stray} more time(s) in the source; migrate those uses by hand`);
  if (/\baddEventListener\s*\(\s*['"]fetch['"]/.test(code) && !/export\s+default|as\s+default/.test(code)) fail('service-worker syntax is not supported; the bridge must be an ES module');

  const direct = [...code.matchAll(/\bexport\s+default\s+/g)];
  const named = [...code.matchAll(/\bexport\s*\{([^}]*)\}\s*;?/g)].filter((m) => /\b[\w$]+\s+as\s+default\b/.test(m[1]));
  if (direct.length + named.length !== 1) fail(`expected one default export, found ${direct.length + named.length}`);
  if (direct.length) {
    const after = code.slice(direct[0].index + direct[0][0].length);
    if (/^class\b/.test(after)) fail('a class default export (WorkerEntrypoint) is not supported by this wrapper');
    code = code.slice(0, direct[0].index) + 'const __jevBridgeOriginal = ' + after;
  } else {
    const m = named[0], spec = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const target = spec.find((s) => /\s+as\s+default$/.test(s)).replace(/\s+as\s+default$/, '');
    const rest = spec.filter((s) => !/\s+as\s+default$/.test(s));
    code = code.slice(0, m.index) + (rest.length ? `export { ${rest.join(', ')} };` : '') + `\nconst __jevBridgeOriginal = ${target};` + code.slice(m.index + m[0].length);
  }
  code += `\n${MARK}\n${WRAPPER}`;
  if (code.includes(legacyToken)) fail('the old token is still present after the transform');
  return { code, legacyToken };
}

/* Appended to the bridge module. Plain JS for the Workers runtime; it closes over the module's own ACCESS_TOKEN. */
const WRAPPER = String.raw`
const __jevTextual = /^(text\/(?!event-stream)|application\/(json|javascript|xml|x-www-form-urlencoded))/i;
function __jevScrub(text, tokens) {
  for (const t of tokens) if (t) text = text.split(t).join('[redacted]');
  return text.replace(/\/mcp\/(?!\[redacted\])[^\s"'<>\x60)\\]+/g, '/mcp/[redacted]');
}
export default {
  ...__jevBridgeOriginal,
  async fetch(request, env, ctx) {
    const token = env && env.ACCESS_TOKEN, legacy = env && env.LEGACY_ACCESS_TOKEN;
    const url = new URL(request.url);
    const noStore = { 'cache-control': 'no-store' };
    if (url.pathname === '/health') {
      return Response.json({ ok: Boolean(token), service: 'jev-claude-bridge', auth: token ? 'secret' : 'missing', legacy: Boolean(legacy) }, { status: token ? 200 : 503, headers: noStore });
    }
    if (!token) return Response.json({ ok: false, error: 'bridge not configured' }, { status: 503, headers: noStore });
    ACCESS_TOKEN = token;
    /* during the switch-over window only: requests still using the old token are rewritten to the new one */
    if (legacy && legacy !== token) {
      const oldPath = '/mcp/' + legacy, auth = request.headers.get('authorization') || '';
      if (url.pathname.includes(oldPath) || auth.includes(legacy)) {
        url.pathname = url.pathname.split(oldPath).join('/mcp/' + token);
        const headers = new Headers(request.headers);
        if (auth.includes(legacy)) headers.set('authorization', auth.split(legacy).join(token));
        request = new Request(url, new Request(request, { headers }));
      }
    }
    const res = await __jevBridgeOriginal.fetch.call(__jevBridgeOriginal, request, env, ctx);
    if (url.pathname === '/mcp/' + token || url.pathname.startsWith('/mcp/' + token + '/')) return res;
    /* every other response is public: it must never carry a credential or the authenticated path */
    const type = res.headers.get('content-type') || '';
    if (!__jevTextual.test(type) && type) return res;
    const text = __jevScrub(await res.text(), [token, legacy]);
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    return new Response(text, { status: res.status, statusText: res.statusText, headers });
  },
};
`;

/* ------------------------------------------------------------------------------------------------ Cloudflare API */

const need = (name) => process.env[name] || fail(`missing environment variable ${name}`);
const api = (path) => `https://api.cloudflare.com/client/v4/accounts/${need('CLOUDFLARE_ACCOUNT_ID')}/workers/scripts/${path}`;
async function cf(method, path, { json, form, raw } = {}) {
  const headers = { authorization: `Bearer ${need('CLOUDFLARE_API_TOKEN')}` };
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(api(path), { method, headers, body });
  if (raw) return res;
  let data = null; try { data = await res.json(); } catch { /* reported below by status */ }
  if (!res.ok || !data || data.success === false) {
    const codes = (data && data.errors || []).map((e) => e.code).join(',') || 'none';
    fail(`Cloudflare API ${method} ${path.split('?')[0]} failed: HTTP ${res.status}, error codes ${codes}`);
  }
  return data.result;
}
const scriptExists = async (name) => { const r = await cf('GET', `${name}/settings`, { raw: true }); return r.status === 200; };
async function currentVersions(name) {
  const r = await cf('GET', `${name}/deployments`);
  const d = (r && r.deployments || [])[0];
  if (!d || !d.versions || !d.versions.length) fail(`no active deployment found for ${name}`);
  return d.versions.map((v) => ({ version_id: v.version_id, percentage: v.percentage }));
}
const putSecret = (name, key, text) => cf('PUT', `${name}/secrets`, { json: { name: key, text, type: 'secret_text' } });
const deleteSecret = (name, key) => cf('DELETE', `${name}/secrets/${key}`);
/* rolling back a Worker also restores that version's secrets; force acknowledges that */
const deployVersions = (name, versions) => cf('POST', `${name}/deployments?force=true`, { json: { strategy: 'percentage', versions } });

async function uploadBridge(code) {
  const settings = await cf('GET', `${BRIDGE}/settings`);
  const keep = [...new Set((settings.bindings || []).map((b) => b.type))];
  const metadata = { main_module: 'worker.js', bindings: [], keep_bindings: keep };
  for (const k of ['compatibility_date', 'compatibility_flags', 'placement', 'tail_consumers', 'logpush', 'observability', 'usage_model']) if (settings[k] !== undefined) metadata[k] = settings[k];
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');
  await cf('PUT', BRIDGE, { form });
}

/* ------------------------------------------------------------------------------------------------ checks */

const origin = (name) => `https://${name}.${need('WORKERS_SUBDOMAIN')}.workers.dev`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_MS = Number(process.env.JEV_RETRY_MS || 5000);
const leaks = (text, tokens) => tokens.some((t) => t && text.includes(t)) || /\/mcp\/(?!\[redacted\])[^\s"'<>`)\\]+/.test(text);
async function get(url, init) { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(90_000) }); return { status: r.status, text: await r.text() }; }

async function retry(label, fn, tries = 12) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try { await fn(); console.log(`✓ ${label}`); return; } catch (e) { last = e; if (i < tries) await sleep(RETRY_MS); }
  }
  fail(`${label}: ${last && last.message}`);
}
const check = (cond, msg) => { if (!cond) fail(msg); };

async function mcpToolsList(token) {
  const r = await get(`${origin(BRIDGE)}/mcp/${token}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'mcp-protocol-version': '2025-06-18' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  let data = null; try { data = JSON.parse(r.text); } catch { /* not JSON */ }
  return r.status === 200 && Array.isArray(data?.result?.tools);
}
async function bridgePublicIsClean(tokens) {
  for (const path of ['/', '/health', '/no-such-page']) {
    const r = await get(origin(BRIDGE) + path);
    check(!leaks(r.text, tokens), `bridge ${path} exposes a credential or the /mcp path`);
  }
}
async function consumerEndToEnd(name, tokens) {
  const h = await get(`${origin(name)}/health`);
  check(h.status === 200, `${name} /health returned HTTP ${h.status}`);
  const r = await get(origin(name) + CONSUMERS[name], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'noul', instructions: 'فحص تشغيلي بعد تدوير مفتاح الجسر: هل الخدمة تعمل؟', state: 'rotation health check' }) });
  check(!leaks(r.text, tokens), `${name} response exposes a credential or the /mcp path`);
  let data = null; try { data = JSON.parse(r.text); } catch { /* not JSON */ }
  check(r.status === 200 && data && data.ok === true, `${name} public Jev call returned HTTP ${r.status}${data && data.ok === false ? ' (ok:false)' : ''}`);
}

/* ------------------------------------------------------------------------------------------------ steps */

const dir = () => need('STATE_DIR');
const file = (n) => join(dir(), n);
const writeSecretFile = (n, v) => { writeFileSync(file(n), v, { mode: 0o600 }); chmodSync(file(n), 0o600); };
const readState = () => JSON.parse(readFileSync(file('state.json'), 'utf8'));
const writeState = (s) => writeFileSync(file('state.json'), JSON.stringify(s, null, 2));
const mask = (v) => console.log(`::add-mask::${v}`);
const secrets = () => ({ next: readFileSync(file('new-token'), 'utf8'), legacy: readFileSync(file('legacy-token'), 'utf8') });

export const steps = {
  async snapshot() {
    mkdirSync(dir(), { recursive: true, mode: 0o700 });
    const consumers = [];
    for (const name of Object.keys(CONSUMERS)) if (await scriptExists(name)) consumers.push(name); else console.log(`· ${name} is not deployed; skipped`);
    check(await scriptExists(BRIDGE), `${BRIDGE} is not deployed`);
    check(consumers.length, 'no bridge consumer is deployed');
    const rollback = {};
    for (const name of [BRIDGE, ...consumers]) { rollback[name] = await currentVersions(name); console.log(`rollback point ${name}: ${rollback[name].map((v) => `${v.version_id}@${v.percentage}%`).join(' ')}`); }
    writeState({ consumers, rollback, switched: [], mutated: false, finalized: false });
  },

  async prepare() {
    const next = randomBytes(32).toString('base64url');
    mask(next);
    writeSecretFile('new-token', next);
    const res = await cf('GET', `${BRIDGE}/content/v2`, { raw: true });
    check(res.ok, `fetching ${BRIDGE} source failed: HTTP ${res.status}`);
    check(!/multipart/i.test(res.headers.get('content-type') || ''), `${BRIDGE} is a multi-module upload; this tool migrates single-module bridges only`);
    const source = await res.text();
    let out;
    try { out = transformBridgeSource(source); } catch (e) {
      /* a partial match might have seen the old token: mask anything token-shaped before the error is printed */
      for (const m of source.matchAll(/ACCESS_TOKEN\s*=\s*['"`]([^'"`\s]{16,})/g)) mask(m[1]);
      throw e;
    }
    mask(out.legacyToken);
    check(out.legacyToken !== next, 'generated token equals the old one');
    writeSecretFile('legacy-token', out.legacyToken);
    writeSecretFile('bridge-original.mjs', source); /* the explicit rollback path if redeploying the old version fails */
    writeFileSync(file('bridge.mjs'), out.code, { mode: 0o600 });
    const syntax = spawnSync(process.execPath, ['--check', file('bridge.mjs')], { encoding: 'utf8' });
    check(syntax.status === 0, 'the wrapped bridge module does not parse (output suppressed: it may quote source)');
    console.log(`✓ bridge source migrated in memory: hard-coded token removed, wrapper added (${out.code.length} bytes)`);
  },

  async stage() {
    const { next, legacy } = secrets(), s = readState();
    s.mutated = true; writeState(s);
    /* secrets first: the old code ignores them, and the new code finds them the moment it is deployed */
    await putSecret(BRIDGE, 'LEGACY_ACCESS_TOKEN', legacy);
    await putSecret(BRIDGE, 'ACCESS_TOKEN', next);
    await uploadBridge(readFileSync(file('bridge.mjs'), 'utf8'));
    console.log(`✓ ${BRIDGE}: wrapped code deployed; ACCESS_TOKEN and LEGACY_ACCESS_TOKEN set`);
    await retry('bridge /health reports the secret, public pages are clean', async () => {
      const h = await get(`${origin(BRIDGE)}/health`); let d = null; try { d = JSON.parse(h.text); } catch { /* */ }
      check(h.status === 200 && d && d.auth === 'secret' && d.legacy === true, `bridge /health not ready (HTTP ${h.status})`);
      await bridgePublicIsClean([next, legacy]);
    });
    await retry('bridge answers MCP with the new token', async () => check(await mcpToolsList(next), 'new token rejected'));
    await retry('bridge still answers MCP with the old token (switch-over window)', async () => check(await mcpToolsList(legacy), 'old token rejected'));
  },

  async switch() {
    const { next, legacy } = secrets(), s = readState();
    for (const name of s.consumers) {
      s.switched.push(name); writeState(s); /* recorded first: a put that succeeds but errors on the way back still gets rolled back */
      await putSecret(name, 'JEV_BRIDGE_TOKEN', next);
      console.log(`✓ ${name}: JEV_BRIDGE_TOKEN updated`);
      await retry(`${name} answers end to end through the bridge`, () => consumerEndToEnd(name, [next, legacy]), 8);
    }
  },

  async finalize() {
    const { next, legacy } = secrets(), s = readState();
    await deleteSecret(BRIDGE, 'LEGACY_ACCESS_TOKEN');
    s.finalized = true; writeState(s);
    await retry('bridge /health: legacy compatibility removed', async () => {
      const h = await get(`${origin(BRIDGE)}/health`); let d = null; try { d = JSON.parse(h.text); } catch { /* */ }
      check(h.status === 200 && d && d.auth === 'secret' && d.legacy === false, 'bridge still reports legacy compatibility');
    });
    await retry('bridge rejects the old token', async () => check(!(await mcpToolsList(legacy)), 'old token still accepted'));
    await retry('bridge answers MCP with the new token', async () => check(await mcpToolsList(next), 'new token rejected'));
    await bridgePublicIsClean([next, legacy]);
    console.log('✓ bridge public pages are clean');
    for (const name of s.consumers) await retry(`${name} answers end to end`, () => consumerEndToEnd(name, [next, legacy]), 8);
  },

  async rollback() {
    if (!existsSync(file('state.json'))) { console.log('nothing to roll back: no snapshot was taken'); return; }
    const s = readState();
    if (!s.mutated) { console.log('nothing to roll back: production was not changed'); return; }
    const { next, legacy } = secrets();
    const bridgeBack = async () => {
      try {
        await deployVersions(BRIDGE, s.rollback[BRIDGE]);
        console.log(`↩ ${BRIDGE}: snapshot version ${s.rollback[BRIDGE].map((v) => v.version_id).join(', ')} redeployed`);
      } catch (e) {
        console.log(`· redeploying the snapshot version failed (${e instanceof MigrationError ? e.message : e && e.name}); re-uploading the saved original source`);
        await uploadBridge(readFileSync(file('bridge-original.mjs'), 'utf8'));
        console.log(`↩ ${BRIDGE}: original source re-uploaded`);
      }
    };
    const consumersBack = async () => {
      for (const name of s.switched || []) {
        await putSecret(name, 'JEV_BRIDGE_TOKEN', legacy);
        console.log(`↩ ${name}: JEV_BRIDGE_TOKEN written back to its previous value`);
      }
    };
    if (s.finalized) { await bridgeBack(); await consumersBack(); } else { await consumersBack(); await bridgeBack(); }
    await retry('after rollback: the bridge answers MCP with the previous token', async () => check(await mcpToolsList(legacy), 'previous token rejected'));
    for (const name of s.consumers) await retry(`after rollback: ${name} answers end to end`, () => consumerEndToEnd(name, [next, legacy]), 8);
    console.log('rollback verified: the previous token serves the bridge and every consumer again');
    fail('rotation failed and was rolled back (see the failing step above)');
  },
};

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const step = process.argv[2];
  if (!steps[step]) { console.error(`usage: jev-bridge-migrate.mjs <${Object.keys(steps).join('|')}>`); process.exit(2); }
  steps[step]().catch((e) => {
    /* only our own messages are printed; anything else is summarised by type so no body or source can leak */
    console.error(`::error::${e instanceof MigrationError ? e.message : `${step} failed (${e && e.name || 'error'})`}`);
    process.exit(1);
  });
}
