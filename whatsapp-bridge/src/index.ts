// WhatsApp bridge: Worker (auth + routes) -> WaBridge Durable Object -> Baileys container.
// The container keeps the WhatsApp auth state and inbox in memory only; this Durable
// Object persists both in its SQLite storage, restores the auth state whenever the
// container restarts, polls the inbox while the container runs, and fires webhooks.
import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  WA: DurableObjectNamespace<WaBridge>;
  API_KEY_SHA256: string; // hex SHA-256 of the API key; the key itself is never stored
}

const CHUNK = 1_000_000; // DO values are capped at 2 MB; the state can outgrow that
const INSTANCE = 'main';
const PORT = 8080;
const POLL_SECONDS = 15;
const INBOX_KEEP = 1000;
const LOG_KEEP = 300;
const DEFAULT_MAX_PER_MINUTE = 15;

type Status = {
  boot: string;
  restored: boolean;
  connection: string;
  qr: string | null;
  version: number;
  seq: number;
  me: { id?: string; name?: string } | null;
};
type Msg = {
  seq: number;
  id: string;
  chat: string;
  chatAlt: string | null;
  group: boolean;
  sender: string;
  phone: string | null;
  name: string | null;
  timestamp: number;
  type: string;
  text: string;
};
type Config = { webhookUrl?: string; keepAlive?: boolean; maxPerMinute?: number };
type SendBody = {
  to?: string;
  message?: string;
  caption?: string;
  imageUrl?: string;
  videoUrl?: string;
  documentUrl?: string;
  fileName?: string;
  mimetype?: string;
  latitude?: number;
  longitude?: number;
};
type Reply = { status: number; body: string };
type Scheduled = { id: string; at: string; to: string; message: string; createdAt: string };

const pad = (n: number) => String(n).padStart(10, '0');
const digits = (s: string) => s.replace(/\D/g, '');

export class WaBridge extends Container<Env> {
  defaultPort = PORT;
  sleepAfter = '10m'; // no keep-alive by default: the container wakes on demand and sleeps when idle
  private savedVersion = -1;
  private boot = '';
  private lastSeq = 0;

  // ---- container plumbing -------------------------------------------------

  // Starts the container if needed and counts as activity.
  private async call(path: string, init?: RequestInit): Promise<Response> {
    return this.containerFetch(`http://container${path}`, init);
  }

