// WhatsApp link held by Baileys. Nothing is written to the container disk:
// the auth state lives in memory and the Durable Object in front of this
// container pulls it (GET /state) and pushes it back after a restart (POST /restore).
// Incoming messages are buffered in memory (GET /inbox) and persisted by the DO.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import makeWASocket, {
  Browsers,
  BufferJSON,
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  initAuthCreds,
  proto,
} from 'baileys';

const PORT = 8080;
const BOOT = randomUUID(); // lets the DO notice a restart and reset its inbox cursor
const INBOX_MAX = 2000;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_BODY_BYTES = 40 * 1024 * 1024;
const PAIRING_CACHE_MS = 60_000;
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

let auth = null; // { creds, keys: { [type]: { [id]: value } } }
let version = 0; // bumped on every auth change so the DO knows when to save
let sock = null;
let connecting = null; // in-flight connect(), so two callers share one socket
let connection = 'idle'; // idle | connecting | qr | open | closed | logged_out
let qr = null;
let seq = 0; // inbox sequence, per boot
const inbox = []; // normalized incoming messages, oldest first
const contacts = new Map(); // jid -> { name, phone }
const dropped = new WeakSet(); // sockets we ended on purpose: their close must not reconnect
let pairingCache = { phone: '', code: '', at: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bump = () => { version++; };
const fail = (status, message) => Object.assign(new Error(message), { status });
const freshAuth = () => ({ creds: initAuthCreds(), keys: {} });

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

const phoneOf = (jid) => (jid?.endsWith('@s.whatsapp.net') ? jid.split('@')[0].split(':')[0] : null);

function rememberContact(jid, name, alt) {
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;
  const cur = contacts.get(jid) ?? {};
  contacts.set(jid, { name: name || cur.name || null, phone: phoneOf(jid) || phoneOf(alt) || cur.phone || null });
}

// Reduce a WhatsApp message to {type, text}; null for protocol noise.
function contentOf(message) {
  if (!message) return null;
  const m =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message ||
    message;
  if (m.conversation) return { type: 'text', text: m.conversation };
  if (m.extendedTextMessage?.text) return { type: 'text', text: m.extendedTextMessage.text };
  if (m.imageMessage) return { type: 'image', text: m.imageMessage.caption || '' };
  if (m.videoMessage) return { type: 'video', text: m.videoMessage.caption || '' };
  if (m.audioMessage) return { type: 'audio', text: '' };
  if (m.documentMessage) return { type: 'document', text: m.documentMessage.fileName || m.documentMessage.caption || '' };
  if (m.stickerMessage) return { type: 'sticker', text: '' };
  if (m.locationMessage) return { type: 'location', text: `${m.locationMessage.degreesLatitude},${m.locationMessage.degreesLongitude}` };
  if (m.contactMessage) return { type: 'contact', text: m.contactMessage.displayName || '' };
  if (m.reactionMessage) return { type: 'reaction', text: m.reactionMessage.text || '' };
  if (m.pollCreationMessage) return { type: 'poll', text: m.pollCreationMessage.name || '' };
  if (m.protocolMessage || m.senderKeyDistributionMessage) return null;
  return { type: Object.keys(m)[0] || 'unknown', text: '' };
}

function normalize(msg) {
  const key = msg.key || {};
  if (key.fromMe || !key.remoteJid || key.remoteJid === 'status@broadcast') return null;
  const c = contentOf(msg.message);
  if (!c) return null;
  const group = key.remoteJid.endsWith('@g.us');
  const sender = group ? key.participant : key.remoteJid;
  const senderAlt = group ? key.participantAlt : key.remoteJidAlt;
  rememberContact(sender, msg.pushName, senderAlt);
  const ts = Number(msg.messageTimestamp?.low ?? msg.messageTimestamp ?? Date.now() / 1000);
  return {
    id: key.id,
    chat: key.remoteJid,
    chatAlt: key.remoteJidAlt || null,
    group,
    sender,
    phone: phoneOf(sender) || phoneOf(senderAlt),
    name: msg.pushName || contacts.get(sender)?.name || null,
    timestamp: ts * 1000,
    type: c.type,
    text: c.text,
  };
}

// Current WhatsApp Web version: stale versions get rejected at pairing time.
async function waVersion() {
  const live = await fetchLatestWaWebVersion().catch(() => null);
  if (live?.version) return live.version;
  const fallback = await fetchLatestBaileysVersion().catch(() => null);
  return fallback?.version;
}

function dropSocket() {
  const s = sock;
  sock = null;
  qr = null;
  if (!s) return;
  dropped.add(s);
  try { s.end(new Error('replaced')); } catch {}
}

function connect() {
  if (connecting) return connecting;
  connecting = (async () => {
    connection = 'connecting';
    const v = await waVersion();
    const s = makeWASocket({
      auth: authState(),
      logger,
      ...(v ? { version: v } : {}),
      browser: Browsers.macOS('Desktop'), // identity WhatsApp accepts for phone-number pairing codes
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    sock = s;
    s.ev.on('creds.update', (update) => {
      Object.assign(auth.creds, update);
      bump();
    });
    s.ev.on('connection.update', (u) => {
      if (dropped.has(s)) return;
      if (u.qr) { qr = u.qr; connection = 'qr'; }
      if (u.connection === 'open') { qr = null; connection = 'open'; pairingCache = { phone: '', code: '', at: 0 }; }
      if (u.connection === 'close') {
        const code = u.lastDisconnect?.error?.output?.statusCode;
        logger.warn({ code, error: String(u.lastDisconnect?.error?.message || '') }, 'connection closed');
        if (sock === s) sock = null;
        if (code === DisconnectReason.loggedOut) {
          connection = 'logged_out';
          auth = freshAuth();
          bump();
          return;
        }
        connection = 'closed';
        // 515 right after pairing, or a network drop: reconnect with the same state.
        setTimeout(() => connect().catch((e) => logger.error(e)), code === DisconnectReason.restartRequired ? 0 : 3000);
      }
    });
    s.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        const n = normalize(msg);
        if (!n) continue;
        n.seq = ++seq;
        inbox.push(n);
        if (inbox.length > INBOX_MAX) inbox.splice(0, inbox.length - INBOX_MAX);
      }
    });
    const onContacts = (list) => {
      for (const c of list || []) rememberContact(c.id, c.name || c.notify || c.verifiedName, c.phoneNumber ? `${c.phoneNumber}@s.whatsapp.net` : null);
    };
    s.ev.on('contacts.upsert', onContacts);
    s.ev.on('contacts.update', onContacts);
    return s;
  })().finally(() => { connecting = null; });
  return connecting;
}

