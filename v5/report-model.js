/** KOSIF V5 — source-backed professional report model. Rendering is a separate concern. */
import { reportReadiness } from './engagement-machine.js';
import { evidenceRequestMetrics } from './evidence-requests.js';

const titleMap = {
  cover:'الغلاف', 'executive-summary':'الملخص التنفيذي', opinion:'الرأي', 'basis-for-opinion':'أساس الرأي',
  'basis-of-preparation':'أساس الإعداد', materiality:'الأهمية النسبية', scope:'نطاق العمل', 'key-audit-matters':'أمور المراجعة الرئيسية',
  'going-concern':'الاستمرارية', 'other-information':'المعلومات الأخرى', responsibilities:'المسؤوليات', 'council-summary':'ملخص مجلس المراجعين',
  'evidence-coverage':'تغطية الأدلة', adjustments:'التسويات', 'adjustment-summary':'ملخص التسويات',
  'statement-of-financial-position':'قائمة المركز المالي', 'profit-or-loss':'قائمة الربح أو الخسارة', 'cash-flows':'قائمة التدفقات النقدية',
  'changes-in-equity':'قائمة التغيرات في حقوق الملكية', notes:'الإيضاحات', 'traceability-appendix':'ملحق التتبع',
  'control-findings':'ملاحظات الرقابة', recommendations:'التوصيات', 'management-responses':'ردود الإدارة', 'action-plan':'خطة العمل',
  'inventory-analysis':'تحليل المخزون', exceptions:'الاستثناءات', conclusion:'الاستنتاج'
};
const uniq = values => [...new Set((values || []).filter(Boolean))];
const openIssue = i => ['open','investigating','management-response','challenged'].includes(i.status);

function baseSection(id, engagement) { return { id, title:titleMap[id] || id, status:'draft', paragraphs:[], facts:[], tables:[], sourceIds:[], humanReviewRequired:false, unavailableReason:null, engagementId:engagement.id, review:null, reviewHistory:[] }; }
function addSources(section, values) { section.sourceIds = uniq([...section.sourceIds, ...(values || [])]); return section; }