  // Talks to a running container without renewing its activity timeout (used by the poller).
  private async quiet(path: string): Promise<Response | null> {
    const c = this.ctx.container;
    if (!c?.running) return null;
    try {
      return await c.getTcpPort(PORT).fetch(`http://container${path}`);
    } catch {
      return null;
    }
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

  private noteBoot(boot: string): void {
    if (boot && boot !== this.boot) {
      this.boot = boot;
      this.lastSeq = 0; // the container's inbox sequence restarts with it
      this.savedVersion = -1;
    }
  }

  // Start the container if needed and hand it the saved WhatsApp session.
  private async ready(): Promise<Status> {
    let st = (await (await this.call('/status')).json()) as Status;
    if (!st.restored) {
      const saved = await this.loadAuth();
      const auth = saved ? JSON.stringify(JSON.parse(saved).auth) : '';
      await this.call('/restore', { method: 'POST', body: auth });
      st = (await (await this.call('/status')).json()) as Status;
    }
    this.noteBoot(st.boot);
    return st;
  }

  // Persist the container's auth state if it changed since the last save.
  private async sync(st?: Status, quiet = false): Promise<void> {
    if (!st) {
      const r = quiet ? await this.quiet('/status') : await this.call('/status');
      if (!r) return;
      st = (await r.json()) as Status;
      this.noteBoot(st.boot);
    }
    if (!st.restored || st.version === this.savedVersion) return;
    const res = quiet ? await this.quiet('/state') : await this.call('/state');
    if (!res?.ok) return;
    const text = await res.text();
    await this.saveAuth(text);
    this.savedVersion = (JSON.parse(text) as { version: number }).version;
  }

  // ---- inbox --------------------------------------------------------------

  // Pull new inbound messages from the container and persist them. `wait` makes the
  // container connect first so messages received while it slept can arrive.
  private async pull(wait = 0, quiet = false): Promise<Msg[]> {
    const path = `/inbox?after=${this.lastSeq}&wait=${wait}`;
    const res = quiet ? await this.quiet(path) : await this.call(path);
    if (!res?.ok) return [];
    const data = (await res.json()) as { boot: string; seq: number; messages: Msg[] };
    this.noteBoot(data.boot);
    const fresh = await this.persist(data.messages);
    this.lastSeq = Math.max(this.lastSeq, data.seq);
    return fresh;
  }

  private async persist(msgs: Msg[]): Promise<Msg[]> {
    if (!msgs.length) return [];
    const fresh: Msg[] = [];
    let next = (await this.ctx.storage.get<number>('inbox:next')) ?? 1;
    const seen = await this.ctx.storage.get<number>(msgs.map((m) => `msgid:${m.id}`));
    const entries: Record<string, unknown> = {};
    for (const m of msgs) {
      if (seen.has(`msgid:${m.id}`)) continue;
      const stored = { ...m, seq: next++ };
      entries[`msg:${pad(stored.seq)}`] = stored;
      entries[`msgid:${m.id}`] = stored.seq;
      fresh.push(stored);
    }
    if (!fresh.length) return [];
    entries['inbox:next'] = next;
    await this.ctx.storage.put(entries);
    await this.prune('msg:', 'inbox:first', next, INBOX_KEEP, (v) => `msgid:${(v as Msg).id}`);
    await this.webhook(fresh);
    return fresh;
  }

  // Keep only the newest `keep` entries under `prefix`; `extra` names a companion key to drop.
  private async prune(prefix: string, firstKey: string, next: number, keep: number, extra?: (v: unknown) => string): Promise<void> {
    const first = (await this.ctx.storage.get<number>(firstKey)) ?? 1;
    if (next - first <= keep) return;
    const upto = next - keep;
    const old = await this.ctx.storage.list<unknown>({ start: `${prefix}${pad(first)}`, end: `${prefix}${pad(upto)}` });
    const keys = [...old.keys()];
    if (extra) for (const v of old.values()) keys.push(extra(v));
    for (let i = 0; i < keys.length; i += 128) await this.ctx.storage.delete(keys.slice(i, i + 128));
    await this.ctx.storage.put(firstKey, upto);
  }

  private async webhook(msgs: Msg[]): Promise<void> {
    const cfg = await this.getConfig();
    if (!cfg.webhookUrl) return;
    try {
      await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'messages', messages: msgs }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      console.warn('webhook failed', String(e));
    }
  }

  // ---- background poll while the container runs ---------------------------

  override async onStart(): Promise<void> {
    this.deleteSchedules('poll');
    await this.schedule(POLL_SECONDS, 'poll');
  }

  async poll(): Promise<void> {
    if (!this.ctx.container?.running) return; // container went to sleep: the chain ends here
    try {
      await this.pull(0, true);
      await this.sync(undefined, true);
    } catch (e) {
      console.warn('poll failed', String(e));
    }
    if ((await this.getConfig()).keepAlive) this.renewActivityTimeout();
    await this.schedule(POLL_SECONDS, 'poll');
  }

  // ---- public RPC ---------------------------------------------------------

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

  async getConfig(): Promise<Config> {
    return (await this.ctx.storage.get<Config>('config')) ?? {};
  }

  async setConfig(patch: Config): Promise<Config> {
    const cfg = { ...(await this.getConfig()), ...patch };
    for (const k of Object.keys(cfg) as (keyof Config)[]) if (cfg[k] == null || cfg[k] === '') delete cfg[k];
    await this.ctx.storage.put('config', cfg);
    if (cfg.keepAlive) await this.ready(); // start now; the poller keeps it awake from here on
    return cfg;
  }

