/**
 * KOSIF V5 — Engagement state machine.
 * Pure domain code: no DOM, storage, network, or AI calls.
 */

export const ENGAGEMENT_STAGES = Object.freeze({
  INTAKE: 'INTAKE', UNDERSTANDING: 'UNDERSTANDING', PLANNING: 'PLANNING',
  EVIDENCE_COLLECTION: 'EVIDENCE_COLLECTION', COUNCIL_REVIEW: 'COUNCIL_REVIEW',
  AWAITING_EVIDENCE: 'AWAITING_EVIDENCE', ADJUSTMENTS: 'ADJUSTMENTS',
  COMPLETION: 'COMPLETION', REPORTING: 'REPORTING', ISSUED: 'ISSUED'
});

export const DOMAIN_EVENT_TYPES = Object.freeze({
  DOCUMENT_REGISTERED: 'DOCUMENT_REGISTERED', DOCUMENT_CLASSIFIED: 'DOCUMENT_CLASSIFIED',
  EVIDENCE_LINKED: 'EVIDENCE_LINKED', ISSUE_RAISED: 'ISSUE_RAISED', REQUEST_CREATED: 'REQUEST_CREATED',
  REQUEST_STATUS_CHANGED: 'REQUEST_STATUS_CHANGED', COUNCIL_ROUND_RECORDED: 'COUNCIL_ROUND_RECORDED',
  ADJUSTMENT_PROPOSED: 'ADJUSTMENT_PROPOSED', ADJUSTMENT_DECIDED: 'ADJUSTMENT_DECIDED',
  REPORT_GENERATED: 'REPORT_GENERATED', REPORT_ISSUED: 'REPORT_ISSUED', HUMAN_DECISION_RECORDED: 'HUMAN_DECISION_RECORDED'
});

const deepClone = value => structuredClone(value);
const nowIso = () => new Date().toISOString();
const activeRequestStatuses = new Set(['draft','requested','received','under-review','partial']);
const unresolvedIssueStatuses = new Set(['open','investigating','management-response','challenged']);
const pendingAdjustmentStatuses = new Set(['proposed','challenged','modified']);

export function createEngagement({ id=`ENG-${Date.now()}`, entity='منشأة غير محددة', period=null, jurisdiction='SA', framework='IFRS', engagementType='audit', currency='SAR', createdAt=nowIso() }={}) {
  return { id:String(id), entity:String(entity), period, jurisdiction, framework, engagementType, currency,
    stage:ENGAGEMENT_STAGES.INTAKE, createdAt, updatedAt:createdAt, documents:[], evidence:[], issues:[], requests:[], councilRounds:[], adjustments:[], reports:[], decisions:[], events:[] };
}

export function appendDomainEvent(engagement,{type,actor='system',payload={},at=nowIso()}={}){
  if(!engagement||typeof engagement!=='object') throw new TypeError('engagement is required');
  if(!Object.values(DOMAIN_EVENT_TYPES).includes(type)) throw new RangeError(`Unsupported domain event: ${type}`);
  const next=deepClone(engagement); const event={sequence:next.events.length+1,type,actor:String(actor),at:String(at),payload:deepClone(payload)};
  next.events.push(event); next.updatedAt=event.at; next.stage=deriveEngagementStage(next); return next;
}

export function deriveEngagementStage(engagement={}){
  const documents=engagement.documents??[], requests=engagement.requests??[], councilRounds=engagement.councilRounds??[], issues=engagement.issues??[], adjustments=engagement.adjustments??[], reports=engagement.reports??[];
  if(reports.some(r=>r.status==='issued')) return ENGAGEMENT_STAGES.ISSUED;
  if(reports.some(r=>['draft','reviewed','ready'].includes(r.status))) return ENGAGEMENT_STAGES.REPORTING;
  if(documents.length===0) return ENGAGEMENT_STAGES.INTAKE;
  if(documents.some(d=>['registered','processing'].includes(d.status))) return ENGAGEMENT_STAGES.UNDERSTANDING;
  if(councilRounds.length===0&&issues.length===0) return ENGAGEMENT_STAGES.PLANNING;
  const openRequests=requests.filter(r=>activeRequestStatuses.has(r.status));
  const hasEvidenceAwaitingCouncil=requests.some(r=>['received','partial'].includes(r.status))||(engagement.evidence??[]).some(e=>e.reviewStatus==='received');
  if(hasEvidenceAwaitingCouncil&&councilRounds.length>0) return ENGAGEMENT_STAGES.COUNCIL_REVIEW;
  if(openRequests.some(r=>['draft','requested'].includes(r.status))) return ENGAGEMENT_STAGES.AWAITING_EVIDENCE;
  if(adjustments.some(a=>pendingAdjustmentStatuses.has(a.status))) return ENGAGEMENT_STAGES.ADJUSTMENTS;
  if(issues.some(i=>unresolvedIssueStatuses.has(i.status))) return ENGAGEMENT_STAGES.EVIDENCE_COLLECTION;
  const latestRound=councilRounds.at(-1); if(!latestRound||latestRound.status!=='completed') return ENGAGEMENT_STAGES.COUNCIL_REVIEW;
  return ENGAGEMENT_STAGES.COMPLETION;
}

