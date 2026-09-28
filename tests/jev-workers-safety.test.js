import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* The public Jev workers call the bridge at a URL that embeds its access token. A failure that echoes that URL must
   never reach the caller: every error body is scrubbed of the token and of any /mcp/<…> path. */
const FAKE = 'FAKE-BRIDGE-TOKEN-7f3c9a1e5b2d4c6e8a0f';
const store = new Map();
globalThis.caches ??= { default: { match: async (r) => store.get(r.url), put: async (r, v) => { store.set(r.url, v); } } };
const failingBridge = { fetch: async (req) => { throw new Error('upstream failed for ' + req.url); } };
const env = { JEV_BRIDGE_TOKEN: FAKE, JEV_BRIDGE: failingBridge };
const post = (path, body) => new Request('https://jev.test' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

for (const [name, path, route] of [['public-jev', '../public-jev/worker.js', '/api/decide'], ['jev-public', '../jev-public/worker.js', null]]) {
  test(`${name}: a failing bridge never echoes the credential or its path`, async () => {
    const mod = await import(path), worker = mod.default;
    const routes = route ? [route] : ['/api/decide', '/api/public-jev', '/api'];
    let checked = 0;
    for (const r of routes) {
      const res = await worker.fetch(post(r, { type: 'noul', instructions: 'هل نعتمد المورد؟', state: 'x' }), env);
      const text = await res.text();
      assert.equal(text.includes(FAKE), false, `${name} ${r} leaked the token`);
      assert.equal(/\/mcp\/(?!\[redacted\])/.test(text), false, `${name} ${r} leaked the /mcp path`);
      checked++;
    }
    assert.ok(checked > 0);
  });
  test(`${name}: safeError removes the token and any /mcp path`, async () => {
    const { safeError } = await import(path);
    const out = safeError(env, new Error(`fetch https://jev.internal/mcp/${FAKE} failed; token ${FAKE}`));
    assert.equal(out.includes(FAKE), false);
    assert.match(out, /\/mcp\/\[redacted\]/);
  });
}


test('automatic deploy workflows preserve SESSION_SECRET instead of rotating it', () => {
  for (const rel of ['.github/workflows/S.kosif-cloudflare.yml', '.github/workflows/deploy-aghnam.yml']) {
    const yml = readFileSync(resolve(ROOT, rel), 'utf8');
    assert.doesNotMatch(yml, /openssl rand -hex 32/, `${rel} must not generate a session secret during deploy`);
    assert.doesNotMatch(yml, /secret put SESSION_SECRET/, `${rel} must not overwrite SESSION_SECRET during deploy`);
    assert.match(yml, /wrangler deploy --config wrangler\.jev\.toml --keep-vars/, `${rel} must preserve existing Worker state`);
    assert.match(yml, /secret list --name aghnam-jev-api[\s\S]*SESSION_SECRET/, `${rel} must fail closed when SESSION_SECRET is missing`);
    assert.match(yml, /secret list --name aghnam-jev-api[\s\S]*JEV_BRIDGE_TOKEN/, `${rel} must fail closed when JEV_BRIDGE_TOKEN is missing`);
  }
});
