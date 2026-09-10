import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveIceGatherTimeout,
  isIOSWebKit,
  preferredRecorderMime,
  requestMicrophoneStream,
  responseTranscript
} from '../src/realtime-live-client.js';

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

test('iPhone and iPad desktop mode are detected as iOS WebKit', () => {
  assert.equal(isIOSWebKit({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }), true);
  assert.equal(isIOSWebKit({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isIOSWebKit({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0 }), false);
});

test('iPhone Safari gets a longer ICE gathering window', () => {
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', maxTouchPoints: 5 };
  const desktop = { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', maxTouchPoints: 0 };
  assert.equal(effectiveIceGatherTimeout(3000, iphone), 10000);
  assert.equal(effectiveIceGatherTimeout(3000, desktop), 3000);
});

test('iPhone microphone request uses the broad Safari-safe audio constraint', async () => {
  let constraints;
  const stream = { getAudioTracks: () => [{ contentHint: '' }] };
  const mediaDevices = { getUserMedia: async (value) => { constraints = value; return stream; } };
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', maxTouchPoints: 5 };
  assert.equal(await requestMicrophoneStream(mediaDevices, iphone), stream);
  assert.deepEqual(constraints, { audio: true });
});
