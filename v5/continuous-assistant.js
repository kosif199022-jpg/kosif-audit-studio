/**
 * KOSIF V5 — KOSIF Live: مساعد ملف المراجعة.
 * قواعد عربية حتمية تقرأ حالة الارتباط فقط: لا نموذج لغوي خارجي، ولا رقم مُخترع،
 * ولا اعتماد دليل أو إصدار رأي. كل إجابة تحمل مصدرها من حالة الملف.
 * الدوال المصدَّرة العليا (assistantSnapshot / routeAssistantQuery) نقية وقابلة للاختبار بلا متصفح.
 */
import { store, esc, money } from './continuous-store.js';
import { WORKSPACE_VIEWS, workspaceMetrics } from './workspace-layout.js';
import { nextActionForEngagement } from './engagement-machine.js';
import { normalizeDashboardText } from './dashboard-capabilities.js';
import { setWorkspaceView } from './continuous-workspace-navigation.js';
import { ensureStyleAsset } from './ui-assets.js';

const $=s=>document.querySelector(s);
const MAX_LOG=40;
let messages=[],speakEnabled=false,listening=false,recognition=null;

const OPEN_REQUESTS=new Set(['draft','requested','received','under-review','partial']);
const OPEN_ISSUES=new Set(['open','investigating','management-response','challenged']);
const REVIEWED_EVIDENCE=new Set(['reviewed','sufficient']);
const SEVERITY_LABELS=Object.freeze({critical:'حرجة',high:'عالية',medium:'متوسطة',low:'منخفضة'});
const STAGE_LABELS=Object.freeze({INTAKE:'استلام',UNDERSTANDING:'فهم وتصنيف',PLANNING:'تخطيط',EVIDENCE_COLLECTION:'جمع أدلة',COUNCIL_REVIEW:'مراجعة المجلس',AWAITING_EVIDENCE:'بانتظار أدلة',ADJUSTMENTS:'تسويات',COMPLETION:'إكمال',REPORTING:'تقرير',ISSUED:'صادر'});

/** كلمات التوجيه إلى مساحات العمل — مكتوبة كما يجري تطبيعها (ة→ه، أ→ا، ى→ي). */
export const ASSISTANT_VIEW_WORDS=Object.freeze({
  overview:['الان','نظره عامه','الرئيسيه','لوحه القياده','ملخص الملف','الحاله العامه'],
  documents:['المستندات','مستند','الملفات','المصادر','الاستلام','ميزان المراجعه','كشف البنك'],
  issues:['القضايا','قضيه','المخاطر','خطر','المشاكل','الملاحظات'],
  council:['المجلس','المراجعين','المستشارين','الجولات'],
  financials:['القوائم','التسويات','الماليه','القوائم الماليه','قائمه المركز المالي','الارباح','قائمه الدخل','الميزانيه العموميه'],
  report:['التقرير','التقارير','المسوده','الاصدار','الراي','الطباعه']
});
export const ASSISTANT_QUICK_ASKS=Object.freeze(['ما الخطوة التالية؟','ما القضايا المفتوحة؟','كم طلب دليل مفتوح؟','ما حالة التقرير؟','ما حالة الميزان؟','افتح المجلس']);
export const ASSISTANT_CAPABILITIES=Object.freeze([
  'الخطوة التالية والمرحلة الحالية للملف',
  'الميزان والاتزان وعدد الحسابات',
  'القضايا المفتوحة والمخاطر العالية',
  'طلبات الأدلة المفتوحة وأعلى أولوياتها',
  'جولات مجلس المراجعين وآخر نتيجة',
  'الأهمية النسبية والأساس المستخدم',
  'التسويات المقترحة والمقبولة',
  'حالة التقرير وجودة الأدلة',
  'التنقل بين مساحات العمل، وعقد جولة، وتحميل النموذج التجريبي'
]);

const has=(text,...words)=>words.some(w=>text.includes(normalizeDashboardText(w)));
const count=(n,one,two,few)=>`${n} ${n===2?two:n>=3&&n<=10?few:one}`;
const OPEN_REQUEST_LABEL={one:'طلب مفتوح',two:'طلبان مفتوحان',few:'طلبات مفتوحة'};
const OPEN_ISSUE_LABEL={one:'قضية مفتوحة',two:'قضيتان مفتوحتان',few:'قضايا مفتوحة'};
const cover=(n,label)=>n?count(n,label.one,label.two,label.few):`لا ${label.few}`;
const listTop=(rows,format,limit=3)=>rows.slice(0,limit).map(format).join('؛ ');