  async send(body: SendBody): Promise<Reply> {
    const cfg = await this.getConfig();
    const minute = Math.floor(Date.now() / 60000);
    const count = ((await this.ctx.storage.get<number>(`rate:${minute}`)) ?? 0) + 1;
    if (count > (cfg.maxPerMinute ?? DEFAULT_MAX_PER_MINUTE)) {
      return { status: 429, body: JSON.stringify({ error: 'rate limit: too many messages this minute' }) };
    }
    await this.ctx.storage.put(`rate:${minute}`, count);
    await this.ctx.storage.delete(`rate:${minute - 2}`);

    await this.ready();
    const res = await this.call('/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      const sent = JSON.parse(text) as { to: string; id: string; type: string };
      const n = (await this.ctx.storage.get<number>('log:next')) ?? 1;
      await this.ctx.storage.put({
        [`log:${pad(n)}`]: { seq: n, at: new Date().toISOString(), to: sent.to, id: sent.id, type: sent.type, text: (body.message ?? body.caption ?? '').slice(0, 300) },
        'log:next': n + 1,
      });
      await this.prune('log:', 'log:first', n + 1, LOG_KEEP);
    }
    // Signal session keys update right after a send; give them a moment, then save.
    await scheduler.wait(1500);
    await this.sync();
    return { status: res.status, body: text };
  }

  async messages(opts: { limit: number; from?: string; chat?: string; after?: number; sync: boolean; wait: number }): Promise<Msg[]> {
    if (opts.sync) {
      await this.ready();
      await this.pull(opts.wait);
      await this.sync();
    }
    const all = await this.ctx.storage.list<Msg>({ prefix: 'msg:', reverse: true, limit: INBOX_KEEP });
    const from = opts.from ? digits(opts.from) : '';
    const out: Msg[] = [];
    for (const m of all.values()) {
      if (opts.after && m.seq <= opts.after) continue;
      if (opts.chat && m.chat !== opts.chat && m.chatAlt !== opts.chat) continue;
      if (from && !(m.phone === from || m.sender.startsWith(from + '@') || m.chat.startsWith(from + '@'))) continue;
      out.push(m);
      if (out.length >= opts.limit) break;
    }
    return out;
  }

  async log(limit: number): Promise<unknown[]> {
    const all = await this.ctx.storage.list<unknown>({ prefix: 'log:', reverse: true, limit: Math.min(limit, LOG_KEEP) });
    return [...all.values()];
  }

  async passthrough(path: string): Promise<Reply> {
    await this.ready();
    const res = await this.call(path);
    return { status: res.status, body: await res.text() };
  }

  async markRead(chat: string, ids: string[]): Promise<Reply> {
    await this.ready();
    const res = await this.call('/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat, ids }) });
    return { status: res.status, body: await res.text() };
  }

  async scheduleSend(to: string, message: string, at: string): Promise<Scheduled> {
    const when = new Date(at);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) throw new Error('"at" must be a future ISO-8601 time');
    const s = await this.schedule(when, 'sendScheduled', { to, message });
    const item: Scheduled = { id: s.taskId, at: when.toISOString(), to, message, createdAt: new Date().toISOString() };
    await this.ctx.storage.put(`sched:${s.taskId}`, item);
    return item;
  }

  async sendScheduled(payload: { to: string; message: string }, s: { taskId: string }): Promise<void> {
    const key = `sched:${s.taskId}`;
    if (!(await this.ctx.storage.get(key))) return; // cancelled
    await this.ctx.storage.delete(key);
    const r = await this.send(payload);
    if (r.status !== 200) console.warn('scheduled send failed', r.body);
  }

  async listScheduled(): Promise<Scheduled[]> {
    const all = await this.ctx.storage.list<Scheduled>({ prefix: 'sched:' });
    return [...all.values()].sort((a, b) => a.at.localeCompare(b.at));
  }

  async cancelScheduled(id: string): Promise<boolean> {
    return this.ctx.storage.delete(`sched:${id}`);
  }

  async logout(): Promise<void> {
    await this.ready();
    await this.call('/logout', { method: 'POST' });
    // Only our keys: the Container base class keeps its own state in this storage too.
    const n = (await this.ctx.storage.get<number>('auth:chunks')) ?? 0;
    await this.ctx.storage.delete(['auth:chunks', ...Array.from({ length: n }, (_, i) => `auth:${i}`)]);
    this.savedVersion = -1;
    await this.sync();
  }
}

