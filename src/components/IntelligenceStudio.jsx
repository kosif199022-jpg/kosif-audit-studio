import { useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, Mic, Square, Send, Download, Plus } from 'lucide-react';
import { answerAgent, buildActionPlan, contextStamp, councilStateStamp, draftMemo, TASK_STATUSES, transitionTask, updateTaskDetails } from '../intelligence/agent.js';
import { createAgentContext, specialistReview, VIEW_MAP } from '../intelligence/context.js';
import { REFERENCES, referenceStatus, searchReferences } from '../intelligence/reference-registry.js';
import { downloadTextFile, timestampedFilename } from '../session-export.js';
import '../intelligence/studio.css';

const tabs = [['agent','الإيجنت'],['plan','خطة العمل'],['council','تحديات التخصصات'],['references','مرصد المراجع'],['memos','المذكرات']];
const prompts = ['ما أولويات الملف؟','ما فجوات الأدلة؟','هل الملف جاهز؟','متى يطبق IFRS 18؟'];
const saveText = (filename, contents, type) => downloadTextFile(contents, filename, type);
const safeJson = data => JSON.stringify(data, (_,v) => typeof v === 'bigint' ? v.toString() : v, 2);
function SourceLinks({ items = [] }) { return <div className="ki-links">{items.map(r => <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer">{r.code} ↗</a>)}</div>; }

function TaskEditor({ task, onSave, onOpen }) {
 const [draft, setDraft] = useState(task);
 const [error, setError] = useState('');
 return <form className="ki-card" onSubmit={event => { event.preventDefault(); try { onSave(transitionTask(updateTaskDetails(task,draft),draft.status,{actor:draft.assignee,note:draft.note})); setError(''); } catch(e) { setError(e.message); } }}>
  <h3>{task.title}</h3><p>{task.why}</p><ol>{task.steps.map(s => <li key={s}>{s}</li>)}</ol>
  <div className="ki-fields"><label>المسؤول<input required maxLength={120} value={draft.assignee} onChange={e=>setDraft({...draft,assignee:e.target.value})}/></label><label>الموعد<input type="date" value={draft.dueDate} onChange={e=>setDraft({...draft,dueDate:e.target.value})}/></label><label>الحالة<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}>{Object.entries(TASK_STATUSES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>
  <label>الإجراء والمبرر<textarea maxLength={3000} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label>
  {error && <p role="alert">{error}</p>}<div className="button-row"><button className="button button-dark">حفظ المتابعة</button><button type="button" className="button button-outline" onClick={onOpen}>فتح مساحة الإجراء</button></div>
  {task.history?.length > 0 && <details><summary>سجل المتابعة ({task.history.length})</summary>{task.history.map((h,i)=><p key={i}>{h.at} · {h.actor} · {TASK_STATUSES[h.to]} · {h.note}</p>)}</details>}
 </form>;
}

export function IntelligenceStudio({ accounts, engagement, setEngagement, metrics, reportState, onView, onToast }) {
 const context = useMemo(()=>createAgentContext(accounts,engagement,metrics,reportState),[accounts,engagement,metrics,reportState]);
 const stamp = useMemo(()=>contextStamp(context),[context]);
 const review = useMemo(()=>specialistReview(context),[context]);
 const saved = engagement.intelligence || {};
 const messages = Array.isArray(saved.messages) ? saved.messages : [];
 const plans = Array.isArray(saved.plans) ? saved.plans : [];
 const memos = Array.isArray(saved.memos) ? saved.memos : [];
 const [tab,setTab] = useState('agent');
 const [query,setQuery] = useState('');
 const [referenceQuery,setReferenceQuery] = useState('');
 const [draft,setDraft] = useState(null);
 const [listening,setListening] = useState(false);
 const [readAloud,setReadAloud] = useState(false);
 const recognition = useRef(null);
 const messagesEnd = useRef(null);
 useEffect(()=>()=>{ recognition.current?.abort(); window.speechSynthesis?.cancel(); },[]);
 useEffect(()=>{ if (messages.length) messagesEnd.current?.scrollIntoView({block:'nearest'}); },[messages.length]);
 const update = fn => setEngagement(current=>({...current,intelligence:fn(current.intelligence || {})}));
 function makePlan(mode='risk-first') {
  const plan = buildActionPlan(context,{mode});
  update(s=>({...s,plans:[plan,...(s.plans || [])].slice(0,5)})); setTab('plan'); onToast?.('أُنشئت خطة مقترحة من حالة الملف الحالية.');
 }
 function ask(value) {
  const text=String(value || '').trim().slice(0,1500); if(!text) return;
  const response=answerAgent(text,context);
  update(s=>({...s,messages:[...(s.messages || []),{id:crypto.randomUUID(),query:text,...response,at:new Date().toISOString()}].slice(-40)})); setQuery('');
  if(readAloud && window.speechSynthesis) { window.speechSynthesis.cancel(); const speech=new SpeechSynthesisUtterance(response.text); speech.lang='ar-SA'; window.speechSynthesis.speak(speech); }
 }
 function toggleSpeech() {
  if(listening) { recognition.current?.stop(); return; }
  const Recognition=window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Recognition) return onToast?.('الإملاء الصوتي غير مدعوم في هذا المتصفح؛ يمكنك الكتابة.');
  window.speechSynthesis?.cancel();
  const rec=new Recognition(); recognition.current=rec; rec.lang='ar-SA'; rec.interimResults=true;
  rec.onresult=e=>{ const text=Array.from(e.results).map(r=>r[0].transcript).join(' '); setQuery(text); };
  rec.onerror=()=>{setListening(false);onToast?.('تعذر تشغيل الميكروفون؛ تحقق من إذن المتصفح.');};
  rec.onend=()=>setListening(false);
  try {rec.start();setListening(true);} catch {setListening(false);}
 }
 const go=view=>onView(VIEW_MAP[view] || view);
 const plan=plans[0];
 const refs=searchReferences(referenceQuery);
 return <section className="ki-studio" aria-labelledby="ki-title">
  <header className="panel ki-intro"><BrainCircuit size={27}/><div><span className="eyebrow">KOSIF Intelligence</span><h2 id="ki-title">استوديو الإيجنت والعمل</h2><p>اقتراحات من ملفك، وخطط قابلة للمتابعة، ومراجع مؤرخة. المساعد محلي؛ القرارات المهنية في مساراتها الحالية.</p></div></header>
  <div className="ki-tabs" aria-label="مساحات الإيجنت">{tabs.map(([id,label])=><button key={id} type="button" aria-pressed={tab===id} className={`button ${tab===id?'button-dark':'button-outline'}`} onClick={()=>setTab(id)}>{label}</button>)}</div>
  {tab==='agent' && <div className="panel ki-chat"><div className="button-row">{prompts.map(p=><button key={p} className="button button-outline" onClick={()=>ask(p)}>{p}</button>)}</div>
   <div className="ki-messages" role="log" aria-label="المحادثة">{messages.length===0 && <p>اسأل عن المخاطر أو الأدلة أو الجاهزية، أو أنشئ خطة تبدأ من أولويات الملف.</p>}{messages.map(m=><article className="ki-card" key={m.id}><h3>{m.query}</h3><p className="ki-preserve">{m.text}</p><small>{m.sourceStamp===stamp && (!m.councilStamp || m.councilStamp===councilStateStamp(context.council))?'مرتبطة بالحالة الحالية':'تغيّر المصدر؛ اطلب إجابة محدثة'} · {m.at}</small><SourceLinks items={m.references}/><div className="button-row">{m.actions?.map((a,i)=><button key={i} className="button button-outline" onClick={()=>a.action==='plan'?makePlan():a.view==='references'?setTab('references'):go(a.view)}>{a.label}</button>)}</div></article>)}<span ref={messagesEnd}/></div>
   <form onSubmit={e=>{e.preventDefault();ask(query);}}><label>اسأل الإيجنت<textarea required maxLength={1500} value={query} onChange={e=>setQuery(e.target.value)} placeholder="ما الإجراء التالي؟"/></label><div className="button-row"><button className="button button-dark"><Send size={17}/> إرسال</button><button type="button" className="button button-outline" onClick={toggleSpeech}>{listening?<Square size={17}/>:<Mic size={17}/>} {listening?'إيقاف الإملاء':'إملاء صوتي'}</button><button type="button" className="button button-outline" onClick={()=>makePlan()}><Plus size={17}/> إنشاء خطة</button><button type="button" className="button button-outline" onClick={()=>window.speechSynthesis?.cancel()}>إيقاف القراءة</button></div><label className="ki-check"><input type="checkbox" checked={readAloud} onChange={e=>setReadAloud(e.target.checked)}/> قراءة الردود صوتيًا</label><small>الإملاء اختياري وقد يعالج مزود المتصفح الصوت. راجع النص قبل إرساله.</small></form>
  </div>}
  {tab==='plan' && <div><div className="button-row"><button className="button button-dark" onClick={()=>makePlan()}>خطة بحسب المخاطر</button><button className="button button-outline" onClick={()=>makePlan('completion')}>خطة الإكمال</button>{plan && <button className="button button-outline" onClick={()=>saveText(timestampedFilename('kosif-plan','json'),safeJson(plan),'application/json')}><Download size={17}/> تنزيل الخطة</button>}</div>{plan ? <><p>{plan.authority} · {plan.sourceStamp===stamp?'المصدر مطابق':'تغيّر الملف؛ جدد الخطة قبل استخدامها'}</p>{plan.omittedRisks>0 && <p>تعرض الخطة أعلى 12 خطرًا؛ توجد {plan.omittedRisks} مخاطر إضافية في السجل.</p>}<div className="ki-grid">{plan.tasks.map(task=><TaskEditor key={`${plan.id}-${task.id}`} task={task} onOpen={()=>go(task.view)} onSave={next=>update(s=>({...s,plans:s.plans.map(p=>p.id===plan.id?{...p,tasks:p.tasks.map(t=>t.id===task.id?next:t)}:p)}))}/>)}</div>{plans.length>1 && <details className="ki-card"><summary>الخطط السابقة ({plans.length-1})</summary>{plans.slice(1).map(p=><p key={p.id}>{p.createdAt} · {p.tasks.length} مهام <button className="button button-outline" onClick={()=>saveText(timestampedFilename('kosif-plan','json'),safeJson(p),'application/json')}>تنزيل</button></p>)}</details>}</>:<p className="panel ki-card">أنشئ خطة من بيانات الملف الحالية.</p>}</div>}
  {tab==='council' && <div><p>{review.authority}</p><div className="button-row"><button className="button button-dark" onClick={()=>go('council')}>فتح المجلس وقراره البشري</button><button className="button button-outline" onClick={()=>saveText(timestampedFilename('kosif-specialists','json'),safeJson(review),'application/json')}>تنزيل أسئلة التحدي</button></div><div className="ki-grid">{review.seats.map(s=><article className="ki-card" key={s.id}><h3>{s.title}</h3><p>{s.question}</p><strong>{s.blockers.length?'يتطلب إجراء':'يتطلب فحصًا بشريًا'}</strong>{s.blockers.map(b=><p key={b}>• {b}</p>)}<SourceLinks items={REFERENCES.filter(r=>r.id===s.referenceId)}/></article>)}</div></div>}
  {tab==='references' && <div><div className="panel ki-card ki-fields"><label>ابحث بالمصدر أو الموضوع<input value={referenceQuery} onChange={e=>setReferenceQuery(e.target.value)}/></label><label>بداية الفترة المالية<input type="date" value={saved.periodStart || ''} onChange={e=>update(s=>({...s,periodStart:e.target.value}))}/></label></div><p>السريان الدولي بحسب بداية الفترة؛ تحقق من الاعتماد المحلي والتطبيق المبكر. المصادر أُعدّت في 2026-09-05.</p><div className="ki-grid">{refs.map(r=><article className="ki-card" key={r.id}><span className="eyebrow">{r.code}</span><h3>{r.title}</h3><p>{r.summary}</p><p>{r.edition} · {r.publisher}</p><strong>{referenceStatus(r,saved.periodStart).label}</strong><p>{r.action}</p><SourceLinks items={[r]}/><button className="button button-outline" onClick={()=>update(s=>({...s,bookmarks:(s.bookmarks || []).includes(r.id)?s.bookmarks.filter(id=>id!==r.id):[...(s.bookmarks || []),r.id]}))}>{(saved.bookmarks || []).includes(r.id)?'إزالة من المحفوظات':'حفظ المرجع'}</button></article>)}</div></div>}
  {tab==='memos' && <div><div className="button-row"><button className="button button-dark" onClick={()=>setDraft({id:crypto.randomUUID(),text:draftMemo(context),sourceStamp:stamp,createdAt:new Date().toISOString()})}>صياغة مذكرة من الملف</button><button className="button button-outline" onClick={()=>go('reviewer-workspace')}>فتح ملاحظات المراجع</button></div>{draft && <div className="ki-card"><p>{draft.sourceStamp===stamp?'مسودة مرتبطة بالحالة الحالية':'مسودة من حالة سابقة؛ راجعها قبل الاستخدام'}</p><label>نص المذكرة<textarea className="ki-memo" value={draft.text} maxLength={20000} onChange={e=>setDraft({...draft,text:e.target.value})}/></label><div className="button-row"><button className="button button-dark" onClick={()=>{update(s=>({...s,memos:[{...draft,updatedAt:new Date().toISOString()},...(s.memos || []).filter(m=>m.id!==draft.id)].slice(0,20)}));onToast?.('حُفظت المسودة وبصمة مصدرها.');}}>حفظ المسودة</button><button className="button button-outline" onClick={()=>saveText(timestampedFilename('kosif-memo','md'),draft.text,'text/markdown')}>تنزيل المذكرة</button></div></div>}{memos.map(m=><article key={m.id} className="ki-card"><h3>{m.text.split('\n')[0]}</h3><p>{m.createdAt} · {m.sourceStamp===stamp?'مطابقة للمصدر':'المصدر تغيّر'}</p><button className="button button-outline" onClick={()=>setDraft(m)}>فتح وتحرير</button></article>)}</div>}
 </section>;
}