/** لقطة حتمية من حالة الارتباط: كل رقم لاحق في الإجابات يقرأ من هنا فقط. */
export function assistantSnapshot({engagement=store.engagement,analysis=store.analysis,materiality=store.materiality}={}){
  const safe=engagement??{};
  const metrics=workspaceMetrics(safe), next=nextActionForEngagement(safe);
  const documents=safe.documents??[], evidence=safe.evidence??[], requests=safe.requests??[], issues=safe.issues??[], rounds=safe.councilRounds??[], reports=safe.reports??[];
  const openRequests=requests.filter(r=>OPEN_REQUESTS.has(r.status)), openIssues=issues.filter(i=>OPEN_ISSUES.has(i.status)), report=reports.at(-1)??null;
  return{
    entity:safe.entity??'', period:safe.period??null, stage:next.stage, stageLabel:STAGE_LABELS[next.stage]??next.stage,
    next:{code:next.code??null,label:next.label??''}, readiness:next.readiness?.score??0, ready:Boolean(next.readiness?.ready),
    documents:{count:documents.length,types:[...new Set(documents.map(d=>d.type).filter(Boolean))]},
    evidence:{count:evidence.length,reviewed:evidence.filter(e=>REVIEWED_EVIDENCE.has(e.reviewStatus)).length},
    requests:{open:openRequests.length,critical:openRequests.filter(r=>r.priority==='critical').length,top:openRequests.slice(0,3).map(r=>({id:r.id,title:r.title??r.id,priority:r.priority??'normal'}))},
    issues:{open:openIssues.length,high:openIssues.filter(i=>['critical','high'].includes(i.severity)).length,top:openIssues.slice(0,3).map(i=>({id:i.id,title:i.title??i.id,severity:i.severity??'medium'}))},
    council:{rounds:rounds.length,latestRound:rounds.at(-1)?.number??null,verdict:rounds.at(-1)?.verdict??null},
    adjustments:{pending:metrics.pendingAdjustments,accepted:metrics.acceptedAdjustments},
    report:{count:reports.length,id:report?.id??null,version:report?.version??null,status:report?.status??null,title:report?.title??null},
    analysis:analysis?{accounts:(analysis.rows??[]).length,balanced:Boolean(analysis.balanced)}:null,
    materiality:materiality?{benchmark:materiality.benchmark??null,rate:materiality.rate??null,overall:materiality.overall??null,performance:materiality.performance??null}:null
  };
}

const answer=(intent,reply,extra={})=>({intent,reply,view:null,action:null,cite:'',...extra});
function viewLabel(id){return WORKSPACE_VIEWS.find(v=>v.id===id)?.label??id}
function findView(text){
  for(const [id,words] of Object.entries(ASSISTANT_VIEW_WORDS)) if(has(text,...words)) return id;
  return null;
}
function capabilitiesText(){return `أجيب من حالة الملف عن: ${ASSISTANT_CAPABILITIES.join('، ')}.`}

