import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeTextClient } from '../src/realtime-text-client.js';

class Channel {
  constructor() { this.readyState = 'open'; this.sent = []; }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() {}
}

class Peer {
  constructor() {
    this.iceGatheringState = 'complete';
    this.connectionState = 'new';
    this.channel = new Channel();
    Peer.last = this;
  }
  addTransceiver(kind, options) { this.transceiver = { kind, options }; }
  createDataChannel() { return this.channel; }
  createOffer() { return Promise.resolve({ type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111' }); }
  setLocalDescription(offer) { this.localDescription = offer; return Promise.resolve(); }
  setRemoteDescription(answer) { this.remoteDescription = answer; this.connectionState = 'connected'; return Promise.resolve(); }
  close() {}
}

test('written chat opens without microphone access and sends text through realtime', async () => {
  let requestBody;
  const transcripts = [];
  const client = createRealtimeTextClient({
    PeerConnection: Peer,
    navigatorObject: { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 },
    fetcher: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return Response.json({ sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111' });
    },
    onTranscript: (item) => transcripts.push(item)
  });

  await client.connect({ consent: true, model: 'gpt-realtime-2.1', voice: 'marin' });
  assert.equal(Peer.last.transceiver.kind, 'audio');
  assert.equal(Peer.last.transceiver.options.direction, 'recvonly');
  assert.match(requestBody.sdp, /m=audio/);
  assert.equal(client.sendText('افتح التقارير'), true);
  assert.equal(transcripts.at(-1).text, 'افتح التقارير');
  assert.equal(Peer.last.channel.sent.some((event) => event.type === 'response.create'), true);
  client.disconnect(false);
});

test('written realtime tool calls execute allow-listed KOSIF navigation', async () => {
  const opened = [];
  const client = createRealtimeTextClient({
    PeerConnection: Peer,
    fetcher: async () => Response.json({ sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111' }),
    onView: (view) => opened.push(view)
  });
  await client.connect({ consent: true, model: 'gpt-realtime-2.1', voice: 'marin' });
  Peer.last.channel.onmessage({ data: JSON.stringify({
    type: 'response.done',
    response: {
      id: 'r1',
      output: [{ type: 'function_call', call_id: 'c1', name: 'open_workspace', arguments: JSON.stringify({ view: 'council' }) }]
    }
  }) });
  assert.deepEqual(opened, ['council']);
  assert.equal(Peer.last.channel.sent.some((event) => event.item?.type === 'function_call_output'), true);
  client.disconnect(false);
});
