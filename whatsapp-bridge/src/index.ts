// WhatsApp bridge: Worker (auth + routes) -> WaBridge Durable Object -> Baileys container.
// The container keeps the WhatsApp auth state and inbox in memory only; this Durable
// Object persists both in its SQLite storage, restores the auth state whenever the
// container restarts, polls the inbox while the container runs, and fires webhooks.
import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  WA: DurableObjectNamespace<WaBridge>;
  API_KEY_SHA256: string; // hex SHA-256 of the API key(s), comma separated; the keys themselves are never stored
  FILES?: R2Bucket; // files callers can send by name (see STORED) or by r2Key
}

const CHUNK = 1_000_000; // DO values are capped at 2 MB; the state can outgrow that
const INSTANCE = 'main';
const PORT = 8080;
const POLL_SECONDS = 15;
const INBOX_KEEP = 1000;
const LOG_KEEP = 300;
const JOB_KEEP = 500;
const JOB_STALE_MS = 120_000;
const MAX_ITEMS = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PER_MINUTE = 15;

// Files kept in R2 (bucket wa-kosif-files) so callers send a short name instead of a URL or base64.
const STORED: Record<string, { key: string; filename: string; mimetype: string }> = {
  'cv-ar': { key: 'cv/CV-Arabic.pdf', filename: 'Mahmoud_ElDesouki_CV_Arabic_2026.pdf', mimetype: 'application/pdf' },
  'cv-en': { key: 'cv/CV-English.pdf', filename: 'Mahmoud_ElDesouki_CV_English_2026.pdf', mimetype: 'application/pdf' },
};

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
type Attachment = {
  stored?: string;
  r2Key?: string;
  fileUrl?: string;
  fileBase64?: string;
  imageUrl?: string;
  videoUrl?: string;
  documentUrl?: string;
  filename?: string;
  fileName?: string;
  mimetype?: string;
  caption?: string;
  asDocument?: boolean;
};
type Item =
  | { kind: 'text'; message: string }
  | ({ kind: 'media' } & Attachment)
  | { kind: 'location'; latitude: number; longitude: number; message?: string };
type ItemResult = { index: number; ok: boolean; id?: string | null; type?: string; error?: string };
type Job = { state: 'running' | 'done' | 'partial' | 'failed'; to: string; total: number; results: ItemResult[]; at: number };
type BundleBody = { sent: boolean; to?: string; results: ItemResult[]; error?: string; duplicate?: boolean; resumed?: boolean };
type Reply = { status: number; body: string };
type Scheduled = { id: string; at: string; to: string; message: string; createdAt: string };
type SendBody = Attachment & { to?: string; message?: string; latitude?: number; longitude?: number; attachments?: unknown; idempotencyKey?: string };

