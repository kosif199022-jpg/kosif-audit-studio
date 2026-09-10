import { store, derive } from './v5/continuous-store.js';
import { initDocuments, renderDocuments, renderAnalysisMetrics, testGateway } from './v5/continuous-documents.js';
import { initCouncil, renderCouncil, renderRequests } from './v5/continuous-council.js';
import { initReporting, renderNow, renderRecipe, renderCandidates, renderAdjustments, renderTrace, renderReport } from './v5/continuous-reporting.js';

const $=s=>document.querySelector(s);
function renderAll(){derive();renderNow();renderAnalysisMetrics();renderDocuments();renderRecipe();renderCouncil();renderRequests();renderCandidates();renderAdjustments();renderTrace();if(store.engagement.reports.length)renderReport()}
initDocuments({renderAll});initCouncil({renderAll});initReporting({renderAll});
$('#reviewDocumentCard').onclick=()=>$('#documentInput').click();
renderAll();testGateway();
