import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { transformBridgeSource, MigrationError } from '../tools/jev-bridge-migrate.mjs';

/* Fake bridges shaped like the real one: a hard-coded token, a root page that advertises /mcp/<token>, and MCP served at
   /mcp/<token>. One uses the bundler's `export { x as default }`, the other a direct `export default`. */
const OLD = 'FAKE-legacy-token-0123456789abcdef', NEW = 'FAKE-new-token-fedcba9876543210XYZ';
const body = (check) => `{
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/about") return new Response("<a href='/mcp/some-other-secret-value'>connect</a>", { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/") return new Response(JSON.stringify({ name: "jev bridge", mcp: \`https://jev.example/mcp/\${ACCESS_TOKEN}\` }), { headers: { "content-type": "application/json" } });
    if (${check} && request.method === "POST") { const b = await request.json(); return Response.json({ jsonrpc: "2.0", id: b.id, result: { tools: [{ name: "jev_noul" }] } }); }
    return new Response("no route for " + url.pathname, { status: 404, headers: { "content-type": "text/plain" } });
  },
  async scheduled() { return "tick"; }
}`;
const BUNDLED = `const ACCESS_TOKEN = "${OLD}";\nvar src_default = ${body('url.pathname === `/mcp/${ACCESS_TOKEN}`')};\nexport { src_default as default };\n`;
const DIRECT = `const ACCESS_TOKEN = '${OLD}';\nexport default ${body('request.headers.get("authorization") === `Bearer ${ACCESS_TOKEN}`')};\n`;

const dir = mkdtempSync(join(tmpdir(), 'jev-bridge-'));
let n = 0;
async function load(source) {
  const { code, legacyToken } = transformBridgeSource(source);
  const f = join(dir, `bridge-${n++}.mjs`);
  writeFileSync(f, code);
  return { mod: (await import(pathToFileURL(f).href)).default, code, legacyToken, file: f };
}
const call = (w, env, path, init) => w.fetch(new Request('https://bridge.test' + path, init), env, {});
const rpc = (extra = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }) });
const clean = (t) => !t.includes(OLD) && !t.includes(NEW) && !/\/mcp\/(?!\[redacted\])/.test(t);

test('the transform removes the hard-coded token, keeps the module valid and hands the old token back', async () => {
  for (const src of [BUNDLED, DIRECT]) {
    const { code, legacyToken, file } = await load(src);
    assert.equal(legacyToken, OLD);
    assert.equal(code.includes(OLD), false);
    assert.match(code, /let ACCESS_TOKEN;/);
    assert.equal(spawnSync(process.execPath, ['--check', file]).status, 0);
  }
});

test('the wrapped bridge serves a token-free /health and fails closed without its secret', async () => {
  const { mod } = await load(BUNDLED);
  let r = await call(mod, { ACCESS_TOKEN: NEW }, '/health');
  const t = await r.text();
  assert.equal(r.status, 200); assert.ok(clean(t));
  assert.deepEqual(JSON.parse(t), { ok: true, service: 'jev-claude-bridge', auth: 'secret', legacy: false });
  r = await call(mod, {}, '/health'); assert.equal(r.status, 503);
  r = await call(mod, {}, `/mcp/${OLD}`, rpc()); assert.equal(r.status, 503, 'the old hard-coded token no longer opens anything');
});

test('public responses never carry a token or the authenticated /mcp path', async () => {
  const { mod } = await load(BUNDLED);
  const env = { ACCESS_TOKEN: NEW, LEGACY_ACCESS_TOKEN: OLD };
  for (const path of ['/', '/about', `/nope/${NEW}`, `/x?${OLD}`]) {
    const t = await (await call(mod, env, path)).text();
    assert.ok(clean(t), `${path} leaked`);
  }
  assert.match(await (await call(mod, env, '/')).text(), /\/mcp\/\[redacted\]/);
});

test('MCP works with the new token; the old token works only while LEGACY_ACCESS_TOKEN is set', async () => {
  for (const [src, via] of [[BUNDLED, (tok) => [`/mcp/${tok}`, rpc()]], [DIRECT, (tok) => [`/mcp/${tok}`, rpc({ authorization: `Bearer ${tok}` })]]]) {
    const { mod } = await load(src);
    const ok = async (env, tok) => { const r = await call(mod, env, ...via(tok)); return r.status === 200 && Array.isArray((await r.json()).result?.tools); };
    assert.equal(await ok({ ACCESS_TOKEN: NEW }, NEW), true, 'new token');
    assert.equal(await ok({ ACCESS_TOKEN: NEW, LEGACY_ACCESS_TOKEN: OLD }, OLD), true, 'old token during the switch-over');
    assert.equal(await ok({ ACCESS_TOKEN: NEW }, OLD), false, 'old token after finalize');
    assert.equal(await ok({ ACCESS_TOKEN: NEW }, 'guess-guess-guess-guess'), false, 'unknown token');
  }
});

test('other handlers of the original module are kept', async () => {
  const { mod } = await load(BUNDLED);
  assert.equal(await mod.scheduled(), 'tick');
});

test('unsafe or unknown shapes are refused, and refusals never quote the token', () => {
  const refuse = (src, re) => assert.throws(() => transformBridgeSource(src), (e) => e instanceof MigrationError && re.test(e.message) && !e.message.includes(OLD));
  refuse('export default {}', /found 0/);
  refuse(BUNDLED + `const ACCESS_TOKEN2 = 1; let ACCESS_TOKEN = "${OLD}x";`, /found 2/);
  refuse(BUNDLED.replace('export { src_default as default };', `const copy = "${OLD}";\nexport { src_default as default };`), /appears 1 more time/);
  refuse(`const ACCESS_TOKEN = "${OLD}";\nexport default class extends Base {}`, /class default export/);
  refuse(`const ACCESS_TOKEN = "${OLD}";\naddEventListener("fetch", e => e.respondWith(new Response("x")));`, /service-worker/);
  refuse(`const ACCESS_TOKEN = "${OLD}";\nconst a = {};`, /one default export, found 0/);
  const once = transformBridgeSource(BUNDLED).code;
  refuse(once, /already migrated/);
});
