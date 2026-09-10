import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardCheck, Download, FileSearch, Gauge, Globe2, Scale, Search, ShieldCheck, X } from "lucide-react";
import { downloadTextFile, timestampedFilename } from "../session-export.js";
import {
  GLOBAL_AUDIT_PATTERNS,
  GLOBAL_AUDIT_SOURCE_FAMILIES,
  analyzeAuditorFees,
  buildPatternAuditPlan,
  buildSensitivityScenarios,
  getGlobalAuditThemes,
  searchGlobalAuditPatterns,
} from "../global-audit-patterns.js";
import "../global-audit-intelligence.css";

const ENGAGEMENT_STORAGE_KEY = "kosif-audit-studio:v7";
const tabs = [
  ["patterns", "الأنماط المهنية"],
  ["plan", "خطة المراجعة"],
  ["sensitivity", "الحساسية"],
  ["fees", "الاستقلال والرسوم"],
  ["governance", "الحوكمة"],
  ["roadmap", "خطة التطوير"],
];

const governanceRows = [
  ["financial-reporting", "سلامة التقارير المالية", "الأحكام والتقديرات الجوهرية والقوائم والإفصاحات"],
  ["internal-controls", "الرقابة الداخلية", "تصميم الضوابط وفعاليتها والقصور وخطط المعالجة"],
  ["risk-cyber", "المخاطر والأمن السيبراني", "المخاطر النشطة والأنظمة المالية والحوادث الجوهرية"],
  ["external-audit", "المراجعة الخارجية والاستقلال", "النطاق والنتائج والرسوم والخدمات والموافقات المسبقة"],
  ["internal-audit", "المراجعة الداخلية", "الخطة والتغطية والنتائج والمتابعة"],
  ["going-concern", "الاستمرارية والجدوى", "السيولة والتعهدات وسيناريوهات الضغط والأحداث اللاحقة"],
  ["sustainability", "ضمان الاستدامة", "حدود النطاق ونقاط التقاطع مع الأرقام والإفصاحات المالية"],
];

const roadmap = [
  { phase: "منفذ الآن", title: "Global Audit Intelligence", detail: "أنماط KAM/CAM والتقديرات والضوابط وNon-GAAP والاستقلال والحوكمة والمخاطر والاستمرارية، مع خطط مراجعة قابلة للتصدير." },
  { phase: "المرحلة 2", title: "Report Intake Normalizer", detail: "تحويل أي تقرير PDF/XLSX يرفعه المستخدم إلى فهرس: شركة، فترة، قوائم، إيضاحات، تقرير مراجع، KAM/CAM، حوكمة، وصفحات مصدر." },
  { phase: "المرحلة 3", title: "Disclosure Completeness Graph", detail: "رسم يربط كل رقم وإفصاح بالحساب والمعيار والصفحة والمصدر، ويكشف الإفصاحات الناقصة أو غير المتسقة." },
  { phase: "المرحلة 4", title: "Estimate & Model Assurance", detail: "مكتبة نماذج للتقديرات الجوهرية مع back-testing وحساسية وتحيز الإدارة وخبراء التقييم." },
  { phase: "المرحلة 5", title: "ICFR & Controls Studio", detail: "RCM وWalkthrough واختبار تصميم وتشغيل وربط الاستثناءات بالنتائج والتواصل مع الحوكمة." },
  { phase: "المرحلة 6", title: "Audit Quality & Inspection Lens", detail: "تحويل أنماط PCAOB/FRC/IFIAR وتقارير شفافية المكاتب إلى قوائم فحص جودة قبل الإقفال." },
  { phase: "المرحلة 7", title: "Cross-company Benchmarking", detail: "مقارنة القطاعات والشركات زمنياً مع فصل GAAP/IFRS/APM وبيان مصدر كل مقياس وحدوده." },
  { phase: "المرحلة 8", title: "Governed AI Orchestrator", detail: "مجلس مراجعين متخصصين يولد إجراءات مقترحة فقط، مع موافقات بشرية وإصدارات وبصمة مصدر لكل اقتراح." },
];

