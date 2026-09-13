import { store, derive } from './v5/continuous-store.js';
import { initDocuments, renderDocuments, renderAnalysisMetrics, testGateway } from './v5/continuous-documents.js';
import { initCouncil, renderCouncil, renderRequests } from './v5/continuous-council.js';
import { initIssues, renderIssues } from './v5/continuous-issues.js';
import { initCoverage, renderCoverage } from './v5/continuous-coverage.js';
import { initStatements, renderStatements } from './v5/continuous-statements.js';
import { initStatementLineage, renderStatementLineage } from './v5/continuous-statement-lineage.js';
import { initReporting, renderNow, renderRecipe, renderCandidates, renderAdjustments, renderTrace, renderReport } from './v5/continuous-reporting.js';
import { initReportIntake, reconcileReportIntake, renderReportIntake } from './v5/continuous-report-intake.js';
import { initCashFlow, renderCashFlow } from './v5/continuous-cash-flow.js';
import { initEquity, renderEquity } from './v5/continuous-equity.js';
import { initDisclosures, renderDisclosures } from './v5/continuous-disclosures.js';
import { initCompletion, renderCompletion } from './v5/continuous-completion.js';
import { initPublication, renderPublication } from './v5/continuous-publication.js';
import { initTraceInspector, renderTraceInspector } from './v5/continuous-trace-inspector.js';
import { initWorkspaceNavigation, renderWorkspaceNavigation } from './v5/continuous-workspace-navigation.js';
import { initDashboardSuite, renderDashboardSuite } from './v5/dashboard-suite.js';
import { ensureV5Styles } from './v5/ui-assets.js';
import { initPersistence } from './v5/continuous-persistence.js';
import { createVoiceAssistant } from './voice.js';

const $=s=>document.querySelector(s);let persistence=null;let voice=null;

function voiceContext(){
  const e=store.engagement||{};
  const risks=Array.isArray(e.issues)?e.issues:[];
  const requests=Array.isArray(e.requests)?e.requests:[];
  const rounds=Array.isArray(e.councilRounds)?e.councilRounds:[];
  const reports=Array.isArray(e.reports)?e.reports:[];
  const latestReport=reports.at(-1);
  const summary={
    engagement:{entity:e.entity,period:e.period,jurisdiction:e.jurisdiction,framework:e.framework,stage:e.stage},
    readiness:document.querySelector('#readinessValue')?.textContent||'0%',
    nextAction:document.querySelector('#nextAction')?.textContent||'',
    materiality:store.materiality||null,
    risks:{total:risks.length,high:risks.filter(r=>['critical','high'].includes(r.severity)&&!['resolved','closed'].includes(r.status)).length,top:risks.slice(0,3).map(r=>r.title||r.id)},
    journal:null,
    statements:null,
    ratios:[],
    opinion:latestReport?{status:latestReport.status}:null,
    council:rounds.at(-1)?{verdict:rounds.at(-1).verdict||rounds.at(-1).status,consensus:rounds.at(-1).consensus||0}:null,
    gates:{failed:requests.filter(r=>!['received','satisfied','closed'].includes(r.status)).map(r=>r.title||r.id)}
  };
  return summary;
}

