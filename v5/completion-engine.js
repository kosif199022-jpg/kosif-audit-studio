/** KOSIF V5 — completion room gates. System facts and human professional decisions stay separate. */
const ACTIVE_REQUESTS=new Set(['draft','requested','received','under-review','partial']);
const OPEN_ISSUES=new Set(['open','investigating','management-response','challenged']);
const PENDING_ADJUSTMENTS=new Set(['proposed','challenged','modified']);
const HUMAN_STATUS=new Set(['satisfied','not-applicable','blocked']);
const uniq=v=>[...new Set((v||[]).filter(Boolean))];

const defs={
  COUNCIL_COMPLETED:{title:'الجولة النهائية للمجلس مكتملة',mode:'system'},
  EVIDENCE_REQUESTS_CLOSED:{title:'طلبات الأدلة مغلقة',mode:'system'},
  ISSUES_RESOLVED:{title:'القضايا المهنية محسومة',mode:'system'},
  ADJUSTMENTS_DECIDED:{title:'كل التسويات المقترحة اتُخذ قرار بشأنها',mode:'system'},
  TRACEABILITY_HEALTH:{title:'سلسلة التتبع بلا عناصر معزولة',mode:'system'},
  MATERIALITY_APPROVED:{title:'اعتماد الأهمية النسبية',mode:'human',auditOnly:true,requires:'materiality'},
  SUBSEQUENT_EVENTS:{title:'استكمال إجراءات الأحداث اللاحقة',mode:'human',auditOnly:true},
  GOING_CONCERN:{title:'استنتاج الاستمرارية',mode:'human',auditOnly:true},
  RELATED_PARTIES:{title:'استكمال الأطراف ذات العلاقة',mode:'human',auditOnly:true},
  LEGAL_CONTINGENCIES:{title:'استكمال القضايا والالتزامات المحتملة',mode:'human',auditOnly:true},
  WRITTEN_REPRESENTATIONS:{title:'الإقرارات الكتابية من الإدارة',mode:'human',auditOnly:true},
  KAM_DETERMINATION:{title:'تحديد أمور المراجعة الرئيسية KAM',mode:'human',auditOnly:true},
  UNCORRECTED_MISSTATEMENTS:{title:'تقييم التحريفات غير المصححة',mode:'human',auditOnly:true},
  STATEMENT_PRESENTATION_REVIEW:{title:'مراجعة العرض النهائي للقائمة/القوائم',mode:'human',preparationOnly:true},
  DISCLOSURE_REVIEW:{title:'مراجعة الإيضاحات والإفصاحات',mode:'human',fullStatementsOnly:true,requires:'disclosures'}
};

function isAudit(type=''){return['audit','review'].includes(type)}
function latestDecisions(engagement={}){const map=new Map;for(const d of engagement.completionDecisions||[])map.set(d.checkId,d);return map}
function systemStatus(id,engagement,ctx){
  if(id==='COUNCIL_COMPLETED')return engagement.councilRounds?.at(-1)?.status==='completed'?['satisfied','آخر جولة مجلس مكتملة.']:['pending','لا توجد جولة مجلس مكتملة.'];
  if(id==='EVIDENCE_REQUESTS_CLOSED'){const open=(engagement.requests||[]).filter(r=>ACTIVE_REQUESTS.has(r.status));return open.length?['pending',`${open.length} طلب دليل ما زال مفتوحًا.`]:['satisfied','لا توجد طلبات أدلة مفتوحة.']}
  if(id==='ISSUES_RESOLVED'){const open=(engagement.issues||[]).filter(i=>OPEN_ISSUES.has(i.status));return open.length?['pending',`${open.length} قضية ما زالت مفتوحة.`]:['satisfied','كل القضايا مسجلة بحالة محسومة.']}
  if(id==='ADJUSTMENTS_DECIDED'){const pending=(engagement.adjustments||[]).filter(a=>PENDING_ADJUSTMENTS.has(a.status));return pending.length?['pending',`${pending.length} تسوية تنتظر قرارًا بشريًا.`]:['satisfied','لا توجد تسويات معلقة.']}
  if(id==='TRACEABILITY_HEALTH'){const isolated=ctx.traceabilityMetrics?.isolated?.length;if(isolated==null)return['pending','لم يتم احتساب صحة التتبع.'];return isolated?['pending',`${isolated} عنصرًا معزولًا في خريطة التتبع.`]:['satisfied','كل العناصر الداخلة في التقرير مرتبطة في خريطة التتبع.']}
  return['pending','غير محسوم.'];
}

