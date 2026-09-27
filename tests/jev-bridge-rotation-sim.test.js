import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

/* The whole rotation — snapshot, prepare, stage, switch, finalize and, on failure, rollback — run by the real tool
   against a simulated Cloudflare account. The simulated bridge runs the real modules (the original, and the one the
   tool wraps), so every check the tool makes is answered by real code.
   Secrets are simulated the way the Cloudflare docs leave room for: every secret change makes a new version of the
   deployed code; a rollback is refused when secrets changed unless forced; and a forced rollback may keep the CURRENT
   secrets (worst case, the default here) or restore the old ones. Rollback must work in both. */

process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
process.env.CLOUDFLARE_API_TOKEN = 'cf-api-token-for-tests';
process.env.WORKERS_SUBDOMAIN = 'sim';
process.env.JEV_RETRY_MS = '1';
const { steps, BRIDGE } = await import('../tools/jev-bridge-migrate.mjs');

const OLD = 'FAKE-legacy-token-0123456789abcdef';
const ORIGINAL = `const ACCESS_TOKEN = "${OLD}";
var src_default = {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/") return new Response(JSON.stringify({ name: "jev bridge", mcp: "/mcp/" + ACCESS_TOKEN }), { headers: { "content-type": "application/json" } });
    if (url.pathname === "/mcp/" + ACCESS_TOKEN && request.method === "POST") return Response.json({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "jev_noul" }], content: [{ type: "text", text: "{}" }] } });
    return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  }
};
export { src_default as default };
`;
const API = 'aghnam-jev-api';

const modDir = mkdtempSync(join(tmpdir(), 'jev-sim-mod-'));
const modules = new Map();
async function moduleFor(code) {
  const key = createHash('sha256').update(code).digest('hex').slice(0, 16);
  if (!modules.has(key)) { const f = join(modDir, `w-${key}.mjs`); writeFileSync(f, code); modules.set(key, (await import(pathToFileURL(f).href)).default); }
  return modules.get(key);
}