function ensureVoiceUi(){
  if(document.querySelector('#kosifVoiceFab'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <button class="kosif-voice-fab" id="kosifVoiceFab" type="button" aria-label="فتح المحادثة الصوتية" title="محادثة KOSIF الصوتية"><span aria-hidden="true">◉</span><b>صوت</b></button>
    <aside class="kosif-voice-panel" id="kosifVoicePanel" hidden aria-label="المحادثة الصوتية مع KOSIF">
      <header class="kosif-voice-head">
        <div class="kosif-voice-orb" id="kosifVoiceOrb" data-state="idle" aria-hidden="true"><i></i><i></i><i></i></div>
        <div><strong>KOSIF Live</strong><small id="kosifVoiceState">جاهز للاستماع</small></div>
        <button type="button" class="kosif-voice-close" id="kosifVoiceClose" aria-label="إغلاق">×</button>
      </header>
      <div class="kosif-voice-body">
        <p class="kosif-voice-note">تحدث بالعربية مباشرة، وسيقرأ لك KOSIF حالة الملف وخطوته التالية.</p>
        <div class="kosif-voice-transcript" id="kosifVoiceTranscript"><div class="kosif-voice-hint">جرّب: «ما الخطوة التالية؟» أو «افتح المجلس».</div></div>
        <div class="kosif-voice-interim" id="kosifVoiceInterim" aria-live="polite"></div>
      </div>
      <footer class="kosif-voice-foot">
        <button type="button" class="kosif-voice-toggle" id="kosifVoiceToggle"><span aria-hidden="true">🎙</span><span>ابدأ الاستماع</span></button>
        <div class="kosif-voice-chips" id="kosifVoiceChips"><button type="button" data-say="ما الخطوة التالية؟">الخطوة التالية</button><button type="button" data-say="أعلى المخاطر">أعلى المخاطر</button><button type="button" data-say="ما هي الأهمية النسبية؟">الأهمية</button><button type="button" data-say="افتح المجلس">المجلس</button></div>
      </footer>
    </aside>`);
}

function voiceBubble(role,text){
  const box=document.querySelector('#kosifVoiceTranscript');if(!box||!text)return;
  const item=document.createElement('div');item.className='kosif-voice-bubble '+role;item.textContent=text;box.append(item);box.scrollTop=box.scrollHeight;
}

function setVoiceUiState(state,label){
  const orb=document.querySelector('#kosifVoiceOrb'),status=document.querySelector('#kosifVoiceState'),toggle=document.querySelector('#kosifVoiceToggle');
  if(orb)orb.dataset.state=state;if(status)status.textContent=label;
  if(toggle){toggle.classList.toggle('live',state==='listening');const labelEl=toggle.querySelector('span:last-child');if(labelEl)labelEl.textContent=state==='listening'?'إيقاف الاستماع':(state==='thinking'?'جاري الاستماع…':'ابدأ الاستماع');}
  document.querySelector('#kosifVoiceFab')?.classList.toggle('live',state==='listening');
}

function initVoice(){
  ensureVoiceUi();
  voice=createVoiceAssistant({getContext:voiceContext,onEvent:event=>{
    if(event.type==='listening')setVoiceUiState('listening','أستمع… تكلّم الآن');
    if(event.type==='thinking')setVoiceUiState('thinking','أحلل كلامك…');
    if(event.type==='speaking')setVoiceUiState('speaking','KOSIF يتحدث الآن');
    if(event.type==='idle')setVoiceUiState('idle','جاهز للاستماع');
    if(event.type==='final'){voiceBubble('user',event.text);document.querySelector('#kosifVoiceInterim').textContent='';}
    if(event.type==='interim')document.querySelector('#kosifVoiceInterim').textContent=event.text||'';
    if(event.type==='reply')voiceBubble('assistant',event.reply);
    if(event.type==='stopped')setVoiceUiState('idle','تم إيقاف الاستماع');
    if(event.type==='unsupported')setVoiceUiState('idle','المتصفح لا يدعم الصوت');
    if(event.type==='error'){setVoiceUiState('idle','تعذر تشغيل الصوت');voiceBubble('assistant','تعذر تشغيل المحادثة الصوتية. اسمح بالميكروفون وتأكد من اتصالك.');}
  }});
  const panel=document.querySelector('#kosifVoicePanel');
  const open=()=>{panel.hidden=false};
  const toggle=async()=>{if(voice.isActive()){voice.stop();return}open();try{voice.start()}catch(e){setVoiceUiState('idle','تعذر بدء الميكروفون')}};
  document.querySelector('#kosifVoiceFab').addEventListener('click',()=>{if(panel.hidden)open();else toggle()});
  document.querySelector('#kosifVoiceClose').addEventListener('click',()=>{panel.hidden=true});
  document.querySelector('#kosifVoiceToggle').addEventListener('click',toggle);
  document.querySelector('#kosifVoiceChips').addEventListener('click',event=>{const chip=event.target.closest('[data-say]');if(!chip)return;open();voiceBubble('user',chip.dataset.say);voice.respond(chip.dataset.say)});
  window.addEventListener('pagehide',()=>voice?.stop(),{once:true});
}

ensureV5Styles();
function renderAll(options={}){reconcileReportIntake();derive();renderNow();renderAnalysisMetrics();renderDocuments();renderRecipe();renderReportIntake();renderCouncil();renderRequests();renderIssues();renderCoverage();renderCandidates();renderAdjustments();renderStatements();renderStatementLineage();renderCashFlow();renderEquity();renderDisclosures();renderTrace();if(store.engagement.reports.length)renderReport();renderPublication();renderTraceInspector();renderCompletion();renderWorkspaceNavigation();renderDashboardSuite();if(options.persist!==false)persistence?.schedule()}
initDocuments({renderAll});initCouncil({renderAll});initIssues({renderAll});initCoverage({renderAll});initStatements();initStatementLineage();initReporting({renderAll});initReportIntake({renderAll});initCashFlow({renderAll});initEquity({renderAll});initDisclosures({renderAll});initPublication();initTraceInspector();initCompletion({renderAll});initWorkspaceNavigation();initDashboardSuite({renderAll});persistence=initPersistence({renderAll});
$('#reviewDocumentCard').onclick=()=>$('#documentInput').click();
await persistence.hydrate();renderAll({persist:false});testGateway();initVoice();