// ---- Worker ---------------------------------------------------------------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const relay = (r: Reply) => new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });

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

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const q = url.searchParams;

    if (path === '/') return new Response('WhatsApp bridge is online.\n');
    if (path === '/openapi.json') return json(openapi(url.origin));
    if (!(await authorized(req, url, env))) return json({ error: 'unauthorized' }, 401);

    const wa = getContainer(env.WA, INSTANCE);

    try {
      if (path === '/pair' && req.method === 'GET') return html(PAIR_HTML);
      if (path === '/dashboard' && req.method === 'GET') return html(DASHBOARD_HTML);

      if (path === '/pair/qr' && req.method === 'GET') {
        const st = await wa.status();
        // Pairing closes itself once the number is linked.
        if (isLinked(st)) return json({ linked: true, connection: st.connection });
        const st2 = await wa.pairing();
        return json({ linked: isLinked(st2), connection: st2.connection, qr: st2.qr });
      }
      if (path === '/status' && req.method === 'GET') {
        const st = await wa.status();
        return json({ linked: isLinked(st), connection: st.connection, me: st.me });
      }
      if (path === '/send' && req.method === 'POST') {
        const body = await readJson<SendBody>(req);
        if (!body) return json({ error: 'invalid JSON' }, 400);
        const hasContent = body.message?.trim() || body.imageUrl || body.videoUrl || body.documentUrl || (body.latitude != null && body.longitude != null);
        if (!body.to || !hasContent) return json({ error: '"to" and a message (or imageUrl/documentUrl/videoUrl/location) are required' }, 400);
        return relay(await wa.send(body));
      }
      if (path === '/messages' && req.method === 'GET') {
        const list = await wa.messages({
          limit: Math.min(Number(q.get('limit') || 50), 500),
          from: q.get('from') || undefined,
          chat: q.get('chat') || undefined,
          after: Number(q.get('after') || 0) || undefined,
          sync: q.get('sync') !== '0',
          wait: Math.min(Number(q.get('wait') || 15000), 60000),
        });
        return json({ messages: list });
      }
      if (path === '/read' && req.method === 'POST') {
        const body = await readJson<{ chat?: string; ids?: string[] }>(req);
        if (!body?.chat || !body.ids?.length) return json({ error: '"chat" and "ids" are required' }, 400);
        return relay(await wa.markRead(body.chat, body.ids));
      }
      if (path === '/check' && req.method === 'GET') {
        if (!q.get('to')) return json({ error: '"to" is required' }, 400);
        return relay(await wa.passthrough(`/check?to=${encodeURIComponent(q.get('to')!)}`));
      }
      if (path === '/groups' && req.method === 'GET') return relay(await wa.passthrough('/groups'));
      if (path === '/contacts' && req.method === 'GET') return relay(await wa.passthrough('/contacts'));
      if (path === '/log' && req.method === 'GET') return json({ sent: await wa.log(Number(q.get('limit') || 50)) });

      if (path === '/schedule' && req.method === 'GET') return json({ scheduled: await wa.listScheduled() });
      if (path === '/schedule' && req.method === 'POST') {
        const body = await readJson<{ to?: string; message?: string; at?: string }>(req);
        if (!body?.to || !body.message?.trim() || !body.at) return json({ error: '"to", "message" and "at" (ISO-8601) are required' }, 400);
        return json(await wa.scheduleSend(body.to, body.message, body.at), 201);
      }
      if (path.startsWith('/schedule/') && req.method === 'DELETE') {
        return json({ cancelled: await wa.cancelScheduled(path.slice('/schedule/'.length)) });
      }

      if (path === '/config' && req.method === 'GET') return json(await wa.getConfig());
      if (path === '/config' && req.method === 'POST') {
        const body = await readJson<Config>(req);
        if (!body) return json({ error: 'invalid JSON' }, 400);
        if (body.webhookUrl && !/^https:\/\//.test(body.webhookUrl)) return json({ error: 'webhookUrl must be https' }, 400);
        return json(await wa.setConfig(body));
      }
      if (path === '/logout' && req.method === 'POST') {
        await wa.logout();
        return json({ ok: true });
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String((e as Error)?.message || e) }, 500);
    }
  },
};

