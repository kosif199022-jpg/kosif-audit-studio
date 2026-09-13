/** KOSIF V5 — issue-centric review domain. Human resolution stays separate from automated signals. */
const ACTIVE_REQUESTS=new Set(['draft','requested','received','under-review','partial']);
const REVIEWED_EVIDENCE=new Set(['reviewed','sufficient']);
const OPEN_ISSUES=new Set(['open','investigating','management-response','challenged']);
const uniq=values=>[...new Set((values||[]).filter(Boolean))];
const intersects=(a=[],b=[])=>{const s=new Set(a||[]);return(b||[]).some(v=>s.has(v))};

export function issueSnapshot(engagement={},issueId){
  const issue=(engagement.issues||[]).find(i=>i.id===issueId);if(!issue)throw new RangeError(`Issue not found: ${issueId}`);
  const riskIds=issue.riskIds||[],documentIds=issue.documentIds||[],explicitEvidence=new Set(issue.evidenceIds||[]);
  const evidence=(engagement.evidence||[]).filter(e=>explicitEvidence.has(e.id)||(e.issueIds||[]).includes(issue.id)||intersects(riskIds,e.riskIds)||intersects(documentIds,e.documentIds));
  const evidenceIds=evidence.map(e=>e.id);
  const requests=(engagement.requests||[]).filter(r=>r.issueId===issue.id||intersects(riskIds,r.riskIds));
  const adjustments=(engagement.adjustments||[]).filter(a=>a.issueId===issue.id||intersects(evidenceIds,a.evidenceIds));
  const rounds=(engagement.councilRounds||[]).filter(round=>(round.issueIds||[]).includes(issue.id)||(round.positions||[]).some(p=>p.issueId===issue.id||intersects(riskIds,p.riskIds))).map(round=>({id:round.id,number:round.number,recordedAt:round.recordedAt,positions:(round.positions||[]).filter(p=>p.issueId===issue.id||intersects(riskIds,p.riskIds))}));
  const documents=(engagement.documents||[]).filter(d=>documentIds.includes(d.id)||evidence.some(e=>(e.documentIds||[]).includes(d.id)));
  return{issue,evidence,requests,adjustments,rounds,documents};
}

export function issueResolutionReadiness(engagement={},issueId){
  const snapshot=issueSnapshot(engagement,issueId),openRequests=snapshot.requests.filter(r=>ACTIVE_REQUESTS.has(r.status)),reviewedEvidence=snapshot.evidence.filter(e=>REVIEWED_EVIDENCE.has(e.reviewStatus)),acceptedAdjustments=snapshot.adjustments.filter(a=>a.status==='accepted');
  const options={
    'evidence-supported':openRequests.length===0&&reviewedEvidence.length>0,
    'adjustment-accepted':openRequests.length===0&&acceptedAdjustments.length>0,
    'not-applicable':openRequests.length===0
  };
  return{...snapshot,openRequests,reviewedEvidence,acceptedAdjustments,options,canResolve:Object.values(options).some(Boolean)};
}

export function recordIssueResolution(engagement={},issueId,input={},{at=new Date().toISOString()}={}){
  const ready=issueResolutionReadiness(engagement,issueId);if(!OPEN_ISSUES.has(ready.issue.status))throw new RangeError(`Issue ${issueId} is not open`);
  if(input.actorType!=='human')throw new TypeError('Issue resolution requires actorType=human');
  if(!input.actor||!String(input.actor).trim())throw new TypeError('actor is required');
  if(!input.rationale||!String(input.rationale).trim())throw new TypeError('rationale is required');
  const type=String(input.resolutionType||'');if(!Object.hasOwn(ready.options,type))throw new RangeError('Unsupported issue resolution type');
  if(ready.openRequests.length)throw new RangeError('Open evidence requests must be resolved before closing the issue');
  if(!ready.options[type]){
    if(type==='evidence-supported')throw new RangeError('Reviewed evidence is required for evidence-supported resolution');
    if(type==='adjustment-accepted')throw new RangeError('An accepted adjustment is required for adjustment-supported resolution');
    throw new RangeError('Issue is not ready for the selected resolution');
  }
  const sourceEvidenceIds=type==='evidence-supported'?ready.reviewedEvidence.map(e=>e.id):uniq(input.evidenceIds);
  const sourceAdjustmentIds=type==='adjustment-accepted'?ready.acceptedAdjustments.map(a=>a.id):uniq(input.adjustmentIds);
  const next=structuredClone(engagement),index=next.issues.findIndex(i=>i.id===issueId),previous=next.issues[index];
  const resolution={id:`IRES-${String((next.issueResolutions||[]).length+1).padStart(4,'0')}`,issueId,resolutionType:type,actorType:'human',actor:String(input.actor).trim(),rationale:String(input.rationale).trim(),evidenceIds:uniq(sourceEvidenceIds),adjustmentIds:uniq(sourceAdjustmentIds),at,previousStatus:previous.status};
  next.issues[index]={...previous,status:type==='not-applicable'?'not-applicable':'closed',resolvedAt:at,resolutionId:resolution.id,evidenceIds:uniq([...(previous.evidenceIds||[]),...resolution.evidenceIds]),adjustmentIds:uniq([...(previous.adjustmentIds||[]),...resolution.adjustmentIds])};
  next.issueResolutions=[...(next.issueResolutions||[]),resolution];next.updatedAt=at;return{engagement:next,resolution};
}

export function issueMetrics(engagement={}){const rows=engagement.issues||[],open=rows.filter(i=>OPEN_ISSUES.has(i.status));return{total:rows.length,open:open.length,criticalOpen:open.filter(i=>i.severity==='critical').length,highOpen:open.filter(i=>i.severity==='high').length,closed:rows.length-open.length}}

export{ACTIVE_REQUESTS,REVIEWED_EVIDENCE,OPEN_ISSUES};
