import { store, derive } from './v5/continuous-store.js';
import { initDocuments, renderDocuments, renderAnalysisMetrics, testGateway } from './v5/continuous-documents.js';
import { initCouncil, renderCouncil, renderRequests } from './v5/continuous-council.js';
import { initReporting, renderNow, renderRecipe, renderCandidates, renderAdjustments, renderTrace, renderReport } from './v5/continuous-reporting.js';
import { initPersistence } from './v5/continuous-persistence.js';

const $=s=>document.querySelector(s); let persistence=null;
function renderAll(options={}){derive();renderNow();renderAnalysisMetrics();renderDocuments();renderRecipe();renderCouncil();renderRequests();renderCandidates();renderAdjustments();renderTrace();if(store.engagement.reports.length)renderReport();if(options.persist!==false)persistence?.schedule()}
initDocuments({renderAll}); initCouncil({renderAll}); initReporting({renderAll}); persistence=initPersistence({renderAll});
$('#reviewDocumentCard').onclick=()=>$('#documentInput').click();
await persistence.hydrate(); renderAll({persist:false}); testGateway();
