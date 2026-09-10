import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseMp3SampleRate, floatToInt16, resampleFloat32, transcodeAudioBlobToMp3 } from '../src/mp3-export.js';

test('MP3 export chooses a supported sample rate nearest to the decoded reply', () => {
  assert.equal(chooseMp3SampleRate(48000), 48000);
  assert.equal(chooseMp3SampleRate(44100), 44100);
  assert.equal(chooseMp3SampleRate(44150), 44100);
  assert.equal(chooseMp3SampleRate(23900), 24000);
  assert.equal(chooseMp3SampleRate(0), 44100);
});

test('PCM conversion clamps malformed and out-of-range samples safely', () => {
  const pcm = floatToInt16(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2, Number.NaN]));
  assert.deepEqual([...pcm], [-32768, -32768, -16384, 0, 16384, 32767, 32767, 0]);
});

test('resampling preserves duration approximately and remains bounded', () => {
  const input = Float32Array.from({ length: 4800 }, (_, index) => Math.sin(index / 10));
  const output = resampleFloat32(input, 48000, 24000);
  assert.equal(output.length, 2400);
  assert.equal([...output].every((value) => Number.isFinite(value) && Math.abs(value) <= 1.000001), true);
});

test('already-MP3 audio stays a genuine audio/mpeg blob', async () => {
  const source = new Blob([Uint8Array.from([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0, 0, 0])], { type: 'audio/mpeg' });
  const result = await transcodeAudioBlobToMp3(source);
  assert.equal(result.type, 'audio/mpeg');
  assert.equal(result.size, source.size);
});
