/** KOSIF V5 — optional feature styles, followed by the single editorial foundation. */
export const V5_STYLE_ASSETS=Object.freeze([
  './freshness-specialists.css','./issue-workspace.css','./council-insights.css','./statement-comparison.css','./statement-lineage.css','./report-intake.css','./cash-flow-workspace.css','./equity-workspace.css','./disclosure-workspace.css','./report-publication.css','./trace-inspector.css','./workspace-navigation.css','./dashboard-capabilities.css'
]);
export function ensureV5Styles(doc=globalThis.document){
  if(!doc?.head)return;
  for(const href of V5_STYLE_ASSETS){
    if(doc.querySelector(`link[href="${href}"]`))continue;
    const link=doc.createElement('link');link.rel='stylesheet';link.href=href;doc.head.append(link);
  }
  const href='./kosif-editorial-foundation.css';
  const foundation=doc.querySelector(`link[href="${href}"]`)||doc.createElement('link');
  foundation.rel='stylesheet';foundation.href=href;
  if(!foundation.parentNode)doc.head.append(foundation);else doc.head.append(foundation);
}