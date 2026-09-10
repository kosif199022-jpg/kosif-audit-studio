import { store, derive } from './v5/continuous-store.js';
import { initDocuments, renderDocuments, renderAnalysisMetrics, testGateway } from './v5/continuous-documents.js';
import { initCouncil, renderCouncil, renderRequests } from './v5/continuous-council.js';
import { initIssues, renderIssues } from './v5/continuous-issues.js';
import { initCoverage, renderCoverage } from './v5/continuous-coverage.js';
import { initStatements, renderStatements } from './v5/continuous-statements.js';
import { initReporting, renderNow, renderRecipe, renderCandidates, renderAdjustments, renderTrace, renderReport } from './v5/continuous-reporting.js';
import { initReportIntake, reconcileReportIntake, renderReportIntake } from './v5/continuous-report-intake.js';
import { initCashFlow, renderCashFlow } from './v5/continuous-cash-flow.js';
import { initEquity, renderEquity } from './v5/continuous-equity.js';
import { initDisclosures, renderDisclosures } from './v5/continuous-disclosures.js';
import { initCompletion, renderCompletion } from './v5/continuous-completion.js';
import { initPersistence } from './v5/continuous-persistence.js';

const $=s=>document.querySelector(s);let persistence=null;
for(const href of ['./freshness-specialists.css','./issue-workspace.css','./council-insights.css','./statement-comparison.css','./report-intake.css','./cash-flow-workspace.css','./equity-workspace.css','./disclosure-workspace.css'])if(!document.querySelector(`link[href="${href}"]`)){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link)}
function renderAll(options={}){reconcileReportIntake();derive();renderNow();renderAnalysisMetrics();renderDocuments();renderRecipe();renderReportIntake();renderCouncil();renderRequests();renderIssues();renderCoverage();renderCandidates();renderAdjustments();renderStatements();renderCashFlow();renderEquity();renderDisclosures();renderTrace();if(store.engagement.reports.length)renderReport();renderCompletion();if(options.persist!==false)persistence?.schedule()}
initDocuments({renderAll});initCouncil({renderAll});initIssues({renderAll});initCoverage({renderAll});initStatements();initReporting({renderAll});initReportIntake({renderAll});initCashFlow({renderAll});initEquity({renderAll});initDisclosures({renderAll});initCompletion({renderAll});persistence=initPersistence({renderAll});
$('#reviewDocumentCard').onclick=()=>$('#documentInput').click();
await persistence.hydrate();renderAll({persist:false});testGateway();