function waitOpen(ms) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (connection === 'open') return resolve();
      if (connection === 'logged_out' || connection === 'qr') return reject(fail(409, 'not linked: open /pair and scan the QR or use a pairing code'));
      if (Date.now() - t0 > ms) return reject(fail(504, 'timed out connecting to WhatsApp'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function ensureOpen(ms = 45000) {
  if (!sock) await connect();
  await waitOpen(ms);
}

// Phone-number pairing: WhatsApp shows the code prompt under "Link with phone number instead".
// A code request is an explicit relink, so it starts from fresh unregistered credentials.
async function pairingCode(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) throw fail(400, 'phone must be 8-15 digits including the country code');
  if (connection === 'open') throw fail(409, 'already linked: log out first');
  if (pairingCache.phone === digits && pairingCache.code && Date.now() - pairingCache.at < PAIRING_CACHE_MS) return pairingCache.code;
  dropSocket();
  connection = 'idle';
  auth = freshAuth();
  bump();
  const s = await connect();
  // The code can be requested once the socket has handshaken (Baileys signals that with the first QR).
  await new Promise((resolve, reject) => {
    const done = (fn, v) => { clearTimeout(timer); s.ev.off('connection.update', onUpdate); fn(v); };
    const onUpdate = (u) => {
      if (u.qr || u.connection === 'open') done(resolve);
      else if (u.connection === 'close') done(reject, fail(502, 'connection closed before a pairing code could be requested'));
    };
    const timer = setTimeout(() => done(reject, fail(504, 'pairing code timed out')), 20000);
    if (qr) return done(resolve);
    s.ev.on('connection.update', onUpdate);
  });
  const code = String(await s.requestPairingCode(digits));
  pairingCache = { phone: digits, code, at: Date.now() };
  return code;
}

// Accepts a phone number, a full jid, or a group id.
function toJid(to) {
  const s = String(to ?? '').trim();
  if (s.includes('@')) return s;
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('01')) d = '20' + d.slice(1); // Egyptian local format
  if (d.length < 8 || d.length > 15) throw fail(400, 'invalid phone number');
  return `${d}@s.whatsapp.net`;
}

