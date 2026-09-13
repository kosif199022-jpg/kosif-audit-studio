import { reportReadiness } from './engagement-machine.js';

const OPEN_REQUESTS=new Set(['draft','requested','received','under-review','partial']);
const OPEN_ISSUES=new Set(['open','investigating','management-response','challenged']);
const PENDING_ADJUSTMENTS=new Set(['proposed','challenged','modified']);
const REVIEWED_EVIDENCE=new Set(['reviewed','sufficient']);
const SEVERITIES=['critical','high','medium','low'];

export const DASHBOARD_FILTERS=Object.freeze({severity:'all',documentType:'all',status:'all'});
export const SEARCH_KINDS=Object.freeze({document:'DOC',evidence:'EVD',issue:'ISS',request:'REQ',adjustment:'AJ',report:'RPT',round:'RND',account:'ACC',task:'TASK',contact:'CONTACT'});

export function normalizeDashboardText(value=''){
  return String(value??'').trim().toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[ىي]/g,'ي').replace(/[\u064B-\u065F\u0670]/g,'').replace(/ـ/g,'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g,' ');
}
const bigint=v=>typeof v==='bigint'?v:BigInt(v||0);
const abs=v=>{const n=bigint(v);return n<0n?-n:n};
function rowBalance(row={}){return bigint(row.debit??row.debitMinor??0)-bigint(row.credit??row.creditMinor??0)}
function percentage(part,total){const p=abs(part),t=abs(total);return t===0n?0:Number((p*10000n)/t)/100}
function currentIssues(engagement,filters){return(engagement.issues??[]).filter(i=>(filters.severity==='all'||i.severity===filters.severity)&&(filters.status==='all'||i.status===filters.status))}
function currentDocs(engagement,filters){return(engagement.documents??[]).filter(d=>filters.documentType==='all'||d.type===filters.documentType)}

export function accountConcentration(analysis,limit=10){
  const rows=analysis?.rows??[];const ranked=rows.map(r=>({id:r.id??r.code??'',name:r.name??r.accountName??r.code??'حساب',category:r.category??'غير مصنف',amount:abs(rowBalance(r))})).filter(r=>r.amount>0n).sort((a,b)=>a.amount===b.amount?0:a.amount>b.amount?-1:1);
  const total=ranked.reduce((s,r)=>s+r.amount,0n),top=ranked.slice(0,limit),topTotal=top.reduce((s,r)=>s+r.amount,0n);
  const shares=ranked.map(r=>total?Number((r.amount*10000n)/total)/100:0);const hhi=Math.round(shares.reduce((s,x)=>s+x*x,0));
  return{total,top,topShare:percentage(topTotal,total),hhi,count:ranked.length};
}

export function councilTrend(engagement={}){
  return(engagement.councilRounds??[]).map((r,index)=>({number:r.number??index+1,evidence:(r.evidenceIds??[]).length,issues:(r.issueIds??[]).length,requests:(engagement.requests??[]).filter(q=>q.roundId===r.id||q.createdByRoundId===r.id).length}));
}

export function dashboardMetrics({engagement={},analysis=null,filters=DASHBOARD_FILTERS}={}){
  const f={...DASHBOARD_FILTERS,...filters},documents=currentDocs(engagement,f),issues=currentIssues(engagement,f),evidence=engagement.evidence??[],requests=engagement.requests??[],adjustments=engagement.adjustments??[],reports=engagement.reports??[];
  const reviewed=evidence.filter(e=>REVIEWED_EVIDENCE.has(e.reviewStatus)).length,openRequests=requests.filter(r=>OPEN_REQUESTS.has(r.status)).length,openIssues=issues.filter(i=>OPEN_ISSUES.has(i.status)).length,highIssues=issues.filter(i=>OPEN_ISSUES.has(i.status)&&['critical','high'].includes(i.severity)).length,pendingAdjustments=adjustments.filter(a=>PENDING_ADJUSTMENTS.has(a.status)).length,acceptedAdjustments=adjustments.filter(a=>a.status==='accepted').length;
  const adjustmentImpact=adjustments.filter(a=>a.status==='accepted').reduce((sum,a)=>{const debit=(a.lines??[]).filter(l=>l.side==='debit').reduce((s,l)=>s+abs(l.amountMinor??l.amount??0),0n);return sum+debit},0n);
  const issueBySeverity=Object.fromEntries(SEVERITIES.map(s=>[s,issues.filter(i=>i.severity===s&&OPEN_ISSUES.has(i.status)).length]));const docTypes={};for(const d of documents)docTypes[d.type??'unknown']=(docTypes[d.type??'unknown']??0)+1;
  const readiness=reportReadiness(engagement),concentration=accountConcentration(analysis);
  return{documents:documents.length,evidence:evidence.length,reviewedEvidence:reviewed,evidenceReviewPercent:evidence.length?Math.round(reviewed/evidence.length*100):0,openRequests,openIssues,highIssues,issueBySeverity,councilRounds:(engagement.councilRounds??[]).length,pendingAdjustments,acceptedAdjustments,adjustmentImpact,reports:reports.length,latestReportStatus:reports.at(-1)?.status??null,readiness:readiness.score,ready:readiness.ready,docTypes,concentration,trend:councilTrend(engagement)};
}

