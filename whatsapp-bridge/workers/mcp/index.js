// MCP server for the KOSIF WhatsApp bridge. The caller passes the bridge key per call; the
// Worker talks to the bridge over a service binding (BRIDGE) or, without one, over the public URL.
const VERSION = '1.0.0';
const PUBLIC_BRIDGE = 'https://wa-kosif.kosif199022.workers.dev';
const STORED = ['cv-ar', 'cv-en'];

function rpc(id, result) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
function err(id, code, message) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
function toolText(text, isError = false) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}
const normalizeTo = (v) => (String(v || '').includes('@') ? String(v).trim() : String(v || '').replace(/\D/g, ''));

async function callBridge(env, path, key, init = {}) {
  if (!key || typeof key !== 'string') throw new Error('BRIDGE_KEY_REQUIRED');
  const headers = new Headers(init.headers || {});
  headers.set('authorization', 'Bearer ' + key);
  if (init.body) headers.set('content-type', 'application/json');
  const req = new Request((env.BRIDGE ? 'https://wa-kosif.internal' : PUBLIC_BRIDGE) + path, { ...init, headers });
  return env.BRIDGE ? env.BRIDGE.fetch(req) : fetch(req);
}
async function bodyOf(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { error: text }; }
}
const post = (env, path, key, body) => callBridge(env, path, key, { method: 'POST', body: JSON.stringify(body) });

const keyProp = { type: 'string', description: 'Private KOSIF WhatsApp bridge key.' };
const toProp = { type: 'string', description: 'Recipient phone in international format (digits only), or a group id ending in @g.us.' };
const idemProp = { type: 'string', description: 'Optional. Reusing the same key never sends the same item twice.' };
const fileProps = {
  stored: { type: 'string', enum: STORED, description: 'A file already stored on the bridge: cv-ar (Arabic CV) or cv-en (English CV).' },
  fileUrl: { type: 'string', description: 'HTTPS URL of the file.' },
  fileBase64: { type: 'string', description: 'Base64-encoded file bytes.' },
  filename: { type: 'string', description: 'File name, e.g. CV.pdf.' },
  mimetype: { type: 'string', description: 'MIME type, e.g. application/pdf or image/jpeg.' },
  caption: { type: 'string', description: 'Optional caption.' },
};
const schema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });

const TOOLS = [
  {
    name: 'send_whatsapp_bundle',
    description: 'Send a message together with files (for example a message plus both CVs) to one recipient: one call, delivered in order. Prefer this over separate message and file calls.',
    inputSchema: schema({
      key: keyProp, to: toProp,
      message: { type: 'string', description: 'Text sent first.' },
      attachments: { type: 'array', maxItems: 9, items: schema(fileProps, []) },
      idempotencyKey: idemProp,
    }, ['key', 'to']),
  },
  {
    name: 'send_whatsapp_message',
    description: 'Send one WhatsApp text message immediately. Do not run a separate status check first.',
    inputSchema: schema({ key: keyProp, to: toProp, message: { type: 'string', minLength: 1, description: 'Exact text to send.' }, idempotencyKey: idemProp }, ['key', 'to', 'message']),
  },
  {
    name: 'send_whatsapp_file',
    description: 'Send one image, PDF, or other file immediately. Use stored for the CVs, fileUrl when available, otherwise fileBase64.',
    inputSchema: schema({ key: keyProp, to: toProp, ...fileProps, idempotencyKey: idemProp }, ['key', 'to']),
  },
  {
    name: 'list_whatsapp_messages',
    description: 'Read messages received on WhatsApp, newest first. Use when the user asks what someone sent or wants to reply to a message.',
    inputSchema: schema({
      key: keyProp,
      from: { type: 'string', description: 'Only messages from this phone number (optional).' },
      chat: { type: 'string', description: 'Only messages in this chat or group id (optional).' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Default 30.' },
      sync: { type: 'boolean', description: 'true (default) connects to WhatsApp first to fetch new messages; false reads the cache instantly.' },
    }, ['key']),
  },
  {
    name: 'list_whatsapp_groups',
    description: 'Groups the linked number is a member of, with the id to use as a recipient.',
    inputSchema: schema({ key: keyProp }, ['key']),
  },
  {
    name: 'schedule_whatsapp_message',
    description: 'Send a text message at a future time (ISO-8601 with timezone).',
    inputSchema: schema({ key: keyProp, to: toProp, message: { type: 'string', minLength: 1 }, at: { type: 'string', description: 'e.g. 2026-10-01T09:00:00+03:00' } }, ['key', 'to', 'message', 'at']),
  },
  {
    name: 'get_whatsapp_job',
    description: 'Delivery result for an idempotency key.',
    inputSchema: schema({ key: keyProp, jobKey: { type: 'string' } }, ['key', 'jobKey']),
  },
  {
    name: 'get_whatsapp_status',
    description: 'Check the WhatsApp connection only when the user explicitly asks for status, or after a connection error.',
    inputSchema: schema({ key: keyProp }, ['key']),
  },
];

function bundleSummary(r, b) {
  if (r.ok && b.sent) return toolText(b.duplicate ? 'already sent earlier (not sent again)' : `sent ${b.results.length} item(s)`);
  const done = (b.results || []).filter((x) => x.ok).length;
  const failed = (b.results || []).find((x) => !x.ok);
  return toolText(`not fully sent: ${done} item(s) delivered; error: ${b.error || failed?.error || 'send failed'}`, true);
}
function singleSummary(r, b) {
  return toolText(r.ok ? (b.duplicate ? 'already sent earlier (not sent again)' : 'sent') : (b.error || 'send failed'), !r.ok);
}
const fmtTime = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);

