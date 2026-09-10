import { useEffect, useRef, useState } from 'react';
import { MessageSquareText, Send, Square } from 'lucide-react';
import { aiRequest } from '../realtime-client.js';
import { createRealtimeTextClient } from '../realtime-text-client.js';

function mergeTranscript(current, item) {
  const index = current.findIndex((row) => row.id === item.id || (item.responseId && row.responseId === item.responseId));
  if (index < 0) return [...current, { ...item, text: String(item.text || '').slice(0, 12_000) }].slice(-80);
  return current.map((row, rowIndex) => rowIndex === index
    ? {
        ...row,
        ...item,
        text: item.done
          ? String(item.text || row.text || '').slice(0, 12_000)
          : (String(row.text || '') + String(item.text || '')).slice(0, 12_000)
      }
    : row);
}

export function TextCommandChat({ onView, summary = {} }) {
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('الشات الكتابي جاهز ولا يحتاج إذن الميكروفون.');
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [shareSummary, setShareSummary] = useState(false);
  const [model, setModel] = useState('gpt-realtime-2.1');
  const [voice, setVoice] = useState('marin');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);
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
      setMessage(configured
        ? 'الشات الكتابي جاهز؛ شغّله ثم اكتب طلبك.'
        : 'خدمة OpenAI غير مهيأة حاليًا.');
      if (realtime?.model && /^gpt-realtime/i.test(realtime.model)) setModel(realtime.model);
    }).catch((error) => {
      if (!live) return;
      setReady(false);
      setMessage(error.message || 'تعذر التحقق من خدمة الشات.');
    });

    client.current = createRealtimeTextClient({
      onView: (view) => viewRef.current?.(view),
      onStatus: (state, label) => {
        if (!live) return;
        setStatus(state);
        setMessage(label);
      },
      onTranscript: (item) => {
        if (!live) return;
        setMessages((current) => mergeTranscript(current, item));
      }
    });

    return () => {
      live = false;
      client.current?.disconnect(false);
    };
  }, []);

  async function startChat() {
    setMessages([]);
    try {
      await client.current.connect({ model, voice, consent, shareSummary, summary });
    } catch {}
  }

  function submit(event) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (client.current?.sendText(value)) setText('');
  }

  return (
    <div className="realtime-voice text-command-chat">
      <p className="voice-console-status" role="status">{message}</p>
      <small className="voice-live-contract">شات KOSIF يعمل بدون ميكروفون. اكتب طلبًا مثل «افتح مجلس المراجعين» أو «افتح التقارير واشرح لي ما أراه»؛ يمكنه تنفيذ التنقل داخل مساحات KOSIF المسموحة والرد كتابيًا.</small>

      {!active ? (
        <>
          <label className="voice-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> أوافق على إرسال نص الشات إلى OpenAI؛ المفتاح الدائم يبقى في الخادم.</label>
          <label className="voice-consent"><input type="checkbox" checked={shareSummary} onChange={(event) => setShareSummary(event.target.checked)} /> مشاركة مؤشرات الملف العددية عند الحاجة لشرحها.</label>
          <button type="button" className="button button-gold" disabled={!consent || !ready || !model} onClick={startChat}><MessageSquareText size={16} /> تشغيل الشات الكتابي</button>
        </>
      ) : (
        <div className="voice-console-actions">
          <button type="button" className="button button-dark" onClick={() => client.current.disconnect()}><Square size={16} /> إغلاق الشات</button>
        </div>
      )}

      {messages.length ? (
        <div className="voice-dialogue" role="log" aria-label="شات KOSIF الكتابي">
          {messages.map((item) => (
            <p key={item.id}>
              <strong>{item.role === 'user' ? 'أنت' : 'KOSIF AI'}</strong>
              <span>{item.text}</span>
            </p>
          ))}
        </div>
      ) : null}

      {status === 'connected' ? (
        <form className="voice-text-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="kosif-command-chat">اكتب طلبك</label>
          <input id="kosif-command-chat" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} autoComplete="off" placeholder="اكتب ما تريد من KOSIF تنفيذه أو شرحه…" />
          <button className="button button-outline" disabled={!text.trim()} aria-label="إرسال"><Send size={16} /></button>
        </form>
      ) : null}

      <small className="voice-console-disclosure">الشات الكتابي لا يطلب الميكروفون ولا يحولك إلى أوامر قراءة المتصفح. التنفيذ الآلي محدود بالأدوات الآمنة التي يعلنها KOSIF؛ لا يعتمد تقريرًا ولا يحذف بيانات تلقائيًا.</small>
    </div>
  );
}
