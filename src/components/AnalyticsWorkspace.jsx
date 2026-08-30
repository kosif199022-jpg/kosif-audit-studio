import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Landmark,
  Percent,
  Scale,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { buildAnalyticalReview, buildRoundRiskTrend } from "../analytics.js";
import { formatMinorUnits } from "../audit-core.js";
import "../capabilities.css";

const severityLabels = { high: "مرتفع", medium: "متوسط", low: "منخفض" };

const safeNumber = (formatter, value) => (typeof formatter === "function"
  ? formatter(value)
  : new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 2 }).format(Number(value || 0)));

const safeCurrency = (formatter, value) => (typeof formatter === "function"
  ? formatter(value)
  : new Intl.NumberFormat("ar-SA-u-nu-latn", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0)));

const localDateTime = (value) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
};

export function AnalyticsWorkspace({
  accounts = [],
  engagement = {},
  setEngagement,
  formatCurrency,
  formatNumber,
  onToast,
}) {
  const analysis = useMemo(() => buildAnalyticalReview(accounts), [accounts]);
  const roundRiskTrend = useMemo(
    () => buildRoundRiskTrend(engagement.rounds || [], engagement.findings || []),
    [engagement.findings, engagement.rounds],
  );
  const currentReview = engagement.analyticsReview || {};
  const [reviewer, setReviewer] = useState(currentReview.reviewer || "مدير المراجعة");
  const [conclusion, setConclusion] = useState(currentReview.conclusion || "تمت مراجعة المؤشرات وتحديد الفروق التي تتطلب إجراءات إضافية.");

  useEffect(() => {
    if (currentReview.reviewer) setReviewer(currentReview.reviewer);
    if (currentReview.conclusion) setConclusion(currentReview.conclusion);
  }, [currentReview.reviewer, currentReview.conclusion]);

  const equityIsPositive = BigInt(analysis.ratioInputsMinor.equity || "0") > 0n;
  const ratioCards = [
    { id: "current", label: "نسبة التداول", value: `${analysis.ratios.currentRatio.toFixed(2)}×`, helper: "الأصول المتداولة ÷ الالتزامات المتداولة", icon: Gauge, tone: analysis.ratios.currentRatio < 1 ? "red" : "teal" },
    { id: "quick", label: "السيولة السريعة", value: `${analysis.ratios.quickRatio.toFixed(2)}×`, helper: "النقد والذمم ÷ الالتزامات المتداولة", icon: Landmark, tone: analysis.ratios.quickRatio < 1 ? "red" : "blue" },
    { id: "leverage", label: "الدين إلى حقوق الملكية", value: equityIsPositive ? `${analysis.ratios.debtToEquity.toFixed(2)}×` : "غير قابل للتفسير", helper: equityIsPositive ? "التمويل والتزامات الإيجار ÷ حقوق الملكية بعد نتيجة الفترة" : "حقوق الملكية بعد نتيجة الفترة غير موجبة", icon: Scale, tone: !equityIsPositive || analysis.ratios.debtToEquity > 2 ? "red" : "gold" },
    { id: "gross", label: "هامش الربح الإجمالي", value: `${analysis.ratios.grossMarginPct.toFixed(1)}%`, helper: "الإيراد بعد تكلفة المبيعات", icon: Percent, tone: analysis.ratios.grossMarginPct < 0 ? "red" : "green" },
    { id: "operating", label: "هامش التشغيل", value: `${analysis.ratios.operatingMarginPct.toFixed(1)}%`, helper: "بعد تكلفة الإيرادات والمصروفات التشغيلية فقط", icon: BarChart3, tone: analysis.ratios.operatingMarginPct < 0 ? "red" : "teal" },
    { id: "net-before-tax", label: "الهامش قبل الضريبة", value: `${analysis.ratios.netMarginBeforeTaxPct.toFixed(1)}%`, helper: "يشمل الإيرادات الأخرى وتكاليف التمويل", icon: Percent, tone: analysis.ratios.netMarginBeforeTaxPct < 0 ? "red" : "green" },
    { id: "cash", label: "نسبة النقد", value: `${analysis.ratios.cashRatio.toFixed(2)}×`, helper: "النقد ÷ الالتزامات المتداولة", icon: Landmark, tone: analysis.ratios.cashRatio < 0.5 ? "red" : "blue" },
    { id: "debt-assets", label: "الدين إلى الأصول", value: `${analysis.ratios.debtToAssetsPct.toFixed(1)}%`, helper: "على أرصدة الإقفال، لا متوسط الفترة", icon: Scale, tone: analysis.ratios.debtToAssetsPct > 60 ? "red" : "gold" },
    { id: "equity-assets", label: "حقوق الملكية إلى الأصول", value: `${analysis.ratios.equityToAssetsPct.toFixed(1)}%`, helper: "على أرصدة الإقفال", icon: Gauge, tone: analysis.ratios.equityToAssetsPct < 20 ? "red" : "teal" },
    { id: "interest", label: "تغطية تكاليف التمويل", value: `${analysis.ratios.interestCoverage.toFixed(2)}×`, helper: "الربح التشغيلي التقريبي ÷ تكاليف التمويل", icon: BarChart3, tone: analysis.ratios.interestCoverage < 1.5 ? "red" : "green" },
    { id: "receivables-days", label: "أيام الذمم عند الإقفال", value: `${analysis.ratios.receivablesDaysClosing.toFixed(1)} يوم`, helper: "رصيد الإقفال ÷ إيرادات العقود × 365", icon: Gauge, tone: analysis.ratios.receivablesDaysClosing > 120 ? "red" : "blue" },
    { id: "inventory-days", label: "أيام المخزون عند الإقفال", value: `${analysis.ratios.inventoryDaysClosing.toFixed(1)} يوم`, helper: "رصيد الإقفال ÷ تكلفة الإيرادات × 365", icon: Landmark, tone: analysis.ratios.inventoryDaysClosing > 180 ? "red" : "gold" },
  ];

  const maxAreaExposure = Math.max(1, ...analysis.areas.map((area) => area.exposure));
  const maxRiskCount = Math.max(1, ...analysis.riskDistribution.map(({ count }) => count));
  const maxBalanceMinor = analysis.largestBalances.reduce((largest, item) => {
    const amount = BigInt(item.amountMinor);
    return amount > largest ? amount : largest;
  }, 1n);
  const visibleRoundTrend = roundRiskTrend.slice(-12);
  const maxRoundRisk = Math.max(1, ...visibleRoundTrend.map(({ weightedScore }) => weightedScore));
  const notify = (message) => {
    if (typeof onToast === "function") onToast(message);
  };

  const acknowledge = () => {
    if (!reviewer.trim() || !conclusion.trim()) {
      notify("أدخل اسم المراجع وخلاصة المراجعة قبل تسجيل الإقرار.");
      return;
    }
    const acknowledgedAt = new Date().toISOString();
    const reviewedSignals = [
      ...analysis.benford.filter((item) => item.flagged).map((item) => `BENFORD-${item.digit}`),
      ...(analysis.ratios.operatingMarginPct < 0 ? ["OPERATING-MARGIN-NEGATIVE"] : []),
    ];
    if (typeof setEngagement === "function") {
      setEngagement((current) => ({
        ...current,
        humanApproval: false,
        humanApprovedAt: null,
        analyticsReview: {
          acknowledged: true,
          acknowledgedAt,
          reviewer: reviewer.trim(),
          conclusion: conclusion.trim(),
          reviewedSignals,
          engine: "KOSIF-ANALYTICS-v1",
          snapshot: {
            accountCount: accounts.length,
            totalExposure: analysis.totalExposure,
            highRiskExposurePct: analysis.highRiskExposurePct,
            benfordFlags: analysis.benfordFlags,
            benfordFlagDigits: analysis.benford.filter((item) => item.flagged).map((item) => item.digit),
            ratios: analysis.ratios,
          },
        },
      }));
    }
    notify("تم تسجيل إقرار المراجع على لقطة التحليل الحالية.");
  };

  const revokeAcknowledgment = () => {
    if (typeof setEngagement === "function") {
      setEngagement((current) => ({
        ...current,
        humanApproval: false,
        humanApprovedAt: null,
        analyticsReview: {
          ...current.analyticsReview,
          acknowledged: false,
          acknowledgedAt: null,
          revokedAt: new Date().toISOString(),
        },
      }));
    }
    notify("أُلغي الإقرار؛ بقيت بيانات المراجع محفوظة لإعادة الفحص.");
  };

  return (
    <div className="view-stack capabilities-view" dir="rtl">
      <section className="panel page-intro cap-intro" aria-labelledby="analytics-title">
        <div className="cap-intro-copy">
          <span className="eyebrow">تحليل مالي مرتبط بالميزان</span>
          <h2 id="analytics-title">مساحة الإجراءات التحليلية</h2>
          <p>نسب مالية، تركّز أرصدة، تحليل بنفورد وتعرض حسب المجال؛ مؤشرات لتوجيه الاختبارات وليست استنتاجًا آليًا بوجود خطأ أو غش.</p>
        </div>
        <div className={`cap-intro-status ${analysis.benfordFlags ? "is-warning" : ""}`} aria-label="إشارات بنفورد">
          <BarChart3 size={24} aria-hidden="true" />
          <span><bdi dir="ltr">{safeNumber(formatNumber, analysis.benfordFlags)}</bdi><small>إشارات رقمية</small></span>
        </div>
      </section>

      <section className="cap-ratio-grid" aria-label="النسب المالية الرئيسة">
        {ratioCards.map(({ id, label, value, helper, icon: Icon, tone }) => (
          <article key={id} className={`cap-ratio-card tone-${tone}`}>
            <span className="cap-ratio-icon"><Icon size={20} aria-hidden="true" /></span>
            <div><small>{label}</small><strong dir="auto">{value}</strong><p>{helper}</p></div>
          </article>
        ))}
      </section>

      <section className="cap-analytics-strip" aria-label="مؤشرات التعرض">
        <div><span>إجمالي التعرض</span><strong dir="ltr">{safeCurrency(formatCurrency, analysis.totalExposure)}</strong></div>
        <div><span>تعرض عالي المخاطر</span><strong dir="ltr">{safeCurrency(formatCurrency, analysis.highRiskExposure)}</strong><small>{analysis.highRiskExposurePct.toFixed(2)}%</small></div>
        <div><span>تركيز أعلى 10 حسابات</span><strong dir="ltr">{analysis.topTenExposurePct.toFixed(2)}%</strong></div>
        <div><span>الحسابات المحللة</span><strong>{safeNumber(formatNumber, accounts.length)}</strong></div>
      </section>

      <section className="cap-diagnostic-grid" aria-label="رسوم تشخيصية حتمية">
        <article className="panel cap-diagnostic-card">
          <div className="cap-section-head"><div><span className="eyebrow">Risk mix</span><h3>توزيع مستوى المخاطر</h3><p>عدد الحسابات حسب التقييم المسجل.</p></div></div>
          <div className="cap-risk-chart">{analysis.riskDistribution.map((item) => <div key={item.risk}><span>{severityLabels[item.risk]}</span><div aria-label={`${severityLabels[item.risk]} ${item.count}`}><b style={{ width: `${(item.count / maxRiskCount) * 100}%` }} /></div><strong>{safeNumber(formatNumber, item.count)}</strong></div>)}</div>
        </article>
        <article className="panel cap-diagnostic-card">
          <div className="cap-section-head"><div><span className="eyebrow">Closing balances</span><h3>أكبر الأرصدة</h3><p>ترتيب حتمي بالقيمة في الوحدات الصغرى.</p></div></div>
          <ol className="cap-balance-chart">{analysis.largestBalances.map((item) => <li key={item.id}><span><bdi dir="ltr">{item.code}</bdi><small>{item.name}</small></span><div aria-label={`${item.code} ${formatMinorUnits(item.amountMinor)}`}><b style={{ width: `${Number((BigInt(item.amountMinor) * 10_000n) / maxBalanceMinor) / 100}%` }} /></div><strong dir="ltr">{formatMinorUnits(item.amountMinor)}</strong></li>)}</ol>
        </article>
        <article className="panel cap-diagnostic-card">
          <div className="cap-section-head"><div><span className="eyebrow">Audit rounds</span><h3>اتجاه مخاطر الجولات</h3><p>وزن النتائج: مرتفع 3، متوسط 2، منخفض 1.</p></div></div>
          <div className="cap-round-chart" role="img" aria-label="اتجاه درجة مخاطر آخر اثنتي عشرة جولة">{visibleRoundTrend.map((item) => <div key={item.id} title={`${item.label}: ${item.weightedScore}`}><b style={{ height: `${Math.max(8, (item.weightedScore / maxRoundRisk) * 100)}%` }} /><span dir="ltr">{item.id.replace("R-", "")}</span></div>)}</div>
        </article>
      </section>

      <section className="panel" aria-labelledby="analytics-insights-title">
        <div className="cap-section-head">
          <div><span className="eyebrow">نقاط تستحق الفحص</span><h3 id="analytics-insights-title">قراءة المؤشرات</h3><p>يربط كل مؤشر بإطار محاسبي وإجراء مراجعة مناسب.</p></div>
        </div>
        <div className="cap-insight-grid">
          {analysis.insights.map((insight) => (
            <article key={insight.id} className={`cap-insight severity-${insight.severity}`}>
              <span className="cap-insight-icon">{insight.severity === "high" ? <ShieldAlert size={20} /> : insight.severity === "medium" ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}</span>
              <div><span className="cap-severity">{severityLabels[insight.severity]}</span><h4>{insight.title}</h4><p>{insight.detail}</p><footer><bdi dir="ltr">{insight.standard}</bdi><bdi dir="ltr">{insight.auditStandard}</bdi></footer></div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel cap-table-panel" aria-labelledby="area-exposure-title">
        <div className="cap-section-head">
          <div><span className="eyebrow">حسب بند القوائم</span><h3 id="area-exposure-title">التعرض والمخاطر حسب المجال</h3><p>القيمة تمثل مجموع القيم المطلقة للحسابات داخل المجال، وليست رصيد قائمة مالية صافيًا.</p></div>
        </div>
        <div className="cap-table-scroll" tabIndex="0" aria-label="جدول التعرض حسب المجال">
          <table className="cap-data-table">
            <thead><tr><th>المجال</th><th>الحسابات</th><th>التعرض</th><th>عالي المخاطر</th><th>المعايير</th><th>الحصة النسبية</th></tr></thead>
            <tbody>
              {analysis.areas.map((area) => {
                const relativeWidth = Math.max(1, (area.exposure / maxAreaExposure) * 100);
                return (
                  <tr key={area.key}>
                    <td><strong>{area.label}</strong></td>
                    <td>{safeNumber(formatNumber, area.accountCount)}</td>
                    <td className="numeric">{safeCurrency(formatCurrency, area.exposure)}</td>
                    <td><span className={area.high ? "cap-risk-count has-risk" : "cap-risk-count"}>{safeNumber(formatNumber, area.high)}</span></td>
                    <td><div className="cap-inline-tags">{area.standards.map((id) => <bdi key={id} dir="ltr">{id}</bdi>)}</div></td>
                    <td><div className="cap-exposure-bar" aria-label={`${relativeWidth.toFixed(1)}% من أعلى تعرض`}><span style={{ width: `${relativeWidth}%` }} /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel cap-table-panel" aria-labelledby="benford-title">
        <div className="cap-section-head">
          <div><span className="eyebrow">اختبار استكشافي</span><h3 id="benford-title">توزيع الرقم الأول — بنفورد</h3><p>الانحراف يوجه الاستفسار والعينة فقط؛ لا يثبت التلاعب، وقد لا يناسب بعض المجتمعات المحاسبية.</p></div>
          <span className={`cap-count-pill ${analysis.benfordFlags ? "warning" : "success"}`}>{safeNumber(formatNumber, analysis.benfordFlags)} إشارات</span>
        </div>
        <div className="cap-table-scroll" tabIndex="0" aria-label="جدول تحليل بنفورد">
          <table className="cap-data-table cap-benford-table">
            <thead><tr><th>الرقم</th><th>العينة</th><th>المتوقع</th><th>الفعلي</th><th>الانحراف</th><th>المقارنة</th><th>الحالة</th></tr></thead>
            <tbody>
              {analysis.benford.map((item) => (
                <tr key={item.digit}>
                  <td><strong dir="ltr">{item.digit}</strong></td>
                  <td>{safeNumber(formatNumber, item.count)}</td>
                  <td dir="ltr">{item.expectedPct.toFixed(1)}%</td>
                  <td dir="ltr">{item.actualPct.toFixed(1)}%</td>
                  <td className={item.flagged ? "cap-deviation flagged" : "cap-deviation"} dir="ltr">{item.deviationPct > 0 ? "+" : ""}{item.deviationPct.toFixed(1)}%</td>
                  <td><div className="cap-benford-bars" aria-label={`الفعلي ${item.actualPct}% والمتوقع ${item.expectedPct}%`}><span className="expected" style={{ width: `${Math.min(100, item.expectedPct * 3)}%` }} /><span className="actual" style={{ width: `${Math.min(100, item.actualPct * 3)}%` }} /></div></td>
                  <td>{item.flagged ? <span className="cap-flag"><AlertTriangle size={14} /> فحص</span> : <span className="cap-pass"><CheckCircle2 size={14} /> ضمن الحد</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`panel cap-acknowledgment ${currentReview.acknowledged ? "acknowledged" : ""}`} aria-labelledby="analytics-ack-title">
        <div className="cap-section-head">
          <div><span className="eyebrow">رقابة بشرية</span><h3 id="analytics-ack-title">إقرار مراجعة التحليلات</h3><p>سجل أن مراجعًا بشريًا قرأ المؤشرات وحدد ما يحتاج إجراءً إضافيًا.</p></div>
          <span className={`cap-count-pill ${currentReview.acknowledged ? "success" : "warning"}`}>{currentReview.acknowledged ? "مُقر" : "بانتظار المراجعة"}</span>
        </div>
        <div className="cap-ack-grid">
          <label><span>اسم المراجع</span><input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="اسم المراجع المسؤول" /></label>
          <label className="cap-rationale"><span>الخلاصة والإجراءات التالية</span><textarea rows="3" value={conclusion} onChange={(event) => setConclusion(event.target.value)} placeholder="وثّق تفسير الفروق والإجراءات المخطط لها" /></label>
        </div>
        {currentReview.acknowledged ? (
          <div className="cap-ack-record"><UserCheck size={22} aria-hidden="true" /><div><strong>أقرّ بها {currentReview.reviewer}</strong><span>{localDateTime(currentReview.acknowledgedAt)} · محرك {currentReview.engine || "KOSIF-ANALYTICS-v1"}</span><p>{currentReview.conclusion}</p></div></div>
        ) : null}
        <div className="cap-actions">
          <button type="button" className="button button-gold" disabled={!reviewer.trim() || !conclusion.trim()} onClick={acknowledge}><ClipboardCheck size={18} aria-hidden="true" /> {currentReview.acknowledged ? "تحديث الإقرار" : "تسجيل الإقرار"}</button>
          {currentReview.acknowledged ? <button type="button" className="button button-outline" onClick={revokeAcknowledgment}>إلغاء الإقرار</button> : null}
        </div>
      </section>
    </div>
  );
}

export default AnalyticsWorkspace;
