import { useMemo, useState } from 'react';
import { CheckCircle2, CircleHelp, Volume2, XCircle } from 'lucide-react';

function detectIOSWebKit() {
  if (typeof navigator === 'undefined') return false;
  const userAgent = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '');
  return /iPhone|iPad|iPod/i.test(userAgent)
    || /iP(hone|ad|od)/i.test(platform)
    || (/Mac/i.test(platform) && Number(navigator.maxTouchPoints || 0) > 1);
}

function capabilitySnapshot() {
  const target = typeof window !== 'undefined' ? window : {};
  return [
    { label: 'HTTPS', ok: target.isSecureContext !== false },
    { label: 'WebRTC', ok: typeof target.RTCPeerConnection === 'function' },
    { label: 'الميكروفون', ok: Boolean(target.navigator?.mediaDevices?.getUserMedia) },
    { label: 'تشغيل الصوت', ok: typeof target.Audio === 'function' },
    { label: 'Web Audio', ok: typeof (target.AudioContext || target.webkitAudioContext) === 'function' },
    { label: 'تسجيل الرد', ok: typeof target.MediaRecorder === 'function' },
  ];
}

async function playSpeakerTest() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Web Audio غير متاح على هذا الجهاز.');
  const context = new AudioContextClass();
  try {
    await context.resume?.();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 523.25;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.2);
    await new Promise((resolve) => setTimeout(resolve, 240));
  } finally {
    await context.close?.().catch?.(() => {});
  }
}

export function VoiceEnvironmentCheck() {
  const [open, setOpen] = useState(false);
  const [speakerState, setSpeakerState] = useState('idle');
  const checks = useMemo(capabilitySnapshot, []);
  const ios = useMemo(detectIOSWebKit, []);
  const allReady = checks.every((item) => item.ok);

  async function testSpeaker() {
    if (speakerState === 'testing') return;
    setSpeakerState('testing');
    try {
      await playSpeakerTest();
      setSpeakerState('played');
    } catch {
      setSpeakerState('failed');
    }
  }

  return (
    <div className={`voice-health ${allReady ? 'is-ready' : 'has-issue'}`}>
      <div className="voice-health-summary">
        <span>{allReady ? <CheckCircle2 size={15} /> : <CircleHelp size={15} />}{ios ? 'iPhone / iPad' : 'فحص بيئة الصوت'} · {allReady ? 'القدرات الأساسية متاحة' : 'توجد قدرة غير متاحة'}</span>
        <button type="button" onClick={() => setOpen((value) => !value)}>{open ? 'إخفاء الفحص' : 'تشخيص الصوت'}</button>
      </div>
      {open ? (
        <div className="voice-health-detail">
          <div className="voice-health-grid">
            {checks.map((item) => <span key={item.label} className={item.ok ? 'ok' : 'bad'}>{item.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{item.label}</span>)}
          </div>
          <button type="button" className="button button-outline voice-speaker-test" onClick={testSpeaker} disabled={speakerState === 'testing'}><Volume2 size={15} /> {speakerState === 'testing' ? 'جارٍ الاختبار…' : 'اختبار سماعة الجهاز'}</button>
          {speakerState === 'played' ? <small>تم إرسال نغمة اختبار قصيرة. إذا لم تسمعها، ارفع صوت الوسائط وتأكد من أن الجهاز ليس موصولًا بمخرج صوت آخر.</small> : null}
          {speakerState === 'failed' ? <small>تعذر بدء اختبار السماعة من المتصفح؛ أعد فتح الموقع في Safari مباشرة.</small> : null}
          {ios ? <small>على iPhone: ابدأ المحادثة من ضغطة مباشرة داخل Safari، وافق على الميكروفون، واترك الصفحة في المقدمة أثناء أول اتصال.</small> : null}
        </div>
      ) : null}
    </div>
  );
}
