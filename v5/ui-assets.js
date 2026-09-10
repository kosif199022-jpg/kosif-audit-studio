/** KOSIF V5 — single registry for optional UI styles loaded by the modular shell. */
export const V5_STYLE_ASSETS=Object.freeze([
  './freshness-specialists.css','./issue-workspace.css','./council-insights.css','./statement-comparison.css','./statement-lineage.css','./report-intake.css','./cash-flow-workspace.css','./equity-workspace.css','./disclosure-workspace.css','./report-publication.css','./trace-inspector.css','./workspace-navigation.css'
]);
export function ensureV5Styles(doc=globalThis.document){if(!doc?.head)return;for(const href of V5_STYLE_ASSETS){if(doc.querySelector(`link[href="${href}"]`))continue;const link=doc.createElement('link');link.rel='stylesheet';link.href=href;doc.head.append(link)}}
