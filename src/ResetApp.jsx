import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileClock,
  FileText,
  FileUp,
  FolderOpen,
  ListChecks,
  Moon,
  Plus,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  UserCheck,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";
import {
  DOCUMENT_TYPES,
  RESET_MIGRATION_KEY,
  RESET_STORAGE_KEY,
  RESET_THEME_KEY,
  REVIEWER_ROLES,
  buildCouncilRound,
  buildFinalReport,
  createEmptyAuditState,
  inferDocumentType,
  makeId,
  sanitizeState,
  typeLabel,
} from "./reset-audit-engine.js";
import {
  deleteDocumentIndex,
  documentDescriptor,
  extractAuditDocument,
  readDocumentIndex,
} from "./document-workbench.js";
import { clearEvidenceStore, readEvidenceBytes } from "./evidence-store.js";
import "./reset-app.css";

const NAV = [
  { id: "documents", label: "رفع المستندات", icon: FileUp },
  { id: "council", label: "مجلس المراجعين", icon: UsersRound },
  { id: "rounds", label: "جولات المراجعة", icon: RotateCcw },
  { id: "requests", label: "المستندات المطلوبة", icon: FileClock },
  { id: "report", label: "التقرير النهائي", icon: FileCheck2 },
];

const priorityLabels = { critical: "حرج", high: "مرتفع", medium: "متوسط", low: "منخفض" };
const outcomeLabels = {
  needs_documents: "يحتاج مستندات إضافية",
  ready_for_decision: "جاهز للقرار",
  scope_limitation: "قيد نطاق موثق",
};

