import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionFor, isTouchAppleDevice } from '../src/audio-export.js';

test('audio export chooses an iPhone-friendly extension when possible', () => {
  assert.equal(extensionFor('audio/mp4'), 'm4a');
  assert.equal(extensionFor('audio/aac'), 'm4a');
  assert.equal(extensionFor('audio/mpeg'), 'mp3');
  assert.equal(extensionFor('audio/ogg;codecs=opus'), 'ogg');
  assert.equal(extensionFor('audio/wav'), 'wav');
  assert.equal(extensionFor('audio/webm;codecs=opus'), 'webm');
  assert.equal(extensionFor(''), 'webm');
});

test('touch Apple detection includes iPhone and touch-capable iPad desktop mode', () => {
  assert.equal(isTouchAppleDevice({ platform: 'iPhone', userAgent: 'Mobile Safari', maxTouchPoints: 5 }), true);
  assert.equal(isTouchAppleDevice({ platform: 'MacIntel', userAgent: 'Safari', maxTouchPoints: 5 }), true);
  assert.equal(isTouchAppleDevice({ platform: 'Win32', userAgent: 'Chrome', maxTouchPoints: 0 }), false);
});
