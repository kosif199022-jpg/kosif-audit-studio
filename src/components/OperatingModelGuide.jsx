import { useState } from "react";
import { Route, X } from "lucide-react";
import "./operating-model.css";

const steps = [
  ["01", "استلام", "مستندات، كشوف، فواتير وميزان مراجعة"],
  ["02", "تحويل محاسبي", "حسابات، قيود، دفتر أستاذ وميزان"],
  ["03", "تحليل", "اتزان، أهمية نسبية، مخاطر ونسب"],
  ["04", "مراجعة", "أدلة، عينات، تحريفات ومجلس مراجعين"],
  ["05", "إصدار", "قوائم، إيضاحات، رأي وتقرير تتبعي"],
];

export function OperatingModelGuide() {
  const [open, setOpen] = useState(false);
  return <>
    <button className="kosif-model-trigger" type="button" onClick={() => setOpen(true)} aria-label="عرض طريقة عمل KOSIF">
      <Route size={16} /> طريقة عمل KOSIF
    </button>
    {open ? <div className="kosif-model-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="kosif-model-dialog" role="dialog" aria-modal="true" aria-labelledby="kosif-model-title">
        <header><div><span>OPERATING MODEL</span><h2 id="kosif-model-title">من المستند إلى التقرير</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="إغلاق"><X size={19} /></button></header>
        <p>كل مرحلة تنتج مخرجًا قابلًا للفحص. AI يشرح ويقترح، والمراجع البشري يعتمد.</p>
        <div className="kosif-model-steps">{steps.map(([number, title, detail]) => <article key={number}><b>{number}</b><strong>{title}</strong><small>{detail}</small></article>)}</div>
        <div className="kosif-model-rules"><span>✓ لا رقم بلا مصدر</span><span>✓ لا قيد غير متزن</span><span>✓ لا رأي بلا اعتماد بشري</span></div>
      </section>
    </div> : null}
  </>;
}
