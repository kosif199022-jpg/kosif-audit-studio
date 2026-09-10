export const CHAT_SESSION_KEY = 'kosif:chat:session:v2';
const MAX_MESSAGES = 48;
const MAX_TEXT = 6000;
const ROLES = new Set(['user', 'assistant']);

export function sanitizeChatMessages(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(-MAX_MESSAGES).flatMap((item, index) => {
    const role = ROLES.has(item?.role) ? item.role : null;
    const text = typeof item?.text === 'string' ? item.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, MAX_TEXT) : '';
    if (!role || !text) return [];
    const id = typeof item?.id === 'string' && item.id.length <= 160 ? item.id : `restored-${index}`;
    return [{ id, role, text, done: true, local: item?.local === true }];
  });
}

export function loadChatMessages(storage = globalThis.sessionStorage) {
  try {
    if (!storage?.getItem) return [];
    const raw = storage.getItem(CHAT_SESSION_KEY);
    return raw ? sanitizeChatMessages(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveChatMessages(messages, storage = globalThis.sessionStorage) {
  try {
    if (!storage?.setItem) return false;
    storage.setItem(CHAT_SESSION_KEY, JSON.stringify(sanitizeChatMessages(messages)));
    return true;
  } catch {
    return false;
  }
}

export function clearChatMessages(storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem?.(CHAT_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}
