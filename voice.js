// KOSIF Audit Studio — voice.js
// OpenAI Realtime WebRTC عبر Cloudflare Worker، مع بقاء موجّه النوايا المحلي
// كمسار احتياطي حتمي. لا يُرسل مفتاح OpenAI إلى المتصفح في أي وقت.

import { normalizeText } from './engine.js';

const DEFAULT_REALTIME_ENDPOINT = 'https://kosif-audit-realtime.kosif199022.workers.dev/api/realtime/session';
const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export function voiceSupport() {
  const webrtc = typeof window !== 'undefined'
    && typeof RTCPeerConnection !== 'undefined'
    && Boolean(navigator?.mediaDevices?.getUserMedia);
  const recognition = Boolean(Recognition) || webrtc;
  const synthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;
  return { recognition, synthesis, webrtc, full: webrtc || (Boolean(Recognition) && synthesis) };
}

/* ---------- موجّه النوايا المحلي الاحتياطي ---------- */

const VIEW_WORDS = Object.freeze([
  ['agent', ['استوديو الايجنت', 'الايجنت', 'المساعد الذكي']],
  ['workflow', ['مساحه العمل', 'خطه العمل', 'المهام']],
  ['references', ['مرصد المراجع', 'تحديثات المعايير']],
  ['dashboard', ['مركز القياده', 'القياده', 'الرئيسيه', 'الداشبورد']],
  ['data', ['الميزان', 'البيانات', 'ميزان المراجعه']],
  ['planning', ['التخطيط', 'الاهميه', 'الاهميه النسبيه']],
  ['risks', ['المخاطر', 'النتائج', 'الاخطار']],
  ['journal', ['القيود', 'قيود اليوميه', 'اليوميه']],
  ['analytics', ['التحليلات', 'القوائم', 'النسب', 'بنفورد']],
  ['workpapers', ['اوراق العمل', 'الاوراق']],
  ['pbc', ['المستندات', 'الطلبات', 'طلبات المستندات']],
  ['evidence', ['الادله', 'الدليل', 'التتبع']],
  ['opinion', ['الراي', 'التحريفات', 'مسوده الراي']],
  ['standards', ['المعايير', 'المصادر']],
  ['rounds', ['الجولات', 'الجولات العشر']],
  ['council', ['المجلس', 'مجلس المراجعين']],
  ['reports', ['التقرير', 'التقارير', 'التصدير']],
  ['knowledge', ['المعرفه', 'مسارات المعرفه']]
]);

function has(text, ...words) { return words.some((word) => text.includes(normalizeText(word))); }
function findView(text) { return VIEW_WORDS.find(([, words]) => words.some((word) => text.includes(normalizeText(word))))?.[0] ?? null; }