// ---- OpenAPI (for ChatGPT Actions / Claude tools) ---------------------------

function openapi(origin: string) {
  const ok = (description: string) => ({ '200': { description } });
  const str = (description: string) => ({ type: 'string', description });
  return {
    openapi: '3.1.0',
    info: {
      title: 'WhatsApp Bridge',
      version: '2.0.0',
      description: 'Send and read WhatsApp messages on the linked personal number. Phone numbers are international, digits only (e.g. 201012345678); groups use their id from listGroups.',
    },
    servers: [{ url: origin }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    security: [{ bearer: [] }],
    paths: {
      '/send': {
        post: {
          operationId: 'sendWhatsAppMessage',
          summary: 'Send a text, image, video, document or location',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['to'],
                  properties: {
                    to: str('Phone number (international, digits only) or a group id ending in @g.us'),
                    message: str('Text to send, or the caption when a media URL is given'),
                    imageUrl: str('Public https URL of an image to send'),
                    videoUrl: str('Public https URL of a video to send'),
                    documentUrl: str('Public https URL of a file to send as a document'),
                    fileName: str('File name for the document (optional)'),
                    latitude: { type: 'number' },
                    longitude: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: { ...ok('Sent'), '404': { description: 'Number is not on WhatsApp' }, '429': { description: 'Rate limit' } },
        },
      },
      '/messages': {
        get: {
          operationId: 'listWhatsAppMessages',
          summary: 'Read received messages (newest first)',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'from', in: 'query', schema: str('Only messages from this phone number') },
            { name: 'chat', in: 'query', schema: str('Only messages in this chat/group id') },
            { name: 'after', in: 'query', schema: { type: 'integer', description: 'Only messages with seq greater than this' } },
            { name: 'sync', in: 'query', schema: { type: 'string', enum: ['0', '1'], default: '1', description: '1 connects to WhatsApp first to fetch new messages (slower); 0 reads the cache' } },
          ],
          responses: ok('Messages'),
        },
      },
      '/check': {
        get: {
          operationId: 'checkWhatsAppNumber',
          summary: 'Whether a phone number is on WhatsApp',
          parameters: [{ name: 'to', in: 'query', required: true, schema: str('Phone number') }],
          responses: ok('Result'),
        },
      },
      '/groups': { get: { operationId: 'listWhatsAppGroups', summary: 'Groups the number is a member of', responses: ok('Groups') } },
      '/contacts': { get: { operationId: 'listWhatsAppContacts', summary: 'Known contacts (name and phone)', responses: ok('Contacts') } },
      '/log': {
        get: {
          operationId: 'listSentMessages',
          summary: 'Messages sent through the bridge (newest first)',
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }],
          responses: ok('Sent log'),
        },
      },
      '/schedule': {
        get: { operationId: 'listScheduledMessages', summary: 'Pending scheduled messages', responses: ok('Scheduled') },
        post: {
          operationId: 'scheduleWhatsAppMessage',
          summary: 'Send a text message at a future time',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['to', 'message', 'at'],
                  properties: { to: str('Phone number or group id'), message: str('Text'), at: str('ISO-8601 time with timezone, e.g. 2026-10-01T09:00:00+03:00') },
                },
              },
            },
          },
          responses: { '201': { description: 'Scheduled' } },
        },
      },
      '/schedule/{id}': {
        delete: {
          operationId: 'cancelScheduledMessage',
          summary: 'Cancel a scheduled message',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: ok('Cancelled'),
        },
      },
      '/status': { get: { operationId: 'getWhatsAppStatus', summary: 'Whether the WhatsApp number is linked', responses: ok('Status') } },
    },
  };
}

// ---- pages ------------------------------------------------------------------

