/** KOSIF V5 — single registry for optional UI styles loaded by the modular shell. */
export const V5_STYLE_ASSETS=Object.freeze([
  './freshness-specialists.css','./issue-workspace.css','./council-insights.css','./statement-comparison.css','./statement-lineage.css','./report-intake.css','./cash-flow-workspace.css','./equity-workspace.css','./disclosure-workspace.css','./report-publication.css','./trace-inspector.css','./workspace-navigation.css','./kosif-assistant.css','./document-intelligence.css',
  './dashboard-capabilities.css','./dashboard-navigation-theme.css','./dashboard-theme.css','./kosif-heritage-v5.css'
]);
/** طبقات الهوية تُرسم دائمًا في النهاية وبهذا الترتيب: اللوحة الأساس ثم هوية KOSIF، مهما تغيّر ترتيب بقية الأصول. */
export const V5_THEME_ASSETS=Object.freeze(['./dashboard-theme.css','./kosif-heritage-v5.css']);
/** إضافة ورقة أنماط واحدة مع إعادة تثبيت ترتيب طبقات الهوية في الذيل. */
export function ensureStyleAsset(href,doc=globalThis.document){
  if(!doc?.head)return null;
  let link=doc.querySelector(`link[href="${href}"]`);
  if(!link){link=doc.createElement('link');link.rel='stylesheet';link.href=href;doc.head.append(link)}
  pinThemeOrder(doc);
  return link;
}
export function pinThemeOrder(doc=globalThis.document){
  if(!doc?.head)return;
  for(const href of V5_THEME_ASSETS){const theme=doc.querySelector(`link[href="${href}"]`);if(theme)doc.head.append(theme)}
}
export function ensureV5Styles(doc=globalThis.document){
  if(!doc?.head)return;
  for(const href of V5_STYLE_ASSETS)ensureStyleAsset(href,doc);
  pinThemeOrder(doc);
}
