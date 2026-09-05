import { generateTrialBalance, createCompleteDemoEngagement } from './data.js';
import { buildDatasetCommitment, buildRiskSample, buildCouncilSnapshot } from './governance.js';
import { buildMappingMetrics } from './standards.js';
import { buildMateriality, absBig } from './audit-core.js';
import { buildAnalyticalReview } from './analytics.js';
import { buildAdjustmentBridge, buildReportState } from './reporting.js';
import { auditRoundBlueprints } from './audit-rounds.js';

export function demoMetrics(accounts, engagement) {
 const debit=accounts.reduce((s,a)=>s+BigInt(a.debitMinor),0n), credit=accounts.reduce((s,a)=>s+BigInt(a.creditMinor),0n);
 const revenue=accounts.filter(a=>a.category==='revenue').reduce((s,a)=>s+BigInt(a.creditMinor)-BigInt(a.debitMinor),0n);
 const policy=engagement.materialityPolicy;
 const materiality=buildMateriality({benchmarkMinor:String(absBig(revenue)),omRateBp:policy.omRateBp,pmRateBp:policy.pmRateBp,cttRateBp:policy.cttRateBp,rationaleAr:policy.rationaleAr});
 const mapping=buildMappingMetrics(accounts,engagement.standardMappings);
 const commitment=buildDatasetCommitment(accounts,{period:engagement.entity.period,currency:'SAR',committedAt:engagement.demo.commitment.committedAt});
 return {accountCount:accounts.length,totalDebit:Number(debit)/100,totalCredit:Number(credit)/100,totalDebitMinor:String(debit),totalCreditMinor:String(credit),revenue:Number(revenue)/100,isBalanced:debit===credit,balanceDifference:Number(absBig(debit-credit))/100,materiality:Number(materiality.omMinor)/100,materialityMinor:materiality.omMinor,performanceMateriality:Number(materiality.pmMinor)/100,performanceMaterialityMinor:materiality.pmMinor,clearlyTrivialMinor:materiality.cttMinor,omRateBp:policy.omRateBp,pmRateBp:policy.pmRateBp,cttRateBp:policy.cttRateBp,unmapped:mapping.unresolved,mappingRate:mapping.mappingRate,mappingReviewed:mapping.reviewed,mappingSuggested:mapping.suggested,datasetId:commitment.datasetId,datasetDigest:commitment.sha256,datasetPeriod:commitment.period,datasetCurrency:commitment.currency,datasetCommittedAt:commitment.committedAt};
}
export function createDemo500() {
 const accounts=generateTrialBalance(500);
 const engagement=createCompleteDemoEngagement(accounts);
 const metrics=demoMetrics(accounts,engagement);
 const bridge=buildAdjustmentBridge(accounts,engagement.adjustments);
 const analysis=buildAnalyticalReview(bridge.adjustedAccounts);
 const report=buildReportState(engagement,metrics);
 const rounds=auditRoundBlueprints.map(b=>{
  const population=accounts.filter(a=>b.categoryKeys.includes(a.category));
  const sample=buildRiskSample(population,Math.min(8,population.length));
  const debitMinor=population.reduce((s,a)=>s+BigInt(a.debitMinor),0n),creditMinor=population.reduce((s,a)=>s+BigInt(a.creditMinor),0n);
  return {...b,population:population.length,debitMinor:String(debitMinor),creditMinor:String(creditMinor),highRisk:population.filter(a=>a.risk==='high').length,sampleIds:sample.map(a=>a.id),evidence:engagement.evidence.find(e=>e.roundId===b.id),finding:engagement.findings.find(f=>f.roundId===b.id),conclusion:engagement.rounds.find(r=>r.id===b.id)?.conclusion,mode:'synthetic-training',datasetDigest:metrics.datasetDigest};
 });
 return {accounts,engagement,metrics,analysis,bridge,report,rounds,council:buildCouncilSnapshot(bridge.adjustedAccounts,engagement,metrics),dataProfile:{source:'demo',label:'تجربة 500 حساب · محاكاة تدريبية',rowCount:500,status:'complete',...engagement.demo.commitment}};
}
export function demo500ReportText(d) {
 return ['KOSIF — تقرير تجربة 500 حساب','محاكاة تدريبية ببيانات وأدلة وقرارات اصطناعية؛ ليست مراجعة منشأة فعلية.',`بصمة المجتمع: ${d.metrics.datasetDigest}`,`الحسابات: ${d.accounts.length} | الجولات: ${d.rounds.length} | البوابات: ${d.report.passedGates}/${d.report.gates.length}`,`إجمالي المدين بالهللة: ${d.metrics.totalDebitMinor}`,`إجمالي الدائن بالهللة: ${d.metrics.totalCreditMinor}`,`الأهمية النسبية بالهللة: ${d.metrics.materialityMinor}`,...d.rounds.flatMap(r=>['',`${r.id} — ${r.title}`,`المعايير: ${r.standards.join('، ')}`,`المجتمع المرتبط: ${r.population} حسابًا | العينة: ${r.sampleIds.length} | إشارات مرتفعة: ${r.highRisk}`,`العينة: ${r.sampleIds.join(', ')}`,`الإجراء: ${r.action}`,`الدليل الاصطناعي: ${r.evidence.id} | SHA-256: ${r.evidence.hash}`,`النتيجة التدريبية: ${r.finding.title}`,`الاستنتاج: ${r.conclusion}`]),'',...d.report.gates.map(g=>`${g.pass?'مكتمل':'ناقص'}: ${g.label}`)].join('\n');
}