const PAIR_HTML = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ربط واتساب</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>body{font-family:system-ui,sans-serif;background:#f4f6f5;color:#111;display:flex;flex-direction:column;align-items:center;padding:24px 16px;margin:0}
#qr{background:#fff;padding:16px;border-radius:12px;margin:16px 0;min-height:264px;min-width:264px;display:flex;align-items:center;justify-content:center}
p{max-width:420px;text-align:center;line-height:1.7}a{color:#0a7}</style></head>
<body><h2>ربط واتساب</h2><div id="qr">جارِ التشغيل… قد يستغرق دقيقة</div><p id="msg">واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح الكود.</p>
<script>
const key=new URLSearchParams(location.search).get('key');let last='';
async function poll(){try{const r=await fetch('/pair/qr?key='+encodeURIComponent(key));const d=await r.json();
if(d.linked){document.getElementById('qr').textContent='✅ تم الربط';document.getElementById('msg').innerHTML='الرقم مربوط. <a href="/dashboard?key='+encodeURIComponent(key)+'">افتح لوحة التحكم</a>';return;}
if(d.qr&&d.qr!==last){last=d.qr;const el=document.getElementById('qr');el.innerHTML='';new QRCode(el,{text:d.qr,width:256,height:256});}
else if(!d.qr){document.getElementById('qr').textContent=d.error||('الحالة: '+d.connection);}}catch(e){}
setTimeout(poll,2000);}poll();
</script></body></html>`;

const DASHBOARD_HTML = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>جسر واتساب</title>
<style>
:root{--bg:#f4f6f5;--card:#fff;--fg:#111;--muted:#667;--line:#e3e7e5;--acc:#0a7}
@media(prefers-color-scheme:dark){:root{--bg:#121514;--card:#1c201e;--fg:#eee;--muted:#9aa;--line:#2a302d}}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:16px;max-width:900px;margin-inline:auto}
h1{font-size:20px;margin:0 0 12px}h2{font-size:16px;margin:0 0 10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:14px}
input,textarea,button{font:inherit;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--bg);color:var(--fg)}
input,textarea{width:100%;box-sizing:border-box;margin-bottom:8px}textarea{min-height:70px}
button{background:var(--acc);color:#fff;border:0;cursor:pointer}button.ghost{background:transparent;color:var(--acc);border:1px solid var(--acc)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.muted{color:var(--muted);font-size:13px}
.msg{border-bottom:1px solid var(--line);padding:8px 0}.msg:last-child{border:0}.who{font-weight:600}.time{color:var(--muted);font-size:12px}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:12px;background:var(--line)}
label{display:flex;gap:6px;align-items:center;margin-bottom:8px}label input[type=checkbox]{width:auto;margin:0}
pre{white-space:pre-wrap;word-break:break-word;font-size:12px;color:var(--muted)}
</style></head>
<body>
<h1>جسر واتساب <span id="st" class="badge">…</span></h1>
<div class="card"><h2>إرسال</h2>
<input id="to" placeholder="الرقم بالصيغة الدولية أو معرّف جروب (…@g.us)">
<textarea id="text" placeholder="نص الرسالة"></textarea>
<input id="media" placeholder="رابط صورة أو ملف (اختياري)">
<div class="row"><button onclick="sendMsg()">إرسال</button><button class="ghost" onclick="loadGroups()">عرض الجروبات</button><span id="sendOut" class="muted"></span></div>
<pre id="groups"></pre></div>
<div class="card"><div class="row" style="justify-content:space-between"><h2>الوارد</h2><div class="row"><button class="ghost" onclick="loadInbox(1)">تحديث من واتساب</button><button class="ghost" onclick="loadInbox(0)">من الذاكرة</button></div></div>
<div id="inbox" class="muted">…</div></div>
<div class="card"><h2>المُرسَل عبر الجسر</h2><div id="log" class="muted">…</div></div>
<div class="card"><h2>مجدوَل</h2><div class="row"><input id="sAt" type="datetime-local" style="max-width:240px"><button class="ghost" onclick="scheduleMsg()">جدولة نص الرسالة أعلاه</button></div><div id="sched" class="muted">…</div></div>
<div class="card"><h2>الإعدادات</h2>
<input id="hook" placeholder="Webhook URL (https) يستقبل الرسايل الواردة — اختياري">
<label><input type="checkbox" id="keep"> خلّي الاتصال شغال 24 ساعة (استقبال فوري، تكلفة أعلى)</label>
<div class="row"><input id="rate" type="number" min="1" max="60" style="max-width:120px" placeholder="15"><span class="muted">حد الإرسال في الدقيقة</span><button onclick="saveCfg()">حفظ</button><span id="cfgOut" class="muted"></span></div></div>
<script>
const key=new URLSearchParams(location.search).get('key');
const H={'authorization':'Bearer '+key,'content-type':'application/json'};
const api=(p,o={})=>fetch(p,{...o,headers:H}).then(r=>r.json());
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const t=ms=>new Date(ms).toLocaleString('ar-EG');
async function status(){const s=await api('/status');document.getElementById('st').textContent=s.linked?'مربوط ✅':'غير مربوط ('+s.connection+')';}
async function sendMsg(){const o=document.getElementById('sendOut');o.textContent='جارِ الإرسال…';const b={to:to.value,message:text.value};const m=media.value.trim();
if(m){if(/\\.(png|jpe?g|webp|gif)(\\?|$)/i.test(m))b.imageUrl=m;else if(/\\.(mp4|mov)(\\?|$)/i.test(m))b.videoUrl=m;else b.documentUrl=m;}
const r=await api('/send',{method:'POST',body:JSON.stringify(b)});o.textContent=r.sent?'اتبعتت ✅':('خطأ: '+(r.error||JSON.stringify(r)));loadLog();}
async function loadGroups(){const r=await api('/groups');document.getElementById('groups').textContent=(r.groups||[]).map(g=>g.name+'  —  '+g.id+'  ('+g.participants+')').join('\\n')||r.error||'مفيش جروبات';}
async function loadInbox(sync){const el=document.getElementById('inbox');el.textContent=sync?'بيتصل بواتساب…':'…';const r=await api('/messages?limit=50&sync='+sync);
el.innerHTML=(r.messages||[]).map(m=>'<div class="msg"><span class="who">'+esc(m.name||m.phone||m.sender)+'</span> '+(m.group?'<span class="badge">جروب '+esc(m.chat)+'</span> ':'')+'<span class="time">'+t(m.timestamp)+'</span><div>'+(m.type!=='text'?'<span class="badge">'+esc(m.type)+'</span> ':'')+esc(m.text)+'</div></div>').join('')||'مفيش رسايل';}
async function loadLog(){const r=await api('/log?limit=30');document.getElementById('log').innerHTML=(r.sent||[]).map(s=>'<div class="msg"><span class="who">'+esc(s.to)+'</span> <span class="time">'+t(Date.parse(s.at))+'</span><div>'+esc(s.text)+'</div></div>').join('')||'لسه ماتبعتش حاجة';}
async function loadSched(){const r=await api('/schedule');document.getElementById('sched').innerHTML=(r.scheduled||[]).map(s=>'<div class="msg"><span class="who">'+esc(s.to)+'</span> <span class="time">'+t(Date.parse(s.at))+'</span> <button class="ghost" onclick="cancelSched(\\''+s.id+'\\')">إلغاء</button><div>'+esc(s.message)+'</div></div>').join('')||'مفيش رسايل مجدولة';}
async function scheduleMsg(){const at=new Date(sAt.value).toISOString();const r=await api('/schedule',{method:'POST',body:JSON.stringify({to:to.value,message:text.value,at})});if(r.error)alert(r.error);loadSched();}
async function cancelSched(id){await api('/schedule/'+id,{method:'DELETE'});loadSched();}
async function loadCfg(){const c=await api('/config');hook.value=c.webhookUrl||'';keep.checked=!!c.keepAlive;rate.value=c.maxPerMinute||'';}
async function saveCfg(){const r=await api('/config',{method:'POST',body:JSON.stringify({webhookUrl:hook.value||null,keepAlive:keep.checked,maxPerMinute:rate.value?Number(rate.value):null})});document.getElementById('cfgOut').textContent=r.error?('خطأ: '+r.error):'اتحفظ ✅';}
status();loadInbox(0);loadLog();loadSched();loadCfg();
</script></body></html>`;