// Resolve the recipient: groups and lids are used as-is, phone numbers are checked on WhatsApp.
async function resolveJid(to) {
  const jid = toJid(to);
  if (!jid.endsWith('@s.whatsapp.net')) return jid;
  const [check] = await sock.onWhatsApp(jid);
  if (!check?.exists) throw fail(404, 'this number is not on WhatsApp');
  return check.jid || jid;
}

const MIME = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4',
};

async function download(url) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw fail(424, `file download failed (${r.status})`);
  const len = Number(r.headers.get('content-length') || 0);
  if (len > MAX_MEDIA_BYTES) throw fail(413, 'file too large (25 MB max)');
  const ab = await r.arrayBuffer();
  if (ab.byteLength > MAX_MEDIA_BYTES) throw fail(413, 'file too large (25 MB max)');
  return { data: Buffer.from(ab), detected: (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
}

// Turn a request item into a Baileys message content object. Media is fetched here,
// before anything is sent, so a bad file fails the request with nothing delivered.
async function buildContent(b) {
  const caption = (b.caption ?? b.message ?? '').trim() || undefined;
  const url = b.fileUrl || b.imageUrl || b.videoUrl || b.documentUrl;
  if (b.fileBase64 || url) {
    let data, detected = '';
    if (b.fileBase64) {
      data = Buffer.from(String(b.fileBase64), 'base64');
      if (data.length > MAX_MEDIA_BYTES) throw fail(413, 'file too large (25 MB max)');
    } else {
      ({ data, detected } = await download(url));
    }
    const fromUrl = url ? decodeURIComponent(new URL(url).pathname.split('/').pop() || '') : '';
    const fileName = b.fileName || b.filename || fromUrl || 'file';
    const ext = fileName.split('.').pop()?.toLowerCase();
    let mime = String(b.mimetype || '').toLowerCase().split(';')[0];
    if (!mime || mime === 'application/octet-stream') mime = detected && detected !== 'application/octet-stream' ? detected : MIME[ext] || 'application/octet-stream';
    if (b.imageUrl && !mime.startsWith('image/')) mime = 'image/jpeg';
    if (b.videoUrl && !mime.startsWith('video/')) mime = 'video/mp4';
    if (!b.documentUrl && !b.asDocument) {
      if (mime.startsWith('image/') && mime !== 'image/gif') return { image: data, mimetype: mime, caption };
      if (mime.startsWith('video/')) return { video: data, mimetype: mime, caption };
      if (mime.startsWith('audio/')) return { audio: data, mimetype: mime, ptt: false };
    }
    return { document: data, mimetype: mime, fileName, caption };
  }
  if (b.latitude != null && b.longitude != null) {
    return { location: { degreesLatitude: Number(b.latitude), degreesLongitude: Number(b.longitude), name: b.message || undefined } };
  }
  const text = (b.message ?? '').trim();
  if (!text) throw fail(400, 'message is required');
  return { text };
}

const kindOf = (content) => Object.keys(content)[0];

// Show "typing…" briefly before a text message.
async function typing(jid, text) {
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await sleep(Math.min(600 + (text?.length ?? 0) * 25, 3000));
    await sock.sendPresenceUpdate('paused', jid);
  } catch {}
}

