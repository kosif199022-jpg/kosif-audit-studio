import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  BookOpen,
  Building2,
  CalendarDays,
  Calculator,
  Check,
  CheckCircle2,
  CircleHelp,
  ChevronLeft,
  CircleDollarSign,
  ClipboardCheck,
  Database,
  Download,
  FileCheck2,
  FileUp,
  FileText,
  Fingerprint,
  FolderCheck,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Menu,
  Map,
  Network,
  PieChart,
  Plus,
  Printer,
  RotateCcw,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  UserCheck,
  MessageSquareText,
  X,
} from "lucide-react";
import {
  STORAGE_KEY,
  categoryOptions,
  createFreshEngagement,
  generateTrialBalance,
  initialEngagement,
  navItems,
  statusLabels,
} from "./data.js";
import { buildDatasetCommitment, sha256BytesHex } from "./governance.js";
import { buildAnalyticalReview } from "./analytics.js";
import { clearEvidenceStore, deleteEvidenceBytes, readEvidenceBytes, storeEvidenceBytes, verifyRetainedEvidence } from "./evidence-store.js";
import { buildMappingMetrics, bulkReviewMappings, getAccountStandardLinks, getStandard, resolveAccountMapping } from "./standards.js";
import { StandardsCenter } from "./components/StandardsCenter.jsx";
import { AnalyticsWorkspace } from "./components/AnalyticsWorkspace.jsx";
import { DataIntakeWorkspace } from "./components/DataIntakeWorkspace.jsx";
import { IntegrityWorkspace } from "./components/IntegrityWorkspace.jsx";
import { AuditCouncil } from "./components/AuditCouncil.jsx";
import { ResultsCenter } from "./components/ResultsCenter.jsx";
import { AuditInsightCards } from "./components/AuditInsightCards.jsx";
import { CommandPalette } from "./components/CommandPalette.jsx";
import { WorkspaceAccessibility } from "./components/WorkspaceAccessibility.jsx";
import { ReviewerWorkspace } from "./components/ReviewerWorkspace.jsx";
import { ProfessionalOutputs } from "./components/ProfessionalOutputs.jsx";
import { AppliedAccountingLab } from "./components/AppliedAccountingLab.jsx";
import { absBig, buildMateriality, formatMinorUnits, parseMinorUnits } from "./audit-core.js";
import { buildAdjustmentBridge, buildReportState, opinionLabels } from "./reporting.js";
import {
  buildAccountsCsv,
  buildTemporarySessionSnapshot,
  downloadTextFile,
  timestampedFilename,
} from "./session-export.js";
import { createSessionWorkbookBytes, downloadWorkbookBytes } from "./session-workbook.js";
import { MAX_SESSION_SNAPSHOT_BYTES, parseSessionSnapshotText } from "./session-import.js";

const IntelligenceStudio = lazy(() => import("./components/IntelligenceStudio.jsx").then(m => ({ default: m.IntelligenceStudio })));

const TraceabilityWorkspace = lazy(() => import("./components/TraceabilityWorkspace.jsx"));

const viewIcons = {
  overview: LayoutDashboard,
  intelligence: Sparkles,
  "data-intake": FileUp,
  "trial-balance": Scale,
  traceability: Network,
  standards: BookOpen,
  applied: Calculator,
  analytics: PieChart,
  integrity: Fingerprint,
  council: BrainCircuit,
  risk: Network,
  rounds: RotateCcw,
  evidence: FolderCheck,
  "reviewer-workspace": MessageSquareText,
  results: ListChecks,
  reports: FileText,
  settings: Settings,
};

let discardedImportedSnapshotOnLoad = false;

const riskLabels = { high: "مرتفع", medium: "متوسط", low: "منخفض" };
const pageSize = 25;
const DEMO_DATA_PROFILE = Object.freeze({
  source: "demo",
  label: "بيانات العرض الشاملة — 5,000 حساب",
  rowCount: 5_000,
  importedAt: initialEngagement.demo.commitment.committedAt,
  committedAt: initialEngagement.demo.commitment.committedAt,
  warnings: 0,
  status: "complete",
  ...initialEngagement.demo.commitment,
});
const APPEARANCE_KEY = "kosif-audit-studio:appearance";
const PATH_GUIDE_KEY = "kosif-audit-studio:path-guide:v1";
const FONT_SCALE_KEY = "kosif-audit-studio:font-scale:v1";
const themeOrder = ["violet-light", "violet-dark", "heritage"];
const themeLabels = {
  "violet-light": "بنفسجي مضيء",
  "violet-dark": "بنفسجي داكن",
  heritage: "تراثي أخضر",
};

const numberFormatter = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  maximumFractionDigits: 0,
});

const currencyFormatter = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  style: "currency",
  currency: "SAR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  notation: "compact",
  maximumFractionDigits: 2,
});

function formatNumber(value) {
  return numberFormatter.format(Number(value || 0));
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatCompactCurrency(value) {
  return compactCurrencyFormatter.format(Number(value || 0));
}

function normalizeArabic(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .trim();
}

function cloneInitialEngagement() {
  return JSON.parse(JSON.stringify(initialEngagement));
}

function loadAppearance() {
  try {
    const stored = JSON.parse(localStorage.getItem(APPEARANCE_KEY) || "null");
    return {
      theme: themeOrder.includes(stored?.theme) ? stored.theme : "violet-light",
      presentationMode: Boolean(stored?.presentationMode),
    };
  } catch {
    return { theme: "violet-light", presentationMode: false };
  }
}

function loadEngagement() {
  const fallback = cloneInitialEngagement();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (stored?.sourceDataset?.source === "import") {
      discardedImportedSnapshotOnLoad = true;
      return fallback;
    }
    if (stored?.version === 7 && stored?.demoDatasetVersion === fallback.demoDatasetVersion) {
      return {
        ...fallback,
        ...stored,
        version: 7,
        entity: { ...fallback.entity, ...stored.entity },
        acceptance: { ...fallback.acceptance, ...stored.acceptance },
        report: { ...fallback.report, ...stored.report },
        standardMappings: {
          ...fallback.standardMappings,
          ...stored.standardMappings,
          overrides: { ...fallback.standardMappings.overrides, ...stored.standardMappings?.overrides },
          review: { ...fallback.standardMappings.review, ...stored.standardMappings?.review },
        },
        materialityPolicy: { ...fallback.materialityPolicy, ...stored.materialityPolicy },
        analyticsReview: { ...fallback.analyticsReview, ...stored.analyticsReview },
        council: {
          ...fallback.council,
          ...stored.council,
          humanDecision: { ...fallback.council.humanDecision, ...stored.council?.humanDecision },
          rounds: Array.isArray(stored.council?.rounds) ? stored.council.rounds : fallback.council.rounds,
        },
        periodLocks: Array.isArray(stored.periodLocks) ? stored.periodLocks : fallback.periodLocks,
        auditTrail: Array.isArray(stored.auditTrail) ? stored.auditTrail : fallback.auditTrail,
        rounds: Array.isArray(stored.rounds) ? stored.rounds : fallback.rounds,
        evidence: Array.isArray(stored.evidence) ? stored.evidence : fallback.evidence,
        findings: Array.isArray(stored.findings) ? stored.findings : fallback.findings,
        adjustments: Array.isArray(stored.adjustments) ? stored.adjustments : fallback.adjustments,
      };
    }
  } catch {
    // A corrupt local snapshot should never block the audit workspace.
  }
  return fallback;
}