const pad = (n: number) => String(n).padStart(10, '0');
const digits = (s: string) => s.replace(/\D/g, '');

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export class WaBridge extends Container<Env> {
  defaultPort = PORT;
  sleepAfter = '10m'; // no keep-alive by default: the container wakes on demand and sleeps when idle
  private savedVersion = -1;
  private boot = '';
  private lastSeq = 0;
  private syncing: Promise<void> = Promise.resolve();

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
      let auth = '';
      try {
        auth = saved ? JSON.stringify((JSON.parse(saved) as { auth: unknown }).auth) : '';
      } catch {}
      await this.call('/restore', { method: 'POST', body: auth });
      st = (await (await this.call('/status')).json()) as Status;
    }
    this.noteBoot(st.boot);
    return st;
  }

  private async syncNow(st?: Status, quiet = false): Promise<void> {
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

  // Persist the container's auth state if it changed. Serialised so two saves never interleave their chunks.
  private sync(st?: Status, quiet = false): Promise<void> {
    const run = this.syncing.then(() => this.syncNow(st, quiet));
    this.syncing = run.catch((e) => console.error('auth sync failed', String(e)));
    return run;
  }

  // Baileys writes new keys shortly after a send. Save them after replying instead of making the caller wait.
  private syncSoon(): void {
    this.ctx.waitUntil(scheduler.wait(1500).then(() => this.sync()).catch(() => {}));
  }

  override async onActivityExpired(): Promise<void> {
    // Last save before the container sleeps; only while running, a fetch on a stopped container would start it.
    if (this.ctx.container?.running) await this.sync(undefined, true).catch(() => {});
    await super.onActivityExpired();
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
      if (seen.has(`msgid:${m.id}`) || `msgid:${m.id}` in entries) continue;
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

  async pairingCode(phone: string): Promise<{ code: string; connection: string }> {
    await this.ready();
    const res = await this.call('/pair-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const body = (await res.json().catch(() => ({}))) as { code?: string; connection?: string; error?: string };
    if (!res.ok || !body.code) throw new HttpError(res.status || 500, body.error || 'pairing code failed');
    this.syncSoon();
    return { code: body.code, connection: body.connection || 'pairing' };
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

  // Per-minute send cap; `n` items count as n sends.
  private async rateLimited(n: number): Promise<boolean> {
    const cfg = await this.getConfig();
    const minute = Math.floor(Date.now() / 60000);
    const count = ((await this.ctx.storage.get<number>(`rate:${minute}`)) ?? 0) + n;
    if (count > (cfg.maxPerMinute ?? DEFAULT_MAX_PER_MINUTE)) return true;
    await this.ctx.storage.put(`rate:${minute}`, count);
    await this.ctx.storage.delete(`rate:${minute - 2}`);
    return false;
  }

  private async logSent(to: string, results: ItemResult[], items: Item[]): Promise<void> {
    let n = (await this.ctx.storage.get<number>('logs:next')) ?? 1;
    const entries: Record<string, unknown> = {};
    for (const r of results) {
      if (!r.ok) continue;
      const item = items[r.index];
      const text =
        item?.kind === 'text' ? item.message : item?.kind === 'media' ? item.caption || item.filename || item.fileName || '' : item?.message || '';
      entries[`log:${pad(n)}`] = { seq: n, at: new Date().toISOString(), to, id: r.id, type: r.type, text: text.slice(0, 300) };
      n++;
    }
    if (!Object.keys(entries).length) return;
    entries['logs:next'] = n;
    await this.ctx.storage.put(entries);
    await this.prune('log:', 'logs:first', n, LOG_KEEP); // counters live under logs: so the log: prefix lists entries only
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

  // Sends items to one recipient in order, in a single container call. With an idempotency
  // key, a repeat returns the saved result and a retry after a partial failure sends only
  // the items that did not go out.
  async sendBundle(to: string, items: Item[], key?: string): Promise<{ status: number; body: BundleBody }> {
    const prior = key ? await this.job(key) : null;
    if (prior?.state === 'done') return { status: 200, body: { sent: true, duplicate: true, to: prior.to, results: prior.results } };
    if (prior?.state === 'running' && Date.now() - prior.at < JOB_STALE_MS) {
      return { status: 409, body: { sent: false, error: 'this idempotency key is already being sent', results: prior.results } };
    }
    const kept = (prior?.results ?? []).filter((r) => r.ok);
    const done = new Set(kept.map((r) => r.index));
    const pending = items.map((item, index) => ({ item, index })).filter((x) => !done.has(x.index));
    if (!pending.length) return { status: 200, body: { sent: true, duplicate: true, to: prior?.to ?? to, results: kept } };
    if (await this.rateLimited(pending.length)) {
      return { status: 429, body: { sent: false, error: 'rate limit: too many messages this minute', results: kept } };
    }
    if (key) await this.putJob(key, { state: 'running', to, total: items.length, results: kept, at: Date.now() });

    let status = 500;
    let body: Partial<BundleBody> = {};
    try {
      await this.ready();
      const res = await this.call('/send-bundle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, items: pending.map((x) => x.item) }),
      });
      status = res.status;
      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: text || 'bad container response' };
      }
      this.syncSoon();
    } catch (e) {
      body = { error: String((e as Error)?.message || e) };
    }
    const mapped = (body.results ?? []).map((r) => ({ ...r, index: pending[r.index]?.index ?? r.index }));
    const results = [...kept, ...mapped].sort((a, b) => a.index - b.index);
    const sent = results.filter((r) => r.ok).length === items.length;
    if (sent) status = 200;
    const recipient = body.to ?? prior?.to ?? to;
    if (key) {
      const state = sent ? 'done' : results.some((r) => r.ok) ? 'partial' : 'failed';
      await this.putJob(key, { state, to: recipient, total: items.length, results, at: Date.now() });
    }
    await this.logSent(recipient, mapped, items);
    return { status, body: { ...body, to: recipient, sent, results, ...(done.size ? { resumed: true } : {}) } as BundleBody };
  }

  async messages(opts: { limit: number; from?: string; chat?: string; after?: number; sync: boolean; wait: number }): Promise<Msg[]> {
    if (opts.sync) {
      await this.ready();
      await this.pull(opts.wait);
      this.syncSoon();
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
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) throw new HttpError(400, '"at" must be a future ISO-8601 time');
    const s = await this.schedule(when, 'sendScheduled', { to, message });
    const item: Scheduled = { id: s.taskId, at: when.toISOString(), to, message, createdAt: new Date().toISOString() };
    await this.ctx.storage.put(`sched:${s.taskId}`, item);
    return item;
  }

  async sendScheduled(payload: { to: string; message: string }, s: { taskId: string }): Promise<void> {
    const key = `sched:${s.taskId}`;
    if (!(await this.ctx.storage.get(key))) return; // cancelled
    await this.ctx.storage.delete(key);
    const r = await this.sendBundle(payload.to, [{ kind: 'text', message: payload.message }], `sched-${s.taskId}`);
    if (r.status !== 200) console.warn('scheduled send failed', JSON.stringify(r.body));
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

// Bearer token or ?key=; several key hashes may be configured, comma separated.
async function authorized(req: Request, url: URL, env: Env): Promise<boolean> {
  const key = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || '';
  if (!key) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return (env.API_KEY_SHA256 ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .some((h) => safeEqual(hex, h));
}

const isLinked = (st: Status) => st.connection === 'open' || (!!st.me && st.connection !== 'qr' && st.connection !== 'logged_out');

async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

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

const hasFile = (a: Attachment) => !!(a.stored || a.r2Key || a.fileUrl || a.fileBase64 || a.imageUrl || a.videoUrl || a.documentUrl);

// Turns a message plus attachments into send items. Stored files are read from R2 here, before
// anything is sent, so a missing file fails the whole request with nothing delivered.
async function toItems(env: Env, body: SendBody): Promise<Item[]> {
  const items: Item[] = [];
  const text = typeof body.message === 'string' ? body.message.trim() : '';
  const inline: Attachment | null = hasFile(body) ? body : null;
  if (text && !inline) items.push({ kind: 'text', message: text });
  if (body.attachments !== undefined && !Array.isArray(body.attachments)) throw new HttpError(400, '"attachments" must be an array');
  const list = [...(inline ? [{ ...inline, caption: inline.caption ?? text }] : []), ...((body.attachments ?? []) as (Attachment | string)[])];
  for (const raw of list) {
    const a: Attachment = typeof raw === 'string' ? { stored: raw } : (raw ?? {});
    const known = a.stored ? STORED[a.stored] : undefined;
    if (a.stored && !known) throw new HttpError(400, `unknown stored file "${a.stored}" (known: ${Object.keys(STORED).join(', ')})`);
    const r2Key = known?.key ?? a.r2Key;
    const item: Item = {
      kind: 'media',
      fileUrl: a.fileUrl,
      fileBase64: a.fileBase64,
      imageUrl: a.imageUrl,
      videoUrl: a.videoUrl,
      documentUrl: a.documentUrl,
      filename: a.filename ?? a.fileName ?? known?.filename ?? r2Key?.split('/').pop(),
      mimetype: a.mimetype ?? known?.mimetype,
      caption: a.caption ?? '',
      asDocument: a.asDocument,
    };
    if (r2Key) {
      if (!env.FILES) throw new HttpError(424, 'R2 bucket binding FILES is not configured');
      const obj = await env.FILES.get(r2Key);
      if (!obj) throw new HttpError(424, `stored file not found in R2: ${r2Key}`);
      if (obj.size > MAX_FILE_BYTES) throw new HttpError(413, `file too large: ${r2Key}`);
      item.fileBase64 = base64(await obj.arrayBuffer());
      item.fileUrl = undefined;
      item.mimetype ??= obj.httpMetadata?.contentType;
    } else if (!hasFile(a)) {
      throw new HttpError(400, 'each attachment needs stored, r2Key, fileUrl or fileBase64');
    }
    items.push(item);
  }
  if (!items.length && body.latitude != null && body.longitude != null) {
    items.push({ kind: 'location', latitude: Number(body.latitude), longitude: Number(body.longitude), message: text || undefined });
  }
  if (!items.length) throw new HttpError(400, 'message, attachments or a location are required');
  if (items.length > MAX_ITEMS) throw new HttpError(400, `at most ${MAX_ITEMS} items per bundle`);
  return items;
}

// Single-item sends answer in the original {sent, to, id} shape.
function single(r: { status: number; body: BundleBody }, filename?: string | null): Response {
  if (!r.body.sent) {
    const error = r.body.error ?? r.body.results.find((x) => !x.ok)?.error ?? 'send failed';
    return json({ error }, r.status >= 400 ? r.status : 502);
  }
  const first = r.body.results[0];
  const out: Record<string, unknown> = { sent: true, to: r.body.to, id: first?.id ?? null, type: first?.type };
  if (filename !== undefined) out.filename = filename;
  if (r.body.duplicate) out.duplicate = true;
  return json(out);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      return json({ error: String((e as Error)?.message || e) }, 500);
    }
  },
};

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const q = url.searchParams;

  if (path === '/') return new Response('WhatsApp bridge is online.\n');
  if (path === '/openapi.json') return json(openapi(url.origin));
  if (!(await authorized(req, url, env))) return json({ error: 'unauthorized' }, 401);

  const wa = getContainer(env.WA, INSTANCE);

  if (path === '/pair' && req.method === 'GET') return html(PAIR_HTML);
  if (path === '/dashboard' && req.method === 'GET') return html(DASHBOARD_HTML);

  if (path === '/pair/qr' && req.method === 'GET') {
    const st = await wa.status();
    // Pairing closes itself once the number is linked.
    if (isLinked(st)) return json({ linked: true, connection: st.connection });
    const st2 = await wa.pairing();
    return json({ linked: isLinked(st2), connection: st2.connection, qr: st2.qr });
  }
  if (path === '/pair/code' && req.method === 'POST') {
    const body = await readJson<{ phone?: string }>(req);
    const phone = digits(String(body.phone || ''));
    if (phone.length < 8 || phone.length > 15) return json({ error: '"phone" must be 8-15 digits including the country code' }, 400);
    const r = await wa.pairingCode(phone);
    return json({ linked: false, connection: r.connection, code: r.code });
  }
  if (path === '/status' && req.method === 'GET') {
    const st = await wa.status();
    return json({ linked: isLinked(st), connection: st.connection, me: st.me });
  }

  if ((path === '/send' || path === '/send-media') && req.method === 'POST') {
    const body = await readJson<SendBody>(req);
    if (!body.to) return json({ error: '"to" is required' }, 400);
    if (path === '/send-media' && !hasFile(body)) return json({ error: '"to" and fileUrl/fileBase64/stored are required' }, 400);
    const items = await toItems(env, body);
    const r = await wa.sendBundle(body.to, items, idempotencyKey(req, body));
    const media = items[0]?.kind === 'media' ? items[0] : null;
    return single(r, media ? (media.filename ?? null) : undefined);
  }
  if (path === '/send-bundle' && req.method === 'POST') {
    const body = await readJson<SendBody>(req);
    if (!body.to) return json({ error: '"to" is required' }, 400);
    const r = await wa.sendBundle(body.to, await toItems(env, body), idempotencyKey(req, body));
    return json(r.body, r.status);
  }
  if (path.startsWith('/jobs/') && req.method === 'GET') {
    const job = await wa.job(decodeURIComponent(path.slice('/jobs/'.length)));
    return job ? json(job) : json({ error: 'job not found' }, 404);
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
    if (body.webhookUrl && !/^https:\/\//.test(body.webhookUrl)) return json({ error: 'webhookUrl must be https' }, 400);
    return json(await wa.setConfig(body));
  }
  if (path === '/logout' && req.method === 'POST') {
    await wa.logout();
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

// ---- OpenAPI (for ChatGPT Actions / Claude tools) ---------------------------

function openapi(origin: string) {
  const ok = (description: string) => ({ '200': { description } });
  const str = (description: string) => ({ type: 'string', description });
  const attachment = {
    type: 'object',
    properties: {
      stored: { type: 'string', enum: Object.keys(STORED), description: 'A file already stored on the bridge' },
      fileUrl: str('Public https URL of the file'),
      fileBase64: str('Base64-encoded file bytes'),
      filename: str('File name, e.g. report.pdf'),
      mimetype: str('MIME type, e.g. application/pdf or image/jpeg'),
      caption: str('Caption shown with the file'),
    },
  };
  const bodyOf = (required: string[], properties: Record<string, unknown>) => ({
    required: true,
    content: { 'application/json': { schema: { type: 'object', required, properties } } },
  });
  return {
    openapi: '3.1.0',
    info: {
      title: 'WhatsApp Bridge',
      version: '3.0.0',
      description:
        'Send and read WhatsApp messages on the linked personal number. Phone numbers are international, digits only (e.g. 201012345678); groups use their id from listWhatsAppGroups.',
    },
    servers: [{ url: origin }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    security: [{ bearer: [] }],
    paths: {
      '/send': {
        post: {
          operationId: 'sendWhatsAppMessage',
          summary: 'Send a text message, or one file with a caption',
          requestBody: bodyOf(['to'], {
            to: str('Phone number (international, digits only) or a group id ending in @g.us'),
            message: str('Text to send, or the caption when a file is given'),
            ...attachment.properties,
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            idempotencyKey: str('Optional. Reusing a key never sends the same message twice'),
          }),
          responses: { ...ok('Sent'), '404': { description: 'Number is not on WhatsApp' }, '429': { description: 'Rate limit' } },
        },
      },
      '/send-bundle': {
        post: {
          operationId: 'sendWhatsAppBundle',
          summary: 'Send a text plus several files to one recipient in one call, in order',
          requestBody: bodyOf(['to'], {
            to: str('Phone number or group id'),
            message: str('Sent first, as a normal text message'),
            attachments: { type: 'array', maxItems: 9, items: attachment },
            idempotencyKey: str('Optional. Reusing a key never sends the same item twice; a retry after a partial failure sends only what is missing'),
          }),
          responses: { ...ok('All items sent'), '502': { description: 'Stopped at a failed item; results say which were sent' } },
        },
      },
      '/jobs/{key}': {
        get: {
          operationId: 'getWhatsAppJob',
          summary: 'Delivery result for an idempotency key',
          parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { ...ok('Job'), '404': { description: 'Unknown key' } },
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
          requestBody: bodyOf(['to', 'message', 'at'], {
            to: str('Phone number or group id'),
            message: str('Text'),
            at: str('ISO-8601 time with timezone, e.g. 2026-10-01T09:00:00+03:00'),
          }),
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
#qr{background:#fff;padding:16px;border-radius:12px;margin:16px 0;min-height:264px;min-width:264px;display:flex;align-items:center;justify-content:center;text-align:center}
p{max-width:420px;text-align:center;line-height:1.7}a{color:#0a7}
.alt{background:#fff;border-radius:12px;padding:14px;max-width:420px;width:100%;box-sizing:border-box;margin-top:8px}
input,button{font:inherit;padding:8px;border-radius:8px;border:1px solid #ccd}input{width:100%;box-sizing:border-box;margin-bottom:8px;direction:ltr}
button{background:#0a7;color:#fff;border:0;cursor:pointer}.code{font-size:32px;letter-spacing:6px;direction:ltr;text-align:center;margin:10px 0;font-weight:700}</style></head>
<body><h2>ربط واتساب</h2><div id="qr">جارِ التشغيل… قد يستغرق دقيقة</div><p id="msg">واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح الكود.</p>
<div class="alt" id="alt"><b>أو اربط برقم الموبايل (من غير كاميرا)</b><p style="margin:6px 0 10px;font-size:14px">اكتب رقمك بالصيغة الدولية، ثم في واتساب اختر «الربط برقم الهاتف بدلاً من ذلك» وأدخل الكود.</p>
<input id="phone" placeholder="2010xxxxxxxx" inputmode="numeric"><button onclick="code()">اطلب كود الربط</button><div id="codeOut"></div></div>
<script>
const key=new URLSearchParams(location.search).get('key');let last='';let stop=false;
async function poll(){if(stop)return;try{const r=await fetch('/pair/qr?key='+encodeURIComponent(key));const d=await r.json();
if(d.linked){stop=true;document.getElementById('qr').textContent='✅ تم الربط';document.getElementById('alt').style.display='none';document.getElementById('msg').innerHTML='الرقم مربوط. <a href="/dashboard?key='+encodeURIComponent(key)+'">افتح لوحة التحكم</a>';return;}
if(d.qr&&d.qr!==last){last=d.qr;const el=document.getElementById('qr');el.innerHTML='';new QRCode(el,{text:d.qr,width:256,height:256});}
else if(!d.qr){document.getElementById('qr').textContent=d.error||('الحالة: '+d.connection);}}catch(e){}
setTimeout(poll,2000);}poll();
async function code(){const out=document.getElementById('codeOut');out.textContent='جارِ طلب الكود…';
const r=await fetch('/pair/code?key='+encodeURIComponent(key),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:document.getElementById('phone').value})});
const d=await r.json();if(d.code){out.innerHTML='<div class="code">'+d.code+'</div><div style="font-size:13px">الكود صالح لدقائق. بعد إدخاله انتظر لحد ما تظهر ✅ فوق.</div>';}else{out.textContent='خطأ: '+(d.error||r.status);}}
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
<input id="media" placeholder="رابط ملف/صورة، أو اسم ملف محفوظ: cv-ar / cv-en (اختياري)">
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
if(m){if(/^https?:\\/\\//i.test(m))b.fileUrl=m;else b.stored=m;}
const r=await api('/send',{method:'POST',body:JSON.stringify(b)});o.textContent=r.sent?'اتبعتت ✅':('خطأ: '+(r.error||JSON.stringify(r)));loadLog();}
async function loadGroups(){const r=await api('/groups');document.getElementById('groups').textContent=(r.groups||[]).map(g=>g.name+'  —  '+g.id+'  ('+g.participants+')').join('\\n')||r.error||'مفيش جروبات';}
async function loadInbox(sync){const el=document.getElementById('inbox');el.textContent=sync?'بيتصل بواتساب…':'…';const r=await api('/messages?limit=50&sync='+sync);
el.innerHTML=(r.messages||[]).map(m=>'<div class="msg"><span class="who">'+esc(m.name||m.phone||m.sender)+'</span> '+(m.group?'<span class="badge">جروب '+esc(m.chat)+'</span> ':'')+'<span class="time">'+t(m.timestamp)+'</span><div>'+(m.type!=='text'?'<span class="badge">'+esc(m.type)+'</span> ':'')+esc(m.text)+'</div></div>').join('')||'مفيش رسايل';}
async function loadLog(){const r=await api('/log?limit=30');document.getElementById('log').innerHTML=(r.sent||[]).map(s=>'<div class="msg"><span class="who">'+esc(s.to)+'</span> <span class="time">'+t(Date.parse(s.at))+'</span> <span class="badge">'+esc(s.type)+'</span><div>'+esc(s.text)+'</div></div>').join('')||'لسه ماتبعتش حاجة';}
async function loadSched(){const r=await api('/schedule');document.getElementById('sched').innerHTML=(r.scheduled||[]).map(s=>'<div class="msg"><span class="who">'+esc(s.to)+'</span> <span class="time">'+t(Date.parse(s.at))+'</span> <button class="ghost" onclick="cancelSched(\\''+s.id+'\\')">إلغاء</button><div>'+esc(s.message)+'</div></div>').join('')||'مفيش رسايل مجدولة';}
async function scheduleMsg(){const at=new Date(sAt.value).toISOString();const r=await api('/schedule',{method:'POST',body:JSON.stringify({to:to.value,message:text.value,at})});if(r.error)alert(r.error);loadSched();}
async function cancelSched(id){await api('/schedule/'+id,{method:'DELETE'});loadSched();}
async function loadCfg(){const c=await api('/config');hook.value=c.webhookUrl||'';keep.checked=!!c.keepAlive;rate.value=c.maxPerMinute||'';}
async function saveCfg(){const r=await api('/config',{method:'POST',body:JSON.stringify({webhookUrl:hook.value||null,keepAlive:keep.checked,maxPerMinute:rate.value?Number(rate.value):null})});document.getElementById('cfgOut').textContent=r.error?('خطأ: '+r.error):'اتحفظ ✅';}
status();loadInbox(0);loadLog();loadSched();loadCfg();
</script></body></html>`;
