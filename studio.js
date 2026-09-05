import { buildActionPlan, answerAgent, contextStamp, councilStateStamp, transitionTask, updateTaskDetails, draftMemo, TASK_STATUSES } from './agent.js';
import { REFERENCES, referenceStatus, searchReferences, referencesForSeat } from './reference-registry.js';

const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const button = (label, attrs = '', kind = 'secondary') => `<button type="button" class="button ${kind}" ${attrs}>${label}</button>`;
const refLinks = refs => refs.map(r => `<a class="source-pill" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${icon('link')}${esc(r.code)}</a>`).join('');
const priorities = { critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
const dateText = v => v ? new Date(v).toLocaleDateString('ar-SA', { calendar: 'gregory', month: 'short', day: 'numeric' }) : 'بلا موعد';

export function createStudio({ getContext, getState, updateState, actions, recordEvent, notify }) {
 let selectedTask = null;
 let selectedConflict = null;
 let memoSourceStamp = null;
 let taskFilter = 'all';
 let messageSerial = 0;
 const commit = patch => updateState({ ...getState(), ...patch });
 const currentPlan = () => getState().plan;
 const isStale = () => Boolean(currentPlan() && currentPlan().sourceStamp !== contextStamp(getContext()));
 $('#themeButton').insertAdjacentHTML('beforebegin', button(icon('play'), 'id="motionButton" aria-label="تقليل الحركة" title="تقليل الحركة" aria-pressed="false"', 'ghost'));
 function renderMotion() {
  document.documentElement.dataset.motion = getState().quietMotion ? 'quiet' : 'full';
  $('#motionButton').setAttribute('aria-pressed', String(Boolean(getState().quietMotion)));
  $('#motionButton').setAttribute('title', getState().quietMotion ? 'تفعيل الحركة' : 'تقليل الحركة');
 }
 $('#motionButton').addEventListener('click', () => { commit({quietMotion: !getState().quietMotion}); renderMotion(); });
 renderMotion();

 const lead = $('#mainNav .nav-group');
 lead.insertAdjacentHTML('afterend', `<button class="nav-item" data-view="agent">${icon('command')}<span>استوديو الإيجنت</span><span class="nav-badge new-badge">4.0</span></button><button class="nav-item" data-view="workflow">${icon('route')}<span>مساحة العمل</span><span class="nav-badge" id="taskNavCount">0</span></button>`);
 $('#mainNav').insertAdjacentHTML('beforeend', `<span class="nav-group">المعرفة المهنية</span><button class="nav-item" data-view="references">${icon('book')}<span>مرصد المراجع</span><span class="new-indicator"></span></button>`);

 $('#mainContent').insertAdjacentHTML('beforeend', `
 <section class="view" id="view-agent" data-view-panel="agent" aria-labelledby="agentTitle">
  <div class="page-heading studio-heading"><div><span class="eyebrow">KOSIF INTELLIGENCE / 01</span><h1 id="agentTitle">فكّر بعمق. راجع بثقة.</h1><p>من سؤال إلى سند، ومن سند إلى خطوة عمل واضحة.</p></div><span class="mode-badge"><i></i>مساعد محلي · قواعد وبيانات الملف</span></div>
  <div class="agent-layout">
   <article class="agent-conversation panel">
    <div class="agent-welcome"><div class="agent-emblem" aria-hidden="true">${icon('command')}</div><div><span class="eyebrow">شريكك في التفكير</span><h2>بماذا نبدأ اليوم؟</h2><p>أقرأ الملف وأرتب الأولويات وأساعدك على تحدي الفرضيات.</p></div></div>
    <div class="prompt-grid" id="agentPrompts">
     <button data-prompt="جهز خطة العمل حسب الأولويات">${icon('route')}<strong>خطط للخطوة التالية</strong><span>أولويات وإجراءات من الملف</span></button>
     <button data-prompt="ما أعلى المخاطر؟">${icon('alert')}<strong>تحدَّ المخاطر</strong><span>الإشارات التي تستحق انتباهك</span></button>
     <button data-prompt="ما فجوات الأدلة؟">${icon('link')}<strong>اكشف فجوات الأدلة</strong><span>ما الذي ينقص الاستنتاج؟</span></button>
     <button data-prompt="ما الذي يمنع جاهزية الملف؟">${icon('shield')}<strong>راجع جاهزية الإكمال</strong><span>بوابات وإجراءات واضحة</span></button>
    </div>
    <div id="agentMessages" class="agent-messages" role="log" aria-label="محادثة الإيجنت" aria-live="polite"></div>
    <form id="agentForm" class="agent-composer"><label class="sr-only" for="agentInput">اسأل عن ملف المراجعة</label><textarea id="agentInput" rows="2" maxlength="1200" placeholder="اسأل عن ملفك… مثل: ما أول ثلاث خطوات للمراجعة؟" required></textarea><div><span>إجابات من ملفك · دون إرسال خارجي</span><button class="button primary" type="submit">إرسال ${icon('route')}</button></div></form>
   </article>
   <aside class="agent-context"><article class="panel context-card"><span class="eyebrow">سياق العمل</span><h2 id="agentEntity">ملف الارتباط</h2><div id="agentContextStats"></div><div class="source-stamp" id="agentStamp"></div><button type="button" class="text-link" data-go="data">مراجعة بيانات المصدر ${icon('link')}</button></article>
    <article class="panel next-actions-panel"><div class="panel-header"><h2>من الفكرة إلى التنفيذ</h2>${icon('target')}</div><div id="agentNextActions"></div><button class="button primary full-button" type="button" data-studio-action="plan">إنشاء خطة من الملف ${icon('plus')}</button><button class="button ghost full-button" type="button" data-studio-action="memo">صياغة مذكرة مراجعة ${icon('file')}</button></article>
    <div class="agent-boundary">${icon('shield')}<span>يقترح الإيجنت ويشرح. أنت تختبر الأدلة وتتخذ القرار المهني.</span></div>
   </aside>
  </div>
 </section>
 <section class="view" id="view-workflow" data-view-panel="workflow" aria-labelledby="workflowTitle">
  <div class="page-heading studio-heading"><div><span class="eyebrow">ENGAGEMENT WORKSPACE / 02</span><h1 id="workflowTitle">كل خطوة، لها أثر.</h1><p>خطة مرتبطة بالمخاطر، بمسؤول وموعد وسند لكل إجراء.</p></div><div class="heading-actions">${button(`${icon('download')} تصدير الخطة`, 'data-studio-action="export-plan"')}${button(`${icon('plus')} تحديث الخطة`, 'data-studio-action="plan"','primary')}</div></div>
  <div id="workflowStale" class="freshness-banner" hidden></div>
  <div id="workflowStats" class="studio-stats"></div>
  <div class="workflow-toolbar"><div class="segmented" id="taskFilters" role="group" aria-label="تصفية المهام"><button data-task-filter="all" class="active" aria-pressed="true">الكل</button><button data-task-filter="active" aria-pressed="false">قيد التنفيذ</button><button data-task-filter="blocked" aria-pressed="false">بانتظار دليل</button><button data-task-filter="done" aria-pressed="false">مكتمل</button></div><label class="workflow-mode">ترتيب الخطة<select id="planMode"><option value="risk-first">المخاطر أولًا</option><option value="completion">أعمال الإكمال أولًا</option></select></label></div>
  <div id="workflowBoard" class="workflow-board"></div><p id="workflowFootnote" class="workflow-footnote"></p>
 </section>
 <section class="view" id="view-references" data-view-panel="references" aria-labelledby="referencesTitle">
  <div class="page-heading studio-heading"><div><span class="eyebrow">KNOWLEDGE OBSERVATORY / 03</span><h1 id="referencesTitle">مرجع صحيح. في وقته الصحيح.</h1><p>مصادر رسمية وإصدارات وتواريخ سريان، مع فكرة عملية لكل تحديث.</p></div><span class="mode-badge">${icon('book')} روابط تحققت في 5 سبتمبر 2026</span></div>
  <div class="reference-hero"><div><span class="eyebrow">استعد للفترة القادمة</span><h2>الاستعداد يبدأ<br>قبل تاريخ السريان.</h2><p>قابل بداية الفترة بالإصدار الدولي، ثم تحقق من الاعتماد المحلي والتطبيق المبكر.</p></div><div class="reference-date"><label for="referencePeriodStart">بداية الفترة المالية محل المراجعة</label><input type="date" id="referencePeriodStart"><small>تاريخ البداية هو أساس المقارنة، وليس نهاية السنة.</small></div></div>
  <div class="reference-toolbar"><label class="reference-search">${icon('search')}<input id="referenceSearch" type="search" placeholder="ابحث عن معيار، موضوع أو جهة…" aria-label="البحث في المراجع"></label><button class="button secondary" type="button" data-go="standards">مكتبة المعايير التفصيلية ${icon('book')}</button></div>
  <div id="referenceGrid" class="reference-grid"></div>
  <article class="panel methods-panel"><div class="panel-header"><div><span class="eyebrow">طرق عمل أعمق</span><h2>ثلاث عدسات قبل كل استنتاج</h2></div>${icon('target')}</div><div class="method-grid"><div><span>01</span><h3>ابحث عن الدليل المناقض</h3><p>حدد أولًا ما الذي قد يغيّر تفسيرك، ثم صمّم إجراءً لاختباره.</p></div><div><span>02</span><h3>افصل الواقعة عن الفرضية</h3><p>سجّل ما قرأته من المصدر، وما استنتجته، وما يزال مجهولًا.</p></div><div><span>03</span><h3>راجع أثر التغيير</h3><p>عند تغيّر رصيد أو دليل، حدّث الجلسة والمذكرة والخطة المتأثرة.</p></div></div></article>
 </section>`);

 $('#view-dashboard').insertAdjacentHTML('afterbegin', `<div class="dashboard-intro"><div><span class="eyebrow">KOSIF / AUDIT INTELLIGENCE</span><h2>صورة أوضح. قرار أعمق.</h2></div><button class="button secondary" type="button" data-go="agent">${icon('command')} افتح استوديو الإيجنت</button></div>`);
 $('#dashboardMetrics').insertAdjacentHTML('afterend', `<div class="dashboard-studio-grid"><article class="panel dashboard-agent-card"><div class="panel-header"><div class="inline-label"><span class="agent-dot"></span><h2>إحاطة الإيجنت</h2></div><span class="tiny-label">من الملف الحالي</span></div><p id="dashboardBrief"></p><div id="dashboardPriority"></div><button type="button" class="text-link" data-go="agent">افتح مساحة التفكير ${icon('route')}</button></article><article class="panel dashboard-work-card"><div class="panel-header"><h2>قائمة عملك</h2><button class="text-link" data-go="workflow">عرض الكل</button></div><div id="dashboardTasks"></div></article></div>`);
 $('#councilOverview').insertAdjacentHTML('beforebegin', `<div id="councilFreshness" class="freshness-banner" hidden></div><div class="council-lens-bar"><span>وجهات نظر مستقلة. ملف واحد.</span><div>${button('صياغة مذكرة تحدٍّ', 'data-studio-action="memo"','ghost small')}${button('تحويل الأولويات إلى خطة', 'data-studio-action="plan"','secondary small')}</div></div>`);

 document.body.insertAdjacentHTML('beforeend', `
 <nav class="mobile-dock" aria-label="التنقل السريع"><button data-go="dashboard">${icon('grid')}<span>القيادة</span></button><button data-go="workflow">${icon('route')}<span>العمل</span></button><button data-go="agent" class="dock-agent">${icon('command')}<span>الإيجنت</span></button><button data-go="council">${icon('users')}<span>المجلس</span></button><button id="dockMore">${icon('menu')}<span>المزيد</span></button></nav>
 <dialog id="taskDialog" class="modal studio-dialog"><form id="taskForm"><div class="modal-header"><div><span class="eyebrow">إجراء قابل للتتبع</span><h2 id="taskTitle">تفاصيل المهمة</h2></div>${button(icon('x'), 'data-close-dialog="taskDialog" aria-label="إغلاق"','ghost')}</div><div class="modal-body"><p id="taskRationale"></p><ol class="task-steps" id="taskSteps"></ol><div id="taskReferences" class="reference-links"></div><div class="form-grid"><label>المسؤول<input id="taskAssignee" maxlength="120" required></label><label>الموعد<input id="taskDueDate" type="date"></label><label>الحالة<select id="taskStatus">${Object.entries(TASK_STATUSES).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label><label>اسم المراجع الذي يسجل التغيير<input id="taskActor" maxlength="120" required></label><label class="full-width">ملخص الإجراء أو سبب الانتظار<textarea id="taskNote" rows="3" maxlength="2000" placeholder="ماذا فحصت؟ وما سند النتيجة؟"></textarea></label></div><p class="form-help">إكمال هذه المهمة يسجل عملك فقط؛ لا يغلق خطرًا ولا يعتمد تقريرًا.</p><div class="dialog-actions"><button class="button secondary" type="button" id="taskOpenSource">فتح موضع العمل</button><button class="button primary" type="submit">حفظ التحديث</button></div><p id="taskError" role="alert" class="form-error"></p></div></form></dialog>
 <dialog id="memoDialog" class="modal studio-dialog"><div class="modal-header"><div><span class="eyebrow">مسودة قابلة للتحرير</span><h2>مذكرة المراجعة</h2></div>${button(icon('x'), 'data-close-dialog="memoDialog" aria-label="إغلاق"','ghost')}</div><div class="modal-body"><label for="memoText" class="form-help">أكمل إجراءاتك واستنتاجك. الصياغة الأولية لا تمثل إجراءً منفذًا.</label><textarea id="memoText" class="memo-text" rows="18" maxlength="25000"></textarea><div class="dialog-actions">${button('حفظ المسودة في الملف','data-studio-action="save-memo"')}${button(`${icon('download')} تنزيل المذكرة`,'data-studio-action="export-memo"','primary')}</div><div id="memoHistory" class="memo-history"></div></div></dialog>
 <dialog id="conflictDecisionDialog" class="modal studio-dialog"><form id="conflictDecisionForm"><div class="modal-header"><h2>رد المراجع على النزاع</h2>${button(icon('x'), 'data-close-dialog="conflictDecisionDialog" aria-label="إغلاق"','ghost')}</div><div class="modal-body"><p id="conflictQuestion"></p><label class="field-block">اسم المراجع<input id="conflictReviewer" required maxlength="120"></label><label class="field-block">السند والإجراء المطلوب<textarea id="conflictNote" required minlength="5" maxlength="2000" rows="4"></textarea></label><p id="conflictError" class="form-error" role="alert"></p><button type="submit" class="button primary">تسجيل الرد</button></div></form></dialog>`);

 function renderMessages() {
  const c = getContext(); const stamp = contextStamp(c); const councilStamp = councilStateStamp(c.council);
  $('#agentMessages').innerHTML = (getState().messages ?? []).slice(-24).map(m => `<article class="message ${m.role === 'user' ? 'user-message' : 'assistant-message'}"><div class="message-label">${m.role === 'user' ? 'أنت' : 'KOSIF · مساعد الملف'}</div><p>${esc(m.text)}</p>${m.role === 'assistant' ? `<div class="reference-links">${refLinks((m.referenceIds??[]).map(id=>REFERENCES.find(r=>r.id===id)).filter(Boolean))}</div><div class="message-actions">${(m.actions??[]).map(a=>button(esc(a.label), a.view?`data-go="${esc(a.view)}"`:`data-studio-action="${esc(a.action)}"`,'ghost small')).join('')}</div><small class="source-stamp">${esc(m.sourceStamp)} · ${m.sourceStamp === stamp && (!m.councilStamp || m.councilStamp === councilStamp) ? 'يعكس البيانات الحالية' : 'إجابة سابقة؛ تغير سياق الملف'}</small>` : ''}</article>`).join('');
 }
 function ask(query) {
  if (!query.trim()) return;
  const reply = answerAgent(query, getContext());
  const stamp = Date.now();
  const messages = [...(getState().messages ?? []), { id: `${stamp}-${messageSerial++}`, role: 'user', text: query.trim().slice(0,1200) }, { id: `${stamp}-${messageSerial++}`, role: 'assistant', text: reply.text, referenceIds: reply.references.map(r=>r.id), actions: reply.actions, sourceStamp: reply.sourceStamp, councilStamp: reply.councilStamp }].slice(-24);
  commit({ messages }); renderMessages(); $('#agentInput').value = '';
  $('#agentMessages').scrollTop = $('#agentMessages').scrollHeight;
 }
 function createPlan() {
  const before = currentPlan();
  const plan = buildActionPlan(getContext(), { mode: $('#planMode').value });
  if (before) {
   const sameSource = before.sourceStamp === plan.sourceStamp;
   plan.tasks = plan.tasks.map(t => {
    const old = before.tasks.find(x=>x.id===t.id);
    return old ? { ...t, assignee: old.assignee, dueDate: old.dueDate, ...(sameSource ? { status: old.status, note: old.note, history: old.history } : {}) } : t;
   });
  }
  commit({ plan, planHistory: before ? [before, ...(getState().planHistory??[])].slice(0,5) : getState().planHistory??[] });
  recordEvent('AGENT_PLAN_CREATED', { planId: plan.id, sourceStamp: plan.sourceStamp, tasks: plan.tasks.length });
  actions.save(); render(); actions.openView('workflow'); notify('أُنشئت خطة مرتبطة بالملف. افتح أي مهمة لتحديد المسؤول والموعد.');
 }
 function openTask(id) {
  selectedTask = currentPlan()?.tasks.find(t=>t.id===id);
  if (!selectedTask) return;
  $('#taskTitle').textContent = selectedTask.title; $('#taskRationale').textContent = selectedTask.why;
  $('#taskSteps').innerHTML = selectedTask.steps.map(s=>`<li>${esc(s)}</li>`).join('');
  $('#taskReferences').innerHTML = refLinks(selectedTask.referenceIds.map(id=>REFERENCES.find(r=>r.id===id)).filter(Boolean));
  $('#taskAssignee').value = selectedTask.assignee; $('#taskDueDate').value = selectedTask.dueDate;
  $('#taskStatus').value = selectedTask.status; $('#taskActor').value = getContext().engagement?.reviewer??''; $('#taskNote').value = selectedTask.note;
  $('#taskError').textContent = isStale() ? 'تغيرت بيانات الملف؛ حدّث الخطة قبل تسجيل إجراء جديد.' : '';
  $('#taskForm button[type="submit"]').disabled = isStale(); $('#taskDialog').showModal();
 }
 const taskRow = (t, compact = false) => `<button class="task-row ${compact?'compact-task':''}" type="button" data-task-id="${esc(t.id)}"><span class="task-state" data-state="${esc(t.status)}">${icon(t.status==='done'?'check':t.status==='blocked'?'inbox':'file')}</span><span class="task-main"><strong>${esc(t.title)}</strong><small>${esc(compact ? TASK_STATUSES[t.status] : t.why)}</small></span>${compact ? '' : `<span class="severity-chip ${esc(t.priority)}">${esc(priorities[t.priority]??'متوسطة')}</span><span class="task-owner"><i>${esc((t.assignee||'؟').slice(0,1))}</i>${esc(t.assignee||'بلا مسؤول')}</span><span class="task-date ${t.dueDate && t.dueDate<new Date().toISOString().slice(0,10) && t.status!=='done'?'overdue':''}">${esc(dateText(t.dueDate))}</span>`}<span class="task-arrow">←</span></button>`;
 function renderWorkflow() {
  const plan = currentPlan(); const tasks = plan?.tasks ?? []; const stale = isStale();
  $('#workflowStale').hidden = !stale;
  $('#workflowStale').innerHTML = `${icon('alert')}<span>تغير مصدر الملف. الخطة السابقة محفوظة؛ حدّث الخطة قبل تسجيل إجراءات جديدة.</span>${button('تحديث الآن','data-studio-action="plan"','secondary small')}`;
  $('#workflowStats').innerHTML = [['كل الإجراءات', tasks.length],['قيد التنفيذ',tasks.filter(t=>t.status==='active').length],['بانتظار دليل',tasks.filter(t=>t.status==='blocked').length],['أُنجزت',tasks.filter(t=>t.status==='done').length]].map(([label,value],i)=>`<article><span>${label}</span><strong>${value.toLocaleString('ar-SA')}</strong><i class="stat-accent accent-${i}"></i></article>`).join('');
  const visible = tasks.filter(t=>taskFilter==='all'||t.status===taskFilter);
  $('#workflowBoard').innerHTML = !tasks.length ? `<div class="studio-empty">${icon('route')}<h2>امنح المراجعة مسارًا واضحًا</h2><p>أنشئ خطة من الملف، ثم حدد المسؤول والموعد لكل إجراء.</p>${button('إنشاء خطة العمل','data-studio-action="plan"','primary')}</div>` : visible.length ? `<div class="task-table-heading"><span>الإجراء وسنده</span><span>الأولوية</span><span>المسؤول</span><span>الموعد</span></div>${visible.map(t=>taskRow(t)).join('')}` : '<div class="studio-empty"><h2>لا مهام بهذه الحالة</h2><p>اختر «الكل» للاطلاع على بقية الخطة.</p></div>';
  $('#workflowFootnote').textContent = plan ? `${plan.authority} · ${plan.sourceStamp}${plan.omittedRisks ? ` · أعلى 12 خطرًا معروضًا؛ ${plan.omittedRisks} إضافيًا في سجل المخاطر.` : ''}` : '';
  $('#taskNavCount').textContent = tasks.filter(t=>t.status!=='done').length;
  $('#dashboardTasks').innerHTML = tasks.length ? tasks.filter(t=>t.status!=='done').slice(0,3).map(t=>taskRow(t,true)).join('') || '<p class="muted">اكتملت مهام الخطة. راجع بوابات الملف والخطوة التالية.</p>' : `<p class="muted">حوّل أولويات المراجعة إلى خطوات يمكن متابعتها.</p>${button('إنشاء أول خطة','data-studio-action="plan"','secondary small')}`;
 }
 function renderReferences() {
  const period = $('#referencePeriodStart').value;
  const saved = new Set(getState().savedReferences ?? []);
  const refs = searchReferences($('#referenceSearch').value);
  $('#referenceGrid').innerHTML = refs.length ? refs.map((r,i)=>{ const status = referenceStatus(r,period); return `<article class="reference-card" style="--card-order:${i}"><header><span class="reference-code">${esc(r.code)}</span><button class="bookmark-button ${saved.has(r.id)?'saved':''}" data-save-reference="${r.id}" aria-pressed="${saved.has(r.id)}" aria-label="${saved.has(r.id)?'إلغاء حفظ':'حفظ'} ${esc(r.code)}">${icon(saved.has(r.id)?'check':'plus')}</button></header><span class="tiny-label">${esc(r.publisher)}</span><h2>${esc(r.title)}</h2><p>${esc(r.summary)}</p><div class="reference-timing" data-timing="${status.code}"><i></i><span>${esc(status.label)}</span></div><dl><div><dt>الإصدار</dt><dd>${esc(r.edition)}</dd></div><div><dt>بداية السريان الدولي</dt><dd dir="ltr">${r.effectiveFrom??'راجع النص المحلي'}</dd></div></dl><div class="reference-action"><span>فكرة للعمل</span><p>${esc(r.action)}</p></div><footer><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">فتح المصدر الرسمي ${icon('link')}</a><span>تحقق ${r.verifiedAt}</span></footer></article>`; }).join('') : '<div class="studio-empty"><h2>لم نجد مرجعًا مطابقًا</h2><p>جرّب ISA أو الاستمرارية أو افتح المكتبة التفصيلية.</p></div>';
 }
 function renderCouncilSources() {
  const c = getContext(); const latest = c.council; const stale = latest && latest.sourceStamp !== contextStamp(c);
  $('#councilFreshness').hidden = !latest;
  $('#councilFreshness').classList.toggle('fresh',Boolean(latest&&!stale));
  $('#councilFreshness').innerHTML = latest ? `${icon(stale?'alert':'check')}<span>${stale?'تغيرت بيانات الملف أو أن الجلسة قديمة بلا بصمة. أعد عقد المجلس للحصول على مواقف حالية.':'الجلسة مرتبطة ببيانات الملف الحالية.'}</span><small dir="ltr">${esc(latest.sourceStamp??'جلسة سابقة')}</small>` : '';
  document.querySelectorAll('#councilGrid .council-seat').forEach((node,index)=>{
   node.querySelector('.reviewer-sources')?.remove();
   const p = latest?.positions?.[index]; if(!p)return;
   node.style.setProperty('--card-order',index);
   node.insertAdjacentHTML('beforeend',`<div class="reviewer-sources"><span>مراجع التخصص · تحقق من الإصدار</span><div class="reference-links">${refLinks(referencesForSeat(p.seatId))}</div></div>`);
  });
 }
 function render() {
  const c = getContext(); const plan = buildActionPlan(c);
  const high = (c.risks??[]).filter(r=>r.status==='open'&&['high','critical'].includes(r.severity)).length;
  $('#agentEntity').textContent = c.engagement?.entity??'ملف الارتباط';
  $('#agentContextStats').innerHTML = [['حسابات المصدر',c.analysis?.rows?.length??0],['مخاطر عالية مفتوحة',high],['أدلة مسجلة',c.evidence?.length??0]].map(([label,n])=>`<div class="context-stat"><span>${label}</span><strong>${n.toLocaleString('ar-SA')}</strong></div>`).join('');
  $('#agentStamp').textContent = `حالة المصدر ${contextStamp(c)}`;
  $('#agentNextActions').innerHTML = plan.tasks.slice(0,3).map((t,i)=>`<button class="next-action" type="button" data-go="${esc(t.view)}"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${esc(t.title)}</strong><small>${esc(t.why)}</small></div>${icon('route')}</button>`).join('');
  $('#dashboardBrief').textContent = c.analysis ? `${high.toLocaleString('ar-SA')} مخاطر عالية أو حرجة تحتاج استجابة. ابدأ بما يغير جودة الملف فعلًا.` : 'كل مراجعة جيدة تبدأ بسؤال صحيح ومصدر واضح. استورد ميزانك أو استكشف البيانات التجريبية.';
  $('#dashboardPriority').innerHTML = plan.tasks.slice(0,2).map((t,i)=>`<button class="brief-priority" type="button" data-go="${esc(t.view)}"><span>0${i+1}</span><strong>${esc(t.title)}</strong>${icon('route')}</button>`).join('');
  renderMessages(); renderWorkflow(); renderReferences(); renderCouncilSources();
 }
 function openMemo() {
  memoSourceStamp = contextStamp(getContext());
  $('#memoText').value = draftMemo(getContext());
  renderMemoHistory();
  $('#memoDialog').showModal();
 }
 function renderMemoHistory() {
  $('#memoHistory').innerHTML = `<span>${getState().memos?.length??0} مسودات محفوظة · افتح مسودة لاستكمالها</span><div>${(getState().memos??[]).slice(0,5).map(m=>button(esc(dateText(m.createdAt)), `data-open-memo="${esc(m.id)}"`, 'ghost small')).join('')}</div>`;
 }
 function onView(view) {
  document.querySelectorAll('.mobile-dock [data-go]').forEach(b=>{const active=b.dataset.go===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if (['agent','workflow','references','council'].includes(view)) render();
 }
 function openConflict(id, decision) {
  const c = getContext();
  if (!c.council || c.council.sourceStamp!==contextStamp(c)) { notify('أعد عقد المجلس من البيانات الحالية قبل حسم النزاع.','error'); return; }
  const conflict = c.council.conflicts.find(x=>x.id===id); if(!conflict)return;
  selectedConflict = { id, decision, sessionId:c.council.id, stamp:c.council.sourceStamp };
  $('#conflictQuestion').textContent = `${decision==='uphold'?'تأييد الاعتراض':'تجاوز الاعتراض بمبرر'} — ${conflict.reason}`;
  $('#conflictReviewer').value=c.engagement?.reviewer??''; $('#conflictNote').value=''; $('#conflictError').textContent=''; $('#conflictDecisionDialog').showModal();
 }
 $('#agentForm').addEventListener('submit',event=>{event.preventDefault();ask($('#agentInput').value);});
 $('#agentInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();$('#agentForm').requestSubmit();}});
 document.addEventListener('click',event=>{
  const memo = event.target.closest('[data-open-memo]'); if (memo) { const savedMemo = (getState().memos??[]).find(m=>m.id===memo.dataset.openMemo); if(savedMemo){$('#memoText').value=savedMemo.text;memoSourceStamp=savedMemo.sourceStamp;} }
  const prompt = event.target.closest('[data-prompt]'); if(prompt)ask(prompt.dataset.prompt);
  const task = event.target.closest('[data-task-id]'); if(task)openTask(task.dataset.taskId);
  const filter = event.target.closest('[data-task-filter]'); if(filter){taskFilter=filter.dataset.taskFilter;document.querySelectorAll('[data-task-filter]').forEach(b=>{b.classList.toggle('active',b===filter);b.setAttribute('aria-pressed',String(b===filter));});renderWorkflow();}
  const saved = event.target.closest('[data-save-reference]'); if(saved){const ids=new Set(getState().savedReferences??[]);ids.has(saved.dataset.saveReference)?ids.delete(saved.dataset.saveReference):ids.add(saved.dataset.saveReference);commit({savedReferences:[...ids]});renderReferences();}
  const action = event.target.closest('[data-studio-action]')?.dataset.studioAction;
  if(action==='plan')createPlan();
  if(action==='memo')openMemo();
  if(action==='export-plan'){if(!currentPlan()){notify('أنشئ خطة أولًا.','error');return;}actions.download(JSON.stringify(currentPlan(),null,2),'kosif-action-plan.json','application/json;charset=utf-8');}
  if(action==='save-memo'){const text=$('#memoText').value.trim();if(!text)return;const stale=memoSourceStamp!==contextStamp(getContext());commit({memos:[{id:`M-${Date.now()}`,createdAt:new Date().toISOString(),sourceStamp:memoSourceStamp,staleAtSave:stale,text},...(getState().memos??[])].slice(0,20)});recordEvent('AGENT_MEMO_SAVED',{sourceStamp:memoSourceStamp,staleAtSave:stale});actions.save();notify(stale?'حُفظت المسودة مع بصمة مصدرها السابق؛ راجع أثر البيانات الجديدة.':'حُفظت المسودة في ملف الارتباط.');renderMemoHistory();}
  if(action==='export-memo')actions.download($('#memoText').value,'kosif-review-memo.md','text/markdown;charset=utf-8');
 });
 $('#taskForm').addEventListener('submit',event=>{
  event.preventDefault(); try {
   if(isStale())throw new Error('حدّث الخطة بعد تغيّر بيانات الملف.');
   let task = updateTaskDetails(selectedTask,{assignee:$('#taskAssignee').value,dueDate:$('#taskDueDate').value});
   task = transitionTask(task,$('#taskStatus').value,{actor:$('#taskActor').value,note:$('#taskNote').value});
   const plan=currentPlan();commit({plan:{...plan,tasks:plan.tasks.map(t=>t.id===task.id?task:t)}});
   recordEvent('AGENT_TASK_UPDATED',{taskId:task.id,status:task.status,reviewer:$('#taskActor').value});actions.save();$('#taskDialog').close();render();notify('سُجل تحديث المهمة وسنده.');
  }catch(error){$('#taskError').textContent=error.message;}
 });
 $('#taskOpenSource').addEventListener('click',()=>{if(selectedTask){$('#taskDialog').close();selectedTask.riskId?actions.openRisk(selectedTask.riskId):actions.openView(selectedTask.view);}});
 $('#referenceSearch').addEventListener('input',renderReferences);
 $('#referencePeriodStart').value=getState().periodStart??'2026-01-01';
 $('#referencePeriodStart').addEventListener('change',()=>{commit({periodStart:$('#referencePeriodStart').value});renderReferences();});
 $('#planMode').value=getState().plan?.mode??'risk-first';
 $('#dockMore').addEventListener('click',actions.toggleSidebar);
 $('#conflictDecisionForm').addEventListener('submit',event=>{
  event.preventDefault();try{
   const c=getContext();if(c.council?.id!==selectedConflict?.sessionId || selectedConflict?.stamp!==contextStamp(c))throw new Error('تغيرت الجلسة أو البيانات؛ أعد فتح النزاع.');
   actions.resolveConflict(selectedConflict.id,{reviewer:$('#conflictReviewer').value.trim(),decision:selectedConflict.decision,note:$('#conflictNote').value.trim()});$('#conflictDecisionDialog').close();renderCouncilSources();
  }catch(error){$('#conflictError').textContent=error.message;}
 });
 return { render, onView, openConflict };
}