function simulate(opts = {}) {
  const scripts = {
    [BRIDGE]: { n: 1, deployed: 'b1', versions: { b1: { code: ORIGINAL, secrets: {} } } },
    [API]: { n: 1, deployed: 'a1', versions: { a1: { secrets: { JEV_BRIDGE_TOKEN: OLD, SESSION_SECRET: 's' } } } },
  };
  const cur = (name) => scripts[name].versions[scripts[name].deployed];
  const release = (name, v) => { const s = scripts[name]; const id = name[0] + (++s.n); s.versions[id] = v; s.deployed = id; return id; };
  const ok = (result = {}) => Response.json({ success: true, errors: [], result });
  const err = (status, code) => Response.json({ success: false, errors: [{ code, message: 'simulated' }] }, { status });

  async function bridge(req) { const v = cur(BRIDGE); return (await moduleFor(v.code)).fetch(req, { ...v.secrets }, {}); }
  async function consumer(req) {
    const url = new URL(req.url), v = cur(API);
    if (url.pathname === '/health') return Response.json({ ok: true });
    if (url.pathname !== '/api/public-jev' || req.method !== 'POST') return Response.json({ ok: false }, { status: 404 });
    if (opts.consumerBroken && opts.consumerBroken({ secrets: v.secrets, bridge: cur(BRIDGE) })) return Response.json({ ok: false, error: 'simulated outage' }, { status: 502 });
    const r = await bridge(new Request('https://jev.internal/mcp/' + v.secrets.JEV_BRIDGE_TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/call"}' }));
    const d = r.status === 200 ? await r.json() : null;
    return d && d.result ? Response.json({ ok: true, result: {} }) : Response.json({ ok: false, error: 'تعذر الاتصال بـ Jev' }, { status: 400 });
  }

  async function cloudflare(url, init) {
    const m = url.pathname.match(/^\/client\/v4\/accounts\/acct\/workers\/scripts\/([^/]+)(?:\/(.*))?$/);
    if (!m) return err(404, 7003);
    const [, name, sub = ''] = m, method = init.method || 'GET', s = scripts[name];
    if (!s) return err(404, 10007);
    if (method === 'GET' && sub === 'settings') return ok({ bindings: Object.keys(cur(name).secrets).map((k) => ({ type: 'secret_text', name: k })).concat([{ type: 'service', name: 'X' }]), compatibility_date: '2026-09-01' });
    if (method === 'GET' && sub === 'deployments') return ok({ deployments: [{ id: 'd', versions: [{ version_id: s.deployed, percentage: 100 }] }] });
    if (method === 'GET' && sub === 'content/v2') return new Response(cur(name).code, { headers: { 'content-type': 'application/javascript' } });
    if (method === 'PUT' && sub === 'secrets') { const b = JSON.parse(init.body); release(name, { ...cur(name), secrets: { ...cur(name).secrets, [b.name]: b.text } }); return ok({}); }
    if (method === 'DELETE' && sub.startsWith('secrets/')) { const k = sub.slice(8), sec = { ...cur(name).secrets }; delete sec[k]; release(name, { ...cur(name), secrets: sec }); return ok(null); }
    if (method === 'PUT' && sub === '') {
      const meta = JSON.parse(await init.body.get('metadata').text());
      assert.ok(meta.keep_bindings.includes('secret_text') && meta.keep_bindings.includes('service'), 'upload keeps the existing secrets and bindings');
      release(name, { ...cur(name), code: await init.body.get('worker.js').text() }); return ok({});
    }
    if (method === 'POST' && sub === 'deployments') {
      if (opts.deploymentsFail) return err(500, 10013);
      const target = s.versions[JSON.parse(init.body).versions[0].version_id];
      const changed = JSON.stringify(target.secrets) !== JSON.stringify(cur(name).secrets);
      if (changed && url.searchParams.get('force') !== 'true') return err(400, 10220); /* "The following secrets have changed" */
      if (opts.rollbackRestoresSecrets) s.deployed = JSON.parse(init.body).versions[0].version_id;
      else release(name, { ...target, secrets: { ...cur(name).secrets } }); /* worst case: code rolls back, secrets do not */
      return ok({});
    }
    return err(405, 10000);
  }

  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname === 'api.cloudflare.com') return cloudflare(url, init);
    const req = new Request(url, init);
    if (url.hostname === `${BRIDGE}.sim.workers.dev`) return bridge(req);
    if (url.hostname === `${API}.sim.workers.dev`) return consumer(req);
    throw new TypeError('fetch failed');
  };
  return { scripts, cur, fetch };
}

async function run(sim) {
  const stateDir = mkdtempSync(join(tmpdir(), 'jev-sim-state-'));
  process.env.STATE_DIR = stateDir;
  const out = [], log = console.log, error = console.error, realFetch = globalThis.fetch;
  console.log = (...a) => out.push(a.join(' ')); console.error = (...a) => out.push(a.join(' '));
  globalThis.fetch = sim.fetch;
  let failed = null, rollbackError = null;
  try {
    for (const step of ['snapshot', 'prepare', 'stage', 'switch', 'finalize']) {
      try { await steps[step](); } catch (e) { failed = step; out.push(`FAILED ${step}: ${e.message}`); break; }
    }
    if (failed) { try { await steps.rollback(); } catch (e) { rollbackError = e.message; } }
  } finally {
    console.log = log; console.error = error; globalThis.fetch = realFetch;
  }
  const masks = out.filter((l) => l.startsWith('::add-mask::')).map((l) => l.slice(12));
  const newToken = masks.find((v) => v !== OLD);
  rmSync(stateDir, { recursive: true, force: true });
  return { out, failed, rollbackError, newToken, masks };
}
const probe = async (sim, token) => (await sim.fetch(`https://${BRIDGE}.sim.workers.dev/mcp/${token}`, { method: 'POST', body: '{}' })).status === 200;
const e2e = async (sim) => (await (await sim.fetch(`https://${API}.sim.workers.dev/api/public-jev`, { method: 'POST', body: '{}' })).json()).ok === true;
const noTokenInLogs = (r) => r.out.every((l) => l.startsWith('::add-mask::') || (!l.includes(OLD) && !(r.newToken && l.includes(r.newToken))));