function resetLegacyStorageOnce() {
  try {
    if (localStorage.getItem(RESET_MIGRATION_KEY) === "1") return false;
    const protectedKeys = new Set([RESET_MIGRATION_KEY, RESET_THEME_KEY]);
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean);
    for (const key of keys) {
      if (protectedKeys.has(key)) continue;
      if (key.startsWith("kosif")) localStorage.removeItem(key);
    }
    localStorage.setItem(RESET_MIGRATION_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

function loadState() {
  resetLegacyStorageOnce();
  try {
    return sanitizeState(JSON.parse(localStorage.getItem(RESET_STORAGE_KEY) || "null"));
  } catch {
    return createEmptyAuditState();
  }
}

function loadTheme() {
  try {
    const stored = localStorage.getItem(RESET_THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  } catch {
    return "dark";
  }
}

function nowIso() {
  return new Date().toISOString();
}

function humanDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 ** 2)).toFixed(1)} MB`;
}

function StatusBadge({ children, tone = "neutral" }) {
  return <span className={`reset-status reset-status-${tone}`}>{children}</span>;
}

function EmptyState({ icon: Icon = FolderOpen, title, detail, action }) {
  return <div className="reset-empty"><span><Icon size={30} /></span><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

function PageHead({ eyebrow, title, description, action }) {
  return <header className="reset-page-head"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action ? <div>{action}</div> : null}</header>;
}

function Sidebar({ view, onView, state }) {
  const openRequests = state.requests.filter((item) => item.status === "requested").length;
  return <aside className="reset-sidebar" aria-label="مسار المراجعة">
    <div className="reset-brand"><span><ShieldCheck size={24} /></span><div><b>KOSIF</b><small>دورة مراجعة محكومة</small></div></div>
    <nav>{NAV.map((item, index) => { const Icon = item.icon; const badge = item.id === "requests" && openRequests ? openRequests : null; return <button key={item.id} type="button" className={view === item.id ? "active" : ""} onClick={() => onView(item.id)}><span className="reset-nav-step">{index + 1}</span><Icon size={19} /><b>{item.label}</b>{badge ? <em>{badge}</em> : null}<ChevronLeft size={16} /></button>; })}</nav>
    <div className="reset-sidebar-note"><ShieldCheck size={18} /><p>كل جولة تبني على المستندات السابقة. لا يصدر التقرير قبل معالجة الطلبات أو توثيق عدم توفرها.</p></div>
  </aside>;
}

function BottomNav({ view, onView, state }) {
  const openRequests = state.requests.filter((item) => item.status === "requested").length;
  return <nav className="reset-bottom-nav" aria-label="التنقل على الجوال">{NAV.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} type="button" onClick={() => onView(item.id)}><Icon size={20} /><span>{item.label.replace("المستندات المطلوبة", "الطلبات").replace("جولات المراجعة", "الجولات").replace("مجلس المراجعين", "المجلس").replace("التقرير النهائي", "التقرير")}</span>{item.id === "requests" && openRequests ? <em>{openRequests}</em> : null}</button>; })}</nav>;
}

function DocumentUploadWorkspace({ state, setState, hydratedDocuments, setHydratedDocuments, onToast, onView }) {
  const [staged, setStaged] = useState([]);
  const [batchDescription, setBatchDescription] = useState("");
  const [source, setSource] = useState("من الشركة");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  function stageFiles(files) {
    const next = [...files].slice(0, 25).map((file) => ({
      id: makeId("STAGE"), file, type: inferDocumentType(file.name), description: file.name.replace(/\.[^.]+$/, ""),
    }));
    setStaged((current) => [...current, ...next].slice(0, 40));
  }

  function updateStaged(id, patch) {
    setStaged((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function uploadAll() {
    const companyName = state.company.name.trim();
    const period = state.company.period.trim();
    if (companyName.length < 2 || period.length < 4) return onToast("اكتب اسم الشركة والفترة المالية قبل رفع المستندات.", "error");
    if (!staged.length) return onToast("اختر مستندًا واحدًا على الأقل.", "error");
    if (staged.some((item) => !item.description.trim())) return onToast("اكتب وصفًا لكل مستند قبل الرفع.", "error");
    setBusy(true);
    let uploaded = 0;
    let failed = 0;
    const addedDescriptors = [];
    const addedFull = [];
    for (const item of staged) {
      try {
        const extracted = await extractAuditDocument(item.file, { maxPages: 80 });
        const existing = state.documents.some((doc) => doc.documentId === extracted.documentId) || addedDescriptors.some((doc) => doc.documentId === extracted.documentId);
        if (existing) continue;
        const enriched = {
          ...extracted,
          type: item.type,
          description: item.description.trim(),
          source: source.trim() || "من الشركة",
          batchDescription: batchDescription.trim(),
          availability: "available",
          uploadedAt: nowIso(),
        };
        addedFull.push(enriched);
        addedDescriptors.push({ ...documentDescriptor(enriched), snippetCount: enriched.snippetCount });
        uploaded += 1;
      } catch (error) {
        const fallback = {
          id: makeId("DOC"), documentId: makeId("HASH"), name: item.file.name, size: item.file.size, type: item.type,
          description: item.description.trim(), source: source.trim() || "من الشركة", batchDescription: batchDescription.trim(),
          availability: "available", uploadedAt: nowIso(), snippetCount: 0, loadError: error?.message || "تعذر قراءة المستند.", method: "unreadable",
        };
        addedDescriptors.push(fallback);
        addedFull.push(fallback);
        failed += 1;
      }
    }
    setState((current) => ({
      ...current,
      documents: [...current.documents, ...addedDescriptors],
      finalReport: null,
      auditTrail: [{ id: makeId("LOG"), at: nowIso(), action: "رفع دفعة مستندات", detail: `${uploaded} مقروءة · ${failed} تحتاج معالجة · ${batchDescription.trim() || "دون وصف دفعة"}` }, ...current.auditTrail],
    }));
    setHydratedDocuments((current) => [...current, ...addedFull]);
    setStaged([]);
    setBatchDescription("");
    setBusy(false);
    onToast(`تمت إضافة ${uploaded + failed} مستندات. ${failed ? `${failed} مستندات تحتاج نسخة نصية/OCR.` : "تمت فهرستها محليًا."}`, failed ? "warning" : "success");
  }

  async function removeDocument(document) {
    try { if (!document.loadError) await deleteDocumentIndex(document); } catch {}
    setHydratedDocuments((current) => current.filter((item) => item.id !== document.id));
    setState((current) => ({
      ...current,
      documents: current.documents.filter((item) => item.id !== document.id),
      finalReport: null,
      auditTrail: [{ id: makeId("LOG"), at: nowIso(), action: "حذف مستند", detail: document.name }, ...current.auditTrail],
    }));
  }

  return <div className="reset-page">
    <PageHead eyebrow="الخطوة 1" title="رفع المستندات" description="ابدأ بملف الشركة من الصفر. ارفع أكثر من مستند أو دفعة في كل مرة، واكتب وصفًا يوضح ما الذي يحتويه كل ملف." action={state.documents.length ? <button className="reset-button secondary" type="button" onClick={() => onView("council")}>التالي: تشغيل المجلس <ChevronLeft size={17} /></button> : null} />

    <section className="reset-card reset-company-card">
      <div className="reset-card-title"><Building2 size={20} /><div><h2>بيانات ملف المراجعة</h2><p>هذه البيانات فقط هي التي ستظهر في الجولات والتقرير الجديد.</p></div></div>
      <div className="reset-form-grid">
        <label><span>اسم الشركة</span><input value={state.company.name} onChange={(event) => setState((current) => ({ ...current, company: { ...current.company, name: event.target.value }, finalReport: null }))} placeholder="اسم المنشأة" /></label>
        <label><span>الفترة المالية</span><input value={state.company.period} onChange={(event) => setState((current) => ({ ...current, company: { ...current.company, period: event.target.value }, finalReport: null }))} placeholder="مثال: السنة المنتهية في 31/12/2026" /></label>
        <label><span>النشاط</span><input value={state.company.activity} onChange={(event) => setState((current) => ({ ...current, company: { ...current.company, activity: event.target.value }, finalReport: null }))} placeholder="اختياري" /></label>
      </div>
    </section>

    <section className="reset-card">
      <div className="reset-card-title"><Upload size={20} /><div><h2>دفعة مستندات جديدة</h2><p>PDF النصي وWord وExcel وCSV والنصوص تُفهرس محليًا. الملفات المصورة تُرفض كمصدر مقروء حتى يتوفر OCR/نسخة نصية.</p></div></div>
      <div className="reset-upload-meta"><label><span>مصدر المستندات</span><input value={source} onChange={(event) => setSource(event.target.value)} /></label><label><span>وصف الدفعة</span><input value={batchDescription} onChange={(event) => setBatchDescription(event.target.value)} placeholder="مثال: ملفات الإقفال الأولية من الإدارة المالية" /></label></div>
      <button type="button" className="reset-dropzone" onClick={() => fileInputRef.current?.click()}><FileUp size={30} /><strong>اختر مستندات أو اسحبها للرفع</strong><small>PDF · DOCX · XLSX/XLS · CSV/TSV · TXT/MD/XML/JSON — حتى 80MB للملف</small></button>
      <input ref={fileInputRef} hidden multiple type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.tsv,.txt,.md,.xml,.json" onChange={(event) => { stageFiles(event.target.files || []); event.target.value = ""; }} />

      {staged.length ? <div className="reset-staged-list">{staged.map((item) => <article key={item.id}><div className="reset-file-icon"><FileText size={20} /></div><div className="reset-staged-main"><strong>{item.file.name}</strong><small>{formatBytes(item.file.size)}</small><div className="reset-staged-fields"><label><span>نوع المستند</span><select value={item.type} onChange={(event) => updateStaged(item.id, { type: event.target.value })}>{DOCUMENT_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label><span>وصف المستند</span><input value={item.description} onChange={(event) => updateStaged(item.id, { description: event.target.value })} /></label></div></div><button type="button" className="reset-icon-button" aria-label="إزالة المستند من الدفعة" onClick={() => setStaged((current) => current.filter((entry) => entry.id !== item.id))}><X size={18} /></button></article>)}</div> : null}
      {staged.length ? <div className="reset-actions"><button type="button" className="reset-button primary" disabled={busy} onClick={uploadAll}>{busy ? <><RefreshCcw className="spin" size={17} /> جارٍ الفهرسة…</> : <><Upload size={17} /> إضافة {staged.length} مستندات إلى الملف</>}</button></div> : null}
    </section>

    <section className="reset-card">
      <div className="reset-card-title"><FolderOpen size={20} /><div><h2>المستندات الحالية</h2><p>{state.documents.length} مستندًا في ملف المراجعة الحالي.</p></div></div>
      {!state.documents.length ? <EmptyState title="لا توجد بيانات تجريبية أو مستندات مسبقة" detail="KOSIF مصفّر بالكامل. أول خطوة هي رفع مستندات الشركة الفعلية." /> : <div className="reset-document-grid">{state.documents.map((document) => <article key={document.id} className={document.loadError ? "has-error" : ""}><header><span><FileText size={18} /></span><div><strong>{document.name}</strong><small>{typeLabel(document.type)} · {formatBytes(document.size)}</small></div></header><p>{document.description}</p><div className="reset-doc-meta"><span>{document.source}</span><span>{document.loadError ? "غير مقروء نصيًا" : `${document.snippetCount || 0} مقطع مفهرس`}</span></div>{document.loadError ? <div className="reset-inline-warning"><AlertTriangle size={15} /> {document.loadError}</div> : <StatusBadge tone="success">جاهز للمراجعة</StatusBadge>}<button type="button" className="reset-text-button danger" onClick={() => removeDocument(document)}><Trash2 size={15} /> حذف</button></article>)}</div>}
    </section>
  </div>;
}

function CouncilWorkspace({ state, setState, onToast, onView }) {
  const enabledCount = state.council.members.filter((member) => member.enabled !== false).length;
  function toggleMember(id) {
    if (state.council.status === "active") return onToast("أوقف المجلس أو أعد تصفير الملف لتغيير تشكيلته بعد التشغيل.", "warning");
    setState((current) => ({ ...current, council: { ...current.council, members: current.council.members.map((member) => member.id === id ? { ...member, enabled: !member.enabled } : member) } }));
  }
  function startCouncil() {
    if (!state.documents.length) return onToast("ارفع مستندًا واحدًا على الأقل قبل تشغيل المجلس.", "error");
    if (enabledCount < 2) return onToast("فعّل عضوين على الأقل في مجلس المراجعين.", "error");
    const startedAt = nowIso();
    setState((current) => ({ ...current, council: { ...current.council, status: "active", startedAt }, auditTrail: [{ id: makeId("LOG"), at: startedAt, action: "تشغيل مجلس المراجعين", detail: `${enabledCount} أعضاء مفعلين` }, ...current.auditTrail] }));
    onToast("تم تشغيل المجلس. يمكنك الآن بدء الجولة الأولى لمراجعة المستندات.", "success");
  }
  return <div className="reset-page">
    <PageHead eyebrow="الخطوة 2" title="تشغيل مجلس المراجعين" description="المجلس لا يصدر حكمًا تلقائيًا؛ كل عضو يراجع الملف من زاوية محددة، وقائد المجلس يحدد هل نحتاج مستندات إضافية أم يمكن الانتقال للقرار." />
    <section className={`reset-council-state ${state.council.status === "active" ? "active" : ""}`}><div><UsersRound size={30} /><span><small>حالة المجلس</small><strong>{state.council.status === "active" ? "يعمل على ملف المراجعة" : "لم يتم التشغيل بعد"}</strong>{state.council.startedAt ? <em>منذ {humanDate(state.council.startedAt)}</em> : null}</span></div>{state.council.status === "active" ? <button className="reset-button primary" type="button" onClick={() => onView("rounds")}>مراجعة المستندات الآن <ChevronLeft size={17} /></button> : <button className="reset-button primary" type="button" onClick={startCouncil}><UsersRound size={17} /> تشغيل المجلس</button>}</section>
    <section className="reset-card"><div className="reset-card-title"><UserCheck size={20} /><div><h2>تشكيلة المجلس</h2><p>اختر أعضاء الجولة قبل التشغيل. الأدوار مصممة لفصل البيانات والأدلة والمخاطر والجودة.</p></div></div><div className="reset-reviewer-grid">{state.council.members.map((member) => <button key={member.id} type="button" className={member.enabled !== false ? "enabled" : ""} onClick={() => toggleMember(member.id)} disabled={state.council.status === "active"}><span>{member.enabled !== false ? <Check size={17} /> : null}</span><div><strong>{member.title}</strong><p>{member.focus}</p></div></button>)}</div></section>
  </div>;
}

function RoundWorkspace({ state, setState, hydratedDocuments, onToast, onView }) {
  const [busy, setBusy] = useState(false);
  const documentsForReview = useMemo(() => state.documents.map((descriptor) => {
    const hydrated = hydratedDocuments.find((item) => item.id === descriptor.id || item.documentId === descriptor.documentId);
    return hydrated ? { ...descriptor, ...hydrated, type: descriptor.type, description: descriptor.description, source: descriptor.source } : descriptor;
  }), [state.documents, hydratedDocuments]);

  function startRound() {
    setBusy(true);
    try {
      const result = buildCouncilRound({ documents: documentsForReview, requests: state.requests, council: state.council, previousRounds: state.rounds, now: nowIso() });
      setState((current) => ({
        ...current,
        rounds: [...current.rounds, result.round],
        requests: [...current.requests, ...result.requests],
        finalReport: null,
        auditTrail: [{ id: makeId("LOG"), at: result.round.createdAt, action: `إكمال الجولة ${result.round.number}`, detail: `${outcomeLabels[result.round.outcome]} · ${result.requests.length} طلبات جديدة` }, ...current.auditTrail],
      }));
      onToast(`اكتملت الجولة ${result.round.number}: ${outcomeLabels[result.round.outcome]}.`, result.round.outcome === "ready_for_decision" ? "success" : "warning");
      if (result.requests.length) window.setTimeout(() => onView("requests"), 250);
    } catch (error) {
      onToast(error?.message || "تعذر بدء الجولة.", "error");
    } finally {
      setBusy(false);
    }
  }

  const lastRound = state.rounds.at(-1);
  const openRequests = state.requests.filter((item) => item.status === "requested").length;
  const canStart = state.council.status === "active" && state.documents.length > 0 && openRequests === 0;

  return <div className="reset-page">
    <PageHead eyebrow="الخطوة 3" title="جولات المراجعة" description="كل جولة تعيد قراءة الملف الحالي مع المستندات الإضافية، ثم تعطي رأيًا واضحًا: نحتاج مستندات، جاهز للقرار، أو يوجد قيد نطاق." action={<button type="button" className="reset-button primary" disabled={!canStart || busy} onClick={startRound}>{busy ? <><RefreshCcw className="spin" size={17} /> جارٍ المراجعة…</> : <><RotateCcw size={17} /> {state.rounds.length ? `بدء الجولة ${state.rounds.length + 1}` : "مراجعة المستندات · الجولة الأولى"}</>}</button>} />

    {!state.rounds.length ? <EmptyState icon={RotateCcw} title="لم تبدأ أي جولة بعد" detail={state.council.status !== "active" ? "شغّل مجلس المراجعين أولًا." : "اضغط «مراجعة المستندات» ليبدأ المجلس الجولة الأولى على الملفات المرفوعة."} action={state.council.status !== "active" ? <button className="reset-button secondary" onClick={() => onView("council")}>فتح المجلس</button> : null} /> : <div className="reset-round-list">{[...state.rounds].reverse().map((round) => <article key={round.id} className={`reset-round reset-round-${round.outcome}`}><header><span className="reset-round-number">{round.number}</span><div><small>الجولة {round.number} · {humanDate(round.createdAt)}</small><h2>{outcomeLabels[round.outcome]}</h2></div><StatusBadge tone={round.outcome === "ready_for_decision" ? "success" : round.outcome === "scope_limitation" ? "warning" : "danger"}>{outcomeLabels[round.outcome]}</StatusBadge></header><p className="reset-verdict">{round.verdict}</p><div className="reset-role-opinions">{round.roleOpinions.map((opinion) => <div key={opinion.roleId}><strong>{opinion.title}</strong><p>{opinion.text}</p></div>)}</div><details><summary>مراجعة المستندات في هذه الجولة ({round.documentReviews.length})</summary><div className="reset-document-review-list">{round.documentReviews.map((review) => <div key={review.documentId}><span>{review.status === "reviewed" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span><div><strong>{review.name}</strong><p>{review.summary}</p>{review.signals?.map((signal) => <small key={signal}>• {signal}</small>)}</div></div>)}</div></details>{round.requestIds.length ? <button type="button" className="reset-button secondary" onClick={() => onView("requests")}>فتح {round.requestIds.length} مستندات مطلوبة <ChevronLeft size={17} /></button> : round.outcome !== "needs_documents" ? <button type="button" className="reset-button primary" onClick={() => onView("report")}>الانتقال للقرار النهائي <ChevronLeft size={17} /></button> : null}</article>)}</div>}

    {lastRound && openRequests > 0 ? <div className="reset-inline-warning"><AlertTriangle size={18} /> لا تبدأ جولة جديدة قبل رفع المستندات المطلوبة أو تعليمها «غير متوفر» مع السبب.</div> : null}
  </div>;
}

function RequestsWorkspace({ state, setState, hydratedDocuments, setHydratedDocuments, onToast, onView }) {
  const [busyId, setBusyId] = useState(null);
  const [reasons, setReasons] = useState({});
  const openCount = state.requests.filter((item) => item.status === "requested").length;

  async function attachRequestFile(request, file) {
    if (!file) return;
    setBusyId(request.id);
    try {
      const extracted = await extractAuditDocument(file, { maxPages: 80 });
      const enriched = { ...extracted, type: request.documentType, description: `استجابة للطلب ${request.id}: ${request.title}`, source: "استجابة من الشركة", batchDescription: `الجولة ${request.roundNumber}`, availability: "available", uploadedAt: nowIso(), requestId: request.id };
      const descriptor = { ...documentDescriptor(enriched), snippetCount: enriched.snippetCount };
      setHydratedDocuments((current) => [...current.filter((item) => item.documentId !== enriched.documentId), enriched]);
      setState((current) => ({
        ...current,
        documents: current.documents.some((item) => item.documentId === descriptor.documentId) ? current.documents : [...current.documents, descriptor],
        requests: current.requests.map((item) => item.id === request.id ? { ...item, status: "uploaded", documentId: descriptor.documentId, resolvedAt: nowIso() } : item),
        finalReport: null,
        auditTrail: [{ id: makeId("LOG"), at: nowIso(), action: "رفع مستند مطلوب", detail: `${request.id} · ${file.name}` }, ...current.auditTrail],
      }));
      onToast(`تم رفع ${request.title} وربطه بالجولة ${request.roundNumber}.`, "success");
    } catch (error) {
      onToast(error?.message || "تعذر قراءة المستند المطلوب.", "error");
    } finally {
      setBusyId(null);
    }
  }

  function markUnavailable(request) {
    const reason = String(reasons[request.id] || "").trim();
    if (reason.length < 5) return onToast("اكتب سببًا واضحًا لعدم توفر المستند.", "error");
    setState((current) => ({
      ...current,
      requests: current.requests.map((item) => item.id === request.id ? { ...item, status: "unavailable", unavailableReason: reason, resolvedAt: nowIso() } : item),
      finalReport: null,
      auditTrail: [{ id: makeId("LOG"), at: nowIso(), action: "تعذر توفير مستند", detail: `${request.id} · ${reason}` }, ...current.auditTrail],
    }));
    onToast("تم توثيق عدم توفر المستند. سيقيّم المجلس أثر قيد النطاق في الجولة التالية.", "warning");
  }

  return <div className="reset-page">
    <PageHead eyebrow="الخطوة 4" title="المستندات المطلوبة" description="طلبات المجلس مرتبة حسب الجولة. لكل طلب خياران فقط: ترفع المستند، أو توثق أنه غير متوفر وسبب ذلك." action={!openCount && state.requests.length ? <button className="reset-button primary" onClick={() => onView("rounds")}>بدء جولة المتابعة <RotateCcw size={17} /></button> : null} />
    {!state.requests.length ? <EmptyState icon={FileClock} title="لا توجد طلبات مستندات" detail="عند انتهاء أي جولة بحاجتها لأدلة إضافية، ستظهر الطلبات هنا تلقائيًا برقم الجولة وسبب الطلب." /> : <div className="reset-request-list">{[...state.requests].reverse().map((request) => <article key={request.id} className={`reset-request reset-request-${request.status}`}><header><div><span>الجولة {request.roundNumber}</span><strong>{request.title}</strong><small><bdi>{request.id}</bdi> · {priorityLabels[request.priority] || request.priority}</small></div><StatusBadge tone={request.status === "uploaded" ? "success" : request.status === "unavailable" ? "warning" : "danger"}>{request.status === "uploaded" ? "تم الرفع" : request.status === "unavailable" ? "غير متوفر" : "مطلوب"}</StatusBadge></header><p>{request.reason}</p>{request.status === "requested" ? <div className="reset-request-actions"><label className="reset-button primary"><Upload size={16} /> {busyId === request.id ? "جارٍ القراءة…" : "رفع المستند"}<input hidden type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.tsv,.txt,.md,.xml,.json" disabled={busyId === request.id} onChange={async (event) => { const file = event.target.files?.[0]; await attachRequestFile(request, file); event.target.value = ""; }} /></label><div className="reset-unavailable"><input value={reasons[request.id] || ""} onChange={(event) => setReasons((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="سبب عدم توفر المستند" /><button type="button" className="reset-button danger" onClick={() => markUnavailable(request)}><XCircle size={16} /> غير متوفر</button></div></div> : request.status === "unavailable" ? <div className="reset-inline-warning"><AlertTriangle size={16} /> {request.unavailableReason}</div> : <div className="reset-inline-success"><CheckCircle2 size={16} /> رُبط المستند بالطلب وسيُراجع في الجولة التالية.</div>}</article>)}</div>}
  </div>;
}

function ReportWorkspace({ state, setState, onToast, onView }) {
  const [reviewerName, setReviewerName] = useState(state.finalReport?.approvedBy || "");
  const lastRound = state.rounds.at(-1);
  const openRequests = state.requests.filter((item) => item.status === "requested");
  const ready = lastRound && lastRound.outcome !== "needs_documents" && openRequests.length === 0;

  function issueReport() {
    try {
      const report = buildFinalReport(state, { reviewerName, now: nowIso() });
      setState((current) => ({ ...current, finalReport: report, auditTrail: [{ id: makeId("LOG"), at: report.approvedAt, action: "إصدار التقرير النهائي", detail: `${report.decisionClass} · ${report.approvedBy}` }, ...current.auditTrail] }));
      onToast("تم اعتماد وإصدار التقرير النهائي بواسطة المراجع المسؤول.", "success");
    } catch (error) {
      onToast(error?.message || "تعذر إصدار التقرير.", "error");
    }
  }

  function downloadReport() {
    if (!state.finalReport) return;
    const blob = new Blob([JSON.stringify({ report: state.finalReport, rounds: state.rounds, requests: state.requests, documents: state.documents.map(({ snippets, ...item }) => item), auditTrail: state.auditTrail }, null, 2)], { type: "application/json;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `KOSIF-${state.company.name || "audit"}-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  return <div className="reset-page reset-report-page">
    <PageHead eyebrow="الخطوة 5" title="القرار والتقرير النهائي" description="KOSIF لا يصدر رأيًا مهنيًا من تلقاء نفسه. عندما تنتهي دورة الجولات، يعرض أساس القرار والقيود، ثم يعتمد المراجع المسؤول التقرير صراحةً." />
    {!ready && !state.finalReport ? <EmptyState icon={ShieldCheck} title="التقرير غير جاهز بعد" detail={!state.rounds.length ? "ابدأ جولة مراجعة أولًا." : openRequests.length ? `لا يزال ${openRequests.length} طلبات مستندات مفتوحة.` : "الجولة الأخيرة ما زالت تحتاج مستندات إضافية."} action={<button className="reset-button secondary" onClick={() => onView(openRequests.length ? "requests" : "rounds")}>العودة لمسار المراجعة</button>} /> : null}

    {ready && !state.finalReport ? <section className="reset-card reset-final-gate"><div className="reset-card-title"><ClipboardCheck size={21} /><div><h2>بوابة الاعتماد البشري</h2><p>الجولة الأخيرة: {outcomeLabels[lastRound.outcome]}. راجع الأساس ثم اكتب اسم المراجع المسؤول لإصدار التقرير.</p></div></div><div className="reset-report-basis"><strong>رأي المجلس في الجولة {lastRound.number}</strong><p>{lastRound.verdict}</p></div><label className="reset-reviewer-input"><span>اسم المراجع المسؤول</span><input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} placeholder="الاسم الذي يتحمل مسؤولية الاعتماد" /></label><button className="reset-button primary" type="button" onClick={issueReport}><ShieldCheck size={17} /> اعتماد وإصدار التقرير النهائي</button></section> : null}

    {state.finalReport ? <article className="reset-final-report"><header><div><span className="reset-report-logo"><ShieldCheck size={26} /></span><div><small>KOSIF · تقرير مراجعة محكوم</small><h1>{state.finalReport.company.name || "المنشأة"}</h1><p>{state.finalReport.company.period}</p></div></div><StatusBadge tone={state.finalReport.decisionClass === "scope-limited" ? "warning" : "success"}>صادر · {humanDate(state.finalReport.approvedAt)}</StatusBadge></header><section><span>القرار</span><h2>{state.finalReport.decisionClass === "scope-limited" ? "قرار مع قيد نطاق أدلة" : "الأدلة كافية ضمن النطاق الحالي"}</h2><p>{state.finalReport.conclusion}</p></section><div className="reset-report-metrics"><div><b>{state.finalReport.documentsCount}</b><span>مستندات</span></div><div><b>{state.finalReport.roundsCount}</b><span>جولات</span></div><div><b>{state.finalReport.requestsCount}</b><span>طلبات</span></div><div><b>{state.finalReport.unavailableRequests.length}</b><span>غير متوفر</span></div></div>{state.finalReport.unavailableRequests.length ? <section><span>قيود الأدلة</span>{state.finalReport.unavailableRequests.map((item) => <p key={item.id}><bdi>{item.id}</bdi> · {item.title}: {item.reason}</p>)}</section> : null}<section><span>أساس القرار</span><p>{state.finalReport.basis}</p></section><footer><div><strong>اعتمد بواسطة</strong><b>{state.finalReport.approvedBy}</b><small>{humanDate(state.finalReport.approvedAt)}</small></div><p>{state.finalReport.guardrail}</p></footer><div className="reset-actions no-print"><button className="reset-button secondary" onClick={() => window.print()}><FileText size={16} /> طباعة / حفظ PDF</button><button className="reset-button primary" onClick={downloadReport}><Download size={16} /> تنزيل ملف المراجعة JSON</button></div></article> : null}
  </div>;
}

