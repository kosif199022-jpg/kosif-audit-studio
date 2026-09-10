import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const voiceConsole = await readFile(new URL('../src/components/VoiceConsole.jsx', import.meta.url), 'utf8');
const textChat = await readFile(new URL('../src/components/TextCommandChat.jsx', import.meta.url), 'utf8');
const diagnostics = await readFile(new URL('../src/components/VoiceEnvironmentCheck.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/voice-console.css', import.meta.url), 'utf8');

test('conversation center keeps voice, written execution, and local tools as explicit modes', () => {
  assert.match(voiceConsole, /محادثة صوتية حية/);
  assert.match(voiceConsole, /شات وتنفيذ/);
  assert.match(voiceConsole, /أدوات محلية/);
  assert.match(voiceConsole, /VoiceEnvironmentCheck/);
});

test('written chat executes recognized navigation locally and retains session-only history', () => {
  assert.match(textChat, /executeLocalCommand/);
  assert.match(textChat, /parseVoiceCommand/);
  assert.match(textChat, /loadChatMessages/);
  assert.match(textChat, /sessionStorage/);
});

test('iPhone diagnostics expose speaker testing and mobile panel uses safe-area full-screen layout', () => {
  assert.match(diagnostics, /اختبار سماعة الجهاز/);
  assert.match(diagnostics, /RTCPeerConnection/);
  assert.match(diagnostics, /getUserMedia/);
  assert.match(css, /position: fixed/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /font-size: 16px/);
});