test('happy path: bridge on the secret, consumers on the same new token, old token dead, nothing printed', async () => {
  const sim = simulate(); const r = await run(sim);
  assert.equal(r.failed, null, r.out.join('\n'));
  const b = sim.cur(BRIDGE);
  assert.ok(!b.code.includes(OLD) && /jev-bridge-migrate: wrapped/.test(b.code));
  assert.equal(b.secrets.ACCESS_TOKEN, r.newToken); assert.equal('LEGACY_ACCESS_TOKEN' in b.secrets, false);
  assert.equal(sim.cur(API).secrets.JEV_BRIDGE_TOKEN, r.newToken, 'consumer uses the same token');
  assert.equal(await probe(sim, OLD), false); assert.equal(await probe(sim, r.newToken), true); assert.equal(await e2e(sim), true);
  const root = await (await sim.fetch(`https://${BRIDGE}.sim.workers.dev/`)).text();
  assert.ok(!root.includes(r.newToken) && !root.includes(OLD) && !/\/mcp\/(?!\[redacted\])/.test(root));
  assert.ok(r.masks.includes(OLD) && r.masks.includes(r.newToken), 'both values are masked');
  assert.ok(noTokenInLogs(r), 'no token outside ::add-mask:: lines');
});

for (const restores of [false, true]) {
  const how = restores ? 'rollback restores secrets' : 'rollback keeps current secrets (worst case)';
  test(`switch fails → explicit rollback; ${how}`, async () => {
    const sim = simulate({ rollbackRestoresSecrets: restores, consumerBroken: ({ secrets }) => secrets.JEV_BRIDGE_TOKEN !== OLD });
    const r = await run(sim);
    assert.equal(r.failed, 'switch');
    assert.match(r.rollbackError, /rolled back/);
    assert.ok(r.out.some((l) => l.includes('rollback verified')), r.out.join('\n'));
    assert.equal(sim.cur(BRIDGE).code, ORIGINAL, 'bridge runs its original code again');
    assert.equal(sim.cur(API).secrets.JEV_BRIDGE_TOKEN, OLD, 'consumer token written back explicitly');
    assert.equal(await probe(sim, OLD), true); assert.equal(await e2e(sim), true);
    assert.ok(noTokenInLogs(r));
  });
  test(`finalize fails → bridge back first, then consumers; ${how}`, async () => {
    const sim = simulate({ rollbackRestoresSecrets: restores, consumerBroken: ({ bridge }) => /jev-bridge-migrate/.test(bridge.code || '') && !('LEGACY_ACCESS_TOKEN' in bridge.secrets) });
    const r = await run(sim);
    assert.equal(r.failed, 'finalize');
    assert.ok(r.out.some((l) => l.includes('rollback verified')), r.out.join('\n'));
    const order = r.out.filter((l) => l.startsWith('↩')).map((l) => l.split(':')[0]);
    assert.deepEqual(order, [`↩ ${BRIDGE}`, `↩ ${API}`]);
    assert.equal(sim.cur(BRIDGE).code, ORIGINAL); assert.equal(sim.cur(API).secrets.JEV_BRIDGE_TOKEN, OLD);
    assert.equal(await probe(sim, OLD), true); assert.equal(await e2e(sim), true);
    assert.ok(noTokenInLogs(r));
  });
}

test('the deployments API refusing the rollback falls back to re-uploading the original source', async () => {
  const sim = simulate({ deploymentsFail: true, consumerBroken: ({ secrets }) => secrets.JEV_BRIDGE_TOKEN !== OLD });
  const r = await run(sim);
  assert.equal(r.failed, 'switch');
  assert.ok(r.out.some((l) => l.includes('original source re-uploaded')), r.out.join('\n'));
  assert.equal(sim.cur(BRIDGE).code, ORIGINAL); assert.equal(await e2e(sim), true);
  assert.ok(noTokenInLogs(r));
});

test('a failure before production changes rolls nothing back', async () => {
  const sim = simulate();
  sim.scripts[BRIDGE].versions.b1.code = 'export default {}'; /* no hard-coded token: prepare refuses */
  const r = await run(sim);
  assert.equal(r.failed, 'prepare');
  assert.ok(r.out.some((l) => l.includes('production was not changed')));
  assert.equal(sim.scripts[BRIDGE].deployed, 'b1'); assert.equal(sim.scripts[API].deployed, 'a1');
});
