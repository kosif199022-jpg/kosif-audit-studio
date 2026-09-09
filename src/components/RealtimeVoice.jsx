import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Send, Square } from 'lucide-react';
import { aiRequest, createRealtimeClient } from '../realtime-client.js';

export function RealtimeVoice({ onView, summary = {} }) {
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('الاتصال الصوتي الخادمي جاهز؛ وافق على استخدام الميكروفون ثم ابدأ.');
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [shareSummary, setShareSummary] = useState(false);
  const [model, setModel] = useState('gpt-realtime-2.1');
  const [voice, setVoice] = useState('marin');
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [deviceHint, setDeviceHint] = useState('');
  const client = useRef(null);
  const viewRef = useRef(onView);
  viewRef.current = onView;
  const active = status === 'connecting' || status === 'connected';

  useEffect(() => {
    let live = true;
    Promise.allSettled([aiRequest('config'), aiRequest('realtime')]).then(([registryResult, realtimeResult]) => {
      if (!live) return;
      const registry = registryResult.status === 'fulfilled' ? registryResult.value : null;
      const realtime = realtimeResult.status === 'fulfilled' ? realtimeResult.value : null;
      const configured = registry?.providers?.some((provider) => provider.id === 'openai' && provider.configured) || realtime?.serverConfigured === true;
      setReady(configured);
      setMessage(configured ? 'اتصال الصوت الخادمي مُعد؛ وافق على استخدام الميكروفون ثم ابدأ.' : 'الاتصال الصوتي الخادمي غير متاح مؤقتًا. حاول مرة أخرى لاحقًا.');
    }).catch((error) => {
      if (live) setMessage(error.message);
    });
    client.current = createRealtimeClient({
      onView: (view) => viewRef.current?.(view),
      onStatus: (state, label) => {
        if (!live) return;
        setStatus(state);
        setMessage(label);
        if (state !== 'error') setDeviceHint('');
      },
      onAudioBlocked: () => { if (live) setBlocked(true); },
      onTranscript: (item) => {
        if (!live) return;
        setMessages((current) => {
          const index = current.findIndex((row) => row.id === item.id);
          if (index < 0) return [...current, { ...item, text: item.text.slice(0, 12000) }].slice(-60);
          return current.map((row, rowIndex) => rowIndex === index
            ? { ...item, text: (item.done ? item.text : row.text + item.text).slice(0, 12000) }
            : row);
        });
      }
    });
    return () => {
      live = false;
      client.current?.disconnect(false);
    };
  }, []);

  async function start() {
    setMuted(false);
    setBlocked(false);
    setDeviceHint('');
    setMessages([]);
    try {
      await client.current.connect({ model, voice, consent, shareSummary, summary });
    } catch {
      // createRealtimeClient has already published a safe Arabic status.
    }
  }

  async function inspectMicrophone() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDeviceHint('لا يتيح هذا المتصفح فحص أجهزة الصوت. افتح الموقع في Safari أو Chrome مباشرة.');
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const count = devices.filter((device) => device.kind === 'audioinput').length;
      setDeviceHint(count
        ? `تم العثور على ${count} ميكروفون؛ اسمح للموقع باستخدامه ثم أعد المحاولة.`
        : 'لم يُعثر على ميكروفون في هذا المتصفح؛ افتح الموقع في جهاز به ميكروفون.');
    } catch {
      setDeviceHint('تعذر فحص أجهزة الصوت؛ تحقق من أذونات المتصفح.');
    }
  }

  const microphoneError = status === 'error' && /ميكروفون|المتصفح|HTTPS/.test(message);

  return (
    <div className="realtime-voice">
      <p className="voice-console-status" role="status">{message}</p>
      {!active ? (
        <div className="voice-device-help">
          <button type="button" className="button button-outline" onClick={inspectMicrophone}>فحص الميكروفون</button>
          {microphoneError ? <small>للمحادثة الحية افتح الرابط في Safari أو Chrome مباشرة، ثم اسمح بالميكروفون. متصفح ChatGPT السحابي قد لا يوفّر جهاز إدخال.</small> : null}
          {deviceHint ? <small role="status">{deviceHint}</small> : null}
        </div>
      ) : null}
      {!active ? (
        <>
          <div className="voice-model-fields">
            <label>نموذج الصوت<input value={model} maxLength={80} onChange={(event) => setModel(event.target.value)} dir="ltr" /></label>
            <label>الصوت<select value={voice} onChange={(event) => setVoice(event.target.value)}><option value="marin">Marin</option><option value="cedar">Cedar</option><option value="alloy">Alloy</option></select></label>
          </div>
          <label className="voice-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> أوافق على إرسال صوتي ونص المحادثة إلى OpenAI؛ تطبق رسوم الحساب المهيأ للخدمة.</label>
          <label className="voice-consent"><input type="checkbox" checked={shareSummary} onChange={(event) => setShareSummary(event.target.checked)} /> مشاركة مؤشرات الملف العددية لشرحها أثناء الحديث.</label>
          {shareSummary ? <details><summary>معاينة المؤشرات</summary><pre>{JSON.stringify(summary, null, 2)}</pre></details> : null}
        </>
      ) : null}
      <div className="voice-console-actions">
        {active ? (
          <>
            <button type="button" className="button button-dark" onClick={() => client.current.disconnect()}><PhoneOff size={16} /> إنهاء المحادثة</button>
            {status === 'connected' ? (
              <>
                <button type="button" className="button button-outline" onClick={() => { client.current.setMuted(!muted); setMuted(!muted); }}>{muted ? <MicOff size={16} /> : <Mic size={16} />} {muted ? 'فتح الميكروفون' : 'كتم الميكروفون'}</button>
                <button type="button" className="button button-outline" onClick={() => client.current.interrupt()}><Square size={16} /> مقاطعة الرد</button>
              </>
            ) : null}
          </>
        ) : <button type="button" className="button button-gold" disabled={!consent || !ready || !model} onClick={start}><Phone size={16} /> بدء محادثة حية</button>}
      </div>
      {blocked ? <button className="button button-outline" onClick={() => Promise.resolve(client.current.playAudio()).then(() => setBlocked(false)).catch(() => {})}>تفعيل سماع الرد</button> : null}
      {messages.length > 0 ? <div className="voice-dialogue" role="log" aria-label="نص المحادثة الحية">{messages.map((item) => <p key={item.id}><strong>{item.role === 'user' ? 'أنت' : 'KOSIF AI'}</strong><span>{item.text}</span></p>)}</div> : null}
      {status === 'connected' ? <form className="voice-text-form" onSubmit={(event) => { event.preventDefault(); if (client.current.sendText(text)) setText(''); }}><label className="sr-only" htmlFor="realtime-text">رسالة أثناء المحادثة</label><input id="realtime-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="أو اكتب سؤالك هنا…" /><button className="button button-outline" disabled={!text.trim()}><Send size={16} /></button></form> : null}
      <small className="voice-console-disclosure">هذا صوت مولّد بالذكاء الاصطناعي. يمكنك المقاطعة والتنقل بين الشاشات؛ إغلاق اللوحة ينهي الاتصال. لا يُحفَظ تسجيل صوتي في التطبيق.</small>
    </div>
  );
}
