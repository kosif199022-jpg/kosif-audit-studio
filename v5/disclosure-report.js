/** KOSIF V5 — enriches the Notes report section from governed disclosure reviews. */
const uniq=values=>[...new Set((values||[]).filter(Boolean))];

export function applyDisclosureReportSection(report={},disclosureState={}){
  const next=structuredClone(report),section=next.sections?.find(item=>item.id==='notes');
  if(!section||next.recipeId!=='full-financial-statements')return next;
  const candidates=disclosureState.candidates||[];
  section.humanReviewRequired=true;
  section.status='human-required';
  section.unavailableReason=null;
  section.paragraphs=[
    `حدد KOSIF ${candidates.length} موضوع إفصاح مرشحًا من الحسابات والقضايا والمعايير المسجلة. لا يعني الترشيح وحده أن الإفصاح واجب أو مكتمل.`,
    disclosureState.ready?'تم حسم كل موضوعات الإفصاح المرشحة مهنيًا؛ يظل نص الإيضاحات النهائي ومراجعته قرارًا بشريًا.':`ما زال ${disclosureState.pending??0} موضوع إفصاح غير محسوم أو غير مراجع؛ لا يجوز اعتبار قسم الإيضاحات مكتملًا.`
  ];
  section.tables=[{
    headers:['موضوع الإفصاح','المعايير','الحالة','أساس القرار'],
    rows:candidates.map(c=>[c.title,(c.standards||[]).join(' · '),c.status,c.review?.rationale||'لم يُحسم بعد'])
  }];
  section.sourceIds=uniq(candidates.flatMap(c=>c.sourceIds||[]));
  section.disclosureSnapshot={total:disclosureState.total??candidates.length,pending:disclosureState.pending??0,ready:Boolean(disclosureState.ready),topicIds:candidates.map(c=>c.topicId)};
  return next;
}
