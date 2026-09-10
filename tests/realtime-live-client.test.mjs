import test from 'node:test';
import assert from 'node:assert/strict';
import { preferredRecorderMime, responseTranscript } from '../src/realtime-live-client.js';

test('Chromium prefers finalized WebM Opus for reliable live reply recording', () => {
  class Recorder {
    static isTypeSupported(type) { return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].includes(type); }
  }
  assert.equal(preferredRecorderMime(Recorder), 'audio/webm;codecs=opus');
});

test('Safari falls back to MP4 AAC when WebM recording is unavailable', () => {
  class Recorder {
    static isTypeSupported(type) { return ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4'].includes(type); }
  }
  assert.equal(preferredRecorderMime(Recorder), 'audio/mp4;codecs=mp4a.40.2');
});

test('response.done can recover the written transcript of an audio reply', () => {
  const text = responseTranscript({
    output: [{
      type: 'message',
      content: [
        { type: 'audio', transcript: 'هذا هو الرد الصوتي نفسه مكتوبًا.' },
        { type: 'text', text: 'تفصيل إضافي.' }
      ]
    }]
  });
  assert.equal(text, 'هذا هو الرد الصوتي نفسه مكتوبًا.\nتفصيل إضافي.');
});
