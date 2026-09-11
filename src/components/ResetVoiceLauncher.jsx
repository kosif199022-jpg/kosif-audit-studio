import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Mic, X } from "lucide-react";
import { RESET_STORAGE_KEY, sanitizeState } from "../reset-audit-engine.js";
import "../reset-voice.css";

const ResetVoiceExperience = lazy(() => import("./ResetVoiceExperience.jsx").then((module) => ({ default: module.ResetVoiceExperience })));

const VIEW_LABELS = Object.freeze({
  overview: "رفع المستندات",
  "data-intake": "رفع المستندات",
  "trial-balance": "رفع المستندات",
  evidence: "المستندات المطلوبة",
  rounds: "جولات المراجعة",
  council: "مجلس المراجعين",
  reports: "التقرير النهائي",
});

function readResetState() {
  try {
    return sanitizeState(JSON.parse(localStorage.getItem(RESET_STORAGE_KEY) || "null"));
  } catch {
    return sanitizeState(null);
  }
}

function openResetWorkspace(view) {
  const label = VIEW_LABELS[view];
  if (!label) return;
  const shortLabel = label
    .replace("المستندات المطلوبة", "الطلبات")
    .replace("جولات المراجعة", "الجولات")
    .replace("مجلس المراجعين", "المجلس")
    .replace("التقرير النهائي", "التقرير");
  const buttons = [...document.querySelectorAll(".reset-sidebar nav button, .reset-bottom-nav button")];
  const target = buttons.find((button) => String(button.textContent || "").includes(shortLabel))
    || buttons.find((button) => String(button.textContent || "").includes(label));
  target?.click();
}

export function ResetVoiceLauncher() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(() => readResetState());

  useEffect(() => {
    if (!open) return undefined;
    setSnapshot(readResetState());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  const summary = useMemo(() => ({
    accountCount: 0,
    balanced: true,
    openFindings: 0,
    pendingEvidence: snapshot.requests.filter((item) => item.status === "requested").length,
    completedRounds: snapshot.rounds.length,
    totalRounds: snapshot.rounds.length,
  }), [snapshot]);

  return <>
    <button
      type="button"
      className="reset-voice-trigger"
      onClick={() => setOpen(true)}
      aria-label="فتح المحادثة الصوتية"
      title="محادثة KOSIF الصوتية"
    >
      <Mic size={22} />
      <span>تحدث مع KOSIF</span>
    </button>

    {open ? <div className="reset-voice-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="reset-voice-modal" role="dialog" aria-modal="true" aria-labelledby="reset-voice-title">
        <header className="reset-voice-head">
          <div><Mic size={21} /><span><strong id="reset-voice-title">محادثة KOSIF الحية</strong><small>صوت + نص + تنزيل MP3</small></span></div>
          <button type="button" className="reset-voice-close" onClick={() => setOpen(false)} aria-label="إغلاق المحادثة"><X size={20} /></button>
        </header>
        <Suspense fallback={<div className="reset-voice-loading" role="status">جارٍ تجهيز الاتصال الصوتي…</div>}>
          <ResetVoiceExperience summary={summary} onView={openResetWorkspace} />
        </Suspense>
      </section>
    </div> : null}
  </>;
}
