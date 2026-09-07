import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BrainCircuit, CheckCircle2, Download, FileCheck2, FileSearch, Globe2, Layers3, Play, RefreshCcw, Sparkles, Table2 } from "lucide-react";
import { downloadTextFile } from "../session-export.js";
import { createCompanyReportDocxBlob } from "../professional-docx.js";
import { BENCHMARK_DIMENSIONS, REFERENCE_PACKET, buildCompanyReportText, buildLocalAiReview, getBenchmarkCompanies, getBenchmarkReport, getBenchmarkReports, runCompanyAnalysis } from "../report-benchmark.js";
import "../benchmark-lab.css";

const format = value => Number(value || 0).toLocaleString("en-US");
const statusLabel = item => item.pass ? "مطابق" : "استثناء";
const statusClass = item => item.pass ? "is-pass" : "is-exception";

function ReportSelector({ report, onChange }) {
  const companies = getBenchmarkCompanies();
  return <div className="benchmark-selector-grid">
    <label><span>الشركة</span><select value={report.companyId} onChange={event => { const company = companies.find(item => item.id === event.target.value); onChange(getBenchmarkReport(company.reports[0].id)); }}><option value="">اختر الشركة</option>{companies.map(company => <option key={company.id} value={company.id}>{company.entity}</option>)}</select></label>
    <label><span>التقرير / الفترة</span><select value={report.id} onChange={event => onChange(getBenchmarkReport(event.target.value))}>{getBenchmarkReports().filter(item => item.companyId === report.companyId).map(item => <option key={item.id} value={item.id}>{item.year} · {item.period}</option>)}</select></label>
  </div>;
}

