import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Calculator,
  CheckCircle2,
  FileDigit,
  Fingerprint,
  GitBranch,
  Link2,
  Scale,
  ShieldCheck,
} from "lucide-react";
import {
  OPEN_DECISION_POLICY,
  assessMisstatements,
  absBig,
  buildMateriality,
  buildStatementRun,
  createTrialBalanceLedger,
  formatMinorUnits,
  parseMinorUnits,
  traceFigure,
} from "../audit-core.js";
import "../traceability.css";

const opinionLabels = {
  unmodified: "رأي غير معدّل",
  qualified: "رأي متحفظ",
  adverse: "رأي معاكس",
  disclaimer: "امتناع عن إبداء الرأي",
};

function legacyAdjustmentMinor(adjustment) {
  if (typeof adjustment?.amountMinor === "string") return adjustment.amountMinor;
  return parseMinorUnits(String(adjustment?.amount ?? "0")).toString();
}

function shortId(value) {
  return value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "—";
}

function Metric({ icon: Icon, label, value, helper, tone = "violet" }) {
  return (
    <article className={`trace-metric tone-${tone}`}>
      <span aria-hidden="true"><Icon size={20} /></span>
      <div><small>{label}</small><strong>{value}</strong><p>{helper}</p></div>
    </article>
  );
}

