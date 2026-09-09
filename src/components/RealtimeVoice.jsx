import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, LoaderCircle, Mic, MicOff, Paperclip, Phone, PhoneOff, Send, Square } from 'lucide-react';
import { aiRequest } from '../realtime-client.js';
import { createRealtimeLiveClient } from '../realtime-live-client.js';
import { extractAuditDocument } from '../document-workbench.js';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const DOCUMENT_PATTERN = /\.(pdf|docx|xlsx?|csv|tsv|txt|json)$/i;

function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function audioExtension(mimeType = '') {
  if (/mp4|m4a/i.test(mimeType)) return 'm4a';
  if (/ogg/i.test(mimeType)) return 'ogg';
  return 'webm';
}

async function saveAudioReply(reply) {
  if (!reply?.blob) return;
  const extension = audioExtension(reply.mimeType || reply.blob.type);
  const filename = `KOSIF-audio-${new Date(reply.createdAt || Date.now()).toISOString().replace(/[:.]/g, '-')}.${extension}`;
  if (isIOSDevice() && typeof File === 'function' && navigator.share && navigator.canShare) {
    const file = new File([reply.blob], filename, { type: reply.mimeType || reply.blob.type || 'audio/mp4' });
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'رد KOSIF الصوتي' });
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(reply.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر تجهيز الصورة.'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('صيغة الصورة غير قابلة للقراءة على هذا الجهاز. استخدم JPG أو PNG أو WebP.'));
    };
    image.src = url;
  });
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('تعذر ضغط الصورة.')), 'image/jpeg', quality);
  });
}

