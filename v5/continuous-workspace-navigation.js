import { store, esc } from './continuous-store.js';
import { WORKSPACE_VIEWS, workspaceMetrics, badgeForWorkspace, workspaceViewFromHash, normalizeWorkspaceView } from './workspace-layout.js';

const $=s=>document.querySelector(s);let activeView='overview';
const SELECTORS={
  overview:['.hero','.now-panel','.journey','#workspaceOverviewStrip'],
  documents:['#intakePanel','.request-panel'],
  issues:['#issueWorkspace'],
  council:['.council-panel'],
  financials:['.adjustment-panel','#statementWorkspace','#cashFlowWorkspace','#equityWorkspace','#disclosureWorkspace'],
  report:['#recipePanel','.trace-panel','#completionRoom','.report-panel']
};
function ensureUi(){
  if(!$('#workspaceNavigation')){
    document.querySelector('.topbar')?.insertAdjacentHTML('afterend',`<nav id="workspaceNavigation" class="workspace-navigation" aria-label="مساحات ملف المراجعة"><div class="workspace-nav-inner">${WORKSPACE_VIEWS.map((v,i)=>`<button type="button" data-workspace-view="${v.id}" title="${esc(v.label)}"><span class="workspace-nav-index">0${i+1}</span><strong>${esc(v.shortLabel)}</strong><em data-workspace-badge="${v.id}" hidden></em></button>`).join('')}</div></nav>`);
  }
  if(!$('#workspaceContext')){
    document.querySelector('.top-actions')?.insertAdjacentHTML('afterbegin','<div id="workspaceContext" class="workspace-context"><strong id="workspaceContextEntity"></strong><small id="workspaceContextPeriod"></small></div>');
  }
  if(!$('#workspaceOverviewStrip')){
    document.querySelector('.journey')?.insertAdjacentHTML('afterend','<section id="workspaceOverviewStrip" class="workspace-overview-strip" aria-label="ملخص الملف"></section>');
  }
}
function allManagedElements(){return [...new Set(Object.values(SELECTORS).flatMap(list=>list.flatMap(sel=>[...document.querySelectorAll(sel)])))]}
function setManagedVisibility(view){for(const el of allManagedElements())el.classList.add('workspace-nav-hidden');for(const sel of SELECTORS[view]||[])for(const el of document.querySelectorAll(sel))el.classList.remove('workspace-nav-hidden');for(const grid of document.querySelectorAll('.workspace-grid')){const visible=[...grid.children].filter(el=>!el.classList.contains('workspace-nav-hidden')&&!el.hidden);grid.classList.toggle('workspace-nav-hidden',visible.length===0);grid.classList.toggle('workspace-focus-single',visible.length===1)}}
function updateHash(view){const target=`#${view}`;if(location.hash!==target)history.replaceState(null,'',target)}
export function setWorkspaceView(view,{syncHash=true,scroll=false}={}){activeView=normalizeWorkspaceView(view);document.body.dataset.workspaceView=activeView;setManagedVisibility(activeView);document.querySelectorAll('[data-workspace-view]').forEach(b=>{const selected=b.dataset.workspaceView===activeView;b.classList.toggle('active',selected);b.setAttribute('aria-current',selected?'page':'false')});if(syncHash)updateHash(activeView);if(scroll)document.querySelector('.workspace-navigation')?.scrollIntoView({behavior:'smooth',block:'start'});return activeView}
function renderOverview(metrics){const el=$('#workspaceOverviewStrip');if(!el)return;const reportLabel=metrics.latestReportStatus==='issued'?'صادر':metrics.reports?metrics.latestReportStatus||'مسودة':'لا يوجد';el.innerHTML=`<div><span>المستندات</span><strong>${metrics.documents}</strong><small>${metrics.evidence} دليل / Claim</small></div><div class="${metrics.openRequests?'attention':''}"><span>طلبات مفتوحة</span><strong>${metrics.openRequests}</strong><small>تحتاج متابعة</small></div><div class="${metrics.highIssues?'critical':''}"><span>قضايا عالية</span><strong>${metrics.highIssues}</strong><small>${metrics.openIssues} قضية مفتوحة</small></div><div><span>المجلس</span><strong>${metrics.latestRound?`R${metrics.latestRound}`:'—'}</strong><small>${metrics.councilRounds} جولات</small></div><div><span>التقرير</span><strong>${esc(reportLabel)}</strong><small>${metrics.reports} نسخ</small></div>`}
export function renderWorkspaceNavigation(){ensureUi();const metrics=workspaceMetrics(store.engagement);document.body.classList.toggle('engagement-started',metrics.documents>0||metrics.councilRounds>0||metrics.openIssues>0);$('#workspaceContextEntity').textContent=store.engagement.entity||'ارتباط KOSIF';$('#workspaceContextPeriod').textContent=[store.engagement.period,store.engagement.framework].filter(Boolean).join(' · ');for(const v of WORKSPACE_VIEWS){const badge=document.querySelector(`[data-workspace-badge="${v.id}"]`),value=badgeForWorkspace(v.id,metrics);if(!badge)continue;badge.hidden=value===null||value===0||value==='0';badge.textContent=value??''}renderOverview(metrics);setWorkspaceView(activeView,{syncHash:false})}
export function initWorkspaceNavigation(){ensureUi();activeView=workspaceViewFromHash(location.hash);document.querySelectorAll('[data-workspace-view]').forEach(b=>b.addEventListener('click',()=>setWorkspaceView(b.dataset.workspaceView,{scroll:true})));window.addEventListener('hashchange',()=>setWorkspaceView(workspaceViewFromHash(location.hash),{syncHash:false}));$('#reviewDocumentCard')?.addEventListener('click',()=>setWorkspaceView('documents',{scroll:true}));$('#buildReportCard')?.addEventListener('click',()=>setWorkspaceView('report',{scroll:true}));document.addEventListener('keydown',event=>{if(!event.altKey||event.ctrlKey||event.metaKey)return;const index=Number(event.key)-1;if(index<0||index>=WORKSPACE_VIEWS.length)return;event.preventDefault();setWorkspaceView(WORKSPACE_VIEWS[index].id,{scroll:true})});setWorkspaceView(activeView,{syncHash:false})}
export function currentWorkspaceView(){return activeView}
