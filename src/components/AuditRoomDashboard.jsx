import React, { Suspense, lazy } from "react";
import { ArrowLeft, BrainCircuit, FileCheck2, FileUp, Flag, Layers3, Play, ShieldCheck } from "lucide-react";
import "../audit-room.css";

const stageMeta = [
  ["data-intake", "1", "رفع المستندات", "ميزان، دفتر أستاذ، عقود، ومرفقات"],
  ["council", "2", "تجهيز المجلس", "اختيار الأدوار والنموذج والمزوّد"],
  ["rounds", "3", "تشغيل الجولة", "رأي مستقل، أسئلة، وطلبات أدلة"],
  ["reports", "4", "إصدار التقرير", "معاينة وتصدير بعد الاعتماد"],
];

const CompanyShowcase = lazy(() => import("./CompanyShowcase.jsx").then((module) => ({ default: module.CompanyShowcase })));

export function AuditRoomDashboard({ room = {}, risks = [], evidence = [], metrics = {}, engagement = {}, reportState = {}, onView, onOpenCompany }) {
  const openRisks = risks.filter((risk) => risk.status !== "closed").length;
  const pendingEvidence = evidence.filter((item) => item.status !== "approved").length;
  const rounds = engagement.rounds || [];
  const go = (view) => onView?.(view);
  return <section className="audit-room-dashboard" dir="rtl" aria-labelledby="audit-room-title">
    <header className="audit-room-header">
      <div><span className="audit-room-kicker"><Layers3 size={15}/> غرفة العمل</span><h1 id="audit-room-title">المراجعة في مسار واحد</h1><p>ارفع مستنداتك، جهّز مجلس المراجعين، ثم دع الجولات تطلب الدليل وتوثّق الرأي بالمعيار.</p></div>
      <button className="button button-gold" type="button" onClick={() => go("data-intake")}><FileUp size={17}/> رفع أول مستند</button>
    </header>
    <div className="audit-room-stats" aria-label="ملخص الارتباط">
      <div><span>الحسابات</span><strong>{Number(metrics.accountCount || 0).toLocaleString("ar-SA-u-nu-latn")}</strong><small>{metrics.isBalanced ? "الميزان متوازن" : "يحتاج تفسيرًا"}</small></div>
      <div><span>أعضاء مجلس AI</span><strong>12</strong><small>{Number(engagement.council?.rounds?.length || 0).toLocaleString("ar-SA-u-nu-latn")} جولات مجلس محفوظة</small></div>
      <div><span>جولات المراجعة</span><strong>{rounds.length}</strong><small>{rounds.filter((r) => r.status === "complete").length} مكتملة</small></div>
      <div><span>الأدلة المفتوحة</span><strong>{pendingEvidence}</strong><small>{openRisks} مخاطر مفتوحة</small></div>
    </div>
    <div className="audit-room-flow" aria-label="مسار العمل">
      {stageMeta.map(([view, number, title, detail], index) => <React.Fragment key={view}><button type="button" className="audit-room-stage" onClick={() => go(view)}><b>{number}</b><span><strong>{title}</strong><small>{detail}</small></span><ArrowLeft size={16}/></button>{index < stageMeta.length - 1 ? <i aria-hidden="true"/> : null}</React.Fragment>)}
    </div>
    <div className="audit-room-columns">
      <article className="audit-room-panel"><header><span><BrainCircuit size={19}/></span><div><h2>مجلس AI</h2><p>كل عضو له شخصية واختصاص مستقل</p></div></header><ul><li><strong>المراجع الفني</strong><span>IFRS / IAS وربط المعالجة</span></li><li><strong>مراجع ISA</strong><span>الإجراء والدليل والنتيجة</span></li><li><strong>محلل الغش</strong><span>الإشارات والقيود غير المعتادة</span></li><li><strong>مراجع الجودة</strong><span>البوابات والتقرير والاعتماد</span></li></ul><button className="button button-outline" type="button" onClick={() => go("ai-connections")}><ShieldCheck size={16}/> تجهيز النموذج وAPI</button></article>
      <article className="audit-room-panel"><header><span><Flag size={19}/></span><div><h2>ما يحتاج انتباهًا</h2><p>تظهر هنا عناصر الجولة الحالية</p></div></header>{openRisks || pendingEvidence ? <ul>{risks.filter((r) => r.status !== "closed").slice(0, 3).map((r) => <li key={r.id}><strong>{r.title || r.description}</strong><span>{r.standard || "معيار يحتاج تحديدًا"}</span></li>)}{pendingEvidence ? <li><strong>{pendingEvidence} طلب دليل مفتوح</strong><span>افتح الأدلة ثم شغّل الجولة التالية</span></li> : null}</ul> : <div className="audit-room-empty"><FileCheck2 size={26}/><strong>لا توجد عناصر مفتوحة في سيناريو العرض</strong><span>يمكنك رفع مستندات شركتك لبدء ارتباط جديد.</span></div>}<button className="button button-outline" type="button" onClick={() => go(openRisks ? "risk" : "evidence")}><Play size={16}/> متابعة الجولة</button></article>
    </div>
    <Suspense fallback={<section className="audit-company-showcase" aria-busy="true"><header><div><span className="audit-room-kicker">معرض القدرات</span><h2>جارٍ تجهيز بيانات الشركات…</h2></div></header></section>}>
      <CompanyShowcase onOpenCompany={onOpenCompany} />
    </Suspense>
    <footer className="audit-room-note">{reportState.reportReady ? "التقرير محكوم وجاهز للمعاينة البشرية." : "التقرير يظل مسودة حتى تكتمل الأدلة والجولات والاعتماد البشري."} <button type="button" onClick={() => go("reports")}>فتح المخرجات</button></footer>
  </section>;
}
