// WhatsApp link held by Baileys. Nothing is written to the container disk:
// the auth state lives in memory and the Durable Object in front of this
// container pulls it (GET /state) and pushes it back after a restart (POST /restore).
// Incoming messages are buffered in memory (GET /inbox) and persisted by the DO.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  proto,
} from 'baileys';

const PORT = 8080;
const BOOT = randomUUID(); // lets the DO notice a restart and reset its inbox cursor
const INBOX_MAX = 2000;
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

let auth = null; // { creds, keys: { [type]: { [id]: value } } }
let version = 0; // bumped on every auth change so the DO knows when to save
let sock = null;
let connection = 'idle'; // idle | connecting | qr | open | closed | logged_out
let qr = null;
let seq = 0; // inbox sequence, per boot
const inbox = []; // normalized incoming messages, oldest first
const contacts = new Map(); // jid -> { name, phone }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

async function connect() {
  connection = 'connecting';
  const { version: waVersion } = await fetchLatestBaileysVersion().catch(() => ({}));
  sock = makeWASocket({
    auth: authState(),
    logger,
    ...(waVersion ? { version: waVersion } : {}),
    browser: ['Kosif Bridge', 'Chrome', '1.0'],
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
      // 515 right after pairing, or a network drop: reconnect with the same state.
      setTimeout(() => connect().catch((e) => logger.error(e)), code === DisconnectReason.restartRequired ? 0 : 3000);
    }
  });
  sock.ev.on('messages.upsert', ({ messages }) => {
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
  sock.ev.on('contacts.upsert', onContacts);
  sock.ev.on('contacts.update', onContacts);
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

async function ensureOpen(ms = 45000) {
  if (!sock && connection !== 'connecting') await connect();
  await waitOpen(ms);
}

// Accepts a phone number, a full jid, or a group id.
function toJid(to) {
  const s = String(to ?? '').trim();
  if (s.includes('@')) return s;
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('01')) d = '20' + d.slice(1); // Egyptian local format
  if (d.length < 10 || d.length > 15) throw new Error('invalid phone number');
  return `${d}@s.whatsapp.net`;
}

// Resolve the recipient: groups and lids are used as-is, phone numbers are checked on WhatsApp.
async function resolveJid(to) {
  const jid = toJid(to);
  if (!jid.endsWith('@s.whatsapp.net')) return jid;
  const [check] = await sock.onWhatsApp(jid);
  if (!check?.exists) throw Object.assign(new Error('this number is not on WhatsApp'), { status: 404 });
  return check.jid;
}

const MIME = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', mp4: 'video/mp4', mp3: 'audio/mpeg',
};

function buildContent(b) {
  const caption = (b.caption ?? b.message ?? '').trim() || undefined;
  if (b.imageUrl) return { image: { url: b.imageUrl }, caption };
  if (b.videoUrl) return { video: { url: b.videoUrl }, caption };
  if (b.documentUrl) {
    const fileName = b.fileName || decodeURIComponent(new URL(b.documentUrl).pathname.split('/').pop() || 'file');
    const ext = fileName.split('.').pop()?.toLowerCase();
    return { document: { url: b.documentUrl }, fileName, mimetype: b.mimetype || MIME[ext] || 'application/octet-stream', caption };
  }
  if (b.latitude != null && b.longitude != null) {
    return { location: { degreesLatitude: Number(b.latitude), degreesLongitude: Number(b.longitude), name: b.message || undefined } };
  }
  const text = (b.message ?? '').trim();
  if (!text) throw Object.assign(new Error('message is required'), { status: 400 });
  return { text };
}

// Look like a person: show "typing…" for a moment before a text message.
async function typing(jid, text) {
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await sleep(Math.min(600 + (text?.length ?? 0) * 25, 3000));
    await sock.sendPresenceUpdate('paused', jid);
  } catch {}
}

const readBody = async (req) => {
  let b = '';
  for await (const c of req) b += c;
  return b;
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
          auth = body ? JSON.parse(body, BufferJSON.reviver) : { creds: initAuthCreds(), keys: {} };
          auth.keys ??= {};
          await connect();
        }
        return send(res, 200, { ok: true, boot: BOOT });
      }
      if (!auth) return send(res, 409, { error: 'not restored' });
      if (path === '/state') {
        return send(res, 200, JSON.stringify({ version, auth }, BufferJSON.replacer));
      }
      if (path === '/connect' && req.method === 'POST') {
        if (!sock && connection !== 'connecting') await connect();
        return send(res, 200, { connection });
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
        const body = JSON.parse(await readBody(req));
        const content = buildContent(body);
        await ensureOpen();
        const jid = await resolveJid(body.to);
        if (content.text) await typing(jid, content.text);
        const sent = await sock.sendMessage(jid, content);
        return send(res, 200, { sent: true, to: jid, id: sent?.key?.id, type: Object.keys(content)[0] });
      }
      if (path === '/read' && req.method === 'POST') {
        const { chat, ids } = JSON.parse(await readBody(req));
        await ensureOpen();
        await sock.readMessages((ids || []).map((id) => ({ remoteJid: chat, id, fromMe: false })));
        return send(res, 200, { ok: true });
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
      send(res, e?.status || 500, { error: String(e?.message || e) });
    }
  })
  .listen(PORT, () => logger.warn(`listening on ${PORT}`));