async function callTool(env, name, a) {
  const to = normalizeTo(a.to);
  if (name === 'send_whatsapp_bundle') {
    const message = String(a.message || '').trim();
    const attachments = Array.isArray(a.attachments) ? a.attachments : [];
    if (!to || (!message && !attachments.length)) return toolText('Missing recipient, or both message and attachments.', true);
    const r = await post(env, '/send-bundle', a.key, { to, message, attachments, idempotencyKey: a.idempotencyKey });
    return bundleSummary(r, await bodyOf(r));
  }
  if (name === 'send_whatsapp_message') {
    const message = String(a.message || '').trim();
    if (!to || !message) return toolText('Missing recipient or message.', true);
    const r = await post(env, '/send', a.key, { to, message, idempotencyKey: a.idempotencyKey });
    return singleSummary(r, await bodyOf(r));
  }
  if (name === 'send_whatsapp_file') {
    if (!to || (!a.stored && !a.fileUrl && !a.fileBase64)) return toolText('Missing recipient or file.', true);
    const { stored, fileUrl, fileBase64, filename, mimetype, caption, idempotencyKey } = a;
    const r = await post(env, '/send-media', a.key, { to, stored, fileUrl, fileBase64, filename, mimetype, caption: caption || '', idempotencyKey });
    return singleSummary(r, await bodyOf(r));
  }
  if (name === 'list_whatsapp_messages') {
    const q = new URLSearchParams({ limit: String(a.limit || 30), sync: a.sync === false ? '0' : '1' });
    if (a.from) q.set('from', normalizeTo(a.from));
    if (a.chat) q.set('chat', String(a.chat));
    const r = await callBridge(env, '/messages?' + q, a.key);
    const b = await bodyOf(r);
    if (!r.ok) return toolText(b.error || 'failed to read messages', true);
    if (!b.messages?.length) return toolText('no messages');
    const lines = b.messages.map((m) => `[${fmtTime(m.timestamp)}] ${m.name || m.phone || m.sender}${m.group ? ` (group ${m.chat})` : ''}: ${m.type === 'text' ? m.text : `<${m.type}> ${m.text}`.trim()}`);
    return toolText(lines.join('\n'));
  }
  if (name === 'list_whatsapp_groups') {
    const r = await callBridge(env, '/groups', a.key);
    const b = await bodyOf(r);
    if (!r.ok) return toolText(b.error || 'failed to list groups', true);
    return toolText((b.groups || []).map((g) => `${g.name} — ${g.id} (${g.participants})`).join('\n') || 'no groups');
  }
  if (name === 'schedule_whatsapp_message') {
    if (!to || !String(a.message || '').trim() || !a.at) return toolText('Missing recipient, message or time.', true);
    const r = await post(env, '/schedule', a.key, { to, message: String(a.message).trim(), at: a.at });
    const b = await bodyOf(r);
    return toolText(r.ok ? `scheduled for ${b.at} (id ${b.id})` : (b.error || 'scheduling failed'), !r.ok);
  }
  if (name === 'get_whatsapp_job') {
    const r = await callBridge(env, '/jobs/' + encodeURIComponent(String(a.jobKey || '')), a.key);
    return toolText(await r.text(), !r.ok);
  }
  if (name === 'get_whatsapp_status') {
    const r = await callBridge(env, '/status', a.key);
    return toolText(await r.text(), !r.ok);
  }
  return null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/') return new Response('KOSIF WhatsApp MCP online\n');
    if (url.pathname !== '/mcp') return new Response('Not found', { status: 404 });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    let msg;
    try { msg = await req.json(); } catch { return err(null, -32700, 'Parse error'); }
    const id = msg.id;
    if (msg.method === 'initialize') {
      return rpc(id, { protocolVersion: msg.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'kosif-whatsapp', version: VERSION } });
    }
    if (msg.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (msg.method === 'ping') return rpc(id, {});
    if (msg.method === 'tools/list') return rpc(id, { tools: TOOLS });
    if (msg.method === 'tools/call') {
      try {
        const result = await callTool(env, msg.params?.name, msg.params?.arguments || {});
        return result ? rpc(id, result) : err(id, -32602, 'Unknown tool');
      } catch (e) {
        return rpc(id, toolText(e?.message === 'BRIDGE_KEY_REQUIRED' ? 'Bridge key is required.' : 'Request failed.', true));
      }
    }
    return err(id, -32601, 'Method not found');
  },
};
