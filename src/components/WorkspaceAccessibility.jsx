import { useCallback, useEffect, useRef, useState } from "react";
import {
  Accessibility,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Square,
  Volume2,
} from "lucide-react";
import "../command-accessibility.css";

const FONT_SCALE_KEY = "kosif-audit-studio:font-scale:v1";
const MIN_FONT_SCALE = 100;
const MAX_FONT_SCALE = 125;
const FONT_SCALE_STEP = 5;

function clampFontScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Math.round(numeric / FONT_SCALE_STEP) * FONT_SCALE_STEP));
}

function loadFontScale() {
  try {
    return clampFontScale(localStorage.getItem(FONT_SCALE_KEY) || 100);
  } catch {
    return 100;
  }
}

function getLocalVoice() {
  if (!("speechSynthesis" in window)) return null;
  const localVoices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.localService === true);
  return localVoices.find((voice) => /^ar([-_]|$)/i.test(voice.lang)) || localVoices[0] || null;
}

export function WorkspaceAccessibility({
  summaryText = "",
  summaryLabel = "ملخص الارتباط الحالي",
  onStatusChange,
  className = "",
}) {
  const [fontScale, setFontScale] = useState(loadFontScale);
  const [speechState, setSpeechState] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("جاهز للقراءة المحلية عند الطلب.");
  const utteranceRef = useRef(null);

  const publishStatus = useCallback((state, message) => {
    setSpeechState(state);
    setStatusMessage(message);
    onStatusChange?.({ state, message });
  }, [onStatusChange]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale}%`;
    try {
      localStorage.setItem(FONT_SCALE_KEY, String(fontScale));
    } catch {
      // Font scaling remains active for the current session when storage is blocked.
    }
  }, [fontScale]);

  const stopReading = useCallback((announce = true) => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    if (announce) publishStatus("idle", "تم إيقاف القراءة المحلية.");
  }, [publishStatus]);

  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const readSummary = useCallback(() => {
    const text = typeof summaryText === "function" ? summaryText() : summaryText;
    const cleanText = String(text || "").replace(/\s+/g, " ").trim();

    if (!cleanText) {
      publishStatus("unavailable", "لا يتوفر ملخص نصي للقراءة في هذه الشاشة.");
      return;
    }
    if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
      publishStatus("unavailable", "هذا المتصفح لا يدعم القراءة الصوتية المحلية.");
      return;
    }

    const localVoice = getLocalVoice();
    if (!localVoice) {
      publishStatus("unavailable", "لا يتوفر صوت محلي على هذا الجهاز؛ لم يُرسل النص إلى أي خدمة خارجية.");
      return;
    }

    stopReading(false);
    const utterance = new window.SpeechSynthesisUtterance(cleanText.slice(0, 12_000));
    utterance.lang = /^ar([-_]|$)/i.test(localVoice.lang) ? localVoice.lang : "ar-SA";
    utterance.voice = localVoice;
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.onstart = () => publishStatus("speaking", `تجري قراءة ${summaryLabel} بصوت الجهاز المحلي.`);
    utterance.onend = () => {
      utteranceRef.current = null;
      publishStatus("idle", "اكتملت القراءة المحلية.");
    };
    utterance.onerror = () => {
      utteranceRef.current = null;
      publishStatus("unavailable", "تعذرت القراءة المحلية على هذا الجهاز.");
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [publishStatus, stopReading, summaryLabel, summaryText]);

  const changeFontScale = (nextValue) => setFontScale(clampFontScale(nextValue));

  return (
    <section className={`workspace-accessibility ${className}`.trim()} dir="rtl" aria-labelledby="workspace-accessibility-title">
      <header>
        <span className="workspace-accessibility-icon" aria-hidden="true"><Accessibility size={21} /></span>
        <div>
          <h2 id="workspace-accessibility-title">إتاحة مساحة العمل</h2>
          <p>تفضيلات هذا الجهاز فقط</p>
        </div>
      </header>

      <div className="font-scale-control" role="group" aria-label="حجم خط مساحة العمل">
        <div>
          <strong>حجم الخط</strong>
          <output aria-live="polite">{fontScale}%</output>
        </div>
        <div className="font-scale-buttons">
          <button
            type="button"
            aria-label="تصغير خط مساحة العمل"
            disabled={fontScale <= MIN_FONT_SCALE}
            onClick={() => changeFontScale(fontScale - FONT_SCALE_STEP)}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="إعادة حجم الخط إلى مئة بالمئة"
            disabled={fontScale === 100}
            onClick={() => changeFontScale(100)}
          >
            <RotateCcw size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="تكبير خط مساحة العمل"
            disabled={fontScale >= MAX_FONT_SCALE}
            onClick={() => changeFontScale(fontScale + FONT_SCALE_STEP)}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
        <span className="font-scale-range">من {MIN_FONT_SCALE}% إلى {MAX_FONT_SCALE}%</span>
      </div>

      <div className="speech-control">
        <div>
          <strong>قراءة الملخص</strong>
          <span>{summaryLabel}</span>
        </div>
        {speechState === "speaking" ? (
          <button type="button" className="speech-button is-speaking" onClick={() => stopReading(true)}>
            <Square size={17} aria-hidden="true" />
            إيقاف القراءة
          </button>
        ) : (
          <button type="button" className="speech-button" onClick={readSummary}>
            <Volume2 size={19} aria-hidden="true" />
            قراءة محلية
          </button>
        )}
      </div>

      <p className="speech-status" role="status" aria-live="polite">{statusMessage}</p>
      <p className="local-processing-disclosure">
        <ShieldCheck size={17} aria-hidden="true" />
        تستخدم القراءة محرك النطق المثبت على هذا الجهاز فقط. لا يرسل هذا المكوّن النص أو بيانات الارتباط عبر الشبكة.
      </p>
    </section>
  );
}
