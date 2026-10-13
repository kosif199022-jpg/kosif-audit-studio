/* A simulated Cloudflare account for the Jev bridge rotation tests. The real tool (tools/jev-bridge-migrate.mjs) runs
   against it, and the simulated bridge runs the real modules (the original, and the one the tool wraps), so every check
   the tool makes is answered by real code.
   Secrets are simulated the way the Cloudflare docs leave room for: every secret change makes a new version of the
   deployed code; a rollback is refused when secrets changed unless forced; and a forced rollback may keep the CURRENT
   secrets (worst case, the default here) or restore the old ones. Rollback must work in both. */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
process.env.CLOUDFLARE_API_TOKEN = 'cf-api-token-for-tests';
process.env.WORKERS_SUBDOMAIN = 'sim';
process.env.JEV_RETRY_MS = '1';
export const { steps, BRIDGE, CONSUMERS } = await import('../../tools/jev-bridge-migrate.mjs');

export const OLD = 'FAKE-legacy-token-0123456789abcdef';
export const ORIGINAL = `const ACCESS_TOKEN = "${OLD}";
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
export const API = 'aghnam-jev-api';

const modDir = mkdtempSync(join(tmpdir(), 'jev-sim-mod-'));
const modules = new Map();
async function moduleFor(code) {
  const key = createHash('sha256').update(code).digest('hex').slice(0, 16);
  if (!modules.has(key)) { const f = join(modDir, `w-${key}.mjs`); writeFileSync(f, code); modules.set(key, (await import(pathToFileURL(f).href)).default); }
  return modules.get(key);
}

/* opts:
     consumers                 deployed consumers (default: aghnam-jev-api only)
     rollbackRestoresSecrets   a forced version rollback restores that version's secrets (default: keeps the current ones)
     secretOpsUseLatestUpload  a secret change releases a new version of the most recent upload, even after a rollback
     deploymentsFail           the deployments API refuses every version rollback
     consumerBroken(state)     a consumer answers 502 while this returns true
     fault(write)              called before every production write; 'refuse' fails it without applying it, 'applied'
                               applies it and then answers with an error (the change happened, the caller sees a failure)
   Every production write is recorded in sim.writes, with the step that made it. After each write that took effect,
   every consumer is called end to end and the result is recorded in sim.samples. */
export function simulate(opts = {}) {
  const consumers = opts.consumers || [API];
  const scripts = { [BRIDGE]: { n: 1, deployed: 'b1', versions: { b1: { code: ORIGINAL, secrets: {} } } } };
  for (const name of consumers) scripts[name] = { n: 1, deployed: name[0] + '1', versions: { [name[0] + '1']: { secrets: { JEV_BRIDGE_TOKEN: OLD, SESSION_SECRET: 's' } } } };
  const sim = { scripts, consumers, writes: [], samples: [], step: null, phase: 'forward' };
  const cur = (name) => scripts[name].versions[scripts[name].deployed];
  sim.cur = cur;
  /* a secret change makes a new version of the deployed code, or (harsher, opts.secretOpsUseLatestUpload) of the most
     recent upload even after a rollback */
  const secretBase = (name) => (opts.secretOpsUseLatestUpload && scripts[name].lastUpload ? { ...cur(name), code: scripts[name].lastUpload } : cur(name));
  const release = (name, v) => { const s = scripts[name]; const id = name[0] + (++s.n); s.versions[id] = v; s.deployed = id; return id; };
  const ok = (result = {}) => Response.json({ success: true, errors: [], result });
  const err = (status, code) => Response.json({ success: false, errors: [{ code, message: 'simulated' }] }, { status });

  async function bridge(req) { const v = cur(BRIDGE); return (await moduleFor(v.code)).fetch(req, { ...v.secrets }, {}); }
  async function consumer(name, req) {
    const url = new URL(req.url), v = cur(name);
    if (url.pathname === '/health') return Response.json({ ok: true });
    if (url.pathname !== CONSUMERS[name] || req.method !== 'POST') return Response.json({ ok: false }, { status: 404 });
    if (opts.consumerBroken && opts.consumerBroken({ name, secrets: v.secrets, bridge: cur(BRIDGE) })) return Response.json({ ok: false, error: 'simulated outage' }, { status: 502 });
    const r = await bridge(new Request('https://jev.internal/mcp/' + v.secrets.JEV_BRIDGE_TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/call"}' }));
    const d = r.status === 200 ? await r.json() : null;
    return d && d.result ? Response.json({ ok: true, result: {} }) : Response.json({ ok: false, error: 'تعذر الاتصال بـ Jev' }, { status: 400 });
  }
  const answers = async (name) => (await (await consumer(name, new Request(`https://${name}.sim.workers.dev${CONSUMERS[name]}`, { method: 'POST', body: '{}' }))).json()).ok === true;

  /* a production write: recorded, possibly failed by opts.fault, and followed by an availability sample */
  async function write(info, apply) {
    const w = { ...info, n: sim.writes.length, step: sim.step, phase: sim.phase };
    sim.writes.push(w);
    const f = opts.fault && opts.fault(w);
    w.fault = f || null;
    if (f === 'refuse') return err(503, 10013);
    const res = await apply();
    if (res.ok) {
      const sample = { write: w, answers: {} };
      for (const name of consumers) sample.answers[name] = await answers(name);
      sim.samples.push(sample);
    }
    return f === 'applied' ? err(502, 10013) : res;
  }

  async function cloudflare(url, init) {
    const m = url.pathname.match(/^\/client\/v4\/accounts\/acct\/workers\/scripts\/([^/]+)(?:\/(.*))?$/);
    if (!m) return err(404, 7003);
    const [, name, sub = ''] = m, method = init.method || 'GET', s = scripts[name];
    if (!s) return err(404, 10007);
    if (method === 'GET' && sub === 'settings') return ok({ bindings: Object.keys(cur(name).secrets).map((k) => ({ type: 'secret_text', name: k })).concat([{ type: 'service', name: 'X' }]), compatibility_date: '2026-09-01' });
    if (method === 'GET' && sub === 'deployments') return ok({ deployments: [{ id: 'd', versions: [{ version_id: s.deployed, percentage: 100 }] }] });
    if (method === 'GET' && sub === 'content/v2') return new Response(cur(name).code, { headers: { 'content-type': 'application/javascript' } });
    if (method === 'PUT' && sub === 'secrets') {
      const b = JSON.parse(init.body);
      return write({ name, method, sub, key: b.name }, async () => { release(name, { ...secretBase(name), secrets: { ...cur(name).secrets, [b.name]: b.text } }); return ok({}); });
    }
    if (method === 'DELETE' && sub.startsWith('secrets/')) {
      const k = sub.slice(8);
      return write({ name, method, sub, key: k }, async () => {
        const sec = { ...cur(name).secrets };
        if (!(k in sec)) return err(404, 10056);
        delete sec[k]; release(name, { ...secretBase(name), secrets: sec }); return ok(null);
      });
    }
    if (method === 'PUT' && sub === '') {
      const meta = JSON.parse(await init.body.get('metadata').text());
      const present = new Set(['service', ...(Object.keys(cur(name).secrets).length ? ['secret_text'] : [])]);
      assert.ok([...present].every((t) => meta.keep_bindings.includes(t)), 'upload keeps the existing secrets and bindings');
      const code = await init.body.get('worker.js').text();
      return write({ name, method, sub: 'script', key: code === ORIGINAL ? 'original' : 'wrapped' }, async () => { s.lastUpload = code; release(name, { ...cur(name), code }); return ok({}); });
    }
    if (method === 'POST' && sub === 'deployments') {
      const vid = JSON.parse(init.body).versions[0].version_id;
      return write({ name, method, sub, key: vid }, async () => {
        if (opts.deploymentsFail) return err(500, 10013);
        const target = s.versions[vid];
        const changed = JSON.stringify(target.secrets) !== JSON.stringify(cur(name).secrets);
        if (changed && url.searchParams.get('force') !== 'true') return err(400, 10220); /* "The following secrets have changed" */
        if (opts.rollbackRestoresSecrets) s.deployed = vid;
        else release(name, { ...target, secrets: { ...cur(name).secrets } }); /* worst case: code rolls back, secrets do not */
        return ok({});
      });
    }
    return err(405, 10000);
  }

  sim.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname === 'api.cloudflare.com') return cloudflare(url, init);
    const req = new Request(url, init);
    if (url.hostname === `${BRIDGE}.sim.workers.dev`) return bridge(req);
    const name = consumers.find((c) => url.hostname === `${c}.sim.workers.dev`);
    if (name) return consumer(name, req);
    throw new TypeError('fetch failed');
  };
  sim.answers = answers;
  return sim;
}