function duplicateIds(rows=[]){const seen=new Set,dupes=new Set;for(const r of rows){if(!r?.id)continue;if(seen.has(r.id))dupes.add(r.id);seen.add(r.id)}return[...dupes]}
function unbalancedAdjustment(a={}){const debit=(a.lines??[]).filter(l=>l.side==='debit').reduce((s,l)=>s+bigint(l.amountMinor??l.amount??0),0n),credit=(a.lines??[]).filter(l=>l.side==='credit').reduce((s,l)=>s+bigint(l.amountMinor??l.amount??0),0n);return debit!==credit}
export function dataQualityReport(engagement={},analysis=null,materiality=null){
  const docs=engagement.documents??[],evidence=engagement.evidence??[],issues=engagement.issues??[],requests=engagement.requests??[],adjustments=engagement.adjustments??[],reports=engagement.reports??[];const docIds=new Set(docs.map(d=>d.id));
  const hashCounts=new Map;for(const d of docs){if(!d.sha256)continue;hashCounts.set(d.sha256,(hashCounts.get(d.sha256)??0)+1)}const duplicateDocs=[...hashCounts.values()].filter(n=>n>1).reduce((s,n)=>s+n-1,0);
  const missingEvidenceSource=evidence.filter(e=>{const ids=e.documentIds??(e.documentId?[e.documentId]:[]);return ids.length===0||ids.some(id=>!docIds.has(id))}).length;
  const unreviewed=evidence.filter(e=>!REVIEWED_EVIDENCE.has(e.reviewStatus)).length;
  const assertionsMissing=issues.filter(i=>OPEN_ISSUES.has(i.status)&&!(i.assertions??[]).length).length;
  const requestCriteria=requests.filter(r=>OPEN_REQUESTS.has(r.status)&&!(r.acceptanceCriteria??[]).length).length;
  const unbalanced=adjustments.filter(unbalancedAdjustment).length;
  const duplicateObjects=[docs,evidence,issues,requests,adjustments,reports].reduce((s,rows)=>s+duplicateIds(rows).length,0);
  const unknownDocs=docs.filter(d=>!d.type||d.type==='unknown'||d.type==='unknown-document').length;
  const staleReports=reports.filter(r=>r.status==='stale'||r.stale===true).length;
  const missingMateriality=Boolean(analysis?.rows?.length&&!materiality);
  const checks=[
    {id:'duplicate-documents',label:'تكرار المستندات بالبصمة',count:duplicateDocs,level:duplicateDocs?'warn':'pass',weight:8,detail:duplicateDocs?'توجد نسخ متطابقة تحتاج مراجعة قبل الاعتماد.':'لا توجد بصمات مستندات مكررة.'},
    {id:'source-lineage',label:'مصدر الأدلة والتتبع',count:missingEvidenceSource,level:missingEvidenceSource?'fail':'pass',weight:18,detail:missingEvidenceSource?'أدلة بلا مستند مصدر صالح أو برابط مكسور.':'كل الأدلة تحمل رابط مصدر داخل الارتباط.'},
    {id:'review-state',label:'حالة مراجعة الأدلة',count:unreviewed,level:unreviewed?'warn':'pass',weight:10,detail:unreviewed?'هناك أدلة/Claims لم تُراجع بعد.':'كل الأدلة الحالية تمت مراجعتها.'},
    {id:'assertions',label:'Assertions القضايا المفتوحة',count:assertionsMissing,level:assertionsMissing?'warn':'pass',weight:10,detail:assertionsMissing?'قضايا مفتوحة بلا Assertions معلنة؛ لا تدخل نسبة التغطية.':'القضايا المفتوحة تحمل Assertions معلنة.'},
    {id:'acceptance-criteria',label:'معايير قبول الطلبات',count:requestCriteria,level:requestCriteria?'fail':'pass',weight:14,detail:requestCriteria?'طلبات مفتوحة بلا Acceptance Criteria.':'كل الطلبات المفتوحة لها معايير قبول.'},
    {id:'balanced-adjustments',label:'اتزان التسويات',count:unbalanced,level:unbalanced?'fail':'pass',weight:20,detail:unbalanced?'توجد تسوية لا يتساوى فيها المدين والدائن.':'كل التسويات المسجلة متزنة.'},
    {id:'duplicate-ids',label:'سلامة المعرّفات',count:duplicateObjects,level:duplicateObjects?'fail':'pass',weight:12,detail:duplicateObjects?'تم اكتشاف معرّفات مكررة.':'لا توجد معرّفات مكررة عبر السجلات الأساسية.'},
    {id:'document-type',label:'تصنيف المستندات',count:unknownDocs,level:unknownDocs?'warn':'pass',weight:4,detail:unknownDocs?'مستندات لم يُحسم نوعها بعد.':'كل المستندات الحالية مصنفة.'},
    {id:'materiality',label:'الأهمية النسبية',count:missingMateriality?1:0,level:missingMateriality?'fail':'pass',weight:16,detail:missingMateriality?'يوجد ميزان مراجعة بلا قرار أهمية نسبية.':'حالة الأهمية النسبية متسقة مع البيانات.'},
    {id:'stale-reports',label:'حداثة التقارير',count:staleReports,level:staleReports?'warn':'pass',weight:8,detail:staleReports?'توجد مسودة قديمة بعد تغير مصادرها.':'لا توجد تقارير موسومة كقديمة.'}
  ];
  const penalty=checks.reduce((s,c)=>s+(c.count?Math.min(c.weight,c.weight*Math.min(c.count,3)/3):0),0);return{score:Math.max(0,Math.round(100-penalty)),checks,counts:{duplicateDocs,missingEvidenceSource,unreviewed,assertionsMissing,requestCriteria,unbalanced,duplicateObjects,unknownDocs,staleReports}};
}