function readEngagementContext() {
  try {
    const engagement = JSON.parse(localStorage.getItem(ENGAGEMENT_STORAGE_KEY) || "null");
    if (!engagement || typeof engagement !== "object") return null;
    return {
      entityName: String(engagement.entity?.name || "المنشأة الحالية"),
      period: String(engagement.entity?.period || "—"),
      findingsOpen: Array.isArray(engagement.findings) ? engagement.findings.filter((item) => item.status !== "closed").length : 0,
      evidencePending: Array.isArray(engagement.evidence) ? engagement.evidence.filter((item) => item.status !== "approved").length : 0,
      roundsComplete: Array.isArray(engagement.rounds) ? engagement.rounds.filter((item) => item.status === "complete").length : 0,
      humanApproval: Boolean(engagement.humanApproval),
    };
  } catch {
    return null;
  }
}

function formatMinor(minor) {
  const value = BigInt(String(minor || "0"));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const cents = String(abs % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}.${cents}`;
}

function parseMoneyToMinor(value) {
  const normalized = String(value || "0").trim().replace(/[,_\s]/g, "").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) throw new TypeError("اكتب مبلغًا صحيحًا بخانتين عشريتين كحد أقصى.");
  const [whole, fraction = ""] = normalized.split(".");
  return (BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2))).toString();
}

function SourceExample({ source }) {
  return <div className="gai-source"><span>{source.entity}</span><small>{source.period} · {source.jurisdiction}</small><bdi dir="auto">{source.locator}</bdi><em>{source.sourceFamily}</em></div>;
}

function PatternDetails({ pattern, onBuildPlan }) {
  return <article className="gai-detail">
    <header><span className="eyebrow">منهج مستخلص من تقارير منشورة</span><h3>{pattern.titleAr}</h3><p>{pattern.shortAr}</p></header>
    <div className="gai-detail-grid">
      <section><h4>إشارات الخطر</h4><div className="gai-tags">{pattern.riskSignals.map((item) => <span key={item}>{item}</span>)}</div></section>
      <section><h4>التأكيدات</h4><div className="gai-tags">{pattern.assertions.map((item) => <span key={item}>{item}</span>)}</div></section>
      <section><h4>معايير مرجعية</h4><div className="gai-tags standards">{pattern.standards.map((item) => <bdi key={item} dir="ltr">{item}</bdi>)}</div></section>
    </div>
    <div className="gai-procedures"><h4>إجراءات مقترحة</h4><ol>{pattern.procedures.map((item) => <li key={item}>{item}</li>)}</ol></div>
    <div><h4>أمثلة المصدر</h4><div className="gai-source-grid">{pattern.sourceExamples.map((source) => <SourceExample key={`${source.entity}-${source.locator}`} source={source} />)}</div></div>
    <button type="button" className="button button-gold" onClick={onBuildPlan}><ClipboardCheck size={17} /> تحويل إلى خطة مراجعة</button>
  </article>;
}

export function GlobalAuditIntelligence({ onClose }) {
  const [tab, setTab] = useState("patterns");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState("all");
  const [selectedId, setSelectedId] = useState(GLOBAL_AUDIT_PATTERNS[0].id);
  const [plan, setPlan] = useState(null);
  const [engagement, setEngagement] = useState(() => readEngagementContext());
  const [baseAmount, setBaseAmount] = useState("1000000.00");
  const [sensitivityError, setSensitivityError] = useState("");
  const [feeInput, setFeeInput] = useState({ audit: "100000", auditRelated: "15000", tax: "10000", other: "5000" });
  const [governance, setGovernance] = useState(() => Object.fromEntries(governanceRows.map(([id]) => [id, false])));
  const themes = useMemo(() => getGlobalAuditThemes(), []);
  const patterns = useMemo(() => searchGlobalAuditPatterns(query, theme), [query, theme]);
  const selected = GLOBAL_AUDIT_PATTERNS.find((item) => item.id === selectedId) || GLOBAL_AUDIT_PATTERNS[0];

  useEffect(() => {
    const refresh = () => setEngagement(readEngagementContext());
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sensitivity = useMemo(() => {
    try {
      const baseMinor = parseMoneyToMinor(baseAmount);
      setSensitivityError("");
      return { baseMinor, rows: buildSensitivityScenarios(baseMinor) };
    } catch (error) {
      setSensitivityError(error.message);
      return { baseMinor: "0", rows: [] };
    }
  }, [baseAmount]);

  const feeAnalysis = useMemo(() => {
    try { return analyzeAuditorFees(feeInput); }
    catch { return null; }
  }, [feeInput]);

  function buildPlan(pattern = selected) {
    const next = buildPatternAuditPlan(pattern.id, { entityName: engagement?.entityName || "المنشأة الحالية", reviewer: "المراجع المسؤول" });
    setPlan(next);
    setSelectedId(pattern.id);
    setTab("plan");
  }

  function exportPlan() {
    if (!plan) return;
    downloadTextFile(JSON.stringify(plan, null, 2), timestampedFilename(`kosif-${plan.patternId}-audit-plan`, "json"), "application/json;charset=utf-8");
  }

  function exportIntelligencePacket() {
    const packet = {
      schema: "kosif.global-audit-intelligence.v1",
      generatedAt: new Date().toISOString(),
      engagement,
      patterns: GLOBAL_AUDIT_PATTERNS,
      governance,
      authority: "advisory-only-human-review-required",
    };
    downloadTextFile(JSON.stringify(packet, null, 2), timestampedFilename("kosif-global-audit-intelligence", "json"), "application/json;charset=utf-8");
  }

  return <div className="gai-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section className="gai-dialog" role="dialog" aria-modal="true" aria-labelledby="gai-title" dir="rtl">
      <header className="gai-header">
        <div className="gai-mark"><Globe2 size={24} /></div>
        <div><span className="eyebrow">12,505-page methodology extraction</span><h2 id="gai-title">الذكاء العالمي للمراجعة</h2><p>يحوّل أنماط التقارير المنشورة إلى إجراءات وفحوص قابلة للتتبع، ولا يخزن نصوص التقارير أو يستبدل الحكم المهني.</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="إغلاق الذكاء العالمي"><X size={21} /></button>
      </header>

      {engagement ? <div className="gai-context"><span><b>{engagement.entityName}</b><small>{engagement.period}</small></span><span><b>{engagement.findingsOpen}</b><small>نتائج مفتوحة</small></span><span><b>{engagement.evidencePending}</b><small>أدلة غير معتمدة</small></span><span><b>{engagement.roundsComplete}</b><small>جولات مكتملة</small></span><span className={engagement.humanApproval ? "is-ready" : ""}><b>{engagement.humanApproval ? "معتمد" : "مسودة"}</b><small>حالة الاعتماد</small></span></div> : null}

      <nav className="gai-tabs" aria-label="أقسام الذكاء العالمي">{tabs.map(([id, label]) => <button key={id} type="button" className={tab === id ? "active" : ""} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>

      <div className="gai-body">
        {tab === "patterns" ? <>
          <div className="gai-toolbar">
            <label className="gai-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث: تقديرات، KAM، استقلال، سيبراني…" /></label>
            <select aria-label="تصفية الأنماط" value={theme} onChange={(event) => setTheme(event.target.value)}><option value="all">كل الأنماط</option>{themes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          </div>
          <div className="gai-pattern-layout">
            <div className="gai-pattern-list">{patterns.map((pattern) => <button type="button" key={pattern.id} className={selected.id === pattern.id ? "active" : ""} onClick={() => setSelectedId(pattern.id)}><span><b>{pattern.titleAr}</b><small>{pattern.shortAr}</small></span><em>{pattern.sourceExamples.length} أمثلة</em></button>)}{!patterns.length ? <p className="gai-empty">لا يوجد نمط مطابق للبحث.</p> : null}</div>
            <PatternDetails pattern={selected} onBuildPlan={() => buildPlan(selected)} />
          </div>
          <details className="gai-source-families"><summary>شبكة المصادر المهنية المرجعية ({GLOBAL_AUDIT_SOURCE_FAMILIES.length})</summary><div>{GLOBAL_AUDIT_SOURCE_FAMILIES.map((item) => <span key={item}>{item}</span>)}</div></details>
        </> : null}

        {tab === "plan" ? <section className="gai-workspace">
          <div className="gai-section-heading"><div><span className="eyebrow">Risk → Procedure → Evidence</span><h3>خطة مراجعة مولدة من نمط منشور</h3><p>الخطة مقترح مهني قابل للتعديل، وليست إجراءً منفذًا أو استنتاجًا تلقائيًا.</p></div><button type="button" className="button button-outline" onClick={exportPlan} disabled={!plan}><Download size={16} /> تنزيل JSON</button></div>
          {!plan ? <div className="gai-empty-card"><FileSearch size={30} /><strong>اختر نمطًا أولًا</strong><p>من تبويب الأنماط اضغط «تحويل إلى خطة مراجعة».</p></div> : <>
            <div className="gai-plan-head"><strong>{plan.titleAr}</strong><span>{plan.entityName}</span><small>{plan.guardrailAr}</small></div>
            <div className="gai-plan-grid">{plan.procedures.map((item) => <article key={item.id}><bdi dir="ltr">{item.id}</bdi><h4>{item.procedure}</h4><p><b>الدليل:</b> {item.evidenceRequired}</p><span>{item.status}</span></article>)}</div>
            <div className="gai-evidence-requests"><h4>طلبات الأدلة المقترحة</h4>{plan.evidenceRequests.map((item) => <span key={item.id}><bdi dir="ltr">{item.id}</bdi>{item.title}</span>)}</div>
          </>}
        </section> : null}

        {tab === "sensitivity" ? <section className="gai-workspace">
          <div className="gai-section-heading"><div><span className="eyebrow">ISA 540 · Stress testing</span><h3>محرك حساسية حتمي</h3><p>يحسب السيناريوهات بوحدات الهللة الصحيحة، دون Float في الحساب المالي.</p></div><Gauge size={26} /></div>
          <label className="gai-money-input"><span>القيمة الأساسية — ريال سعودي</span><input inputMode="decimal" value={baseAmount} onChange={(event) => setBaseAmount(event.target.value)} /></label>
          {sensitivityError ? <p role="alert" className="gai-warning"><AlertTriangle size={16} /> {sensitivityError}</p> : <div className="gai-sensitivity-grid">{sensitivity.rows.map((row) => <article key={row.shockBp}><span>{row.shockBp > 0 ? "+" : ""}{(row.shockBp / 100).toFixed(0)}%</span><strong>{formatMinor(row.stressedMinor)} ر.س</strong><small>الأثر {BigInt(row.deltaMinor) >= 0n ? "+" : ""}{formatMinor(row.deltaMinor)} ر.س</small></article>)}</div>}
          <p className="gai-note"><ShieldCheck size={16} /> هذه السيناريوهات لا تحدد «قيمة صحيحة» للتقدير؛ وظيفتها كشف حساسية النتيجة للافتراضات وتوجيه الاختبار البشري.</p>
        </section> : null}

        {tab === "fees" ? <section className="gai-workspace">
          <div className="gai-section-heading"><div><span className="eyebrow">Independence lens</span><h3>محلل رسوم المراجع والخدمات</h3><p>مؤشر حوكمة كمي؛ لا يصدر حكم استقلال تلقائيًا.</p></div><Scale size={26} /></div>
          <div className="gai-fee-grid">{[["audit", "رسوم التدقيق"], ["auditRelated", "تدقيق ذو صلة"], ["tax", "خدمات ضريبية"], ["other", "خدمات أخرى"]].map(([key, label]) => <label key={key}><span>{label}</span><input inputMode="numeric" value={feeInput[key]} onChange={(event) => setFeeInput((current) => ({ ...current, [key]: event.target.value.replace(/\D/g, "") }))} /></label>)}</div>
          {feeAnalysis ? <><div className="gai-fee-metrics"><article><span>إجمالي الرسوم</span><strong>{BigInt(feeAnalysis.total).toLocaleString("en-US")}</strong></article><article><span>غير التدقيق ÷ التدقيق</span><strong>{feeAnalysis.nonAuditToAuditPct}</strong></article><article><span>ضريبة + أخرى ÷ التدقيق</span><strong>{feeAnalysis.taxOtherToAuditPct}</strong></article></div><div className={feeAnalysis.flags.length ? "gai-review-flags warning" : "gai-review-flags success"}>{feeAnalysis.flags.length ? feeAnalysis.flags.map((flag) => <p key={flag}><AlertTriangle size={15} /> {flag}</p>) : <p><CheckCircle2 size={15} /> لا توجد إشارة كمية مرتفعة من المزيج وحده.</p>}<small>{feeAnalysis.conclusionAr}</small></div></> : null}
        </section> : null}

        {tab === "governance" ? <section className="gai-workspace">
          <div className="gai-section-heading"><div><span className="eyebrow">Audit Committee operating model</span><h3>مصفوفة حوكمة قابلة للإغلاق</h3><p>مستوحاة من مسؤوليات لجان المراجعة الفعلية في التقارير المنشورة؛ استخدمها كقائمة تغطية لا كدليل إنجاز.</p></div><BookOpen size={26} /></div>
          <div className="gai-governance-list">{governanceRows.map(([id, title, detail]) => <label key={id} className={governance[id] ? "checked" : ""}><input type="checkbox" checked={governance[id]} onChange={(event) => setGovernance((current) => ({ ...current, [id]: event.target.checked }))} /><span>{governance[id] ? <CheckCircle2 size={19} /> : <span className="gai-check-box" />}</span><div><strong>{title}</strong><small>{detail}</small></div></label>)}</div>
          <div className="gai-governance-progress"><span style={{ width: `${Math.round(Object.values(governance).filter(Boolean).length / governanceRows.length * 100)}%` }} /><b>{Object.values(governance).filter(Boolean).length}/{governanceRows.length}</b></div>
          <p className="gai-note"><ShieldCheck size={16} /> وضع علامة هنا لا يثبت أن الإجراء تم؛ الإغلاق المهني يتطلب محضرًا أو دليلًا ومالكًا وتاريخًا داخل ملف المراجعة.</p>
        </section> : null}

        {tab === "roadmap" ? <section className="gai-workspace">
          <div className="gai-section-heading"><div><span className="eyebrow">KOSIF development roadmap</span><h3>تحويل الحزمة إلى نظام تشغيل للمراجعة</h3><p>المبدأ: نستخلص المنهج والهيكل والاختبارات من التقارير، لا نخزن آلاف الصفحات كأرشيف.</p></div><Globe2 size={26} /></div>
          <div className="gai-roadmap">{roadmap.map((item, index) => <article key={item.title}><b>{String(index + 1).padStart(2, "0")}</b><div><span>{item.phase}</span><h4>{item.title}</h4><p>{item.detail}</p></div></article>)}</div>
          <button type="button" className="button button-dark" onClick={exportIntelligencePacket}><Download size={16} /> تنزيل حزمة الأنماط والحوكمة</button>
        </section> : null}
      </div>

      <footer className="gai-footer"><span><ShieldCheck size={15} /> لا تُرسل الحزمة الأصلية أو بيانات ملف المراجعة إلى مزود خارجي من هذه المساحة.</span><button type="button" className="button button-outline compact" onClick={onClose}>إغلاق</button></footer>
    </section>
  </div>;
}
