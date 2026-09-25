// End-to-end test of Worker -> Durable Object -> container/server.mjs with Baileys and the
// Cloudflare runtime stubbed out. Run: npm test (from whatsapp-bridge/).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'wa-bridge-test-'));
const SENT_LOG = join(tmp, 'sent.log');
const KEY = 'test-key';
const KEY2 = 'second-key';
const PDF = Buffer.from('%PDF-1.4 test');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const sha = (s) => createHash('sha256').update(s).digest('hex');

let container, files, worker, env, instance, waitUntils;

function sent() {
  try { return readFileSync(SENT_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}
function resetSent() { writeFileSync(SENT_LOG, ''); }

// In-memory stand-in for Durable Object storage, including ordered list().
function memoryStorage() {
  const m = new Map();
  return {
    map: m,
    async get(k) {
      return Array.isArray(k) ? new Map(k.filter((x) => m.has(x)).map((x) => [x, structuredClone(m.get(x))])) : structuredClone(m.get(k));
    },
    async put(k, v) {
      if (typeof k === 'string') m.set(k, structuredClone(v));
      else for (const [kk, vv] of Object.entries(k)) m.set(kk, structuredClone(vv));
    },
    async delete(k) {
      let n = 0;
      for (const x of [].concat(k)) if (m.delete(x)) n++;
      return Array.isArray(k) ? n : n > 0;
    },
    async list({ prefix, start, end, reverse, limit } = {}) {
      let keys = [...m.keys()].filter((k) => (!prefix || k.startsWith(prefix)) && (!start || k >= start) && (!end || k < end)).sort();
      if (reverse) keys.reverse();
      if (limit) keys = keys.slice(0, limit);
      return new Map(keys.map((k) => [k, structuredClone(m.get(k))]));
    },
  };
}

async function call(path, { method = 'POST', body, key = KEY, headers = {} } = {}) {
  const req = new Request('https://wa.test' + path, {
    method,
    headers: { ...(key ? { authorization: 'Bearer ' + key } : {}), 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t0 = Date.now();
  const res = await worker.fetch(req, env);
  return { status: res.status, body: await res.json().catch(() => null), ms: Date.now() - t0 };
}
const get = (path, opts = {}) => call(path, { ...opts, method: 'GET' });

before(async () => {
  resetSent();
  files = createServer((req, res) => {
    if (req.url === '/ok.pdf') { res.writeHead(200, { 'content-type': 'application/pdf' }); return res.end(PDF); }
    if (req.url === '/pic.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(PNG); }
    res.writeHead(404); res.end();
  }).listen(0);
  await new Promise((r) => files.once('listening', r));

  container = spawn(process.execPath, ['--import', join(here, 'register.mjs'), join(here, '../container/server.mjs')], {
    env: { ...process.env, SENT_LOG, LOG_LEVEL: 'silent' },
    stdio: 'inherit',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch('http://127.0.0.1:8080/status'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  process.env.CONTAINER_ORIGIN = 'http://127.0.0.1:8080';

  const out = join(tmp, 'worker.mjs');
  await build({
    entryPoints: [join(here, '../src/index.ts')],
    bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'error',
    alias: { '@cloudflare/containers': join(here, 'stub-containers.mjs') },
  });
  globalThis.scheduler = { wait: (ms) => new Promise((r) => setTimeout(r, ms)) };
  const mod = await import(out);
  worker = mod.default;

  waitUntils = [];
  const ctx = { storage: memoryStorage(), waitUntil: (p) => waitUntils.push(p) };
  instance = new mod.WaBridge(ctx, {});
  env = {
    API_KEY_SHA256: `${sha(KEY)}, ${sha(KEY2).toUpperCase()}`,
    WA: { get: () => instance },
    FILES: {
      async get(key) {
        if (key !== 'cv/CV-Arabic.pdf') return null;
        return { size: PDF.length, arrayBuffer: async () => PDF.buffer.slice(PDF.byteOffset, PDF.byteOffset + PDF.length), httpMetadata: {} };
      },
    },
  };
  await call('/config', { body: { maxPerMinute: 1000 } }); // the whole suite runs inside one minute
});

after(async () => {
  await Promise.all(waitUntils.splice(0));
  container?.kill();
  files?.close();
});

const port = () => files.address().port;

test('rejects a missing or wrong key, accepts any configured key', async () => {
  assert.equal((await call('/send', { key: 'nope', body: { to: '201011111111', message: 'x' } })).status, 401);
  assert.equal((await call('/send', { key: null, body: {} })).status, 401);
  assert.equal((await get('/status', { key: KEY2 })).status, 200);
});

test('/send text keeps its response shape and does not wait for the auth save', async () => {
  resetSent();
  await get('/status'); // warm-up: restore + connect
  const r = await call('/send', { body: { to: '01011111111', message: ' hi ' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.sent, true);
  assert.equal(r.body.to, '201011111111@s.whatsapp.net');
  assert.equal(r.body.type, 'text');
  assert.match(r.body.id, /^MSG/);
  assert.ok(r.ms < 1000, `took ${r.ms}ms`);
  assert.deepEqual(sent().map((s) => s.text), ['hi']);
});

test('auth is saved after the reply, in the {version, auth:{creds,keys}} shape', async () => {
  await Promise.all(waitUntils.splice(0));
  const st = instance.ctx.storage.map;
  assert.ok(st.get('auth:chunks') >= 1);
  const saved = JSON.parse(st.get('auth:0'));
  assert.ok(saved.auth.creds.me);
  assert.ok(Object.keys(saved.auth.keys.session).length >= 1);
});

test('the sent log records the text', async () => {
  const r = await get('/log');
  assert.equal(r.body.sent[0].text, 'hi');
  assert.equal(r.body.sent[0].type, 'text');
});

test('/messages returns the inbound reply with sender name and phone, and never duplicates it', async () => {
  const a = await get('/messages?sync=1&wait=0');
  assert.equal(a.status, 200);
  const m = a.body.messages.find((x) => x.text === 'reply to hi');
  assert.ok(m, JSON.stringify(a.body));
  assert.equal(m.name, 'Stub Contact');
  assert.equal(m.phone, '201011111111');
  assert.equal(m.type, 'text');
  const before = a.body.messages.length;
  const b = await get('/messages?sync=1&wait=0');
  assert.equal(b.body.messages.length, before);
  const filtered = await get('/messages?sync=0&from=201011111111');
  assert.ok(filtered.body.messages.every((x) => x.phone === '201011111111'));
});

test('/send with fileUrl sends an image by content type; documentUrl forces a document', async () => {
  resetSent();
  const img = await call('/send', { body: { to: '201011111111', fileUrl: `http://127.0.0.1:${port()}/pic.png`, message: 'look' } });
  assert.equal(img.status, 200);
  assert.equal(img.body.type, 'image');
  const doc = await call('/send', { body: { to: '201011111111', documentUrl: `http://127.0.0.1:${port()}/pic.png` } });
  assert.equal(doc.body.type, 'document');
  assert.deepEqual(sent().map((s) => s.type), ['image', 'document']);
  assert.equal(sent()[0].bytes, PNG.length);
});

test('/send-bundle sends text then the stored CV in one call', async () => {
  resetSent();
  const r = await call('/send-bundle', { body: { to: '201022222222', message: 'السلام عليكم', attachments: ['cv-ar'] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.sent, true);
  assert.equal(r.body.results.length, 2);
  const s = sent();
  assert.deepEqual(s.map((x) => x.type), ['text', 'document']);
  assert.equal(s[1].fileName, 'Mahmoud_ElDesouki_CV_Arabic_2026.pdf');
  assert.equal(s[1].mimetype, 'application/pdf');
  assert.equal(s[1].bytes, PDF.length);
});

test('a missing stored file fails before anything is sent', async () => {
  resetSent();
  const r = await call('/send-bundle', { body: { to: '201022222222', message: 'x', attachments: ['cv-ar', 'cv-en'] } });
  assert.equal(r.status, 424);
  assert.match(r.body.error, /CV-English/);
  assert.equal(sent().length, 0);
});

test('unknown stored name, too many items and a bad download are rejected', async () => {
  resetSent();
  assert.equal((await call('/send-bundle', { body: { to: '201022222222', attachments: ['cv-fr'] } })).status, 400);
  const many = Array.from({ length: 10 }, () => ({ fileUrl: 'http://x/ok.pdf' }));
  assert.equal((await call('/send-bundle', { body: { to: '201022222222', message: 'x', attachments: many } })).status, 400);
  const missing = await call('/send', { body: { to: '201022222222', fileUrl: `http://127.0.0.1:${port()}/nope.pdf` } });
  assert.equal(missing.status, 424);
  assert.equal(sent().length, 0);
});

test('the same idempotency key never sends twice', async () => {
  resetSent();
  const body = { to: '201033333333', message: 'once', attachments: ['cv-ar'], idempotencyKey: 'job-1' };
  const a = await call('/send-bundle', { body });
  const b = await call('/send-bundle', { body });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(b.body.duplicate, true);
  assert.equal(sent().length, 2);
  const job = await get('/jobs/job-1');
  assert.equal(job.body.state, 'done');
  assert.equal(job.body.total, 2);
});

test('Idempotency-Key header works for /send', async () => {
  resetSent();
  const opts = { body: { to: '201033333333', message: 'hdr' }, headers: { 'idempotency-key': 'hdr-1' } };
  await call('/send', opts);
  const again = await call('/send', opts);
  assert.equal(again.body.duplicate, true);
  assert.equal(sent().length, 1);
});

test('a retry after a partial failure sends only what is missing', async () => {
  resetSent();
  const body = {
    to: '201044444444', message: 'partial', idempotencyKey: 'job-2',
    attachments: [
      { fileUrl: `http://127.0.0.1:${port()}/ok.pdf`, filename: 'a.pdf' },
      { fileUrl: `http://127.0.0.1:${port()}/ok.pdf`, filename: 'fail.pdf' },
    ],
  };
  const first = await call('/send-bundle', { body });
  assert.equal(first.status, 502);
  assert.equal(first.body.sent, false);
  assert.deepEqual(first.body.results.map((r) => r.ok), [true, true, false]);
  assert.equal((await get('/jobs/job-2')).body.state, 'partial');
  assert.equal(sent().length, 2);

  resetSent();
  body.attachments[1].filename = 'b.pdf';
  const retry = await call('/send-bundle', { body });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.resumed, true);
  assert.deepEqual(sent().map((s) => s.fileName), ['b.pdf']);
});

test('/send-media accepts a stored file and reports its filename', async () => {
  resetSent();
  const r = await call('/send-media', { body: { to: '201055555555', stored: 'cv-ar' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.filename, 'Mahmoud_ElDesouki_CV_Arabic_2026.pdf');
  assert.equal((await call('/send-media', { body: { to: '201055555555', message: 'no file' } })).status, 400);
});

test('a number not on WhatsApp is a 404 and nothing is sent', async () => {
  resetSent();
  const r = await call('/send', { body: { to: '999123456789', message: 'x' } });
  assert.equal(r.status, 404);
  assert.match(r.body.error, /not on WhatsApp/);
  assert.equal(sent().length, 0);
});

test('/check, /groups and /contacts pass through', async () => {
  assert.equal((await get('/check?to=201011111111')).body.exists, true);
  assert.equal((await get('/check?to=999111111111')).body.exists, false);
  const g = await get('/groups');
  assert.deepEqual(g.body.groups, [{ id: 'g1@g.us', name: 'Test Group', participants: 3 }]);
  const c = await get('/contacts');
  assert.ok(c.body.contacts.some((x) => x.phone === '201011111111' && x.name === 'Stub Contact'));
});

test('the per-minute limit returns 429 and sends nothing', async () => {
  resetSent();
  await call('/config', { body: { maxPerMinute: 0 } });
  const r = await call('/send', { body: { to: '201011111111', message: 'x' } });
  assert.equal(r.status, 429);
  assert.equal(sent().length, 0);
  await call('/config', { body: { maxPerMinute: 1000, webhookUrl: null } });
  assert.deepEqual((await get('/config')).body, { maxPerMinute: 1000 });
  assert.equal((await call('/config', { body: { webhookUrl: 'http://insecure' } })).status, 400);
});

test('scheduling stores, lists, cancels and delivers through the same send path', async () => {
  resetSent();
  const at = new Date(Date.now() + 3600_000).toISOString();
  const a = await call('/schedule', { body: { to: '201011111111', message: 'later', at } });
  assert.equal(a.status, 201);
  const b = await call('/schedule', { body: { to: '201011111111', message: 'cancel me', at } });
  assert.equal((await get('/schedule')).body.scheduled.length, 2);
  assert.equal((await call('/schedule/' + b.body.id, { method: 'DELETE' })).body.cancelled, true);
  assert.equal((await get('/schedule')).body.scheduled.length, 1);
  assert.equal((await call('/schedule', { body: { to: '2010', message: 'x', at: '2000-01-01T00:00:00Z' } })).status, 400);
  await instance.sendScheduled({ to: '201011111111', message: 'later' }, { taskId: a.body.id });
  assert.deepEqual(sent().map((s) => s.text), ['later']);
  assert.equal((await get('/schedule')).body.scheduled.length, 0);
  await instance.sendScheduled({ to: '201011111111', message: 'later' }, { taskId: a.body.id }); // already done: no resend
  assert.equal(sent().length, 1);
});

test('/pair/code refuses while linked, then returns a code after logout', async () => {
  assert.equal((await call('/pair/code', { body: { phone: '12' } })).status, 400);
  assert.equal((await call('/pair/code', { body: { phone: '201012345678' } })).status, 409);
  assert.equal((await call('/logout')).status, 200);
  const r = await call('/pair/code', { body: { phone: '+20 101 234 5678' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.code, 'CODE5678');
  await get('/status'); // the stub links again right away
});

test('pages and OpenAPI are served', async () => {
  const pair = await worker.fetch(new Request('https://wa.test/pair?key=' + KEY), env);
  assert.equal(pair.status, 200);
  assert.match(await pair.text(), /اطلب كود الربط/);
  const dash = await worker.fetch(new Request('https://wa.test/dashboard?key=' + KEY), env);
  assert.equal(dash.status, 200);
  const spec = await (await worker.fetch(new Request('https://wa.test/openapi.json'), env)).json();
  assert.ok(spec.paths['/send-bundle'] && spec.paths['/messages'] && spec.paths['/schedule']);
});

// ---- MCP worker, wired to the bridge above ----
test('MCP tools send a bundle, read messages and report status', async () => {
  const mcp = (await import(join(here, '../workers/mcp/index.js'))).default;
  const menv = { BRIDGE: { fetch: (req) => worker.fetch(req, env) } };
  const rpcCall = async (method, params) => (await (await mcp.fetch(new Request('https://m.test/mcp', {
    method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }), menv)).json()).result;

  const tools = await rpcCall('tools/list');
  for (const name of ['send_whatsapp_bundle', 'send_whatsapp_message', 'list_whatsapp_messages', 'list_whatsapp_groups']) {
    assert.ok(tools.tools.some((t) => t.name === name), name);
  }
  resetSent();
  const args = { key: KEY, to: '201088888888', message: 'mcp', attachments: [{ stored: 'cv-ar' }], idempotencyKey: 'mcp-1' };
  const res = await rpcCall('tools/call', { name: 'send_whatsapp_bundle', arguments: args });
  assert.equal(res.isError, undefined);
  assert.equal(res.content[0].text, 'sent 2 item(s)');
  const again = await rpcCall('tools/call', { name: 'send_whatsapp_bundle', arguments: args });
  assert.match(again.content[0].text, /already sent/);
  assert.equal(sent().length, 2);
  const inbox = await rpcCall('tools/call', { name: 'list_whatsapp_messages', arguments: { key: KEY, from: '201088888888', sync: true } });
  assert.match(inbox.content[0].text, /reply to mcp/);
  const bad = await rpcCall('tools/call', { name: 'send_whatsapp_message', arguments: { key: 'wrong', to: '201088888888', message: 'x' } });
  assert.equal(bad.isError, true);
});
