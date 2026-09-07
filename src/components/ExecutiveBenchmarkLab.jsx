import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Download,
  FileSearch,
  Gauge,
  Globe2,
  LockKeyhole,
  Sparkles,
  Target,
} from "lucide-react";
import { downloadTextFile } from "../session-export.js";
import {
  BENCHMARK_DIMENSIONS,
  REFERENCE_PACKET,
  buildBenchmarkScore,
  buildLocalAiReview,
} from "../report-benchmark.js";
import "../benchmark-lab.css";

function scoreTone(score) {
  if (score >= 85) return "good";
  if (score >= 65) return "watch";
  return "risk";
}

function ScoreDial({ score }) {
  return (
    <div className={`benchmark-score-dial tone-${scoreTone(score)}`} style={{ "--dial-score": score }} aria-label={`درجة الجاهزية ${score} من 100`}>
      <div className="benchmark-score-dial-inner">
        <strong>{score}</strong>
        <span>/ 100</span>
      </div>
    </div>
  );
}

export function ExecutiveBenchmarkLab({ engagement, metrics, reportState, onView, onToast }) {
  const [aiReview, setAiReview] = useState(null);
  const score = useMemo(() => buildBenchmarkScore({ engagement, metrics, reportState }), [engagement, metrics, reportState]);
  const runLocalReview = () => {
    const next = buildLocalAiReview({ engagement, metrics, reportState });
    setAiReview(next);
    onToast?.("شُغّل تحليل AI المحلي من نفس حالة الارتباط دون إرسال بيانات إلى الخارج.");
  };
  const exportBrief = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      packet: REFERENCE_PACKET,
      score,
      aiReview: aiReview || buildLocalAiReview({ engagement, metrics, reportState }),
      guardrail: "عرض تجريبي استشاري؛ لا يمثل رأيًا مهنيًا موقعًا.",
    };
    downloadTextFile(JSON.stringify(payload, null, 2), "kosif-interview-benchmark.json", "application/json;charset=utf-8");
    onToast?.("تم تنزيل موجز المقارنة للعرض والمقابلة.");
  };
  return (
    <div className="view-stack benchmark-lab">
      <section className="benchmark-hero panel">
        <div className="benchmark-orbit" aria-hidden="true"><span /><span /><span /></div>
        <div className="benchmark-hero-copy">
          <span className="eyebrow"><Globe2 size={15} aria-hidden="true" /> Global report benchmark</span>
          <h1>مختبر التقارير العالمية</h1>
          <p>حوّل الحزمة المرفقة إلى سيناريو عرض حي: افهم بنية تقارير الشركات الكبرى، شغّل التحليل على شركة محمود الدسوقي، ثم أظهر النتيجة مع مصدرها وخطوتها التالية.</p>
          <div className="button-row">
            <button type="button" className="button button-dark" onClick={runLocalReview}><BrainCircuit size={17} aria-hidden="true" /> تشغيل AI محلي</button>
            <button type="button" className="button button-outline" onClick={exportBrief}><Download size={17} aria-hidden="true" /> تنزيل موجز العرض</button>
            <button type="button" className="button button-glass" onClick={() => onView?.("ai-connections")}><Sparkles size={17} aria-hidden="true" /> إضافة API خارجي <ArrowLeft size={15} aria-hidden="true" /></button>
          </div>
        </div>
        <div className="benchmark-hero-score">
          <ScoreDial score={score.total} />
          <strong>{score.label}</strong>
          <span>درجة تغطية تشغيلية مبنية على الجلسة الحالية</span>
        </div>
      </section>

      <section className="benchmark-stat-grid" aria-label="ملخص الحزمة والارتباط">
        <article className="benchmark-stat"><FileSearch size={20} aria-hidden="true" /><strong>{REFERENCE_PACKET.pageCount.toLocaleString("ar-SA-u-nu-latn")}</strong><span>صفحة في الحزمة</span></article>
        <article className="benchmark-stat"><Globe2 size={20} aria-hidden="true" /><strong>{REFERENCE_PACKET.reports.length}</strong><span>تقارير شركات مفهرسة</span></article>
        <article className="benchmark-stat"><Target size={20} aria-hidden="true" /><strong>{metrics.accountCount.toLocaleString("ar-SA-u-nu-latn")}</strong><span>حساب في سيناريو العرض</span></article>
        <article className="benchmark-stat"><Gauge size={20} aria-hidden="true" /><strong>{Math.round(metrics.mappingRate || 0)}%</strong><span>تغطية الربط المعياري</span></article>
      </section>

      <section className="panel benchmark-card" aria-labelledby="reference-packet-title">
        <div className="section-heading"><div><span className="eyebrow">Reference packet</span><h2 id="reference-packet-title">ما الذي تعلمه التطبيق من التقارير؟</h2><p>{REFERENCE_PACKET.note} جرى تحويل الأقسام المتكررة إلى فحوص قابلة للتشغيل بدل نسخ نصوص الشركات.</p></div><span className="benchmark-lock"><LockKeyhole size={15} aria-hidden="true" /> مصدر محلي مفهرس</span></div>
        <div className="reference-report-grid">
          {REFERENCE_PACKET.reports.map((report) => (
            <article className="reference-report" key={report.id}>
              <div className="reference-report-head"><span>{report.year}</span><strong>{report.entity}</strong></div>
              <small>{report.document} · {report.auditor}</small>
              <ul>{report.emphasis.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="panel benchmark-card" aria-labelledby="coverage-title">
        <div className="section-heading"><div><span className="eyebrow">Coverage map</span><h2 id="coverage-title">مقارنة قدرات KOSIF مع النمط العالمي</h2><p>الدرجات تقيس اكتمال المسار في هذه الجلسة، ولا تدّعي أن الأداة بديل عن شركة مراجعة أو توقيع مهني.</p></div></div>
        <div className="benchmark-dimension-list">
          {score.dimensions.map((item) => (
            <div className="benchmark-dimension" key={item.id}>
              <div className="benchmark-dimension-title"><strong>{item.label}</strong><span>{item.status}</span></div>
              <div className="benchmark-bar"><span style={{ width: `${item.score}%` }} /></div>
              <small>{item.reference} · <b>{item.score}/100</b></small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel benchmark-card benchmark-ai-card" aria-labelledby="benchmark-ai-title">
        <div className="section-heading"><div><span className="eyebrow">AI review loop</span><h2 id="benchmark-ai-title">التحليل الذكي القابل للتفسير</h2><p>ابدأ بالوضع المحلي للعرض الفوري، ثم أضف مفتاح API من شاشة الاتصالات عندما تريد رأيًا استشاريًا من نموذج خارجي.</p></div><BrainCircuit size={28} aria-hidden="true" /></div>
        {!aiReview ? <div className="benchmark-ai-empty"><Sparkles size={24} aria-hidden="true" /><p>اضغط «تشغيل AI محلي» لرؤية ملخص عربي، إشارات المخاطر، وأقسام التقرير التي ستُعرض على صاحب العمل.</p></div> : <div className="benchmark-ai-result"><div className="benchmark-ai-summary"><CheckCircle2 size={19} aria-hidden="true" /><strong>{aiReview.title}</strong><span>{aiReview.summary}</span></div><div className="benchmark-findings">{aiReview.findings.map((finding) => <article key={finding.title}><span className={`finding-severity severity-${finding.severity === "عالية" ? "high" : finding.severity === "متوسطة" ? "medium" : "low"}`}>{finding.severity}</span><strong>{finding.title}</strong><p>{finding.rationale}</p><small>الخطوة التالية: {finding.nextStep}</small></article>)}</div><p className="benchmark-guardrail"><LockKeyhole size={15} aria-hidden="true" /> {aiReview.guardrail}</p></div>}
      </section>

      <section className="benchmark-next panel">
        <div><span className="eyebrow">Demo path</span><h2>ثلاث دقائق لعرض التطبيق</h2><p>افتح «تجربة 500 حساب» أو «البيانات» لتبديل المصدر، ثم عد إلى المختبر وشغّل AI. عند الحاجة، انتقل إلى «اتصالات AI والمراجعين» لإضافة مفتاحك المشفر.</p></div>
        <div className="button-row"><button type="button" className="button button-outline" onClick={() => onView?.("demo500")}>فتح تجربة الحسابات <ArrowLeft size={16} aria-hidden="true" /></button><button type="button" className="button button-outline" onClick={() => onView?.("reports")}>فتح المخرجات <ArrowLeft size={16} aria-hidden="true" /></button></div>
      </section>
    </div>
  );
}

export { BENCHMARK_DIMENSIONS };
