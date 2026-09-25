// WhatsApp bridge: Worker -> Durable Object -> Baileys container.
import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  WA: DurableObjectNamespace<WaBridge>;
  API_KEY_SHA256: string;
}
const CHUNK = 1_000_000;
const INSTANCE = 'main';
type Status = { restored: boolean; connection: string; qr: string | null; version: number; me: { id?: string; name?: string } | null };
type MediaPayload = { to: string; fileUrl?: string; fileBase64?: string; filename?: string; mimetype?: string; caption?: string; message?: string };

export class WaBridge extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '10m';
  private savedVersion = -1;

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
  private async sync(st?: Status): Promise<void> {
    st ??= (await (await this.call('/status')).json()) as Status;
    if (!st.restored || st.version === this.savedVersion) return;
    const res = await this.call('/state');
    if (!res.ok) return;
    const text = await res.text();
    await this.saveAuth(text);
    this.savedVersion = (JSON.parse(text) as { version: number }).version;
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
  async sendText(to: string, message: string): Promise<{ status: number; body: string }> {
    await this.ready();
    const res = await this.call('/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to, message }) });
    const body = await res.text();
    await scheduler.wait(1500);
    await this.sync();
    return { status: res.status, body };
  }
  async sendMedia(payload: MediaPayload): Promise<{ status: number; body: string }> {
    await this.ready();
    const res = await this.call('/send-media', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.text();
    await scheduler.wait(1500);
    await this.sync();
    return { status: res.status, body };
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
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
    if (path === '/send' && req.method === 'POST') {
      let body: { to?: string; message?: string };
      try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
      if (!body.to || !body.message?.trim()) return json({ error: '"to" and "message" are required' }, 400);
      const r = await wa.sendText(body.to, body.message);
      return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    if (path === '/send-media' && req.method === 'POST') {
      let body: MediaPayload;
      try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
      if (!body.to || (!body.fileUrl && !body.fileBase64)) return json({ error: '"to" and fileUrl/fileBase64 are required' }, 400);
      const r = await wa.sendMedia(body);
      return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    if (path === '/logout' && req.method === 'POST') {
      await wa.logout();
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  },
};

function openapi(origin: string) {
  return {
    openapi: '3.1.0',
    info: { title: 'WhatsApp Bridge', version: '2.0.0', description: 'Send WhatsApp text and file messages.' },
    servers: [{ url: origin }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    security: [{ bearer: [] }],
    paths: {
      '/send': { post: { operationId: 'sendWhatsAppMessage', summary: 'Send a WhatsApp text message', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['to','message'], properties: { to: { type:'string' }, message: { type:'string' } } } } } }, responses: { '200': { description:'Sent' } } } },
      '/send-media': { post: { operationId: 'sendWhatsAppFile', summary: 'Send an image, PDF, or file', requestBody: { required: true, content: { 'application/json': { schema: { type:'object', required:['to'], properties: { to:{type:'string'}, fileUrl:{type:'string'}, fileBase64:{type:'string'}, filename:{type:'string'}, mimetype:{type:'string'}, caption:{type:'string'} } } } } }, responses: { '200': { description:'Sent' } } } },
      '/status': { get: { operationId:'getWhatsAppStatus', summary:'Whether WhatsApp is linked', responses:{ '200':{description:'Status'} } } },
    },
  };
}

const PAIR_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ربط واتساب</title><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script><style>body{font-family:system-ui,sans-serif;background:#f4f6f5;color:#111;display:flex;flex-direction:column;align-items:center;padding:24px 16px;margin:0}#qr{background:#fff;padding:16px;border-radius:12px;margin:16px 0;min-height:264px;min-width:264px;display:flex;align-items:center;justify-content:center}p{max-width:420px;text-align:center;line-height:1.7}</style></head><body><h2>ربط واتساب</h2><div id="qr">جارِ التشغيل… قد يستغرق دقيقة</div><p id="msg">واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح الكود.</p><script>const key=new URLSearchParams(location.search).get('key');let last='';async function poll(){try{const r=await fetch('/pair/qr?key='+encodeURIComponent(key));const d=await r.json();if(d.linked){document.getElementById('qr').textContent='✅ تم الربط';document.getElementById('msg').textContent='الرقم مربوط. تقدر تقفل الصفحة دي.';return;}if(d.qr&&d.qr!==last){last=d.qr;const el=document.getElementById('qr');el.innerHTML='';new QRCode(el,{text:d.qr,width:256,height:256});}else if(!d.qr){document.getElementById('qr').textContent=d.error||('الحالة: '+d.connection);}}catch(e){}setTimeout(poll,2000);}poll();</script></body></html>`;