export function ResetApp() {
  const [state, setState] = useState(loadState);
  const [view, setView] = useState("documents");
  const [theme, setTheme] = useState(loadTheme);
  const [hydratedDocuments, setHydratedDocuments] = useState([]);
  const [toast, setToast] = useState(null);
  const migrationClearedRef = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.resetTheme = theme;
    try { localStorage.setItem(RESET_THEME_KEY, theme); } catch {}
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem(RESET_STORAGE_KEY, JSON.stringify(state)); } catch {
      setToast({ message: "تعذر حفظ حالة الملف محليًا؛ لا تغلق الصفحة قبل تنزيل التقرير.", tone: "warning" });
    }
  }, [state]);

  useEffect(() => {
    if (migrationClearedRef.current) return;
    migrationClearedRef.current = true;
    if (resetLegacyStorageOnce()) clearEvidenceStore().catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    const descriptors = state.documents.filter((document) => !document.loadError);
    Promise.all(descriptors.map(async (descriptor) => {
      const existing = hydratedDocuments.find((item) => item.id === descriptor.id);
      if (existing?.snippets) return existing;
      try { return { ...descriptor, ...(await readDocumentIndex(descriptor)) }; }
      catch (error) { return { ...descriptor, loadError: error?.message || "تعذر استعادة الفهرس المحلي." }; }
    })).then((items) => {
      if (!live) return;
      const unreadable = state.documents.filter((document) => document.loadError);
      setHydratedDocuments([...items, ...unreadable]);
    });
    return () => { live = false; };
    // Hydration is keyed by persisted document identity; hydratedDocuments is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.documents.map((document) => document.id).join("|")]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function notify(message, tone = "success") {
    setToast({ message, tone });
  }

  async function hardReset() {
    const confirmed = window.confirm("سيتم حذف ملف المراجعة الحالي والمستندات المحلية والجولات والطلبات. هل تريد التصفير الكامل؟");
    if (!confirmed) return;
    try { await clearEvidenceStore(); } catch {}
    try { localStorage.removeItem(RESET_STORAGE_KEY); } catch {}
    setState(createEmptyAuditState());
    setHydratedDocuments([]);
    setView("documents");
    notify("تم تصفير KOSIF بالكامل. ابدأ برفع مستندات شركة جديدة.", "success");
  }

  const openRequests = state.requests.filter((item) => item.status === "requested").length;
  const progress = [state.documents.length > 0, state.council.status === "active", state.rounds.length > 0, state.requests.length === 0 || openRequests === 0, Boolean(state.finalReport)].filter(Boolean).length;

  return <div className="reset-app" dir="rtl">
    <Sidebar view={view} onView={setView} state={state} />
    <div className="reset-shell">
      <header className="reset-topbar"><div className="reset-mobile-brand"><ShieldCheck size={22} /><b>KOSIF</b></div><div className="reset-context">{state.company.name ? <><Building2 size={16} /><b>{state.company.name}</b></> : <span>ملف مراجعة جديد</span>}{state.company.period ? <><CalendarDays size={16} /><small>{state.company.period}</small></> : null}</div><div className="reset-top-actions"><span className="reset-progress" title="تقدم المسار"><i style={{ width: `${progress * 20}%` }} /><b>{progress}/5</b></span><button type="button" className="reset-icon-button" title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"} aria-label={theme === "dark" ? "تشغيل الوضع النهاري" : "تشغيل الوضع الليلي"} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button><button type="button" className="reset-button ghost-danger" onClick={hardReset}><Trash2 size={16} /><span>تصفير الملف</span></button></div></header>
      <main className="reset-main">
        {view === "documents" ? <DocumentUploadWorkspace state={state} setState={setState} hydratedDocuments={hydratedDocuments} setHydratedDocuments={setHydratedDocuments} onToast={notify} onView={setView} /> : null}
        {view === "council" ? <CouncilWorkspace state={state} setState={setState} onToast={notify} onView={setView} /> : null}
        {view === "rounds" ? <RoundWorkspace state={state} setState={setState} hydratedDocuments={hydratedDocuments} onToast={notify} onView={setView} /> : null}
        {view === "requests" ? <RequestsWorkspace state={state} setState={setState} hydratedDocuments={hydratedDocuments} setHydratedDocuments={setHydratedDocuments} onToast={notify} onView={setView} /> : null}
        {view === "report" ? <ReportWorkspace state={state} setState={setState} onToast={notify} onView={setView} /> : null}
      </main>
    </div>
    <BottomNav view={view} onView={setView} state={state} />
    {toast ? <div className={`reset-toast ${toast.tone}`} role="status" aria-live="polite">{toast.tone === "error" ? <XCircle size={18} /> : toast.tone === "warning" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}{toast.message}</div> : null}
  </div>;
}