export function engagementBlockers(engagement={}){
  const blockers=[];
  for(const issue of engagement.issues??[]) if(issue.severity==='critical'&&unresolvedIssueStatuses.has(issue.status)) blockers.push({type:'critical_issue',objectId:issue.id,message:issue.title||'مسألة حرجة مفتوحة'});
  for(const request of engagement.requests??[]){
    if(request.priority==='critical'&&activeRequestStatuses.has(request.status)) blockers.push({type:'critical_request',objectId:request.id,message:request.title||'طلب دليل حرج مفتوح'});
    if(request.status==='unavailable'&&request.priority==='critical') blockers.push({type:'scope_limitation',objectId:request.id,message:`تعذر الحصول على دليل حرج: ${request.title}`});
  }
  const latest=(engagement.councilRounds??[]).at(-1); for(const conflict of latest?.conflicts??[]) if(!conflict.resolution) blockers.push({type:'council_conflict',objectId:conflict.id,message:conflict.title||'نزاع مهني غير محسوم'});
  return blockers;
}

export function reportReadiness(engagement={}){
  const blockers=engagementBlockers(engagement), openRequests=(engagement.requests??[]).filter(r=>activeRequestStatuses.has(r.status)), unresolvedIssues=(engagement.issues??[]).filter(i=>unresolvedIssueStatuses.has(i.status)), undecidedAdjustments=(engagement.adjustments??[]).filter(a=>pendingAdjustmentStatuses.has(a.status)), latest=(engagement.councilRounds??[]).at(-1);
  const checks={hasDocuments:(engagement.documents??[]).length>0,councilCompleted:Boolean(latest?.status==='completed'),noCriticalBlockers:blockers.length===0,noOpenEvidenceRequests:openRequests.length===0,noUnresolvedIssues:unresolvedIssues.length===0,adjustmentsDecided:undecidedAdjustments.length===0};
  const values=Object.values(checks), score=Math.round(values.filter(Boolean).length/values.length*100);
  return {ready:values.every(Boolean),score,checks,blockers,openRequests:openRequests.length,unresolvedIssues:unresolvedIssues.length,undecidedAdjustments:undecidedAdjustments.length};
}

export function nextActionForEngagement(engagement={}){
  const stage=deriveEngagementStage(engagement), readiness=reportReadiness(engagement), firstOpenRequest=(engagement.requests??[]).find(r=>activeRequestStatuses.has(r.status)), firstIssue=(engagement.issues??[]).find(i=>unresolvedIssueStatuses.has(i.status)), firstAdjustment=(engagement.adjustments??[]).find(a=>pendingAdjustmentStatuses.has(a.status));
  const actions={
    [ENGAGEMENT_STAGES.INTAKE]:{code:'UPLOAD_DOCUMENT',label:'ارفع أول مستند للارتباط'}, [ENGAGEMENT_STAGES.UNDERSTANDING]:{code:'COMPLETE_DOCUMENT_UNDERSTANDING',label:'أكمل فهم وتصنيف المستندات المستلمة'}, [ENGAGEMENT_STAGES.PLANNING]:{code:'ASSESS_AND_CONVENE',label:'قيّم البيانات واعقد الجولة الأولى للمجلس'}, [ENGAGEMENT_STAGES.EVIDENCE_COLLECTION]:{code:'RESOLVE_ISSUE',label:firstIssue?`استكمل معالجة: ${firstIssue.title}`:'استكمل جمع الأدلة'}, [ENGAGEMENT_STAGES.COUNCIL_REVIEW]:{code:'CONVENE_COUNCIL',label:'اعقد جولة مجلس جديدة على الأدلة المستلمة'}, [ENGAGEMENT_STAGES.AWAITING_EVIDENCE]:{code:'UPLOAD_REQUESTED_EVIDENCE',label:firstOpenRequest?`ارفع: ${firstOpenRequest.title}`:'ارفع الأدلة المطلوبة'}, [ENGAGEMENT_STAGES.ADJUSTMENTS]:{code:'DECIDE_ADJUSTMENT',label:firstAdjustment?`اتخذ قرارًا بشأن ${firstAdjustment.id}`:'راجع التسويات المقترحة'}, [ENGAGEMENT_STAGES.COMPLETION]:{code:readiness.ready?'BUILD_REPORT':'RESOLVE_BLOCKERS',label:readiness.ready?'أنشئ التقرير المطلوب':'عالج موانع الإكمال'}, [ENGAGEMENT_STAGES.REPORTING]:{code:'REVIEW_REPORT',label:'راجع التقرير واعتمده للإصدار'}, [ENGAGEMENT_STAGES.ISSUED]:{code:'VIEW_ISSUED_REPORT',label:'اعرض التقرير الصادر وسجل التتبع'} };
  return {stage,...actions[stage],readiness};
}

export function engagementSummary(engagement={}){const next=nextActionForEngagement(engagement);return{id:engagement.id,entity:engagement.entity,stage:next.stage,nextAction:next,counts:{documents:(engagement.documents??[]).length,evidence:(engagement.evidence??[]).length,issues:(engagement.issues??[]).length,openRequests:(engagement.requests??[]).filter(r=>activeRequestStatuses.has(r.status)).length,councilRounds:(engagement.councilRounds??[]).length,adjustments:(engagement.adjustments??[]).length,reports:(engagement.reports??[]).length}};}