function buildSection(id, ctx) {
  const { engagement, recipe, statements, materiality, traceabilityMetrics, documentMetrics } = ctx;
  const s = baseSection(id, engagement); const latest = engagement.councilRounds?.at(-1); const req = evidenceRequestMetrics(engagement.requests || []);
  const accepted = (engagement.adjustments || []).filter(a => a.status === 'accepted'); const pending = (engagement.adjustments || []).filter(a => ['proposed','challenged','modified'].includes(a.status));
  switch (id) {
    case 'cover':
      s.status='ready'; s.facts.push({label:'المنشأة',value:engagement.entity},{label:'الفترة',value:engagement.period || 'غير محددة'},{label:'نوع المخرج',value:recipe.title},{label:'الإطار',value:engagement.framework}); break;
    case 'executive-summary':
      s.paragraphs.push(`يضم ملف الارتباط ${engagement.documents.length} مستندًا و${engagement.evidence.length} عنصر دليل/Claim و${engagement.issues.filter(openIssue).length} قضية مفتوحة.`);
      s.paragraphs.push(`بلغ عدد جولات المجلس ${engagement.councilRounds.length}، ويوجد ${req.open} طلب دليل مفتوح و${accepted.length} تسوية معتمدة بشريًا.`);
      addSources(s, latest?.id ? [latest.id] : []); break;
    case 'opinion':
      s.humanReviewRequired=true; s.status='human-required'; s.paragraphs.push('لا يصدر KOSIF رأيًا نهائيًا بصورة آلية. هذا القسم محجوز لصياغة واعتماد المراجع البشري بعد استيفاء بوابات الإكمال.');
      addSources(s, latest?.id ? [latest.id] : []); break;
    case 'basis-for-opinion':
      s.humanReviewRequired=true; s.status='human-required'; s.paragraphs.push(`بوابات الجاهزية الحالية: ${ctx.readiness.score}%، مع ${ctx.readiness.blockers.length} مانعًا حرجًا.`); addSources(s, engagement.evidence.map(e=>e.id)); break;
    case 'basis-of-preparation':
      s.paragraphs.push(`أُعد هذا المخرج وفق إطار ${engagement.framework} من بيانات الارتباط والتسويات المقبولة فقط، مع بقاء بيانات المصدر الأصلية غير معدلة.`); addSources(s, engagement.documents.map(d=>d.id)); break;
    case 'materiality':
      if (!materiality) { s.status='unavailable'; s.unavailableReason='لم يتم احتساب الأهمية النسبية من بيانات مالية منظمة.'; break; }
      s.facts.push({label:'Overall materiality',value:String(materiality.overall ?? '')},{label:'Performance materiality',value:String(materiality.performance ?? '')}); break;
    case 'scope':
      s.facts.push({label:'المستندات',value:engagement.documents.length},{label:'تحليلات المستند',value:documentMetrics?.documentsAnalyzed ?? 0},{label:'Claims',value:documentMetrics?.claims ?? 0},{label:'إشارات الخطر',value:documentMetrics?.risks ?? 0}); addSources(s, engagement.documents.map(d=>d.id)); break;
    case 'key-audit-matters': {
      const high = engagement.issues.filter(i=>['critical','high'].includes(i.severity));
      s.humanReviewRequired=true; s.status='human-required';
      if (!high.length) s.paragraphs.push('لا توجد مرشحات KAM آلية عالية/حرجة في الحالة الحالية. يظل تحديد وجود أو عدم وجود KAM قرارًا بشريًا موثقًا.');
      else { s.tables.push({headers:['المسألة','الخطورة','الحالة'],rows:high.slice(0,12).map(i=>[i.title,i.severity,i.status])}); addSources(s, high.map(i=>i.id)); }
      break;
    }
    case 'going-concern':
      s.humanReviewRequired=true; s.status='human-required'; s.paragraphs.push('يتطلب استنتاج الاستمرارية تقييمًا مخصصًا للأدلة والتوقعات والتمويل والأحداث اللاحقة؛ لا يُستنتج من غياب تنبيه آلي.'); break;
    case 'other-information':
      s.humanReviewRequired=true; s.status='human-required'; s.paragraphs.push('يعرض هذا القسم أي تعارضات موثقة بين السرد والمعلومات المالية عند توفرها. الاستنتاج النهائي يتطلب مراجعة بشرية للمعلومات الأخرى ذات الصلة.'); break;
    case 'responsibilities':
      s.status='human-required'; s.humanReviewRequired=true; s.paragraphs.push('تُراجع الصياغة القانونية/المهنية النهائية لمسؤوليات الإدارة والمراجع وفق نوع الارتباط والجهة التنظيمية قبل الإصدار.'); break;
    case 'council-summary':
      if (!latest) { s.status='unavailable'; s.unavailableReason='لم تُعقد جولة مجلس.'; break; }
      s.paragraphs.push(latest.verdictText || latest.verdict || 'تمت الجولة.');
      s.tables.push({headers:['المقعد','الموقف','الملخص'],rows:(latest.positions||[]).map(p=>[p.title||p.seatId,p.stance,p.statement])}); addSources(s,[latest.id,...(latest.evidenceIds||[])]); break;
    case 'evidence-coverage':
      s.facts.push({label:'إجمالي الأدلة',value:engagement.evidence.length},{label:'طلبات مفتوحة',value:req.open},{label:'طلبات مستوفاة',value:req.satisfied});
      s.tables.push({headers:['الطلب','الأولوية','الحالة','التغطية'],rows:(engagement.requests||[]).map(r=>[r.title,r.priority,r.status,`${r.coverage||0}%`])}); addSources(s,engagement.evidence.map(e=>e.id)); break;
    case 'adjustments': case 'adjustment-summary':
      s.tables.push({headers:['القيد','النوع','الحالة','السبب'],rows:(engagement.adjustments||[]).map(a=>[a.id,a.type,a.status,a.rationale])}); addSources(s,(engagement.adjustments||[]).map(a=>a.id)); if(pending.length){s.humanReviewRequired=true;s.status='human-required'} break;
    case 'statement-of-financial-position':
      if (!statements?.sfp) { s.status='unavailable'; s.unavailableReason='لا يوجد ميزان مراجعة منظم لبناء قائمة المركز المالي.'; break; }
      s.tables.push({headers:['البند','القيمة'],rows:[['الأصول المتداولة',statements.sfp.currentAssets.total],['الأصول غير المتداولة',statements.sfp.nonCurrentAssets.total],['إجمالي الأصول',statements.sfp.totalAssets],['الالتزامات المتداولة',statements.sfp.currentLiabilities.total],['الالتزامات غير المتداولة',statements.sfp.nonCurrentLiabilities.total],['حقوق الملكية',statements.sfp.equity.total]]}); addSources(s,accepted.map(a=>a.id)); break;
    case 'profit-or-loss':
      if (!statements?.pl) { s.status='unavailable'; s.unavailableReason='لا يوجد ميزان مراجعة منظم لبناء قائمة الربح أو الخسارة.'; break; }
      s.tables.push({headers:['البند','القيمة'],rows:[['الإيرادات',statements.pl.revenue],['المصروفات',statements.pl.expenses],['ربح الفترة',statements.pl.profit]]}); addSources(s,accepted.map(a=>a.id)); break;
    case 'cash-flows':
      s.status='unavailable'; s.unavailableReason='محرك التدفقات النقدية لم يُربط بعد ببيانات الحركات والمقارنات؛ لن ينشئ KOSIF تدفقات تقديرية.'; break;
    case 'changes-in-equity':
      s.status='unavailable'; s.unavailableReason='يلزم ربط حركات حقوق الملكية والمقارنات قبل بناء القائمة بصورة قابلة للتتبع.'; break;
    case 'notes':
      s.status='human-required'; s.humanReviewRequired=true; s.paragraphs.push('الإيضاحات تتطلب Disclosure Engine وربط سياسات وإفصاحات تفصيلي؛ هذه النسخة لا تولد إيضاحات افتراضية غير مدعومة.'); break;
    case 'traceability-appendix':
      s.facts.push({label:'عقد التتبع',value:traceabilityMetrics?.nodes ?? 0},{label:'روابط التتبع',value:traceabilityMetrics?.edges ?? 0},{label:'عناصر معزولة',value:traceabilityMetrics?.isolated?.length ?? 0}); addSources(s,[...engagement.documents.map(d=>d.id),...engagement.evidence.map(e=>e.id),...engagement.councilRounds.map(r=>r.id),...engagement.adjustments.map(a=>a.id)]); break;
    default:
      s.status='human-required'; s.humanReviewRequired=true; s.paragraphs.push('هذا القسم موجود في وصفة التقرير لكنه يتطلب Builder متخصصًا قبل الإصدار النهائي.');
  }
  return s;
}