function StatusChip({ status, children }) {
  return (
    <span className={`status-chip status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {children || statusLabels[status] || status}
    </span>
  );
}

function SectionHeading({ id, eyebrow, title, description, action }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2 id={id}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, helper, tone = "teal" }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span className="metric-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <div>
        <p>{label}</p>
        <strong dir="auto">{value}</strong>
        {helper ? <small>{helper}</small> : null}
      </div>
    </article>
  );
}

const pathGuideSteps = [
  { id: "data-intake", title: "ارفع ميزان المراجعة", detail: "XLSX أو XLS أو CSV؛ تتم القراءة والفحوص محليًا." },
  { id: "analytics", title: "راجع سلامة البيانات", detail: "التوازن والتكرار وطبيعة الرصيد والأهمية والإشارات التحليلية." },
  { id: "standards", title: "افتح المعايير", detail: "افتح أي معيار لرؤية المصدر والمتطلبات وصلته بالحساب." },
  { id: "rounds", title: "ابدأ الجولة الأولى", detail: "تتبع الخطة والنتائج وطلبات المستندات بروابط قابلة للمراجعة." },
  { id: "evidence", title: "ارفع الأدلة", detail: "اربط الملف بالطلب وتُحسب بصمة SHA-256 من محتواه محليًا." },
  { id: "council", title: "نفّذ جولات المتابعة", detail: "تُعرض توصيات استشارية من البيانات المتاحة، ثم يقرر المراجع البشري." },
  { id: "reports", title: "اعتمد التقرير", detail: "لا يصدر التقرير إلا بعد اجتياز البوابات ومراجعة القيود والنتائج." },
];

function PathGuide({ open, onClose, onView }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const goTo = (view) => {
    onClose();
    onView(view);
  };

  return (
    <div className="path-guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="path-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="path-guide-title" aria-describedby="path-guide-description">
        <header>
          <span className="path-guide-icon" aria-hidden="true"><Map size={25} /></span>
          <div><h2 id="path-guide-title">دليل المسار</h2><p id="path-guide-description">من الميزان إلى تقرير محكوم في سبع بوابات واضحة.</p></div>
          <button ref={closeRef} type="button" className="icon-button path-guide-close" onClick={onClose} aria-label="إغلاق دليل المسار"><X size={20} /></button>
        </header>
        <ol className="path-guide-steps">
          {pathGuideSteps.map((step, index) => (
            <li key={step.id}>
              <button type="button" onClick={() => goTo(step.id)}>
                <b aria-hidden="true">{index + 1}</b>
                <span><strong>{step.title}</strong><small>{step.detail}</small></span>
                <ArrowLeft size={17} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
        <footer><button type="button" className="button button-gold" onClick={() => goTo("data-intake")}><FileUp size={18} /> ابدأ برفع البيانات</button><button type="button" className="button button-outline" onClick={onClose}>فهمت</button></footer>
      </section>
    </div>
  );
}

function Header({ engagement, onView, onReloadDemo, onOpenGuide, theme, onCycleTheme, presentationMode, onTogglePresentation, commandPalette }) {
  const periodYear = engagement.entity.period?.match(/\d{4}/)?.[0] || "2025";
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const actionsRef = useRef(null);

  useEffect(() => {
    if (!mobileActionsOpen) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!actionsRef.current?.contains(event.target)) setMobileActionsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileActionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileActionsOpen]);

  const runAction = (action) => {
    setMobileActionsOpen(false);
    return action?.();
  };

  return (
    <header className="app-header">
      <div className="brand" aria-label="KOSIF للتدقيق">
        <span className="brand-mark" aria-hidden="true">
          <ShieldCheck size={24} strokeWidth={1.8} />
        </span>
        <span className="brand-copy">
          <b>KOSIF</b>
          <small>مساحة المراجعة الذكية</small>
        </span>
      </div>

      <div className="header-context" aria-label="بيانات الارتباط الحالية">
        <span className="context-pill entity-context">
          <Building2 size={17} aria-hidden="true" />
          <span>{engagement.entity.name}</span>
        </span>
        <span className="context-pill">
          <CalendarDays size={17} aria-hidden="true" />
          <bdi>{periodYear}</bdi>
        </span>
      </div>

      <div className="header-actions" ref={actionsRef}>
        {commandPalette}
        <button
          className={`icon-button header-more-button ${mobileActionsOpen ? "is-active" : ""}`}
          type="button"
          aria-expanded={mobileActionsOpen}
          aria-controls="header-secondary-actions"
          aria-label={mobileActionsOpen ? "إغلاق إجراءات الواجهة" : "فتح إجراءات الواجهة"}
          title="إجراءات الواجهة"
          onClick={() => setMobileActionsOpen((current) => !current)}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <div id="header-secondary-actions" className={`header-secondary-actions ${mobileActionsOpen ? "is-open" : ""}`}>
          <button className="button button-quiet guide-button" type="button" onClick={() => runAction(onOpenGuide)}>
            <CircleHelp size={18} aria-hidden="true" />
            <span>دليل المسار</span>
          </button>
          <button
            className="button button-quiet theme-button"
            type="button"
            onClick={() => runAction(onCycleTheme)}
            aria-label={`تغيير المظهر. المظهر الحالي: ${themeLabels[theme]}`}
            title={`المظهر الحالي: ${themeLabels[theme]}`}
          >
            <Sparkles size={18} aria-hidden="true" />
            <span>{themeLabels[theme]}</span>
          </button>
          <button
            className={`button button-quiet presentation-button ${presentationMode ? "is-active" : ""}`}
            type="button"
            aria-pressed={presentationMode}
            title={presentationMode ? "إنهاء وضع العرض التنفيذي" : "وضع العرض التنفيذي"}
            onClick={() => runAction(onTogglePresentation)}
          >
            <LayoutDashboard size={20} aria-hidden="true" />
            <span>{presentationMode ? "إنهاء العرض التنفيذي" : "العرض التنفيذي"}</span>
          </button>
          <button className="button button-quiet demo-button" type="button" onClick={() => runAction(onReloadDemo)}>
            <Sparkles size={18} aria-hidden="true" />
            <span>تحميل العرض الشامل</span>
          </button>
          <button
            className="button button-quiet settings-button"
            type="button"
            onClick={() => runAction(() => onView("settings"))}
          >
            <Settings size={20} aria-hidden="true" />
            <span>إعداد الارتباط</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ activeView, onView, completion }) {
  return (
    <aside className="side-rail" aria-label="أقسام التدقيق">
      <div className="rail-progress">
        <div className="rail-progress-ring" style={{ "--progress": `${completion * 3.6}deg` }} role="progressbar" aria-label="اكتمال الارتباط" aria-valuemin="0" aria-valuemax="100" aria-valuenow={completion}>
          <span>{completion}%</span>
        </div>
        <div>
          <strong>اكتمال الارتباط</strong>
          <small>تُحدّث النسبة حسب البوابات المهنية</small>
        </div>
      </div>

      <nav className="rail-nav">
        {navItems.map((item) => {
          const Icon = viewIcons[item.id];
          return (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? "active" : ""}
              aria-current={activeView === item.id ? "page" : undefined}
              onClick={() => onView(item.id)}
            >
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
              <ChevronLeft className="rail-chevron" size={16} aria-hidden="true" />
            </button>
          );
        })}
      </nav>

      <div className="rail-governance">
        <ShieldCheck size={20} aria-hidden="true" />
        <div>
          <strong>قرار محكوم</strong>
          <small>الاعتماد النهائي للمراجع البشري</small>
        </div>
      </div>
    </aside>
  );
}

function BottomNav({ activeView, onView }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef(null);
  const moreMenuRef = useRef(null);
  const primaryIds = ["overview", "reviewer-workspace", "analytics", "council"];
  const items = navItems.filter((item) => primaryIds.includes(item.id));
  const moreItems = navItems.filter((item) => !primaryIds.includes(item.id));
  const activeInMore = moreItems.some((item) => item.id === activeView);

  useEffect(() => {
    if (!moreOpen) return undefined;

    const closeAndRestoreFocus = () => {
      setMoreOpen(false);
      requestAnimationFrame(() => moreButtonRef.current?.focus());
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeAndRestoreFocus();
    };
    const handlePointerDown = (event) => {
      if (moreMenuRef.current?.contains(event.target) || moreButtonRef.current?.contains(event.target)) return;
      setMoreOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    requestAnimationFrame(() => moreMenuRef.current?.querySelector("button")?.focus());

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [moreOpen]);

  const chooseView = (view) => {
    setMoreOpen(false);
    onView(view);
  };
  return (
    <>
      {moreOpen ? (
        <nav ref={moreMenuRef} id="mobile-more-menu" className="bottom-more-menu" aria-label="جميع أقسام التدقيق">
          {moreItems.map((item) => {
            const Icon = viewIcons[item.id];
            return <button key={item.id} type="button" className={activeView === item.id ? "active" : ""} onClick={() => chooseView(item.id)}><Icon size={19} aria-hidden="true" /><span>{item.label}</span></button>;
          })}
        </nav>
      ) : null}
      <nav className="bottom-nav" aria-label="التنقل الرئيسي للجوال">
        {items.map((item) => {
          const Icon = viewIcons[item.id];
          const shortLabel = item.id === "reviewer-workspace" ? "المراجعة" : item.id === "analytics" ? "التحليلات" : item.id === "council" ? "المجلس" : "الرئيسية";
          return (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? "active" : ""}
              aria-current={activeView === item.id ? "page" : undefined}
              onClick={() => chooseView(item.id)}
            >
              <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
              <span>{shortLabel}</span>
            </button>
          );
        })}
        <button ref={moreButtonRef} type="button" className={moreOpen || activeInMore ? "active" : ""} aria-expanded={moreOpen} aria-controls="mobile-more-menu" onClick={() => setMoreOpen((current) => !current)}>
          <Menu size={21} strokeWidth={1.8} aria-hidden="true" />
          <span>المزيد</span>
        </button>
      </nav>
    </>
  );
}

function Overview({ metrics, engagement, stages, dataProfile, reportState, onView }) {
  const openEvidence = reportState.pendingEvidence;
  const openHigh = engagement.findings.filter((item) => item.severity === "high" && item.status !== "closed").length;
  const hasOpenItems = openEvidence > 0 || openHigh > 0 || metrics.unmapped > 0;
  const completedRounds = engagement.rounds.filter((item) => item.status === "complete").length;
  const isCompleteDemo = dataProfile?.source === "demo" && metrics.accountCount === 5_000;
  const heroDatasetLabel = isCompleteDemo
    ? `سيناريو العرض الشامل · ${formatNumber(metrics.accountCount)} حساب`
    : `${dataProfile?.label || "ملف الارتباط"} · ${formatNumber(metrics.accountCount)} حساب`;

  return (
    <div className="view-stack">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <span className="hero-kicker">KOSIF · {heroDatasetLabel}</span>
          <h1 id="hero-title">
            مراجعة أوضح.
            <span> قرار مهني أقوى.</span>
          </h1>
          <p>حوّل ملف الارتباط إلى مسار قابل للتتبع: أرقام حتمية، أدلة منظمة، وتقارير محكومة مع إبقاء الاعتماد النهائي بيد المراجع البشري.</p>
          <div className="hero-guardrails" aria-label="ضمانات المنصة">
            <span><Check size={15} aria-hidden="true" /> أرقام حتمية</span>
            <span><Check size={15} aria-hidden="true" /> أدلة قابلة للتتبع</span>
            <span><Check size={15} aria-hidden="true" /> {isCompleteDemo ? "نتائج كل المسارات مكتملة" : "حالة كل مسار ظاهرة بوضوح"}</span>
          </div>
          <div className="hero-actions">
            <button className="button button-gold" type="button" onClick={() => onView("rounds")}>
              {completedRounds === engagement.rounds.length ? `استعرض ${completedRounds} جولة مكتملة` : `استعرض الجولات (${completedRounds}/${engagement.rounds.length})`}
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <button className="button button-glass" type="button" onClick={() => onView("reports")}>
              افتح التقرير المحكوم
            </button>
          </div>
        </div>
        <span className="hero-edition">KOSIF REVIEW · INDEPENDENT EDITION</span>
      </section>

      <section className="panel" aria-labelledby="engagement-title">
        <SectionHeading
          id="engagement-title"
          eyebrow="ملف الارتباط"
          title={engagement.entity.name}
          description="الأساس: المعايير الدولية كما اعتمدتها الهيئة السعودية للمراجعين والمحاسبين"
          action={<button className="button button-outline" type="button" onClick={() => onView("settings")}><Settings size={17} aria-hidden="true" /> تحرير البيانات</button>}
        />
        <div className="metric-grid">
          <MetricCard icon={Scale} label="حسابًا في الميزان" value={formatNumber(metrics.accountCount)} helper="بيانات متوازنة" tone="blue" />
          <MetricCard icon={CircleDollarSign} label="إجمالي المدين" value={formatCompactCurrency(metrics.totalDebit)} helper="ريال سعودي" tone="teal" />
          <MetricCard icon={BadgeCheck} label="حالة التوازن" value={metrics.isBalanced ? "متوازن" : "غير متوازن"} helper={`الفرق ${formatCurrency(metrics.balanceDifference)}`} tone={metrics.isBalanced ? "green" : "red"} />
          <MetricCard icon={TrendingUp} label="الأهمية النسبية" value={formatCompactCurrency(metrics.materiality)} helper={`${metrics.materialityPercentage}% من إيرادات العقود · أهمية التنفيذ ${formatCompactCurrency(metrics.performanceMateriality)}`} tone="gold" />
        </div>
        <div className="engagement-strip">
          <div><b>{engagement.rounds.length}</b><span>جولات مراجعة</span></div>
          <div><b>{openEvidence}</b><span>طلبات أدلة مفتوحة</span></div>
          <div><b>{openHigh}</b><span>ملاحظات مرتفعة</span></div>
          <div><b>{metrics.unmapped}</b><span>حسابات غير مربوطة</span></div>
          <button type="button" onClick={() => onView(hasOpenItems ? (reportState.pendingManualPbc ? "reviewer-workspace" : "evidence") : "reports")}>{hasOpenItems ? "معالجة عناصر المتابعة" : "استعراض التقرير المكتمل"} <ArrowLeft size={17} aria-hidden="true" /></button>
        </div>
      </section>

      <section className="panel" aria-labelledby="journey-title">
        <SectionHeading id="journey-title" eyebrow="المسار المهني" title="من البيانات إلى التقرير" description="عشر بوابات مترابطة تمنع تجاوز أي قرار جوهري دون دليل أو اعتماد." />
        <div className="stage-list">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            return (
              <button key={stage.id} type="button" className={`stage-card stage-${stage.status}`} onClick={() => onView(stage.view)}>
                <span className="stage-number">{index + 1}</span>
                <Icon size={20} aria-hidden="true" />
                <span className="stage-copy"><b>{stage.label}</b><small>{stage.detail}</small></span>
                <StatusChip status={stage.status === "complete" ? "approved" : stage.status === "active" ? "review" : "pending"}>{stage.statusLabel}</StatusChip>
              </button>
            );
          })}
        </div>
      </section>

      <section className="governance-banner">
        <ShieldCheck size={28} aria-hidden="true" />
        <div>
          <strong>منهجية محكومة وليست بديلًا عن الحكم المهني</strong>
          <p>المحرّك يفحص الأرقام ويربطها بالمعايير، والذكاء الاصطناعي يقدم تحليلًا استشاريًا، ولا يصدر التقرير قبل اكتمال الأدلة واعتماد المراجع البشري.</p>
        </div>
      </section>
    </div>
  );
}

function TrialBalance({ accounts, metrics, mappingState, onToast, onOpenStandard }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query);

  const searchableAccounts = useMemo(() => accounts.map((account) => {
    const resolution = resolveAccountMapping(account, mappingState);
    const standardLinks = getAccountStandardLinks(account, mappingState, { includeSuggested: true });
    const auditStandardLinks = (resolution.status === "review_required"
      ? resolution.suggestedAuditStandardIds
      : resolution.auditStandardIds).map((id) => ({ id, title: getStandard(id)?.title || id }));
    return {
      ...account,
      mappingStatus: resolution.status,
      standardLinks,
      auditStandardLinks,
      searchText: normalizeArabic(`${account.code} ${account.name} ${account.nature} ${account.currency || "SAR"} ${account.functionalCurrency || "SAR"} ${standardLinks.map(({ id, title }) => `${id} ${title}`).join(" ")} ${auditStandardLinks.map(({ id, title }) => `${id} ${title}`).join(" ")} ${(account.assertions || []).join(" ")}`),
    };
  }), [accounts, mappingState]);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeArabic(deferredQuery);
    return searchableAccounts.filter((account) => {
      const categoryMatch = category === "all" || account.category === category;
      if (!categoryMatch) return false;
      if (!normalizedQuery) return true;
      return account.searchText.includes(normalizedQuery);
    });
  }, [category, deferredQuery, searchableAccounts]);

  useEffect(() => setPage(1), [query, category]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function exportCsv() {
    downloadTextFile(buildAccountsCsv(accounts, mappingState), timestampedFilename("kosif-current-trial-balance", "csv"), "text/csv;charset=utf-8");
    onToast(`تم تجهيز كل حسابات الميزان الحالية بصيغة CSV: ${formatNumber(accounts.length)} حسابًا.`);
  }

  return (
    <div className="view-stack">
      <section className="panel page-intro">
        <SectionHeading
          eyebrow="البيانات وصحتها"
          title="ميزان المراجعة"
          description={`${formatNumber(accounts.length)} حسابًا في اللقطة الحالية، مع تصنيف مهني وربط مباشر بالمعايير ومستوى المخاطر.`}
          action={<button type="button" className="button button-dark" onClick={exportCsv}><Download size={17} aria-hidden="true" /> تصدير CSV</button>}
        />
        <div className="compact-metrics">
          <span><b>{formatNumber(metrics.accountCount)}</b> حساب</span>
          <span><b>{formatCurrency(metrics.totalDebit)}</b> مدين</span>
          <span><b>{formatCurrency(metrics.totalCredit)}</b> دائن</span>
          <StatusChip status={metrics.isBalanced ? "approved" : "pending"}>{metrics.isBalanced ? "متوازن" : "يوجد فرق"}</StatusChip>
        </div>
      </section>

      <section className="panel table-panel" aria-labelledby="accounts-table-title">
        <div className="table-toolbar">
          <div>
            <h2 id="accounts-table-title">دليل الحسابات</h2>
            <p>عرض {formatNumber(filtered.length)} نتيجة من أصل {formatNumber(accounts.length)}</p>
          </div>
          <div className="filters">
            <label className="search-field">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">ابحث في الحسابات</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الرمز أو المعيار" />
              {query ? <button type="button" aria-label="مسح البحث" onClick={() => setQuery("")}><X size={17} /></button> : null}
            </label>
            <label className="select-field">
              <span className="sr-only">تصفية حسب التصنيف</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="table-scroll" tabIndex="0" aria-label="جدول ميزان المراجعة قابل للتمرير أفقيًا">
          <table>
            <thead>
              <tr>
                <th>رمز الحساب</th>
                <th>اسم الحساب</th>
                <th>التصنيف</th>
                <th>العملة</th>
                <th>المعيار</th>
                <th className="numeric">مدين</th>
                <th className="numeric">دائن</th>
                <th>المخاطر</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((account) => (
                <tr key={account.id}>
                  <td><bdi>{account.code}</bdi></td>
                  <td><strong>{account.name}</strong></td>
                  <td>{account.nature}</td>
                  <td>
                    <span className={`currency-context ${account.monetaryItem && account.currency !== account.functionalCurrency ? "is-foreign" : ""}`}>
                      <bdi dir="ltr">{account.currency || "SAR"}</bdi>
                      {account.monetaryItem && account.currency !== account.functionalCurrency ? (
                        <small>نقدي · وظيفية <bdi dir="ltr">{account.functionalCurrency || "SAR"}</bdi>{account.closingRate ? ` · ${account.closingRate}` : ""}</small>
                      ) : <small>{account.monetaryItem ? "بند نقدي" : "عملة العرض"}</small>}
                    </span>
                  </td>
                  <td>
                    <div className="standard-link-group" title={`معايير المراجعة: ${(account.auditStandards || []).join(" · ") || "—"}`}>
                      {account.standardLinks.length ? account.standardLinks.map((link) => (
                        <button
                          key={link.id}
                          type="button"
                          className={`standard-badge standard-link-button ${link.proposed ? "is-proposed" : ""}`}
                          onClick={() => onOpenStandard?.(link.id, account.id)}
                          aria-label={`فتح ${link.id}: ${link.title} للحساب ${account.code}`}
                          title={`${link.title} · ${link.rationale}`}
                        >
                          <BookOpen size={12} aria-hidden="true" /> <bdi dir="ltr">{link.id}</bdi>
                        </button>
                      )) : <span className="mapping-review-flag">لا يوجد ربط نافذ</span>}
                      {account.mappingStatus === "review_required" ? <span className="mapping-review-flag">مقترح · يحتاج مراجعة</span> : null}
                      {account.auditStandardLinks.length ? (
                        <div className="audit-standard-group">
                          <small>إجراءات المراجعة</small>
                          {account.auditStandardLinks.map((link) => (
                            <button
                              key={link.id}
                              type="button"
                              className="standard-badge standard-link-button is-audit"
                              onClick={() => onOpenStandard?.(link.id, account.id)}
                              aria-label={`فتح ${link.id}: ${link.title} للحساب ${account.code}`}
                              title={`${link.title} · معيار إجراء مراجعة مرتبط`}
                            >
                              <ClipboardCheck size={12} aria-hidden="true" /> <bdi dir="ltr">{link.id}</bdi>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="numeric">{account.debit ? formatCurrency(account.debit) : "—"}</td>
                  <td className="numeric">{account.credit ? formatCurrency(account.credit) : "—"}</td>
                  <td><span className={`risk-badge risk-${account.risk}`}>{riskLabels[account.risk]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination" aria-label="صفحات الحسابات">
          <span>الصفحة <bdi>{safePage}</bdi> من <bdi>{pageCount}</bdi></span>
          <div>
            <button type="button" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>السابق</button>
            <button type="button" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>التالي</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function RiskWorkspace({
  accounts,
  engagement,
  setEngagement,
  metrics,
  onToast,
  onOpenStandard,
  onOpenRound,
  onView,
}) {
  const riskCounts = useMemo(() => accounts.reduce((counts, account) => {
    counts[account.risk] += 1;
    return counts;
  }, { high: 0, medium: 0, low: 0 }), [accounts]);
  const focusFindings = engagement.findings.filter((finding) => finding.status !== "closed" || finding.severity === "high");
  const topAccounts = useMemo(() => [...accounts].sort((a, b) => b.amount - a.amount).slice(0, 8), [accounts]);

  function closeFinding(id) {
    const selected = engagement.findings.find((finding) => finding.id === id);
    const evidenceReady = (selected?.evidenceIds || []).every((evidenceId) => engagement.evidence.some((item) => item.id === evidenceId && item.status === "approved"));
    if (!evidenceReady) {
      onToast("لا يمكن إغلاق النتيجة قبل اعتماد الأدلة المرتبطة بها.");
      return;
    }
    const closedAt = new Date().toISOString();
    setEngagement((current) => ({
      ...current,
      humanApproval: false,
      humanApprovedAt: null,
      findings: current.findings.map((finding) => finding.id === id ? {
        ...finding,
        status: "closed",
        closedAt,
        closedBy: "مدير المراجعة",
        resolution: `نُفذ الإجراء: ${finding.recommendation || finding.summary || "فحص المعالجة"}، وتحقق المراجع من الأدلة المرتبطة قبل الإغلاق.`,
      } : finding),
      auditTrail: [{ id: `LOG-${Date.now()}`, action: "إغلاق ملاحظة", actor: "مدير المراجعة", at: closedAt, detail: `${id} · أُغلقت بعد توثيق الإجراء؛ أُعيد فتح الاعتماد النهائي.` }, ...(current.auditTrail || [])],
    }));
    onToast("تم توثيق إغلاق الملاحظة مع بقاء سجلها في ملف الارتباط.");
  }

  const mappingReady = metrics.unmapped === 0 && engagement.mappingConfirmed;

  function confirmMappings() {
    const reviewedAt = new Date().toISOString();
    setEngagement((current) => {
      const reviewedMappings = bulkReviewMappings(accounts, current.standardMappings, {
        reviewer: "مدير المراجعة",
        rationale: "مراجعة التصنيف وربطه بالمقترحات المستندة إلى طبيعة الحساب.",
        reviewedAt,
      });
      return {
        ...current,
        humanApproval: false,
        humanApprovedAt: null,
        standardMappings: {
          ...reviewedMappings,
          review: { confirmedAt: reviewedAt, reviewer: "مدير المراجعة", rationale: "اعتماد الخريطة بعد مراجعة الحسابات المعلقة وتوثيق أساس القرار." },
        },
        mappingConfirmed: true,
        auditTrail: [{ id: `LOG-${Date.now()}`, action: "اعتماد خريطة المعايير", actor: "مدير المراجعة", at: reviewedAt, detail: "اعتماد الحسابات المعلقة مع أساس مهني موثق؛ أُعيد فتح الاعتماد النهائي." }, ...(current.auditTrail || [])],
      };
    });
    onToast("تم اعتماد الحسابات المعلقة فقط، مع تسجيل المراجع والتوقيت والأساس المهني.");
  }

  return (
    <div className="view-stack">
      <section className="panel page-intro">
        <SectionHeading eyebrow="التخطيط والفحص الأولي" title="المخاطر والخريطة المعيارية" description="ربط الحسابات بالمعايير وتحديد مناطق التركيز من دون استبدال تقدير المراجع." />
        <div className="risk-summary-grid">
          <MetricCard icon={AlertTriangle} label="مخاطر مرتفعة" value={formatNumber(riskCounts.high)} helper="تحتاج أولوية اختبار" tone="red" />
          <MetricCard icon={BarChart3} label="مخاطر متوسطة" value={formatNumber(riskCounts.medium)} helper="تدخل في خطة العينة" tone="gold" />
          <MetricCard icon={CheckCircle2} label="مخاطر منخفضة" value={formatNumber(riskCounts.low)} helper="مراقبة تحليلية" tone="green" />
          <MetricCard icon={Network} label="الربط المعياري" value={`${formatNumber(metrics.accountCount - metrics.unmapped)} / ${formatNumber(metrics.accountCount)}`} helper={`${metrics.mappingRate}% مكتمل`} tone="blue" />
        </div>
        <div className={`mapping-action ${mappingReady ? "complete" : "pending"}`}>
          <div>
            {mappingReady ? <CheckCircle2 size={20} aria-hidden="true" /> : <AlertTriangle size={20} aria-hidden="true" />}
            <span><strong>{mappingReady ? "اكتمل الربط المعياري واعتماده" : metrics.unmapped ? `${formatNumber(metrics.unmapped)} حسابًا تحتاج مراجعة الربط` : "الربط مكتمل ويحتاج اعتماد المراجع"}</strong><small>{mappingReady ? "أصبحت بوابة تقييم المخاطر مكتملة." : "راجع التصنيفات المقترحة ثم وثّق اسم المراجع وأساس القرار."}</small></span>
          </div>
          {!mappingReady ? <button type="button" className="button button-outline" onClick={confirmMappings}>اعتماد خريطة الحسابات</button> : null}
        </div>
      </section>

      <div className="split-grid">
        <section className="panel">
          <SectionHeading eyebrow="ملاحظات جوهرية" title="نتائج قابلة للتنفيذ" description="تجمع كل بطاقة التعرض المالي والمعيار والخطر والإجراء والجولة والدليل في سياق واحد." />
          <AuditInsightCards
            findings={focusFindings}
            accounts={accounts}
            evidence={engagement.evidence}
            formatCurrency={formatCurrency}
            onOpenStandard={onOpenStandard}
            onOpenRound={onOpenRound}
            onOpenEvidence={() => onView?.("evidence")}
          />
          {focusFindings.some((finding) => finding.status !== "closed") ? (
            <div className="finding-close-actions" aria-label="إجراءات إغلاق النتائج">
              {focusFindings
                .filter((finding) => finding.status !== "closed")
                .map((finding) => (
                  <button
                    key={finding.id}
                    type="button"
                    className="button button-outline"
                    onClick={() => closeFinding(finding.id)}
                  >
                    إغلاق موثق <bdi dir="ltr">{finding.id}</bdi>
                  </button>
                ))}
            </div>
          ) : null}
        </section>

        <section className="panel">
          <SectionHeading eyebrow="التعرض المالي" title="أعلى الحسابات قيمة" description="ترتيب بالقيمة الدفترية لتوجيه الاختبارات." />
          <div className="exposure-list">
            {topAccounts.map((account) => (
              <div key={account.id} className="exposure-row">
                <div><strong>{account.name}</strong><small><bdi>{account.code}</bdi> · <bdi>{account.standard}</bdi></small></div>
                <bdi>{formatCurrency(account.amount)}</bdi>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Rounds({
  engagement,
  setEngagement,
  onToast,
  onOpenStandard,
  onView,
  requestedRoundId,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const hasActiveRound = engagement.rounds.some((round) => round.status === "active");

  useEffect(() => {
    if (
      !requestedRoundId ||
      !engagement.rounds.some((round) => round.id === requestedRoundId)
    ) {
      return;
    }
    setExpandedId(requestedRoundId);
    window.requestAnimationFrame(() => {
      const roundCard = document.getElementById(`round-card-${requestedRoundId}`);
      roundCard?.scrollIntoView({ behavior: "smooth", block: "center" });
      roundCard?.focus({ preventScroll: true });
    });
  }, [requestedRoundId, engagement.rounds]);

  function startRound() {
    if (hasActiveRound) {
      onToast("أكمل الجولة النشطة قبل بدء جولة جديدة.");
      return;
    }
    const hasPlannedRound = engagement.rounds.some((round) => round.status === "planned");
    if (!hasPlannedRound && engagement.council?.humanDecision?.status !== "approved") {
      onToast("تحتاج جولة المتابعة الإضافية إلى اعتماد بشري لخطة المجلس أولًا.");
      return;
    }
    setEngagement((current) => {
      const plannedRound = current.rounds.find((round) => round.status === "planned");
      if (plannedRound) {
        return {
          ...current,
          humanApproval: false,
          humanApprovedAt: null,
          rounds: current.rounds.map((round) => round.id === plannedRound.id ? { ...round, status: "active", progress: 8, startedAt: new Date().toISOString() } : round),
          auditTrail: [{ id: `LOG-${Date.now()}`, action: "بدء جولة مراجعة", actor: plannedRound.owner, at: new Date().toISOString(), detail: `${plannedRound.id} · ${plannedRound.title}` }, ...(current.auditTrail || [])],
        };
      }
      const nextNumber = current.rounds.length + 1;
      const roundId = `R-${String(nextNumber).padStart(3, "0")}`;
      const findingId = `F-${String(nextNumber).padStart(3, "0")}`;
      const evidenceId = `PBC-${String(nextNumber).padStart(3, "0")}`;
      const startedAt = new Date().toISOString();
      const followUpRound = {
        id: roundId,
        referenceId: `R${String(nextNumber).padStart(2, "0")}`,
        title: "جولة متابعة الأدلة",
        status: "active",
        progress: 12,
        findings: 1,
        findingIds: [findingId],
        evidenceIds: [evidenceId],
        owner: "مدير المراجعة",
        date: new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date()),
        risk: "medium",
        threshold: 0,
        standards: ["ISA 230", "ISA 500"],
        categoryKeys: [],
        summary: "نتيجة متابعة مفتوحة حتى استلام الدليل وفحصه وتوثيق قرار المراجع.",
        action: "ارفع الدليل المرتبط، وثّق الاستنتاج، ثم أغلق النتيجة والجولة.",
        documents: [
          { id: `${roundId}-WP`, name: `${roundId}-ورقة-متابعة.xlsx`, type: "workpaper", status: "requested", metadataOnly: true },
          { id: `${roundId}-EV`, name: `${roundId}-دليل-متابعة.pdf`, type: "evidence", status: "requested", metadataOnly: true },
        ],
        startedAt,
      };
      const followUpEvidence = {
        id: evidenceId,
        title: `حزمة أدلة — ${followUpRound.title}`,
        area: "متابعة الإكمال",
        categoryKeys: [],
        due: followUpRound.date,
        status: "pending",
        owner: followUpRound.owner,
        priority: "medium",
        roundId,
        assertions: ["الاكتمال"],
        standardIds: ["ISA 230", "ISA 500"],
        findingIds: [findingId],
        version: 1,
        fileName: null,
        hashAlgorithm: "sha256",
        hash: null,
      };
      const followUpFinding = {
        id: findingId,
        title: "استكمال دليل المتابعة",
        area: "متابعة الإكمال",
        categoryKeys: [],
        severity: "medium",
        standard: "ISA 500",
        standardIds: ["ISA 230", "ISA 500"],
        status: "open",
        roundId,
        evidenceIds: [evidenceId],
        summary: followUpRound.summary,
        recommendation: followUpRound.action,
      };
      return {
        ...current,
        humanApproval: false,
        humanApprovedAt: null,
        rounds: [...current.rounds, followUpRound],
        evidence: [...current.evidence, followUpEvidence],
        findings: [...current.findings, followUpFinding],
        auditTrail: [{ id: `LOG-${Date.now()}`, action: "بدء جولة متابعة", actor: followUpRound.owner, at: startedAt, detail: `${roundId} · أُنشئت النتيجة ${findingId} وطلب الدليل ${evidenceId} بعد اعتماد خطة المجلس.` }, ...(current.auditTrail || [])],
      };
    });
    onToast("بدأت جولة جديدة وأُضيفت إلى سجل المراجعة.");
  }

  function completeRound(id) {
    const selected = engagement.rounds.find((round) => round.id === id);
    const evidenceReady = (selected?.evidenceIds || []).every((evidenceId) => engagement.evidence.some((item) => item.id === evidenceId && item.status === "approved"));
    const findingsClosed = (selected?.findingIds || []).every((findingId) => engagement.findings.some((item) => item.id === findingId && item.status === "closed"));
    if (!evidenceReady || !findingsClosed) {
      onToast("لا يمكن إقفال الجولة قبل اعتماد أدلتها وإغلاق نتائجها المرتبطة.");
      return;
    }
    const completedAt = new Date().toISOString();
    setEngagement((current) => ({
      ...current,
      humanApproval: false,
      humanApprovedAt: null,
      rounds: current.rounds.map((round) => round.id === id ? {
        ...round,
        status: "complete",
        progress: 100,
        completedAt,
        conclusion: `${round.summary || round.title} اكتملت الإجراءات وربطت الأدلة والنتائج قبل الإقفال.`,
        result: { findingIds: [...(round.findingIds || [])], evidenceIds: [...(round.evidenceIds || [])], standards: [...(round.standards || [])], disposition: "human-reviewed" },
      } : round),
      auditTrail: [{ id: `LOG-${Date.now()}`, action: "إقفال جولة مراجعة", actor: "مدير المراجعة", at: completedAt, detail: `${id} · اكتملت الإجراءات وسُجل الاستنتاج؛ أُعيد فتح الاعتماد النهائي.` }, ...(current.auditTrail || [])],
    }));
    onToast("اكتملت الجولة ووُثق وقت الإقفال في سجل الارتباط.");
  }

  return (
    <div className="view-stack">
      <section className="panel page-intro">
        <SectionHeading eyebrow="إجراءات المراجعة" title="جولات المراجعة" description="كل جولة محفوظة بحالتها ومالكها ونسبة إنجازها وعدد الملاحظات الناتجة." action={<button type="button" className="button button-gold" onClick={startRound} disabled={hasActiveRound} title={hasActiveRound ? "أكمل الجولة النشطة أولًا" : undefined}><Plus size={18} aria-hidden="true" /> بدء جولة جديدة</button>} />
      </section>
      <section className="rounds-grid" aria-label="سجل جولات المراجعة">
        {engagement.rounds.map((round, index) => (
          <div key={round.id} className="round-timeline-item">
            <span className="round-timeline-node" aria-hidden="true">{index + 1}</span>
          <article
            id={`round-card-${round.id}`}
            tabIndex="-1"
            className={`round-card ${expandedId === round.id ? "expanded" : ""}`}
          >
            <div className="round-head">
              <span className="round-id"><RotateCcw size={18} aria-hidden="true" /><bdi>{round.id}</bdi></span>
              <span className="round-head-state">
                <span className={`risk-badge risk-${round.risk}`}>خطر {riskLabels[round.risk] || "—"}</span>
                <StatusChip status={round.status === "planned" ? "pending" : round.status}>{statusLabels[round.status]}</StatusChip>
              </span>
            </div>
            <h2>{round.title}</h2>
            <p className="round-summary">{round.summary || "لم يسجل ملخص للجولة."}</p>
            <div className="round-meta">
              <span><UserCheck size={16} aria-hidden="true" /> {round.owner}</span>
              <span><CalendarDays size={16} aria-hidden="true" /> {round.date}</span>
              <span><AlertTriangle size={16} aria-hidden="true" /> {round.findings} ملاحظات</span>
              <span><Scale size={16} aria-hidden="true" /> حد الجولة {formatCurrency(round.threshold || 0)}</span>
            </div>
            <div className="progress-row">
              <div className="progress-track" role="progressbar" aria-label={`إنجاز الجولة ${round.progress}%`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={round.progress}><span style={{ width: `${round.progress}%` }} /></div>
              <bdi>{round.progress}%</bdi>
            </div>
            <button
              type="button"
              className="button button-outline full-width"
              aria-expanded={expandedId === round.id}
              aria-controls={`round-detail-${round.id}`}
              onClick={() => setExpandedId((current) => current === round.id ? null : round.id)}
            >
              {expandedId === round.id ? "إغلاق تفاصيل الجولة" : "فتح سجل الجولة"}
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
            {expandedId === round.id ? (
              <div className="round-detail" id={`round-detail-${round.id}`}>
                <div><span>نطاق الجولة</span><strong>{round.title}</strong></div>
                <div><span>المسؤول</span><strong>{round.owner}</strong></div>
                <div><span>المخاطر</span><strong>{riskLabels[round.risk] || "—"}</strong></div>
                <div><span>الحد المرجعي</span><strong dir="ltr">{formatCurrency(round.threshold || 0)}</strong></div>
                <div><span>المعايير</span><strong className="round-standard-list">{(round.standards || []).map((standard) => <button key={standard} type="button" dir="ltr" onClick={() => onOpenStandard?.(standard)} title={`فتح ${standard} في مركز المعايير`}>{standard}</button>)}</strong></div>
                <div><span>النتيجة</span><strong>{round.summary || "لم تسجل نتيجة وصفية."}</strong></div>
                <div><span>الإجراء</span><strong>{round.action || "توثيق الإجراء والاستنتاج في ملف الجولة."}</strong></div>
                <div><span>{round.status === "complete" ? "الاستنتاج" : "الخطوة التالية"}</span><strong>{round.status === "complete" ? (round.conclusion || "اكتملت الإجراءات وحُفظ الاستنتاج.") : round.status === "planned" ? "تبدأ بعد إقفال الجولة النشطة" : "استكمال الأدلة وإغلاق نقاط المراجعة"}</strong></div>
                <div className="round-linked-records"><span>السجلات المرتبطة</span><strong>{(round.findingIds || []).map((findingId) => <button key={findingId} type="button" onClick={() => onView?.("risk")}><AlertTriangle size={14} aria-hidden="true" /><bdi dir="ltr">{findingId}</bdi></button>)}{(round.evidenceIds || []).map((evidenceId) => <button key={evidenceId} type="button" onClick={() => onView?.("evidence")}><FileCheck2 size={14} aria-hidden="true" /><bdi dir="ltr">{evidenceId}</bdi></button>)}</strong></div>
                <div className="round-documents"><span>المستندات</span><strong>{(round.documents || []).map((document) => <bdi key={document.id} dir="auto"><FileCheck2 size={14} aria-hidden="true" /> {document.name}</bdi>)}</strong></div>
                <p><ShieldCheck size={16} aria-hidden="true" /> جميع التغييرات محفوظة في سجل الارتباط المحلي ولا تغيّر التقرير قبل الاعتماد البشري.</p>
                {round.status === "active" ? <button type="button" className="button button-gold full-width" onClick={() => completeRound(round.id)}><CheckCircle2 size={18} aria-hidden="true" /> إكمال الجولة وتوثيقها</button> : null}
              </div>
            ) : null}
          </article>
          </div>
        ))}
      </section>
    </div>
  );
}

function Evidence({ engagement, setEngagement, onToast }) {
  const [filter, setFilter] = useState("all");
  const [uploadingId, setUploadingId] = useState(null);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const items = engagement.evidence.filter((item) => filter === "all" || item.status === filter);

  async function attachEvidence(id, file) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowed = ["pdf", "png", "jpg", "jpeg", "webp", "xlsx", "xls", "csv", "tsv", "txt", "docx"];
    if (!allowed.includes(extension)) {
      onToast("الصيغ المدعومة للأدلة: PDF والصور وExcel وCSV وTXT وDOCX.");
      return;
    }
    if (file.size <= 0) {
      onToast("ملف الدليل فارغ؛ اختر ملفًا يحتوي على بيانات قابلة للتحقق.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      onToast("حجم الدليل يتجاوز 25 MB؛ قسّم الملف أو ارفع نسخة أخف.");
      return;
    }
    setUploadingId(id);
    try {
      const attachedAt = new Date().toISOString();
      const bytes = await file.arrayBuffer();
      const hash = await sha256BytesHex(bytes);
      const selectedBefore = engagement.evidence.find((item) => item.id === id);
      const version = Number(selectedBefore?.version || 0) + 1;
      const datasetId = engagement.sourceDataset?.datasetId || engagement.demo?.commitment?.datasetId || "uncommitted";
      const storageKey = `${datasetId}:${id}:v${version}:${hash.slice(0, 16)}`;
      await storeEvidenceBytes(storageKey, bytes, { fileName: file.name, mediaType: file.type || "application/octet-stream", sha256: hash });
      if (selectedBefore?.storageKey && selectedBefore.storageKey !== storageKey) {
        await deleteEvidenceBytes(selectedBefore.storageKey).catch(() => {});
      }
      setEngagement((current) => {
        const selected = current.evidence.find((item) => item.id === id);
        const affectedFindingIds = new Set(selected?.findingIds || []);
        return {
          ...current,
          humanApproval: false,
          humanApprovedAt: null,
          evidence: current.evidence.map((item) => item.id === id ? {
            ...item,
            status: "received",
            version,
            fileName: file.name,
            fileSize: file.size,
            mediaType: file.type || "application/octet-stream",
            hashAlgorithm: "sha256",
            hash,
            hashInput: null,
            attachedAt,
            attachmentStorage: "indexeddb-local",
            storageKey,
            contentRetained: true,
            verifiedAt: null,
            verificationMethod: null,
            reviewedAt: null,
            reviewedBy: null,
            conclusion: null,
          } : item),
          findings: current.findings.map((finding) => affectedFindingIds.has(finding.id) ? {
            ...finding,
            status: "open",
            closedAt: null,
            closedBy: null,
            resolution: null,
          } : finding),
          rounds: current.rounds.map((round) => round.id === selected?.roundId ? {
            ...round,
            status: "active",
            progress: Math.min(Number(round.progress || 0), 90),
            completedAt: null,
            conclusion: null,
            result: null,
          } : round),
          auditTrail: [{ id: `LOG-${Date.now()}`, action: "رفع دليل وحساب بصمته", actor: "فريق المراجعة", at: attachedAt, detail: `${id} · ${file.name} · ${file.size} bytes · SHA-256 ${hash} · مرتبط بالجولة ${selected?.roundId || "—"}. حُفظ المحتوى محليًا في IndexedDB لإعادة التحقق ولم يُرسل إلى خادم.` }, ...(current.auditTrail || [])],
        };
      });
      setReviewDrafts((current) => ({ ...current, [id]: { reviewer: "مدير المراجعة", conclusion: "" } }));
      onToast("حُفظ الدليل محليًا وحُسبت بصمته من المحتوى؛ ستُعاد مطابقة البصمة قبل الاعتماد.");
    } catch {
      onToast("تعذر قراءة الملف أو حساب بصمته؛ جرّب ملفًا صالحًا مرة أخرى.");
    } finally {
      setUploadingId(null);
    }
  }

  async function advanceEvidence(id) {
    const nextStatus = { pending: "received", received: "review", review: "approved", approved: "approved" };
    const selectedNow = engagement.evidence.find((item) => item.id === id);
    if (!selectedNow?.hash || !/^[a-f0-9]{64}$/i.test(selectedNow.hash)) {
      onToast("ارفع ملفًا واحسب بصمته قبل تغيير حالة طلب الدليل.");
      return;
    }
    const draft = reviewDrafts[id] || {};
    if (selectedNow.status === "review" && (!draft.reviewer?.trim() || !draft.conclusion?.trim())) {
      onToast("أدخل اسم المراجع واستنتاج فحص الدليل قبل اعتماده.");
      return;
    }
    if (selectedNow.status === "review") {
      if (selectedNow.attachmentStorage !== "indexeddb-local" || !selectedNow.storageKey) {
        onToast("لا يمكن اعتماد الدليل من بيانات وصفية فقط؛ أعد رفع الملف للاحتفاظ به والتحقق منه محليًا.");
        return;
      }
      try {
        const retainedBytes = await readEvidenceBytes(selectedNow.storageKey);
        if (!retainedBytes || await sha256BytesHex(retainedBytes) !== selectedNow.hash) {
          onToast("تعذرت مطابقة محتوى الدليل مع بصمته؛ أعد رفع الملف قبل الاعتماد.");
          return;
        }
      } catch {
        onToast("تعذر الوصول إلى محتوى الدليل المحلي؛ أعد رفع الملف قبل الاعتماد.");
        return;
      }
    }
    const changedAt = new Date().toISOString();
    setEngagement((current) => {
      const selected = current.evidence.find((item) => item.id === id);
      const status = nextStatus[selected?.status] || selected?.status;
      return {
        ...current,
        humanApproval: false,
        humanApprovedAt: null,
        evidence: current.evidence.map((item) => item.id === id ? {
          ...item,
          status,
          reviewedAt: status === "approved" ? changedAt : null,
          reviewedBy: status === "approved" ? draft.reviewer.trim() : null,
          conclusion: status === "approved" ? draft.conclusion.trim() : null,
          verifiedAt: status === "approved" ? changedAt : null,
          verificationMethod: status === "approved" ? "sha256-recomputed-from-indexeddb" : null,
        } : item),
        auditTrail: [{ id: `LOG-${Date.now()}`, action: "تحديث دليل", actor: "فريق المراجعة", at: changedAt, detail: `${id} · ${statusLabels[status]} · مرتبط بالجولة ${selected?.roundId || "—"}؛ أُعيد فتح الاعتماد النهائي.` }, ...(current.auditTrail || [])],
      };
    });
    onToast("تم تحديث حالة المستند مع تسجيلها في مسار الأدلة.");
  }

  return (
    <div className="view-stack">
      <section className="panel page-intro">
        <SectionHeading eyebrow="PBC · الأدلة والمستندات" title="طلبات الأدلة" description="قائمة موحدة للاستلام والفحص والاعتماد، مع مالك وتاريخ استحقاق واضحين." />
        <div className="segmented-control" role="group" aria-label="تصفية طلبات الأدلة">
          {[{ id: "all", label: "الكل" }, { id: "pending", label: "بانتظار الاستلام" }, { id: "received", label: "مستلم" }, { id: "review", label: "قيد الفحص" }, { id: "approved", label: "معتمد" }].map((option) => <button key={option.id} type="button" className={filter === option.id ? "active" : ""} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}</button>)}
        </div>
      </section>

      <section className="panel evidence-panel">
        <div className="evidence-table-heading">
          <strong>{formatNumber(items.length)} طلبات ظاهرة</strong>
          <span>يُحفظ محتوى الملف محليًا في IndexedDB لإعادة مطابقة SHA-256 عند الاعتماد؛ لا يُرسل إلى خادم ولا يدخل في JSON.</span>
        </div>
        <div className="evidence-list">
          {items.map((item) => (
            <article key={item.id} className="evidence-row">
              <span className="evidence-icon" aria-hidden="true"><FileCheck2 size={20} /></span>
              <div className="evidence-main"><strong>{item.title}</strong><small><bdi>{item.id}</bdi> · {item.area} · الجولة <bdi>{item.roundId || "—"}</bdi> · الإصدار <bdi>{item.version || 1}</bdi></small><span className="gov-evidence-links">{(item.assertions || []).map((assertion) => <b key={assertion}>{assertion}</b>)}{(item.findingIds || []).map((findingId) => <bdi key={findingId}>{findingId}</bdi>)}</span>{item.fileName ? <small className="evidence-file-meta"><b>{item.fileName}</b>{Number.isFinite(item.fileSize) ? ` · ${formatNumber(item.fileSize)} بايت` : " · ملف العرض الوصفي"} · <code dir="ltr">{item.hash}</code></small> : <small className="evidence-file-meta is-empty">لم يُرفع ملف بعد.</small>}{item.status === "review" ? <div className="evidence-review-fields"><label><span>المراجع</span><input value={reviewDrafts[item.id]?.reviewer || ""} onChange={(event) => setReviewDrafts((current) => ({ ...current, [item.id]: { ...current[item.id], reviewer: event.target.value } }))} /></label><label><span>استنتاج الفحص</span><textarea rows="2" value={reviewDrafts[item.id]?.conclusion || ""} onChange={(event) => setReviewDrafts((current) => ({ ...current, [item.id]: { ...current[item.id], conclusion: event.target.value } }))} placeholder="وثّق كفاية الدليل أو القيود والاستثناءات." /></label></div> : null}{item.conclusion ? <small className="gov-evidence-result">النتيجة: {item.conclusion} · {item.reviewedBy}</small> : null}</div>
              <div className="evidence-owner"><span>المالك</span><strong>{item.owner}</strong></div>
              <div className="evidence-due"><span>الاستحقاق</span><strong>{item.due}</strong></div>
              <StatusChip status={item.status}>{statusLabels[item.status]}</StatusChip>
              <div className="evidence-actions"><label className="button button-outline compact evidence-upload-button"><Upload size={16} /> {uploadingId === item.id ? "جارٍ حساب البصمة…" : item.fileName ? "استبدال الملف" : "رفع الملف"}<input className="sr-only" type="file" disabled={uploadingId === item.id} accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.tsv,.txt,.docx,application/pdf,image/*,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={async (event) => { const file = event.target.files?.[0]; await attachEvidence(item.id, file); event.target.value = ""; }} /></label>{item.status !== "approved" ? <button type="button" className="button button-outline compact" onClick={() => advanceEvidence(item.id)} disabled={uploadingId === item.id}>{item.status === "pending" ? "تسجيل الاستلام" : item.status === "received" ? "بدء الفحص" : "اعتماد المستند"}</button> : <span className="approved-mark" aria-label="مكتمل"><CheckCircle2 size={22} /></span>}</div>
            </article>
          ))}
          {!items.length ? <div className="empty-state"><CheckCircle2 size={32} /><strong>لا توجد طلبات بهذه الحالة</strong><p>اختر تصنيفًا آخر أو راجع جميع الطلبات.</p></div> : null}
        </div>
      </section>
    </div>
  );
}

function Reports({ engagement, setEngagement, metrics, dataProfile, accounts, stages, onView, onToast, onOpenStandard }) {
  const [workbookBusy, setWorkbookBusy] = useState(false);
  const adjustmentBridge = useMemo(
    () => buildAdjustmentBridge(accounts, engagement.adjustments),
    [accounts, engagement.adjustments],
  );
  const adjustedAnalytics = useMemo(
    () => buildAnalyticalReview(adjustmentBridge.adjustedAccounts),
    [adjustmentBridge.adjustedAccounts],
  );
  const liquidityScenarios = useMemo(() => {
    const ratios = adjustedAnalytics.ratios;
    return [
      { id: "base", label: "المسجل بعد التسويات", current: ratios.currentRatio, quick: ratios.quickRatio, margin: ratios.operatingMarginPct, assumption: "قيود الجلسة المرحلة فقط" },
      { id: "stress", label: "ضغط تحليلي", current: ratios.currentRatio * 0.9 / 1.05, quick: ratios.quickRatio * 0.9 / 1.05, margin: ratios.operatingMarginPct - 5, assumption: "انخفاض الأصول المتداولة 10% وزيادة الالتزامات 5%" },
      { id: "recovery", label: "تعافٍ تحليلي", current: ratios.currentRatio * 1.08 / 0.98, quick: ratios.quickRatio * 1.08 / 0.98, margin: ratios.operatingMarginPct + 5, assumption: "تحسن الأصول المتداولة 8% وانخفاض الالتزامات 2%" },
    ];
  }, [adjustedAnalytics.ratios]);
  const {
    gates,
    readyForHumanApproval,
    reportReady,
    reportOpinion,
    selectedOpinion,
    opinionAssessment,
  } = buildReportState(engagement, metrics);
  const retainedEvidenceSignature = engagement.evidence
    .filter((item) => item.attachmentStorage === "indexeddb-local")
    .map((item) => `${item.id}:${item.storageKey}:${item.hash}:${item.fileSize}`)
    .join("|");

  const revokeApprovalForMissingEvidence = useCallback((message) => {
    const revokedAt = new Date().toISOString();
    setEngagement((current) => ({
      ...current,
      humanApproval: false,
      humanApprovedAt: null,
      report: { ...current.report, status: "draft", opinion: `${opinionLabels[selectedOpinion] || opinionLabels.not_determined} — مسودة محكومة` },
      auditTrail: [{ id: `LOG-${Date.now()}`, action: "إبطال الاعتماد لعدم توافر محتوى الدليل", actor: "محرك التحقق المحلي", at: revokedAt, detail: message }, ...(current.auditTrail || [])],
    }));
    onToast(message);
  }, [onToast, selectedOpinion, setEngagement]);

  useEffect(() => {
    if (!reportReady || !retainedEvidenceSignature) return undefined;
    let cancelled = false;
    verifyRetainedEvidence(engagement.evidence).then((integrity) => {
      if (!cancelled && !integrity.ok) revokeApprovalForMissingEvidence(`أُلغي الاعتماد لأن محتوى الدليل ${integrity.evidenceId || "المحلي"} غير متاح أو لا يطابق حجمه وبصمته.`);
    });
    return () => { cancelled = true; };
  }, [engagement.evidence, reportReady, retainedEvidenceSignature, revokeApprovalForMissingEvidence]);

  function acceptAdjustment(id) {
    const acceptedAt = new Date().toISOString();
    setEngagement((current) => ({
      ...current,
      humanApproval: false,
      humanApprovedAt: null,
      adjustments: current.adjustments.map((item, index) => {
        if (item.id !== id) return item;
        const pickLargest = (category) => accounts
          .filter((account) => account.category === category)
          .reduce((largest, account) => !largest || BigInt(account.amountMinor) > BigInt(largest.amountMinor) ? account : largest, null);
        const debitAccount = pickLargest(item.debitCategory);
        const creditAccount = pickLargest(item.creditCategory);
        const amountMinor = /^\d+$/.test(String(item.amountMinor || ""))
          ? String(item.amountMinor)
          : parseMinorUnits(String(item.amount || "0")).toString();
        return {
          ...item,
          status: "accepted",
          amountMinor,
          reviewedAt: acceptedAt,
          reviewedBy: "المراجع البشري",
          postedAt: acceptedAt,
          journalReference: item.journalReference || `JE-AUD-${String(index + 1).padStart(3, "0")}`,
          currency: "SAR",
          lines: [
            { accountId: debitAccount?.id || null, code: debitAccount?.code || item.debitCategory, name: debitAccount?.name || item.debitCategory, debitMinor: amountMinor, creditMinor: "0" },
            { accountId: creditAccount?.id || null, code: creditAccount?.code || item.creditCategory, name: creditAccount?.name || item.creditCategory, debitMinor: "0", creditMinor: amountMinor },
          ],
        };
      }),
      auditTrail: [{ id: `LOG-${Date.now()}`, action: "ترحيل قيد تسوية", actor: "المراجع البشري", at: acceptedAt, detail: `${id} · قيد متوازن ثنائي الأطراف؛ أُعيد فتح الاعتماد النهائي.` }, ...(current.auditTrail || [])],
    }));
    onToast("تم توثيق وترحيل قيد التسوية كقيد متوازن؛ يلزم تجديد الاعتماد النهائي.");
  }

  function updateOpinionAssessment(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const basis = String(formData.get("basis") || "none");
    const scopeLimitationIsMaterial = formData.get("scopeLimitationIsMaterial") === "on";
    const scopeLimitationRationaleAr = String(formData.get("scopeLimitationRationaleAr") || "").trim();
    const isPervasive = formData.get("isPervasive") === "on";
    const pervasivenessRationaleAr = String(formData.get("pervasivenessRationaleAr") || "").trim();
    if (isPervasive && pervasivenessRationaleAr.length < 10) {
      onToast("الحكم بأن الأثر منتشر يتطلب تبريرًا مهنيًا مكتوبًا.");
      return;
    }
    if (basis === "scope_limitation" && scopeLimitationIsMaterial && scopeLimitationRationaleAr.length < 10) {
      onToast("جوهرية قيد النطاق تتطلب تبريرًا مهنيًا مكتوبًا.");
      return;
    }
    if (basis === "scope_limitation" && isPervasive && !scopeLimitationIsMaterial) {
      onToast("لا يمكن اعتبار قيد النطاق منتشرًا قبل توثيق أنه جوهري.");
      return;
    }
    const updatedAt = new Date().toISOString();
    setEngagement((current) => ({
      ...current,
      opinionAssessment: {
        basis,
        scopeLimitationIsMaterial,
        scopeLimitationRationaleAr,
        isPervasive,
        pervasivenessRationaleAr,
        assessedBy: "المراجع البشري",
        assessedAt: updatedAt,
      },
      humanApproval: false,
      humanApprovedAt: null,
      report: { ...current.report, status: "draft", opinion: "رأي مشتق — مسودة محكومة", lastUpdated: updatedAt },
      auditTrail: [{ id: `LOG-${Date.parse(updatedAt)}-ISA705`, action: "تحديث مدخلات ISA 705", actor: "المراجع البشري", at: updatedAt, detail: `${basis} · ${isPervasive ? "منتشر" : "غير منتشر"} · نوع الرأي أعاد المحرك اشتقاقه.` }, ...(current.auditTrail || [])],
    }));
    onToast("حُفظت مدخلات الحكم البشري وأعاد المحرك اشتقاق نوع الرأي.");
  }

  async function toggleHumanApproval() {
    if (!readyForHumanApproval) {
      onToast("أكمل الأدلة والملاحظات الجوهرية والتسويات قبل الاعتماد البشري.");
      return;
    }
    const nextApproval = !engagement.humanApproval;
    if (nextApproval) {
      const integrity = await verifyRetainedEvidence(engagement.evidence);
      if (!integrity.ok) {
        revokeApprovalForMissingEvidence(`تعذر اعتماد التقرير: محتوى الدليل ${integrity.evidenceId || "المحلي"} غير متاح أو لا يطابق حجمه وبصمته.`);
        return;
      }
    }
    const approvalAt = new Date().toISOString();
    const updatedAt = new Intl.DateTimeFormat("ar-SA", { dateStyle: "long", timeStyle: "short" }).format(new Date());
    setEngagement((current) => ({
      ...current,
      humanApproval: nextApproval,
      humanApprovedAt: nextApproval ? approvalAt : null,
      report: { ...current.report, status: nextApproval ? "ready" : "draft", opinion: `${opinionLabels[selectedOpinion]} — ${nextApproval ? "جاهز للإصدار" : "مسودة محكومة"}`, lastUpdated: updatedAt },
      auditTrail: [{ id: `LOG-${Date.now()}`, action: nextApproval ? "اعتماد التقرير" : "إلغاء اعتماد التقرير", actor: "المراجع البشري", at: approvalAt, detail: `${opinionLabels[selectedOpinion]} · ${nextApproval ? "سُجل الاعتماد بعد فحص البوابات." : "أعيد التقرير إلى المسودة."}` }, ...(current.auditTrail || [])],
    }));
    onToast(nextApproval ? "سُجل اعتماد المراجع البشري مع الوقت وأصبح التقرير جاهزًا." : "أُلغي الاعتماد البشري وعاد التقرير إلى المسودة.");
  }

  async function exportReport() {
    const integrity = await verifyRetainedEvidence(engagement.evidence);
    if (!integrity.ok) {
      revokeApprovalForMissingEvidence(`أوقف التصدير: محتوى الدليل ${integrity.evidenceId || "المحلي"} غير متاح أو لا يطابق حجمه وبصمته.`);
      return;
    }
    const report = {
      generatedAt: new Date().toISOString(),
      entity: engagement.entity,
      demo: engagement.demo,
      dataset: dataProfile,
      summary: {
        accountCount: metrics.accountCount,
        sourceTotalDebit: metrics.totalDebit,
        sourceTotalCredit: metrics.totalCredit,
        adjustedTotalDebit: adjustmentBridge.adjustedDebit,
        adjustedTotalCredit: adjustmentBridge.adjustedCredit,
        postedAdjustments: adjustmentBridge.postedDebit,
        materiality: metrics.materiality,
        performanceMateriality: metrics.performanceMateriality,
        materialityPolicy: engagement.materialityPolicy,
        mappingRate: metrics.mappingRate,
      },
      adjustedAnalytics,
      adjustmentBridge: { ...adjustmentBridge, adjustedAccounts: undefined },
      evidence: engagement.evidence,
      findings: engagement.findings,
      adjustments: engagement.adjustments,
      analyticsReview: engagement.analyticsReview,
      periodLocks: engagement.periodLocks,
      council: engagement.council,
      auditTrail: engagement.auditTrail,
      humanApproval: engagement.humanApproval,
      status: "approved",
      opinion: reportOpinion,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "kosif-governed-audit-report.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
    onToast("تم تصدير ملف التقرير المحكوم.");
  }

  async function exportTemporarySession() {
    try {
      const snapshot = await buildTemporarySessionSnapshot({ accounts, engagement, metrics, dataProfile, stages });
      downloadTextFile(JSON.stringify(snapshot, null, 2), timestampedFilename("kosif-temporary-session", "json"), "application/json;charset=utf-8");
      onToast("تم تنزيل لقطة الجلسة المؤقتة كاملة دون تغيير حالة التقرير المحكوم.");
    } catch {
      onToast("تعذر تجهيز لقطة الجلسة المؤقتة. أعد المحاولة.");
    }
  }

  function exportCurrentAccounts() {
    downloadTextFile(buildAccountsCsv(accounts, engagement.standardMappings), timestampedFilename("kosif-current-trial-balance", "csv"), "text/csv;charset=utf-8");
    onToast(`تم تنزيل جميع حسابات الجلسة الحالية: ${formatNumber(accounts.length)} حسابًا.`);
  }

  async function exportSessionWorkbook() {
    if (workbookBusy) return;
    setWorkbookBusy(true);
    try {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const snapshot = await buildTemporarySessionSnapshot({ accounts, engagement, metrics, dataProfile, stages });
      const { bytes, filename } = await createSessionWorkbookBytes(snapshot);
      downloadWorkbookBytes(bytes, filename);
      onToast(`تم تنزيل أوراق عمل الجلسة الحالية: ${formatNumber(accounts.length)} حسابًا و12 ورقة.`);
    } catch {
      onToast("تعذر تجهيز ملف XLSX للجلسة الحالية. أعد المحاولة بعد التحقق من البيانات.");
    } finally {
      setWorkbookBusy(false);
    }
  }

  async function printReport() {
    if (reportReady) {
      const integrity = await verifyRetainedEvidence(engagement.evidence);
      if (!integrity.ok) {
        revokeApprovalForMissingEvidence(`أوقفت الطباعة: محتوى الدليل ${integrity.evidenceId || "المحلي"} غير متاح أو لا يطابق حجمه وبصمته.`);
        return;
      }
    }
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    window.print();
    onToast(reportReady ? "فُتحت معاينة الطباعة للتقرير المكتمل؛ يمكنك حفظه PDF." : "فُتحت معاينة الطباعة؛ احفظ PDF كمسودة ما لم تكن كل البوابات مكتملة.");
  }

  return (
    <div className="view-stack">
      <section className={`report-hero ${reportReady ? "ready" : "locked"}`}>
        {!reportReady ? <span className="draft-print-watermark" aria-hidden="true">مسودة غير معتمدة</span> : null}
        <div className="report-status-icon" aria-hidden="true">{reportReady ? <BadgeCheck size={34} /> : <LockKeyhole size={34} />}</div>
        <div>
          <span className="eyebrow">المخرجات المحكومة</span>
          <h1>{reportReady ? "التقرير جاهز للإصدار" : "التقرير محمي ببوابات الإكمال"}</h1>
          <p>{reportReady ? "اكتملت الأدلة والتسويات وسُجل اعتماد المراجع البشري." : "أكمل العناصر المتبقية؛ لن تُحوّل المسودة إلى تقرير قابل للإصدار تلقائيًا."}</p>
        </div>
        <div className="button-row"><button type="button" className="button button-outline" onClick={printReport}><Printer size={18} aria-hidden="true" /> PDF للجلسة الحالية</button></div>
      </section>

      <section className="panel export-center" aria-labelledby="export-center-title">
        <SectionHeading id="export-center-title" eyebrow="PDF · XLSX · JSON" title="مركز حزم العمل" description="مخرجات حية تُبنى من الجلسة الحالية نفسها، سواء كانت بيانات العرض أو ميزانًا مستوردًا، مع بقاء الإصدار النهائي محكومًا بالبوابات والاعتماد البشري." />
        <div className="export-grid">
          <article>
            <span className="export-icon"><FileText size={23} aria-hidden="true" /></span>
            <div><h3>PDF للجلسة الحالية</h3><p>يفتح تقرير الجلسة الحالية للطباعة أو الحفظ PDF؛ تظهر علامة «مسودة غير معتمدة» تلقائيًا عند نقص أي بوابة.</p></div>
            <button type="button" className="button button-outline" onClick={printReport}><Printer size={17} aria-hidden="true" /> طباعة / حفظ PDF</button>
          </article>
          <article>
            <span className="export-icon"><Scale size={23} aria-hidden="true" /></span>
            <div><h3>أوراق عمل الجلسة الحالية</h3><p>اثنتا عشرة ورقة من المصدر الحي: الميزان قبل وبعد التسويات، الجسر، الخريطة، الجولات، الأدلة، النتائج، البوابات والمصادر.</p></div>
            <button type="button" className="button button-outline" disabled={workbookBusy} onClick={exportSessionWorkbook}><Download size={17} aria-hidden="true" /> {workbookBusy ? "جارٍ تجهيز 12 ورقة…" : "تنزيل XLSX الحالي"}</button>
          </article>
          <article>
            <span className="export-icon"><Fingerprint size={23} aria-hidden="true" /></span>
            <div><h3>بيان JSON محكوم</h3><p>لقطة الحالة الحالية تشمل الأدلة والنتائج والتسويات والمجلس وسجل التدقيق، وتُفتح بعد اكتمال الاعتماد.</p></div>
            <button type="button" className="button button-dark" disabled={!reportReady} onClick={exportReport}><Download size={17} aria-hidden="true" /> تصدير JSON الحالي</button>
          </article>
          <article>
            <span className="export-icon"><Database size={23} aria-hidden="true" /></span>
            <div><h3>لقطة الجلسة المؤقتة</h3><p>JSON كامل للحالة الملتزم بها حاليًا: كل الحسابات والنتائج والمعايير والحوكمة والبوابات، حتى لو كان التقرير مسودة.</p></div>
            <button type="button" className="button button-outline" onClick={exportTemporarySession}><Download size={17} aria-hidden="true" /> تنزيل JSON مؤقت</button>
          </article>
          <article>
            <span className="export-icon"><Scale size={23} aria-hidden="true" /></span>
            <div><h3>الميزان الحالي كاملًا</h3><p>CSV يحتوي كل الحسابات الحالية بقيم الوحدات الصغرى والربط الفعلي، مع حماية خلايا الجداول من الصيغ.</p></div>
            <button type="button" className="button button-outline" onClick={exportCurrentAccounts}><Download size={17} aria-hidden="true" /> تنزيل CSV الحالي</button>
          </article>
          <article>
            <span className="export-icon"><ListChecks size={23} aria-hidden="true" /></span>
            <div><h3>كل نتائج التطبيق</h3><p>شاشة واحدة تجمع النتائج المالية والمعايير والعينة والدفتر والجولات والأدلة والملاحظات وبوابات الإصدار.</p></div>
            <button type="button" className="button button-outline" onClick={() => onView("results")}><ArrowLeft size={17} aria-hidden="true" /> فتح مركز النتائج</button>
          </article>
          <article>
            <span className="export-icon"><FileCheck2 size={23} aria-hidden="true" /></span>
            <div><h3>مرجع العرض المتحقق</h3><p>نسختا PDF وXLSX الثابتتان لمجموعة KOSIF-DEMO-5000-v7 فقط، للاختبار والمقارنة ولا تمثلان ميزانًا مستوردًا.</p></div>
            <div className="button-row"><a className="button button-outline compact" href="/downloads/kosif-audit-report-5000.pdf" download><Download size={15} aria-hidden="true" /> PDF العرض</a><a className="button button-outline compact" href="/downloads/kosif-audit-workpapers-5000.xlsx" download><Download size={15} aria-hidden="true" /> XLSX العرض</a></div>
          </article>
        </div>
        <p className="export-note"><ShieldCheck size={16} aria-hidden="true" /> ينشئ المتصفح PDF وXLSX وJSON وCSV من الجلسة الحالية دون رفع البيانات إلى خدمة خارجية. لا تتضمن الحزم بايتات المرفقات، وهي غير مشفرة؛ التقرير النهائي وحده يظل خاضعًا لـ12 بوابة والاعتماد البشري. مصدر الجلسة الحالية: {dataProfile?.label || "سيناريو KOSIF التجريبي"}.</p>
      </section>

      <section className="panel report-evidence-basis" aria-labelledby="report-basis-title">
        <SectionHeading id="report-basis-title" eyebrow="قبل · قيود · بعد" title="أساس التقرير وجسر التسويات" description="يفصل الميزان المصدر عن قيود المراجعة والميزان المعدل؛ المؤشرات أدناه محسوبة من الحالة المعدلة ولا تغيّر رأي المراجع تلقائيًا." />
        <div className="report-bridge-grid">
          <article><span>قبل التسويات</span><strong>{formatCurrency(adjustmentBridge.beforeDebit)}</strong><small>إجمالي المدين = الدائن في ملف المصدر</small></article>
          <article><span>قيود مرحلة</span><strong>{formatCurrency(adjustmentBridge.postedDebit)}</strong><small>{adjustmentBridge.postedCount} قيود · مدين = دائن</small></article>
          <article><span>إجمالي رقابة الترحيل</span><strong>{formatCurrency(adjustmentBridge.journalizedDebit)}</strong><small>المصدر + إجمالي أطراف القيود</small></article>
          <article><span>الميزان المعدل الصافي</span><strong>{formatCurrency(adjustmentBridge.adjustedDebit)}</strong><small>بعد إعادة صافي كل حساب إلى جانبه الصحيح</small></article>
        </div>
        <div className="report-basis-grid">
          <article>
            <h3>أساس الرأي والحدود</h3>
            <ul>
              <li>نوع الرأي مشتق حصريًا من مدخلات ISA 705: {opinionLabels[selectedOpinion]}.</li>
              <li>التسويات المرحلة: {adjustmentBridge.postedCount}؛ النتائج المفتوحة: {engagement.findings.filter((item) => item.status !== "closed").length}.</li>
              <li>بصمات أدلة العرض الاصطناعية هي بصمات fixture موثقة؛ رفع ملف حقيقي يعاد تجزئته من البايتات محليًا.</li>
              <li>التقرير أداة عمل مساعدة، وليس توقيعًا أو تقرير مراجع مستقلًا صالحًا للاستخدام الخارجي.</li>
            </ul>
          </article>
          <article>
            <h3>مصدر الرقم وتاريخ القطع</h3>
            <dl>
              <div><dt>المجموعة</dt><dd dir="ltr">{metrics.datasetId || "—"}</dd></div>
              <div><dt>الفترة</dt><dd>{metrics.datasetPeriod || engagement.entity.period}</dd></div>
              <div><dt>العملة</dt><dd dir="ltr">{metrics.datasetCurrency || "SAR"}</dd></div>
              <div><dt>وقت الالتزام</dt><dd dir="ltr">{metrics.datasetCommittedAt || "—"}</dd></div>
            </dl>
          </article>
        </div>
        <h3 className="scenario-title">مؤشرات الاستمرارية — سيناريوهات تحليلية وليست أدلة مراجعة</h3>
        <div className="report-scenario-grid">
          {liquidityScenarios.map((scenario) => (
            <article key={scenario.id}>
              <span>{scenario.label}</span>
              <strong dir="ltr">{scenario.current.toFixed(2)}×</strong>
              <small>سريعة {scenario.quick.toFixed(2)}× · هامش تشغيل {scenario.margin.toFixed(1)}%</small>
              <p>{scenario.assumption}</p>
            </article>
          ))}
        </div>
        <p className="report-going-concern-note"><AlertTriangle size={17} aria-hidden="true" /> نسبة تداول تقارب {adjustedAnalytics.ratios.currentRatio.toFixed(2)}× وسيولة سريعة {adjustedAnalytics.ratios.quickRatio.toFixed(2)}× وهامش تشغيلي {adjustedAnalytics.ratios.operatingMarginPct.toFixed(1)}% تستلزم تقييم إدارة موثقًا للتدفقات والتعهدات والأحداث اللاحقة؛ لا تستنتج المنصة ملاءمة الاستمرارية تلقائيًا.</p>
      </section>

      <div className="split-grid report-grid">
        <section className="panel">
          <SectionHeading eyebrow="قائمة الإكمال" title="بوابات الإصدار" description="كل بوابة مرتبطة بدليل أو قرار موثق." />
          <div className="gate-list">
            {gates.map((gate) => <div key={gate.label} className={gate.pass ? "gate-pass" : "gate-blocked"}>{gate.pass ? <CheckCircle2 size={21} /> : <AlertTriangle size={21} />}<div><strong>{gate.label}</strong><small>{gate.detail}</small></div></div>)}
          </div>
          {engagement.adjustments.length ? <div className="adjustment-review" aria-label="سجل قيود التسوية">{engagement.adjustments.map((item) => <div key={item.id}><span><strong>{item.title}</strong><small><bdi>{item.id}</bdi> · {formatCurrency(item.amount)}{item.journalReference ? ` · ${item.journalReference}` : ""}</small></span>{item.status === "pending" ? <button type="button" className="text-button" onClick={() => acceptAdjustment(item.id)}>مراجعة وقبول</button> : <b className="gov-count success"><CheckCircle2 size={14} /> مقبول</b>}</div>)}</div> : null}
          <button type="button" className={`button full-width ${engagement.humanApproval ? "button-outline" : "button-gold"}`} onClick={toggleHumanApproval}>{engagement.humanApproval ? "إلغاء الاعتماد البشري" : "تسجيل اعتماد المراجع البشري"}</button>
        </section>

        <section className="panel opinion-card">
          <span className="opinion-watermark">REPORT</span>
          <span className="eyebrow">{reportReady ? "الرأي المعتمد لبيانات العرض" : "مسودة الرأي"}</span>
          <h2>{reportOpinion}</h2>
          <p>{reportReady ? "اكتملت إجراءات وأدلة سيناريو العرض، واشتق المحرك نوع الرأي من التقييم الكمي وحكم الانتشار البشري، ثم سُجل الاعتماد النهائي." : "استنادًا إلى الإجراءات المنفذة والأدلة الموثقة، لم تصل المسودة الحالية بعد إلى مرحلة الإصدار النهائي ما لم تُستوفَ جميع بوابات الإكمال."}</p>
          <form className="opinion-selector" onSubmit={updateOpinionAssessment}>
            <span>مدخلات الحكم المهني — النوع غير قابل للكتابة</span>
            <label><small>أساس التعديل</small><select name="basis" defaultValue={engagement.opinionAssessment?.basis || "none"} disabled={engagement.humanApproval}><option value="none">لا يوجد</option><option value="misstatement">تحريف</option><option value="scope_limitation">قيد نطاق</option></select></label>
            <label className="opinion-pervasive"><input name="scopeLimitationIsMaterial" type="checkbox" defaultChecked={Boolean(engagement.opinionAssessment?.scopeLimitationIsMaterial)} disabled={engagement.humanApproval} /><span>قيد النطاق جوهري — حكم بشري</span></label>
            <label><small>مبرر جوهرية قيد النطاق</small><textarea name="scopeLimitationRationaleAr" rows="3" defaultValue={engagement.opinionAssessment?.scopeLimitationRationaleAr || ""} disabled={engagement.humanApproval} /></label>
            <label className="opinion-pervasive"><input name="isPervasive" type="checkbox" defaultChecked={Boolean(engagement.opinionAssessment?.isPervasive)} disabled={engagement.humanApproval} /><span>الأثر منتشر — حكم بشري</span></label>
            <label><small>مبرر الانتشار أو عدمه</small><textarea name="pervasivenessRationaleAr" rows="3" defaultValue={engagement.opinionAssessment?.pervasivenessRationaleAr || ""} disabled={engagement.humanApproval} /></label>
            <small>المحرك: التعرض الكمي بلا مقاصة {formatMinorUnits(opinionAssessment.quantitativeExposureMinor || "0")} · الصافي للعرض فقط {formatMinorUnits(opinionAssessment.netMinor || "0")} · {opinionAssessment.isMaterial ? "جوهري" : "غير جوهري"} · النتيجة {opinionLabels[selectedOpinion]}.</small>
            <button type="submit" className="button button-outline compact" disabled={engagement.humanApproval}>حفظ المدخلات وإعادة الاشتقاق</button>
          </form>
          <dl>
            <div><dt>آخر تحديث</dt><dd>{engagement.report.lastUpdated}</dd></div>
            <div><dt>الإطار</dt><dd>{engagement.entity.framework}</dd></div>
            <div><dt>الأهمية النسبية</dt><dd dir="ltr">{formatCurrency(metrics.materiality)}</dd></div>
            <div><dt>أهمية التنفيذ</dt><dd dir="ltr">{formatCurrency(metrics.performanceMateriality)}</dd></div>
          </dl>
          <div className="legal-note"><ShieldCheck size={18} /> أداة مساعدة تحليلية ولا تُغني عن مراجع خارجي مرخّص.</div>
        </section>
      </div>

      <ProfessionalOutputs
        accounts={accounts}
        engagement={engagement}
        metrics={metrics}
        formatCurrency={formatCurrency}
        onOpenStandard={onOpenStandard}
        onToast={onToast}
      />
    </div>
  );
}

function SettingsView({ engagement, setEngagement, onSaved, onToast, summaryText }) {
  const [acceptance, setAcceptance] = useState(engagement.acceptance);

  function saveEntity(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const entity = Object.fromEntries(["name", "period", "currency", "activity", "framework", "entityType"].map((key) => [key, formData.get(key)]));
    const omRateBp = Math.min(10_000, Math.max(1, Number.parseInt(formData.get("omRateBp"), 10) || 75));
    const pmRateBp = Math.min(10_000, Math.max(1, Number.parseInt(formData.get("pmRateBp"), 10) || 7500));
    const cttRateBp = Math.min(10_000, Math.max(1, Number.parseInt(formData.get("cttRateBp"), 10) || 500));
    const rationaleAr = String(formData.get("materialityRationale") || "").trim();
    if (rationaleAr.length < 10) {
      onToast("اكتب مبررًا مهنيًا واضحًا لاختيار مرجع ونسب الأهمية النسبية.");
      return;
    }
    const savedAt = new Date().toISOString();
    setEngagement((current) => ({
      ...current,
      entity,
      humanApproval: false,
      humanApprovedAt: null,
      report: { ...current.report, status: "draft", opinion: "رأي مشتق — مسودة محكومة", lastUpdated: new Intl.DateTimeFormat("ar-SA", { dateStyle: "long", timeStyle: "short" }).format(new Date()) },
      materialityPolicy: {
        ...current.materialityPolicy,
        omRateBp,
        pmRateBp,
        cttRateBp,
        rationaleAr,
        percentage: omRateBp / 100,
        performancePercentage: pmRateBp / 100,
        approvedAt: savedAt,
        approvedBy: "شريك الارتباط",
      },
      acceptance: { ...acceptance, approvedAt: Object.values(acceptance).filter((value) => typeof value === "boolean").every(Boolean) ? savedAt : null },
      auditTrail: [{ id: `LOG-${Date.now()}`, action: "تحديث بيانات الارتباط", actor: "شريك الارتباط", at: savedAt, detail: "حُفظت هوية الارتباط وسياسة الأهمية النسبية وأُعيد فتح الاعتماد النهائي." }, ...(current.auditTrail || [])],
    }));
    onToast("تم حفظ بيانات الارتباط وسياسة الأهمية النسبية وتحديث بوابة القبول.");
    onSaved();
  }

  const checks = [
    ["independence", "الاستقلال", "تم تقييم الاستقلال والتهديدات والإجراءات الوقائية."],
    ["conflicts", "تعارض المصالح", "تم فحص العلاقات والتعارضات المحتملة."],
    ["integrity", "نزاهة العميل", "تم تقييم خلفية الإدارة وأسباب الاستمرار."],
    ["terms", "شروط الارتباط", "تم توثيق النطاق والمسؤوليات وشروط الارتباط."],
  ];
  const acceptanceComplete = checks.every(([key]) => acceptance[key]);

  return (
    <div className="view-stack">
      <section className="panel page-intro">
        <SectionHeading eyebrow="المنشأة والارتباط" title="إعداد ملف المراجعة" description="بيانات أساسية وبوابة قبول مهنية تسبق تنفيذ أي إجراء جوهري." />
      </section>

      <form className="settings-form" onSubmit={saveEntity}>
        <section className="panel acceptance-panel">
          <SectionHeading eyebrow="بوابة مهنية" title="قبول واستمرار الارتباط" description="يجب توثيق العناصر الأربعة قبل اعتبار الإعداد مكتملًا." />
          <div className="acceptance-grid">
            {checks.map(([key, title, detail]) => (
              <label key={key} className={acceptance[key] ? "checked" : ""}>
                <input type="checkbox" checked={Boolean(acceptance[key])} onChange={(event) => setAcceptance((current) => ({ ...current, [key]: event.target.checked }))} />
                <span className="check-box" aria-hidden="true">{acceptance[key] ? <Check size={17} /> : null}</span>
                <span><strong>{title}</strong><small>{detail}</small></span>
              </label>
            ))}
          </div>
          <div className={`acceptance-state ${acceptanceComplete ? "success" : "warning"}`}>{acceptanceComplete ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}<span>{acceptanceComplete ? "اكتملت متطلبات القبول ويمكن حفظ القرار." : "أكمل جميع المتطلبات قبل اعتماد بيانات الارتباط."}</span></div>
        </section>

        <section className="panel">
          <SectionHeading eyebrow="بيانات المنشأة" title="هوية الارتباط" description="تظهر هذه البيانات في لوحة العمل والمخرجات." />
          <div className="form-grid">
            <label><span>اسم المنشأة</span><input name="name" defaultValue={engagement.entity.name} required /></label>
            <label><span>الفترة المالية</span><input name="period" defaultValue={engagement.entity.period} required /></label>
            <label><span>عملة العرض</span><select name="currency" defaultValue={engagement.entity.currency}><option>ريال سعودي</option></select></label>
            <label><span>النشاط الرئيس</span><input name="activity" defaultValue={engagement.entity.activity} required /></label>
            <label><span>الإطار المحاسبي</span><select name="framework" defaultValue={engagement.entity.framework}><option>المعايير الدولية كما اعتمدتها الهيئة</option><option>المعيار الدولي للمنشآت الصغيرة والمتوسطة</option></select></label>
            <label><span>طبيعة الكيان</span><select name="entityType" defaultValue={engagement.entity.entityType}><option>شركة غير مدرجة</option><option>شركة مدرجة</option><option>مؤسسة فردية</option></select></label>
          </div>
          <div className="policy-divider">
            <div><span className="eyebrow">ISA 320</span><h3>سياسة الأهمية النسبية</h3><p>حد مهني قابل للتعديل، محفوظ بإصدار السياسة ولا يُستنتج تلقائيًا.</p></div>
            <div className="form-grid">
              <label><span>OM — نقاط أساس من المرجع</span><input name="omRateBp" type="number" min="1" max="10000" step="1" defaultValue={engagement.materialityPolicy.omRateBp || 75} required /></label>
              <label><span>PM — نقاط أساس من OM</span><input name="pmRateBp" type="number" min="1" max="10000" step="1" defaultValue={engagement.materialityPolicy.pmRateBp || 7500} required /></label>
              <label><span>CTT — نقاط أساس من OM</span><input name="cttRateBp" type="number" min="1" max="10000" step="1" defaultValue={engagement.materialityPolicy.cttRateBp || 500} required /></label>
              <label className="wide"><span>المبرر المهني</span><textarea name="materialityRationale" rows="3" defaultValue={engagement.materialityPolicy.rationaleAr || ""} required /></label>
            </div>
          </div>
          <div className="form-actions"><button type="button" className="button button-outline" onClick={() => onToast("لا تُحذف البيانات تلقائيًا؛ استخدم إعادة بيانات العرض من أعلى الصفحة عند الحاجة.")}>مراجعة سياسة البيانات</button><button type="submit" className="button button-gold" disabled={!acceptanceComplete}><ClipboardCheck size={18} /> حفظ واعتماد البيانات</button></div>
        </section>
      </form>
      <WorkspaceAccessibility summaryText={summaryText} summaryLabel="ملخص ملف الارتباط الحالي" onStatusChange={({ message }) => onToast?.(message)} />
    </div>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return <div className="toast" role="status" aria-live="polite"><CheckCircle2 size={20} aria-hidden="true" />{message}</div>;
}

export function App() {
  const [accounts, setAccounts] = useState(() => generateTrialBalance());
  const [dataProfile, setDataProfile] = useState(DEMO_DATA_PROFILE);
  const [engagement, setEngagement] = useState(loadEngagement);
  const [activeView, setActiveView] = useState("overview");
  const [toast, setToast] = useState("");
  const [appearance, setAppearance] = useState(loadAppearance);
  const [pathGuideOpen, setPathGuideOpen] = useState(() => {
    try {
      return localStorage.getItem(PATH_GUIDE_KEY) !== "seen";
    } catch {
      return true;
    }
  });
  const [requestedStandard, setRequestedStandard] = useState({ id: null, accountId: null, source: null });
  const [requestedRoundId, setRequestedRoundId] = useState(null);
  const [pendingSessionRestore, setPendingSessionRestore] = useState(null);
  const mainRef = useRef(null);

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(FONT_SCALE_KEY) || 100);
      const bounded = Number.isFinite(stored) ? Math.min(125, Math.max(100, stored)) : 100;
      document.documentElement.style.fontSize = `${bounded}%`;
    } catch {
      document.documentElement.style.fontSize = "100%";
    }
  }, []);

  const closePathGuide = useCallback(() => {
    setPathGuideOpen(false);
    try {
      localStorage.setItem(PATH_GUIDE_KEY, "seen");
    } catch {
      // The guide remains available from the header even when storage is blocked.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = appearance.theme;
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    } catch {
      // Appearance preferences are optional and never block the audit workspace.
    }
  }, [appearance]);

  useEffect(() => {
    if (!discardedImportedSnapshotOnLoad) return;
    discardedImportedSnapshotOnLoad = false;
    clearEvidenceStore().catch(() => {});
    setToast("أُعيدت بيانات العرض لأن الميزان المستورد كان مؤقتًا؛ نزّل لقطة الجلسة قبل إعادة تحميل الصفحة.");
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(engagement));
    } catch {
      setToast("تعذر حفظ الحالة محليًا؛ يمكنك متابعة الجلسة الحالية دون فقد الوظائف.");
    }
  }, [engagement]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const metrics = useMemo(() => {
    let totalDebitMinor = 0n;
    let totalCreditMinor = 0n;
    let revenueMinor = 0n;
    for (const account of accounts) {
      totalDebitMinor += BigInt(account.debitMinor);
      totalCreditMinor += BigInt(account.creditMinor);
      if (account.category === "revenue") revenueMinor += BigInt(account.creditMinor) - BigInt(account.debitMinor);
    }
    const totalDebit = Number(totalDebitMinor) / 100;
    const totalCredit = Number(totalCreditMinor) / 100;
    const revenue = Number(revenueMinor) / 100;
    const balanceDifferenceMinor = totalDebitMinor >= totalCreditMinor ? totalDebitMinor - totalCreditMinor : totalCreditMinor - totalDebitMinor;
    const mapping = buildMappingMetrics(accounts, engagement.standardMappings);
    const omRateBp = Number.isInteger(engagement.materialityPolicy?.omRateBp) ? engagement.materialityPolicy.omRateBp : 75;
    const pmRateBp = Number.isInteger(engagement.materialityPolicy?.pmRateBp) ? engagement.materialityPolicy.pmRateBp : 7500;
    const cttRateBp = Number.isInteger(engagement.materialityPolicy?.cttRateBp) ? engagement.materialityPolicy.cttRateBp : 500;
    const materialityResult = buildMateriality({
      benchmarkMinor: String(absBig(revenueMinor)),
      omRateBp,
      pmRateBp,
      cttRateBp,
      rationaleAr: engagement.materialityPolicy?.rationaleAr || "اعتمدت إيرادات العقود مرجعًا أوليًا لحجم نشاط المنشأة.",
    });
    const materialityMinor = BigInt(materialityResult.omMinor);
    const performanceMaterialityMinor = BigInt(materialityResult.pmMinor);
    const clearlyTrivialMinor = BigInt(materialityResult.cttMinor);
    const materiality = Number(materialityMinor) / 100;
    const performanceMaterialityPercentage = pmRateBp / 100;
    const materialityPercentage = omRateBp / 100;
    const liveCommitment = buildDatasetCommitment(accounts, {
      period: engagement.entity.period,
      currency: dataProfile.currency || "SAR",
      committedAt: dataProfile.committedAt,
    });
    return {
      accountCount: accounts.length,
      totalDebit,
      totalCredit,
      revenue,
      materiality,
      materialityMinor: String(materialityMinor),
      performanceMateriality: Number(performanceMaterialityMinor) / 100,
      performanceMaterialityMinor: String(performanceMaterialityMinor),
      clearlyTrivialMinor: String(clearlyTrivialMinor),
      omRateBp,
      pmRateBp,
      cttRateBp,
      performanceMaterialityPercentage,
      materialityPercentage,
      materialityPolicyVersion: engagement.materialityPolicy?.version || "—",
      balanceDifference: Number(balanceDifferenceMinor) / 100,
      isBalanced: balanceDifferenceMinor === 0n,
      unmapped: mapping.unresolved,
      mappingRate: mapping.mappingRate,
      mappingReviewed: mapping.reviewed,
      mappingSuggested: mapping.suggested,
      datasetId: liveCommitment.datasetId,
      datasetDigest: liveCommitment.sha256,
      datasetPeriod: liveCommitment.period,
      datasetCurrency: liveCommitment.currency,
      datasetCommittedAt: liveCommitment.committedAt,
    };
  }, [accounts, engagement.standardMappings, engagement.materialityPolicy, engagement.entity.period, dataProfile.currency, dataProfile.committedAt]);

  const reportState = useMemo(() => buildReportState(engagement, metrics), [engagement, metrics]);

  const stages = useMemo(() => {
    const acceptanceComplete = ["independence", "conflicts", "integrity", "terms"].every((key) => engagement.acceptance[key]);
    const evidenceComplete = reportState.pendingEvidence === 0;
    const roundsComplete = reportState.roundsComplete;
    const findingsComplete = reportState.openFindings === 0;
    const adjustmentsComplete = reportState.pendingAdjustments === 0;
    const analyticsComplete = reportState.analyticsReviewed;
    const periodLocked = reportState.periodLocked;
    const councilComplete = reportState.councilApproved;
    const definitions = [
      ["setup", "إعداد الارتباط", "settings", ClipboardCheck, acceptanceComplete, "بيانات وهوية وقبول"],
      ["intake", "تحضير البيانات", "data-intake", FileUp, metrics.isBalanced && metrics.accountCount > 0, "استيراد وفحص قبل الالتزام"],
      ["standards", "اعتماد الخريطة", "standards", BookOpen, reportState.mappingApproved, "ربط معياري قابل للتتبع"],
      ["analytics", "مراجعة التحليلات", "analytics", PieChart, analyticsComplete, "نسب وعينة وإقرار بشري"],
      ["integrity", "قفل الدفتر", "integrity", Fingerprint, periodLocked, "بصمات وفترات وقاعدة شخصين"],
      ["council", "مجلس المراجعين", "council", BrainCircuit, councilComplete, "آراء استشارية وقرار بشري"],
      ["evidence", "طلبات الأدلة", "evidence", FolderCheck, evidenceComplete, "استلام وفحص واعتماد"],
      ["testing", "إجراءات المراجعة", "rounds", RotateCcw, roundsComplete, "جولات واختبارات"],
      ["findings", "النتائج والتسويات", "risk", AlertTriangle, findingsComplete && adjustmentsComplete, "إغلاق الملاحظات والقيود"],
      ["reporting", "الإصدار", "reports", FileText, reportState.reportReady, "تقرير واعتماد بشري"],
    ];
    let previousStagesComplete = true;
    return definitions.map(([id, label, view, icon, complete, detail]) => {
      let status = "blocked";
      if (previousStagesComplete && complete) status = "complete";
      else if (previousStagesComplete) status = "active";
      if (!complete) previousStagesComplete = false;
      return { id, label, view, icon, status, detail, statusLabel: status === "complete" ? "مكتمل" : status === "active" ? "قيد العمل" : "يتطلب إجراء" };
    });
  }, [engagement, metrics, reportState]);

  const completion = Math.round((stages.filter((stage) => stage.status === "complete").length / stages.length) * 100);

  function changeView(view) {
    setActiveView(view);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      mainRef.current?.focus({ preventScroll: true });
    });
  }

  async function clearEvidenceBeforeDatasetChange() {
    try {
      await clearEvidenceStore();
      return true;
    } catch {
      setToast("تعذر تنظيف ملفات الأدلة المحلية؛ لم تتغير البيانات لحماية فصل الارتباطات. أعد المحاولة بعد السماح بالتخزين المحلي.");
      return false;
    }
  }

  async function reloadDemo() {
    if (!await clearEvidenceBeforeDatasetChange()) return false;
    setPendingSessionRestore(null);
    setEngagement(cloneInitialEngagement());
    setAccounts(generateTrialBalance());
    setDataProfile(DEMO_DATA_PROFILE);
    setActiveView("overview");
    setToast("تم تحميل سيناريو العرض الشامل: 5,000 حساب وجميع النتائج والبوابات مكتملة.");
    return true;
  }

  function cycleTheme() {
    setAppearance((current) => {
      const currentIndex = themeOrder.indexOf(current.theme);
      const theme = themeOrder[(currentIndex + 1) % themeOrder.length];
      setToast(`تم تطبيق مظهر ${themeLabels[theme]}.`);
      return { ...current, theme };
    });
  }

  function togglePresentationMode() {
    setAppearance((current) => {
      const presentationMode = !current.presentationMode;
      setToast(presentationMode ? "تم تشغيل وضع العرض التنفيذي." : "تم الرجوع إلى مساحة العمل الكاملة.");
      return { ...current, presentationMode };
    });
  }

  async function commitAccounts(nextAccounts, profile) {
    const changedAt = new Date().toISOString();
    const commitment = buildDatasetCommitment(nextAccounts, {
      period: engagement.entity.period,
      currency: "SAR",
      committedAt: changedAt,
    });
    const committedProfile = {
      ...profile,
      ...commitment,
      source: "import",
      rowCount: nextAccounts.length,
      importedAt: changedAt,
      committedAt: changedAt,
      sessionOnly: true,
    };
    if (!await clearEvidenceBeforeDatasetChange()) return false;
    setPendingSessionRestore(null);
    setAccounts(nextAccounts);
    setDataProfile(committedProfile);
    setEngagement((current) => createFreshEngagement(current, committedProfile, changedAt));
    setActiveView("trial-balance");
    setToast("تم اعتماد الميزان الجديد وإعادة فتح كل النتائج والأدلة والجولات والتسويات؛ لم تُورّث أي نتيجة سابقة.");
    return true;
  }

  async function stageSessionSnapshot(file) {
    setPendingSessionRestore(null);
    try {
      if (!file || !Number.isFinite(file.size) || file.size < 1) throw new TypeError("ملف لقطة الجلسة فارغ أو غير صالح.");
      if (file.size > MAX_SESSION_SNAPSHOT_BYTES) throw new TypeError("حجم لقطة الجلسة يتجاوز 32 MB؛ لم تتم قراءتها.");
      const restoredAt = new Date().toISOString();
      const restored = parseSessionSnapshotText(await file.text(), { restoredAt });
      setPendingSessionRestore({
        restored,
        fileName: String(file.name || "kosif-session.json").slice(0, 240),
      });
      setToast("تم فحص عقد الاستعادة دون تغيير بيانات العمل؛ راجع الملخص ثم أكد الاستبدال صراحةً.");
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "تعذرت استعادة لقطة الجلسة.");
      return false;
    }
  }

  async function confirmSessionSnapshot() {
    if (!pendingSessionRestore?.restored) return false;
    if (!await clearEvidenceBeforeDatasetChange()) return false;
    const { restored } = pendingSessionRestore;
    setAccounts(restored.accounts);
    setDataProfile(restored.dataProfile);
    setEngagement(restored.engagement);
    setPendingSessionRestore(null);
    setActiveView("trial-balance");
    setToast(`تمت استعادة ${formatNumber(restored.accounts.length)} حسابًا؛ أُزيلت الأدلة المحلية وفُتحت كل الاعتمادات والنتائج لإعادة المراجعة.`);
    return true;
  }

  function cancelSessionSnapshot() {
    setPendingSessionRestore(null);
    setToast("أُلغيت الاستعادة ولم تتغير بيانات العمل الحالية.");
  }

  function openStandard(standardId, accountId = null, source = "workspace") {
    setRequestedStandard({ id: standardId, accountId, source });
    changeView("standards");
  }

  function openRound(roundId) {
    setRequestedRoundId(roundId);
    changeView("rounds");
  }

  let content;
  if (activeView === "data-intake") content = <DataIntakeWorkspace accounts={accounts} dataProfile={dataProfile} formatCurrency={formatCurrency} formatNumber={formatNumber} onCommit={commitAccounts} onStageSession={stageSessionSnapshot} sessionRestorePreview={pendingSessionRestore ? { ...pendingSessionRestore.restored.preview, fileName: pendingSessionRestore.fileName } : null} onConfirmSession={confirmSessionSnapshot} onCancelSession={cancelSessionSnapshot} onReset={reloadDemo} onToast={setToast} />;
  else if (activeView === "trial-balance") content = <TrialBalance accounts={accounts} metrics={metrics} mappingState={engagement.standardMappings} onToast={setToast} onOpenStandard={(standardId, accountId) => openStandard(standardId, accountId, "trial-balance")} />;
  else if (activeView === "traceability") content = <Suspense fallback={<section className="panel page-intro" aria-busy="true"><span className="eyebrow">Traceability</span><h2>جارٍ تجهيز رسم الإسناد…</h2></section>}><TraceabilityWorkspace accounts={accounts} engagement={engagement} dataProfile={dataProfile} /></Suspense>;
  else if (activeView === "standards") content = <StandardsCenter accounts={accounts} engagement={engagement} setEngagement={setEngagement} metrics={metrics} onToast={setToast} formatNumber={formatNumber} formatCurrency={formatCurrency} requestedStandardId={requestedStandard.id} requestedAccountId={requestedStandard.accountId} requestedSource={requestedStandard.source} />;
  else if (activeView === "applied") content = <AppliedAccountingLab accounts={accounts} engagement={engagement} setEngagement={setEngagement} metrics={metrics} mappingState={engagement.standardMappings} formatCurrency={formatCurrency} onToast={setToast} />;
  else if (activeView === "analytics") content = <AnalyticsWorkspace accounts={accounts} engagement={engagement} setEngagement={setEngagement} onToast={setToast} formatNumber={formatNumber} formatCurrency={formatCurrency} />;
  else if (activeView === "integrity") content = <IntegrityWorkspace accounts={accounts} engagement={engagement} setEngagement={setEngagement} onToast={setToast} formatNumber={formatNumber} formatCurrency={formatCurrency} />;
  else if (activeView === "council") content = <AuditCouncil accounts={accounts} engagement={engagement} setEngagement={setEngagement} metrics={metrics} onToast={setToast} formatNumber={formatNumber} formatCurrency={formatCurrency} />;
  else if (activeView === "risk") content = <RiskWorkspace accounts={accounts} engagement={engagement} setEngagement={setEngagement} metrics={metrics} onToast={setToast} onOpenStandard={openStandard} onOpenRound={openRound} onView={changeView} />;
  else if (activeView === "rounds") content = <Rounds engagement={engagement} setEngagement={setEngagement} onToast={setToast} onOpenStandard={openStandard} onView={changeView} requestedRoundId={requestedRoundId} />;
  else if (activeView === "evidence") content = <Evidence engagement={engagement} setEngagement={setEngagement} onToast={setToast} />;
  else if (activeView === "reviewer-workspace") content = <ReviewerWorkspace accounts={accounts} engagement={engagement} setEngagement={setEngagement} onToast={setToast} onOpenRound={openRound} onOpenStandard={openStandard} />;
  else if (activeView === "results") content = <ResultsCenter accounts={accounts} engagement={engagement} metrics={metrics} dataProfile={dataProfile} stages={stages} onView={changeView} onOpenStandard={openStandard} onOpenRound={openRound} onToast={setToast} formatNumber={formatNumber} formatCurrency={formatCurrency} />;
  else if (activeView === "reports") content = <Reports engagement={engagement} setEngagement={setEngagement} metrics={metrics} dataProfile={dataProfile} accounts={accounts} stages={stages} onView={changeView} onToast={setToast} onOpenStandard={openStandard} />;
  else if (activeView === "intelligence") content = <Suspense fallback={<section className="panel" aria-busy="true">جارٍ تجهيز الإيجنت…</section>}><IntelligenceStudio accounts={accounts} engagement={engagement} setEngagement={setEngagement} metrics={metrics} reportState={reportState} onView={changeView} onToast={setToast} /></Suspense>;
  else if (activeView === "settings") content = <SettingsView engagement={engagement} setEngagement={setEngagement} onToast={setToast} onSaved={() => changeView("overview")} summaryText={`${engagement.entity.name}. ${metrics.accountCount} حسابًا. ${engagement.rounds.length} جولة. ${engagement.findings.length} نتيجة. اكتمال البوابات ${completion} بالمئة.`} />;
  else content = <Overview metrics={metrics} engagement={engagement} stages={stages} dataProfile={dataProfile} reportState={reportState} onView={changeView} />;

  return (
    <div className={`app-shell ${appearance.presentationMode ? "presentation-mode" : ""}`} data-active-view={activeView} dir="rtl">
      <a className="skip-link" href="#main-content">تخطي إلى المحتوى</a>
      <Header engagement={engagement} onView={changeView} onReloadDemo={reloadDemo} onOpenGuide={() => setPathGuideOpen(true)} theme={appearance.theme} onCycleTheme={cycleTheme} presentationMode={appearance.presentationMode} onTogglePresentation={togglePresentationMode} commandPalette={<CommandPalette accounts={accounts} rounds={engagement.rounds} evidence={engagement.evidence} mappingState={engagement.standardMappings} onView={changeView} onOpenStandard={openStandard} onOpenRound={openRound} />} />
      <div className="workspace-layout">
        <Sidebar activeView={activeView} onView={changeView} completion={completion} />
        <main id="main-content" className="main-content" ref={mainRef} tabIndex="-1" data-kosif-ready="true">
          {content}
        </main>
      </div>
      <BottomNav activeView={activeView} onView={changeView} />
      <PathGuide open={pathGuideOpen} onClose={closePathGuide} onView={changeView} />
      <Toast message={toast} />
    </div>
  );
}