/** توجيه السؤال إلى إجابة حتمية. لا يُعاد أي رقم غير موجود في اللقطة. */
export function routeAssistantQuery(query,snapshot){
  const text=normalizeDashboardText(query);
  const snap=snapshot??assistantSnapshot();
  const viewId=findView(text);
  const stateCite='engagement · workspaceMetrics';
  if(!text) return answer('unknown','اكتب سؤالك أو اختر أحد الأسئلة السريعة.',{cite:'assistant'});

  if(has(text,'اعقد جوله','عقد جوله','جوله جديده','شغل المجلس')) return answer('convene','أعقد جولة مجلس جديدة على حالة الملف الحالية. المواقف تُشتق من المحرك، والقرار يبقى للمراجع.',{action:'convene',cite:stateCite});
  if(has(text,'حمل النموذج','حمل نموذج','بيانات تجريبيه','نموذج 5000','5000 حساب')) return answer('demo','أحمّل نموذج 5000 حساب المتزن لبناء ميزان المراجعة والأهمية النسبية.',{action:'demo',cite:'demo dataset'});
  if(has(text,'ابن مسوده','ابني التقرير','انشئ التقرير','مسوده جديده','ابن التقرير')) return answer('draft',snap.ready?'البوابات مكتملة — أبني مسودة التقرير الآن.':`لا أبني مسودة قبل استيفاء البوابات: ${cover(snap.requests.open,OPEN_REQUEST_LABEL)} و${cover(snap.issues.open,OPEN_ISSUE_LABEL)}.`,{action:snap.ready?'draft':null,cite:stateCite});
  if(has(text,'اطبع التقرير','طباعه','طباعه التقرير','pdf')) return answer('print',snap.report.count?'أفتح نافذة الطباعة: تُطبع مسودة التقرير وحدها بلا واجهة التشغيل.':'لا يوجد تقرير مبني بعد، ابدأ ببناء المسودة.',{action:snap.report.count?'print':null,cite:'reports'});

  if(has(text,'الخطوه التاليه','ما التالي','ماذا الان','اين وصلنا','وين وصلنا','ماذا افعل','ايش اسوي','شو اسوي','الخطوه القادمه','ماذا يحتاج الملف')){
    const blockers=snap.requests.open||snap.issues.open?` المفتوح الآن: ${cover(snap.requests.open,{one:'طلب دليل',two:'طلبان',few:'طلبات أدلة'})} و${cover(snap.issues.open,{one:'قضية',two:'قضيتان',few:'قضايا'})}.`:' لا توجد طلبات أو قضايا مفتوحة.';
    return answer('next',`المرحلة الحالية: ${snap.stageLabel}. الخطوة التالية: ${snap.next.label}. جاهزية التقرير ${snap.readiness}%.${blockers}`,{view:'overview',cite:`engagement.stage · readiness ${snap.readiness}%`});
  }
  if(has(text,'جاهزيه','جاهز','متى يصدر','متى ننتهي')){
    return answer('readiness',`جاهزية التقرير ${snap.readiness}% · ${cover(snap.requests.open,OPEN_REQUEST_LABEL)} · ${cover(snap.issues.open,OPEN_ISSUE_LABEL)} · ${count(snap.evidence.reviewed,'دليل مراجع','دليلان مراجعان','أدلة مراجعة')} من ${snap.evidence.count}. ${snap.ready?'البوابات مكتملة ويمكن بناء المسودة.':'البوابات ما زالت مفتوحة.'}`,{view:'report',cite:stateCite});
  }
  if(has(text,'موانع','عوائق','ناقص','ما الذي ينقص','ماذا ينقص')){
    const parts=[];
    if(snap.requests.top.length)parts.push(`أعلى الطلبات: ${listTop(snap.requests.top,r=>r.title)}`);
    if(snap.issues.top.length)parts.push(`أعلى القضايا: ${listTop(snap.issues.top,i=>i.title)}`);
    return answer('blockers',parts.length?`الموانع المسجلة في الملف — ${parts.join(' | ')}.`:`لا توجد موانع مسجلة. المرحلة ${snap.stageLabel} والخطوة ${snap.next.label}.`,{view:snap.requests.top.length?'documents':'issues',cite:stateCite});
  }
  if(has(text,'قضايا','قضيه','مخاطر','خطر','مشاكل','ملاحظات')){
    if(!snap.issues.open) return answer('issues',snap.issues.open===0?'لا توجد قضايا مفتوحة في الملف.':'لم تُسجّل قضايا بعد. ارفع المستندات أو حمّل النموذج التجريبي لبدء التحليل.',{view:'issues',cite:'engagement.issues'});
    return answer('issues',`${count(snap.issues.open,OPEN_ISSUE_LABEL.one,OPEN_ISSUE_LABEL.two,OPEN_ISSUE_LABEL.few)} منها ${count(snap.issues.high,'قضية حرجة أو عالية','قضيتان حرجتان أو عاليتان','قضايا حرجة أو عالية')}. أعلاها: ${listTop(snap.issues.top,i=>`${i.title} (${SEVERITY_LABELS[i.severity]??i.severity})`)}.`,{view:'issues',cite:'engagement.issues'});
  }
  if(has(text,'طلبات','طلب','مطلوب مني','المطلوب')){
    if(!snap.requests.open) return answer('requests','لا توجد طلبات أدلة مفتوحة.',{view:'documents',cite:'engagement.requests'});
    return answer('requests',`${count(snap.requests.open,OPEN_REQUEST_LABEL.one,OPEN_REQUEST_LABEL.two,OPEN_REQUEST_LABEL.few)}${snap.requests.critical?` منها ${count(snap.requests.critical,'طلب حرج','طلبان حرجان','طلبات حرجة')}`:''}. أعلاها: ${listTop(snap.requests.top,r=>r.title)}.`,{view:'documents',cite:'engagement.requests'});
  }
  if(has(text,'دليل','ادله','اوراق عمل','file')){
    return answer('evidence',snap.evidence.count?`${count(snap.evidence.count,'دليل مسجل','دليلان مسجلان','أدلة مسجلة')}، منها ${count(snap.evidence.reviewed,'دليل مراجع','دليلان مراجعان','أدلة مراجعة')}. مراجعة كفاية الدليل وملاءمته قرار مهني للمراجع.`:'لا توجد أدلة مسجلة بعد.',{view:'documents',cite:'engagement.evidence'});
  }
  if(has(text,'المجلس','المراجعين','المستشارين','جولات','الجوله','نزاع')){
    if(!snap.council.rounds) return answer('council','لم تُعقد أي جولة مجلس بعد. يمكنني عقد الجولة الأولى على حالة الملف الحالية.',{view:'council',action:'convene',cite:'engagement.councilRounds'});
    return answer('council',`${count(snap.council.rounds,'جولة معقودة','جولتان معقودتان','جولات معقودة')}، وآخرها R${snap.council.latestRound}${snap.council.verdict?` بنتيجة ${snap.council.verdict}`:''}.`,{view:'council',cite:'engagement.councilRounds'});
  }
  if(has(text,'اتزان','متزن','ميزان','حسابات','ميزان المراجعه')){
    if(!snap.analysis) return answer('analysis','لا يوجد ميزان مراجعة محمّل. ارفع ملف الميزان أو اطلب «حمّل النموذج التجريبي».',{view:'documents',cite:'analysis:null'});
    return answer('analysis',`الميزان المحمّل يحتوي ${count(snap.analysis.accounts,'حسابًا','حسابين','حسابات')} وحالته ${snap.analysis.balanced?'متزنة حسابيًا':'غير متزنة'}. الاتزان لا يثبت صحة الاعتراف أو القياس.`,{view:'financials',cite:'analysis.rows · analysis.balanced'});
  }
  if(has(text,'اهميه','اهميه نسبيه','materiality')){
    if(!snap.materiality) return answer('materiality','الأهمية النسبية غير محسوبة بعد. تُحسب بعد تحميل ميزان مراجعة، ثم تُعتمد بموقف المراجع.',{view:'financials',cite:'materiality:null'});
    return answer('materiality',`الأهمية النسبية الإجمالية ${money(snap.materiality.overall??0n)}${snap.materiality.benchmark?` على أساس ${snap.materiality.benchmark}`:''}${snap.materiality.performance?`، وأهمية الأداء ${money(snap.materiality.performance)}`:''}. الاعتماد قرار بشري في غرفة الإكمال.`,{view:'financials',cite:'materiality.overall · materiality.benchmark'});
  }
  if(has(text,'تسويه','تسويات','قيود','قيد')){
    return answer('adjustments',snap.adjustments.pending||snap.adjustments.accepted?`${cover(snap.adjustments.pending,{one:'تسوية بانتظار قرار',two:'تسويتان بانتظار قرار',few:'تسويات بانتظار قرار'})} و${cover(snap.adjustments.accepted,{one:'تسوية مقبولة',two:'تسويتان مقبولتان',few:'تسويات مقبولة'})}. التسوية المقبولة لا تُطبَّق على الميزان الأصلي.`:'لا توجد تسويات مقترحة أو مقبولة حتى الآن.',{view:'financials',cite:'engagement.adjustments'});
  }
  if(has(text,'تقرير','التقارير','مسوده','اصدار','الراي','راي المراجع')){
    if(!snap.report.count) return answer('report',`لا يوجد تقرير مبني. جاهزية الملف ${snap.readiness}% والخطوة التالية: ${snap.next.label}.`,{view:'report',cite:stateCite});
    return answer('report',`آخر تقرير ${snap.report.id} v${snap.report.version} حالته «${snap.report.status}»${snap.report.title?` بعنوان ${snap.report.title}`:''}. الإصدار النهائي لا يقع إلا باعتماد بشري.`,{view:'report',cite:'engagement.reports'});
  }
  if(has(text,'مستندات','مستند','ملفات','مصادر')){
    return answer('documents',snap.documents.count?`${count(snap.documents.count,'مستند مسجل','مستندان مسجلان','مستندات مسجلة')}${snap.documents.types.length?` بأنواع: ${snap.documents.types.slice(0,5).join('، ')}`:''}. كل مستند يحمل بصمة SHA‑256 ودرجة جودة مراجعة.`:'لا توجد مستندات بعد. ارفع أول مستند أوحمّل النموذج التجريبي.',{view:'documents',cite:'engagement.documents'});
  }
  if(viewId) return answer('navigate',`أنتقل إلى مساحة «${viewLabel(viewId)}».`,{view:viewId,cite:'workspace-layout'});
  if(has(text,'افتح','انتقل','اذهب','روح','اعرض','شاش','مساحه')){
    return answer('navigate',`أي مساحة تريد؟ ${WORKSPACE_VIEWS.map(v=>v.label).join('، ')}.`,{cite:'workspace-layout'});
  }
  if(has(text,'مساعده','شو تعرف','ماذا تستطيع','اوامر','المساعده','مساعد')) return answer('help',capabilitiesText(),{cite:'assistant'});
  return answer('unknown',`لا أملك قاعدة تحكم بهذا السؤال، ولن أخمّن. ${capabilitiesText()}`,{cite:'assistant'});
}

