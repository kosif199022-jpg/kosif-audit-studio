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
  documentAnalyses: new Map()
};
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = v => formatMoneyMinor(v ?? 0n, store.engagement.currency || 'SAR');
export const nextDocId = () => `DOC-${String(store.engagement.documents.length + 1).padStart(4,'0')}`;
export const analyses = () => [...store.documentAnalyses.values()];
export const categories = () => store.analysis ? [...new Set(store.analysis.rows.map(r => r.category))] : [];
export const docTypes = () => [...new Set(store.engagement.documents.map(d => d.type))];
export function derive(){ store.engagement.stage = deriveEngagementStage(store.engagement); return store.engagement.stage; }
export function satisfiedRequirementIds(){
  const map={'trial-balance':['TB'],'chart-of-accounts':['COA'],'bank-statement':['BANK'],aging:['AR'],inventory:['INV','INVLIST'],lease:['LEASE'],'financial-statements':['FS','PYFS'],'general-ledger':['GL'],journal:['GL'],controls:['CONTROL']}, out=new Set;
  for(const type of docTypes()) for(const id of map[type] || []) out.add(id);
  return [...out];
}
export function resetEngagement(engagement){
  store.engagement=engagement; store.analysis=null; store.materiality=null; store.tbRisks=[]; store.documentAnalyses.clear(); store.activeRequestId=null; store.recipePlan=buildReportPlan('ميزانية');
}
