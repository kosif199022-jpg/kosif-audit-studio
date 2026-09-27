import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/* public-jev/kosif-jev-worker.js is the production source of the kosif-jev Worker: the page (PAGE), its browser script
   (APP_JS) and the Worker routes. Image understanding goes ChatGPT Web via TinyFish first, then Cloudflare vision
   (LLaVA + toMarkdown), and PDFs are extracted. The file reached main cut off inside APP_JS, with a
   " --- TRUNCATED --- N chars" marker pasted in, so it did not parse. These tests keep it whole and working. */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = 'public-jev/kosif-jev-worker.js';
/* loaded on first use, so the syntax and marker tests still report clearly when the module cannot load */
let loaded;
const load = async () => (loaded ||= (await import(new URL('../' + FILE, import.meta.url))).default);
const call = async (path, init, env = {}) => (await load()).fetch(new Request('https://kosif-jev.test' + path, init), env);
const get = (path, env) => call(path, undefined, env);

test('the worker is valid JavaScript (node --check) with one complete entry point', async () => {
  const r = spawnSync(process.execPath, ['--check', FILE], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr.split('\n').filter((l) => /Error/.test(l)).join('\n'));
  const source = readFileSync(ROOT + FILE, 'utf8');
  assert.equal(source.match(/^export default \{async fetch\(request,env\)\{/gm)?.length, 1);
  assert.ok(source.endsWith("return json({ok:false,error:'Not found'},404);\n}};"), 'the entry point is closed');
  assert.equal(typeof (await load()).fetch, 'function');
});

test('no committed source carries a pasted truncation marker', () => {
  const walk = (dir) => readdirSync(ROOT + dir).flatMap((name) => {
    if (['.git', 'node_modules'].includes(name)) return [];
    const path = dir ? `${dir}/${name}` : name;
    return statSync(ROOT + path).isDirectory() ? walk(path) : /\.(m?js|html|css)$/.test(name) ? [path] : [];
  });
  const marked = walk('').filter((path) => /-{3} TRUNCATED -{3} [\d,]+ chars/.test(readFileSync(ROOT + path, 'utf8')));
  assert.deepEqual(marked, []);
});

test('the page and its browser script are served, and the script is complete', async () => {
  for (const path of ['/', '/jev', '/public']) {
    const r = await get(path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-type'), /^text\/html/);
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(await r.text(), /<script src="\/app\.js\?v=[^"]+" defer><\/script>\n<\/body>\n<\/html>$/, `${path} ends with the app script`);
  }
  const r = await get('/app.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^application\/javascript/);
  const app = await r.text();
  assert.doesNotThrow(() => new Function(app), 'APP_JS compiles');
  assert.match(app, /document\.body\.dataset\.jevReady='1';\n\}\);\n\}\)\(\);$/, 'APP_JS ends where the page marks itself ready');
});

