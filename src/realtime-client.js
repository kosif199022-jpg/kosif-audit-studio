// The permanent API key never reaches this module. The server returns only a
// short-lived SDP answer and the browser keeps the BYOK session in an HttpOnly
// cookie.
export const VOICE_WORKSPACES = Object.freeze([
  'overview', 'data-intake', 'trial-balance', 'standards', 'evidence',
  'rounds', 'council', 'risk', 'reports', 'intelligence', 'ai-connections',
  'report-clone'
]);

export const AI_ERRORS = Object.freeze({
  session_required: 'انتهت جلسة API؛ أضف مفتاحك مجددًا.',
  provider_unconfigured: 'أضف مفتاح OpenAI من شاشة اتصالات AI أولًا.',
  provider_auth: 'رفض OpenAI المفتاح أو صلاحياته.',
  provider_quota: 'راجع رصيد OpenAI وحدود الاستخدام.',
  provider_model: 'النموذج الصوتي غير متاح في حسابك؛ اختر gpt-realtime أو نموذجًا مدعومًا.',
  provider_request: 'رفض OpenAI إعداد جلسة الصوت؛ تحقق من النموذج والصوت ثم أعد المحاولة.',
  provider_error: 'تعذر تشغيل النموذج؛ تحقق من إتاحته في حسابك.',
  provider_timeout: 'انتهت مهلة OpenAI قبل اكتمال جلسة الصوت؛ أعد المحاولة.',
  provider_unreachable: 'تعذر الوصول إلى OpenAI من خادم التطبيق؛ أعد المحاولة بعد قليل.',
  invalid_realtime_answer: 'أعاد OpenAI إجابة اتصال غير صالحة؛ أعد المحاولة.',
  ai_storage_unavailable: 'خدمة المفاتيح غير متاحة الآن.',
  consent_required: 'وافق على إرسال الصوت لبدء المحادثة.',
  invalid_sdp: 'تعذر تجهيز اتصال الصوت.',
  request_failed: 'تعذر الاتصال بالخدمة.',
  network: 'تعذر الوصول إلى خادم الصوت. تحقق من اتصالك بالإنترنت.',
  timeout: 'انتهت مهلة الاتصال. حاول مرة أخرى.',
  insecure_context: 'المحادثة الصوتية تتطلب فتح الموقع عبر HTTPS.',
  unsupported: 'المتصفح لا يدعم المحادثة الصوتية عبر WebRTC.',
  mic_denied: 'تم رفض إذن الميكروفون؛ فعّله من إعدادات الموقع ثم أعد المحاولة.',
  mic_missing: 'لم يُعثر على ميكروفون متصل بالجهاز.',
  mic_busy: 'الميكروفون مستخدم من تطبيق آخر؛ أغلقه ثم أعد المحاولة.',
  mic_failed: 'تعذر فتح الميكروفون.',
  bad_response: 'رد خادم الصوت غير صالح.',
  bad_answer: 'لم يُرجع خادم الصوت إجابة SDP صالحة.',
  connect_failed: 'تعذر إنشاء اتصال الصوت.',
  disconnected: 'انقطع اتصال الصوت؛ أُغلق الميكروفون ويمكن إعادة الاتصال.'
});

export class VoiceError extends Error {
  constructor(code, message = AI_ERRORS[code] || AI_ERRORS.request_failed, options = {}) {
    super(message, options);
    this.name = 'VoiceError';
    this.code = code;
    this.retriable = options.retriable === true;
  }
}

const voiceError = (code, options) => new VoiceError(code, AI_ERRORS[code], options);

// Keep the browser's global fetch receiver intact (Safari/WebKit rejects an
// unbound native fetch when it is passed as a callback).
const aiFetch = (url, options) => globalThis.fetch(url, options);

function timeoutSignal(ms) {
  if (!ms) return undefined;
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
  return controller.signal;
}

function anySignal(signals) {
  const list = signals.filter(Boolean);
  if (list.length < 2) return list[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list);
  const controller = new AbortController();
  const abort = (signal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
    for (const item of list) item.removeEventListener?.('abort', item._voiceAbortHandler);
  };
  for (const signal of list) {
    if (signal.aborted) { abort(signal); break; }
    signal._voiceAbortHandler = () => abort(signal);
    signal.addEventListener('abort', signal._voiceAbortHandler, { once: true });
  }
  return controller.signal;
}

