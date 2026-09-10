import { AI_ERRORS, VoiceError, aiRequest, executeVoiceTool } from './realtime-client.js';

const nativeFetch = (url, options) => globalThis.fetch(url, options);
const voiceError = (code, options = {}) => new VoiceError(code, AI_ERRORS[code], options);

function isIOSWebKit(navigatorObject = globalThis.navigator) {
  if (!navigatorObject) return false;
  const userAgent = String(navigatorObject.userAgent || '');
  const platform = String(navigatorObject.platform || '');
  return /iPhone|iPad|iPod/i.test(userAgent)
    || /iP(hone|ad|od)/i.test(platform)
    || (/Mac/i.test(platform) && Number(navigatorObject.maxTouchPoints || 0) > 1);
}

function waitForIceGathering(peer, timeoutMs) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      peer.removeEventListener?.('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => {
      if (peer.iceGatheringState === 'complete') finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    peer.addEventListener?.('icegatheringstatechange', onChange);
  });
}

function responseTranscript(response) {
  const texts = [];
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;
    for (const part of item.content || []) {
      const value = typeof part?.transcript === 'string' ? part.transcript
        : typeof part?.text === 'string' ? part.text : '';
      if (value.trim()) texts.push(value.trim());
    }
  }
  return texts.join('\n').trim();
}

