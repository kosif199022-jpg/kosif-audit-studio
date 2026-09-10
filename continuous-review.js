import { store, derive } from './v5/continuous-store.js';
import { initDocuments, renderDocuments, renderAnalysisMetrics, testGateway } from './v5/continuous-documents.js';
import { initCouncil, renderCouncil, renderRequests } from './v5/continuous-council.js';
import { initIssues, renderIssues } from './v5/continuous-issues.js';
import { initCoverage, renderCoverage } from './v5/continuous-coverage.js';
import { initReporting, renderNow, renderRecipe, renderCandidates, renderAdjustments, renderTrace, renderReport } from './v5/continuous-reporting.js';
import { initCompletion, renderCompletion } from './v5/continuous-completion.js';
import { initPersistence } from './v5/continuous-persistence.js';

const $=s=>document.querySelector(s);let persistence=null;
for(const href of ['./freshness-specialists.css','./issue-workspace.css','./council-insights.css'])if(!document.querySelector(`link[href="${href}"]`)){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link)}
function renderAll(options={}){derive();renderNow();renderAnalysisMetrics();renderDocuments();renderRecipe();renderCouncil();renderRequests();renderIssues();renderCoverage();renderCandidates();renderAdjustments();renderTrace();if(store.engagement.reports.length)renderReport();renderCompletion();if(options.persist!==false)persistence?.schedule()}
initDocuments({renderAll});initCouncil({renderAll});initIssues({renderAll});initCoverage({renderAll});initReporting({renderAll});initCompletion({renderAll});persistence=initPersistence({renderAll});
$('#reviewDocumentCard').onclick=()=>$('#documentInput').click();
await persistence.hydrate();renderAll({persist:false});testGateway();