test('every element the browser script looks up exists on the page, including the image-provider status', async () => {
  const page = await (await get('/')).text(), app = await (await get('/app.js')).text();
  const ids = new Set([...page.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
  const wanted = [...new Set([...app.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]))];
  assert.ok(wanted.includes('visionProvider') && wanted.includes('visionProviderText'), 'the script shows which image provider is active');
  assert.deepEqual(wanted.filter((id) => !ids.has(id)), []);
  for (const route of ['/api/chatgpt-web/status', '/api/extract', '/api/public-jev']) assert.ok(app.includes(`fetch('${route}'`), `the script calls ${route}`);
  assert.ok(app.includes("'ChatGPT Web عبر TinyFish متصل'") && app.includes("'Cloudflare Vision مؤقتًا"), 'both provider states have a label');
  assert.ok(app.includes("x.method==='chatgpt-web-via-tinyfish'?'ChatGPT Web ✓':'تم الفهم ✓'"), 'the file chip names the provider');
});

test('/health, unknown routes and method checks', async () => {
  assert.deepEqual(await (await get('/health')).json(), { ok: true, service: 'KOSIF Jev', version: '2.0.0', ui: 'clean-external-js', backend: 'service-binding' });
  assert.equal((await get('/nope')).status, 404);
  assert.equal((await get('/api/extract')).status, 405);
  assert.equal((await get('/api/public-jev')).status, 405);
});

/* ------------------------------------------------------------------ ChatGPT Web via TinyFish */

function kv() {
  const store = new Map(), log = [];
  return {
    store, log,
    async put(key, value, opts) { log.push(['put', key, opts]); store.set(key, { value, metadata: opts.metadata }); },
    async getWithMetadata(key) { log.push(['get', key]); return store.get(key) || null; },
    async delete(key) { log.push(['delete', key]); store.delete(key); },
  };
}
const tinyfishEnv = (extra = {}) => ({ TINYFISH_API_KEY: 'tf-test-key', TINYFISH_PROFILE_ID: 'profile-1', TINYFISH_UPLOADS: kv(), ...extra });

test('GET /api/chatgpt-web/status: connected only with the TinyFish key, profile and upload store', async () => {
  const status = async (env) => (await get('/api/chatgpt-web/status', env)).json();
  assert.deepEqual(await status(tinyfishEnv()), { ok: true, connected: true, provider: 'chatgpt-web-via-tinyfish' });
  for (const missing of ['TINYFISH_API_KEY', 'TINYFISH_PROFILE_ID', 'TINYFISH_UPLOADS']) {
    const env = tinyfishEnv(); delete env[missing];
    assert.deepEqual(await status(env), { ok: true, connected: false, provider: 'cloudflare-vision-fallback' }, `without ${missing}`);
  }
  const r = await get('/api/chatgpt-web/status', {});
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(JSON.stringify(await r.json()).includes('tf-test-key'), false);
});

test('GET /api/tf-image/<token>: serves a stored upload once, privately, and refuses anything else', async () => {
  const env = tinyfishEnv(), token = '0f8c2d8e-6b1a-4c3e-9d2f-7a6b5c4d3e2f';
  await env.TINYFISH_UPLOADS.put('img:' + token, new Uint8Array([1, 2, 3]).buffer, { metadata: { type: 'image/png' } });
  const r = await get('/api/tf-image/' + token, env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [1, 2, 3]);
  assert.equal((await get('/api/tf-image/' + token.replace('0f', 'aa'), env)).status, 410, 'expired or unknown');
  assert.equal((await get('/api/tf-image/../secret', env)).status, 404, 'malformed token');
  assert.equal((await get('/api/tf-image/' + token, {})).status, 404, 'no upload store');
});

/* a fake fetch for agent.tinyfish.ai; anything else fails */
async function withTinyFish(answer, fn) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url !== 'https://agent.tinyfish.ai/v1/automation/run') throw new TypeError('unexpected fetch ' + url);
    calls.push({ headers: init.headers, body: JSON.parse(init.body) });
    return typeof answer === 'function' ? answer() : new Response(JSON.stringify(answer), { status: 200 });
  };
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}
const tinyfishDone = { status: 'COMPLETED', result: { visual_summary: 'فاتورة ضريبية من مورد محلي', visible_text: 'فاتورة رقم 1043 بتاريخ 2026-09-01', numbers_and_tables: 'الإجمالي 1,150 ريال شامل ضريبة 150 ريال', important_facts: 'الدفع نقدًا', uncertainty: 'لا يوجد' } };

function extract(files, env, ip) {
  const fd = new FormData();
  for (const [name, type, body] of files) fd.append('files', new Blob([body], { type }), name);
  return call('/api/extract', { method: 'POST', body: fd, headers: { 'cf-connecting-ip': ip } }, env);
}
const fakeAI = (vision) => {
  const calls = [];
  return {
    calls,
    async run(model, input) { calls.push({ model, prompt: input.prompt, bytes: input.image.length }); if (vision instanceof Error) throw vision; return { description: vision }; },
    async toMarkdown(docs) { calls.push({ toMarkdown: docs[0].name }); return [{ data: `نص مستخرج من ${docs[0].name}` }]; },
  };
};

test('/api/extract: with TinyFish connected, an image is analysed by ChatGPT Web first and its upload is removed', async () => {
  const env = tinyfishEnv({ AI: fakeAI('لا يجب أن يُستخدم') });
  await withTinyFish(tinyfishDone, async (calls) => {
    const r = await extract([['invoice.png', 'image/png', new Uint8Array([137, 80, 78, 71])]], env, '198.51.100.1');
    assert.equal(r.status, 200);
    const d = await r.json();
    const [doc] = d.documents;
    assert.deepEqual([doc.method, doc.model], ['chatgpt-web-via-tinyfish', 'ChatGPT Web via TinyFish']);
    assert.ok(doc.data.startsWith('[تحليل ChatGPT Web للصورة عبر TinyFish]\nالملخص البصري: فاتورة ضريبية'));
    assert.ok(doc.data.includes('الأرقام والجداول: الإجمالي 1,150 ريال'));
    assert.equal(env.AI.calls.length, 0, 'Cloudflare vision is not needed');
    const [c] = calls;
    assert.equal(c.headers['X-API-Key'], 'tf-test-key');
    assert.deepEqual([c.body.url, c.body.use_profile, c.body.profile_id, c.body.agent_config.max_duration_seconds], ['https://chatgpt.com/', true, 'profile-1', 180]);
    assert.deepEqual(c.body.output_schema.required, ['visual_summary', 'visible_text', 'numbers_and_tables', 'important_facts', 'uncertainty']);
    const url = c.body.goal.match(/Image URL: (\S+)/)[1];
    assert.match(url, /^https:\/\/kosif-jev\.test\/api\/tf-image\/[0-9a-f-]{36}$/);
    const ops = env.TINYFISH_UPLOADS.log.map(([op, key, opts]) => [op, key, opts && opts.expirationTtl]);
    const key = 'img:' + url.split('/').pop();
    assert.deepEqual(ops, [['put', key, 600], ['delete', key, undefined]], 'stored for 10 minutes at most, deleted after the run');
  });
});

