// WhatsApp bridge: Worker -> Durable Object -> Baileys container.
import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  WA: DurableObjectNamespace<WaBridge>;
  API_KEY_SHA256: string;
  FILES?: R2Bucket;
}
const CHUNK = 1_000_000;
const INSTANCE = 'main';
const MAX_ITEMS = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const JOB_KEEP = 500;
const JOB_STALE_MS = 120_000;
type Status = { restored: boolean; connection: string; qr: string | null; version: number; me: { id?: string; name?: string } | null };
type Attachment = { stored?: string; r2Key?: string; fileUrl?: string; fileBase64?: string; filename?: string; mimetype?: string; caption?: string };
type Item =
  | { kind: 'text'; message: string }
  | { kind: 'media'; fileUrl?: string; fileBase64?: string; filename?: string; mimetype?: string; caption?: string };
type ItemResult = { index: number; ok: boolean; id?: string | null; error?: string };
type Job = { state: 'running' | 'done' | 'partial' | 'failed'; to: string; total: number; results: ItemResult[]; at: number };
type BundleBody = { sent: boolean; to?: string; results: ItemResult[]; error?: string; duplicate?: boolean; resumed?: boolean };

// Files kept in R2 (bucket wa-kosif-files) so callers send a short name instead of base64 every time.
const STORED: Record<string, { key: string; filename: string; mimetype: string }> = {
  'cv-ar': { key: 'cv/CV-Arabic.pdf', filename: 'Mahmoud_ElDesouki_CV_Arabic_2026.pdf', mimetype: 'application/pdf' },
  'cv-en': { key: 'cv/CV-English.pdf', filename: 'Mahmoud_ElDesouki_CV_English_2026.pdf', mimetype: 'application/pdf' },
};