async function deliver(jid, content) {
  if (content.text) await typing(jid, content.text);
  const sent = await sock.sendMessage(jid, content);
  return { id: sent?.key?.id ?? null, type: kindOf(content) };
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY_BYTES) throw fail(413, 'payload too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}
const readJson = async (req) => {
  const raw = await readBody(req);
  try { return raw ? JSON.parse(raw) : {}; } catch { throw fail(400, 'invalid JSON'); }
};
const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const path = url.pathname;
      if (path === '/status') {
        return send(res, 200, { boot: BOOT, restored: !!auth, connection, qr, version, seq, me: auth?.creds?.me ?? null, contacts: contacts.size });
      }
      if (path === '/restore' && req.method === 'POST') {
        if (!auth) {
          const body = await readBody(req);
          let parsed = null;
          try { parsed = body ? JSON.parse(body, BufferJSON.reviver) : null; } catch {}
          // Anything that is not our {creds, keys} shape (e.g. a file snapshot from an older build) starts fresh.
          auth = parsed?.creds ? { creds: parsed.creds, keys: parsed.keys ?? {} } : freshAuth();
          if (!parsed?.creds) bump();
          await connect();
        }
        return send(res, 200, { ok: true, boot: BOOT });
      }
      if (!auth) return send(res, 409, { error: 'not restored' });
      if (path === '/state') {
        return send(res, 200, JSON.stringify({ version, auth }, BufferJSON.replacer));
      }
      if (path === '/connect' && req.method === 'POST') {
        if (!sock) await connect();
        return send(res, 200, { connection });
      }
      if (path === '/pair-code' && req.method === 'POST') {
        const { phone } = await readJson(req);
        const code = await pairingCode(phone);
        return send(res, 200, { code, connection });
      }
      if (path === '/inbox') {
        // ?after=<seq> returns newer messages; ?wait=<ms> first connects and lets offline messages arrive.
        const after = Number(url.searchParams.get('after') || 0);
        const wait = Math.min(Number(url.searchParams.get('wait') || 0), 60000);
        if (wait > 0) {
          try {
            await ensureOpen(wait);
            await sleep(Math.min(3000, wait));
          } catch (e) {
            logger.warn(e, 'inbox wait');
          }
        }
        const messages = inbox.filter((m) => m.seq > after);
        return send(res, 200, { boot: BOOT, seq, connection, version, messages });
      }
      if (path === '/contacts') {
        const list = [...contacts.entries()].map(([jid, c]) => ({ jid, ...c }));
        return send(res, 200, { contacts: list });
      }
      if (path === '/check') {
        await ensureOpen();
        const jid = toJid(url.searchParams.get('to'));
        const [check] = await sock.onWhatsApp(jid);
        return send(res, 200, { exists: !!check?.exists, jid: check?.jid ?? jid });
      }
      if (path === '/groups') {
        await ensureOpen();
        const groups = await sock.groupFetchAllParticipating();
        const list = Object.values(groups).map((g) => ({ id: g.id, name: g.subject, participants: g.participants?.length ?? 0 }));
        return send(res, 200, { groups: list });
      }
      if (path === '/send' && req.method === 'POST') {
        const body = await readJson(req);
        const content = await buildContent(body);
        await ensureOpen();
        const jid = await resolveJid(body.to);
        const r = await deliver(jid, content);
        return send(res, 200, { sent: true, to: jid, ...r });
      }
      // Several items to one recipient, in order. All media is fetched first; delivery stops at the first failure.
      if (path === '/send-bundle' && req.method === 'POST') {
        const body = await readJson(req);
        if (!Array.isArray(body.items) || !body.items.length || body.items.length > 10) throw fail(400, 'items must hold 1-10 entries');
        const contents = await Promise.all(body.items.map((item) => buildContent(item.kind === 'text' ? { message: item.message } : item)));
        await ensureOpen();
        const jid = await resolveJid(body.to);
        const results = [];
        for (let index = 0; index < contents.length; index++) {
          try {
            results.push({ index, ok: true, ...(await deliver(jid, contents[index])) });
          } catch (e) {
            results.push({ index, ok: false, error: String(e?.message || e) });
            return send(res, 502, { sent: false, to: jid, results });
          }
        }
        return send(res, 200, { sent: true, to: jid, results });
      }
      if (path === '/read' && req.method === 'POST') {
        const { chat, ids } = await readJson(req);
        await ensureOpen();
        await sock.readMessages((ids || []).map((id) => ({ remoteJid: chat, id, fromMe: false })));
        return send(res, 200, { ok: true });
      }
      if (path === '/logout' && req.method === 'POST') {
        const s = sock;
        dropSocket();
        await s?.logout().catch(() => {});
        auth = freshAuth();
        connection = 'logged_out';
        bump();
        return send(res, 200, { ok: true });
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, e?.status || 500, { error: String(e?.message || e) });
    }
  })
  .listen(PORT, () => logger.warn(`listening on ${PORT}`));