test('/api/extract: when TinyFish fails or is not connected, the image falls back to Cloudflare vision', async () => {
  const failures = {
    'TinyFish HTTP error': () => new Response('upstream down', { status: 502 }),
    'TinyFish not completed': () => new Response(JSON.stringify({ status: 'FAILED', error: { message: 'no session' } }), { status: 200 }),
    'TinyFish invalid JSON': () => new Response('<html>', { status: 200 }),
    'TinyFish unreachable': () => { throw new TypeError('fetch failed'); },
  };
  let n = 10;
  for (const [why, answer] of Object.entries(failures)) {
    const env = tinyfishEnv({ AI: fakeAI('فاتورة بمبلغ 1,150 ريال') });
    await withTinyFish(answer, async (calls) => {
      const d = await (await extract([['invoice.png', 'image/png', new Uint8Array([137, 80, 78, 71])]], env, `198.51.100.${n++}`)).json();
      assert.equal(calls.length, 1, why);
      assert.deepEqual([d.documents[0].method, d.documents[0].model], ['vision+text-extraction', '@cf/llava-hf/llava-1.5-7b-hf + Workers AI toMarkdown'], why);
      assert.equal(env.TINYFISH_UPLOADS.store.size, 0, `${why}: the upload is deleted`);
      assert.equal(JSON.stringify(d).includes('upstream down') || JSON.stringify(d).includes('no session'), false, `${why}: TinyFish errors are not returned`);
    });
  }
  await withTinyFish(tinyfishDone, async (calls) => {
    const d = await (await extract([['scan.png', 'image/png', new Uint8Array([1])]], { AI: fakeAI('صورة') }, '198.51.100.50')).json();
    assert.equal(calls.length, 0, 'not connected: TinyFish is never called');
    assert.equal(d.documents[0].method, 'vision+text-extraction');
  });
});

test('/api/extract: Cloudflare vision first, text extraction as helper; PDFs extracted; limits enforced', async () => {
  const ai = fakeAI('فاتورة بمبلغ 1,150 ريال');
  const d = await (await extract([['invoice.png', 'image/png', new Uint8Array([137, 80, 78, 71])], ['report.pdf', 'application/pdf', '%PDF-1.4']], { AI: ai }, '203.0.113.1')).json();
  assert.equal(d.ok, true); assert.equal(d.visionPipeline, true);
  const [img, pdf] = d.documents;
  assert.equal(img.method, 'vision+text-extraction');
  assert.ok(img.data.startsWith('[فهم بصري بواسطة Vision AI]\nفاتورة بمبلغ 1,150 ريال'));
  assert.ok(img.data.includes('[استخراج نصي مساعد من الصورة]\nنص مستخرج من invoice.png'));
  assert.deepEqual([pdf.method, pdf.model, pdf.data], ['document-extraction', 'Workers AI toMarkdown', 'نص مستخرج من report.pdf']);
  assert.match(ai.calls.find((c) => c.model).prompt, /Write the final analysis in Arabic\..*Do not make the final decision/);

  const fb = await (await extract([['scan.jpg', 'image/jpeg', new Uint8Array([255, 216])]], { AI: fakeAI(new Error('model down')) }, '203.0.113.2')).json();
  assert.deepEqual([fb.documents[0].method, fb.documents[0].model], ['text-extraction-fallback', 'Workers AI toMarkdown']);
  assert.equal((await extract([['a.txt', 'text/plain', 'x']], { AI: fakeAI('x') }, '203.0.113.3')).status, 415);
  assert.equal((await extract([['big.png', 'image/png', new Uint8Array(4 * 1024 * 1024 + 1)]], { AI: fakeAI('x') }, '203.0.113.4')).status, 413);
  assert.equal((await call('/api/extract', { method: 'POST', body: new FormData() }, {})).status, 503, 'no AI binding');
  const statuses = [];
  for (let i = 0; i < 9; i++) statuses.push((await extract([['p.png', 'image/png', new Uint8Array([1])]], { AI: fakeAI('x') }, '203.0.113.5')).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 200, 200, 429], '8 analyses per minute per address');
});

test('/api/public-jev forwards the decision request through the JEV_API binding unchanged', async () => {
  const seen = [];
  const env = { JEV_API: { async fetch(req) { seen.push({ url: req.url, origin: req.headers.get('origin'), body: await req.text() }); return new Response('{"ok":true,"result":{}}', { status: 200 }); } } };
  const body = JSON.stringify({ type: 'noul', instructions: 'هل نرفع السعر؟', state: 'سياق' });
  const r = await call('/api/public-jev', { method: 'POST', body }, env);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, result: {} });
  assert.deepEqual(seen, [{ url: 'https://jev.internal/api/public-jev', origin: 'https://aghnam-jev-api.kosif199022.workers.dev', body }]);
});