export class WaBridge extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '10m';
  private savedVersion = -1;
  private syncing: Promise<void> = Promise.resolve();

  private async call(path: string, init?: RequestInit): Promise<Response> {
    return this.containerFetch(`http://container${path}`, init);
  }
  private async loadAuth(): Promise<string | null> {
    const n = await this.ctx.storage.get<number>('auth:chunks');
    if (!n) return null;
    const parts = await this.ctx.storage.get<string>(Array.from({ length: n }, (_, i) => `auth:${i}`));
    return Array.from({ length: n }, (_, i) => parts.get(`auth:${i}`) ?? '').join('');
  }
  private async saveAuth(json: string): Promise<void> {
    const n = Math.max(1, Math.ceil(json.length / CHUNK));
    const entries: Record<string, unknown> = { 'auth:chunks': n };
    for (let i = 0; i < n; i++) entries[`auth:${i}`] = json.slice(i * CHUNK, (i + 1) * CHUNK);
    const old = (await this.ctx.storage.get<number>('auth:chunks')) ?? 0;
    await this.ctx.storage.put(entries);
    for (let i = n; i < old; i++) await this.ctx.storage.delete(`auth:${i}`);
  }
  private async ready(): Promise<Status> {
    let st = (await (await this.call('/status')).json()) as Status;
    if (!st.restored) {
      const saved = await this.loadAuth();
      const auth = saved ? JSON.stringify(JSON.parse(saved).auth) : '';
      await this.call('/restore', { method: 'POST', body: auth });
      this.savedVersion = -1;
      st = (await (await this.call('/status')).json()) as Status;
    }
    return st;
  }
  private async syncNow(st?: Status): Promise<void> {
    st ??= (await (await this.call('/status')).json()) as Status;
    if (!st.restored || st.version === this.savedVersion) return;
    const res = await this.call('/state');
    if (!res.ok) return;
    const text = await res.text();
    await this.saveAuth(text);
    this.savedVersion = (JSON.parse(text) as { version: number }).version;
  }
  // Serialised so two saves never interleave their chunk writes.
  private sync(st?: Status): Promise<void> {
    const run = this.syncing.then(() => this.syncNow(st));
    this.syncing = run.catch((e) => console.error('auth sync failed', e));
    return run;
  }
  // Baileys writes new keys shortly after a send. Save them after replying instead of making the caller wait.
  private syncSoon(): void {
    this.ctx.waitUntil(scheduler.wait(1500).then(() => this.sync()).catch(() => {}));
  }
  override async onActivityExpired(): Promise<void> {
    // Only when running: containerFetch on a stopped container would start it again.
    if (this.ctx.container?.running) await this.sync().catch(() => {});
    await super.onActivityExpired();
  }
  private async putJob(key: string, job: Job): Promise<void> {
    const index = (await this.ctx.storage.get<string[]>('jobs:index')) ?? [];
    if (!index.includes(key)) index.push(key);
    const drop = index.splice(0, Math.max(0, index.length - JOB_KEEP));
    await this.ctx.storage.put({ [`job:${key}`]: job, 'jobs:index': index });
    if (drop.length) await this.ctx.storage.delete(drop.map((k) => `job:${k}`));
  }
  async job(key: string): Promise<Job | null> {
    return (await this.ctx.storage.get<Job>(`job:${key}`)) ?? null;
  }
  async status(): Promise<Status> {
    const st = await this.ready();
    await this.sync(st);
    return st;
  }
  async pairing(): Promise<Status> {
    await this.ready();
    await this.call('/connect', { method: 'POST' });
    return this.status();
  }
  // Sends text and files to one recipient in a single container call with one auth sync afterwards.
  // With an idempotency key, a repeat returns the saved result and a retry after a partial failure
  // sends only the items that did not go out.
  async sendBundle(to: string, items: Item[], key?: string): Promise<{ status: number; body: BundleBody }> {
    const prior = key ? await this.job(key) : null;
    if (prior?.state === 'done') return { status: 200, body: { sent: true, duplicate: true, to: prior.to, results: prior.results } };
    if (prior?.state === 'running' && Date.now() - prior.at < JOB_STALE_MS) {
      return { status: 409, body: { sent: false, error: 'this idempotency key is already being sent', results: prior.results } };
    }
    const kept = (prior?.results ?? []).filter((r) => r.ok);
    const done = new Set(kept.map((r) => r.index));
    const pending = items.map((it, index) => ({ ...it, index })).filter((it) => !done.has(it.index));
    if (key) await this.putJob(key, { state: 'running', to, total: items.length, results: kept, at: Date.now() });

    let status = 500;
    let body: Partial<BundleBody> = {};
    try {
      await this.ready();
      const res = await this.call('/send-bundle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, items: pending }),
      });
      status = res.status;
      const text = await res.text();
      try { body = JSON.parse(text); } catch { body = { error: text || 'bad container response' }; }
      this.syncSoon();
    } catch (e) {
      body = { error: String((e as Error)?.message || e) };
    }
    const results = [...kept, ...(body.results ?? [])].sort((a, b) => a.index - b.index);
    const sent = results.filter((r) => r.ok).length === items.length;
    if (sent) status = 200;
    if (key) {
      const state = sent ? 'done' : results.some((r) => r.ok) ? 'partial' : 'failed';
      await this.putJob(key, { state, to: body.to ?? prior?.to ?? to, total: items.length, results, at: Date.now() });
    }
    return {
      status,
      body: { ...body, sent, results, ...(done.size ? { resumed: true } : {}) } as BundleBody,
    };
  }
  async logout(): Promise<void> {
    await this.ready();
    await this.call('/logout', { method: 'POST' });
    const n = (await this.ctx.storage.get<number>('auth:chunks')) ?? 0;
    await this.ctx.storage.delete(['auth:chunks', ...Array.from({ length: n }, (_, i) => `auth:${i}`)]);
    this.savedVersion = -1;
    await this.sync();
  }
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function authorized(req: Request, url: URL, env: Env): Promise<boolean> {
  const key = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || '';
  if (!key) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return safeEqual(hex, (env.API_KEY_SHA256 ?? '').toLowerCase());
}
const isLinked = (st: Status) => st.connection === 'open' || (!!st.me && st.connection !== 'qr' && st.connection !== 'logged_out');

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function idempotencyKey(req: Request, body: { idempotencyKey?: unknown }): string | undefined {
  const key = body.idempotencyKey ?? req.headers.get('idempotency-key') ?? undefined;
  if (key === undefined || key === '') return undefined;
  if (typeof key !== 'string' || !/^[\w:.\-]{1,128}$/.test(key)) throw new HttpError(400, 'idempotencyKey must be 1-128 of [A-Za-z0-9_:.-]');
  return key;
}
// Turns a message plus attachments into send items. Stored files are read from R2 here, before anything
// is sent, so a missing file fails the whole request with nothing delivered.
async function toItems(env: Env, message: unknown, attachments: unknown): Promise<Item[]> {
  const items: Item[] = [];
  const text = typeof message === 'string' ? message.trim() : '';
  if (text) items.push({ kind: 'text', message: text });
  if (attachments !== undefined && !Array.isArray(attachments)) throw new HttpError(400, '"attachments" must be an array');
  for (const raw of (attachments ?? []) as (Attachment | string)[]) {
    const a: Attachment = typeof raw === 'string' ? { stored: raw } : raw ?? {};
    const known = a.stored ? STORED[a.stored] : undefined;
    if (a.stored && !known) throw new HttpError(400, `unknown stored file "${a.stored}" (known: ${Object.keys(STORED).join(', ')})`);
    const r2Key = known?.key ?? a.r2Key;
    const item: Item = {
      kind: 'media',
      fileUrl: a.fileUrl,
      fileBase64: a.fileBase64,
      filename: a.filename ?? known?.filename ?? r2Key?.split('/').pop(),
      mimetype: a.mimetype ?? known?.mimetype,
      caption: a.caption ?? '',
    };
    if (r2Key) {
      if (!env.FILES) throw new HttpError(424, 'R2 bucket binding FILES is not configured');
      const obj = await env.FILES.get(r2Key);
      if (!obj) throw new HttpError(424, `stored file not found in R2: ${r2Key}`);
      if (obj.size > MAX_FILE_BYTES) throw new HttpError(413, `file too large: ${r2Key}`);
      item.fileBase64 = base64(await obj.arrayBuffer());
      item.fileUrl = undefined;
      item.mimetype ??= obj.httpMetadata?.contentType;
    } else if (!a.fileUrl && !a.fileBase64) {
      throw new HttpError(400, 'each attachment needs stored, r2Key, fileUrl or fileBase64');
    }
    items.push(item);
  }
  if (!items.length) throw new HttpError(400, 'message or attachments are required');
  if (items.length > MAX_ITEMS) throw new HttpError(400, `at most ${MAX_ITEMS} items per bundle`);
  return items;
}
async function readJson<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new HttpError(400, 'invalid JSON'); }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      throw e;
    }
  },
};

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path === '/') return new Response('WhatsApp bridge is online.\n');
  if (path === '/openapi.json') return json(openapi(url.origin));
  if (!(await authorized(req, url, env))) return json({ error: 'unauthorized' }, 401);
  const wa = getContainer(env.WA, INSTANCE);

  if (path === '/pair' && req.method === 'GET') return new Response(PAIR_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (path === '/pair/qr' && req.method === 'GET') {
    const st = await wa.status();
    if (isLinked(st)) return json({ linked: true, connection: st.connection });
    const st2 = await wa.pairing();
    return json({ linked: isLinked(st2), connection: st2.connection, qr: st2.qr });
  }
  if (path === '/status' && req.method === 'GET') {
    const st = await wa.status();
    return json({ linked: isLinked(st), connection: st.connection, me: st.me });
  }
  if (path === '/send-bundle' && req.method === 'POST') {
    const body = await readJson<{ to?: string; message?: string; attachments?: unknown; idempotencyKey?: string }>(req);
    if (!body.to) return json({ error: '"to" is required' }, 400);
    const key = idempotencyKey(req, body);
    const r = await wa.sendBundle(body.to, await toItems(env, body.message, body.attachments), key);
    return json(r.body, r.status);
  }
  // /send and /send-media are single-item bundles, answered in their original response shape.
  if (path === '/send' && req.method === 'POST') {
    const body = await readJson<{ to?: string; message?: string; idempotencyKey?: string }>(req);
    if (!body.to || !body.message?.trim()) return json({ error: '"to" and "message" are required' }, 400);
    const r = await wa.sendBundle(body.to, [{ kind: 'text', message: body.message.trim() }], idempotencyKey(req, body));
    return single(r);
  }
  if (path === '/send-media' && req.method === 'POST') {
    const body = await readJson<Attachment & { to?: string; message?: string; idempotencyKey?: string }>(req);
    if (!body.to || (!body.fileUrl && !body.fileBase64 && !body.stored && !body.r2Key)) {
      return json({ error: '"to" and fileUrl/fileBase64/stored are required' }, 400);
    }
    const items = await toItems(env, undefined, [{ ...body, caption: body.caption || body.message || '' }]);
    const r = await wa.sendBundle(body.to, items, idempotencyKey(req, body));
    return single(r, items[0].kind === 'media' ? items[0].filename ?? null : null);
  }
  if (path.startsWith('/jobs/') && req.method === 'GET') {
    const job = await wa.job(decodeURIComponent(path.slice('/jobs/'.length)));
    return job ? json(job) : json({ error: 'job not found' }, 404);
  }
  if (path === '/logout' && req.method === 'POST') {
    await wa.logout();
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

function single(r: { status: number; body: BundleBody }, filename?: string | null): Response {
  if (!r.body.sent) {
    const error = r.body.error ?? r.body.results.find((x) => !x.ok)?.error ?? 'send failed';
    return json({ error }, r.status >= 400 ? r.status : 502);
  }
  const out: Record<string, unknown> = { sent: true, to: r.body.to, id: r.body.results[0]?.id ?? null };
  if (filename !== undefined) out.filename = filename;
  if (r.body.duplicate) out.duplicate = true;
  return json(out);
}

function openapi(origin: string) {
  return {
    openapi: '3.1.0',
    info: { title: 'WhatsApp Bridge', version: '2.1.0', description: 'Send WhatsApp text and file messages.' },
    servers: [{ url: origin }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    security: [{ bearer: [] }],
    paths: {
      '/send': { post: { operationId: 'sendWhatsAppMessage', summary: 'Send a WhatsApp text message', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['to','message'], properties: { to: { type:'string' }, message: { type:'string' } } } } } }, responses: { '200': { description:'Sent' } } } },
      '/send-media': { post: { operationId: 'sendWhatsAppFile', summary: 'Send an image, PDF, or file', requestBody: { required: true, content: { 'application/json': { schema: { type:'object', required:['to'], properties: { to:{type:'string'}, fileUrl:{type:'string'}, fileBase64:{type:'string'}, filename:{type:'string'}, mimetype:{type:'string'}, caption:{type:'string'} } } } } }, responses: { '200': { description:'Sent' } } } },
      '/send-bundle': { post: { operationId: 'sendWhatsAppBundle', summary: 'Send a text plus files to one recipient in one call (fastest way to send a message with CVs)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['to'], properties: {
        to: { type: 'string' },
        message: { type: 'string', description: 'Sent first, as a normal text message.' },
        attachments: { type: 'array', maxItems: 9, items: { type: 'object', properties: { stored: { type: 'string', enum: Object.keys(STORED), description: 'A file already stored on the bridge.' }, fileUrl: { type: 'string' }, fileBase64: { type: 'string' }, filename: { type: 'string' }, mimetype: { type: 'string' }, caption: { type: 'string' } } } },
        idempotencyKey: { type: 'string', description: 'Reusing a key never sends the same item twice.' },
      } } } } }, responses: { '200': { description: 'All items sent' }, '502': { description: 'Stopped at a failed item; results say which were sent' } } } },
      '/jobs/{key}': { get: { operationId: 'getWhatsAppJob', summary: 'Delivery result for an idempotency key', parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Job' }, '404': { description: 'Unknown key' } } } },
      '/status': { get: { operationId:'getWhatsAppStatus', summary:'Whether WhatsApp is linked', responses:{ '200':{description:'Status'} } } },
    },
  };
}

