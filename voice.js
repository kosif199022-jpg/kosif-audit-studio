// KOSIF Audit Studio — voice.js
// مساعد صوتي مباشر (Live): استماع مستمر، مقاطعة أثناء الحديث (barge-in)، وموجّه نوايا عربي حتمي
// يجيب من حالة الملف الفعلية. لا مفاتيح في المتصفح: الوضع الافتراضي محلي بالكامل عبر Web Speech API،
// ووضع «بوابة خادمية» اختياري يرسل النص فقط إلى KOSIF AI Gateway الذي يملك مفاتيح المزوّد.

import { normalizeText } from './engine.js';

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export function voiceSupport() {
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window;
  return { recognition: Boolean(Recognition), synthesis: synth, full: Boolean(Recognition) && synth };
}

/* ---------- موجّه النوايا ---------- */

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

const INTENTS = [
  { id: 'help', test: (t) => has(t, 'مساعده', 'ماذا تستطيع', 'ايش تقدر', 'الاوامر'), handle: () => ({
    reply: 'أستطيع فتح أي شاشة، وقراءة حالة الملف: الاتزان، الأهمية النسبية، أعلى المخاطر، القيود المعلّمة، القوائم، النسب، مسودة الرأي، وعقد جلسة المجلس. جرّب: افتح التحليلات، أو ما هي الأهمية النسبية.'
  }) },
  { id: 'stop', test: (t) => has(t, 'توقف', 'اسكت', 'اصمت', 'كفايه', 'انهي الجلسه'), handle: (_, api) => { api.stop(); return { reply: 'تم إنهاء الجلسة الصوتية.', silent: true }; } },
  { id: 'demo', test: (t) => has(t, 'بيانات تجريبيه', 'حمل التجريبي', 'الخمسه الاف', '5000'), handle: (_, api) => { api.actions.loadDemo(); return { reply: 'حمّلت خمسة آلاف حساب تجريبي متزن ببذرة ثابتة.' }; } },
  { id: 'council', test: (t) => has(t, 'اعقد', 'شغل المجلس', 'جلسه المجلس', 'انعقاد'), handle: (_, api) => {
    const result = api.actions.convene();
    return { reply: result ? `انعقد المجلس. ${result.verdictText} مؤشر التوافق ${result.consensus} بالمئة.` : 'لا يمكن عقد المجلس قبل تحميل الميزان.', view: 'council' };
  } },
  { id: 'open', test: (t) => has(t, 'افتح', 'اذهب', 'روح', 'انتقل', 'اعرض', 'ورني') && findView(t), handle: (_, api, t) => {
    const view = findView(t);
    return { reply: `فتحت ${api.viewLabel(view)}.`, view };
  } },
  { id: 'open-bare', test: (t) => findView(t) && t.split(' ').length <= 2 && !has(t, 'هل', 'ما ', 'كم', 'ماذا'), handle: (_, api, t) => {
    const view = findView(t);
    return { reply: `فتحت ${api.viewLabel(view)}.`, view };
  } },
  { id: 'balance', test: (t) => has(t, 'متزن', 'الاتزان', 'الفرق', 'هل الميزان'), handle: (ctx) => ({
    reply: !ctx.analysis ? 'لم يُحمّل ميزان بعد.' : ctx.analysis.balanced ? `الميزان متزن حسابيًا، ${ctx.analysis.accounts} حساب في ${ctx.analysis.categories} فئة. الاتزان لا يثبت صحة التصنيف أو التقييم.` : `الميزان غير متزن؛ الفرق ${ctx.analysis.imbalanceText}.`
  }) },
  { id: 'materiality', test: (t) => has(t, 'الاهميه', 'اهميه الاداء', 'الحد التافه'), handle: (ctx) => ({
    reply: ctx.materiality ? `الأهمية الإجمالية ${ctx.materiality.overall}، أهمية الأداء ${ctx.materiality.performance}، والحد الواضح التفاهة ${ctx.materiality.trivial}. الأساس ${ctx.materiality.benchmark}.` : 'الأهمية النسبية لم تُحدد بعد. أفتح شاشة التخطيط؟', view: ctx.materiality ? null : 'planning'
  }) },
  { id: 'risks', test: (t) => has(t, 'اعلى المخاطر', 'اهم المخاطر', 'كم خطر', 'المخاطر المرتفعه', 'المخاطر المفتوحه'), handle: (ctx) => ({
    reply: ctx.risks.total ? `رصد المحرك ${ctx.risks.total} إشارة، منها ${ctx.risks.high} مرتفعة أو حرجة مفتوحة. أعلى ثلاث: ${ctx.risks.top.join('، ')}.` : 'لا مخاطر مرصودة بعد؛ حمّل الميزان أولًا.'
  }) },
  { id: 'journal', test: (t) => has(t, 'القيود المعلمه', 'كم قيد', 'قيود يدويه', 'فحص القيود'), handle: (ctx) => ({
    reply: ctx.journal ? `فُحص ${ctx.journal.total} قيد؛ ${ctx.journal.flagged} معلّم و${ctx.journal.pending} بانتظار المراجعة وفق ISA 240.` : 'لم تُحمّل قيود يومية بعد.'
  }) },
  { id: 'statements', test: (t) => has(t, 'اجمالي الاصول', 'الربح', 'الخساره', 'صافي', 'القوائم الماليه', 'المركز المالي'), handle: (ctx) => ({
    reply: ctx.statements ? `إجمالي الأصول ${ctx.statements.assets}، الالتزامات ${ctx.statements.liabilities}، حقوق الملكية ${ctx.statements.equity}، و${ctx.statements.profitLabel} ${ctx.statements.profit}. المعادلة المحاسبية ${ctx.statements.equationHolds ? 'محققة' : 'غير محققة'}.` : 'لا قوائم مشتقة بعد.'
  }) },
  { id: 'ratios', test: (t) => has(t, 'نسبه التداول', 'النسب', 'الرافعه', 'هامش', 'ايام التحصيل'), handle: (ctx) => ({
    reply: ctx.ratios.length ? `${ctx.ratios.map((item) => `${item.label} ${item.value}`).join('، ')}. النسب مؤشرات تحليلية تحتاج مقارنة بالسنة السابقة والقطاع.` : 'لا نسب محسوبة بعد.'
  }) },
  { id: 'benford', test: (t) => has(t, 'بنفورد', 'الرقم الاول'), handle: (ctx) => ({
    reply: ctx.benford ? `اختبار بنفورد على ${ctx.benford.total} قيمة: ${ctx.benford.label}، بانحراف متوسط ${ctx.benford.mad}.` : 'لم يُنفذ اختبار بنفورد بعد.'
  }) },
  { id: 'goingConcern', test: (t) => has(t, 'الاستمراريه'), handle: (ctx) => ({
    reply: ctx.goingConcern ? (ctx.goingConcern.hits.length ? `ظهرت ${ctx.goingConcern.hits.length} مؤشرات استمرارية: ${ctx.goingConcern.hits.join('، ')}. المؤشر لا يعني عدم تأكد جوهري؛ يلزم تقييم الإدارة.` : 'لا مؤشرات مالية للاستمرارية من القوائم المشتقة.') : 'لا بيانات كافية.'
  }) },
  { id: 'opinion', test: (t) => has(t, 'مسوده الراي', 'الراي', 'التحريفات', 'ISA 705', 'متحفظ'), handle: (ctx) => ({
    reply: ctx.opinion ? `مسودة الرأي الحالية: ${ctx.opinion.label} وفق ${ctx.opinion.standard}. ${ctx.opinion.basis} ${ctx.misstatements ? `التعرض غير المصحح ${ctx.misstatements.exposure}؛ ${ctx.misstatements.verdict}.` : ''} الرأي النهائي يصدره المراجع باسمه.` : 'لا مسودة رأي بعد.'
  }) },
  { id: 'readiness', test: (t) => has(t, 'الجاهزيه', 'وين وصلنا', 'اين وصلنا', 'الخطوه التاليه', 'ماذا بعد', 'وش الباقي'), handle: (ctx) => ({
    reply: `جاهزية الملف ${ctx.readiness} بالمئة. ${ctx.nextAction}`
  }) },
  { id: 'gates', test: (t) => has(t, 'البوابات', 'ما يمنع', 'العوائق'), handle: (ctx) => ({
    reply: ctx.gates.failed.length ? `البوابات غير المكتملة: ${ctx.gates.failed.join('، ')}.` : 'كل البوابات مكتملة؛ يبقى الاعتماد البشري.'
  }) },
  { id: 'council-status', test: (t) => has(t, 'المجلس', 'راي المجلس', 'النزاعات'), handle: (ctx) => ({
    reply: ctx.council ? `آخر جلسة: ${ctx.council.verdict}، توافق ${ctx.council.consensus} بالمئة، ${ctx.council.objections} اعتراض و${ctx.council.conflicts} نزاع منها ${ctx.council.resolved} محسوم.` : 'لم تُعقد جلسة مجلس بعد. قل: اعقد جلسة المجلس.'
  }) }
];