/* ——— طبقة الواجهة ——— */
function ensureStyles(){ensureStyleAsset('./kosif-assistant.css')}
const Synth=()=>typeof window==='undefined'?null:(window.speechSynthesis??null);
const RecognitionClass=()=>typeof window==='undefined'?null:(window.SpeechRecognition??window.webkitSpeechRecognition??null);
function setState(state){const root=$('#kosifAssistant');if(root)root.dataset.assistantState=state}
function drawLog(){const log=$('#assistantLog');if(!log)return;log.innerHTML=messages.map(m=>`<article class="assistant-msg ${m.role}"><strong>${m.role==='user'?'أنت':'KOSIF'}</strong>${esc(m.text)}${m.cite?`<span class="assistant-cite">المصدر: ${esc(m.cite)}</span>`:''}</article>`).join('');log.scrollTop=log.scrollHeight}
function appendMessage(role,text,cite=''){messages.push({role,text:String(text),cite});messages=messages.slice(-MAX_LOG);drawLog()}
function renderChips(){const chips=$('#assistantChips');if(!chips||chips.dataset.ready)return;chips.dataset.ready='1';chips.innerHTML=ASSISTANT_QUICK_ASKS.map(q=>`<button type="button" data-assistant-ask="${esc(q)}">${esc(q)}</button>`).join('');chips.querySelectorAll('[data-assistant-ask]').forEach(b=>b.addEventListener('click',()=>askAssistant(b.dataset.assistantAsk)))}
function greet(){const snap=assistantSnapshot();appendMessage('assistant',`ملف ${snap.entity||'غير مسمّى'} · المرحلة ${snap.stageLabel} · ${count(snap.documents.count,'مستند','مستندان','مستندات')} · ${count(snap.issues.open,OPEN_ISSUE_LABEL.one,OPEN_ISSUE_LABEL.two,OPEN_ISSUE_LABEL.few)} · جاهزية ${snap.readiness}%. اسألني عن الخطوة التالية، أو اكتب «مساعدة» لمعرفة ما أجيب عنه.`,'engagement · workspaceMetrics')}
function setPanelOpen(open){const panel=$('#assistantPanel'),toggle=$('#assistantToggle');if(!panel||!toggle)return;panel.hidden=!open;toggle.setAttribute('aria-expanded',open?'true':'false');setState('idle');if(open){if(!messages.length)greet();renderChips();queueMicrotask(()=>$('#assistantInput')?.focus())}else{recognition?.stop?.()}}
function syncMic(){const mic=$('#assistantMic');if(mic)mic.setAttribute('aria-pressed',listening?'true':'false')}
function speak(text){const synth=Synth();if(!synth)return;try{synth.cancel();const utterance=new SpeechSynthesisUtterance(String(text));utterance.lang='ar-SA';const voice=(synth.getVoices?.()??[]).find(v=>/^ar/i.test(v.lang??''));if(voice)utterance.voice=voice;utterance.onstart=()=>setState('speaking');utterance.onend=()=>setState('idle');synth.speak(utterance)}catch{setState('idle')}}
function startListening(){const Recognition=RecognitionClass();if(!Recognition){appendMessage('assistant','هذا المتصفح لا يدعم التعرف على الكلام. اكتب سؤالك وسأجيب من حالة الملف.','assistant');return}try{recognition??=new Recognition();recognition.lang='ar-SA';recognition.interimResults=false;recognition.continuous=false;recognition.onstart=()=>{listening=true;syncMic();setState('listening')};recognition.onresult=event=>{const transcript=[...event.results].map(r=>r[0]?.transcript??'').join(' ').trim();if(transcript)askAssistant(transcript)};recognition.onerror=()=>{listening=false;syncMic();setState('idle')};recognition.onend=()=>{listening=false;syncMic();setState(Synth()?.speaking?'speaking':'idle')};recognition.start()}catch{listening=false;syncMic();setState('idle')}}
/** تنفيذ إجراء مقترح من المساعد: كل الإجراءات تُنفَّذ عبر أزرار التطبيق نفسها لا عبر مسار موازٍ. */
export function runAssistantAction(action){if(!action)return false;if(action==='print'){if(typeof window!=='undefined'&&window.print)window.print();return true}const target={convene:'#runCouncilButton',demo:'#demoButton',draft:'#buildDraftButton'}[action];const element=target?$(target):null;if(!element)return false;element.click();return true}
export function askAssistant(text){const query=String(text??'').trim();if(!query)return null;const result=routeAssistantQuery(query,assistantSnapshot());appendMessage('user',query);appendMessage('assistant',result.reply,result.cite);if(result.view)setWorkspaceView(result.view,{scroll:true});runAssistantAction(result.action);if(speakEnabled&&result.intent!=='unknown')speak(result.reply);renderAssistant();return result}
export function renderAssistant(){ensureStyles();const snap=assistantSnapshot();const badge=$('#assistantStateBadge');if(badge)badge.textContent=`${snap.readiness}% · ${count(snap.issues.open,'قضية','قضيتان','قضايا')}`;const root=$('#kosifAssistant');if(root&&!listening&&!Synth()?.speaking)root.dataset.assistantState='idle';return snap}
export function initAssistant(){ensureStyles();const toggle=$('#assistantToggle'),panel=$('#assistantPanel');if(!toggle||!panel)return;toggle.addEventListener('click',()=>setPanelOpen(panel.hidden));$('#assistantClose')?.addEventListener('click',()=>setPanelOpen(false));$('#assistantForm')?.addEventListener('submit',event=>{event.preventDefault();const input=$('#assistantInput');const value=input?.value??'';if(input)input.value='';askAssistant(value)});$('#assistantSpeak')?.addEventListener('click',event=>{speakEnabled=!speakEnabled;event.currentTarget.setAttribute('aria-pressed',speakEnabled?'true':'false');if(!speakEnabled)Synth()?.cancel()});$('#assistantMic')?.addEventListener('click',()=>{listening?recognition?.stop?.():startListening()});document.addEventListener('keydown',event=>{if(event.ctrlKey||event.metaKey||event.altKey)return;const tag=(event.target?.tagName??'').toLowerCase();const typing=['input','textarea','select'].includes(tag)||Boolean(event.target?.isContentEditable);if(event.key==='Escape'&&!panel.hidden){setPanelOpen(false);return}if(typing)return;if(event.key==='v'||event.key==='V'){event.preventDefault();setPanelOpen(panel.hidden)}});renderAssistant()}
export const assistantMessages=()=>messages.slice();