export function createRealtimeTextClient({
  fetcher = nativeFetch,
  PeerConnection = globalThis.RTCPeerConnection,
  navigatorObject = globalThis.navigator,
  onStatus = () => {},
  onTranscript = () => {},
  onView = () => {}
} = {}) {
  let peer = null;
  let channel = null;
  let controller = null;
  let generation = 0;
  let connectTimer = null;
  const handledCalls = new Set();
  const completedResponses = new Set();
  const responseItems = new Map();
  const ios = isIOSWebKit(navigatorObject);

  function send(event) {
    if (channel?.readyState !== 'open') return false;
    try {
      channel.send(JSON.stringify(event));
      return true;
    } catch {
      onStatus('connected', 'تعذر إرسال الرسالة؛ أعد المحاولة.');
      return false;
    }
  }

  function disconnect(notify = true) {
    generation += 1;
    controller?.abort();
    controller = null;
    clearTimeout(connectTimer);
    connectTimer = null;
    const oldChannel = channel;
    channel = null;
    const oldPeer = peer;
    peer = null;
    if (oldChannel) {
      oldChannel.onmessage = null;
      oldChannel.onclose = null;
      oldChannel.onerror = null;
      try { oldChannel.close?.(); } catch {}
    }
    if (oldPeer) {
      oldPeer.onconnectionstatechange = null;
      oldPeer.ontrack = null;
      try { oldPeer.close?.(); } catch {}
    }
    handledCalls.clear();
    completedResponses.clear();
    responseItems.clear();
    if (notify) onStatus('idle', 'تم إغلاق الشات.');
  }

  function handleMessage(event, active) {
    if (active !== generation || typeof event.data !== 'string' || event.data.length > 350_000) return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    const responseId = message.response_id || message.response?.id || null;
    const itemId = message.item_id || null;
    if (responseId && itemId) responseItems.set(responseId, itemId);

    if (['response.output_audio_transcript.delta', 'response.output_text.delta'].includes(message.type)) {
      onTranscript({ id: itemId || responseId, responseId, role: 'assistant', text: String(message.delta || ''), done: false });
    }
    if (['response.output_audio_transcript.done', 'response.output_text.done'].includes(message.type)) {
      if (responseId) completedResponses.add(responseId);
      onTranscript({ id: itemId || responseId, responseId, role: 'assistant', text: String(message.transcript || message.text || '').slice(0, 12_000), done: true });
    }
    if (message.type === 'response.done') {
      for (const outputItem of message.response?.output || []) {
        if (responseId && outputItem?.id && outputItem.type === 'message') responseItems.set(responseId, outputItem.id);
      }
      if (responseId && !completedResponses.has(responseId)) {
        const text = responseTranscript(message.response);
        if (text) {
          completedResponses.add(responseId);
          onTranscript({ id: responseItems.get(responseId) || responseId, responseId, role: 'assistant', text: text.slice(0, 12_000), done: true });
        }
      }
      let called = false;
      for (const item of message.response?.output || []) {
        if (item.type !== 'function_call' || typeof item.call_id !== 'string' || item.call_id.length > 128 || handledCalls.has(item.call_id)) continue;
        handledCalls.add(item.call_id);
        const result = executeVoiceTool(item, onView);
        send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(result) } });
        called = true;
      }
      if (called) send({ type: 'response.create' });
      else onStatus('connected', 'الشات متصل؛ اكتب طلبك وسينفذ KOSIF أوامر التنقل المسموحة داخل التطبيق.');
    }
    if (message.type === 'error') onStatus('connected', 'تعذر إكمال الرد؛ أعد صياغة الطلب.');
  }

  async function connect(options = {}) {
    const preflightCode = options.consent !== true ? 'consent_required'
      : globalThis.isSecureContext === false ? 'insecure_context'
        : !PeerConnection ? 'unsupported' : null;
    if (preflightCode) {
      onStatus('error', AI_ERRORS[preflightCode]);
      throw voiceError(preflightCode);
    }

    disconnect(false);
    const active = ++generation;
    onStatus('connecting', 'جارٍ فتح شات KOSIF بدون ميكروفون…');
    try {
      peer = new PeerConnection();
      if (typeof peer.addTransceiver !== 'function') throw voiceError('unsupported');
      peer.addTransceiver('audio', { direction: 'recvonly' });
      peer.ontrack = (event) => {
        // Text chat deliberately does not autoplay Realtime audio. We only use
        // the transcript and tool events, so Safari never needs microphone or autoplay permission here.
        try { if (event.track) event.track.enabled = false; } catch {}
      };
      channel = peer.createDataChannel('oai-events');
      channel.onopen = () => {
        if (active !== generation) return;
        clearTimeout(connectTimer);
        connectTimer = null;
        onStatus('connected', 'شات KOSIF متصل؛ اكتب طلبك الآن.');
      };
      channel.onclose = () => {
        if (active === generation) disconnect();
      };
      channel.onerror = () => {
        if (active === generation) onStatus('error', AI_ERRORS.connect_failed);
      };
      channel.onmessage = (event) => handleMessage(event, active);
      peer.onconnectionstatechange = () => {
        if (active !== generation) return;
        if (['failed', 'closed', 'disconnected'].includes(peer?.connectionState)) {
          disconnect(false);
          onStatus('error', AI_ERRORS.disconnected);
        }
      };

      controller = new AbortController();
      connectTimer = setTimeout(() => {
        if (active === generation) {
          disconnect(false);
          onStatus('error', AI_ERRORS.timeout);
        }
      }, ios ? 50_000 : 35_000);

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer, ios ? 10_000 : 3_000);
      const localSdp = peer.localDescription?.sdp || offer.sdp;
      if (typeof localSdp !== 'string' || !localSdp.includes('m=audio')) throw voiceError('invalid_sdp');
      const result = await aiRequest('realtime', {
        sdp: localSdp,
        model: options.model,
        voice: options.voice,
        consent: true,
        shareSummary: options.shareSummary === true,
        summary: options.shareSummary ? options.summary : {}
      }, { fetcher, signal: controller.signal, timeoutMs: ios ? 40_000 : 20_000 });
      if (active !== generation) return;
      if (typeof result?.sdp !== 'string' || !result.sdp.startsWith('v=0')) throw voiceError('bad_answer');
      await peer.setRemoteDescription({ type: 'answer', sdp: result.sdp });
    } catch (error) {
      if (active !== generation) return;
      disconnect(false);
      const label = error instanceof VoiceError ? error.message : (error?.message || AI_ERRORS.connect_failed);
      onStatus('error', label);
      throw error;
    }
  }

  return {
    connect,
    disconnect,
    sendText(value) {
      const text = String(value || '').trim().slice(0, 2_000);
      if (!text || channel?.readyState !== 'open') return false;
      if (!send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } })) return false;
      send({ type: 'response.create' });
      const id = globalThis.crypto?.randomUUID?.() || `typed-${Date.now()}`;
      onTranscript({ id, role: 'user', text, done: true });
      return true;
    }
  };
}
