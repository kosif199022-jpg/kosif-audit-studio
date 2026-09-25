// WhatsApp link held by Baileys. Nothing is written to the container disk:
// the auth state lives in memory and the Durable Object in front of this
// container pulls it (GET /state) and pushes it back after a restart (POST /restore).
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
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

let auth = null; // { creds, keys: { [type]: { [id]: value } } }
let version = 0; // bumped on every auth change so the DO knows when to save
let sock = null;
let connection = 'idle'; // idle | connecting | qr | open | closed | logged_out
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
  if (d.length === 11 && d.startsWith('01')) d = '20' + d.slice(1); // Egyptian local format
  if (d.length < 10 || d.length > 15) throw new Error('invalid phone number');
  return `${d}@s.whatsapp.net`;
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
        const jid = toJid(to);
        if (!sock && connection !== 'connecting') await connect();
        await waitOpen(45000);
        const [check] = await sock.onWhatsApp(jid);
        if (!check?.exists) return send(res, 404, { error: 'this number is not on WhatsApp' });
        const sent = await sock.sendMessage(check.jid, { text: message.trim() });
        return send(res, 200, { sent: true, to: check.jid, id: sent?.key?.id });
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
      send(res, 500, { error: String(e?.message || e) });
    }
  })
  .listen(PORT, () => logger.warn(`listening on ${PORT}`));