const PAIR_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ربط واتساب</title><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script><style>body{font-family:system-ui,sans-serif;background:#f4f6f5;color:#111;display:flex;flex-direction:column;align-items:center;padding:24px 16px;margin:0}#qr{background:#fff;padding:16px;border-radius:12px;margin:16px 0;min-height:264px;min-width:264px;display:flex;align-items:center;justify-content:center}p{max-width:420px;text-align:center;line-height:1.7}</style></head><body><h2>ربط واتساب</h2><div id="qr">جارِ التشغيل… قد يستغرق دقيقة</div><p id="msg">واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح الكود.</p><script>const key=new URLSearchParams(location.search).get('key');let last='';async function poll(){try{const r=await fetch('/pair/qr?key='+encodeURIComponent(key));const d=await r.json();if(d.linked){document.getElementById('qr').textContent='✅ تم الربط';document.getElementById('msg').textContent='الرقم مربوط. تقدر تقفل الصفحة دي.';return;}if(d.qr&&d.qr!==last){last=d.qr;const el=document.getElementById('qr');el.innerHTML='';new QRCode(el,{text:d.qr,width:256,height:256});}else if(!d.qr){document.getElementById('qr').textContent=d.error||('الحالة: '+d.connection);}}catch(e){}setTimeout(poll,2000);}poll();</script></body></html>`;
