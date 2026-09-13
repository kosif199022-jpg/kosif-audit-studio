/** KOSIF V5 — pure workspace information architecture. */
export const WORKSPACE_VIEWS=Object.freeze([
  {id:'overview',label:'الآن',shortLabel:'الآن'},
  {id:'documents',label:'المستندات والأدلة',shortLabel:'المستندات'},
  {id:'issues',label:'القضايا',shortLabel:'القضايا'},
  {id:'council',label:'المجلس',shortLabel:'المجلس'},
  {id:'financials',label:'التسويات والقوائم',shortLabel:'القوائم'},
  {id:'report',label:'التقرير والإصدار',shortLabel:'التقرير'}
]);
const VALID=new Set(WORKSPACE_VIEWS.map(v=>v.id));
const ACTIVE_REQUESTS=new Set(['draft','requested','received','under-review','partial']);
const OPEN_ISSUES=new Set(['open','investigating','management-response','challenged']);
export function normalizeWorkspaceView(value='overview'){return VALID.has(value)?value:'overview'}
export function workspaceMetrics(engagement={}){const latest=engagement.councilRounds?.at(-1)||null;return{
  documents:(engagement.documents||[]).length,
  evidence:(engagement.evidence||[]).length,
  openRequests:(engagement.requests||[]).filter(r=>ACTIVE_REQUESTS.has(r.status)).length,
  openIssues:(engagement.issues||[]).filter(i=>OPEN_ISSUES.has(i.status)).length,
  highIssues:(engagement.issues||[]).filter(i=>OPEN_ISSUES.has(i.status)&&['critical','high'].includes(i.severity)).length,
  councilRounds:(engagement.councilRounds||[]).length,
  latestRound:latest?.number??null,
  pendingAdjustments:(engagement.adjustments||[]).filter(a=>['proposed','challenged','modified'].includes(a.status)).length,
  acceptedAdjustments:(engagement.adjustments||[]).filter(a=>a.status==='accepted').length,
  reports:(engagement.reports||[]).length,
  latestReportStatus:engagement.reports?.at(-1)?.status||null
}}
export function badgeForWorkspace(viewId,metrics={}){const map={documents:metrics.openRequests||metrics.documents||0,issues:metrics.highIssues||metrics.openIssues||0,council:metrics.latestRound?`R${metrics.latestRound}`:0,financials:metrics.pendingAdjustments||metrics.acceptedAdjustments||0,report:metrics.latestReportStatus==='issued'?'✓':metrics.reports||0};return map[viewId]??null}
export function workspaceViewFromHash(hash=''){const value=String(hash).replace(/^#\/?/,'').split(/[?&]/)[0];return normalizeWorkspaceView(value||'overview')}
