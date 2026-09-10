/** KOSIF V5 — report recipe requirements -> governed intake requests. */
import { refreshEvidenceRequests } from './evidence-requests.js';
const OPEN=new Set(['draft','requested','received','under-review','partial']);
const NAME_HINTS={
  PPE:/fixed|asset|ppe|اصول(?:\s+ال)?ثابت|أصول(?:\s+ال)?ثابت|اهلاك|إهلاك/i,
  DEBT:/loan|borrow|finance|قرض|تمويل|تسهيل/i,
  TAX:/tax|vat|zakat|ضريب|زكا/i,
  CONTROL:/control|process|policy|procedure|رقاب|عمليه|عملية|سياس|اجراء|إجراء/i,
  COUNT:/count|inventory count|جرد/i,
  COST:/purchase|invoice|cost|مشتريات|فاتور|تكلف/i,
  BANK:/bank|بنك/i,
  AR:/aging|receivable|اعمار|أعمار|عملاء/i,
  INV:/inventory|stock|مخزون/i,
  LEASE:/lease|rent|ايجار|إيجار/i,
  CFS:/cash\s*flow|cashflow|cash movement|تدفقات(?:\s+ال)?نقد|حركات(?:\s+ال)?نقد|حركه(?:\s+ال)?نقد|حركة(?:\s+ال)?نقد/i
};
function nextId(requests=[]){const max=requests.reduce((n,r)=>{const m=String(r.id??'').match(/^REQ-(\d+)$/);return m?Math.max(n,Number(m[1])):n},0);return`REQ-${String(max+1).padStart(4,'0')}`}
function requirementKey(recipeId,requirementId){return`${recipeId}:${requirementId}`}
function receiptEvidenceId(documentId,requestId){return`EVD-IN-${String(documentId).replace(/[^A-Za-z0-9-]/g,'')}-${String(requestId).replace(/[^A-Za-z0-9-]/g,'')}`}
function matchesDocument(request,document){const types=request.acceptedDocumentTypes??[];if(types.includes(document.type))return true;const hint=NAME_HINTS[request.requirementId];return Boolean(hint&&hint.test(String(document.name??'')))}
export function syncReportRecipeRequests(engagement={},plan={}, {at=new Date().toISOString()}={}){
  if(!plan?.understood||!plan.recipe?.id)return{engagement:structuredClone(engagement),created:[],superseded:[]};
  const next=structuredClone(engagement),created=[],superseded=[];
  for(const r of next.requests??[])if(r.origin==='report-recipe'&&OPEN.has(r.status)&&r.recipeId!==plan.recipe.id){r.status='superseded';r.updatedAt=at;superseded.push(r.id)}
  for(const requirement of plan.required??[]){const key=requirementKey(plan.recipe.id,requirement.id),existing=(next.requests??[]).find(r=>r.recipeRequirementKey===key&&r.status!=='superseded');if(existing)continue;const request={id:nextId(next.requests),title:requirement.title,issueId:null,riskIds:[],standards:[],priority:requirement.priority??'high',requestedBy:[`report-recipe:${plan.recipe.id}`],roundIds:[],acceptanceCriteria:[{id:'document-received',label:'تم استلام مستند يطابق نوع الإدخال المطلوب',required:true}],status:'requested',evidenceIds:[],coverage:0,createdAt:at,updatedAt:at,repeatReason:null,origin:'report-recipe',recipeId:plan.recipe.id,requirementId:requirement.id,recipeRequirementKey:key,acceptedDocumentTypes:[...(requirement.documentTypes??[])],reason:requirement.reason??''};next.requests.push(request);created.push(request)}
  next.updatedAt=at;return{engagement:next,created,superseded}
}
export function linkDocumentToRecipeRequests(engagement={},document={}, {at=new Date().toISOString()}={}){
  const next=structuredClone(engagement),createdEvidence=[];for(const request of next.requests??[]){if(request.origin!=='report-recipe'||!OPEN.has(request.status)||!matchesDocument(request,document))continue;const evidenceId=receiptEvidenceId(document.id,request.id);if((next.evidence??[]).some(e=>e.id===evidenceId))continue;const evidence={id:evidenceId,title:`استلام ${document.name||document.id}`,documentIds:[document.id],requestIds:[request.id],issueIds:[],riskIds:[],criteriaSatisfied:['document-received'],sourceType:'document-receipt',reviewStatus:'received',receivedAt:at,provenance:{documentId:document.id,sha256:document.sha256??null}};next.evidence.push(evidence);createdEvidence.push(evidence)}next.requests=refreshEvidenceRequests(next.requests,next.evidence,{updatedAt:at});next.updatedAt=at;return{engagement:next,evidence:createdEvidence}}
export function reportIntakeMetrics(engagement={},recipeId=null){const rows=(engagement.requests??[]).filter(r=>r.origin==='report-recipe'&&(!recipeId||r.recipeId===recipeId));return{total:rows.length,open:rows.filter(r=>OPEN.has(r.status)).length,received:rows.filter(r=>['received','partial'].includes(r.status)).length,satisfied:rows.filter(r=>r.status==='satisfied').length,superseded:rows.filter(r=>r.status==='superseded').length}}
export{matchesDocument};