export function completionRequirements(engagement={},ctx={}){
  const audit=isAudit(engagement.engagementType),recipeId=ctx.recipeId||'';
  const ids=['COUNCIL_COMPLETED','EVIDENCE_REQUESTS_CLOSED','ISSUES_RESOLVED','ADJUSTMENTS_DECIDED','TRACEABILITY_HEALTH'];
  if(audit)ids.push('MATERIALITY_APPROVED','SUBSEQUENT_EVENTS','GOING_CONCERN','RELATED_PARTIES','LEGAL_CONTINGENCIES','WRITTEN_REPRESENTATIONS','KAM_DETERMINATION','UNCORRECTED_MISSTATEMENTS');
  else ids.push('STATEMENT_PRESENTATION_REVIEW');
  if(recipeId==='full-financial-statements')ids.push('DISCLOSURE_REVIEW');
  const latest=latestDecisions(engagement);
  return ids.map(id=>{
    const def=defs[id],decision=latest.get(id)||null;
    if(def.mode==='system'){const [status,detail]=systemStatus(id,engagement,ctx);return{id,...def,status,detail,decision:null}}
    if(def.requires==='materiality'&&!ctx.materiality)return{id,...def,status:'blocked',detail:'لا توجد Materiality محسوبة يمكن اعتمادها.',decision:null,prerequisiteMissing:true};
    if(def.requires==='disclosures'){
      const ds=ctx.disclosureStatus;
      if(!ds)return{id,...def,status:'blocked',detail:'لم يتم احتساب قائمة الإفصاحات التفصيلية.',decision:null,prerequisiteMissing:true};
      if(!ds.ready)return{id,...def,status:'blocked',detail:`${ds.pending} موضوع إفصاح ما زال يحتاج تحديد الانطباق أو الإعداد والمراجعة.`,decision:null,prerequisiteMissing:true};
    }
    return{id,...def,status:decision?.status||'pending',detail:decision?.rationale||'يتطلب قرارًا مهنيًا بشريًا موثقًا.',decision};
  });
}

export function recordCompletionDecision(engagement={},input={},{at=new Date().toISOString()}={}){
  const def=defs[input.checkId];if(!def||def.mode!=='human')throw new RangeError('Unknown or non-human completion check');
  if(!HUMAN_STATUS.has(input.status))throw new RangeError('Invalid completion decision status');
  if(input.actorType!=='human')throw new TypeError('Completion decisions require actorType=human');
  if(!input.actor||!String(input.actor).trim())throw new TypeError('actor is required');
  if(!input.rationale||!String(input.rationale).trim())throw new TypeError('rationale is required');
  const next=structuredClone(engagement),previous=[...(next.completionDecisions||[])].reverse().find(d=>d.checkId===input.checkId);
  const decision={id:`CMP-${String((next.completionDecisions||[]).length+1).padStart(4,'0')}`,checkId:input.checkId,status:input.status,actor:String(input.actor),actorType:'human',rationale:String(input.rationale),evidenceIds:uniq(input.evidenceIds),at,previousDecisionId:previous?.id||null};
  next.completionDecisions=[...(next.completionDecisions||[]),decision];next.updatedAt=at;return{engagement:next,decision};
}

export function completionStatus(engagement={},ctx={}){
  const requirements=completionRequirements(engagement,ctx),blockers=requirements.filter(r=>r.status!=='satisfied'&&r.status!=='not-applicable');
  const blocked=requirements.filter(r=>r.status==='blocked'),pending=requirements.filter(r=>r.status==='pending');
  return{ready:blockers.length===0,requirements,blockers,blocked:blocked.length,pending:pending.length,score:Math.round(requirements.filter(r=>['satisfied','not-applicable'].includes(r.status)).length/Math.max(1,requirements.length)*100)};
}

export function completionDefinition(id){return defs[id]?{id,...defs[id]}:null}
