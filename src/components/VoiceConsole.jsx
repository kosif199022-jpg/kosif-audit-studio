import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Radio, Sparkles, Square, Volume2 } from "lucide-react";
import { canUseVoiceCommands, parseVoiceCommand } from "../voice-commands.js";
import "../voice-console.css";

function localArabicVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.localService === true);
  return voices.find((voice) => /^ar([-_]|$)/i.test(voice.lang)) || voices[0] || null;
}

export function VoiceConsole({ onView, onToggleSpace, spaceLocked = false, summaryText = "", reportText = "", onToast }) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("جاهز للأوامر الصوتية المحلية");
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);

  const stopSpeaking = useCallback((notify = false) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setSpeaking(false);
    if (notify) {
      setStatus("تم إيقاف القراءة المحلية");
      onToast?.("تم إيقاف القراءة الصوتية المحلية.");
    }
  }, [onToast]);

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
    stopSpeaking(false);
    const utterance = new window.SpeechSynthesisUtterance(clean.slice(0, 14_000));
    utterance.voice = voice;
    utterance.lang = /^ar([-_]|$)/i.test(voice.lang) ? voice.lang : "ar-SA";
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onstart = () => { setSpeaking(true); setStatus("تجري القراءة من جهازك"); };
    utterance.onend = () => { utteranceRef.current = null; setSpeaking(false); setStatus("اكتملت القراءة المحلية"); };
    utterance.onerror = () => { utteranceRef.current = null; setSpeaking(false); setStatus("تعذرت القراءة المحلية"); };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [onToast, stopSpeaking]);

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
    else if (command.type === "stop") stopSpeaking(true);
    onToast?.(command.reply);
  }, [onToast, onToggleSpace, onView, reportText, speak, spaceLocked, stopSpeaking, summaryText]);

  const startListening = useCallback(() => {
    if (typeof window === "undefined" || !canUseVoiceCommands(window)) {
      setStatus("التحدث المباشر غير مدعوم في هذا المتصفح");
      onToast?.("التحدث المباشر يحتاج متصفحًا يدعم Speech Recognition؛ تبقى القراءة الصوتية المحلية متاحة.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = "ar-SA";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setListening(true); setStatus("أستمع الآن…"); };
    recognition.onresult = (event) => {
      const text = [...event.results].map((result) => result[0]?.transcript || "").join(" ").trim();
      setTranscript(text);
      if (event.results[event.results.length - 1]?.isFinal) runCommand(text);
    };
    recognition.onerror = (event) => { setListening(false); setStatus(`تعذر التحدث المباشر: ${event.error || "خطأ غير معروف"}`); };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    setTranscript("");
    recognition.start();
  }, [listening, onToast, runCommand]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  return (
    <div className={`voice-console ${open ? "is-open" : ""}`}>
      <button type="button" className={`voice-console-trigger ${listening ? "is-listening" : ""}`} aria-expanded={open} onClick={() => setOpen((value) => !value)} title="التحدث المباشر والقراءة الصوتية">
        {listening ? <Radio size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
        <span>صوت مباشر</span>
        <i aria-hidden="true" />
      </button>
      {open ? (
        <section className="voice-console-panel" aria-label="مركز الصوت المحلي">
          <header><span><Sparkles size={16} aria-hidden="true" /> مركز الصوت</span><small>الجهاز فقط</small></header>
          <p className="voice-console-status" aria-live="polite">{status}</p>
          <div className="voice-console-actions">
            <button type="button" className={`button ${listening ? "button-gold" : "button-dark"}`} onClick={startListening}>
              {listening ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
              {listening ? "إيقاف الاستماع" : "ابدأ الكلام"}
            </button>
            <button type="button" className="button button-outline" onClick={() => speak(reportText || summaryText)} disabled={speaking}>
              <Volume2 size={17} aria-hidden="true" /> تقرير صوتي
            </button>
            {speaking ? <button type="button" className="button button-outline" onClick={() => stopSpeaking(true)}><Square size={16} aria-hidden="true" /> إيقاف</button> : null}
          </div>
          <div className="voice-console-transcript"><span>آخر أمر</span><strong>{transcript || "قل: افتح التقرير أو شغّل تقريرًا صوتيًا"}</strong></div>
          <small className="voice-console-disclosure">يعمل التعرف والقراءة محليًا، ولا تُرسل بيانات الارتباط إلى خدمة صوتية من هذا المكوّن.</small>
        </section>
      ) : null}
    </div>
  );
}
