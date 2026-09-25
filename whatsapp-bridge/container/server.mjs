// WhatsApp link held by Baileys. Auth format is preserved exactly for the Durable Object.
import http from 'node:http';
import pino from 'pino';
import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  proto,
} from 'baileys';

const PORT = 8080;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

let auth = null;
let version = 0;
let sock = null;
let connection = 'idle';
let qr = null;

const bump = () => { version++; };

function authState() {
  return {
    creds: auth.creds,
    keys: {
      get: async (type, ids) => {
        const out = {};
        for (const id of ids) {
          let value = auth.keys[type]?.[id];
          if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
          out[id] = value;
        }
        return out;
      },
      set: async (data) => {
        for (const type in data) {
          auth.keys[type] ??= {};
          for (const id in data[type]) {
            const value = data[type][id];
            if (value) auth.keys[type][id] = value;
            else delete auth.keys[type][id];
          }
        }
        bump();
      },
    },
  };
}

async function connect() {
  connection = 'connecting';
  const { version: waVersion } = await fetchLatestBaileysVersion().catch(() => ({}));
  sock = makeWASocket({
    auth: authState(),
    logger,
    ...(waVersion ? { version: waVersion } : {}),
    browser: ['Kosif Bridge', 'Chrome', '2.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock.ev.on('creds.update', (update) => {
    Object.assign(auth.creds, update);
    bump();
  });
  sock.ev.on('connection.update', (u) => {
    if (u.qr) { qr = u.qr; connection = 'qr'; }
    if (u.connection === 'open') { qr = null; connection = 'open'; }
    if (u.connection === 'close') {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      sock = null;
      if (code === DisconnectReason.loggedOut) {
        connection = 'logged_out';
        auth = { creds: initAuthCreds(), keys: {} };
        bump();
        return;
      }
      connection = 'closed';
      setTimeout(() => connect().catch((e) => logger.error(e)), code === DisconnectReason.restartRequired ? 0 : 3000);
    }
  });
}

function waitOpen(ms) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (connection === 'open') return resolve();
      if (connection === 'logged_out' || connection === 'qr') return reject(new Error('not linked: open /pair and scan the QR'));
      if (Date.now() - t0 > ms) return reject(new Error('timed out connecting to WhatsApp'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

function toJid(to) {
  let d = String(to ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('01')) d = '20' + d.slice(1);
  if (d.length < 10 || d.length > 15) throw new Error('invalid phone number');
  return `${d}@s.whatsapp.net`;
}

const readBody = async (req) => {
  let b = '';
  for await (const c of req) {
    b += c;
    if (b.length > 40 * 1024 * 1024) throw new Error('payload too large');
  }
  return b;
};

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

async function recipient(to) {
  const jid = toJid(to);
  if (!sock && connection !== 'connecting') await connect();
  await waitOpen(45000);
  const [check] = await sock.onWhatsApp(jid);
  if (!check?.exists) {
    const e = new Error('this number is not on WhatsApp');
    e.status = 404;
    throw e;
  }
  return check.jid;
}

async function mediaBytes(body) {
  if (body.fileBase64) {
    const data = Buffer.from(String(body.fileBase64), 'base64');
    if (data.length > MAX_MEDIA_BYTES) throw new Error('file too large');
    return { data, detectedMime: '' };
  }
  if (!body.fileUrl) throw new Error('fileUrl or fileBase64 is required');
  const r = await fetch(String(body.fileUrl), { redirect: 'follow' });
  if (!r.ok) throw new Error('file download failed');
  const len = Number(r.headers.get('content-length') || 0);
  if (len && len > MAX_MEDIA_BYTES) throw new Error('file too large');
  const ab = await r.arrayBuffer();
  if (ab.byteLength > MAX_MEDIA_BYTES) throw new Error('file too large');
  return { data: Buffer.from(ab), detectedMime: r.headers.get('content-type') || '' };
}

function mediaMessage(data, mimetype, filename, caption) {
  const mt = String(mimetype || 'application/octet-stream').toLowerCase();
  if (mt.startsWith('image/')) return { image: data, mimetype: mt, caption: caption || undefined };
  if (mt.startsWith('video/')) return { video: data, mimetype: mt, caption: caption || undefined };
  if (mt.startsWith('audio/')) return { audio: data, mimetype: mt, ptt: false };
  return { document: data, mimetype: mt, fileName: filename || 'file', caption: caption || undefined };
}

http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/status') {
      return send(res, 200, { restored: !!auth, connection, qr, version, me: auth?.creds?.me ?? null });
    }
    if (path === '/restore' && req.method === 'POST') {
      if (!auth) {
        const body = await readBody(req);
        auth = body ? JSON.parse(body, BufferJSON.reviver) : { creds: initAuthCreds(), keys: {} };
        auth.keys ??= {};
        await connect();
      }
      return send(res, 200, { ok: true });
    }
    if (!auth) return send(res, 409, { error: 'not restored' });
    if (path === '/state') {
      return send(res, 200, JSON.stringify({ version, auth }, BufferJSON.replacer));
    }
    if (path === '/connect' && req.method === 'POST') {
      if (!sock && connection !== 'connecting') await connect();
      return send(res, 200, { connection });
    }
    if (path === '/send' && req.method === 'POST') {
      const { to, message } = JSON.parse(await readBody(req));
      if (!message?.trim()) return send(res, 400, { error: 'message is required' });
      const jid = await recipient(to);
      const sent = await sock.sendMessage(jid, { text: message.trim() });
      return send(res, 200, { sent: true, to: jid, id: sent?.key?.id });
    }
    if (path === '/send-media' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.to) return send(res, 400, { error: 'to is required' });
      const jid = await recipient(body.to);
      const { data, detectedMime } = await mediaBytes(body);
      const payload = mediaMessage(data, body.mimetype || detectedMime, body.filename, body.caption || body.message || '');
      const sent = await sock.sendMessage(jid, payload);
      return send(res, 200, { sent: true, to: jid, id: sent?.key?.id, filename: body.filename || null });
    }
    if (path === '/logout' && req.method === 'POST') {
      await sock?.logout().catch(() => {});
      sock = null;
      auth = { creds: initAuthCreds(), keys: {} };
      connection = 'logged_out';
      bump();
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    const message = String(e?.message || e);
    const status = Number(e?.status || (message.includes('too large') ? 413 : 500));
    send(res, status, { error: message });
  }
}).listen(PORT, () => logger.warn(`listening on ${PORT}`));
