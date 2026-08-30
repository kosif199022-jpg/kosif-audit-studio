import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Printer,
  Scale,
  ShieldAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { createProfessionalDocxBlob } from "../professional-docx.js";
import { buildAnalyticalReview } from "../analytics.js";
import { buildReportState, isAdjustmentPosted } from "../reporting.js";
import {
  buildMappingMetrics,
  buildStandardsCoverage,
  getAccountStandardIds,
} from "../standards.js";
import "../professional-outputs.css";

const priorityLabels = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
const priorityRank = { high: 0, medium: 1, low: 2 };
const statusLabels = {
  closed: "معالجة موثقة",
  open: "مفتوحة",
  review: "قيد المراجعة",
  reviewed: "راجعها المراجع",
  needs_review: "تحتاج مراجعة",
  recorded: "مسجلة",
  follow_up: "تحتاج متابعة",
};

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function displayDate(value) {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return "غير مؤرخ";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function controlNeedsFollowUp(item) {
  return /(إبطال|تعذر|فشل|معلق|إعادة فتح|رفض|غير مكتمل)/.test(
    `${item?.action || ""} ${item?.detail || ""}`,
  );
}

export function buildManagementLetterRows(accounts = [], engagement = {}) {
  const analysis = buildAnalyticalReview(accounts);
  const findings = (engagement.findings || []).map((finding) => ({
    id: `finding-${finding.id}`,
    source: "نتيجة مراجعة",
    title: finding.title || finding.summary || finding.id,
    detail: finding.summary || "نتيجة مرتبطة بإجراءات الارتباط.",
    priority: finding.severity || "medium",
    status: finding.status || "open",
    recommendation:
      finding.recommendation
      || finding.resolution
      || "وثّق استجابة الإدارة والإجراء المنفذ واربطهما بالدليل الداعم.",
    references: unique([
      finding.id,
      finding.roundId,
      ...(finding.evidenceIds || []),
      ...(finding.standardIds?.length ? finding.standardIds : [finding.standard]),
    ]),
  }));

  const analyticsReviewed = Boolean(engagement.analyticsReview?.acknowledged);
  const analyticalRows = analysis.insights.map((insight) => ({
    id: `analytics-${insight.id}`,
    source: "إجراء تحليلي",
    title: insight.title,
    detail: insight.detail,
    priority: insight.severity || "medium",
    status: analyticsReviewed ? "reviewed" : "needs_review",
    recommendation: `تحقق من تفسير الإدارة، نفّذ إجراءً موجهًا للمؤشر، ووثّق الاستنتاج المهني ضمن ${insight.auditStandard}.`,
    references: unique([insight.standard, insight.auditStandard, `AN-${insight.id}`]),
  }));

  const controlRows = (engagement.auditTrail || []).slice(0, 8).map((item) => {
    const needsFollowUp = controlNeedsFollowUp(item);
    return {
      id: `control-${item.id}`,
      source: "سجل الرقابة",
      title: item.action || "حدث رقابي",
      detail: `${item.detail || "لا يوجد وصف إضافي."} · ${item.actor || "جهة غير محددة"} · ${displayDate(item.at)}`,
      priority: needsFollowUp ? "high" : "low",
      status: needsFollowUp ? "follow_up" : "recorded",
      recommendation: needsFollowUp
        ? "عيّن مالكًا للإجراء وتاريخ استحقاق، ثم وثّق الإغلاق في سجل الرقابة مع مرجع الدليل."
        : "احتفظ بمرجع التنفيذ والدليل الداعم ضمن ملف الارتباط لإتاحة إعادة الأداء.",
      references: unique([item.id]),
    };
  });

  return [...findings, ...analyticalRows, ...controlRows].sort((first, second) => {
    const priorityDifference = (priorityRank[first.priority] ?? 3) - (priorityRank[second.priority] ?? 3);
    if (priorityDifference) return priorityDifference;
    return first.source.localeCompare(second.source, "ar");
  });
}

export function buildComplianceMatrixRows(accounts = [], mappingState) {
  const coverage = buildStandardsCoverage(accounts, mappingState);
  const representativeByStandard = new Map();

  for (const account of accounts) {
    const standardIds = getAccountStandardIds(account, mappingState, { includeSuggested: true });
    for (const standardId of standardIds) {
      const current = representativeByStandard.get(standardId);
      if (!current || Number(account.amount || 0) > Number(current.amount || 0)) {
        representativeByStandard.set(standardId, account);
      }
    }
  }

  return coverage
    .filter((item) => item.accountCount > 0 || item.reviewRequiredAccountCount > 0)
    .map((item) => ({
      standardId: item.id,
      title: item.title,
      type: item.type,
      accountCount: item.accountCount,
      reviewedAccountCount: item.reviewedAccountCount,
      suggestedAccountCount: item.suggestedAccountCount,
      reviewRequiredAccountCount: item.reviewRequiredAccountCount,
      exposure: item.totalExposure,
      reviewRequiredExposure: item.reviewRequiredExposure,
      areas: item.areas,
      procedures: item.procedures,
      evidence: item.evidence,
      status: item.reviewRequiredAccountCount > 0 ? "review_required" : "covered",
      accountId: representativeByStandard.get(item.id)?.id || null,
    }))
    .sort((first, second) => {
      if (first.status !== second.status) return first.status === "review_required" ? -1 : 1;
      return second.exposure - first.exposure;
    });
}

export function buildUnresolvedIssues(accounts = [], engagement = {}, metrics = null) {
  const issues = [];
  const mapping = buildMappingMetrics(accounts, engagement.standardMappings);

  if (mapping.unresolved > 0) {
    issues.push({
      id: "mapping",
      priority: "high",
      title: "قرارات ربط معيارية غير معتمدة",
      detail: `${mapping.unresolved} حسابًا ما زالت اقتراحاتها بانتظار قرار مراجع موثق.`,
      reference: "MAP",
    });
  }

  for (const finding of engagement.findings || []) {
    if (finding.status === "closed") continue;
    issues.push({
      id: `finding-${finding.id}`,
      priority: finding.severity || "medium",
      title: finding.title || "نتيجة مراجعة مفتوحة",
      detail: finding.recommendation || finding.summary || "يلزم توثيق المعالجة والإغلاق.",
      reference: finding.id,
    });
  }

  for (const item of engagement.evidence || []) {
    if (item.status === "approved") continue;
    issues.push({
      id: `evidence-${item.id}`,
      priority: item.status === "rejected" ? "high" : "medium",
      title: `حزمة دليل غير معتمدة — ${item.title || item.id}`,
      detail: "يلزم إرفاق المحتوى والتحقق من البصمة وتوثيق استنتاج المراجع قبل الاعتماد.",
      reference: item.id,
    });
  }

  const reportState = metrics && typeof metrics === "object"
    ? buildReportState(engagement, metrics)
    : null;
  const evidenceGate = reportState?.gates?.find((gate) => gate.id === "evidence");
  if (evidenceGate && !evidenceGate.pass) {
    issues.push({
      id: "evidence-integrity-gate",
      priority: "high",
      title: "فشل بوابة سلامة الأدلة",
      detail: `${evidenceGate.detail}. لا تكفي حالة «معتمد» وحدها؛ يجب نجاح البصمة والتسلسل الزمني والربط بالجولة والنتيجة.`,
      reference: "REPORT-GATE:EVIDENCE",
    });
  }

  for (const request of engagement.manualPbcRequests || []) {
    if (request.status === "approved" && request.responseReference && request.conclusion) continue;
    issues.push({
      id: `pbc-${request.id}`,
      priority: request.priority || "medium",
      title: `طلب PBC يدوي غير مكتمل — ${request.title || request.id}`,
      detail: "يلزم استلام الاستجابة وبدء الفحص وتوثيق المرجع والاستنتاج قبل إغلاق الطلب.",
      reference: request.id,
    });
  }

  for (const adjustment of engagement.adjustments || []) {
    if (isAdjustmentPosted(adjustment)) continue;
    issues.push({
      id: `adjustment-${adjustment.id}`,
      priority: "high",
      title: `قيد تسوية غير مرحّل — ${adjustment.title || adjustment.id}`,
      detail: "يلزم قرار المراجع وقيد مزدوج متوازن ومرجع ترحيل قبل اعتباره ضمن الرصيد المعدل.",
      reference: adjustment.id,
    });
  }

  if (!engagement.analyticsReview?.acknowledged) {
    issues.push({
      id: "analytics-review",
      priority: "medium",
      title: "التحليلات لم يقرّها مراجع بشري",
      detail: "راجع المؤشرات وإشارات بنفورد، ثم وثّق الإجراء والاستنتاج دون اعتبار المؤشر دليل غش منفردًا.",
      reference: "ANALYTICS",
    });
  }

  if (!engagement.humanApproval || engagement.report?.status !== "ready") {
    issues.push({
      id: "professional-approval",
      priority: "high",
      title: "المخرجات ما زالت مسودة غير معتمدة",
      detail: "لا تصدر تقريرًا نهائيًا قبل اجتياز بوابات الإصدار واشتقاق الرأي من ISA 705 ثم الاعتماد البشري.",
      reference: "REPORT-GATES",
    });
  }

  return issues.sort(
    (first, second) => (priorityRank[first.priority] ?? 3) - (priorityRank[second.priority] ?? 3),
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildWordCompatibleDocument({
  engagement = {},
  metrics = {},
  managementRows = [],
  complianceRows = [],
  unresolvedIssues = [],
  currency = (value) => String(value ?? 0),
}) {
  const entity = engagement.entity || {};
  const row = (cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
  const managementTable = managementRows.map((item) => row([
    priorityLabels[item.priority] || item.priority,
    statusLabels[item.status] || item.status,
    item.title,
    item.recommendation,
    item.references.join(" · "),
  ])).join("");
  const complianceTable = complianceRows.map((item) => row([
    item.standardId,
    item.title,
    item.accountCount,
    currency(item.exposure),
    item.reviewRequiredAccountCount ? `يحتاج مراجعة (${item.reviewRequiredAccountCount})` : "مغطى",
  ])).join("");
  const unresolvedList = unresolvedIssues.length
    ? unresolvedIssues.map((item) => `<li><strong>${escapeHtml(item.reference)}</strong> — ${escapeHtml(item.title)}: ${escapeHtml(item.detail)}</li>`).join("")
    : "<li>لا توجد مسائل غير محسومة وفق حالة الجلسة الحالية.</li>";

  return `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>مسودة مخرجات مهنية مساعدة</title>
<style>body{font-family:Tahoma,Arial,sans-serif;direction:rtl;color:#28134a;line-height:1.7;margin:36px}h1{color:#573b9d}h2{margin-top:28px;border-bottom:2px solid #7254d8;padding-bottom:6px}.draft{padding:10px 14px;background:#fff1c9;border:1px solid #d8ae4c}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:10pt}th,td{border:1px solid #c8b9e5;padding:7px;text-align:right;vertical-align:top}th{background:#eee8ff}.meta{color:#6d6680}.warning{color:#8c4d18}</style></head><body>
<p class="draft"><strong>مسودة مهنية مساعدة</strong> — ليست تقرير تدقيق موقعًا ولا بديلًا عن الحكم والاعتماد البشري.</p>
<h1>حزمة المخرجات المهنية</h1>
<p class="meta">${escapeHtml(entity.name || "المنشأة")} · ${escapeHtml(entity.period || "الفترة الحالية")} · ${escapeHtml(entity.framework || "إطار التقرير المعتمد")}</p>
<p>عدد الحسابات: ${escapeHtml(metrics.accountCount ?? "—")} · الأهمية النسبية: ${escapeHtml(currency(metrics.materiality || 0))}</p>
<h2>خطاب الإدارة — نقاط قابلة للمتابعة</h2>
<table><thead><tr><th>الأولوية</th><th>الحالة</th><th>الموضوع</th><th>التوصية</th><th>المرجع</th></tr></thead><tbody>${managementTable}</tbody></table>
<h2>مصفوفة الالتزام</h2>
<table><thead><tr><th>المعيار</th><th>الوصف</th><th>الحسابات</th><th>التعرض</th><th>الحالة</th></tr></thead><tbody>${complianceTable}</tbody></table>
<h2>المسائل غير المحسومة</h2><ul>${unresolvedList}</ul>
<p class="warning">تعكس هذه الحزمة بيانات الجلسة لحظة التنزيل وقد تتغير عند تحديث الميزان أو الأدلة أو قرارات المراجع.</p>
</body></html>`;
}

function ReferenceChips({ values }) {
  return (
    <span className="po-reference-list">
      {values.map((value) => <bdi key={value} dir="ltr">{value}</bdi>)}
    </span>
  );
}

export function ProfessionalOutputs({
  accounts = [],
  engagement = {},
  metrics = {},
  formatCurrency,
  onOpenStandard,
  onToast,
}) {
  const [speaking, setSpeaking] = useState(false);
  const [docxBusy, setDocxBusy] = useState(false);
  const managementRows = useMemo(
    () => buildManagementLetterRows(accounts, engagement),
    [accounts, engagement],
  );
  const complianceRows = useMemo(
    () => buildComplianceMatrixRows(accounts, engagement.standardMappings),
    [accounts, engagement.standardMappings],
  );
  const unresolvedIssues = useMemo(
    () => buildUnresolvedIssues(accounts, engagement, metrics),
    [accounts, engagement, metrics],
  );
  const currency = (value) => (
    typeof formatCurrency === "function"
      ? formatCurrency(value)
      : new Intl.NumberFormat("ar-SA-u-nu-latn", {
          style: "currency",
          currency: "SAR",
          maximumFractionDigits: 2,
        }).format(Number(value || 0))
  );

  const highPriorityCount = managementRows.filter((item) => item.priority === "high").length;
  const coveredCount = complianceRows.filter((item) => item.status === "covered").length;

  function stopReading(showToast = true) {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
    if (showToast) onToast?.("تم إيقاف القراءة المحلية.");
  }

  function readLocally() {
    if (
      typeof window === "undefined"
      || !("speechSynthesis" in window)
      || typeof window.SpeechSynthesisUtterance !== "function"
    ) {
      onToast?.("القراءة الصوتية المحلية غير متاحة في هذا المتصفح.");
      return;
    }
    if (speaking) {
      stopReading();
      return;
    }
    const focusRows = managementRows.slice(0, 12);
    const text = [
      "مسودة المخرجات المهنية المساعدة.",
      `${unresolvedIssues.length} مسألة غير محسومة و${highPriorityCount} نقطة عالية الأولوية.`,
      ...focusRows.map((item) => `${item.title}. ${item.recommendation}`),
    ].join(" ");
    const localVoices = window.speechSynthesis.getVoices().filter((voice) => voice.localService === true);
    const localVoice = localVoices.find((voice) => /^ar([-_]|$)/i.test(voice.lang)) || localVoices[0];
    if (!localVoice) {
      onToast?.("لا يتوفر صوت مثبت على الجهاز؛ لم تبدأ القراءة ولم يُرسل النص إلى خدمة خارجية.");
      return;
    }
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.voice = localVoice;
    utterance.lang = /^ar([-_]|$)/i.test(localVoice.lang) ? localVoice.lang : "ar-SA";
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
    onToast?.("بدأت القراءة داخل جهازك؛ لم يُرسل النص إلى خادم.");
  }

  async function downloadWordDocument() {
    if (typeof document === "undefined" || typeof URL === "undefined") return;
    if (docxBusy) return;
    setDocxBusy(true);
    try {
      const blob = await createProfessionalDocxBlob({ engagement, metrics, managementRows, complianceRows, unresolvedIssues, currency });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      anchor.href = href;
      anchor.download = `kosif-professional-draft-${date}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
      onToast?.("تم تنزيل DOCX حقيقي مشتق من بيانات الجلسة الحالية.");
    } catch {
      onToast?.("تعذر تجهيز ملف DOCX. أعد المحاولة بعد التحقق من بيانات الجلسة.");
    } finally {
      setDocxBusy(false);
    }
  }

  function printDraft() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    stopReading(false);
    const html = buildWordCompatibleDocument({
      engagement,
      metrics,
      managementRows,
      complianceRows,
      unresolvedIssues,
      currency,
    });
    const frame = document.createElement("iframe");
    frame.className = "professional-print-frame";
    frame.title = "نسخة طباعة المخرجات المهنية";
    frame.srcdoc = html;
    frame.addEventListener("load", () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 800);
    }, { once: true });
    document.body.append(frame);
  }

  return (
    <div className="view-stack professional-outputs" dir="rtl">
      <section className="po-hero" aria-labelledby="professional-outputs-title">
        <div className="po-hero-copy">
          <span className="po-draft-badge"><FileText size={16} aria-hidden="true" /> مسودة مهنية مساعدة</span>
          <h1 id="professional-outputs-title">المخرجات المهنية وخطاب الإدارة</h1>
          <p>
            حزمة حيّة تستمد نقاطها من نتائج المراجعة والتحليلات وسجل الرقابة،
            وتربط مصفوفة الالتزام مباشرةً بحسابات الميزان وقرارات المعايير.
          </p>
          <div className="po-actions po-no-print">
            <button type="button" className="button button-primary" disabled={docxBusy} onClick={downloadWordDocument}>
              <Download size={17} aria-hidden="true" /> {docxBusy ? "جارٍ تجهيز DOCX…" : "تنزيل Word (.docx)"}
            </button>
            <button type="button" className="button button-outline" onClick={readLocally} aria-pressed={speaking}>
              {speaking ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
              {speaking ? "إيقاف القراءة" : "قراءة محلية"}
            </button>
            <button type="button" className="button button-outline" onClick={printDraft}>
              <Printer size={17} aria-hidden="true" /> طباعة المسودة
            </button>
          </div>
        </div>
        <div className="po-hero-score" aria-label="حالة المخرجات">
          <ShieldAlert size={27} aria-hidden="true" />
          <strong>{unresolvedIssues.length}</strong>
          <span>مسألة غير محسومة</span>
        </div>
      </section>

      <aside className="po-disclaimer" role="note">
        <AlertTriangle size={20} aria-hidden="true" />
        <p><strong>ليست تقرير تدقيق موقعًا.</strong> هذه الحزمة أداة مساعدة للمراجع، وتعكس حالة الجلسة الحالية فقط. إصدار أي رأي يتطلب استكمال البوابات والحكم والاعتماد البشري.</p>
      </aside>

      <section className="po-summary-grid" aria-label="ملخص المخرجات المهنية">
        <article><ClipboardList size={19} aria-hidden="true" /><span>نقاط خطاب الإدارة</span><strong>{managementRows.length}</strong></article>
        <article><AlertTriangle size={19} aria-hidden="true" /><span>عالية الأولوية</span><strong>{highPriorityCount}</strong></article>
        <article><BookOpenCheck size={19} aria-hidden="true" /><span>معايير مغطاة</span><strong>{coveredCount}/{complianceRows.length}</strong></article>
        <article><Scale size={19} aria-hidden="true" /><span>حسابات الجلسة</span><strong>{metrics.accountCount ?? accounts.length}</strong></article>
      </section>

      <section className="panel po-section" aria-labelledby="management-letter-title">
        <header className="po-section-head">
          <div><span className="eyebrow">نتائج + تحليلات + رقابة</span><h2 id="management-letter-title">مسودة خطاب الإدارة</h2><p>كل نقطة تعرض الأولوية والحالة والتوصية والمراجع القابلة للتتبع.</p></div>
          <span className="po-count">{managementRows.length} نقطة</span>
        </header>
        <div className="po-table-scroll" tabIndex="0" aria-label="جدول خطاب الإدارة">
          <table className="po-table">
            <thead><tr><th>الأولوية</th><th>المصدر والموضوع</th><th>الحالة</th><th>التوصية</th><th>المرجع</th></tr></thead>
            <tbody>
              {managementRows.map((item) => (
                <tr key={item.id}>
                  <td><span className={`po-priority is-${item.priority}`}>{priorityLabels[item.priority] || item.priority}</span></td>
                  <td><small>{item.source}</small><strong>{item.title}</strong><p>{item.detail}</p></td>
                  <td><span className={`po-status is-${item.status}`}>{statusLabels[item.status] || item.status}</span></td>
                  <td>{item.recommendation}</td>
                  <td><ReferenceChips values={item.references} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel po-section" aria-labelledby="compliance-matrix-title">
        <header className="po-section-head">
          <div><span className="eyebrow">من الميزان إلى المعيار</span><h2 id="compliance-matrix-title">مصفوفة الالتزام الحيّة</h2><p>الأرصدة والتعرض والحالة مشتقة من خريطة المعايير الحالية، وليست قائمة ثابتة.</p></div>
          <span className="po-count">{complianceRows.length} معيارًا مرتبطًا</span>
        </header>
        <div className="po-table-scroll" tabIndex="0" aria-label="جدول مصفوفة الالتزام">
          <table className="po-table po-compliance-table">
            <thead><tr><th>المعيار</th><th>الحسابات</th><th>التعرض المرتبط</th><th>نطاق التطبيق</th><th>الحالة</th></tr></thead>
            <tbody>
              {complianceRows.map((row) => (
                <tr key={row.standardId}>
                  <td>
                    <button
                      type="button"
                      className="po-standard-link"
                      onClick={() => onOpenStandard?.(row.standardId, row.accountId || null, "professional-compliance")}
                      title={`فتح ${row.standardId} ووصف علاقته بالحساب`}
                    >
                      <BookOpenCheck size={16} aria-hidden="true" /><bdi dir="ltr">{row.standardId}</bdi>
                    </button>
                    <small>{row.title}</small>
                  </td>
                  <td><strong>{row.accountCount}</strong><small>{row.reviewedAccountCount} بقرار مراجع · {row.suggestedAccountCount} ربط منهجي</small></td>
                  <td><strong dir="ltr">{currency(row.exposure)}</strong>{row.reviewRequiredExposure > 0 ? <small>معلق: {currency(row.reviewRequiredExposure)}</small> : null}</td>
                  <td>{row.areas.length ? row.areas.slice(0, 3).join("، ") : "نطاق عابر للحسابات"}</td>
                  <td>
                    <span className={`po-compliance-state is-${row.status}`}>
                      {row.status === "covered" ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
                      {row.status === "covered" ? "مغطى" : `${row.reviewRequiredAccountCount} يحتاج مراجعة`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`panel po-section po-unresolved ${unresolvedIssues.length ? "has-issues" : "is-clear"}`} aria-labelledby="unresolved-title">
        <header className="po-section-head">
          <div><span className="eyebrow">Fail closed</span><h2 id="unresolved-title">المسائل غير المحسومة</h2><p>لا تختفي المسألة من هذه القائمة إلا عندما تتغير حالة المصدر الفعلي في الجلسة.</p></div>
          <span className="po-count">{unresolvedIssues.length}</span>
        </header>
        {unresolvedIssues.length ? (
          <ol className="po-issue-list">
            {unresolvedIssues.map((item) => (
              <li key={item.id}>
                <span className={`po-priority is-${item.priority}`}>{priorityLabels[item.priority] || item.priority}</span>
                <div><strong>{item.title}</strong><p>{item.detail}</p></div>
                <bdi dir="ltr">{item.reference}</bdi>
              </li>
            ))}
          </ol>
        ) : (
          <div className="po-clear-state"><CheckCircle2 size={25} aria-hidden="true" /><div><strong>لا توجد مسائل غير محسومة وفق حالة الجلسة</strong><p>يبقى إصدار التقرير خاضعًا للحكم المهني والتحقق من بوابات الإصدار.</p></div></div>
        )}
      </section>
    </div>
  );
}
