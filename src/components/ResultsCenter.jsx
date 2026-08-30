import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  Fingerprint,
  Layers3,
  ListChecks,
  Network,
  Scale,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { buildAnalyticalReview } from "../analytics.js";
import {
  buildCouncilSnapshot,
  buildEvidenceLineage,
  buildReconciliationCases,
  buildRiskSample,
  createJournalEntries,
} from "../governance.js";
import {
  buildAdjustmentBridge,
  buildReportState,
  isAdjustmentPosted,
} from "../reporting.js";
import {
  buildAccountsCsv,
  buildTemporarySessionSnapshot,
  downloadTextFile,
  timestampedFilename,
} from "../session-export.js";
import { createSessionWorkbookBytes, downloadWorkbookBytes } from "../session-workbook.js";
import { buildMappingMetrics, buildStandardsCoverage } from "../standards.js";
import {
  APPLIED_MODEL_META,
  buildAccountingCycleReadiness,
  buildAppliedAccountingSummary,
  buildIfrs18Readiness,
} from "../applied-accounting.js";
import {
  ACC_AUDIT_ROUNDS,
  REFERENCE_SCENARIOS,
  buildReferenceComparison,
} from "../reference-results.js";
import { AuditInsightCards } from "./AuditInsightCards.jsx";
import "../results.css";

const riskLabels = { high: "مرتفع", medium: "متوسط", low: "منخفض" };
const referenceComparison = buildReferenceComparison();
const referenceById = new Map(
  Object.values(REFERENCE_SCENARIOS).map((scenario) => [scenario.id, scenario]),
);
const sourceKindLabels = {
  "live-surface-observation": "رصد سطح حي",
  "github-source-contract": "عقد مصدر GitHub",
  "github-generated-artifact": "مخرج مختبر GitHub",
};
const capabilityParity = [
  {
    capability: "بيانات العرض",
    v2: "5,000 حساب",
    v3: "330 حسابًا",
    stable: "110 حسابات · 3 جولات",
    current: "5,000 حساب متوازن وفريد",
    verdict: "مكافئ لـv2 وأوسع من v3",
    tone: "success",
  },
  {
    capability: "استيراد الميزان",
    v2: "XLSX / CSV",
    v3: "XLSX / CSV",
    stable: "Excel / CSV / لصق مباشر",
    current: "XLSX / XLS / CSV / TSV / TXT",
    verdict: "تغطية أوسع",
    tone: "success",
  },
  {
    capability: "جولات المراجعة",
    v2: "20 جولة",
    v3: "20 جولة",
    stable: "3 جولات تكرارية",
    current: "20 جولة + متابعة مرتبطة",
    verdict: "مكافئ مع روابط fail-closed",
    tone: "success",
  },
  {
    capability: "المعايير",
    v2: "20 نتيجة امتثال",
    v3: "20 نتيجة بالعقد؛ 29 في واجهة قديمة",
    stable: "خريطة 110 حسابات + 47 معيارًا مدعى",
    current: "61 معيارًا + صفحات مرجع 2025 + وصف وربط بالحساب",
    verdict: "فهرس أوسع وقارئ قابل للتتبع",
    tone: "success",
  },
  {
    capability: "رفع الدليل وبصمته",
    v2: "40 اسم ملف بلا payload/hash",
    v3: "40 اسمًا ولا بصمات في JSON",
    stable: "14 مستندًا مدعى؛ لا بصمات قابلة للتحقق",
    current: "SHA-256 من البايتات + حفظ محلي IndexedDB + إعادة تحقق",
    verdict: "أقوى داخل الجلسة؛ ليس مستودعًا مؤسسيًا",
    tone: "success",
  },
  {
    capability: "تبديل مجموعة البيانات",
    v2: "كل الجولات سبقت اعتماد الميزان",
    v3: "رُصد خلط 110/330",
    stable: "عدة عينات؛ العرض المحمّل لا يطابق PBC",
    current: "إبطال النتائج + منع تواريخ ما قبل الالتزام",
    verdict: "يعزل النتائج القديمة",
    tone: "success",
  },
  {
    capability: "إصدار التقرير",
    v2: "صدر بعد اعتماد الميزان بـ79ms",
    v3: "صادر رغم PBC 0/19",
    stable: "صادر مع تعارض 12 طلبًا مدعى / 0 معروض",
    current: "12 بوابة وعلاقات وتواريخ واعتماد بشري",
    verdict: "حوكمة أشد قابلة للاختبار",
    tone: "success",
  },
  {
    capability: "تنزيل النتائج",
    v2: "JSON/CSV؛ Word تعطل في الاختبار",
    v3: "JSON / CSV / DOC / PDF",
    stable: "JSON / CSV / DOC / PDF",
    current: "PDF / XLSX / JSON / CSV حي لأي جلسة + مرجع عرض ثابت",
    verdict: "أوسع ومربوط بالمصدر الحالي",
    tone: "success",
  },
  {
    capability: "القيود والتسويات",
    v2: "360 صفًا و4 تسويات؛ رُصدت حسابات غير سليمة",
    v3: "19 سطرًا لا يطابق أسماء الحسابات الحالية",
    stable: "8 قيود + 4 إعادات تبويب مدعاة",
    current: "3 قيود مزدوجة متوازنة مرتبطة بالحسابات",
    verdict: "صحيح للعينة؛ ليس دفتر أستاذ",
    tone: "warning",
  },
  {
    capability: "المجلس التحليلي",
    v2: "لا نتائج AI في JSON",
    v3: "مخرجات متعددة بالواجهة",
    stable: "محرك محلي + Gemini اختياري عبر مفتاح متصفح",
    current: "4 مقاعد حتمية + سجل مزودات + بصمة وحزمة منقحة",
    verdict: "أقوى مصدرًا؛ الخارجي معطل بلا تهيئة آمنة",
    tone: "warning",
  },
  {
    capability: "الهوية والحفظ المؤسسي",
    v2: "غير مثبت من السطح العام",
    v3: "غير مثبت من السطح العام",
    stable: "حفظ محلي وخادم اختياري غير مثبت",
    current: "جلسة متصفح محلية فقط",
    verdict: "يلزم خادم RBAC/RLS وسجل دائم",
    tone: "warning",
  },
];

