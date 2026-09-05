import { contextStamp } from "../intelligence/agent.js";
import { createAgentContext } from "../intelligence/context.js";
import { buildReportState } from "../reporting.js";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSearch,
  Network,
  RefreshCw,
  Scale,
  ShieldCheck,
  UserCheck,
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

export function AuditCouncil({ accounts, engagement, setEngagement, metrics, formatCurrency, formatNumber, onToast }) {
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
  const sample = useMemo(() => buildRiskSample(accounts, 36), [accounts]);
  const lineage = useMemo(() => buildEvidenceLineage(accounts, engagement, 6), [accounts, engagement]);
  const currentDecision = engagement.council?.humanDecision || {};
  const [reviewer, setReviewer] = useState(currentDecision.reviewer || "شريك الارتباط");
  const [rationale, setRationale] = useState(currentDecision.rationale || "");
  const [providerRegistry, setProviderRegistry] = useState(() => createDefaultProviderRegistry());
  const [providerBusy, setProviderBusy] = useState(false);

  const notify = (message) => {
    if (typeof onToast === "function") onToast(message);
  };

  const runRound = () => {
    const now = new Date().toISOString();
    setEngagement((current) => {
      const previousRounds = current.council?.rounds || [];
      const roundId = `CR-${String(previousRounds.length + 1).padStart(3, "0")}`;
      const localRun = buildLocalProviderRun({
        snapshot,
        metrics,
        engagement: current,
        accounts,
        runId: `${roundId}-KOSIF-LOCAL`,
        generatedAt: now,
      });
      const round = {
        schemaVersion: 2,
        agentSourceStamp: contextStamp(createAgentContext(accounts, current, metrics, buildReportState(current, metrics))),
        id: roundId,
        generatedAt: now,
        engineVersion: snapshot.engineVersion,
        datasetId: metrics.datasetId || current.sourceDataset?.datasetId || current.demo?.commitment?.datasetId || null,
        inputDigest: localRun.inputDigest,
        policyVersion: PROVIDER_POLICY_VERSION,
        promptVersion: "KOSIF-COUNCIL-LOCAL-v4",
        analysisBasis: snapshot.analysisBasis,
        consensus: snapshot.consensus,
        advisorResults: snapshot.advisors.map(({ id, severity, verdict, refs, standard, detail, actions }) => ({
          id,
          severity,
          verdict,
          refs,
          standard,
          detail,
          actions,
          sourceRunId: localRun.runId,
        })),
        providerRuns: [localRun],
        externalAnalyses: [],
        population: accounts.length,
        sampleSize: sample.length,
        status: "complete",
      };
      return {
        ...current,
        council: {
          ...current.council,
          rounds: [round, ...previousRounds],
          humanDecision: { status: "pending", reviewer: reviewer.trim() || "شريك الارتباط", rationale: "", decidedAt: null },
        },
        auditTrail: [{ id: `LOG-${Date.now()}`, action: "تشغيل جولة المجلس", actor: snapshot.engineVersion, at: now, detail: `${round.id} · ${snapshot.consensus.recommendation} · عينة ${sample.length} حسابًا.` }, ...(current.auditTrail || [])],
        humanApproval: false,
        humanApprovedAt: null,
      };
    });
    setRationale("");
    notify("اكتملت جولة المجلس وحُفظت آراء المقاعد منفصلة عن القرار البشري.");
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
        <div><span className="eyebrow">Advisory · Human governed</span><h2>مجلس المراجعين الذكي</h2><p>أربعة مقاعد تحليلية مستقلة تقرأ اللقطة نفسها، وتعرض التوافق والتعارض والأدلة؛ لا تختار الرأي ولا تعتمد التقرير.</p></div>
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
          <small>{providerRegistry.checkedAt ? `آخر فحص ${localDateTime(providerRegistry.checkedAt)}` : "لم يُنفذ فحص خادمي بعد"}</small>
        </div>
        <p className="gov-provider-note"><ShieldCheck size={16} aria-hidden="true" /> لا تُرسل بيانات الارتباط إلى مزوّد خارجي. الحزمة الاختيارية «summary-only» تستبعد هوية المنشأة وأسماء الحسابات ومحتوى الأدلة؛ والتشغيل الخارجي معطل حتى تتوافر مصادقة وحدود استخدام وخزنة أسرار.</p>
      </section>

      <section className="gov-council-summary">
        <div><BrainCircuit size={21} /><span><small>مقاعد المجلس</small><strong>{formatNumber(snapshot.advisors.length)}</strong></span></div>
        <div><AlertTriangle size={21} /><span><small>إشارات مرتفعة</small><strong>{formatNumber(snapshot.consensus.high)}</strong></span></div>
        <div><FileSearch size={21} /><span><small>حجم العينة</small><strong>{formatNumber(sample.length)}</strong></span></div>
        <div><UserCheck size={21} /><span><small>القرار البشري</small><strong>{currentDecision.status === "approved" ? "معتمد" : currentDecision.status === "rework" ? "إعادة فحص" : "معلق"}</strong></span></div>
        <button type="button" className="button button-gold" onClick={runRound}><RefreshCw size={17} /> تشغيل جولة المجلس</button>
      </section>

      <section className="gov-advisor-grid" aria-label="مقاعد مجلس المراجعين">
        {snapshot.advisors.map((advisor) => (
          <article key={advisor.id} className={`gov-advisor-card severity-${advisor.severity}`}>
            <header><span><AdvisorIcon id={advisor.id} /></span><div><small>{advisor.standard}</small><h3>{advisor.role}</h3></div><b className={`risk-badge risk-${advisor.severity}`}>{severityLabels[advisor.severity]}</b></header>
            <strong className="gov-verdict">{advisor.verdict}</strong>
            <p>{advisor.detail}</p>
            <ul>{advisor.actions.map((action) => <li key={action}>{action}</li>)}</ul>
            <footer>{advisor.refs.length ? advisor.refs.map((ref) => <bdi key={ref}>{ref}</bdi>) : <span>لا توجد مراجع معلقة</span>}</footer>
          </article>
        ))}
      </section>

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
          {(engagement.council?.rounds || []).length ? <div className="gov-round-list">{engagement.council.rounds.slice(0, 6).map((round) => <article key={round.id}><span><strong>{round.id}</strong><small>{localDateTime(round.generatedAt)}</small></span><div><b>{round.consensus.recommendation}</b><small>{formatNumber(round.population)} حسابًا · عينة {formatNumber(round.sampleSize)} · {round.analysisBasis || "أساس قديم"}</small>{round.inputDigest ? <code dir="ltr">{round.inputDigest.slice(0, 16)}…</code> : null}</div><CheckCircle2 size={19} /></article>)}</div> : <div className="gov-empty"><BrainCircuit size={30} /><strong>لم تُشغّل جولة بعد</strong><p>ابدأ جولة لحفظ لقطة يمكن للمراجع البشري مناقشتها واعتماد خطتها.</p></div>}
        </section>
      </div>

      <section className="panel gov-lineage-panel">
        <div className="gov-section-head"><div><span className="eyebrow">Evidence lineage</span><h3>من الحساب إلى النتيجة</h3><p>تربط السلسلة الحساب بالمعيار والتأكيد والخطر والإجراء وطلب المستند والجولة والملاحظة.</p></div></div>
        <div className="gov-lineage-list">{lineage.map((item) => <article key={item.accountId}><div className="gov-lineage-account"><bdi>{item.code}</bdi><strong>{item.account}</strong></div><span><small>المعيار</small><bdi>{item.standard}</bdi></span><span><small>التأكيد</small><b>{item.assertion}</b></span><span><small>الإجراء</small><b>{item.procedure}</b></span><span><small>الدليل / الجولة</small><bdi>{item.evidence} · {item.roundId}</bdi></span><span><small>الملاحظة</small><bdi>{item.finding}</bdi></span></article>)}</div>
      </section>

      <section className="panel gov-sample-panel">
        <div className="gov-section-head"><div><span className="eyebrow">ISA 530 · Reproducible</span><h3>عينة موجهة بالمخاطر</h3><p>60% اختيار موجّه بالمخاطر والقيمة، والباقي اختيار منهجي قابل لإعادة الإنتاج.</p></div><button type="button" className="button button-outline" onClick={exportSample}><Download size={17} /> تصدير العينة CSV</button></div>
        <div className="table-scroll" tabIndex="0"><table><thead><tr><th>#</th><th>الحساب</th><th>المجال</th><th>المخاطر</th><th className="numeric">القيمة</th><th>أساس الاختيار</th></tr></thead><tbody>{sample.slice(0, 16).map((item) => <tr key={item.id}><td>{item.order}</td><td><strong>{item.name}</strong><small className="gov-table-code"><bdi>{item.code}</bdi></small></td><td>{item.area}</td><td><span className={`risk-badge risk-${item.risk}`}>{riskLabels[item.risk]}</span></td><td className="numeric">{formatCurrency(item.amount)}</td><td>{item.basis}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}

export default AuditCouncil;