export function TraceabilityWorkspace({ accounts, engagement, dataProfile }) {
  const effectiveAt = dataProfile?.committedAt
    || engagement?.demo?.generatedAt
    || "2026-08-30T00:00:00.000Z";
  const graph = useMemo(() => buildStatementRun({
    engagementId: engagement?.demo?.id || "eng_current",
    accounts,
    journalLines: createTrialBalanceLedger(accounts, engagement?.demo?.id || "eng_current"),
    rulesetVersion: engagement?.materialityPolicy?.version || "KOSIF-RULES-1",
    effectiveAt,
  }), [accounts, effectiveAt, engagement?.demo?.id, engagement?.materialityPolicy?.version]);

  const figureByKey = useMemo(
    () => new Map(graph.figures.map((figure) => [figure.scopeKey, figure])),
    [graph.figures],
  );
  const revenueFigure = figureByKey.get("IS.REVENUE");
  const materiality = useMemo(() => buildMateriality({
    benchmarkMinor: String(absBig(BigInt(revenueFigure?.valueInt || "0"))),
    omRateBp: engagement?.materialityPolicy?.omRateBp || 75,
    pmRateBp: engagement?.materialityPolicy?.pmRateBp || 7500,
    cttRateBp: engagement?.materialityPolicy?.cttRateBp || 500,
    rationaleAr: engagement?.materialityPolicy?.rationaleAr
      || "اعتمدت الإيرادات معيارًا أوليًا لثباتها وارتباطها بحجم نشاط ملف العرض.",
  }), [engagement?.materialityPolicy, revenueFigure?.valueInt]);

  const assessment = useMemo(() => assessMisstatements(
    (engagement?.adjustments || []).map((item) => ({
      amountMinor: legacyAdjustmentMinor(item),
      corrected: item.status === "accepted",
      qualitative: Boolean(item.qualitative),
      qualitativeRationaleAr: item.qualitativeRationaleAr,
    })),
    materiality.omMinor,
    {
      basis: engagement?.opinionAssessment?.basis || "misstatement",
      isPervasive: Boolean(engagement?.opinionAssessment?.isPervasive),
      pervasivenessRationaleAr: engagement?.opinionAssessment?.pervasivenessRationaleAr || "",
    },
  ), [engagement?.adjustments, engagement?.opinionAssessment, materiality.omMinor]);

  const [selectedFigureId, setSelectedFigureId] = useState(() => graph.figures.find(({ scopeKey }) => scopeKey === "BS.TOTAL_ASSETS")?.id || graph.figures[0]?.id);
  const selectedFigure = graph.figures.find(({ id }) => id === selectedFigureId) || graph.figures[0];
  const trace = useMemo(
    () => selectedFigure ? traceFigure(graph, selectedFigure.id) : null,
    [graph, selectedFigure],
  );
  const displayFigures = graph.figures
    .filter(({ scopeKey }) => !["BS.BALANCE_DIFFERENCE"].includes(scopeKey))
    .sort((first, second) => first.statement.localeCompare(second.statement) || first.scopeKey.localeCompare(second.scopeKey));
  const allTraceable = graph.figures.every((figure) => {
    try { return traceFigure(graph, figure.id).sources.length > 0; } catch { return false; }
  });

  return (
    <div className="view-stack trace-view" dir="rtl">
      <section className="panel trace-hero">
        <div>
          <span className="eyebrow">Figure → Derivation → Source</span>
          <h2>رسم الإسناد المحاسبي</h2>
          <p>كل بند أدناه يحمل معرّفًا حتميًا، وقيمة بالهللات، واشتقاقًا يمكن فتحه حتى سطر المصدر. تغيير وقت التشغيل وحده لا يغيّر هوية الرقم.</p>
        </div>
        <div className={`trace-hero-state ${graph.balanceCheck.balanced && allTraceable ? "success" : "warning"}`}>
          {graph.balanceCheck.balanced && allTraceable ? <BadgeCheck size={25} /> : <AlertTriangle size={25} />}
          <span><strong>{graph.balanceCheck.balanced && allTraceable ? "متسق" : "يتطلب فحصًا"}</strong><small>محرك الإسناد v1</small></span>
        </div>
      </section>

      <section className="trace-metrics" aria-label="ملخص رسم الإسناد">
        <Metric icon={FileDigit} label="عُقد الأرقام" value={graph.figures.length.toLocaleString("ar-SA-u-nu-latn")} helper="كل عقدة لها اشتقاق إلزامي" tone="violet" />
        <Metric icon={GitBranch} label="حواف الاشتقاق" value={graph.derivations.length.toLocaleString("ar-SA-u-nu-latn")} helper={`${graph.provenanceNodes.length.toLocaleString("ar-SA-u-nu-latn")} عقدة مصدر وربط`} tone="blue" />
        <Metric icon={Scale} label="معادلة المركز المالي" value={graph.balanceCheck.balanced ? "متوازنة" : formatMinorUnits(graph.balanceCheck.differenceMinor)} helper={<bdi>{shortId(graph.balanceCheck.figureId)}</bdi>} tone={graph.balanceCheck.balanced ? "green" : "red"} />
        <Metric icon={Calculator} label="الرأي المشتق" value={opinionLabels[assessment.opinionType]} helper={`صافي غير المصحح: ${formatMinorUnits(assessment.netMinor)}`} tone="gold" />
      </section>

      <section className="trace-contract-grid" aria-label="ثوابت المحرك">
        {[
          ["I1", "لا رقم بلا إسناد", allTraceable, "كل رقم في هذه المساحة ينتهي إلى سطر مصدر."],
          ["I2", "هللات صحيحة فقط", true, "المبالغ نصوص عددية وتدخل المحرك كـ bigint."],
          ["I3", "الذكاء الاصطناعي للسرد", true, "القوائم والأهمية والرأي محركات حتمية فقط."],
          ["I4", "الرأي مشتق", true, "ISA 705 هي الدالة الوحيدة لاختيار النوع."],
          ["I6", "إعادة إنتاج", true, "الهوية مبنية على المحتوى وإصدار القواعد."],
          ["I8", "لا جلب من عنوان مستخدم", true, "المحرك بلا شبكة ولا يقبل URL."],
        ].map(([code, title, pass, detail]) => (
          <article key={code} className={pass ? "pass" : "blocked"}>
            <span>{code}</span>
            <div><strong>{title}</strong><p>{detail}</p></div>
            {pass ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          </article>
        ))}
      </section>

      <div className="trace-workspace-grid">
        <section className="panel trace-figure-list">
          <div className="trace-section-head"><div><span className="eyebrow">قوائم مشتقة</span><h3>عُقد القوائم المالية</h3><p>اختر أي بند لفتح سلسلة تكوينه.</p></div><Fingerprint size={24} /></div>
          <div className="table-scroll" tabIndex="0">
            <table>
              <thead><tr><th>البند</th><th>القائمة</th><th className="numeric">القيمة</th><th>الإسناد</th></tr></thead>
              <tbody>{displayFigures.map((figure) => (
                <tr key={figure.id} className={figure.id === selectedFigure?.id ? "selected" : ""}>
                  <td><button type="button" onClick={() => setSelectedFigureId(figure.id)}><strong>{figure.labelAr}</strong><small><bdi>{shortId(figure.id)}</bdi></small></button></td>
                  <td><span className={`trace-statement ${figure.statement.toLowerCase()}`}>{figure.statement}</span></td>
                  <td className="numeric"><bdi>{formatMinorUnits(figure.valueInt)}</bdi></td>
                  <td><button className="trace-open" type="button" onClick={() => setSelectedFigureId(figure.id)}>فتح <ArrowLeft size={15} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <aside className="panel trace-detail" aria-live="polite">
          <div className="trace-section-head"><div><span className="eyebrow">Trace</span><h3>{selectedFigure?.labelAr}</h3><p><bdi>{selectedFigure?.id}</bdi></p></div><Link2 size={24} /></div>
          <div className="trace-value"><small>القيمة الموثقة</small><strong><bdi>{formatMinorUnits(selectedFigure?.valueInt || "0")}</bdi></strong></div>
          <ol className="trace-steps">
            {(trace?.steps || []).map(({ figure, derivation }, index) => (
              <li key={`${figure.id}-${index}`}>
                <span>{index + 1}</span>
                <div><strong>{figure.labelAr}</strong><code>{derivation.formula}</code><small><bdi>{shortId(derivation.id)}</bdi></small></div>
              </li>
            ))}
          </ol>
          <div className="trace-sources">
            <strong>مصادر نهائية: {(trace?.sources || []).length.toLocaleString("ar-SA-u-nu-latn")}</strong>
            <div>{(trace?.sources || []).slice(0, 8).map((source) => <bdi key={source.id}>{shortId(source.entityId)}</bdi>)}</div>
            {(trace?.sources || []).length > 8 ? <small>+ {((trace?.sources || []).length - 8).toLocaleString("ar-SA-u-nu-latn")} سطرًا آخر داخل الاشتقاق الكامل</small> : null}
          </div>
        </aside>
      </div>

      <section className="panel trace-materiality">
        <div className="trace-section-head"><div><span className="eyebrow">ISA 320 → SUM → ISA 705</span><h3>سلسلة الأهمية والرأي</h3><p>الأساس البشري موثق؛ الحساب ونوع الرأي مشتقان.</p></div><ShieldCheck size={24} /></div>
        <div className="trace-materiality-flow">
          <article><span>مرجع الإيرادات</span><strong>{formatMinorUnits(materiality.benchmarkMinor)}</strong><small>figure: IS.REVENUE</small></article>
          <article><span>الأهمية الكلية OM</span><strong>{formatMinorUnits(materiality.omMinor)}</strong><small>{materiality.omRateBp} نقطة أساس</small></article>
          <article><span>أهمية التنفيذ PM</span><strong>{formatMinorUnits(materiality.pmMinor)}</strong><small>{materiality.pmRateBp} نقطة أساس من OM</small></article>
          <article><span>نتيجة ISA 705</span><strong>{opinionLabels[assessment.opinionType]}</strong><small>{assessment.isMaterial ? "جوهري" : "غير جوهري"} · {assessment.isPervasive ? "منتشر" : "غير منتشر"}</small></article>
        </div>
        <p className="trace-rationale"><strong>مبرر المرجع:</strong> {materiality.rationaleAr}</p>
      </section>

      <section className="trace-policy-grid" aria-label="السياسات المحسومة">
        <article><strong>الانتشار</strong><p>تقييم كلي للرأي مع تبرير بشري وإشارات للبنود المتأثرة.</p><code>{OPEN_DECISION_POLICY.pervasiveness}</code></article>
        <article><strong>الأرصدة الافتتاحية</strong><p>نتيجة ISA 510 أولًا؛ لا تتحول تلقائيًا إلى قيد نطاق.</p><code>{OPEN_DECISION_POLICY.unauditedOpeningBalances}</code></article>
        <article><strong>تقويم القيود</strong><p>تقويم سعودي مثبت بالإصدار ومن دون جلب شبكي وقت التشغيل.</p><code>{OPEN_DECISION_POLICY.holidayCalendar}</code></article>
        <article><strong>الجوهرية النوعية</strong><p>قرار بشري في المرحلة الأولى مع فئة وسبب موثقين.</p><code>{OPEN_DECISION_POLICY.qualitativeMateriality}</code></article>
      </section>

      <section className="governance-banner trace-boundary-note">
        <AlertTriangle size={20} />
        <div><strong>حد مصدر العرض الحالي</strong><p>لأن بيانات العرض المنشورة ميزان مراجعة وليست دفترًا كاملًا، يُنشئ المحرك سطرًا حتميًا لكل صف ميزان كي يبرهن مسار الإسناد. عند استيراد دفتر الأستاذ في M2 تُستبدل هذه العقد تلقائيًا بسطور القيود الأصلية ولا تُقدَّم عقد العرض كدليل عميل.</p></div>
      </section>
    </div>
  );
}

export default TraceabilityWorkspace;