export function reportQuality(model) {
  const unavailable=model.sections.filter(s=>s.status==='unavailable'), human=model.sections.filter(s=>s.humanReviewRequired), orphaned=(model.traceabilityMetrics?.isolated||[]).length;
  const humanReviewCompleted=human.every(s=>s.review?.decision==='approved');
  const checks={readiness:Boolean(model.readiness?.ready),noUnavailableRequiredSections:unavailable.length===0,traceabilityHealthy:orphaned===0,humanReviewCompleted};
  return {checks,readyForIssue:Object.values(checks).every(Boolean),readiness:checks.readiness,noUnavailableRequiredSections:checks.noUnavailableRequiredSections,traceabilityHealthy:checks.traceabilityHealthy,humanReviewCompleted,unavailableSections:unavailable.map(s=>s.id),humanReviewSections:human.map(s=>s.id),orphaned};
}

export function buildProfessionalReportModel({ engagement, recipe, statements=null, materiality=null, documentMetrics=null, traceabilityMetrics=null, createdAt=new Date().toISOString() }={}) {
  if(!engagement||!recipe)throw new TypeError('engagement and recipe are required');
  const readiness=reportReadiness(engagement), ctx={engagement,recipe,statements,materiality,documentMetrics,traceabilityMetrics,readiness};
  const model={id:`RPT-${String((engagement.reports?.length||0)+1).padStart(3,'0')}`,version:1,status:'draft',createdAt,engagementId:engagement.id,recipeId:recipe.id,title:recipe.title,readiness,traceabilityMetrics,sections:(recipe.sections||[]).map(id=>buildSection(id,ctx))};
  model.quality=reportQuality(model); return model;
}