async function prepareImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('الملف ليس صورة.');
  if (!file.size || file.size > MAX_ATTACHMENT_BYTES) throw new Error('الصورة يجب أن تكون أقل من 25MB.');
  const { image, url } = await loadImage(file);
  try {
    let edge = 960;
    let quality = 0.78;
    let blob = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
      canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('تعذر تجهيز الصورة في المتصفح.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await canvasBlob(canvas, quality);
      if (blob.size <= 175_000) break;
      edge = Math.max(560, Math.round(edge * 0.78));
      quality = Math.max(0.48, quality - 0.1);
    }
    if (!blob || blob.size > 190_000) throw new Error('الصورة كبيرة جدًا للمحادثة الحية بعد الضغط؛ اختر صورة أصغر.');
    return { kind: 'image', name: file.name || 'صورة', dataUrl: await readBlobAsDataUrl(blob) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareDocument(file) {
  if (!DOCUMENT_PATTERN.test(file.name || '')) throw new Error('استخدم PDF أو DOCX أو XLSX/XLS أو CSV/TSV/TXT/JSON، أو صورة.');
  if (!file.size || file.size > MAX_ATTACHMENT_BYTES) throw new Error('المرفق يجب أن يكون أقل من 25MB.');
  const document = await extractAuditDocument(file, { maxPages: 12, store: async () => {} });
  const excerpts = document.snippets.slice(0, 4).map((item) => `[${item.locator || `ص ${item.page}`}]: ${item.text}`).join('\n');
  if (!excerpts.trim()) throw new Error('لم يُستخرج نص قابل للقراءة من المرفق.');
  return { kind: 'text', name: file.name, text: excerpts };
}

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
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentStatus, setAttachmentStatus] = useState('');
  const [sentAttachments, setSentAttachments] = useState([]);
  const client = useRef(null);
  const attachmentInput = useRef(null);
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
      setMessage(configured ? 'اتصال OpenAI الحي مُعد؛ وافق على استخدام الميكروفون ثم ابدأ.' : 'الاتصال الصوتي الخادمي غير متاح مؤقتًا. حاول مرة أخرى لاحقًا.');
      if (realtime?.model && /^gpt-realtime/i.test(realtime.model)) setModel(realtime.model);
    }).catch((error) => {
      if (live) setMessage(error.message);
    });

    client.current = createRealtimeLiveClient({
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
          const index = current.findIndex((row) => row.id === item.id || (item.responseId && row.responseId === item.responseId));
          if (index < 0) return [...current, { ...item, text: String(item.text || '').slice(0, 12_000) }].slice(-60);
          return current.map((row, rowIndex) => rowIndex === index
            ? { ...row, ...item, text: item.done ? String(item.text || '').slice(0, 12_000) : (String(row.text || '') + String(item.text || '')).slice(0, 12_000) }
            : row);
        });
      },
      onAudioReply: (reply) => {
        if (!live) return;
        setMessages((current) => {
          const index = current.findIndex((row) => row.id === reply.id || (reply.responseId && row.responseId === reply.responseId));
          if (index < 0) return [...current, { id: reply.id, responseId: reply.responseId, role: 'assistant', text: 'رد صوتي', done: true, audio: reply }].slice(-60);
          return current.map((row, rowIndex) => rowIndex === index ? { ...row, audio: reply } : row);
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
    setAttachmentStatus('');
    setSentAttachments([]);
    setMessages([]);
    try {
      await client.current.connect({ model, voice, consent, shareSummary, summary });
    } catch {
      // The realtime client already published a safe Arabic status.
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

  async function addAttachments(event) {
    const files = [...(event.target.files || [])].slice(0, 4);
    event.target.value = '';
    if (!files.length) return;
    if (status !== 'connected') {
      setAttachmentStatus('ابدأ المحادثة الحية أولًا ثم أضف المرفق.');
      return;
    }
    setAttachmentBusy(true);
    setAttachmentStatus('جارٍ تجهيز المرفقات محليًا…');
    const prepared = [];
    const rejected = [];
    for (const file of files) {
      try {
        prepared.push(file.type.startsWith('image/') ? await prepareImage(file) : await prepareDocument(file));
      } catch (error) {
        rejected.push(`${file.name}: ${error.message}`);
      }
    }
    try {
      if (prepared.length && client.current.sendAttachments(prepared)) {
        setSentAttachments((current) => [...current, ...prepared.map((item) => ({ name: item.name, kind: item.kind }))].slice(-12));
        setAttachmentStatus(`تم إرسال ${prepared.length} مرفق للمحادثة${rejected.length ? `، وتعذر ${rejected.length}` : ''}.`);
      } else if (!prepared.length) {
        setAttachmentStatus(rejected[0] || 'لم يُرسل أي مرفق.');
      } else {
        setAttachmentStatus('تعذر إرسال المرفقات عبر الاتصال الحي؛ أعد المحاولة.');
      }
    } finally {
      setAttachmentBusy(false);
    }
  }

  const microphoneError = status === 'error' && /ميكروفون|المتصفح|HTTPS/.test(message);

  return (
    <div className="realtime-voice">
      <p className="voice-console-status" role="status">{message}</p>
      {!active ? (
        <div className="voice-device-help">
          <button type="button" className="button button-outline" onClick={inspectMicrophone}>فحص الميكروفون</button>
          {microphoneError ? <small>على iPhone افتح الرابط في Safari مباشرة ثم اختر «السماح» للميكروفون. إذا منع Safari تشغيل الرد تلقائيًا سيظهر زر «تفعيل سماع الرد».</small> : null}
          {deviceHint ? <small role="status">{deviceHint}</small> : null}
        </div>
      ) : null}
      {!active ? (
        <>
          <div className="voice-model-fields">
            <label>نموذج الصوت<input value={model} maxLength={80} onChange={(event) => setModel(event.target.value)} dir="ltr" /></label>
            <label>الصوت<select value={voice} onChange={(event) => setVoice(event.target.value)}><option value="marin">Marin</option><option value="cedar">Cedar</option><option value="alloy">Alloy</option></select></label>
          </div>
          <label className="voice-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> أوافق على إرسال صوتي ونص المحادثة وأي مرفق أختاره صراحة إلى OpenAI؛ المفتاح الدائم يبقى في الخادم.</label>
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
      {blocked ? <button className="button button-outline" onClick={() => Promise.resolve(client.current.playAudio()).then(() => setBlocked(false)).catch(() => {})}>تفعيل سماع الرد على iPhone</button> : null}
      {status === 'connected' ? (
        <div className="voice-attachment-tools">
          <input ref={attachmentInput} className="sr-only" type="file" multiple accept="image/*,.pdf,.docx,.xlsx,.xls,.csv,.tsv,.txt,.json" onChange={addAttachments} />
          <button type="button" className="button button-outline" disabled={attachmentBusy} onClick={() => attachmentInput.current?.click()}>
            {attachmentBusy ? <LoaderCircle className="spin" size={16} /> : <Paperclip size={16} />} {attachmentBusy ? 'تجهيز المرفق…' : 'إضافة مرفق'}
          </button>
          <small>يدعم الصور وPDF وDOCX وExcel وCSV/TXT/JSON. المستندات يُستخرج نص محدود منها محليًا قبل الإرسال.</small>
        </div>
      ) : null}
      {attachmentStatus ? <small className="voice-attachment-status" role="status">{attachmentStatus}</small> : null}
      {sentAttachments.length ? <div className="voice-attachments" aria-label="المرفقات المرسلة">{sentAttachments.map((item, index) => <span key={`${item.name}-${index}`}>{item.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}<bdi>{item.name}</bdi></span>)}</div> : null}
      {messages.length > 0 ? (
        <div className="voice-dialogue" role="log" aria-label="نص المحادثة الحية">
          {messages.map((item) => <p key={item.id}><strong>{item.role === 'user' ? 'أنت' : 'KOSIF AI'}</strong><span>{item.text}</span>{item.audio ? <button type="button" className="voice-audio-download" onClick={() => saveAudioReply(item.audio)}><Download size={14} /> حفظ/تنزيل الرد الصوتي</button> : null}</p>)}
        </div>
      ) : null}
      {status === 'connected' ? <form className="voice-text-form" onSubmit={(event) => { event.preventDefault(); if (client.current.sendText(text)) setText(''); }}><label className="sr-only" htmlFor="realtime-text">رسالة أثناء المحادثة</label><input id="realtime-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="أو اكتب سؤالك هنا…" /><button className="button button-outline" disabled={!text.trim()}><Send size={16} /></button></form> : null}
      <small className="voice-console-disclosure">هذا صوت مولّد بالذكاء الاصطناعي. المحادثة ثنائية الاتجاه عبر WebRTC ويمكن مقاطعة الرد. تسجيل رد المساعد يتم محليًا في المتصفح فقط لتمكين الحفظ؛ لا يرفع التطبيق نسخة التسجيل إلى خادم KOSIF.</small>
    </div>
  );
}
