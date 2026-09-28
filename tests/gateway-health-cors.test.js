import test from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../cloudflare/gateway-worker.js';

/* The canonical S-KOSIF app reads the gateway's /health from another origin. The live worker answered it without CORS
   and without an OPTIONS preflight, and its single ALLOWED_ORIGIN pointed at the old studio origin. */
const CANONICAL = 'https://s-kosif.pages.dev', OLD = 'https://kosif-audit-studio.pages.dev';
const live = { ALLOWED_ORIGIN: OLD, PERSISTENCE_ALLOWED_ORIGIN: `${CANONICAL},${OLD}` };
const call = (method, origin, env = live) => gateway.fetch(new Request('https://gw.test/health', { method, headers: origin ? { Origin: origin, 'Access-Control-Request-Method': 'GET' } : {} }), env, {});

test('GET /health from the canonical origin is readable cross-origin, even with an old single ALLOWED_ORIGIN', async () => {
  const r = await call('GET', CANONICAL);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), CANONICAL);
  assert.match(r.headers.get('Vary') || '', /Origin/);
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.ok(body.engagementPersistence, 'the gateway health fields are still there');
});

test('OPTIONS /health preflight answers 204 with CORS for the canonical origin', async () => {
  const r = await call('OPTIONS', CANONICAL);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), CANONICAL);
  assert.match(r.headers.get('Access-Control-Allow-Methods') || '', /GET/);
});

test('an unlisted origin is not granted CORS', async () => {
  for (const method of ['GET', 'OPTIONS']) {
    const r = await call(method, 'https://evil.example');
    assert.notEqual(r.headers.get('Access-Control-Allow-Origin'), 'https://evil.example');
  }
});

test('the configured wildcard and requests without an Origin keep working', async () => {
  const r = await call('GET', CANONICAL, { ALLOWED_ORIGIN: '*' });
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  const n = await call('GET', null);
  assert.equal(n.status, 200);
});
