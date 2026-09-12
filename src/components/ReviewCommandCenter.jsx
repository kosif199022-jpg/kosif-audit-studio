import React, { useMemo, useState } from "react";
import { Activity, ArrowLeft, BarChart3, BookOpenCheck, FileCheck2, Landmark, ShieldCheck, Sparkles, X } from "lucide-react";

const modules = [
  { icon: Landmark, title: "استيراد البنك", text: "تحويل كشوف البنك والعمليات إلى سجل قابل للتتبع", tone: "violet", value: "128" },
  { icon: BookOpenCheck, title: "ميزان المراجعة", text: "قيد مزدوج وأرصدة الحسابات مع تحقق التوازن", tone: "blue", value: "5,000" },
  { icon: ShieldCheck, title: "مخاطر المراجعة", text: "أولوية المخاطر وإجراءات الاختبار والأدلة", tone: "amber", value: "24" },
  { icon: FileCheck2, title: "قوالب التقارير", text: "قوائم مالية، رأي المراجع، KAM وخطاب الإدارة", tone: "green", value: "12" },
];

export function ReviewCommandCenter() {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState("استيراد البنك");
  const selected = useMemo(() => modules.find((item) => item.title === active) || modules[0], [active]);
  if (!open) return <button className="review-center-reopen" onClick={() => setOpen(true)}><Activity size={16}/> مركز المراجعة</button>;
  return (
    <aside className="review-center" dir="rtl" aria-label="مركز المراجعة الاحترافي">
      <div className="review-center-glow" />
      <header className="review-center-head">
        <div>
          <span className="review-center-kicker"><Sparkles size={13}/> KOSIF AUDIT STUDIO</span>
          <h2>مركز المراجعة</h2>
          <p>من المستند إلى التقرير — كل رقم له مصدر وكل حكم له دليل.</p>
        </div>
        <button className="review-center-close" onClick={() => setOpen(false)} aria-label="إغلاق"><X size={17}/></button>
      </header>
      <div className="review-center-status"><span className="status-dot"/> جلسة مراجعة نشطة <b>محمود الدسوقي</b><span className="status-lock">● آمن</span></div>
      <div className="review-center-grid">
        {modules.map(({ icon: Icon, title, text, tone, value }) => (
          <button key={title} className={`review-module review-module-${tone} ${active === title ? "is-active" : ""}`} onClick={() => setActive(title)}>
            <span className="review-module-icon"><Icon size={18}/></span>
            <span className="review-module-copy"><strong>{title}</strong><small>{text}</small></span>
            <b className="review-module-value">{value}</b>
          </button>
        ))}
      </div>
      <div className="review-center-detail">
        <div className="review-detail-title"><span><BarChart3 size={16}/> الخطوة الحالية</span><strong>{selected.title}</strong></div>
        <div className="review-progress"><i style={{ width: active === "استيراد البنك" ? "28%" : active === "ميزان المراجعة" ? "52%" : active === "مخاطر المراجعة" ? "74%" : "92%" }} /></div>
        <p>{selected.text}. انتقل بالملف إلى الخطوة التالية مع حفظ مصدر البيانات وسجل التغييرات.</p>
        <button className="review-next"><span>فتح مساحة العمل</span><ArrowLeft size={16}/></button>
      </div>
      <footer className="review-center-foot"><span><ShieldCheck size={14}/> اعتماد بشري مطلوب قبل إصدار الرأي</span><span>جولة 02 / 04</span></footer>
    </aside>
  );
}
