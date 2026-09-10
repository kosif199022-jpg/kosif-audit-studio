import { useEffect, useRef, useState } from 'react';
import { MessageSquareText, Send, Square, Trash2, Zap } from 'lucide-react';
import { aiRequest } from '../realtime-client.js';
import { createRealtimeTextClient } from '../realtime-text-client.js';
import { clearChatMessages, loadChatMessages, saveChatMessages } from '../chat-session.js';
import { parseVoiceCommand, viewLabel } from '../voice-commands.js';

const QUICK_ACTIONS = [
  'افتح مركز النتائج',
  'افتح مجلس المراجعين',
  'افتح التحليلات',
  'اشرح حالة الملف',
];

function messageId(prefix = 'chat') {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
  const [message, setMessage] = useState('أوامر KOSIF المحلية جاهزة فورًا؛ التحليل الذكي يعمل عند الموافقة.');
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [shareSummary, setShareSummary] = useState(false);
  const [model, setModel] = useState('gpt-realtime-2.1');
  const [voice, setVoice] = useState('marin');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState(() => loadChatMessages());
  const client = useRef(null);
  const viewRef = useRef(onView);
  const pendingTextRef = useRef('');
  const logRef = useRef(null);
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
        ? 'جاهز: أوامر التنقل تُنفذ محليًا، والأسئلة التحليلية تستخدم OpenAI عند الموافقة.'
        : 'خدمة OpenAI غير متاحة الآن؛ أوامر التنقل داخل KOSIF ما زالت تعمل محليًا.');
      if (realtime?.model && /^gpt-realtime/i.test(realtime.model)) setModel(realtime.model);
    }).catch((error) => {
      if (!live) return;
      setReady(false);
      setMessage(error.message || 'تعذر التحقق من خدمة الشات؛ أوامر التنقل المحلية ما زالت متاحة.');
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

  useEffect(() => {
    saveChatMessages(messages);
    const node = logRef.current;
    if (node) requestAnimationFrame(() => { node.scrollTop = node.scrollHeight; });
  }, [messages]);

  useEffect(() => {
    if (status !== 'connected' || !pendingTextRef.current) return;
    const pending = pendingTextRef.current;
    pendingTextRef.current = '';
    if (!client.current?.sendText(pending)) {
      setText(pending);
      setMessage('تم الاتصال لكن تعذر إرسال الرسالة؛ اضغط إرسال مرة أخرى.');
    }
  }, [status]);

  async function startChat() {
    if (active || !ready || !consent || !model) return;
    try {
      await client.current.connect({ model, voice, consent, shareSummary, summary });
    } catch {
      // onStatus in the client already exposes the actionable error.
    }
  }

  function appendLocalExchange(userText, assistantText) {
    setMessages((current) => [...current,
      { id: messageId('local-user'), role: 'user', text: userText, done: true, local: true },
      { id: messageId('local-assistant'), role: 'assistant', text: assistantText, done: true, local: true },
    ].slice(-80));
  }

  function executeLocalCommand(value) {
    const command = parseVoiceCommand(value);
    if (command.type !== 'view') return false;
    viewRef.current?.(command.view);
    const reply = `تم التنفيذ محليًا: فتحت ${viewLabel(command.view)} داخل KOSIF.`;
    appendLocalExchange(value, reply);
    setMessage(reply);
    return true;
  }

  function routeText(rawValue) {
    const value = String(rawValue || '').trim().slice(0, 2000);
    if (!value) return;
    setText('');

    if (executeLocalCommand(value)) return;

    if (status === 'connected') {
      if (!client.current?.sendText(value)) {
        setText(value);
        setMessage('تعذر إرسال الرسالة عبر الاتصال الحالي؛ أعد المحاولة.');
      }
      return;
    }

    if (!consent) {
      appendLocalExchange(value, 'هذا الطلب يحتاج الشات الذكي. فعّل موافقة إرسال نص الشات إلى OpenAI ثم أرسله مرة أخرى؛ أوامر فتح الشاشات تعمل دون هذه الموافقة.');
      setMessage('فعّل موافقة الشات الذكي للأسئلة التي تحتاج تحليلًا.');
      return;
    }

    if (!ready) {
      appendLocalExchange(value, 'خدمة OpenAI غير متاحة الآن. يمكنك الاستمرار في أوامر فتح شاشات KOSIF محليًا دون اتصال خارجي.');
      return;
    }

    pendingTextRef.current = value;
    startChat();
  }

  function submit(event) {
    event.preventDefault();
    routeText(text);
  }

  function clearConversation() {
    pendingTextRef.current = '';
    setMessages([]);
    clearChatMessages();
    setMessage('تم مسح سجل هذه الجلسة من المتصفح.');
  }

  return (
    <div className="realtime-voice text-command-chat">
      <p className="voice-console-status" role="status">{message}</p>
      <small className="voice-live-contract">اكتب مباشرة. أوامر فتح الشاشات تُنفذ محليًا حتى بدون اتصال AI؛ الأسئلة التي تحتاج تحليلًا تستخدم OpenAI فقط بعد موافقتك.</small>

      <div className="chat-quick-actions" aria-label="أوامر سريعة">
        {QUICK_ACTIONS.map((action) => <button key={action} type="button" onClick={() => routeText(action)}><Zap size={13} />{action}</button>)}
      </div>

      {!active ? (
        <div className="chat-ai-permission">
          <label className="voice-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> أوافق على إرسال نص الأسئلة التحليلية إلى OpenAI؛ المفتاح الدائم يبقى في الخادم.</label>
          <label className="voice-consent"><input type="checkbox" checked={shareSummary} onChange={(event) => setShareSummary(event.target.checked)} /> مشاركة مؤشرات الملف العددية المحدودة عند الحاجة لشرح حالة الارتباط.</label>
          <button type="button" className="button button-gold" disabled={!consent || !ready || !model} onClick={startChat}><MessageSquareText size={16} /> اتصال الشات الذكي</button>
        </div>
      ) : (
        <div className="voice-console-actions">
          <span className={`chat-connection-state is-${status}`}>{status === 'connected' ? 'متصل' : 'جارٍ الاتصال…'}</span>
          <button type="button" className="button button-dark" onClick={() => client.current.disconnect()}><Square size={16} /> قطع اتصال AI</button>
        </div>
      )}

      {messages.length ? (
        <div ref={logRef} className="voice-dialogue" role="log" aria-label="شات KOSIF الكتابي">
          {messages.map((item) => (
            <p key={item.id} className={item.local ? 'is-local-command' : undefined}>
              <strong>{item.role === 'user' ? 'أنت' : 'KOSIF AI'}{item.local ? ' · محلي' : ''}</strong>
              <span>{item.text}</span>
            </p>
          ))}
        </div>
      ) : <div className="chat-empty-state"><MessageSquareText size={22} /><span>ابدأ بأمر مباشر أو سؤال عن ملف المراجعة.</span></div>}

      <form className="voice-text-form chat-primary-input" onSubmit={submit}>
        <label className="sr-only" htmlFor="kosif-command-chat">اكتب طلبك</label>
        <input id="kosif-command-chat" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} autoComplete="off" enterKeyHint="send" placeholder="مثال: افتح النتائج، أو اشرح لي حالة الملف…" />
        <button className="button button-outline" disabled={!text.trim()} aria-label="إرسال"><Send size={16} /></button>
      </form>

      {messages.length ? <button type="button" className="chat-clear-button" onClick={clearConversation}><Trash2 size={13} /> مسح محادثة هذه الجلسة</button> : null}
      <small className="voice-console-disclosure">يُحفظ سجل الشات في sessionStorage داخل التبويب الحالي فقط، ويُمسح عند إغلاق التبويب أو بالزر أعلاه. التنفيذ المحلي يفتح مساحات KOSIF ولا يعتمد تقريرًا ولا يحذف بيانات.</small>
    </div>
  );
}