function referenceCurrency(value, currencyCode) {
  if (value == null) return "—";
  return new Intl.NumberFormat("ar-SA-u-nu-latn", {
    style: "currency",
    currency: currencyCode || "SAR",
    maximumFractionDigits: 2,
  }).format(value);
}

function DisclosureTable({
  title,
  description,
  count,
  children,
  open = false,
}) {
  return (
    <details className="results-disclosure" open={open}>
      <summary>
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <bdi>{count}</bdi>
      </summary>
      <div className="results-disclosure-body">{children}</div>
    </details>
  );
}

function TableWrap({ label, children }) {
  return (
    <div className="results-table-scroll" tabIndex="0" aria-label={label}>
      {children}
    </div>
  );
}

function StandardLinks({ ids = [], onOpenStandard, source }) {
  const values = [...new Set(ids.filter(Boolean))];
  if (!values.length) return <span>—</span>;
  return (
    <span className="results-standard-links">
      {values.map((standardId) => (
        <button
          key={standardId}
          type="button"
          dir="ltr"
          onClick={() => onOpenStandard?.(standardId, null, source)}
        >
          {standardId}
        </button>
      ))}
    </span>
  );
}

export function ResultsCenter({
  accounts = [],
  engagement = {},
  metrics = {},
  dataProfile,
  stages = [],
  onView,
  onToast,
  formatNumber,
  formatCurrency,
  onOpenStandard,
  onOpenRound,
}) {
  const [exporting, setExporting] = useState(false);
  const [workbookBusy, setWorkbookBusy] = useState(false);
  const adjustmentBridge = useMemo(
    () => buildAdjustmentBridge(accounts, engagement.adjustments),
    [accounts, engagement.adjustments],
  );
  const analysis = useMemo(
    () => buildAnalyticalReview(adjustmentBridge.adjustedAccounts),
    [adjustmentBridge.adjustedAccounts],
  );
  const mapping = useMemo(
    () => buildMappingMetrics(accounts, engagement.standardMappings),
    [accounts, engagement.standardMappings],
  );
  const coverage = useMemo(
    () => buildStandardsCoverage(accounts, engagement.standardMappings),
    [accounts, engagement.standardMappings],
  );
  const coveredStandards = coverage.filter(
    (item) => item.accountCount > 0,
  ).length;
  const reportState = useMemo(
    () => buildReportState(engagement, metrics),
    [engagement, metrics],
  );
  const riskSample = useMemo(() => buildRiskSample(accounts, 36), [accounts]);
  const journals = useMemo(
    () => createJournalEntries(accounts, 24),
    [accounts],
  );
  const reconciliations = useMemo(
    () => buildReconciliationCases(journals),
    [journals],
  );
  const lineage = useMemo(
    () => buildEvidenceLineage(accounts, engagement, 36),
    [accounts, engagement],
  );
  const council = useMemo(
    () => buildCouncilSnapshot(adjustmentBridge.adjustedAccounts, engagement, mapping, {
      analysisBasis: "posted-adjusted-trial-balance",
      datasetDigest: metrics.datasetDigest,
    }),
    [adjustmentBridge.adjustedAccounts, engagement, mapping, metrics.datasetDigest],
  );
  const appliedSummary = useMemo(
    () => buildAppliedAccountingSummary(adjustmentBridge.adjustedAccounts, engagement, metrics),
    [adjustmentBridge.adjustedAccounts, engagement, metrics],
  );
  const accountingCycle = useMemo(
    () => buildAccountingCycleReadiness(adjustmentBridge.adjustedAccounts, engagement, metrics),
    [adjustmentBridge.adjustedAccounts, engagement, metrics],
  );
  const ifrs18 = useMemo(
    () => buildIfrs18Readiness(adjustmentBridge.adjustedAccounts, engagement),
    [adjustmentBridge.adjustedAccounts, engagement],
  );

  const number = (value) =>
    formatNumber
      ? formatNumber(value)
      : Number(value || 0).toLocaleString("ar-SA-u-nu-latn");
  const currency = (value) =>
    formatCurrency
      ? formatCurrency(value)
      : Number(value || 0).toLocaleString("ar-SA-u-nu-latn", {
          style: "currency",
          currency: "SAR",
        });
  const completedStages = stages.filter(
    (stage) => stage.status === "complete",
  ).length;
  const approvedEvidence = (engagement.evidence || []).filter(
    (item) => item.status === "approved",
  ).length;
  const closedFindings = (engagement.findings || []).filter(
    (item) => item.status === "closed",
  ).length;
  const acceptedAdjustments = (engagement.adjustments || []).filter(
    isAdjustmentPosted,
  ).length;

  const resultFamilies = [
    { label: "الميزان والحسابات", count: accounts.length, icon: Scale },
    { label: "مجالات التحليل", count: analysis.areas.length, icon: BarChart3 },
    { label: "المعايير", count: coverage.length, icon: BookOpen },
    { label: "عينة المخاطر", count: riskSample.length, icon: Network },
    {
      label: "الجولات",
      count: engagement.rounds?.length || 0,
      icon: ClipboardCheck,
    },
    {
      label: "الأدلة",
      count: engagement.evidence?.length || 0,
      icon: Fingerprint,
    },
    {
      label: "الملاحظات",
      count: engagement.findings?.length || 0,
      icon: ListChecks,
    },
    {
      label: "بوابات الإصدار",
      count: reportState.gates.length,
      icon: ShieldCheck,
    },
    {
      label: "النماذج التطبيقية",
      count: Object.keys(APPLIED_MODEL_META).length,
      icon: Calculator,
    },
  ];

  async function downloadSnapshot() {
    setExporting(true);
    try {
      const snapshot = await buildTemporarySessionSnapshot({
        accounts,
        engagement,
        metrics,
        dataProfile,
        stages,
      });
      downloadTextFile(
        JSON.stringify(snapshot, null, 2),
        timestampedFilename("kosif-temporary-session", "json"),
        "application/json;charset=utf-8",
      );
      onToast?.("تم تنزيل نسخة JSON مؤقتة كاملة من بيانات الجلسة ونتائجها.");
    } catch {
      onToast?.("تعذر إنشاء النسخة المؤقتة. أعد المحاولة من هذه الجلسة.");
    } finally {
      setExporting(false);
    }
  }

  function downloadCsv() {
    downloadTextFile(
      buildAccountsCsv(accounts, engagement.standardMappings),
      timestampedFilename("kosif-current-trial-balance", "csv"),
      "text/csv;charset=utf-8",
    );
    onToast?.(
      `تم تنزيل ميزان المراجعة الحالي: ${number(accounts.length)} حسابًا.`,
    );
  }

  async function downloadWorkbook() {
    if (workbookBusy) return;
    setWorkbookBusy(true);
    try {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const snapshot = await buildTemporarySessionSnapshot({ accounts, engagement, metrics, dataProfile, stages });
      const { bytes, filename } = await createSessionWorkbookBytes(snapshot);
      downloadWorkbookBytes(bytes, filename);
      onToast?.(`تم تنزيل أوراق عمل الجلسة الحالية: ${number(accounts.length)} حسابًا و12 ورقة.`);
    } catch {
      onToast?.("تعذر تجهيز أوراق عمل الجلسة الحالية.");
    } finally {
      setWorkbookBusy(false);
    }
  }

  return (
    <div className="view-stack results-center" dir="rtl">
      <section className="results-hero" aria-labelledby="results-title">
        <div className="results-hero-copy">
          <span className="eyebrow">لقطة موحدة · كل نتائج التطبيق</span>
          <h1 id="results-title">مركز النتائج والتنزيل المؤقت</h1>
          <p>
            يعرض كل عائلات النتائج في شاشة واحدة، ويتيح حفظ الجلسة الحالية كاملة
            بصيغة JSON، أو أوراق عمل XLSX من 12 ورقة، أو جميع حسابات الميزان بصيغة CSV.
          </p>
          <div className="results-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={downloadWorkbook}
              disabled={workbookBusy}
            >
              <FileSpreadsheet size={18} aria-hidden="true" /> {workbookBusy ? "جارٍ تجهيز XLSX…" : "تنزيل XLSX الحالي"}
            </button>
            <button
              type="button"
              className="button button-gold"
              onClick={downloadSnapshot}
              disabled={exporting}
            >
              <FileJson size={18} aria-hidden="true" />{" "}
              {exporting ? "جارٍ تجهيز النسخة…" : "تنزيل الجلسة المؤقتة JSON"}
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={downloadCsv}
            >
              <FileSpreadsheet size={18} aria-hidden="true" /> تنزيل كل الحسابات
              CSV
            </button>
          </div>
        </div>
        <div
          className="results-hero-score"
          aria-label={`${reportState.passedGates} من ${reportState.gates.length} بوابة مكتملة`}
        >
          <ShieldCheck size={29} aria-hidden="true" />
          <strong dir="ltr">
            {reportState.passedGates}/{reportState.gates.length}
          </strong>
          <span>بوابة إصدار</span>
        </div>
      </section>

      <aside className="results-warning" role="note">
        <AlertTriangle size={20} aria-hidden="true" />
        <div>
          <strong>تنزيل محلي مؤقت</strong>
          <p>
            الملف يعكس الحالة المفتوحة في هذا المتصفح وقد يتضمن اسم المنشأة
            وتفاصيل الارتباط. لا يُعد تقريرًا موقعًا، ويجب حفظه في موقع مصرح به.{" "}
            {dataProfile?.source === "demo"
              ? "بيانات العرض الحالية اصطناعية."
              : "البيانات الحالية مستوردة داخل هذه الجلسة."}
          </p>
        </div>
      </aside>

      <section
        className="panel results-section reference-results"
        aria-labelledby="reference-results-title"
      >
        <div className="results-section-head">
          <div>
            <span className="eyebrow">مقارنة موثقة دون خلط البيانات</span>
            <h2 id="reference-results-title">
              نتائج Stable وv2 وv3 وعقود GitHub المرجعية
            </h2>
            <p>
              كل صف مجموعة مستقلة بمصدر وعملة وهوية مختلفين. أرقام السطحين
              الحيين رُصدت من الواجهة، وأرقام GitHub مأخوذة من عقود ومخرجات
              المصدر؛ لا تُجمع الإجماليات بينها.
            </p>
          </div>
          <span className="results-state warning">
            <Fingerprint size={16} /> {number(referenceComparison.length)}{" "}
            مجموعات مستقلة
          </span>
        </div>
        <div className="reference-card-grid">
          {referenceComparison.map((row) => {
            const scenario = referenceById.get(row.id);
            const publicUrl = scenario?.source?.publicUrl;
            return (
              <article key={row.id}>
                <header>
                  <span>
                    {sourceKindLabels[row.sourceKind] || row.sourceKind}
                  </span>
                  <bdi dir="ltr">{row.datasetId || "LIVE"}</bdi>
                </header>
                <h3>{row.label}</h3>
                <p>{row.entityName}</p>
                <div>
                  <span>
                    الحسابات{" "}
                    <strong>
                      {row.accounts == null ? "—" : number(row.accounts)}
                    </strong>
                  </span>
                  <span>
                    الجولات{" "}
                    <strong>
                      {row.rounds == null ? "—" : number(row.rounds)}
                    </strong>
                  </span>
                  <span>
                    النتائج{" "}
                    <strong>
                      {row.findings == null ? "—" : number(row.findings)}
                    </strong>
                  </span>
                </div>
                <small>
                  إجمالي المدين:{" "}
                  {referenceCurrency(row.totalDebit, row.currency)}
                </small>
                {publicUrl ? (
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    فتح السطح العام <ArrowLeft size={14} aria-hidden="true" />
                  </a>
                ) : null}
              </article>
            );
          })}
        </div>
        {REFERENCE_SCENARIOS.cloudflareStable?.defects?.length ? (
          <aside className="reference-defect-panel" role="note">
            <div>
              <AlertTriangle size={20} aria-hidden="true" />
              <span>
                <strong>فروق الرصد الحي في Stable</strong>
                <small>
                  نعيد القدرات المفيدة، ولا ننسخ الأعطال أو ادعاءات غير قابلة للتحقق.
                </small>
              </span>
            </div>
            <ul>
              {REFERENCE_SCENARIOS.cloudflareStable.defects.map((defect) => (
                <li key={defect.id}>
                  <bdi dir="ltr">{defect.severity}</bdi>
                  <span>{defect.summary}</span>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
        <DisclosureTable
          title="مصفوفة النتائج المرجعية"
          description="الحسابات والجولات والنتائج والأدلة والأهمية لكل مصدر مستقل"
          count={number(referenceComparison.length)}
          open
        >
          <TableWrap label="مقارنة نتائج التطبيقات والمصادر المرجعية">
            <table>
              <thead>
                <tr>
                  <th>المصدر</th>
                  <th>المجموعة</th>
                  <th>العملة</th>
                  <th>الحسابات</th>
                  <th>الجولات</th>
                  <th>النتائج</th>
                  <th>المغلق / المفتوح</th>
                  <th>الأدلة</th>
                  <th>طلبات المستندات</th>
                  <th>القيود</th>
                  <th>إجمالي المدين</th>
                  <th>الأهمية</th>
                  <th>الإصدار</th>
                </tr>
              </thead>
              <tbody>
                {referenceComparison.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.label}</strong>
                      <small className="table-subline">
                        {sourceKindLabels[row.sourceKind] || row.sourceKind}
                      </small>
                    </td>
                    <td dir="ltr">{row.datasetId || "LIVE"}</td>
                    <td dir="ltr">{row.currency}</td>
                    <td>{row.accounts == null ? "—" : number(row.accounts)}</td>
                    <td>{row.rounds == null ? "—" : number(row.rounds)}</td>
                    <td>{row.findings == null ? "—" : number(row.findings)}</td>
                    <td dir="ltr">
                      {row.resolvedFindings == null
                        ? "—"
                        : `${row.resolvedFindings} / ${row.openFindings}`}
                    </td>
                    <td>{row.evidence == null ? "—" : number(row.evidence)}</td>
                    <td>
                      {row.documentRequests == null
                        ? "—"
                        : number(row.documentRequests)}
                    </td>
                    <td>
                      {row.journalEntries == null
                        ? "—"
                        : number(row.journalEntries)}
                    </td>
                    <td className="numeric">
                      {referenceCurrency(row.totalDebit, row.currency)}
                    </td>
                    <td className="numeric">
                      {referenceCurrency(row.materiality, row.currency)}
                    </td>
                    <td>
                      {row.reportIssued == null
                        ? "غير مثبت"
                        : row.reportIssued
                          ? "ظاهر كصادر"
                          : "محجوب"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
        <DisclosureTable
          title="تكافؤ القدرات والتحسينات"
          description="مقارنة الوظائف والبوابات، لا مقارنة المجاميع بين مجموعات وعمـلات مختلفة"
          count={number(capabilityParity.length)}
          open
        >
          <TableWrap label="مقارنة قدرات KOSIF الحالية مع v2 وv3">
            <table>
              <thead>
                <tr>
                  <th>القدرة</th>
                  <th>v2 المرصود</th>
                  <th>v3 المرصود</th>
                  <th>Stable المرصود</th>
                  <th>تطبيقنا</th>
                  <th>الحكم</th>
                </tr>
              </thead>
              <tbody>
                {capabilityParity.map((row) => (
                  <tr key={row.capability}>
                    <td>
                      <strong>{row.capability}</strong>
                    </td>
                    <td>{row.v2}</td>
                    <td>{row.v3}</td>
                    <td>{row.stable}</td>
                    <td>{row.current}</td>
                    <td>
                      <span className={`results-state ${row.tone}`}>
                        {row.verdict}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
        <DisclosureTable
          title="جولات عقد GitHub Acc"
          description="10 جولات محاكاة: 37 نتيجة، 7 مفتوحة، 1,245 عنصر دليل؛ التقرير غير قابل للإصدار"
          count={number(ACC_AUDIT_ROUNDS.length)}
        >
          <TableWrap label="نتائج جولات عقد GitHub Acc">
            <table>
              <thead>
                <tr>
                  <th>الجولة</th>
                  <th>الموضوع</th>
                  <th>النتائج</th>
                  <th>المعالج</th>
                  <th>المفتوح</th>
                  <th>الأدلة</th>
                </tr>
              </thead>
              <tbody>
                {ACC_AUDIT_ROUNDS.map((round) => (
                  <tr key={round.id}>
                    <td>
                      <strong dir="ltr">{round.id}</strong>
                    </td>
                    <td>{round.title}</td>
                    <td>{number(round.findings.total)}</td>
                    <td>{number(round.findings.resolved)}</td>
                    <td>{number(round.findings.open)}</td>
                    <td>{number(round.evidenceItems)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
        <div
          className="reference-lab-strip"
          aria-label="مؤشرات مختبر GitHub mahmoud1990"
        >
          <article>
            <span>إشارات المخاطر</span>
            <strong>
              {number(
                REFERENCE_SCENARIOS.githubMahmoudLab.analytics.riskFlagCount,
              )}
            </strong>
          </article>
          <article>
            <span>الشذوذ</span>
            <strong>
              {number(
                REFERENCE_SCENARIOS.githubMahmoudLab.analytics.anomalyCount,
              )}
            </strong>
          </article>
          <article>
            <span>Benford NED</span>
            <strong dir="ltr">
              {REFERENCE_SCENARIOS.githubMahmoudLab.analytics.benfordNed}
            </strong>
          </article>
          <article>
            <span>Altman Z</span>
            <strong dir="ltr">
              {REFERENCE_SCENARIOS.githubMahmoudLab.analytics.altmanZ}
            </strong>
          </article>
          <article>
            <span>المخاطر المركبة</span>
            <strong dir="ltr">
              {REFERENCE_SCENARIOS.githubMahmoudLab.analytics.compositeRisk}%
            </strong>
          </article>
        </div>
      </section>

      <section className="results-kpis" aria-label="ملخص النتائج">
        <article>
          <Database size={20} />
          <span>الحسابات</span>
          <strong>{number(metrics.accountCount)}</strong>
          <small>{dataProfile?.label || "الجلسة الحالية"}</small>
        </article>
        <article>
          <Scale size={20} />
          <span>اتزان الميزان</span>
          <strong>{metrics.isBalanced ? "متوازن" : "غير متوازن"}</strong>
          <small>الفرق {currency(metrics.balanceDifference)}</small>
        </article>
        <article>
          <BookOpen size={20} />
          <span>تغطية الربط</span>
          <strong dir="ltr">
            {Number(metrics.mappingRate || 0).toFixed(1)}%
          </strong>
          <small>{number(mapping.reviewed)} قرارًا راجعه الإنسان</small>
        </article>
        <article>
          <ListChecks size={20} />
          <span>المراحل المكتملة</span>
          <strong dir="ltr">
            {completedStages}/{stages.length}
          </strong>
          <small>من الإعداد حتى الإصدار</small>
        </article>
        <article>
          <Fingerprint size={20} />
          <span>الأدلة المعتمدة</span>
          <strong dir="ltr">
            {approvedEvidence}/{engagement.evidence?.length || 0}
          </strong>
          <small>مرتبطة بالطلبات والجولات</small>
        </article>
        <article>
          <CheckCircle2 size={20} />
          <span>الملاحظات المغلقة</span>
          <strong dir="ltr">
            {closedFindings}/{engagement.findings?.length || 0}
          </strong>
          <small>بما فيها الملاحظات الجوهرية</small>
        </article>
        <article>
          <ClipboardCheck size={20} />
          <span>التسويات المرحلة</span>
          <strong dir="ltr">
            {acceptedAdjustments}/{engagement.adjustments?.length || 0}
          </strong>
          <small>قيد مزدوج متوازن وقرار بشري</small>
        </article>
        <article>
          <UserCheck size={20} />
          <span>حالة التقرير</span>
          <strong>{reportState.reportReady ? "جاهز" : "مسودة"}</strong>
          <small>{reportState.reportOpinion}</small>
        </article>
        <article>
          <ClipboardCheck size={20} />
          <span>دورة الإقفال التطبيقية</span>
          <strong dir="ltr">{appliedSummary.cycleComplete}/{appliedSummary.cycleTotal}</strong>
          <small>{accountingCycle.filter((item) => item.status !== "complete").length} محورًا يحتاج متابعة</small>
        </article>
        <article>
          <Layers3 size={20} />
          <span>جاهزية IFRS 18</span>
          <strong dir="ltr">{appliedSummary.ifrs18Passed}/{appliedSummary.ifrs18Total}</strong>
          <small>{ifrs18.reviewRequired.length} بند تصنيف يحتاج حكمًا</small>
        </article>
      </section>

      <section
        className="panel results-index"
        aria-labelledby="results-index-title"
      >
        <div className="results-section-head">
          <div>
            <span className="eyebrow">فهرس حي</span>
            <h2 id="results-index-title">كل عائلات النتائج</h2>
            <p>الأعداد محسوبة من لقطة الجلسة الحالية، لا من ملف ثابت.</p>
          </div>
          <button
            type="button"
            className="button button-outline"
            onClick={() => onView?.("trial-balance")}
          >
            <Database size={17} /> فتح جميع الحسابات
          </button>
        </div>
        <div className="results-family-grid">
          {resultFamilies.map(({ label, count, icon: Icon }) => (
            <article key={label}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              <strong>{number(count)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section
        className="panel results-section"
        aria-labelledby="financial-results-title"
      >
        <div className="results-section-head">
          <div>
            <span className="eyebrow">النتائج المالية والتحليلية</span>
            <h2 id="financial-results-title">النسب والتعرض وبنفورد</h2>
            <p>
              مؤشرات توجيهية محسوبة بعد القيود المرحلة (
              {currency(adjustmentBridge.postedDebit)})؛ لا تثبت الخطأ أو الغش
              منفردة.
            </p>
          </div>
          <span className="results-state success">
            <CheckCircle2 size={16} /> {number(analysis.areas.length)} مجالًا
          </span>
        </div>
        <div className="results-ratio-grid">
          <article>
            <span>نسبة التداول</span>
            <strong dir="ltr">
              {analysis.ratios.currentRatio.toFixed(2)}×
            </strong>
          </article>
          <article>
            <span>السيولة السريعة</span>
            <strong dir="ltr">{analysis.ratios.quickRatio.toFixed(2)}×</strong>
          </article>
          <article>
            <span>الدين إلى الملكية</span>
            <strong dir="ltr">
              {analysis.ratios.debtToEquity.toFixed(2)}×
            </strong>
          </article>
          <article>
            <span>الهامش الإجمالي</span>
            <strong dir="ltr">
              {analysis.ratios.grossMarginPct.toFixed(1)}%
            </strong>
          </article>
          <article>
            <span>هامش التشغيل</span>
            <strong dir="ltr">
              {analysis.ratios.operatingMarginPct.toFixed(1)}%
            </strong>
          </article>
          <article>
            <span>الهامش قبل الضريبة</span>
            <strong dir="ltr">
              {analysis.ratios.netMarginBeforeTaxPct.toFixed(1)}%
            </strong>
          </article>
          <article>
            <span>تعرض عالي المخاطر</span>
            <strong dir="ltr">
              {analysis.highRiskExposurePct.toFixed(2)}%
            </strong>
          </article>
        </div>
        <DisclosureTable
          title="التعرض حسب كل مجال"
          description="كل المجالات العشرين والحسابات والمخاطر والمعايير المرتبطة"
          count={number(analysis.areas.length)}
          open
        >
          <TableWrap label="كل نتائج التعرض حسب المجال">
            <table>
              <thead>
                <tr>
                  <th>المجال</th>
                  <th>الحسابات</th>
                  <th>التعرض</th>
                  <th>مرتفع</th>
                  <th>متوسط</th>
                  <th>منخفض</th>
                  <th>المعايير</th>
                </tr>
              </thead>
              <tbody>
                {analysis.areas.map((area) => (
                  <tr key={area.key}>
                    <td>
                      <strong>{area.label}</strong>
                    </td>
                    <td>{number(area.accountCount)}</td>
                    <td className="numeric">{currency(area.exposure)}</td>
                    <td>{number(area.high)}</td>
                    <td>{number(area.medium)}</td>
                    <td>{number(area.low)}</td>
                    <td>
                      <StandardLinks
                        ids={area.standards}
                        onOpenStandard={onOpenStandard}
                        source="results-area"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
        <DisclosureTable
          title="نتائج تحليل بنفورد كاملة"
          description="الأرقام من 1 إلى 9، المتوقع والفعلي والانحراف"
          count={number(analysis.benford.length)}
        >
          <TableWrap label="كل نتائج تحليل بنفورد">
            <table>
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>العينة</th>
                  <th>المتوقع</th>
                  <th>الفعلي</th>
                  <th>الانحراف</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {analysis.benford.map((item) => (
                  <tr key={item.digit}>
                    <td>
                      <strong>{item.digit}</strong>
                    </td>
                    <td>{number(item.count)}</td>
                    <td dir="ltr">{item.expectedPct.toFixed(1)}%</td>
                    <td dir="ltr">{item.actualPct.toFixed(1)}%</td>
                    <td dir="ltr">
                      {item.deviationPct > 0 ? "+" : ""}
                      {item.deviationPct.toFixed(1)}%
                    </td>
                    <td>
                      <span
                        className={`results-state ${item.flagged ? "warning" : "success"}`}
                      >
                        {item.flagged ? "يحتاج فحصًا" : "ضمن الحد"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
      </section>

      <section
        className="panel results-section"
        aria-labelledby="standards-results-title"
      >
        <div className="results-section-head">
          <div>
            <span className="eyebrow">الربط المهني</span>
            <h2 id="standards-results-title">كل نتائج المعايير</h2>
            <p>
              يعرض الكتالوج كاملًا ويُفصح عن المعايير المستخدمة وغير المستخدمة؛
              اكتمال ربط الحسابات لا يعني استخدام كل معيار في المهمة.
            </p>
          </div>
          <span
            className={`results-state ${coveredStandards === coverage.length ? "success" : "warning"}`}
          >
            <BookOpen size={16} /> {number(coveredStandards)} /{" "}
            {number(coverage.length)} مستخدمًا
          </span>
        </div>
        <DisclosureTable
          title="مصفوفة تغطية الكتالوج"
          description="عدد الحسابات والتعرض والمجالات لكل معيار، بما فيها المعايير بلا حسابات"
          count={number(coverage.length)}
          open
        >
          <TableWrap label="كل نتائج تغطية المعايير">
            <table>
              <thead>
                <tr>
                  <th>المعيار</th>
                  <th>العنوان</th>
                  <th>النوع</th>
                  <th>الحسابات</th>
                  <th>راجعها الإنسان</th>
                  <th>تحتاج مراجعة</th>
                  <th>التعرض</th>
                  <th>المجالات</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <StandardLinks
                        ids={[item.id]}
                        onOpenStandard={onOpenStandard}
                        source="results-coverage"
                      />
                    </td>
                    <td>{item.title}</td>
                    <td>{item.type === "accounting" ? "محاسبي" : "مراجعة"}</td>
                    <td>{number(item.accountCount)}</td>
                    <td>{number(item.reviewedAccountCount)}</td>
                    <td>{number(item.reviewRequiredAccountCount)}</td>
                    <td className="numeric">{currency(item.totalExposure)}</td>
                    <td>{item.areas.join("، ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
      </section>

      <section
        className="panel results-section"
        aria-labelledby="governance-results-title"
      >
        <div className="results-section-head">
          <div>
            <span className="eyebrow">السلامة والحوكمة</span>
            <h2 id="governance-results-title">الدفتر والعينة والنسب</h2>
            <p>
              نتائج قابلة لإعادة التوليد من الحسابات الحالية، مع قرار بشري مستقل
              عن محركات التحليل.
            </p>
          </div>
          <span
            className={`results-state ${council.consensus.status === "clear" ? "success" : "warning"}`}
          >
            <ShieldCheck size={16} /> {council.consensus.recommendation}
          </span>
        </div>
        <div className="results-ratio-grid governance-counts">
          <article>
            <span>عينة المخاطر</span>
            <strong>{number(riskSample.length)}</strong>
          </article>
          <article>
            <span>قيود محكومة</span>
            <strong>{number(journals.length)}</strong>
          </article>
          <article>
            <span>مطابقات</span>
            <strong>{number(reconciliations.length)}</strong>
          </article>
          <article>
            <span>مسارات أدلة</span>
            <strong>{number(lineage.length)}</strong>
          </article>
          <article>
            <span>جولات المجلس</span>
            <strong>{number(engagement.council?.rounds?.length || 0)}</strong>
          </article>
          <article>
            <span>أحداث الرقابة</span>
            <strong>{number(engagement.auditTrail?.length || 0)}</strong>
          </article>
        </div>
        <DisclosureTable
          title="كل عناصر عينة المخاطر"
          description="اختيار موجه بالمخاطر ومنهجي قابل للإعادة"
          count={number(riskSample.length)}
        >
          <TableWrap label="كل نتائج عينة المخاطر">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>الحساب</th>
                  <th>الاسم</th>
                  <th>المجال</th>
                  <th>المخاطر</th>
                  <th>القيمة</th>
                  <th>أساس الاختيار</th>
                </tr>
              </thead>
              <tbody>
                {riskSample.map((item) => (
                  <tr key={item.id}>
                    <td>{item.order}</td>
                    <td>
                      <strong dir="ltr">{item.code}</strong>
                    </td>
                    <td>{item.name}</td>
                    <td>{item.area}</td>
                    <td>
                      <span className={`risk-badge risk-${item.risk}`}>
                        {riskLabels[item.risk]}
                      </span>
                    </td>
                    <td className="numeric">{currency(item.amount)}</td>
                    <td>{item.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
        <DisclosureTable
          title="عينة القيود ونتائج المطابقة"
          description="عينة حتمية من القيود وحالات المطابقة مشتقة من السكان الحالية؛ ليست تسوية بنكية مستوردة"
          count={`${number(journals.length)} + ${number(reconciliations.length)}`}
        >
          <TableWrap label="كل نتائج القيود والمطابقة">
            <table>
              <thead>
                <tr>
                  <th>القيد</th>
                  <th>الفترة</th>
                  <th>الوصف</th>
                  <th>القيمة</th>
                  <th>حالة المطابقة</th>
                  <th>الطريقة</th>
                  <th>الفرق</th>
                </tr>
              </thead>
              <tbody>
                {journals.map((entry, index) => {
                  const match = reconciliations.find(
                    (item) => item.bookReference === entry.id,
                  );
                  return (
                    <tr key={entry.id}>
                      <td>
                        <strong dir="ltr">{entry.id}</strong>
                      </td>
                      <td dir="ltr">{entry.period}</td>
                      <td>{entry.description}</td>
                      <td className="numeric">
                        {currency(Number(entry.totalMinor) / 100)}
                      </td>
                      <td>
                        {match?.status ||
                          (index >= reconciliations.length
                            ? "خارج عينة المطابقة"
                            : "—")}
                      </td>
                      <td>{match?.method || "—"}</td>
                      <td className="numeric">
                        {match
                          ? currency(Number(match.differenceMinor) / 100)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
        <DisclosureTable
          title="عينة مسارات الأدلة"
          description="36 مسارًا: الحساب ← المعيار ← التأكيد ← الخطر ← الإجراء ← الدليل ← النتيجة"
          count={number(lineage.length)}
        >
          <TableWrap label="كل نتائج نسب الأدلة">
            <table>
              <thead>
                <tr>
                  <th>الحساب</th>
                  <th>المعيار</th>
                  <th>التأكيد</th>
                  <th>الخطر</th>
                  <th>الإجراء</th>
                  <th>الدليل</th>
                  <th>الجولة</th>
                  <th>النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {lineage.map((item) => (
                  <tr key={item.accountId}>
                    <td>
                      <strong dir="ltr">{item.code}</strong>
                    </td>
                    <td>
                      <StandardLinks
                        ids={[item.standard]}
                        onOpenStandard={onOpenStandard}
                        source="results-lineage"
                      />
                    </td>
                    <td>{item.assertion}</td>
                    <td>{item.risk}</td>
                    <td>{item.procedure}</td>
                    <td dir="ltr">{item.evidence}</td>
                    <td dir="ltr">{item.roundId}</td>
                    <td dir="ltr">{item.finding}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
      </section>

      <section
        className="panel results-section"
        aria-labelledby="execution-results-title"
      >
        <div className="results-section-head">
          <div>
            <span className="eyebrow">تنفيذ ملف المراجعة</span>
            <h2 id="execution-results-title">
              الجولات والأدلة والملاحظات والتسويات
            </h2>
            <p>
              كل سجل متاح أدناه دون إخفاء النتائج غير المواتية أو العناصر التي
              تحتاج إجراءً.
            </p>
          </div>
          <span
            className={`results-state ${reportState.reportReady ? "success" : "warning"}`}
          >
            {reportState.reportReady ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}{" "}
            {reportState.reportReady ? "لقطة مكتملة" : "لقطة قيد العمل"}
          </span>
        </div>
        <DisclosureTable
          title="كل جولات المراجعة"
          description="20 جولة مع المخاطر والحدود والمعايير والنتيجة والإجراء والمستندات"
          count={number(engagement.rounds?.length || 0)}
          open
        >
          <TableWrap label="كل نتائج جولات المراجعة">
            <table>
              <thead>
                <tr>
                  <th>الجولة</th>
                  <th>العنوان</th>
                  <th>الحالة</th>
                  <th>المخاطر</th>
                  <th>الحد المرجعي</th>
                  <th>المعايير</th>
                  <th>النتائج</th>
                  <th>الأدلة</th>
                  <th>المستندات</th>
                  <th>المالك</th>
                  <th>النتيجة</th>
                  <th>الإجراء</th>
                  <th>وقت الإقفال</th>
                </tr>
              </thead>
              <tbody>
                {(engagement.rounds || []).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong dir="ltr">{item.id}</strong>
                    </td>
                    <td>{item.title}</td>
                    <td>
                      {item.status} · <bdi dir="ltr">{item.progress}%</bdi>
                    </td>
                    <td>
                      <span className={`risk-badge risk-${item.risk}`}>
                        {riskLabels[item.risk] || "—"}
                      </span>
                    </td>
                    <td className="numeric">{currency(item.threshold || 0)}</td>
                    <td>
                      <StandardLinks ids={item.standards || []} onOpenStandard={onOpenStandard} source="results-round" />
                    </td>
                    <td dir="ltr">{item.findingIds?.join(" · ") || "—"}</td>
                    <td dir="ltr">{item.evidenceIds?.join(" · ") || "—"}</td>
                    <td>
                      {item.documents
                        ?.map((document) => document.name)
                        .join(" · ") || "—"}
                    </td>
                    <td>{item.owner}</td>
                    <td>{item.summary || item.conclusion || "—"}</td>
                    <td>{item.action || "—"}</td>
                    <td dir="ltr">{item.completedAt || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
        <DisclosureTable
          title="كل طلبات الأدلة"
          description="الحالة والجولة والتأكيدات والمعايير والنتائج والبصمة والاستنتاج"
          count={number(engagement.evidence?.length || 0)}
        >
          <TableWrap label="كل نتائج طلبات الأدلة">
            <table>
              <thead>
                <tr>
                  <th>الطلب</th>
                  <th>العنوان</th>
                  <th>المجال</th>
                  <th>الجولة</th>
                  <th>الحالة</th>
                  <th>المالك</th>
                  <th>التأكيدات</th>
                  <th>المعايير</th>
                  <th>النتائج</th>
                  <th>الملف</th>
                  <th>SHA-256</th>
                  <th>الاستنتاج</th>
                </tr>
              </thead>
              <tbody>
                {(engagement.evidence || []).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong dir="ltr">{item.id}</strong>
                    </td>
                    <td>{item.title}</td>
                    <td>{item.area}</td>
                    <td dir="ltr">{item.roundId || "—"}</td>
                    <td>{item.status}</td>
                    <td>{item.owner}</td>
                    <td>{item.assertions?.join("، ")}</td>
                    <td>
                      <StandardLinks ids={item.standardIds || []} onOpenStandard={onOpenStandard} source="results-evidence" />
                    </td>
                    <td dir="ltr">{item.findingIds?.join(" · ") || "—"}</td>
                    <td>{item.fileName || "—"}</td>
                    <td>
                      <code>{item.hash || "—"}</code>
                    </td>
                    <td>{item.conclusion || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
        <section className="results-insight-section" aria-labelledby="results-insight-title">
          <div className="results-section-head">
            <div>
              <span className="eyebrow">قراءة تنفيذية</span>
              <h2 id="results-insight-title">أهم النتائج والإجراء التالي</h2>
              <p>تعرض كل بطاقة التعرض المشتق من الميزان، ومعيار المحاسبة أو المراجعة، والجولة والدليل المرتبطين.</p>
            </div>
            <span className="results-state success">
              <CheckCircle2 size={15} aria-hidden="true" />
              من نفس الجلسة
            </span>
          </div>
          <AuditInsightCards
            findings={engagement.findings || []}
            accounts={accounts}
            evidence={engagement.evidence || []}
            limit={4}
            formatCurrency={currency}
            onOpenStandard={onOpenStandard}
            onOpenRound={onOpenRound}
            onOpenEvidence={() => onView?.("evidence")}
          />
        </section>
        <DisclosureTable
          title="كل النتائج"
          description="الشدة والجولة والدليل والمعايير والمعالجة الموثقة"
          count={number(engagement.findings?.length || 0)}
        >
          <TableWrap label="كل نتائج الملاحظات">
            <table>
              <thead>
                <tr>
                  <th>النتيجة</th>
                  <th>العنوان</th>
                  <th>المجال</th>
                  <th>الشدة</th>
                  <th>الجولة</th>
                  <th>الدليل</th>
                  <th>المعايير</th>
                  <th>الحالة</th>
                  <th>الملخص</th>
                  <th>المعالجة</th>
                  <th>وقت الإغلاق</th>
                </tr>
              </thead>
              <tbody>
                {(engagement.findings || []).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong dir="ltr">{item.id}</strong>
                    </td>
                    <td>{item.title}</td>
                    <td>{item.area}</td>
                    <td>
                      <span className={`risk-badge risk-${item.severity}`}>
                        {riskLabels[item.severity]}
                      </span>
                    </td>
                    <td dir="ltr">{item.roundId || "—"}</td>
                    <td dir="ltr">{item.evidenceIds?.join(" · ") || "—"}</td>
                    <td>
                      <StandardLinks ids={item.standardIds?.length ? item.standardIds : [item.standard]} onOpenStandard={onOpenStandard} source="results-finding" />
                    </td>
                    <td>{item.status}</td>
                    <td>{item.summary || "—"}</td>
                    <td>{item.resolution || "—"}</td>
                    <td dir="ltr">{item.closedAt || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
        <DisclosureTable
          title="كل قيود التسوية"
          description="القيمة والحالة والقيد المزدوج ووقت الترحيل والمراجع"
          count={number(engagement.adjustments?.length || 0)}
        >
          <TableWrap label="كل نتائج قيود التسوية">
            <table>
              <thead>
                <tr>
                  <th>القيد</th>
                  <th>العنوان</th>
                  <th>القيمة</th>
                  <th>الحالة</th>
                  <th>مرجع اليومية</th>
                  <th>الأطراف</th>
                  <th>التوازن</th>
                  <th>راجعه</th>
                  <th>وقت الترحيل</th>
                </tr>
              </thead>
              <tbody>
                {(engagement.adjustments || []).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong dir="ltr">{item.id}</strong>
                    </td>
                    <td>{item.title}</td>
                    <td className="numeric">{currency(item.amount)}</td>
                    <td>{item.status}</td>
                    <td dir="ltr">{item.journalReference || "—"}</td>
                    <td>
                      {item.lines
                        ?.map(
                          (line) =>
                            `${line.code}: D ${line.debitMinor} / C ${line.creditMinor}`,
                        )
                        .join(" · ") || "—"}
                    </td>
                    <td>
                      {isAdjustmentPosted(item) ? "متوازن ومرحّل" : "غير مكتمل"}
                    </td>
                    <td>{item.reviewedBy || "—"}</td>
                    <td dir="ltr">{item.postedAt || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
      </section>

      <section
        className="panel results-section"
        aria-labelledby="issuance-results-title"
      >
        <div className="results-section-head">
          <div>
            <span className="eyebrow">الإقفال والإصدار</span>
            <h2 id="issuance-results-title">كل بوابات التقرير</h2>
            <p>
              مدخلات الحكم والاعتماد النهائي بشريان؛ نوع الرأي مشتق حتميًا وفق ISA 705؛ نتائج البوابات أدناه
              تعكس الجلسة الحالية فورًا.
            </p>
          </div>
          <span
            className={`results-state ${reportState.reportReady ? "success" : "warning"}`}
          >
            <UserCheck size={16} /> {reportState.reportOpinion}
          </span>
        </div>
        <div className="results-gates">
          {reportState.gates.map((gate) => (
            <article key={gate.id} className={gate.pass ? "pass" : "blocked"}>
              {gate.pass ? (
                <CheckCircle2 size={19} />
              ) : (
                <AlertTriangle size={19} />
              )}
              <div>
                <strong>{gate.label}</strong>
                <small>{gate.detail}</small>
              </div>
            </article>
          ))}
        </div>
        <DisclosureTable
          title="سجل الرقابة الكامل"
          description="كل الأحداث المتاحة في لقطة الارتباط الحالية"
          count={number(engagement.auditTrail?.length || 0)}
        >
          <TableWrap label="كل نتائج سجل الرقابة">
            <table>
              <thead>
                <tr>
                  <th>الحدث</th>
                  <th>الإجراء</th>
                  <th>الفاعل</th>
                  <th>الوقت</th>
                  <th>التفصيل</th>
                </tr>
              </thead>
              <tbody>
                {(engagement.auditTrail || []).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong dir="ltr">{item.id}</strong>
                    </td>
                    <td>{item.action}</td>
                    <td>{item.actor}</td>
                    <td dir="ltr">{item.at}</td>
                    <td>{item.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DisclosureTable>
      </section>

      <section
        className="results-download-footer"
        aria-label="خيارات تنزيل البيانات المؤقتة"
      >
        <div>
          <Download size={24} aria-hidden="true" />
          <span>
            <strong>احفظ لقطة قابلة للنقل قبل إغلاق الجلسة</strong>
            <small>
              JSON يشمل كل النتائج و{number(accounts.length)} حسابًا؛ XLSX يوزعها
              على 12 ورقة؛ وCSV يشمل كل صفوف الميزان مع تحييد صيغ الجداول.
            </small>
          </span>
        </div>
        <div className="results-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={downloadWorkbook}
            disabled={workbookBusy}
          >
            <FileSpreadsheet size={18} /> تنزيل XLSX
          </button>
          <button
            type="button"
            className="button button-gold"
            onClick={downloadSnapshot}
            disabled={exporting}
          >
            <FileJson size={18} /> تنزيل JSON
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={downloadCsv}
          >
            <FileSpreadsheet size={18} /> تنزيل CSV
          </button>
        </div>
      </section>
    </div>
  );
}