export function routeIntent(transcript, context, api) {
  const text = normalizeText(transcript);
  const view = findView(text);

  if (has(text, 'مساعده', 'ماذا تستطيع', 'ايش تقدر', 'الاوامر')) {
    return { intent: 'help', reply: 'أستطيع فتح الشاشات وقراءة حالة الملف، الأهمية، المخاطر، القيود، القوائم، الرأي والجلسات. قل مثلًا: افتح التحليلات.' };
  }
  if (has(text, 'توقف', 'اسكت', 'اصمت', 'كفايه', 'انهي الجلسه')) {
    api?.stop?.();
    return { intent: 'stop', reply: 'تم إنهاء الجلسة الصوتية.', silent: true };
  }
  if (has(text, 'بيانات تجريبيه', 'حمل التجريبي', 'الخمسه الاف', '5000')) {
    api?.actions?.loadDemo?.();
    return { intent: 'demo', reply: 'حمّلت خمسة آلاف حساب تجريبي متزن ببذرة ثابتة.' };
  }
  if (has(text, 'اعقد', 'شغل المجلس', 'جلسه المجلس', 'انعقاد')) {
    const result = api?.actions?.convene?.();
    return { intent: 'council', reply: result ? `انعقد المجلس. ${result.verdictText} مؤشر التوافق ${result.consensus} بالمئة.` : 'لا يمكن عقد المجلس قبل تحميل الميزان.', view: 'council' };
  }
  if (view && (has(text, 'افتح', 'اذهب', 'روح', 'انتقل', 'اعرض', 'ورني') || text.split(' ').length <= 2)) {
    return { intent: 'open', reply: `فتحت ${api?.viewLabel?.(view) ?? view}.`, view };
  }
  if (has(text, 'متزن', 'الاتزان', 'الفرق', 'هل الميزان')) {
    return { intent: 'balance', reply: !context?.analysis ? 'لم يُحمّل ميزان بعد.' : context.analysis.balanced ? `الميزان متزن حسابيًا، ${context.analysis.accounts} حساب في ${context.analysis.categories} فئة.` : `الميزان غير متزن؛ الفرق ${context.analysis.imbalanceText}.` };
  }
  if (has(text, 'الاهميه', 'اهميه الاداء', 'الحد التافه')) {
    return { intent: 'materiality', reply: context?.materiality ? `الأهمية الإجمالية ${context.materiality.overall}، أهمية الأداء ${context.materiality.performance}، والحد الواضح التفاهة ${context.materiality.trivial}. الأساس ${context.materiality.benchmark}.` : 'الأهمية النسبية لم تُحدد بعد.', view: context?.materiality ? null : 'planning' };
  }
  if (has(text, 'اعلى المخاطر', 'اهم المخاطر', 'كم خطر', 'المخاطر المرتفعه', 'المخاطر المفتوحه')) {
    return { intent: 'risks', reply: context?.risks?.total ? `رصد المحرك ${context.risks.total} إشارة، منها ${context.risks.high} مرتفعة أو حرجة مفتوحة. أعلى ثلاث: ${(context.risks.top ?? []).join('، ')}.` : 'لا مخاطر مرصودة بعد.' };
  }
  if (has(text, 'القيود المعلمه', 'كم قيد', 'قيود يدويه', 'فحص القيود')) {
    return { intent: 'journal', reply: context?.journal ? `فُحص ${context.journal.total} قيد؛ ${context.journal.flagged} معلّم و${context.journal.pending} بانتظار المراجعة وفق ISA 240.` : 'لم تُحمّل قيود يومية بعد.' };
  }
  if (has(text, 'اجمالي الاصول', 'الربح', 'الخساره', 'صافي', 'القوائم الماليه', 'المركز المالي')) {
    return { intent: 'statements', reply: context?.statements ? `إجمالي الأصول ${context.statements.assets}، الالتزامات ${context.statements.liabilities}، حقوق الملكية ${context.statements.equity}، و${context.statements.profitLabel} ${context.statements.profit}.` : 'لا قوائم مشتقة بعد.' };
  }
  if (has(text, 'نسبه التداول', 'النسب', 'الرافعه', 'هامش', 'ايام التحصيل')) {
    return { intent: 'ratios', reply: context?.ratios?.length ? context.ratios.map((item) => `${item.label} ${item.value}`).join('، ') : 'لا نسب محسوبة بعد.' };
  }
  if (has(text, 'بنفورد', 'الرقم الاول')) {
    return { intent: 'benford', reply: context?.benford ? `اختبار بنفورد على ${context.benford.total} قيمة: ${context.benford.label}، بانحراف متوسط ${context.benford.mad}.` : 'لم يُنفذ اختبار بنفورد بعد.' };
  }
  if (has(text, 'الاستمراريه')) {
    return { intent: 'goingConcern', reply: context?.goingConcern ? ((context.goingConcern.hits ?? []).length ? `ظهرت ${context.goingConcern.hits.length} مؤشرات استمرارية: ${context.goingConcern.hits.join('، ')}.` : 'لا مؤشرات مالية للاستمرارية من القوائم المشتقة.') : 'لا بيانات كافية.' };
  }
  if (has(text, 'مسوده الراي', 'الراي', 'التحريفات', 'isa 705', 'متحفظ')) {
    return { intent: 'opinion', reply: context?.opinion ? `مسودة الرأي الحالية: ${context.opinion.label} وفق ${context.opinion.standard}. ${context.opinion.basis ?? ''}` : 'لا مسودة رأي بعد.' };
  }
  if (has(text, 'الجاهزيه', 'وين وصلنا', 'اين وصلنا', 'الخطوه التاليه', 'ماذا بعد', 'وش الباقي')) {
    return { intent: 'readiness', reply: `جاهزية الملف ${context?.readiness ?? 0} بالمئة. ${context?.nextAction ?? ''}` };
  }
  if (has(text, 'البوابات', 'ما يمنع', 'العوائق')) {
    return { intent: 'gates', reply: context?.gates?.failed?.length ? `البوابات غير المكتملة: ${context.gates.failed.join('، ')}.` : 'كل البوابات مكتملة؛ يبقى الاعتماد البشري.' };
  }
  if (has(text, 'المجلس', 'راي المجلس', 'النزاعات')) {
    return { intent: 'council-status', reply: context?.council ? `آخر جلسة: ${context.council.verdict}، توافق ${context.council.consensus} بالمئة.` : 'لم تُعقد جلسة مجلس بعد.' };
  }
  return { intent: 'unknown', reply: 'لم أفهم الطلب. أستطيع فتح الشاشات وقراءة الاتزان والأهمية والمخاطر والقوائم ومسودة الرأي. قل «مساعدة» لسماع الأوامر.' };
}