function Metric({ label, value, hint, tone = "" }) { return <article className={`benchmark-live-metric ${tone}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</article>; }

export function ExecutiveBenchmarkLab({ engagement, metrics, reportState, onView, onToast }) {
  const [selected, setSelected] = useState(() => getBenchmarkReport("apple-2024"));
  const [overrides, setOverrides] = useState({});
  const [analysis, setAnalysis] = useState(() => runCompanyAnalysis("apple-2024"));
  const [aiReview, setAiReview] = useState(null);
  const [batch, setBatch] = useState(null);
  const [expandedCheck, setExpandedCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const computed = useMemo(() => runCompanyAnalysis(selected.id, overrides), [selected.id, overrides]);
  const facts = Object.entries(selected.facts);

  function choose(report) { setSelected(report); setOverrides({}); setAnalysis(runCompanyAnalysis(report.id)); setAiReview(null); setBatch(null); }
  function runSelected() { setBusy(true); window.setTimeout(() => { setAnalysis(computed); setBusy(false); onToast?.(`اكتمل تشغيل ${selected.entity} مع ${computed.totals.checks} اختبارًا قابلاً لإعادة الأداء.`); }, 220); }
  function runAll() { setBusy(true); window.setTimeout(() => { const results = getBenchmarkReports().map(report => ({ report, analysis: runCompanyAnalysis(report.id) })); setBatch(results); setBusy(false); onToast?.(`اكتملت محاكاة جميع التقارير الثمانية؛ الفروقات ظاهرة لكل تقرير.`); }, 260); }
  function reviewLocal() { const next = buildLocalAiReview({ companyAnalysis: analysis }); setAiReview(next); onToast?.("شُغّل عقل التحليل المحلي على الأرقام المشتقة، دون إرسال بيانات خارجية."); }
  function exportReport() { downloadTextFile(buildCompanyReportText(analysis), `kosif-${analysis.report.id}-analytical-report.txt`, "text/plain;charset=utf-8"); onToast?.("تم تنزيل التقرير التحليلي القابل لإعادة الأداء."); }
  async function exportDocx() {
    setBusy(true);
    try {
      const blob = await createCompanyReportDocxBlob({ analysis });
      const href = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = href; anchor.download = `kosif-${analysis.report.id}-analytical-report.docx`; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000); onToast?.("تم تنزيل تقرير DOCX مهني مع مصفوفة الحسابات والمصادر والمعايير.");
    } catch { onToast?.("تعذر تجهيز ملف DOCX؛ أعد المحاولة بعد اكتمال التشغيل."); }
    finally { setBusy(false); }
  }
  function exportJson() { downloadTextFile(JSON.stringify({ packet: REFERENCE_PACKET.fileName, analysis }, null, 2), `kosif-${analysis.report.id}-reperformance.json`, "application/json;charset=utf-8"); }
  function challenge(key, value) { setOverrides(current => ({ ...current, [key]: value === "" ? undefined : Number(value) })); }

  return <div className="view-stack benchmark-lab">
    <section className="benchmark-hero panel">
      <div className="benchmark-orbit" aria-hidden="true"><span /><span /><span /></div>
      <div className="benchmark-hero-copy"><span className="eyebrow"><Globe2 size={15} aria-hidden="true" /> Executable report lab</span><h1>مختبر تشغيل التقارير</h1><p>التقارير المرفقة أصبحت قواعد إعادة أداء: اختر شركة، شغّل المعادلات على أرقامها المنشورة، راجع الفرق، ثم اربط النتيجة بالمعيار وسبب الحكم. هذا مسار عمل، وليس رفًّا للملفات.</p><div className="button-row"><button type="button" className="button button-dark" onClick={runSelected} disabled={busy}><Play size={16} aria-hidden="true" /> {busy ? "جارٍ التشغيل…" : "تشغيل التقرير المحدد"}</button><button type="button" className="button button-outline" onClick={runAll} disabled={busy}><Layers3 size={16} aria-hidden="true" /> تشغيل الشركات الثمانية</button><button type="button" className="button button-glass" onClick={() => onView?.("ai-connections")}><Sparkles size={16} aria-hidden="true" /> ربط AI وAPI <ArrowLeft size={15} aria-hidden="true" /></button></div></div>
      <div className="benchmark-hero-score"><div className="benchmark-live-ring"><strong>{analysis.totals.passRate}%</strong><span>مطابقة الحساب</span></div><b>{analysis.totals.exceptions ? `${analysis.totals.exceptions} استثناء` : "لا فروقات"}</b><small>النتيجة من تشغيل فعلي على القيم المنشورة</small></div>
    </section>

    <section className="panel benchmark-card benchmark-run-card" aria-labelledby="company-run-title"><div className="section-heading"><div><span className="eyebrow">1 · تشغيل شركة</span><h2 id="company-run-title">اختر المصدر والزمن</h2><p>القيم الحالية قابلة للتحدي؛ عدّل رقمًا ثم أعد التشغيل لترى كيف يتحول الاختلاف إلى استثناء موثق.</p></div><FileSearch size={25} aria-hidden="true" /></div><ReportSelector report={selected} onChange={choose} /><div className="benchmark-source-strip"><span><FileCheck2 size={15} aria-hidden="true" /> {selected.sources.income.statement}</span><span>الصفحة الفعلية {selected.sources.income.physicalPage} · المطبوعة {selected.sources.income.printedPage}</span><span>المراجع المنشور: {selected.auditor || REFERENCE_PACKET.reports.find(item => item.id === selected.id)?.auditor}</span></div></section>

    <section className="benchmark-live-metrics" aria-label="نتيجة التشغيل"><Metric label="اختبارات الحساب" value={`${analysis.totals.passed}/${analysis.totals.checks}`} hint="إعادة أداء مستقلة" tone="violet" /><Metric label="الاستثناءات" value={analysis.totals.exceptions} hint="تحتاج تفسيرًا أو دليلًا" tone={analysis.totals.exceptions ? "red" : "green"} /><Metric label="الإيراد / صافي الإيراد" value={format(selected.facts.sales?.current || selected.facts.revenue?.current || selected.facts.netRevenue?.current)} hint={`${selected.currency} millions`} /><Metric label="صافي الدخل" value={format(selected.facts.netIncome?.current)} hint={selected.type === "bank" ? "نموذج بنكي" : "قائمة الدخل"} /></section>

    <section className="panel benchmark-card" aria-labelledby="checks-title"><div className="section-heading"><div><span className="eyebrow">2 · المقارنة المنشورة</span><h2 id="checks-title">من الرقم المنشور إلى النتيجة</h2><p>كل صف يعرض القيمة التي حسبها المحرك، والقيمة المنشورة، والفرق، والمرجع والمعيار. افتح الصف لرؤية سبب الاختبار.</p></div><Table2 size={25} aria-hidden="true" /></div><div className="benchmark-check-table-wrap"><table className="benchmark-check-table"><thead><tr><th>الاختبار</th><th>محسوب</th><th>منشور</th><th>الفرق</th><th>الحالة</th><th>المصدر</th></tr></thead><tbody>{analysis.checks.map(item => <tr key={item.id} className={statusClass(item)} onClick={() => setExpandedCheck(expandedCheck === item.id ? null : item.id)}><td><strong>{item.label}</strong>{expandedCheck === item.id && <div className="benchmark-check-detail"><span><b>المعيار:</b> {item.standardId}</span><span><b>السبب:</b> {item.reason}</span></div>}</td><td>{format(item.computed)}</td><td>{format(item.reported)}</td><td className={item.delta ? "delta" : "zero"}>{format(item.delta)}</td><td><span className={`benchmark-result-pill ${statusClass(item)}`}>{item.pass ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}{statusLabel(item)}</span></td><td><small>ص {item.source.printedPage} · {item.source.label}</small></td></tr>)}</tbody></table></div></section>

    <section className="benchmark-two-col"><article className="panel benchmark-card"><div className="section-heading"><div><span className="eyebrow">3 · المقارنة الزمنية</span><h2>حركة الأرقام</h2></div><RefreshCcw size={23} aria-hidden="true" /></div><div className="benchmark-change-list">{analysis.changeRows.slice(0, 10).map(row => <div key={row.key}><span>{row.label}</span><b>{format(row.current)}</b><small>{row.change >= 0 ? "▲" : "▼"} {Math.abs(row.changePct)}% مقابل السابق</small></div>)}</div></article><article className="panel benchmark-card"><div className="section-heading"><div><span className="eyebrow">4 · ربط المعيار</span><h2>لماذا ظهرت النتيجة؟</h2></div><BrainCircuit size={23} aria-hidden="true" /></div><div className="benchmark-standard-list">{analysis.standards.map(item => <div key={item.standardId}><strong>{item.standardId}</strong><p>{item.rationale}</p><small>{item.title}</small></div>)}</div></article></section>

    <section className="panel benchmark-card benchmark-challenge-card"><div className="section-heading"><div><span className="eyebrow">5 · اختبار قابل للتحدي</span><h2>غيّر رقمًا ثم أعد التشغيل</h2><p>هذه أداة محاكاة داخلية: لا تعدّل التقرير المنشور، بل تنشئ سيناريو مستقلًا وتكشف هل تلتقطه قواعد التطبيق.</p></div><AlertTriangle size={24} aria-hidden="true" /></div><div className="benchmark-fact-grid">{facts.slice(0, 8).map(([key, item]) => <label key={key}><span>{item.label}</span><input type="number" value={overrides[key] ?? item.current} onChange={event => challenge(key, event.target.value)} /><small>المنشور: {format(item.current)} · السابق: {format(item.prior)}</small></label>)}</div><div className="button-row"><button type="button" className="button button-dark" onClick={runSelected}><RefreshCcw size={16} aria-hidden="true" /> إعادة تشغيل السيناريو</button><button type="button" className="button button-outline" onClick={() => { setOverrides({}); setAnalysis(runCompanyAnalysis(selected.id)); }}>إرجاع للقيم المنشورة</button></div></section>

    <section className="panel benchmark-card benchmark-report-card"><div className="section-heading"><div><span className="eyebrow">6 · التقرير الناتج</span><h2>تقرير تحليلي قابل للتسليم</h2><p>التقرير يعرض الأعمال التي أداها المحرك، الفروقات، مصادر الأرقام، المعايير، والأسئلة المفتوحة. لا يختلق رأيًا موقعًا.</p></div><Download size={25} aria-hidden="true" /></div><div className="benchmark-report-preview"><header><strong>{analysis.report.entity}</strong><span>{analysis.report.period}</span></header><p>{analysis.reportBlueprint?.model || "تحليل KOSIF قابل لإعادة الأداء"}</p><div className="benchmark-report-summary"><span>الاختبارات <b>{analysis.totals.checks}</b></span><span>المطابق <b>{analysis.totals.passed}</b></span><span>الاستثناءات <b>{analysis.totals.exceptions}</b></span><span>مصادر الصفحات <b>{new Set(analysis.checks.map(item => item.source.physicalPage)).size}</b></span></div><ul>{analysis.findings.slice(0, 4).map(item => <li key={item.id}><b>{item.severity}</b> {item.title} — {item.rationale}</li>)}</ul></div><div className="button-row"><button type="button" className="button button-dark" onClick={exportDocx} disabled={busy}><Download size={16} aria-hidden="true" /> تنزيل DOCX مهني</button><button type="button" className="button button-outline" onClick={exportReport}>تنزيل التقرير النصي</button><button type="button" className="button button-outline" onClick={exportJson}>تنزيل سجل إعادة الأداء JSON</button><button type="button" className="button button-glass" onClick={reviewLocal}><BrainCircuit size={16} aria-hidden="true" /> تشغيل AI على التقرير</button></div>{aiReview && <div className="benchmark-ai-result"><strong>{aiReview.title}</strong><p>{aiReview.summary}</p>{aiReview.findings.map(item => <div key={item.id}><span>{item.severity}</span><b>{item.title}</b><p>{item.rationale} السبب: {item.reason}</p><small>المعيار: {item.standardId} · الإجراء: {item.nextStep}</small></div>)}<small>{aiReview.guardrail}</small></div>}</section>

    {batch && <section className="panel benchmark-card" aria-labelledby="batch-title"><div className="section-heading"><div><span className="eyebrow">7 · محاكاة شاملة</span><h2 id="batch-title">نتائج التقارير الثمانية</h2><p>كل تقرير شُغّل بمحركه نفسه مع اختلاف قواعد القطاع؛ لا توجد درجة جاهزية تخمينية.</p></div><Layers3 size={24} aria-hidden="true" /></div><div className="benchmark-batch-grid">{batch.map(({ report, analysis: item }) => <button type="button" key={report.id} className={`benchmark-batch-row ${item.totals.exceptions ? "has-exception" : "all-pass"}`} onClick={() => choose(report)}><span><b>{report.entity}</b><small>{report.year} · {report.type === "bank" ? "قطاع بنكي" : "شركة تشغيلية"}</small></span><strong>{item.totals.passed}/{item.totals.checks}</strong><em>{item.totals.exceptions ? `${item.totals.exceptions} استثناء` : "مطابق"}</em></button>)}</div></section>}

    <section className="benchmark-next panel"><div><span className="eyebrow">AI + evidence</span><h2>الخطوة التالية: ربط دفتر الشركة الحقيقي</h2><p>استخدم هذه الأرقام لتوضيح المنهجية، ثم افتح الاتصالات لإضافة API. النموذج الخارجي يحصل على ملخص مشتق، بينما تبقى الأرقام والأدلة والتوقيع داخل ملف الارتباط.</p></div><div className="button-row"><button type="button" className="button button-outline" onClick={() => onView?.("ai-connections")}>إعداد API <ArrowLeft size={16} aria-hidden="true" /></button><button type="button" className="button button-outline" onClick={() => onView?.("reports")}>فتح المخرجات <ArrowLeft size={16} aria-hidden="true" /></button></div></section>
  </div>;
}

export { BENCHMARK_DIMENSIONS };
