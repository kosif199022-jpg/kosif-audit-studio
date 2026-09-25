import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";

const PORT = Number(process.env.PORT || 8080);
const AUTH_DIR = "/tmp/wa-auth";
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const logger = pino({ level: process.env.LOG_LEVEL || "warn" });

let restored = false;
let version = 0;
let sock = null;
let saveCreds = null;
let connection = "idle";
let qr = null;
let me = null;
let starting = null;

const json = (res, status, body) => {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {"content-type":"application/json; charset=utf-8","content-length":String(data.length)});
  res.end(data);
};

async function readBody(req, limit = 40 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("payload_too_large");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function resetAuthDir() {
  await fs.rm(AUTH_DIR, { recursive: true, force: true });
  await fs.mkdir(AUTH_DIR, { recursive: true });
}

async function restoreSnapshot(snapshot) {
  await resetAuthDir();
  const files = snapshot?.files && typeof snapshot.files === "object" ? snapshot.files : {};
  for (const [name, b64] of Object.entries(files)) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) continue;
    await fs.writeFile(path.join(AUTH_DIR, name), Buffer.from(String(b64), "base64"));
  }
  restored = true;
}

async function snapshotAuth() {
  await fs.mkdir(AUTH_DIR, { recursive: true });
  const names = await fs.readdir(AUTH_DIR);
  const files = {};
  for (const name of names) {
    const st = await fs.stat(path.join(AUTH_DIR, name));
    if (!st.isFile()) continue;
    files[name] = (await fs.readFile(path.join(AUTH_DIR, name))).toString("base64");
  }
  return { files };
}

function normalizeToJid(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) throw new Error("invalid_phone");
  return digits + "@s.whatsapp.net";
}

async function startSocket() {
  if (sock && connection === "open") return sock;
  if (starting) return starting;
  starting = (async () => {
    await fs.mkdir(AUTH_DIR, { recursive: true });
    const auth = await useMultiFileAuthState(AUTH_DIR);
    saveCreds = auth.saveCreds;
    const s = makeWASocket({
      auth: auth.state,
      logger,
      printQRInTerminal: false,
      browser: ["KOSIF", "Chrome", "2.0.0"],
      markOnlineOnConnect: false,
      syncFullHistory: false
    });
    sock = s;
    connection = "connecting";
    s.ev.on("creds.update", async () => {
      await saveCreds();
      version += 1;
    });
    s.ev.on("connection.update", (u) => {
      if (u.qr) { qr = u.qr; connection = "qr"; }
      if (u.connection) connection = u.connection;
      if (u.connection === "open") {
        qr = null;
        me = s.user || null;
        connection = "open";
      }
      if (u.connection === "close") {
        const code = u.lastDisconnect?.error?.output?.statusCode;
        connection = code === DisconnectReason.loggedOut ? "logged_out" : "closed";
        if (code === DisconnectReason.loggedOut) me = null;
        sock = null;
      }
    });
    return s;
  })();
  try { return await starting; } finally { starting = null; }
}

async function waitForOpen(timeoutMs = 20000) {
  await startSocket();
  if (connection === "open") return;
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (connection === "open") return;
    if (connection === "logged_out" || connection === "qr") break;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("whatsapp_not_connected");
}

async function downloadMedia(url) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error("file_download_failed");
  const len = Number(r.headers.get("content-length") || 0);
  if (len && len > MAX_MEDIA_BYTES) throw new Error("file_too_large");
  const ab = await r.arrayBuffer();
  if (ab.byteLength > MAX_MEDIA_BYTES) throw new Error("file_too_large");
  return { data: Buffer.from(ab), contentType: r.headers.get("content-type") || "" };
}

function messageForMedia(data, mimetype, filename, caption) {
  const type = String(mimetype || "").toLowerCase();
  if (type.startsWith("image/")) return { image: data, mimetype: type, caption: caption || undefined };
  if (type.startsWith("video/")) return { video: data, mimetype: type, caption: caption || undefined };
  if (type.startsWith("audio/")) return { audio: data, mimetype: type || "audio/mpeg", ptt: false };
  return { document: data, mimetype: type || "application/octet-stream", fileName: filename || "file", caption: caption || undefined };
}

async function sendText(to, message) {
  await waitForOpen();
  const jid = normalizeToJid(to);
  return sock.sendMessage(jid, { text: String(message || "") });
}

async function sendMedia(body) {
  await waitForOpen();
  const jid = normalizeToJid(body.to);
  let data, detectedType = "";
  if (body.fileBase64) {
    data = Buffer.from(String(body.fileBase64), "base64");
    if (data.length > MAX_MEDIA_BYTES) throw new Error("file_too_large");
  } else if (body.fileUrl) {
    const d = await downloadMedia(String(body.fileUrl));
    data = d.data;
    detectedType = d.contentType;
  } else {
    throw new Error("file_required");
  }
  const payload = messageForMedia(data, body.mimetype || detectedType, body.filename, body.caption || body.message || "");
  return sock.sendMessage(jid, payload);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://container");

    if (url.pathname === "/status" && req.method === "GET") {
      return json(res, 200, { restored, version, connection, qr, me });
    }

    if (url.pathname === "/restore" && req.method === "POST") {
      const raw = (await readBody(req)).toString("utf8").trim();
      if (raw) await restoreSnapshot(JSON.parse(raw));
      else { await resetAuthDir(); restored = true; }
      sock = null; connection = "idle"; qr = null; me = null;
      return json(res, 200, { ok: true, restored });
    }

    if (url.pathname === "/state" && req.method === "GET") {
      return json(res, 200, { version, auth: await snapshotAuth() });
    }

    if (url.pathname === "/connect" && req.method === "POST") {
      await startSocket();
      const end = Date.now() + 5000;
      while (Date.now() < end && connection === "connecting") await new Promise(r => setTimeout(r, 100));
      return json(res, 200, { restored, version, connection, qr, me });
    }

    if (url.pathname === "/send" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      if (!body.to || !String(body.message || "").trim()) return json(res, 400, { error: "to_and_message_required" });
      const result = await sendText(body.to, body.message);
      return json(res, 200, { ok: true, id: result?.key?.id || null });
    }

    if (url.pathname === "/send-media" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      if (!body.to) return json(res, 400, { error: "to_required" });
      const result = await sendMedia(body);
      return json(res, 200, { ok: true, id: result?.key?.id || null });
    }

    if (url.pathname === "/logout" && req.method === "POST") {
      try { if (sock) await sock.logout(); } catch {}
      sock = null; connection = "logged_out"; qr = null; me = null;
      await resetAuthDir();
      restored = true;
      version += 1;
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: "not_found" });
  } catch (e) {
    logger.error({ err: e }, "request failed");
    const msg = String(e?.message || e);
    const status = msg === "payload_too_large" || msg === "file_too_large" ? 413 : 500;
    return json(res, status, { error: msg });
  }
});

server.listen(PORT, "0.0.0.0", () => logger.info({ port: PORT }, "KOSIF WhatsApp container v2 listening"));
