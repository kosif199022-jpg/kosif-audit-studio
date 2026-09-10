import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_SESSION_KEY, clearChatMessages, loadChatMessages, sanitizeChatMessages, saveChatMessages } from '../src/chat-session.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

test('chat history keeps only bounded user and assistant text', () => {
  const input = Array.from({ length: 60 }, (_, index) => ({ id: `m-${index}`, role: index % 2 ? 'assistant' : 'user', text: `message ${index}` }));
  input.push({ role: 'system', text: 'must not persist' });
  const safe = sanitizeChatMessages(input);
  assert.equal(safe.length, 47);
  assert.equal(safe.some((item) => item.role === 'system'), false);
  assert.equal(safe.at(-1).text, 'message 59');
});

test('chat history round-trips through session-like storage and can be cleared', () => {
  const storage = memoryStorage();
  assert.equal(saveChatMessages([{ id: 'u1', role: 'user', text: 'افتح النتائج', local: true }], storage), true);
  assert.equal(JSON.parse(storage.getItem(CHAT_SESSION_KEY)).length, 1);
  assert.deepEqual(loadChatMessages(storage), [{ id: 'u1', role: 'user', text: 'افتح النتائج', done: true, local: true }]);
  assert.equal(clearChatMessages(storage), true);
  assert.deepEqual(loadChatMessages(storage), []);
});

test('chat persistence fails safe when browser storage is unavailable', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadChatMessages(broken), []);
  assert.equal(saveChatMessages([], broken), false);
  assert.equal(clearChatMessages(broken), false);
});
