/** KOSIF V5 — single registry for optional UI styles loaded by the modular shell. */
export const V5_STYLE_ASSETS=Object.freeze([
  './freshness-specialists.css','./issue-workspace.css','./council-insights.css','./statement-comparison.css','./statement-lineage.css','./report-intake.css','./cash-flow-workspace.css','./equity-workspace.css','./disclosure-workspace.css','./report-publication.css','./trace-inspector.css','./workspace-navigation.css',
  './dashboard-capabilities.css','./dashboard-theme.css'
]);
export function ensureV5Styles(doc=globalThis.document){if(!doc?.head)return;let theme=null;for(const href of V5_STYLE_ASSETS){const existing=doc.querySelector(`link[href="${href}"]`);if(existing){if(href==='./dashboard-theme.css')theme=existing;continue}const link=doc.createElement('link');link.rel='stylesheet';link.href=href;doc.head.append(link);if(href==='./dashboard-theme.css')theme=link}if(theme)doc.head.append(theme)}
