import { downloadAudioBlob } from './audio-export.js';

const LAME_SCRIPT = '/vendor/lame.min.js';
const MP3_SAMPLE_RATES = Object.freeze([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);
let lameLoader = null;

export function chooseMp3SampleRate(value) {
  const input = Number(value);
  if (!Number.isFinite(input) || input <= 0) return 44100;
  return MP3_SAMPLE_RATES.reduce((best, rate) => Math.abs(rate - input) < Math.abs(best - input) ? rate : best, 44100);
}

export function floatToInt16(samples) {
  const source = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  const output = new Int16Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    const value = Math.max(-1, Math.min(1, Number.isFinite(source[index]) ? source[index] : 0));
    output[index] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
  }
  return output;
}

export function resampleFloat32(samples, sourceRate, targetRate) {
  const input = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  const from = Number(sourceRate);
  const to = Number(targetRate);
  if (!input.length || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0 || from === to) return input.slice();
  const outputLength = Math.max(1, Math.round(input.length * to / from));
  const output = new Float32Array(outputLength);
  const ratio = from / to;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.min(input.length - 1, Math.floor(position));
    const right = Math.min(input.length - 1, left + 1);
    const mix = position - left;
    output[index] = input[left] + (input[right] - input[left]) * mix;
  }
  return output;
}

function loadLameEncoder() {
  if (globalThis.lamejs?.Mp3Encoder) return Promise.resolve(globalThis.lamejs);
  if (lameLoader) return lameLoader;
  if (typeof document === 'undefined') return Promise.reject(new Error('MP3_ENCODER_BROWSER_REQUIRED'));
  lameLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-kosif-mp3="true"]`);
    if (existing) {
      existing.addEventListener('load', () => globalThis.lamejs?.Mp3Encoder ? resolve(globalThis.lamejs) : reject(new Error('MP3_ENCODER_UNAVAILABLE')), { once: true });
      existing.addEventListener('error', () => reject(new Error('MP3_ENCODER_LOAD_FAILED')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = LAME_SCRIPT;
    script.async = true;
    script.dataset.kosifMp3 = 'true';
    script.onload = () => globalThis.lamejs?.Mp3Encoder ? resolve(globalThis.lamejs) : reject(new Error('MP3_ENCODER_UNAVAILABLE'));
    script.onerror = () => reject(new Error('MP3_ENCODER_LOAD_FAILED'));
    document.head.appendChild(script);
  }).catch((error) => {
    lameLoader = null;
    throw error;
  });
  return lameLoader;
}

async function decodeAudioBlob(blob) {
  if (!(blob instanceof Blob) || blob.size < 256) throw new TypeError('AUDIO_BLOB_REQUIRED');
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error('AUDIO_DECODE_UNAVAILABLE');
  const context = new AudioContextClass();
  try {
    const bytes = await blob.arrayBuffer();
    return await context.decodeAudioData(bytes.slice(0));
  } finally {
    try { await context.close(); } catch {}
  }
}

export async function audioBufferToMp3(audioBuffer, { bitrate = 96 } = {}) {
  if (!audioBuffer?.numberOfChannels || !audioBuffer?.length) throw new TypeError('AUDIO_BUFFER_REQUIRED');
  const lame = await loadLameEncoder();
  const channels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
  const sampleRate = chooseMp3SampleRate(audioBuffer.sampleRate);
  const leftSource = audioBuffer.getChannelData(0);
  const left = resampleFloat32(leftSource, audioBuffer.sampleRate, sampleRate);
  const right = channels === 2
    ? resampleFloat32(audioBuffer.getChannelData(1), audioBuffer.sampleRate, sampleRate)
    : null;
  const encoder = new lame.Mp3Encoder(channels, sampleRate, Math.max(32, Math.min(192, Math.round(Number(bitrate) || 96))));
  const parts = [];
  const blockSize = 1152;
  for (let offset = 0; offset < left.length; offset += blockSize) {
    const leftPcm = floatToInt16(left.subarray(offset, Math.min(left.length, offset + blockSize)));
    const encoded = channels === 2
      ? encoder.encodeBuffer(leftPcm, floatToInt16(right.subarray(offset, Math.min(right.length, offset + blockSize))))
      : encoder.encodeBuffer(leftPcm);
    if (encoded?.length) parts.push(new Uint8Array(encoded));
  }
  const tail = encoder.flush();
  if (tail?.length) parts.push(new Uint8Array(tail));
  if (!parts.length) throw new Error('MP3_ENCODING_EMPTY');
  return new Blob(parts, { type: 'audio/mpeg' });
}

export async function transcodeAudioBlobToMp3(blob, options) {
  if (blob?.type === 'audio/mpeg' || blob?.type === 'audio/mp3') return new Blob([await blob.arrayBuffer()], { type: 'audio/mpeg' });
  return audioBufferToMp3(await decodeAudioBlob(blob), options);
}

export async function saveAudioReplyAsMp3(reply) {
  if (!reply?.blob) throw new TypeError('AUDIO_REPLY_REQUIRED');
  const mp3 = await transcodeAudioBlobToMp3(reply.blob, { bitrate: 96 });
  const stamp = new Date(reply.createdAt || Date.now()).toISOString().replace(/[:.]/g, '-');
  await downloadAudioBlob(mp3, `KOSIF-audio-${stamp}.mp3`);
  return mp3;
}
