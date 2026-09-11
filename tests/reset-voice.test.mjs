import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("reset production mounts the dedicated realtime voice launcher", async () => {
  const main = await read("src/main.jsx");
  assert.match(main, /ResetVoiceLauncher/);
  assert.match(main, /<ResetVoiceLauncher \/>/);
  assert.doesNotMatch(main, /VoiceConsole|LocalVoice|browser.*reader/i);
});

test("reset voice defers the heavy realtime experience until the user opens it", async () => {
  const [launcher, experience] = await Promise.all([
    read("src/components/ResetVoiceLauncher.jsx"),
    read("src/components/ResetVoiceExperience.jsx"),
  ]);
  assert.match(launcher, /lazy\(\(\) => import\("\.\/ResetVoiceExperience\.jsx"\)/);
  assert.doesNotMatch(launcher, /voice-console\.css/);
  assert.match(experience, /RealtimeVoice/);
  assert.match(experience, /voice-console\.css/);
});

test("restored voice keeps two-way audio, written transcript, MP3 export, and no browser-reader fallback", async () => {
  const voice = await read("src/components/RealtimeVoice.jsx");
  assert.match(voice, /تتحدث بالصوت ← يرد KOSIF بالصوت ويعرض نفس الرد مكتوبًا/);
  assert.match(voice, /تنزيل MP3/);
  assert.match(voice, /saveAudioReplyAsMp3/);
  assert.match(voice, /تفعيل سماع الرد على iPhone/);
  assert.match(voice, /createRealtimeLiveClient/);
  assert.doesNotMatch(voice, /speechSynthesis|SpeechRecognition|webkitSpeechRecognition/);
});

test("voice overlay is mobile safe and uses the reset light-dark design tokens", async () => {
  const css = await read("src/reset-voice.css");
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /--surface: var\(--reset-surface\)/);
  assert.match(css, /--gold: var\(--reset-primary-2\)/);
});
