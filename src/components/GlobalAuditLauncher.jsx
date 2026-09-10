import { Suspense, lazy, useState } from "react";
import "../global-audit-launcher.css";

const GlobalAuditIntelligence = lazy(() => import("./GlobalAuditIntelligence.jsx").then((module) => ({ default: module.GlobalAuditIntelligence })));

export function GlobalAuditLauncher() {
  const [open, setOpen] = useState(false);
  return <>
    <button
      type="button"
      className="global-audit-launcher"
      aria-expanded={open}
      aria-controls="global-audit-intelligence"
      onClick={() => setOpen(true)}
      title="الذكاء العالمي للمراجعة"
    >
      <span aria-hidden="true">◎</span>
      <b>ذكاء المراجعة</b>
      <small>12,505 صفحة</small>
    </button>
    {open ? <Suspense fallback={<div className="global-audit-loading" role="status">جارٍ تجهيز أنماط المراجعة العالمية…</div>}><div id="global-audit-intelligence"><GlobalAuditIntelligence onClose={() => setOpen(false)} /></div></Suspense> : null}
  </>;
}