/* The workflow's order: the forward steps until one fails, then rollback. */
export async function run(sim) {
  const stateDir = mkdtempSync(join(tmpdir(), 'jev-sim-state-'));
  process.env.STATE_DIR = stateDir;
  const out = [], log = console.log, error = console.error, realFetch = globalThis.fetch;
  console.log = (...a) => out.push(a.join(' ')); console.error = (...a) => out.push(a.join(' '));
  globalThis.fetch = sim.fetch;
  let failed = null, rollbackError = null;
  try {
    for (const step of ['snapshot', 'prepare', 'stage', 'switch', 'finalize']) {
      sim.step = step;
      try { await steps[step](); } catch (e) { failed = step; out.push(`FAILED ${step}: ${e.message}`); break; }
    }
    if (failed) { sim.step = 'rollback'; sim.phase = 'rollback'; try { await steps.rollback(); } catch (e) { rollbackError = e.message; } }
  } finally {
    console.log = log; console.error = error; globalThis.fetch = realFetch;
  }
  const masks = out.filter((l) => l.startsWith('::add-mask::')).map((l) => l.slice(12));
  const newToken = masks.find((v) => v !== OLD);
  rmSync(stateDir, { recursive: true, force: true });
  return { out, failed, rollbackError, newToken, masks };
}

export const probe = async (sim, token) => (await sim.fetch(`https://${BRIDGE}.sim.workers.dev/mcp/${token}`, { method: 'POST', body: '{}' })).status === 200;
export const e2e = (sim, name = API) => sim.answers(name);
export const noTokenInLogs = (r) => r.out.every((l) => l.startsWith('::add-mask::') || (!l.includes(OLD) && !(r.newToken && l.includes(r.newToken))));