export function dashboardRecommendations(metrics,quality){
  const out=[];
  if(metrics.openRequests)out.push({kind:'urgent',title:'أغلق دورة طلبات الأدلة',text:`يوجد ${metrics.openRequests} طلبًا مفتوحًا. ابدأ بالأعلى أولوية ثم أعد جولة المجلس بعد الاستلام.`});
  if(metrics.highIssues)out.push({kind:'urgent',title:'ركّز على القضايا عالية الأثر',text:`هناك ${metrics.highIssues} قضية عالية/حرجة مفتوحة؛ إبقاؤها مفتوحة يخفض جاهزية التقرير.`});
  if(metrics.evidence&&metrics.evidenceReviewPercent<70)out.push({kind:'warn',title:'ارفع نسبة مراجعة الأدلة',text:`تمت مراجعة ${metrics.evidenceReviewPercent}% فقط من الأدلة الحالية. لا تعامل Claims غير المراجعة كدليل كافٍ.`});
  if(metrics.concentration.topShare>=50)out.push({kind:'warn',title:'اختبر تركّز الأرصدة',text:`أكبر 10 حسابات تمثل ${metrics.concentration.topShare.toFixed(1)}% من القيمة المطلقة للأرصدة. هذه إشارة KOSIF للتخطيط وليست حكمًا مهنيًا بذاتها.`});
  if(!metrics.councilRounds&&metrics.documents)out.push({kind:'',title:'اعقد الجولة الأولى',text:'المستندات موجودة لكن لا توجد جولة مجلس بعد. الجولة الأولى تحول النواقص إلى طلبات محكومة.'});
  if(quality.score<85)out.push({kind:'warn',title:'راجع مركز جودة البيانات',text:`درجة سلامة البيانات ${quality.score}/100. أصلح نقاط المصدر والتكرار والحقول الناقصة قبل الاعتماد على المخرجات.`});
  if(metrics.ready)out.push({kind:'',title:'الملف جاهز للبناء',text:'بوابات الجاهزية الحالية مستوفاة. ابنِ المسودة ثم مررها على المراجعة البشرية قبل الإصدار.'});
  if(!out.length)out.push({kind:'',title:'استمر في مسار الارتباط',text:'لا توجد إشارة تشغيلية حرجة من القواعد الحالية. استخدم «ماذا يحتاج الملف الآن؟» للخطوة التالية.'});
  return out.slice(0,6);
}

