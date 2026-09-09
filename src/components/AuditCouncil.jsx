import { contextStamp } from "../intelligence/agent.js";
import { createAgentContext, specialistReview } from "../intelligence/context.js";
import { buildReportState } from "../reporting.js";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileSearch,
  Network,
  RefreshCw,
  Scale,
  ShieldCheck,
  UserCheck,
  MessageSquareText,
  Send,
} from "lucide-react";
import { buildCouncilSnapshot, buildEvidenceLineage, buildRiskSample } from "../governance.js";
import { buildAdjustmentBridge } from "../reporting.js";
import { fetchProviderRegistry } from "../council-api.js";
import {
  PROVIDER_POLICY_VERSION,
  buildLocalProviderRun,
  buildRedactedCouncilPackage,
  createDefaultProviderRegistry,
} from "../council-providers.js";
import { downloadTextFile, timestampedFilename } from "../session-export.js";
import {
  buildCouncilChallengeQuestions,
  buildCouncilEvidenceRequests,
  buildCouncilMatrix,
  planCouncilCoverage,
} from "../council-orchestration.js";
import "../governance.css";

const severityLabels = { high: "مرتفع", medium: "متوسط", low: "منخفض" };
const riskLabels = { high: "مرتفع", medium: "متوسط", low: "منخفض" };
const providerStatusLabels = {
  ready: "نشط وجاهز",
  backend_required: "يتطلب وكيلاً خادميًا",
  unconfigured: "غير مهيأ",
  configured: "مهيأ خادميًا · التنفيذ معطل",
  healthy: "اتصال سليم",
  degraded: "اتصال متدهور",
  failed: "فشل الفحص",
};

const COUNCIL_SEATS = Object.freeze([
  { id: "data-integrity", title: "مدقق البيانات والدفتر", standard: "ISA 230 · ISA 500", reference: "TB / LOG", persona: "يتحقق من المصدر والاتزان وبصمة البيانات." },
  { id: "technical", title: "المراجع الفني للمعايير", standard: "IFRS / IAS · ISA 315", reference: "MAP / IFRS", persona: "يختبر المعالجة والربط والتطبيق المحلي للفترة." },
  { id: "risk-evidence", title: "مدقق المخاطر والأدلة", standard: "ISA 330 · ISA 500 · ISA 530", reference: "PBC / EVIDENCE", persona: "يتحدى كفاية الدليل ويميز النطاق عن المعاينة." },
  { id: "completion", title: "مراجع الإقفال والتقرير", standard: "ISA 450 · ISA 700 · ISA 705", reference: "GATES / REPORT", persona: "يراجع التحريفات والبوابات وفصل القرار البشري." },
  { id: "engagement", title: "مدير الارتباط", standard: "ISA 200 · ISA 210", reference: "ACCEPTANCE", persona: "يثبت النطاق والمسؤوليات وتسلسل الإجراءات." },
  { id: "ifrs", title: "مراجع IFRS", standard: "IFRS / IAS", reference: "IFRS", persona: "يربط كل معالجة بالإصدار والفترة والافتراض." },
  { id: "isa", title: "مراجع إجراءات ISA", standard: "ISA 330 · ISA 500", reference: "PROCEDURE", persona: "يفحص الإجراء والنتيجة والدليل المناقض." },
  { id: "fraud", title: "مراجع الغش", standard: "ISA 240", reference: "JOURNAL", persona: "يطلب دفتر اليومية ويختبر تجاوز الإدارة." },
  { id: "quality", title: "مراجع الجودة", standard: "ISQM 1 · ISA 700", reference: "QUALITY", persona: "يتحدى بوابات الإكمال وفصل المهام ووضوح التقرير." },
  { id: "controls", title: "مراجع الرقابة", standard: "ISA 265", reference: "CONTROLS", persona: "يختبر تصميم الضابط وتنفيذه ودليل فاعليته." },
  { id: "tax", title: "مراجع الزكاة والضريبة", standard: "IAS 12 · SOCPA", reference: "TAX", persona: "يفصل الافتراض الضريبي عن نتيجة القوائم ويطلب المصدر المحلي." },
  { id: "going-concern", title: "مراجع الاستمرارية والتقييم", standard: "ISA 570", reference: "FORECAST", persona: "يطلب التوقعات والتمويل والحساسية والأحداث اللاحقة." },
]);

function downloadCsv(filename, rows) {
  const content = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
}

function localDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function AdvisorIcon({ id }) {
  if (id === "data-integrity") return <ShieldCheck size={21} />;
  if (id === "technical") return <Scale size={21} />;
  if (id === "risk-evidence") return <FileSearch size={21} />;
  return <ClipboardCheck size={21} />;
}

export function AuditCouncil({ accounts, engagement, setEngagement, metrics, formatCurrency, formatNumber, onToast, onView, onOpenStandard }) {
  const adjustmentBridge = useMemo(
    () => buildAdjustmentBridge(accounts, engagement.adjustments || []),
    [accounts, engagement.adjustments],
  );
  const snapshot = useMemo(() => buildCouncilSnapshot(
    adjustmentBridge.adjustedAccounts,
    engagement,
    metrics,
    { analysisBasis: "posted-adjusted-trial-balance", datasetDigest: metrics.datasetDigest },
  ), [adjustmentBridge.adjustedAccounts, engagement, metrics]);
  const agentContext = useMemo(
    () => createAgentContext(accounts, engagement, metrics, buildReportState(engagement, metrics)),
    [accounts, engagement, metrics],
  );
  const specialist = useMemo(() => specialistReview(agentContext), [agentContext]);
  const seatCatalog = useMemo(() => {
    const core = new Map(snapshot.advisors.map((advisor) => [advisor.id, advisor]));
    const specialists = new Map(specialist.seats.map((seat) => [seat.id, seat]));
    return COUNCIL_SEATS.map((definition) => {
      const existing = core.get(definition.id);
      if (existing) return { ...existing, persona: definition.persona };
      const challenge = specialists.get(definition.id);
      const requiresAction = challenge?.status === "requires_action";
      return {
        id: definition.id,
        role: definition.title,
        standard: definition.standard,
        severity: requiresAction ? "medium" : "low",
        verdict: requiresAction ? "يتطلب إجراء قبل الإقفال" : "جاهز لتحدي الملف",
        detail: challenge?.question || definition.persona,
        actions: challenge?.blockers?.length ? challenge.blockers : [definition.persona],
        refs: [definition.reference, challenge?.referenceId].filter(Boolean),
        persona: definition.persona,
      };
    });
  }, [snapshot.advisors, specialist.seats]);
  const sample = useMemo(() => buildRiskSample(accounts, 36), [accounts]);
  const lineage = useMemo(() => buildEvidenceLineage(accounts, engagement, 6), [accounts, engagement]);
  const currentDecision = engagement.council?.humanDecision || {};
  const [reviewer, setReviewer] = useState(currentDecision.reviewer || "شريك الارتباط");
  const [rationale, setRationale] = useState(currentDecision.rationale || "");
  const [providerRegistry, setProviderRegistry] = useState(() => createDefaultProviderRegistry());
  const [providerBusy, setProviderBusy] = useState(false);
  const [selectedSeatIds, setSelectedSeatIds] = useState(() => COUNCIL_SEATS.map((seat) => seat.id));
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState(() => [{ id: "welcome", role: "council", text: "أنا منسق مجلس KOSIF. اسأل عن المخاطر، الأدلة المطلوبة، أو سبب توصية أي عضو." }]);
  const councilRounds = engagement.council?.rounds || [];
  const latestCouncilRound = councilRounds[0] || null;
  const matrix = useMemo(
    () => buildCouncilMatrix(latestCouncilRound?.advisorResults || [], seatCatalog),
    [latestCouncilRound, seatCatalog],
  );
  const linkedAuditRound = useMemo(
    () => (engagement.rounds || []).find((round) => round.status !== "complete") || (engagement.rounds || []).at(-1) || null,
    [engagement.rounds],
  );
  const evidencePlan = useMemo(
    () => buildCouncilEvidenceRequests(latestCouncilRound?.advisorResults || [], { roundId: latestCouncilRound?.id, auditRound: linkedAuditRound }),
    [latestCouncilRound, linkedAuditRound],
  );
  const challengeQuestions = useMemo(
    () => buildCouncilChallengeQuestions(matrix, latestCouncilRound?.id),
    [matrix, latestCouncilRound?.id],
  );

  const notify = (message) => {
    if (typeof onToast === "function") onToast(message);
  };

  const sendCouncilMessage = (event) => {
    event?.preventDefault();
    const question = chatInput.trim();
    if (!question) return;
    const normalized = question.toLowerCase();
    let answer = `استنادًا إلى اللقطة الحالية: ${snapshot.consensus.recommendation}.`;
    if (normalized.includes("دليل") || normalized.includes("مستند")) {
      answer = evidencePlan.length
        ? `يقترح المجلس ${formatNumber(evidencePlan.length)} طلبًا إضافيًا مرتبطًا بالجولة ${latestCouncilRound?.id || "الحالية"}. افتح سجل PBC لمراجعة المالك والاستحقاق قبل الإرسال.`
        : "لا توجد طلبات إضافية مشتقة من الجولة الحالية. تأكد من تشغيل جولة طعن عند وجود تعارض أو نقص في الإثبات.";
    } else if (normalized.includes("خطر") || normalized.includes("مخاطر")) {
      answer = `الإشارات المرتفعة المسجلة: ${formatNumber(snapshot.consensus.high)}، والمتوسطة: ${formatNumber(snapshot.consensus.medium)}. يظل الحكم استشاريًا ويحتاج إلى دليل وإجراء موثق.`;
    } else if (normalized.includes("تقرير") || normalized.includes("رأي")) {
      answer = "المجلس لا يختار رأي التقرير. دوره تقديم اعتراضات وخطة أدلة؛ قرار ISA 705 والاعتماد النهائي يبقيان لدى المراجع البشري في مساحة التقرير.";
    }
    setChatMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text: question }, { id: `a-${Date.now()}-a`, role: "council", text: answer }]);
    setChatInput("");
  };

  const runRound = (scope = "selected", roundType = "blind") => {
    const now = new Date().toISOString();
    const coverage = planCouncilCoverage(seatCatalog, selectedSeatIds, scope);
    const selected = seatCatalog.filter((advisor) => coverage.selectedIds.includes(advisor.id));
    const effective = coverage.effectiveSeats;
    const high = effective.filter(({ severity }) => severity === "high").length;
    const medium = effective.filter(({ severity }) => severity === "medium").length;
    const activeSnapshot = {
      ...snapshot,
      advisors: effective,
      consensus: {
        status: high ? "action_required" : medium ? "review" : "clear",
        high,
        medium,
        low: effective.length - high - medium,
        recommendation: high ? "تنفيذ إجراءات إضافية قبل الإقفال" : medium ? "استكمال نقاط المراجعة قبل الاعتماد" : "جاهز للعرض على المراجع البشري",
      },
    };
    setEngagement((current) => {
      const previousRounds = current.council?.rounds || [];
      const roundId = `CR-${String(previousRounds.length + 1).padStart(3, "0")}`;
      const localRun = buildLocalProviderRun({
        snapshot: activeSnapshot,
        metrics,
        engagement: current,
        accounts,
        runId: `${roundId}-KOSIF-LOCAL`,
        generatedAt: now,
      });
      const previousMatrix = buildCouncilMatrix(previousRounds[0]?.advisorResults || [], seatCatalog);
      const round = {
        schemaVersion: 2,
        agentSourceStamp: contextStamp(createAgentContext(accounts, current, metrics, buildReportState(current, metrics))),
        id: roundId,
        generatedAt: now,
        engineVersion: activeSnapshot.engineVersion,
        datasetId: metrics.datasetId || current.sourceDataset?.datasetId || current.demo?.commitment?.datasetId || null,
        inputDigest: localRun.inputDigest,
        policyVersion: PROVIDER_POLICY_VERSION,
        promptVersion: roundType === "challenge" ? "KOSIF-COUNCIL-CHALLENGE-v1" : "KOSIF-COUNCIL-LOCAL-v4",
        roundType,
        challengedRoundId: roundType === "challenge" ? previousRounds[0]?.id || null : null,
        challengeQuestions: roundType === "challenge" ? buildCouncilChallengeQuestions(previousMatrix, previousRounds[0]?.id).map((item) => ({ ...item })) : [],
        analysisBasis: activeSnapshot.analysisBasis,
        consensus: activeSnapshot.consensus,
        advisorResults: activeSnapshot.advisors.map(({ id, severity, verdict, refs, standard, detail, actions, delegatedBy, coverageMode }) => ({
          id,
          severity,
          verdict,
          refs,
          standard,
          detail,
          actions,
          delegatedBy: delegatedBy || null,
          coverageMode: coverageMode || "independent-seat",
          sourceRunId: localRun.runId,
        })),
        providerRuns: [localRun],
        externalAnalyses: [],
        population: accounts.length,
        sampleSize: sample.length,
        selectedSeatIds: selected.map(({ id }) => id),
        coverageMode: coverage.coverageMode,
        status: "complete",
      };
      return {
        ...current,
        council: {
          ...current.council,
          rounds: [round, ...previousRounds],
          humanDecision: { status: "pending", reviewer: reviewer.trim() || "شريك الارتباط", rationale: "", decidedAt: null },
        },
        auditTrail: [{ id: `LOG-${Date.now()}`, action: roundType === "challenge" ? "تشغيل جولة طعن مستقلة" : "تشغيل جولة المجلس", actor: activeSnapshot.engineVersion, at: now, detail: `${round.id} · ${activeSnapshot.consensus.recommendation} · ${selected.length === 1 ? "عضو مفوض يغطي المقاعد المتبقية" : `${selected.length} مقاعد مستقلة`} · نطاق ${sample.length} حسابًا.` }, ...(current.auditTrail || [])],
        humanApproval: false,
        humanApprovedAt: null,
      };
    });
    setRationale("");
    notify(`${roundType === "challenge" ? "اكتملت جولة الطعن" : "اكتملت الجولة"}: ${selected.length === 1 ? "عضو واحد غطى أدوار المجلس بمحضر تفويض واضح" : `${selected.length} مقاعد مستقلة`}؛ حُفظت الآراء منفصلة عن القرار البشري.`);
  };

  const commitEvidencePlan = () => {
    if (!latestCouncilRound) return notify("شغّل جولة مجلس أولًا حتى تُشتق الطلبات من اعتراضات فعلية.");
    if (!linkedAuditRound) return notify("أنشئ جولة مراجعة مرتبطة قبل إضافة طلبات المستندات.");
    if (!evidencePlan.length) return notify("لم تسجل الجولة الحالية اعتراضات مرتفعة أو متوسطة تستدعي مستندًا إضافيًا.");
    const now = new Date().toISOString();
    const existing = engagement.manualPbcRequests || [];
    const existingKeys = new Set(existing.map((item) => `${item.councilRoundId || ""}:${item.councilSeatId || ""}`));
    const requests = evidencePlan
      .filter((item) => !existingKeys.has(`${item.councilRoundId}:${item.councilSeatId}`))
      .map((item, index) => ({ ...item, id: `${item.id}-${String(existing.length + index + 1).padStart(2, "0")}`, createdAt: now }));
    if (!requests.length) return notify("طلبات هذه الجولة موجودة بالفعل في سجل PBC.");
    setEngagement((current) => {
      return {
        ...current,
        humanApproval: false,
        humanApprovedAt: null,
        report: { ...current.report, status: "draft" },
        manualPbcRequests: [...existing, ...requests],
        auditTrail: [{ id: `LOG-${Date.now()}`, action: "إضافة طلبات أدلة من المجلس", actor: "مجلس المراجعين الذكي", at: now, detail: `${latestCouncilRound.id} · أضيف ${requests.length} طلب وربط بالجولة ${linkedAuditRound.id}؛ لم تُرسل الطلبات خارجيًا.` }, ...(current.auditTrail || [])],
      };
    });
    notify(`أضيف ${requests.length} طلب مستند إلى سجل PBC؛ راجعه وأرسله من مساحة المراجع.`);
    onView?.("reviewer-workspace");
  };

  const checkProviderReadiness = async () => {
    if (providerBusy) return;
    setProviderBusy(true);
    try {
      const registry = await fetchProviderRegistry();
      setProviderRegistry(registry);
      setEngagement((current) => ({
        ...current,
        council: { ...current.council, providerRegistry: registry },
      }));
      const configured = registry.providers.filter((provider) => provider.configured && provider.id !== "kosif-local").length;
      notify(configured
        ? `تم فحص السجل: ${configured} مزود خارجي مهيأ، لكن التنفيذ الخارجي يظل معطلاً حتى إضافة المصادقة والحدود.`
        : "تم فحص السجل: KOSIF المحلي جاهز، ولا يوجد مزود خارجي مهيأ خادميًا.");
    } catch {
      setProviderRegistry(createDefaultProviderRegistry(new Date().toISOString()));
      notify("نجح المحرك المحلي؛ مسار فحص المزودات الخادمي غير متاح في هذه البيئة.");
    } finally {
      setProviderBusy(false);
    }
  };

  const exportCouncilPackage = () => {
    const reviewPackage = buildRedactedCouncilPackage({ accounts, engagement, metrics, snapshot });
    downloadTextFile(
      JSON.stringify(reviewPackage, null, 2),
      timestampedFilename("kosif-redacted-council-package", "json"),
      "application/json;charset=utf-8",
    );
    notify("تم تنزيل حزمة مجلس منقحة: ملخصات وبصمات فقط، بلا أسماء حسابات أو محتوى أدلة.");
  };

  const recordDecision = (status) => {
    if (!reviewer.trim() || !rationale.trim()) {
      notify("أدخل اسم المراجع وأساس القرار قبل التوثيق.");
      return;
    }
    if (!(engagement.council?.rounds || []).length) {
      notify("شغّل جولة مجلس واحدة على الأقل قبل تسجيل القرار.");
      return;
    }
    const now = new Date().toISOString();
    setEngagement((current) => ({
      ...current,
      council: {
        ...current.council,
        humanDecision: { status, reviewer: reviewer.trim(), rationale: rationale.trim(), decidedAt: now },
      },
      auditTrail: [{ id: `LOG-${Date.now()}`, action: status === "approved" ? "اعتماد خطة المجلس" : "إعادة خطة المجلس للمراجعة", actor: reviewer.trim(), at: now, detail: rationale.trim() }, ...(current.auditTrail || [])],
      humanApproval: false,
      humanApprovedAt: null,
    }));
    notify(status === "approved" ? "اعتمد المراجع البشري خطة المتابعة؛ لم يُعتمد تقرير التدقيق بعد." : "أعيدت الخطة لجولة إضافية مع حفظ السبب.");
  };

  const exportSample = () => downloadCsv("kosif-risk-sample.csv", [
    ["الترتيب", "رمز الحساب", "اسم الحساب", "المجال", "المخاطر", "القيمة", "أساس الاختيار"],
    ...sample.map((item) => [item.order, item.code, item.name, item.area, riskLabels[item.risk], item.amount.toFixed(2), item.basis]),
  ]);

  return (
    <div className="view-stack governance-view" dir="rtl">
      <section className="panel page-intro gov-intro">
        <div><span className="eyebrow">Advisory · Human governed</span><h2>مجلس المراجعين الذكي</h2><p>مقاعد متخصصة ذات شخصيات واضحة تقرأ اللقطة نفسها، وتعرض التوافق والتعارض والأدلة؛ لا تختار الرأي ولا تعتمد التقرير.</p></div>
        <div className={`gov-intro-mark council-${snapshot.consensus.status}`}><BrainCircuit size={25} /><span><strong>{snapshot.consensus.high ? `${snapshot.consensus.high} مرتفع` : snapshot.consensus.medium ? `${snapshot.consensus.medium} متوسط` : "مستقر"}</strong><small>{snapshot.engineVersion}</small></span></div>
      </section>

      <section className="panel gov-provider-registry" aria-labelledby="provider-registry-title">
        <div className="gov-section-head"><div><span className="eyebrow">Provider registry · Verifiable status</span><h3 id="provider-registry-title">سجل محركات التحليل</h3><p>حالة تشغيل فعلية من واجهة النظام، مع فصل محرك KOSIF المحلي عن أي رأي خارجي اختياري.</p></div><ShieldCheck size={25} /></div>
        <div className="gov-provider-list" role="list" aria-label="حالة محركات التحليل">
          {providerRegistry.providers.map((provider) => (
            <div className={provider.canRun ? "is-active" : provider.configured ? "is-configured" : ""} role="listitem" key={provider.id}>
              <span className="gov-provider-dot" aria-hidden="true" />
              <span>
                <strong>{provider.name}</strong>
                <small>{providerStatusLabels[provider.status] || provider.status} · {provider.execution === "browser" ? "داخل المتصفح" : "خادمي"}</small>
                <bdi>{provider.model || "دون نموذج معلن"}</bdi>
              </span>
            </div>
          ))}
        </div>
        <div className="gov-provider-actions">
          <button type="button" className="button button-outline compact" onClick={checkProviderReadiness} disabled={providerBusy}><RefreshCw size={15} /> {providerBusy ? "جارٍ الفحص…" : "فحص جاهزية المزودات"}</button>
          <button type="button" className="button button-outline compact" onClick={exportCouncilPackage}><Download size={15} /> تنزيل حزمة منقحة</button>
          <button type="button" className="button button-gold compact" onClick={() => onView?.("ai-connections")}><BrainCircuit size={15} /> إعداد API والمراجعة الخارجية</button>
          <small>{providerRegistry.checkedAt ? `آخر فحص ${localDateTime(providerRegistry.checkedAt)}` : "لم يُنفذ فحص خادمي بعد"}</small>
        </div>
        <p className="gov-provider-note"><ShieldCheck size={16} aria-hidden="true" /> لا تُرسل بيانات الارتباط إلى مزوّد خارجي تلقائيًا. جولات هذه الشاشة تعمل بمحرك KOSIF المحلي؛ وتتيح شاشة اتصالات AI مراجعة خارجية بمفتاحك الخادمي وإذن إرسال الملخص، مع بقاء الآراء الخارجية منفصلة عن القرار البشري.</p>
      </section>

      <section className="gov-council-summary">
        <div><BrainCircuit size={21} /><span><small>مقاعد المجلس</small><strong>{formatNumber(seatCatalog.length)}</strong></span></div>
        <div><AlertTriangle size={21} /><span><small>إشارات مرتفعة</small><strong>{formatNumber(snapshot.consensus.high)}</strong></span></div>
        <div><FileSearch size={21} /><span><small>حسابات النطاق</small><strong>{formatNumber(sample.length)}</strong></span></div>
        <div><UserCheck size={21} /><span><small>القرار البشري</small><strong>{currentDecision.status === "approved" ? "معتمد" : currentDecision.status === "rework" ? "إعادة فحص" : "معلق"}</strong></span></div>
        <button type="button" className="button button-gold" onClick={() => runRound("selected")}><RefreshCw size={17} /> تشغيل المحدد</button>
        <button type="button" className="button button-outline" onClick={() => runRound("all")}><BrainCircuit size={17} /> تشغيل المجلس كاملًا</button>
      </section>

      <section className="panel gov-seat-picker" aria-labelledby="gov-seat-picker-title">
        <div className="gov-section-head"><div><span className="eyebrow">Council orchestration</span><h3 id="gov-seat-picker-title">تشكيل الجولة</h3><p>اختر عضوًا أو مجموعة أو المجلس كاملًا. عند اختيار عضو واحد، يسجل المحضر أنه غطى الأدوار المتبقية تفويضًا حتى لا تختفي أي زاوية مراجعة.</p></div><Network size={24} /></div>
        <div className="gov-seat-actions"><button type="button" className="button button-outline compact" onClick={() => setSelectedSeatIds(COUNCIL_SEATS.map((seat) => seat.id))}>تحديد الكل</button><button type="button" className="button button-outline compact" onClick={() => setSelectedSeatIds(["risk-evidence"])}>عضو واحد للعرض</button><button type="button" className="button button-outline compact" onClick={() => setSelectedSeatIds([])}>مسح التحديد</button><span>{selectedSeatIds.length || "لا شيء — سيُستخدم المجلس كاملًا"} محدد</span></div>
        <div className="gov-seat-picker-grid">{seatCatalog.map((seat) => <label key={seat.id} className={selectedSeatIds.includes(seat.id) ? "is-selected" : ""}><input type="checkbox" checked={selectedSeatIds.includes(seat.id)} onChange={() => setSelectedSeatIds((current) => current.includes(seat.id) ? current.filter((id) => id !== seat.id) : [...current, seat.id])} /><span><strong>{seat.role}</strong><small>{seat.persona}</small></span></label>)}</div>
      </section>

      {latestCouncilRound ? <section className="panel gov-council-matrix" aria-labelledby="gov-council-matrix-title">
        <div className="gov-section-head"><div><span className="eyebrow">Blind matrix · Challenge ready</span><h3 id="gov-council-matrix-title">مصفوفة الجولة {latestCouncilRound.id}</h3><p>تعرض آراء المقاعد كما سُجلت، ثم تميز الاختلاف وفجوات الدليل قبل أن يرى أي عضو رأي الآخر.</p></div><Network size={25} /></div>
        <div className="gov-matrix-summary">
          <span><small>توافق اتجاه الشدة</small><strong>{formatNumber(matrix.agreementPercent)}%</strong></span>
          <span><small>الرأي المرتفع</small><strong>{formatNumber(matrix.counts.high)}</strong></span>
          <span><small>الرأي المتوسط</small><strong>{formatNumber(matrix.counts.medium)}</strong></span>
          <span><small>الوضع</small><strong>{matrix.conflicts ? "تعارض يحتاج طعنًا" : latestCouncilRound.coverageMode === "delegated-coverage" ? "تغطية مفوضة" : "آراء مستقلة"}</strong></span>
        </div>
        <div className="table-scroll gov-matrix-table" tabIndex="0"><table><thead><tr><th>عضو المجلس</th><th>الحكم</th><th>المعيار</th><th>الدليل</th><th>الإجراء التالي</th></tr></thead><tbody>{matrix.rows.map((row) => <tr key={row.id}><td><strong>{row.role}</strong><small>{row.delegatedBy ? `مفوض بواسطة ${row.delegatedBy}` : "رأي مستقل"}</small></td><td><span className={`risk-badge risk-${row.severity}`}>{severityLabels[row.severity]}</span><small>{row.verdict}</small></td><td><div className="gov-standard-buttons">{row.standards.length ? row.standards.map((standardId) => <button key={standardId} type="button" onClick={() => onOpenStandard?.(standardId)}>{standardId} ↗</button>) : <bdi>{row.standard}</bdi>}</div></td><td><span className={`gov-evidence-state ${row.evidenceStatus}`}>{row.refs.length ? `${row.refs.length} روابط` : "دليل مطلوب"}</span></td><td>{row.nextAction}</td></tr>)}</tbody></table></div>
        {challengeQuestions.length ? <details className="gov-challenge-questions"><summary>أسئلة الطعن المقترحة ({challengeQuestions.length})</summary><ol>{challengeQuestions.map((item) => <li key={`${item.seatId}-${item.question}`}><span>{item.question}</span><small>{item.standard} · {item.action}</small></li>)}</ol></details> : null}
        <div className="gov-actions gov-matrix-actions"><button type="button" className="button button-dark" onClick={() => runRound("selected", "challenge")}><RefreshCw size={16} /> تشغيل جولة طعن مستقلة</button><button type="button" className="button button-gold" onClick={commitEvidencePlan} disabled={!evidencePlan.length}><FileSearch size={16} /> إضافة {formatNumber(evidencePlan.length)} طلب مستند</button><button type="button" className="button button-outline" onClick={() => onView?.("reviewer-workspace")}><ClipboardCheck size={16} /> فتح سجل PBC</button></div>
      </section> : null}

      <details className="panel gov-seat-details">
        <summary><span><BrainCircuit size={19} /><strong>عرض الرأي التفصيلي لكل عضو</strong><small>{formatNumber(seatCatalog.length)} شخصية متخصصة</small></span><ChevronDown aria-hidden="true" /></summary>
        <section className="gov-advisor-grid" aria-label="مقاعد مجلس المراجعين">
          {seatCatalog.map((advisor) => (
            <article key={advisor.id} className={`gov-advisor-card severity-${advisor.severity}`}>
              <header><span><AdvisorIcon id={advisor.id} /></span><div><small>{advisor.standard}</small><h3>{advisor.role}</h3></div><b className={`risk-badge risk-${advisor.severity}`}>{severityLabels[advisor.severity]}</b></header>
              <strong className="gov-verdict">{advisor.verdict}</strong>
              <p>{advisor.detail}</p>
              <ul>{advisor.actions.map((action) => <li key={action}>{action}</li>)}</ul>
              <footer>{advisor.refs.length ? advisor.refs.map((ref) => <bdi key={ref}>{ref}</bdi>) : <span>لا توجد مراجع معلقة</span>}</footer>
            </article>
          ))}
        </section>
      </details>

      <div className="gov-two-column gov-council-grid">
        <section className="panel gov-decision-panel">
          <div className="gov-section-head"><div><span className="eyebrow">فصل السلطة</span><h3>قرار المراجع البشري</h3><p>الاعتماد هنا لخطة المتابعة فقط، وليس رأيًا أو إصدارًا لتقرير المراجع.</p></div><UserCheck size={25} /></div>
          <label><span>المراجع المسؤول</span><input value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></label>
          <label><span>أساس القرار والإجراءات التالية</span><textarea rows="5" value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="وثّق ما قُبل، وما رُفض، والإجراءات المطلوبة قبل الإقفال." /></label>
          <div className="gov-actions"><button type="button" className="button button-gold" onClick={() => recordDecision("approved")}><CheckCircle2 size={18} /> اعتماد خطة المتابعة</button><button type="button" className="button button-outline" onClick={() => recordDecision("rework")}><RefreshCw size={17} /> إعادة للجولة</button></div>
          {currentDecision.decidedAt ? <div className={`gov-human-record ${currentDecision.status}`}><UserCheck size={19} /><span><strong>{currentDecision.status === "approved" ? "خطة المتابعة معتمدة" : "مطلوب فحص إضافي"}</strong><small>{currentDecision.reviewer} · {localDateTime(currentDecision.decidedAt)}</small><p>{currentDecision.rationale}</p></span></div> : null}
        </section>

        <section className="panel gov-round-history">
          <div className="gov-section-head"><div><span className="eyebrow">Round snapshots</span><h3>سجل جولات المجلس</h3><p>كل جولة تحفظ إصدار المحرك، أساس التحليل، بصمة المدخل والمصدر المنفذ.</p></div><Network size={25} /></div>
          {councilRounds.length ? <div className="gov-round-list">{councilRounds.slice(0, 8).map((round) => <article key={round.id}><span><strong>{round.id}</strong><small>{localDateTime(round.generatedAt)}</small></span><div><b>{round.roundType === "challenge" ? "جولة طعن · " : "جولة عمياء · "}{round.consensus.recommendation}</b><small>{formatNumber(round.population)} حسابًا · حسابات النطاق {formatNumber(round.sampleSize)} · {round.coverageMode || "تغطية قديمة"}</small>{round.inputDigest ? <code dir="ltr">{round.inputDigest.slice(0, 16)}…</code> : null}</div><CheckCircle2 size={19} /></article>)}</div> : <div className="gov-empty"><BrainCircuit size={30} /><strong>لم تُشغّل جولة بعد</strong><p>ابدأ جولة لحفظ لقطة يمكن للمراجع البشري مناقشتها واعتماد خطتها.</p></div>}
        </section>
      </div>

      <section className="panel gov-chat-panel" aria-labelledby="gov-chat-title">
        <div className="gov-section-head"><div><span className="eyebrow">Council dialogue · Live context</span><h3 id="gov-chat-title">محادثة مباشرة مع منسق المجلس</h3><p>اسأل بالعربية عن سبب التوصية أو الإجراء التالي؛ تُبنى الإجابة من لقطة الجلسة الحالية ولا تنشئ اعتمادًا تلقائيًا.</p></div><MessageSquareText size={25} /></div>
        <div className="gov-chat-messages" aria-live="polite">{chatMessages.slice(-8).map((message) => <div key={message.id} className={`gov-chat-message ${message.role}`}><span>{message.role === "user" ? "أنت" : "منسق المجلس"}</span><p>{message.text}</p></div>)}</div>
        <form className="gov-chat-form" onSubmit={sendCouncilMessage}><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="مثال: ما المستند المطلوب لإغلاق الإشارة المرتفعة؟" aria-label="رسالة إلى منسق المجلس" /><button type="submit" className="button button-gold"><Send size={17} /> إرسال</button></form>
      </section>

      <section className="panel gov-lineage-panel">
        <div className="gov-section-head"><div><span className="eyebrow">Evidence lineage</span><h3>من الحساب إلى النتيجة</h3><p>تربط السلسلة الحساب بالمعيار والتأكيد والخطر والإجراء وطلب المستند والجولة والملاحظة.</p></div></div>
        <div className="gov-lineage-list">{lineage.map((item) => <article key={item.accountId}><div className="gov-lineage-account"><bdi>{item.code}</bdi><strong>{item.account}</strong></div><span><small>المعيار</small><bdi>{item.standard}</bdi></span><span><small>التأكيد</small><b>{item.assertion}</b></span><span><small>الإجراء</small><b>{item.procedure}</b></span><span><small>الدليل / الجولة</small><bdi>{item.evidence} · {item.roundId}</bdi></span><span><small>الملاحظة</small><bdi>{item.finding}</bdi></span></article>)}</div>
      </section>

      <section className="panel gov-sample-panel">
        <div className="gov-section-head"><div><span className="eyebrow">تحديد نطاق الحسابات · ISA 315 / ISA 330</span><h3>نطاق فحص موجّه بالمخاطر</h3><p>اختيار حكمي لحسابات الميزان حسب المخاطر والقيمة؛ لا يُسقط على المجتمع. معاينة الحركات داخل الحساب تُخطط بصورة مستقلة أدناه.</p></div><button type="button" className="button button-outline" onClick={exportSample}><Download size={17} /> تصدير النطاق CSV</button></div>
        <div className="table-scroll" tabIndex="0"><table><thead><tr><th>#</th><th>الحساب</th><th>المجال</th><th>المخاطر</th><th className="numeric">القيمة</th><th>أساس الاختيار</th></tr></thead><tbody>{sample.slice(0, 16).map((item) => <tr key={item.id}><td>{item.order}</td><td><strong>{item.name}</strong><small className="gov-table-code"><bdi>{item.code}</bdi></small></td><td>{item.area}</td><td><span className={`risk-badge risk-${item.risk}`}>{riskLabels[item.risk]}</span></td><td className="numeric">{formatCurrency(item.amount)}</td><td>{item.basis}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}

export default AuditCouncil;
