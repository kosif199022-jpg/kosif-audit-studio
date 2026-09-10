import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Radio, Sparkles, Square, Volume2 } from "lucide-react";
import { canUseVoiceCommands, parseVoiceCommand } from "../voice-commands.js";
import "../voice-console.css";

const RealtimeVoice = lazy(() => import("./RealtimeVoice.jsx").then((module) => ({ default: module.RealtimeVoice })));

function localArabicVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.localService === true);
  return voices.find((voice) => /^ar([-_]|$)/i.test(voice.lang)) || voices[0] || null;
}

export function VoiceConsole({ onView, onToggleSpace, spaceLocked = false, summaryText = "", reportText = "", voiceContext = {}, onToast }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("realtime");
  const [listening, setListening] = useState(false);
  const [loopActive, setLoopActive] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("جاهز للأوامر الصوتية المحلية");
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const keepListeningRef = useRef(false);
  const speakingRef = useRef(false);
  const restartTimerRef = useRef(null);
  const loopRef = useRef(null);

  const scheduleLocalListen = useCallback((delay = 250) => {
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    if (!keepListeningRef.current) return;
    restartTimerRef.current = setTimeout(() => loopRef.current?.(), delay);
  }, []);

  const stopLocalListening = useCallback((notify = false) => {
    keepListeningRef.current = false;
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      try { recognition.abort?.(); } catch {}
    }
    setListening(false);
    setLoopActive(false);
    if (notify) {
      setStatus("تم إيقاف الاستماع المستمر");
      onToast?.("تم إيقاف الاستماع المحلي المستمر.");
    }
  }, [onToast]);

  const stopSpeaking = useCallback((notify = false) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    speakingRef.current = false;
    setSpeaking(false);
    if (notify) {
      setStatus("تم إيقاف القراءة المحلية");
      onToast?.("تم إيقاف القراءة الصوتية المحلية.");
    }
    if (keepListeningRef.current) scheduleLocalListen(140);
  }, [onToast, scheduleLocalListen]);

  const speak = useCallback((text) => {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const voice = localArabicVoice();
    if (!clean || typeof window === "undefined" || !("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
      setStatus("القراءة الصوتية غير متاحة في هذا المتصفح");
      onToast?.("القراءة الصوتية المحلية غير متاحة في هذا المتصفح.");
      return;
    }
    if (!voice) {
      setStatus("لا يوجد صوت عربي محلي على الجهاز");
      onToast?.("لم يُرسل النص إلى خادم؛ ثبّت صوتًا عربيًا على الجهاز ثم أعد المحاولة.");
      return;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(clean.slice(0, 14_000));
    utterance.voice = voice;
    utterance.lang = /^ar([-_]|$)/i.test(voice.lang) ? voice.lang : "ar-SA";
    utterance.rate = 0.9;
    utterance.pitch = 1;
    const finish = (label) => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      speakingRef.current = false;
      setSpeaking(false);
      setStatus(label);
      if (keepListeningRef.current) scheduleLocalListen(180);
    };
    utterance.onstart = () => {
      speakingRef.current = true;
      setSpeaking(true);
      setStatus("تجري القراءة من جهازك");
    };
    utterance.onend = () => finish("اكتملت القراءة المحلية");
    utterance.onerror = () => finish("تعذرت القراءة المحلية");
    utteranceRef.current = utterance;
    speakingRef.current = true;
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [onToast, scheduleLocalListen]);

  const runCommand = useCallback((rawText) => {
    const command = parseVoiceCommand(rawText);
    setTranscript(rawText);
    setStatus(command.reply);
    if (command.type === "view") onView?.(command.view);
    else if (command.type === "toggle-space") {
      if (spaceLocked) {
        const lockedReply = "المشهد الفضائي ثابت؛ يمكنك إيقاف الحركة أو تشغيلها من شريط المشهد.";
        setStatus(lockedReply);
        onToast?.(lockedReply);
        return;
      }
      onToggleSpace?.();
    }
    else if (command.type === "speak-summary") speak(summaryText);
    else if (command.type === "speak-report") speak(reportText || summaryText);
    else if (command.type === "stop") {
      stopLocalListening(false);
      stopSpeaking(true);
    }
    onToast?.(command.reply);
  }, [onToast, onToggleSpace, onView, reportText, speak, spaceLocked, stopLocalListening, stopSpeaking, summaryText]);

  const startListening = useCallback(() => {
    if (keepListeningRef.current) {
      stopLocalListening(true);
      return;
    }
    if (typeof window === "undefined" || !canUseVoiceCommands(window)) {
      setStatus("التحدث المباشر غير مدعوم في هذا المتصفح");
      onToast?.("التحدث المباشر يحتاج متصفحًا يدعم Speech Recognition؛ تبقى القراءة الصوتية المحلية متاحة.");
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    keepListeningRef.current = true;
    setLoopActive(true);
    setTranscript("");

    const listenOnce = () => {
      if (!keepListeningRef.current) return;
      if (speakingRef.current) {
        scheduleLocalListen(320);
        return;
      }
      const recognition = new Recognition();
      recognition.lang = "ar-SA";
      // Safari/iOS عادةً ينهي جلسة التعرف عند الوقفة؛ نعيد إنشاء جلسة قصيرة
      // بدل الاعتماد على continuous الذي لا يعمل بثبات على WebKit.
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      let finalText = "";

      recognition.onstart = () => {
        if (recognitionRef.current !== recognition) return;
        setListening(true);
        setStatus("أستمع الآن… ويمكنك التوقف لحظة ثم متابعة الكلام");
      };
      recognition.onresult = (event) => {
        if (recognitionRef.current !== recognition) return;
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result.isFinal) finalText += `${result[0]?.transcript || ""} `;
          else interim += `${result[0]?.transcript || ""} `;
        }
        setTranscript(`${finalText}${interim}`.trim());
      };
      recognition.onerror = (event) => {
        if (recognitionRef.current !== recognition) return;
        if (["not-allowed", "service-not-allowed"].includes(event.error)) {
          stopLocalListening(false);
          setStatus("لم يُسمح باستخدام الميكروفون؛ فعّله من إعدادات الموقع.");
          onToast?.("اسمح للموقع باستخدام الميكروفون من إعدادات Safari/المتصفح ثم أعد المحاولة.");
        }
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        setListening(false);
        const text = finalText.trim();
        if (text) runCommand(text);
        if (keepListeningRef.current) scheduleLocalListen(text ? 420 : 260);
      };
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
        setListening(false);
        scheduleLocalListen(900);
      }
    };

    loopRef.current = listenOnce;
    listenOnce();
  }, [onToast, runCommand, scheduleLocalListen, stopLocalListening]);

  const useLocalFallback = useCallback((reason = "") => {
    stopLocalListening(false);
    stopSpeaking(false);
    setMode("local");
    const label = reason
      ? `تعذر اتصال OpenAI الحي (${reason}). انتقلت إلى الوضع المحلي الاحتياطي؛ اضغط «ابدأ الاستماع المستمر».`
      : "انتقلت إلى الوضع المحلي الاحتياطي؛ اضغط «ابدأ الاستماع المستمر».";
    setStatus(label);
    onToast?.("تم تحويل مركز الصوت إلى الوضع المحلي الاحتياطي.");
  }, [onToast, stopLocalListening, stopSpeaking]);

  useEffect(() => () => {
    keepListeningRef.current = false;
    clearTimeout(restartTimerRef.current);
    try { recognitionRef.current?.abort?.(); } catch {}
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  return (
    <div className={`voice-console ${open ? "is-open" : ""}`}>
      <button type="button" className={`voice-console-trigger ${loopActive ? "is-listening" : ""}`} aria-expanded={open} onClick={() => setOpen((value) => !value)} title="التحدث المباشر والقراءة الصوتية">
        {loopActive ? <Radio size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
        <span>صوت مباشر</span>
        <i aria-hidden="true" />
      </button>
      {open ? (
        <section className="voice-console-panel" aria-label="مركز الصوت">
          <header><span><Sparkles size={16} aria-hidden="true" /> مركز الصوت</span><button type="button" className="voice-close" onClick={() => { setOpen(false); stopLocalListening(false); stopSpeaking(false); }}>إغلاق</button></header>
          <div className="voice-mode-tabs"><button type="button" aria-pressed={mode === "realtime"} onClick={() => { stopLocalListening(false); stopSpeaking(false); setMode("realtime"); }}>محادثة OpenAI حية</button><button type="button" aria-pressed={mode === "local"} onClick={() => setMode("local")}>أوامر وقراءة المتصفح</button></div>
          {mode === "realtime" ? <Suspense fallback={<p>جارٍ تجهيز الصوت…</p>}><RealtimeVoice onView={onView} summary={voiceContext} onFallback={useLocalFallback} /></Suspense> : <>
          <p className="voice-console-status" aria-live="polite">{status}</p>
          <div className="voice-console-actions">
            <button type="button" className={`button ${loopActive ? "button-gold" : "button-dark"}`} onClick={startListening}>
              {loopActive ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
              {loopActive ? "إيقاف الاستماع المستمر" : "ابدأ الاستماع المستمر"}
            </button>
            <button type="button" className="button button-outline" onClick={() => speak(reportText || summaryText)} disabled={speaking}>
              <Volume2 size={17} aria-hidden="true" /> تقرير صوتي
            </button>
            {speaking ? <button type="button" className="button button-outline" onClick={() => stopSpeaking(true)}><Square size={16} aria-hidden="true" /> إيقاف</button> : null}
          </div>
          <div className="voice-console-transcript"><span>{listening ? "أسمعك الآن" : loopActive ? "الاستماع المستمر مفعّل" : "آخر أمر"}</span><strong>{transcript || "قل: افتح التقرير أو شغّل تقريرًا صوتيًا"}</strong></div>
          <small className="voice-console-disclosure">الوضع المحلي لا يرسل ملفات الارتباط إلى KOSIF. على iPhone يعيد التطبيق تشغيل جلسة التعرف بعد الوقفات القصيرة لأن Safari قد ينهي الإملاء عند الصمت؛ القراءة تستخدم صوتًا محليًا متاحًا على الجهاز.</small>
          </>}
        </section>
      ) : null}
    </div>
  );
}