export function routeIntent(transcript, context, api) {
  const text = normalizeText(transcript);
  for (const intent of INTENTS) {
    if (intent.test(text)) return { intent: intent.id, ...intent.handle(context, api, text) };
  }
  return { intent: 'unknown', reply: 'لم أفهم الطلب. أستطيع فتح الشاشات وقراءة الاتزان والأهمية والمخاطر والقوائم ومسودة الرأي. قل «مساعدة» لسماع الأوامر.' };
}

/* ---------- الجلسة الصوتية ---------- */

export function createVoiceAssistant({ getContext, api, onEvent = () => {}, lang = 'ar-SA' } = {}) {
  const support = voiceSupport();
  let recognition = null;
  let active = false;
  let speaking = false;
  let muted = false;
  let audio = null; // { context, analyser, stream }
  let gateway = null; // { url, token? }
  let restartTimer = null;
  const transcript = [];

  function emit(type, payload = {}) { onEvent({ type, ...payload, at: Date.now() }); }

  function pickVoice() {
    const voices = window.speechSynthesis?.getVoices?.() ?? [];
    return voices.find((voice) => voice.lang?.toLowerCase().startsWith('ar') && /natural|online|google/i.test(voice.name))
      || voices.find((voice) => voice.lang?.toLowerCase().startsWith('ar')) || null;
  }

  function speak(text) {
    if (!support.synthesis || muted || !text) return Promise.resolve();
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      const voice = pickVoice();
      if (voice) utterance.voice = voice;
      utterance.rate = 1.02;
      utterance.onstart = () => { speaking = true; emit('speaking', { text }); };
      utterance.onend = utterance.onerror = () => { speaking = false; emit('idle'); resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  }

  function interrupt() {
    if (speaking && support.synthesis) { window.speechSynthesis.cancel(); speaking = false; emit('interrupted'); }
  }

  async function respond(text) {
    const context = getContext();
    let result;
    if (gateway?.url) {
      emit('thinking');
      try {
        const response = await fetch(gateway.url, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(gateway.token ? { Authorization: `Bearer ${gateway.token}` } : {}) },
          body: JSON.stringify({ transcript: text, context, lang })
        });
        const data = await response.json();
        result = { intent: 'gateway', reply: String(data.reply ?? '').slice(0, 1200), view: data.view ?? null };
      } catch (error) {
        result = { intent: 'gateway-error', reply: 'تعذر الوصول إلى البوابة الخادمية؛ أعمل بالوضع المحلي.' };
        gateway = null;
      }
    } else {
      result = routeIntent(text, context, api);
    }
    transcript.push({ role: 'assistant', text: result.reply, intent: result.intent, at: Date.now() });
    emit('reply', result);
    if (result.view) api.openView(result.view);
    if (!result.silent) await speak(result.reply);
    return result;
  }

  async function attachMeter() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audio = { context, analyser, stream };
      emit('meter-ready');
    } catch (error) {
      emit('meter-unavailable', { message: error.message });
    }
  }

  function level() {
    if (!audio) return 0;
    const data = new Uint8Array(audio.analyser.frequencyBinCount);
    audio.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) { const centered = (value - 128) / 128; sum += centered * centered; }
    return Math.min(1, Math.sqrt(sum / data.length) * 4);
  }

  function start() {
    if (!support.recognition) { emit('unsupported'); return false; }
    if (active) return true;
    active = true;
    recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => emit('listening');
    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const item = event.results[index];
        if (item.isFinal) {
          const text = item[0].transcript.trim();
          if (!text) continue;
          transcript.push({ role: 'user', text, at: Date.now() });
          emit('final', { text });
          respond(text);
        } else {
          interim += item[0].transcript;
        }
      }
      if (interim.trim()) { interrupt(); emit('interim', { text: interim.trim() }); }
    };
    recognition.onerror = (event) => {
      emit('error', { code: event.error });
      if (['not-allowed', 'service-not-allowed'].includes(event.error)) stop();
    };
    recognition.onend = () => {
      if (!active) return;
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => { try { recognition.start(); } catch { /* already started */ } }, 250);
    };
    try { recognition.start(); } catch (error) { emit('error', { code: error.message }); }
    attachMeter();
    return true;
  }

  function stop() {
    active = false;
    clearTimeout(restartTimer);
    try { recognition?.stop(); } catch { /* ignore */ }
    recognition = null;
    interrupt();
    if (audio) { audio.stream.getTracks().forEach((track) => track.stop()); audio.context.close(); audio = null; }
    emit('stopped');
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
    setMuted: (value) => { muted = Boolean(value); if (muted) interrupt(); },
    setGateway: (value) => { gateway = value?.url ? value : null; },
    getGateway: () => gateway,
    transcript: () => transcript.slice()
  };
}