function mapMediaError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return voiceError('mic_denied');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return voiceError('mic_missing');
    case 'NotReadableError':
    case 'AbortError':
      return voiceError('mic_busy', { retriable: true });
    default:
      return new VoiceError('mic_failed', AI_ERRORS.mic_failed, { cause: error, retriable: true });
  }
}

function waitForIceGathering(peer, timeoutMs = 3000) {
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

function readJsonResponse(response) {
  return response.text().then((raw) => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  });
}

export async function aiRequest(path, body, {
  fetcher = aiFetch,
  signal,
  timeoutMs = 20000
} = {}) {
  let response;
  try {
    response = await fetcher('/api/ai/' + path, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: anySignal([signal, timeoutSignal(timeoutMs)])
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') throw voiceError('timeout', { cause: error, retriable: true });
    if (error?.name === 'AbortError') throw voiceError('request_failed', { cause: error });
    throw new VoiceError('network', AI_ERRORS.network, { cause: error, retriable: true });
  }

  const data = await readJsonResponse(response).catch(() => null);
  if (!response.ok) {
    const code = data?.error || 'request_failed';
    throw new VoiceError(code, AI_ERRORS[code] || data?.message || AI_ERRORS.request_failed, {
      retriable: response.status >= 500 || response.status === 429
    });
  }
  if (!data || typeof data !== 'object') throw voiceError('bad_response');
  return data;
}

export function executeVoiceTool(item, onView) {
  if (item?.type !== 'function_call' || item.name !== 'open_workspace') {
    return { ok: false, error: 'tool_not_allowed' };
  }
  try {
    if (typeof item.arguments !== 'string' || item.arguments.length > 400) {
      return { ok: false, error: 'invalid_arguments' };
    }
    const args = JSON.parse(item.arguments);
    if (!args || Object.keys(args).length !== 1 || !VOICE_WORKSPACES.includes(args.view)) {
      return { ok: false, error: 'view_not_allowed' };
    }
    onView?.(args.view);
    return { ok: true, opened: args.view };
  } catch {
    return { ok: false, error: 'invalid_arguments' };
  }
}

export function createRealtimeClient({
  fetcher = aiFetch,
  PeerConnection = globalThis.RTCPeerConnection,
  mediaDevices = globalThis.navigator?.mediaDevices,
  AudioElement = globalThis.Audio,
  onStatus = () => {},
  onTranscript = () => {},
  onView = () => {},
  onAudioBlocked = () => {},
  iceGatherTimeoutMs = 3000
} = {}) {
  let peer = null;
  let channel = null;
  let stream = null;
  let audio = null;
  let controller = null;
  let generation = 0;
  let connectTimer = null;
  const handledCalls = new Set();

  function send(event) {
    if (channel?.readyState === 'open') {
      channel.send(JSON.stringify(event));
      return true;
    }
    return false;
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
      try { oldChannel.close(); } catch {}
    }
    if (oldPeer) {
      oldPeer.onconnectionstatechange = null;
      oldPeer.ontrack = null;
      try { oldPeer.close(); } catch {}
    }
    stream?.getTracks?.().forEach((track) => {
      try { track.stop(); } catch {}
    });
    stream = null;
    if (audio) {
      try { audio.pause?.(); } catch {}
      audio.srcObject = null;
      audio.remove?.();
      audio = null;
    }
    handledCalls.clear();
    if (notify) onStatus('idle', 'انتهت المحادثة وأُغلق الميكروفون.');
  }

  async function connect(options = {}) {
    const preflightCode = options.consent !== true ? 'consent_required'
      : globalThis.isSecureContext === false ? 'insecure_context'
        : !PeerConnection || !mediaDevices?.getUserMedia || !AudioElement ? 'unsupported' : null;
    if (preflightCode) {
      onStatus('error', AI_ERRORS[preflightCode]);
      throw voiceError(preflightCode);
    }

    disconnect(false);
    const active = ++generation;
    onStatus('connecting', 'جارٍ تجهيز اتصال الصوت…');

    try {
      let acquired;
      try {
        acquired = await mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1
          }
        });
      } catch (error) {
        throw mapMediaError(error);
      }
      if (active !== generation) {
        acquired.getTracks?.().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      peer = new PeerConnection();

      audio = new AudioElement();
      audio.autoplay = true;
      audio.playsInline = true;
      audio.setAttribute?.('playsinline', '');
      audio.setAttribute?.('aria-hidden', 'true');
      audio.style && (audio.style.display = 'none');
      // Safari is more reliable when the autoplay media element is attached to
      // the document before the remote track arrives.
      if (typeof document !== 'undefined' && document.body && audio instanceof Element) {
        document.body.appendChild(audio);
      }
      peer.ontrack = (event) => {
        if (!audio) return;
        const remote = event.streams?.[0] || (
          globalThis.MediaStream && event.track ? new globalThis.MediaStream([event.track]) : null
        );
        if (!remote) return;
        audio.srcObject = remote;
        Promise.resolve(audio.play?.()).catch(() => onAudioBlocked(audio));
      };
      stream.getAudioTracks?.().forEach((track) => peer.addTrack(track, stream));

      channel = peer.createDataChannel('oai-events');
      channel.onopen = () => {
        if (active === generation) {
          clearTimeout(connectTimer);
          onStatus('connected', 'المحادثة متصلة؛ تحدث أو اكتب سؤالك.');
        }
      };
      channel.onclose = () => {
        if (active === generation) disconnect();
      };
      channel.onerror = () => {
        if (active === generation) onStatus('error', AI_ERRORS.connect_failed);
      };
      channel.onmessage = (event) => {
        if (active !== generation || typeof event.data !== 'string' || event.data.length > 100000) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'conversation.item.input_audio_transcription.completed') {
          onTranscript({ id: message.item_id, role: 'user', text: String(message.transcript || '').slice(0, 8000), done: true });
        }
        if (['response.output_audio_transcript.delta', 'response.output_text.delta'].includes(message.type)) {
          onTranscript({ id: message.item_id || message.response_id, role: 'assistant', text: String(message.delta || ''), done: false });
        }
        if (['response.output_audio_transcript.done', 'response.output_text.done'].includes(message.type)) {
          onTranscript({ id: message.item_id || message.response_id, role: 'assistant', text: String(message.transcript || message.text || '').slice(0, 12000), done: true });
        }
        if (message.type === 'input_audio_buffer.speech_started') onStatus('connected', 'أستمع إليك…');
        if (message.type === 'response.done') {
          let called = false;
          for (const item of message.response?.output || []) {
            if (item.type !== 'function_call' || typeof item.call_id !== 'string' || item.call_id.length > 128 || handledCalls.has(item.call_id)) continue;
            handledCalls.add(item.call_id);
            if (handledCalls.size > 1000) {
              disconnect();
              return;
            }
            send({
              type: 'conversation.item.create',
              item: { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(executeVoiceTool(item, onView)) }
            });
            called = true;
          }
          if (called) send({ type: 'response.create' });
        }
        if (message.type === 'error') onStatus('connected', 'تعذر إكمال الرد الصوتي؛ أعد السؤال أو أنهِ الاتصال.');
      };

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
      }, 35000);

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer, iceGatherTimeoutMs);
      const localSdp = peer.localDescription?.sdp || offer.sdp;
      const result = await aiRequest('realtime', {
        sdp: localSdp,
        model: options.model,
        voice: options.voice,
        consent: true,
        shareSummary: options.shareSummary === true,
        summary: options.shareSummary ? options.summary : {}
      }, { fetcher, signal: controller.signal });
      if (active !== generation) return;
      if (typeof result?.sdp !== 'string' || !result.sdp.startsWith('v=0')) throw voiceError('bad_answer');
      await peer.setRemoteDescription({ type: 'answer', sdp: result.sdp });
    } catch (error) {
      if (active !== generation) return;
      disconnect(false);
      const message = error instanceof VoiceError ? error.message : (error?.message || AI_ERRORS.connect_failed);
      onStatus('error', message);
      throw error;
    }
  }

  return {
    connect,
    disconnect,
    setMuted(value) {
      stream?.getAudioTracks?.().forEach((track) => { track.enabled = !value; });
    },
    interrupt() {
      send({ type: 'response.cancel' });
      send({ type: 'output_audio_buffer.clear' });
    },
    playAudio() {
      return audio?.play?.();
    },
    sendText(value) {
      const text = String(value || '').trim().slice(0, 2000);
      if (!text || channel?.readyState !== 'open') return false;
      send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
      send({ type: 'response.create' });
      const id = globalThis.crypto?.randomUUID?.() || `typed-${Date.now()}`;
      onTranscript({ id, role: 'user', text, done: true });
      return true;
    }
  };
}
