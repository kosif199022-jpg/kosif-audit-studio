/** KOSIF V5 — deterministic source fingerprint for report freshness (not a security hash). */
const s=v=>v==null?'':typeof v==='bigint'?v.toString():String(v);
const list=v=>(v||[]).map(s).sort().join(',');
function row(prefix,id,...values){return `${prefix}:${s(id)}:${values.map(s).join(':')}`}
function fnv1a64(text=''){let h=0xcbf29ce484222325n;for(const ch of String(text)){h^=BigInt(ch.codePointAt(0));h=BigInt.asUintN(64,h*0x100000001b3n)}return h.toString(16).padStart(16,'0')}
export function reportSourceVector(engagement={}){
  const rows=[row('ENG',engagement.id,engagement.entity,engagement.period,engagement.framework,engagement.engagementType,engagement.currency)];
  for(const d of [...(engagement.documents||[])].sort((a,b)=>s(a.id).localeCompare(s(b.id))))rows.push(row('DOC',d.id,d.sha256,d.version,d.status,d.analysisStatus,d.type));
  for(const e of [...(engagement.evidence||[])].sort((a,b)=>s(a.id).localeCompare(s(b.id))))rows.push(row('EVD',e.id,e.reviewStatus,e.sourceType,list(e.documentIds),list(e.requestIds),list(e.issueIds)));
  for(const i of [...(engagement.issues||[])].sort((a,b)=>s(a.id).localeCompare(s(b.id))))rows.push(row('ISS',i.id,i.status,i.severity,list(i.evidenceIds),list(i.riskIds)));
  for(const r of [...(engagement.requests||[])].sort((a,b)=>s(a.id).localeCompare(s(b.id))))rows.push(row('REQ',r.id,r.status,r.priority,r.coverage,list(r.evidenceIds),list(r.roundIds)));
  for(const r of [...(engagement.councilRounds||[])].sort((a,b)=>s(a.id).localeCompare(s(b.id))))rows.push(row('RND',r.id,r.number,r.status,r.recordedAt,list(r.evidenceIds),list(r.issueIds)));
  for(const a of [...(engagement.adjustments||[])].sort((x,y)=>s(x.id).localeCompare(s(y.id))))rows.push(row('ADJ',a.id,a.status,a.version,a.debitMinor,a.creditMinor,a.decision?.decision,a.decision?.decidedAt));
  return rows.join('|');
}
export function reportSourceFingerprint(engagement={}){return fnv1a64(reportSourceVector(engagement))}
export function reportIsStale(report={},engagement={}){return Boolean(report.sourceFingerprint&&report.sourceFingerprint!==reportSourceFingerprint(engagement))}