/* ---------- OpenAI Realtime WebRTC ---------- */

function safeContextSnapshot(ctx = {}) {
  const copy = {
    engagement: ctx.engagement ?? null,
    readiness: ctx.readiness ?? null,
    nextAction: ctx.nextAction ?? null,
    materiality: ctx.materiality ?? null,
    risks: ctx.risks ?? null,
    journal: ctx.journal ?? null,
    statements: ctx.statements ?? null,
    ratios: ctx.ratios ?? null,
    opinion: ctx.opinion ?? null,
    council: ctx.council ?? null,
    gates: ctx.gates ?? null
  };
  return JSON.stringify(copy, (_, value) => typeof value === 'bigint' ? value.toString() : value).slice(0, 14000);
}

export function createVoiceAssistant({ getContext = () => ({}), api = {}, onEvent = () => {}, lang = 'ar-SA' } = {}) {
  const support = voiceSupport();
  let active = false;
  let speaking = false;
  let muted = false;
  let gateway = { url: DEFAULT_REALTIME_ENDPOINT };
  let pc = null;
  let dc = null;
  let localStream = null;
  let remoteAudio = null;
  let audioMeter = null;
  let connectAttempt = 0;
  let assistantBuffer = '';
  const transcript = [];

  const emit = (type, payload = {}) => onEvent({ type, ...payload });

  function cleanupPeer({ emitStopped = true } = {}) {
    const wasActive = active;
    active = false;
    speaking = false;
    try { dc?.close(); } catch {}
    dc = null;
    try { pc?.close(); } catch {}
    pc = null;
    localStream?.getTracks().forEach((track) => track.stop());
    localStream = null;
    if (audioMeter) {
      try { audioMeter.context.close(); } catch {}
      audioMeter = null;
    }
    if (remoteAudio) {
      try { remoteAudio.pause(); } catch {}
      remoteAudio.srcObject = null;
      remoteAudio.remove();
      remoteAudio = null;
    }
    assistantBuffer = '';
    if (emitStopped && wasActive) emit('stopped');
  }

  async function attachMeter(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      audioMeter = { context, analyser };
      emit('meter-ready');
    } catch (error) {
      emit('meter-unavailable', { message: error?.message ?? String(error) });
    }
  }

  function send(event) {
    if (!dc || dc.readyState !== 'open') return false;
    dc.send(JSON.stringify(event));
    return true;
  }

  function updateRealtimeContext() {
    const context = getContext?.() ?? {};
    return send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: [
          'أنت KOSIF Live، مساعد مراجعة مالية عربي داخل تطبيق KOSIF Audit Studio.',
          'تحدث بالعربية السعودية/الفصحى المبسطة بإيجاز ووضوح.',
          'لا تدّع تنفيذ إجراء داخل التطبيق لم يحدث فعلًا، ولا تصدر رأيًا مهنيًا نهائيًا نيابة عن المراجع البشري.',
          'عندما يسأل المستخدم عن أرقام الملف استخدم فقط السياق المرسل ولا تخمّن.',
          `سياق ملف المراجعة الحالي: ${safeContextSnapshot(context)}`
        ].join('\n')
      }
    });
  }

  function handleRealtimeEvent(data) {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'input_audio_buffer.speech_started') {
      if (speaking) emit('interrupted');
      speaking = false;
      emit('listening');
    }

    if (data.type === 'conversation.item.input_audio_transcription.completed') {
      const text = String(data.transcript ?? '').trim();
      if (text) {
        transcript.push({ role: 'user', text, at: Date.now() });
        emit('final', { text });
        emit('thinking');
      }
    }

    if (data.type === 'response.created') emit('thinking');

    if (data.type === 'response.output_audio.started' || data.type === 'response.audio.started') {
      speaking = true;
      emit('speaking');
    }

    if (data.type === 'response.output_audio_transcript.delta' || data.type === 'response.audio_transcript.delta') {
      assistantBuffer += String(data.delta ?? '');
      if (assistantBuffer) emit('interim', { text: assistantBuffer });
    }

    if (data.type === 'response.output_audio_transcript.done' || data.type === 'response.audio_transcript.done') {
      const text = String(data.transcript ?? assistantBuffer).trim();
      assistantBuffer = '';
      if (text) {
        transcript.push({ role: 'assistant', text, at: Date.now() });
        emit('reply', { reply: text, intent: 'gateway' });
      }
    }

    if (data.type === 'response.done') {
      speaking = false;
      assistantBuffer = '';
      emit('idle');
    }

    if (data.type === 'error') {
      emit('error', { code: 'realtime', message: data.error?.message ?? 'Realtime API error' });
    }
  }

  async function connectRealtime(attempt) {
    try {
      if (!support.webrtc) throw Object.assign(new Error('WEBRTC_UNSUPPORTED'), { code: 'unsupported' });

      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      if (attempt !== connectAttempt) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStream.getAudioTracks().forEach((track) => { track.enabled = !muted; });
      await attachMeter(localStream);

      pc = new RTCPeerConnection();
      remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudio.setAttribute('playsinline', '');
      remoteAudio.style.display = 'none';
      document.body.append(remoteAudio);

      pc.ontrack = (event) => {
        remoteAudio.srcObject = event.streams?.[0] ?? new MediaStream([event.track]);
        remoteAudio.play().catch(() => {});
      };

      pc.onconnectionstatechange = () => {
        const state = pc?.connectionState;
        if (state === 'connected') {
          active = true;
          emit('listening');
        }
        if (['failed', 'closed'].includes(state)) cleanupPeer();
      };

      localStream.getAudioTracks().forEach((track) => pc.addTrack(track, localStream));

      dc = pc.createDataChannel('oai-events');
      dc.onopen = () => {
        active = true;
        updateRealtimeContext();
        emit('listening');
      };
      dc.onmessage = (event) => {
        try { handleRealtimeEvent(JSON.parse(event.data)); } catch { /* ignore malformed events */ }
      };
      dc.onerror = () => emit('error', { code: 'realtime', message: 'تعذر الاتصال بقناة أحداث المحادثة الحية.' });

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      const response = await fetch(gateway?.url || DEFAULT_REALTIME_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription?.sdp ?? offer.sdp
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`REALTIME_SESSION_FAILED:${response.status}:${detail.slice(0, 240)}`);
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      active = true;
      emit('listening');
    } catch (error) {
      cleanupPeer({ emitStopped: false });
      const name = error?.name ?? '';
      const denied = name === 'NotAllowedError' || name === 'SecurityError';
      emit('error', {
        code: denied ? 'not-allowed' : (error?.code ?? 'realtime'),
        message: denied ? 'لم يُسمح باستخدام الميكروفون.' : (error?.message ?? String(error))
      });
      emit('stopped');
    }
  }

  function start() {
    if (active || pc) return true;
    if (!support.webrtc) {
      emit('unsupported');
      return false;
    }
    connectAttempt += 1;
    emit('thinking');
    void connectRealtime(connectAttempt);
    return true;
  }

  function stop() {
    connectAttempt += 1;
    const hadSession = Boolean(active || pc || localStream);
    cleanupPeer({ emitStopped: false });
    if (hadSession) emit('stopped');
  }

  function interrupt() {
    if (!active) return;
    send({ type: 'response.cancel' });
    speaking = false;
    emit('interrupted');
  }

  function setMuted(value) {
    muted = Boolean(value);
    localStream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
  }

  function setGateway(value) {
    if (value?.url) gateway = { url: String(value.url) };
    else gateway = { url: DEFAULT_REALTIME_ENDPOINT };
  }

  function level() {
    if (!audioMeter) return 0;
    const data = new Uint8Array(audioMeter.analyser.frequencyBinCount);
    audioMeter.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) {
      const centered = (value - 128) / 128;
      sum += centered * centered;
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 4);
  }

  function speak(text) {
    if (!text) return;
    // في وضع Realtime الصوت يأتي مباشرة من WebRTC؛ هذه الدالة موجودة للتوافق.
    if (active) return;
    if (!support.synthesis) return;
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = lang;
    utterance.onstart = () => { speaking = true; emit('speaking'); };
    utterance.onend = () => { speaking = false; emit('idle'); };
    speechSynthesis.speak(utterance);
  }

  function respond(text) {
    if (active && dc?.readyState === 'open') {
      send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: String(text) }] } });
      send({ type: 'response.create', response: { modalities: ['audio', 'text'] } });
      return;
    }
    const result = routeIntent(text, getContext?.() ?? {}, { ...api, stop });
    emit('reply', { reply: result.reply, intent: result.intent });
    if (result.view) api?.openView?.(result.view);
    if (!result.silent) speak(result.reply);
  }

  return {
    support,
    start,
    stop,
    speak,
    interrupt,
    level,
    respond,
    isActive: () => active,
    isSpeaking: () => speaking,
    setMuted,
    setGateway,
    getGateway: () => gateway,
    transcript: () => transcript.slice()
  };
}
