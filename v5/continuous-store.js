import { createEngagement, deriveEngagementStage } from './engagement-machine.js';
import { buildReportPlan } from './report-recipes.js';
import { formatMoneyMinor } from '../engine.js';

export const DEFAULT_GATEWAY = 'https://kosif-audit-realtime.kosif199022.workers.dev';
export const GATEWAY_KEY = 'kosif:v5:document-gateway';
export const store = {
  engagement: createEngagement({ id:'ENG-V5-DEMO', entity:'ارتباط KOSIF V5', period:'2026-12-31', jurisdiction:'SA', framework:'IFRS', engagementType:'audit', currency:'SAR' }),
  analysis: null,
  materiality: null,
  tbRisks: [],
  recipePlan: buildReportPlan('ميزانية'),
  activeRequestId: null,
  documentAnalyses: new Map(),
  sessionFiles: new Map(),
  selectedDocumentId: null,
  remote: { mode:'local', status:'محلي', version:0, engagementId:null, accessToken:null }
};
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = v => formatMoneyMinor(v ?? 0n, store.engagement.currency || 'SAR');
export const nextDocId = () => `DOC-${String(store.engagement.documents.length + 1).padStart(4,'0')}`;
export const analyses = () => [...store.documentAnalyses.values()];
export const categories = () => store.analysis ? [...new Set(store.analysis.rows.map(r => r.category))] : [];
export const docTypes = () => [...new Set(store.engagement.documents.map(d => d.type))];
export function derive(){ store.engagement.stage = deriveEngagementStage(store.engagement); return store.engagement.stage; }
export function satisfiedRequirementIds(){
  const map={'trial-balance':['TB'],'chart-of-accounts':['COA'],'bank-statement':['BANK'],aging:['AR'],inventory:['INV','INVLIST'],lease:['LEASE'],'financial-statements':['FS','PYFS'],'general-ledger':['GL'],journal:['GL'],'controls-document':['CONTROL'],'fixed-assets-register':['PPE'],'loan-document':['DEBT'],'tax-document':['TAX'],'inventory-count':['COUNT'],'purchase-support':['COST'],'cash-flow-support':['CFS'],'equity-movement-support':['EQS']}, out=new Set;
  for(const type of docTypes()) for(const id of map[type] || []) out.add(id);
  for(const request of store.engagement.requests||[])if(request.origin==='report-recipe'&&['received','partial','satisfied'].includes(request.status)&&request.requirementId)out.add(request.requirementId);
  return [...out];
}
export function clearSessionFiles(){store.sessionFiles.clear();store.selectedDocumentId=null}
export function resetEngagement(engagement){
  store.engagement=engagement; store.analysis=null; store.materiality=null; store.tbRisks=[]; store.documentAnalyses.clear(); store.activeRequestId=null; store.recipePlan=buildReportPlan('ميزانية'); clearSessionFiles();
}
export function resetWorkspace(snapshot={}){
  if(snapshot.engagement)store.engagement=snapshot.engagement;
  store.analysis=snapshot.analysis||null; store.materiality=snapshot.materiality||null; store.tbRisks=snapshot.tbRisks||[];
  store.documentAnalyses=new Map(snapshot.documentAnalyses||[]); store.activeRequestId=null; store.selectedDocumentId=null; store.sessionFiles.clear();
  store.recipePlan=buildReportPlan(snapshot.recipeId||'statement-of-financial-position');
  derive();
}