function pushIndex(out,kind,id,label,detail,workspace,searchText){out.push({kind,id:String(id??''),label:String(label??id??''),detail:String(detail??''),workspace,search:normalizeDashboardText([id,label,detail,searchText].filter(Boolean).join(' '))})}
export function buildSearchIndex(engagement={},analysis=null){
  const out=[];
  for(const d of engagement.documents??[])pushIndex(out,'document',d.id,d.name,d.type,'documents',`${d.sha256??''} ${d.analysisSummary??''}`);
  for(const e of engagement.evidence??[])pushIndex(out,'evidence',e.id,e.title,e.reviewStatus,'documents',`${(e.assertions??[]).join(' ')} ${(e.riskIds??[]).join(' ')}`);
  for(const i of engagement.issues??[])pushIndex(out,'issue',i.id,i.title,`${i.severity??''} · ${i.status??''}`,'issues',`${i.rationale??''} ${(i.assertions??[]).join(' ')} ${(i.standards??[]).join(' ')}`);
  for(const r of engagement.requests??[])pushIndex(out,'request',r.id,r.title,`${r.priority??''} · ${r.status??''}`,'documents',`${r.reason??''} ${(r.acceptanceCriteria??[]).join(' ')}`);
  for(const a of engagement.adjustments??[])pushIndex(out,'adjustment',a.id,a.title||'تسوية',a.status,'financials',`${a.rationale??''} ${a.issueId??''}`);
  for(const r of engagement.reports??[])pushIndex(out,'report',r.id,r.title||r.type||'تقرير',r.status,'report',`${r.type??''} ${r.sourceFingerprint??''}`);
  for(const r of engagement.councilRounds??[])pushIndex(out,'round',r.id||`R${r.number}`,`جولة المجلس R${r.number??''}`,r.status,'council',`${(r.issueIds??[]).join(' ')} ${(r.evidenceIds??[]).join(' ')}`);
  for(const t of engagement.workflowTasks??[])pushIndex(out,'task',t.id,t.title,`${t.priority??''} · ${t.status??''}`,'overview',`${t.linkedObjectId??''} ${t.owner??''}`);
  for(const c of engagement.contacts??[])pushIndex(out,'contact',c.id,c.name,c.role||'جهة متابعة','overview',`${c.phone??''} ${c.email??''}`);
  for(const row of analysis?.rows??[])pushIndex(out,'account',row.id??row.code,row.name??row.accountName??row.code,row.category??'حساب','financials',`${row.code??''} ${(row.standards??[]).join(' ')}`);
  return out;
}
export function searchWorkspace(query,index,limit=30){const q=normalizeDashboardText(query);if(!q)return index.slice(0,limit);const tokens=q.split(' ').filter(Boolean);return index.map(item=>({item,score:tokens.reduce((s,t)=>s+(item.search===t?20:item.search.startsWith(t)?8:item.search.includes(t)?3:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.item.label.localeCompare(b.item.label,'ar')).slice(0,limit).map(x=>x.item)}

export function diagnosticsSnapshot({engagement={},analysis=null,runtimeErrors=[],renderDurations=[],remote={}}={}){
  const latest=renderDurations.slice(-20),avg=latest.length?latest.reduce((s,n)=>s+n,0)/latest.length:0,max=latest.length?Math.max(...latest):0;
  return{runtimeErrors:runtimeErrors.length,events:(engagement.events??[]).length,documents:(engagement.documents??[]).length,accounts:analysis?.rows?.length??0,remoteMode:remote.mode??'local',remoteStatus:remote.status??'',averageRenderMs:Math.round(avg*10)/10,maxRenderMs:Math.round(max*10)/10,lastUpdated:engagement.updatedAt??null};
}
