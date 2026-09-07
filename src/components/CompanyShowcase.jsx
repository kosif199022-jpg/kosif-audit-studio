import { ArrowLeft, Building2, CheckCircle2, Landmark, Play, ShieldCheck } from "lucide-react";
import { getBenchmarkCompanies, getBenchmarkReport, runCompanyAnalysis } from "../report-benchmark.js";

const logos = {
  apple: "A",
  amazon: "AMZ",
  cisco: "CSCO",
  walmart: "WMT",
  adobe: "ADBE",
  jpmorgan: "JPM",
};

export function CompanyShowcase({ onOpenCompany }) {
  const companies = getBenchmarkCompanies().map((company) => {
    const report = getBenchmarkReport(company.reports[0].id);
    const analysis = runCompanyAnalysis(report.id);
    return { ...company, report, analysis };
  });

  return <section className="audit-company-showcase" aria-labelledby="audit-company-title">
    <header>
      <div><span className="audit-room-kicker"><Landmark size={15} /> معرض القدرات</span><h2 id="audit-company-title">شركات شغّل عليها المحرك فعلًا</h2><p>اختر شركة لتفتح أرقامها المنشورة، اختبارات إعادة الأداء، المعايير، ومخرجات التقرير — ويمكنك تشغيل AI على السياق نفسه.</p></div>
      <span className="audit-company-verified"><ShieldCheck size={16} /> 8 تقارير · 6 شركات</span>
    </header>
    <div className="audit-company-grid">
      {companies.map(({ id, entity, reports, report, analysis }) => <button type="button" key={id} onClick={() => onOpenCompany?.(report.id)}>
        <span className="audit-company-mark">{logos[id] || <Building2 size={20} />}</span>
        <span className="audit-company-copy"><strong>{entity}</strong><small>{reports.length} {reports.length === 1 ? "تقرير" : "تقريران"} · {report.year}</small></span>
        <span className="audit-company-result"><CheckCircle2 size={14} /><b>{analysis.totals.passed}/{analysis.totals.checks}</b><small>إعادة أداء</small></span>
        <ArrowLeft size={16} />
      </button>)}
    </div>
    <footer><Play size={15} /><span>كل نتيجة قابلة للتحدي: غيّر رقمًا، أعد التشغيل، وشاهد الاستثناء والسبب والمعيار.</span></footer>
  </section>;
}

export default CompanyShowcase;
