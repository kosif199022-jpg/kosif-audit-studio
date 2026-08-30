import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  Link2,
  MessageSquare,
  Mic,
  Plus,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  User,
} from "lucide-react";
import {
  attachedReferenceLibrary,
  officialSources,
  standardCatalog,
} from "../standards.js";
import "../reviewer-workspace.css";

const TAB_DEFINITIONS = [
  { id: "pbc", label: "سجل PBC", icon: FileText },
  { id: "notes", label: "ملاحظات المراجع", icon: MessageSquare },
  { id: "sources", label: "مركز المصادر", icon: BookOpen },
];

const PBC_STATUS_LABELS = {
  pending: "بانتظار الاستلام",
  received: "مستلم",
  review: "قيد الفحص",
  approved: "معتمد",
};

const SOURCE_FILTERS = [
  { id: "all", label: "الكل" },
  { id: "official", label: "رسمي" },
  { id: "attached", label: "مرفق" },
  { id: "custom", label: "شخصي" },
];

const ACCOUNT_OPTION_LIMIT = 100;

function normalizeAccountSearch(value) {
  return String(value || "")
    .toLocaleLowerCase("ar")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .trim();
}

const toArabicNumber = (value) =>
  new Intl.NumberFormat("ar-SA-u-nu-latn").format(Number(value || 0));

const formatDate = (value) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const makeId = (prefix) => {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

function normalizeProfessionalUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return null;
    }
    const sensitiveParameter = /(?:api[-_]?key|access[-_]?token|auth|password|secret|signature)/i;
    for (const key of parsed.searchParams.keys()) {
      if (sensitiveParameter.test(key)) return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function addAuditEntry(current, action, detail, at) {
  return [
    {
      id: makeId("LOG"),
      action,
      actor: "المراجع المحلي",
      at,
      detail,
    },
    ...(current.auditTrail || []),
  ];
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="reviewer-empty-state">
      <Icon size={28} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function PbcWorkspace({ engagement, setEngagement, onToast, onOpenRound }) {
  const rounds = engagement?.rounds || [];
  const evidenceRequests = engagement?.evidence || [];
  const manualRequests = engagement?.manualPbcRequests || [];
  const requests = useMemo(
    () => [
      ...manualRequests.map((item) => ({ ...item, requestOrigin: "manual" })),
      ...evidenceRequests.map((item) => ({ ...item, requestOrigin: "evidence" })),
    ],
    [evidenceRequests, manualRequests],
  );
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ title: "", roundId: "", owner: "فريق المراجعة", due: "" });
  const [manualReviewDrafts, setManualReviewDrafts] = useState({});

  const counts = useMemo(() => {
    const result = { total: requests.length, pending: 0, active: 0, approved: 0 };
    for (const request of requests) {
      if (request.status === "approved") result.approved += 1;
      else if (request.status === "pending") result.pending += 1;
      else result.active += 1;
    }
    return result;
  }, [requests]);

  function addManualRequest(event) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title || !draft.roundId) {
      onToast?.("أدخل وصف الطلب واختر الجولة المرتبطة قبل الحفظ.");
      return;
    }
    const createdAt = new Date().toISOString();
    const round = rounds.find((item) => item.id === draft.roundId);
    const request = {
      id: makeId("PBC-MANUAL"),
      title,
      roundId: draft.roundId,
      area: round?.title || "طلب مهني إضافي",
      owner: draft.owner.trim() || "فريق المراجعة",
      due: draft.due || "غير محدد",
      status: "pending",
      priority: round?.risk || "medium",
      standardIds: [...(round?.standards || [])],
      createdAt,
      source: "reviewer-manual-request",
    };

    setEngagement?.((current) => ({
      ...current,
      humanApproval: false,
      humanApprovedAt: null,
      report: { ...current.report, status: "draft" },
      manualPbcRequests: [...(current.manualPbcRequests || []), request],
      auditTrail: addAuditEntry(
        current,
        "إضافة طلب PBC يدوي",
        `${request.id} · ${request.title} · الجولة ${request.roundId} · محفوظ داخل جلسة الارتباط ولم يُرسل خارجيًا.`,
        createdAt,
      ),
    }));
    setDraft({ title: "", roundId: "", owner: "فريق المراجعة", due: "" });
    setShowForm(false);
    onToast?.("أضيف طلب PBC وربط بالجولة؛ أُعيد فتح الاعتماد النهائي لتوثيق أثره.");
  }

  function advanceManualRequest(request) {
    const transitions = { pending: "received", received: "review", review: "approved" };
    const nextStatus = transitions[request.status || "pending"];
    if (!nextStatus) return;
    const reviewDraft = manualReviewDrafts[request.id] || {};
    if (nextStatus === "approved" && (!reviewDraft.responseReference?.trim() || !reviewDraft.conclusion?.trim())) {
      onToast?.("أدخل مرجع الاستجابة واستنتاج الفحص قبل اعتماد الطلب اليدوي.");
      return;
    }
    const changedAt = new Date().toISOString();
    setEngagement?.((current) => ({
      ...current,
      humanApproval: false,
      humanApprovedAt: null,
      report: { ...current.report, status: "draft" },
      manualPbcRequests: (current.manualPbcRequests || []).map((item) => item.id === request.id ? {
        ...item,
        status: nextStatus,
        receivedAt: nextStatus === "received" ? changedAt : item.receivedAt,
        reviewStartedAt: nextStatus === "review" ? changedAt : item.reviewStartedAt,
        approvedAt: nextStatus === "approved" ? changedAt : item.approvedAt,
        approvedBy: nextStatus === "approved" ? "مدير المراجعة" : item.approvedBy,
        responseReference: nextStatus === "approved" ? reviewDraft.responseReference.trim() : item.responseReference,
        conclusion: nextStatus === "approved" ? reviewDraft.conclusion.trim() : item.conclusion,
      } : item),
      auditTrail: addAuditEntry(
        current,
        "تحديث طلب PBC يدوي",
        `${request.id} · ${PBC_STATUS_LABELS[nextStatus]} · أُعيد فتح اعتماد التقرير.`,
        changedAt,
      ),
    }));
    onToast?.(`تم تحديث الطلب اليدوي إلى «${PBC_STATUS_LABELS[nextStatus]}».`);
  }

  return (
    <div className="reviewer-tab-panel" role="tabpanel" id="reviewer-panel-pbc" aria-labelledby="reviewer-tab-pbc">
      <div className="reviewer-panel-head">
        <div>
          <span className="eyebrow">Prepared by client</span>
          <h3>سجل الطلبات والأدلة</h3>
          <p>يجمع طلبات الأدلة الأساسية والطلبات اليدوية في عداد واحد، مع ربط مباشر بجولة المراجعة.</p>
        </div>
        <button type="button" className="reviewer-primary-action" onClick={() => setShowForm((current) => !current)} aria-expanded={showForm}>
          <Plus size={17} aria-hidden="true" />
          طلب يدوي
        </button>
      </div>

      <div className="reviewer-metrics" aria-label="ملخص سجل PBC">
        <span><b>{toArabicNumber(counts.total)}</b> إجمالي الطلبات</span>
        <span><b>{toArabicNumber(counts.pending)}</b> بانتظار الاستلام</span>
        <span><b>{toArabicNumber(counts.active)}</b> قيد المعالجة</span>
        <span className="is-success"><b>{toArabicNumber(counts.approved)}</b> معتمد</span>
      </div>

      {showForm ? (
        <form className="reviewer-inline-form" onSubmit={addManualRequest}>
          <label className="reviewer-field reviewer-field-wide">
            <span>وصف الطلب</span>
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={240} placeholder="مثال: مصادقة مستقلة للرصيد البنكي" />
          </label>
          <label className="reviewer-field">
            <span>الجولة</span>
            <select value={draft.roundId} onChange={(event) => setDraft((current) => ({ ...current, roundId: event.target.value }))}>
              <option value="">اختر الجولة</option>
              {rounds.map((round) => <option key={round.id} value={round.id}>{round.id} · {round.title}</option>)}
            </select>
          </label>
          <label className="reviewer-field">
            <span>المالك</span>
            <input value={draft.owner} onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))} maxLength={90} />
          </label>
          <label className="reviewer-field">
            <span>تاريخ الاستحقاق</span>
            <input type="date" value={draft.due} onChange={(event) => setDraft((current) => ({ ...current, due: event.target.value }))} />
          </label>
          <button type="submit" className="reviewer-primary-action"><CheckCircle2 size={17} aria-hidden="true" /> حفظ الطلب</button>
        </form>
      ) : null}

      <div className="reviewer-pbc-list">
        {requests.map((request) => (
          <article key={`${request.requestOrigin}-${request.id}`} className="reviewer-pbc-card">
            <div className="reviewer-record-icon" aria-hidden="true"><FileText size={19} /></div>
            <div className="reviewer-record-main">
              <div className="reviewer-record-title">
                <strong>{request.title}</strong>
                <span className={`reviewer-status is-${request.status || "pending"}`}>{PBC_STATUS_LABELS[request.status] || "قيد المتابعة"}</span>
                {request.requestOrigin === "manual" ? <span className="reviewer-origin">يدوي</span> : null}
              </div>
              <small><bdi dir="ltr">{request.id}</bdi> · {request.area || "طلب أدلة"}</small>
              <div className="reviewer-record-meta">
                <span><User size={14} aria-hidden="true" /> {request.owner || "غير محدد"}</span>
                <span><CalendarDays size={14} aria-hidden="true" /> {request.due || "غير محدد"}</span>
                {request.roundId ? (
                  <button type="button" onClick={() => onOpenRound?.(request.roundId)} title={`فتح الجولة ${request.roundId}`}>
                    الجولة <bdi dir="ltr">{request.roundId}</bdi>
                  </button>
                ) : null}
              </div>
              {(request.standardIds || []).length ? (
                <div className="reviewer-standard-pills" aria-label="معايير الطلب">
                  {request.standardIds.map((id) => <bdi key={id} dir="ltr">{id}</bdi>)}
                </div>
              ) : null}
              {request.requestOrigin === "manual" && request.status === "review" ? (
                <div className="reviewer-manual-review-fields">
                  <label><span>مرجع الاستجابة</span><input value={manualReviewDrafts[request.id]?.responseReference || ""} onChange={(event) => setManualReviewDrafts((current) => ({ ...current, [request.id]: { ...current[request.id], responseReference: event.target.value } }))} placeholder="مثال: PBC-RESP-014" /></label>
                  <label><span>استنتاج الفحص</span><textarea rows="2" value={manualReviewDrafts[request.id]?.conclusion || ""} onChange={(event) => setManualReviewDrafts((current) => ({ ...current, [request.id]: { ...current[request.id], conclusion: event.target.value } }))} placeholder="صف كفاية الاستجابة وأي استثناء." /></label>
                </div>
              ) : null}
              {request.requestOrigin === "manual" && request.status !== "approved" ? (
                <button type="button" className="reviewer-inline-action" onClick={() => advanceManualRequest(request)}>
                  {request.status === "pending" ? "تسجيل الاستلام" : request.status === "received" ? "بدء الفحص" : "اعتماد الطلب"}
                </button>
              ) : null}
              {request.requestOrigin === "manual" && request.status === "approved" ? <small className="reviewer-approved-conclusion">{request.responseReference} · {request.conclusion}</small> : null}
            </div>
          </article>
        ))}
        {!requests.length ? <EmptyState icon={FileText} title="لا توجد طلبات بعد" description="أضف طلبًا يدويًا واربطه بجولة المراجعة." /> : null}
      </div>
    </div>
  );
}

function ReviewerNotes({ accounts, engagement, setEngagement, onToast, onOpenRound, onOpenStandard }) {
  const rounds = engagement?.rounds || [];
  const notes = engagement?.reviewerNotes || [];
  const [draft, setDraft] = useState({ text: "", accountId: "", roundId: "", standardId: "" });
  const [accountSearch, setAccountSearch] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [dictationUsed, setDictationUsed] = useState(false);
  const recognitionRef = useRef(null);
  const speechAvailable = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const accountOptions = useMemo(() => {
    const query = normalizeAccountSearch(accountSearch);
    const selectedAccount = draft.accountId
      ? accounts.find((account) => account.id === draft.accountId)
      : null;
    const result = selectedAccount ? [selectedAccount] : [];
    const remaining = ACCOUNT_OPTION_LIMIT - result.length;

    for (const account of accounts) {
      if (account.id === selectedAccount?.id) continue;
      if (query && !normalizeAccountSearch([
        account.id,
        account.code,
        account.name,
        account.areaLabel,
      ].filter(Boolean).join(" ")).includes(query)) continue;
      result.push(account);
      if (result.length >= ACCOUNT_OPTION_LIMIT || result.length - (selectedAccount ? 1 : 0) >= remaining) break;
    }

    return result;
  }, [accounts, accountSearch, draft.accountId]);

  function saveNote(event) {
    event.preventDefault();
    const text = draft.text.trim();
    if (!text) {
      onToast?.("اكتب الملاحظة أو استخدم إملاء المتصفح قبل الحفظ.");
      return;
    }
    const createdAt = new Date().toISOString();
    const note = {
      id: makeId("NOTE"),
      text,
      accountId: draft.accountId || null,
      roundId: draft.roundId || null,
      standardId: draft.standardId || null,
      createdAt,
      author: "المراجع المحلي",
      captureMethod: dictationUsed ? "browser-speech-interface" : "typed-local-session",
    };
    setEngagement?.((current) => ({
      ...current,
      reviewerNotes: [note, ...(current.reviewerNotes || [])],
      auditTrail: addAuditEntry(
        current,
        "حفظ ملاحظة مراجع",
        `${note.id} · الحساب ${note.accountId || "—"} · الجولة ${note.roundId || "—"} · المعيار ${note.standardId || "—"}.`,
        createdAt,
      ),
    }));
    setDraft({ text: "", accountId: "", roundId: "", standardId: "" });
    setDictationUsed(false);
    onToast?.("حُفظت الملاحظة داخل جلسة الارتباط المحلية.");
  }

  function deleteNote(note) {
    const changedAt = new Date().toISOString();
    setEngagement?.((current) => ({
      ...current,
      reviewerNotes: (current.reviewerNotes || []).filter((item) => item.id !== note.id),
      auditTrail: addAuditEntry(current, "حذف ملاحظة مراجع", `${note.id} · حذف يدوي من جلسة الارتباط المحلية.`, changedAt),
    }));
    onToast?.("حُذفت الملاحظة من جلسة الارتباط.");
  }

  function toggleDictation() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      onToast?.("الإملاء الصوتي غير مدعوم في هذا المتصفح؛ لم يُرسل أي صوت خارجيًا.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "ar-SA";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => onToast?.("تعذر إملاء المتصفح؛ يمكنك كتابة الملاحظة يدويًا.");
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setDraft((current) => ({ ...current, text: [current.text.trim(), transcript].filter(Boolean).join(" ") }));
        setDictationUsed(true);
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  return (
    <div className="reviewer-tab-panel" role="tabpanel" id="reviewer-panel-notes" aria-labelledby="reviewer-tab-notes">
      <div className="reviewer-panel-head">
        <div>
          <span className="eyebrow">ورقة ملاحظات محلية</span>
          <h3>ملاحظات مرتبطة بسياق المراجعة</h3>
          <p>اربط الملاحظة بحساب أو جولة أو معيار؛ الحفظ ضمن حالة الجلسة ولا يعني مزامنة سحابية.</p>
        </div>
        <span className="reviewer-local-badge"><ShieldCheck size={16} aria-hidden="true" /> محلي</span>
      </div>

      <form className="reviewer-note-composer" onSubmit={saveNote}>
        <label className="reviewer-field reviewer-field-wide">
          <span>الملاحظة</span>
          <textarea rows="5" value={draft.text} onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} maxLength={3000} placeholder="دوّن حكمك المهني أو سؤال المتابعة أو الاستنتاج الأولي…" />
        </label>
        <div className="reviewer-note-links">
          <label className="reviewer-field">
            <span>الحساب</span>
            <input
              type="search"
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder="ابحث بالرمز أو الاسم"
              aria-label="البحث في حسابات الملاحظة"
              autoComplete="off"
            />
            <select value={draft.accountId} onChange={(event) => setDraft((current) => ({ ...current, accountId: event.target.value }))}>
              <option value="">دون حساب محدد</option>
              {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
            </select>
            <small>تظهر حتى {ACCOUNT_OPTION_LIMIT} نتيجة، مع إبقاء الحساب المحدد ظاهرًا.</small>
          </label>
          <label className="reviewer-field">
            <span>الجولة</span>
            <select value={draft.roundId} onChange={(event) => setDraft((current) => ({ ...current, roundId: event.target.value }))}>
              <option value="">دون جولة محددة</option>
              {rounds.map((round) => <option key={round.id} value={round.id}>{round.id} · {round.title}</option>)}
            </select>
          </label>
          <label className="reviewer-field">
            <span>المعيار</span>
            <select value={draft.standardId} onChange={(event) => setDraft((current) => ({ ...current, standardId: event.target.value }))}>
              <option value="">دون معيار محدد</option>
              {standardCatalog.map((standard) => <option key={standard.id} value={standard.id}>{standard.id} · {standard.title}</option>)}
            </select>
          </label>
        </div>
        <div className="reviewer-composer-actions">
          <button type="button" className={`reviewer-secondary-action ${isListening ? "is-listening" : ""}`} onClick={toggleDictation} aria-pressed={isListening} title={speechAvailable ? "إملاء باستخدام واجهة المتصفح" : "غير مدعوم في هذا المتصفح"}>
            {isListening ? <Square size={15} fill="currentColor" aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
            {isListening ? "إيقاف الإملاء" : "إملاء المتصفح"}
          </button>
          <small>قد تعتمد الميزة على خدمة الجهاز أو مزود المتصفح؛ لا يرسل KOSIF التسجيل إلى خادم مهيأ له.</small>
          <button type="submit" className="reviewer-primary-action"><CheckCircle2 size={17} aria-hidden="true" /> حفظ الملاحظة</button>
        </div>
      </form>

      <div className="reviewer-notes-list">
        {notes.map((note) => {
          const account = accounts.find((item) => item.id === note.accountId);
          return (
            <article key={note.id} className="reviewer-note-card">
              <div className="reviewer-note-copy">
                <p>{note.text}</p>
                <small>{note.author || "المراجع المحلي"} · {formatDate(note.createdAt)}</small>
                <div className="reviewer-note-context">
                  {account ? <span><Link2 size={13} aria-hidden="true" /> {account.code} · {account.name}</span> : null}
                  {note.roundId ? <button type="button" onClick={() => onOpenRound?.(note.roundId)}>الجولة <bdi dir="ltr">{note.roundId}</bdi></button> : null}
                  {note.standardId ? <button type="button" onClick={() => onOpenStandard?.(note.standardId, note.accountId || null, "reviewer-note")}><bdi dir="ltr">{note.standardId}</bdi></button> : null}
                </div>
              </div>
              <button type="button" className="reviewer-delete-action" onClick={() => deleteNote(note)} aria-label={`حذف الملاحظة ${note.id}`} title="حذف الملاحظة"><Trash2 size={17} aria-hidden="true" /></button>
            </article>
          );
        })}
        {!notes.length ? <EmptyState icon={MessageSquare} title="لا توجد ملاحظات محفوظة" description="أنشئ ملاحظة واربطها بالسجل الذي يدعم الحكم المهني." /> : null}
      </div>
    </div>
  );
}

function SourcesWorkspace({ engagement, setEngagement, onToast }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ title: "", url: "" });
  const customSources = engagement?.customProfessionalSources || [];

  const sources = useMemo(() => [
    ...officialSources.map((source) => ({ ...source, kind: "official", subtitle: source.issuer, description: source.status === "project" ? "مشاريع وتحديثات مهنية" : `مصدر رسمي · تحقق ${source.lastVerified || "—"}` })),
    ...attachedReferenceLibrary.map((source) => ({ ...source, kind: "attached", subtitle: source.authority, description: `${source.role} · ${source.location}` })),
    ...customSources.map((source) => ({ ...source, kind: "custom", subtitle: "مرجع شخصي", description: "أضيف يدويًا إلى جلسة الارتباط" })),
  ], [customSources]);

  const visibleSources = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ar");
    return sources.filter((source) => {
      if (filter !== "all" && source.kind !== filter) return false;
      if (!needle) return true;
      return [source.title, source.subtitle, source.description, source.url]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ar").includes(needle));
    });
  }, [filter, query, sources]);

  function addCustomSource(event) {
    event.preventDefault();
    const title = draft.title.trim();
    const url = normalizeProfessionalUrl(draft.url);
    if (!title || !url) {
      onToast?.("أدخل عنوانًا ورابط HTTPS عامًا بلا بيانات دخول أو رموز وصول.");
      return;
    }
    if (customSources.some((source) => source.url === url)) {
      onToast?.("هذا الرابط موجود بالفعل في المصادر الشخصية.");
      return;
    }
    const createdAt = new Date().toISOString();
    const source = { id: makeId("SRC"), title, url, createdAt, source: "reviewer-custom-link" };
    setEngagement?.((current) => ({
      ...current,
      customProfessionalSources: [...(current.customProfessionalSources || []), source],
      auditTrail: addAuditEntry(current, "إضافة مصدر مهني شخصي", `${source.id} · ${source.title} · رابط HTTPS عام بلا بيانات اعتماد مخزنة.`, createdAt),
    }));
    setDraft({ title: "", url: "" });
    setShowForm(false);
    onToast?.("أضيف الرابط إلى مصادر جلسة الارتباط.");
  }

  function deleteCustomSource(source) {
    const changedAt = new Date().toISOString();
    setEngagement?.((current) => ({
      ...current,
      customProfessionalSources: (current.customProfessionalSources || []).filter((item) => item.id !== source.id),
      auditTrail: addAuditEntry(current, "حذف مصدر مهني شخصي", `${source.id} · ${source.title}.`, changedAt),
    }));
    onToast?.("حُذف الرابط الشخصي من جلسة الارتباط.");
  }

  return (
    <div className="reviewer-tab-panel" role="tabpanel" id="reviewer-panel-sources" aria-labelledby="reviewer-tab-sources">
      <div className="reviewer-panel-head">
        <div>
          <span className="eyebrow">مصادر ومرفقات مهنية</span>
          <h3>مركز الاستناد والتحقق</h3>
          <p>يفصل المصادر الرسمية عن المرفقات الإرشادية والروابط الشخصية، ولا يعرضها بدرجة سلطة واحدة.</p>
        </div>
        <button type="button" className="reviewer-primary-action" onClick={() => setShowForm((current) => !current)} aria-expanded={showForm}><Plus size={17} aria-hidden="true" /> رابط شخصي</button>
      </div>

      {showForm ? (
        <form className="reviewer-source-form" onSubmit={addCustomSource}>
          <label className="reviewer-field"><span>اسم المصدر</span><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={160} placeholder="اسم الجهة أو الوثيقة" /></label>
          <label className="reviewer-field reviewer-field-wide"><span>رابط HTTPS عام</span><input type="url" dir="ltr" inputMode="url" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} placeholder="https://example.org/professional-source" /></label>
          <button type="submit" className="reviewer-primary-action"><Link2 size={17} aria-hidden="true" /> إضافة آمنة</button>
          <small><ShieldCheck size={14} aria-hidden="true" /> تُرفض روابط بيانات الدخول ورموز الوصول والمعلمات الحساسة.</small>
        </form>
      ) : null}

      <div className="reviewer-source-controls">
        <label className="reviewer-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">بحث في المصادر</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم الجهة أو الوثيقة…" />
        </label>
        <div className="reviewer-filter-tabs" role="group" aria-label="تصفية المصادر">
          {SOURCE_FILTERS.map((option) => (
            <button key={option.id} type="button" className={filter === option.id ? "active" : ""} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}</button>
          ))}
        </div>
        <span className="reviewer-source-count">{toArabicNumber(visibleSources.length)} مصدر</span>
      </div>

      <div className="reviewer-source-grid">
        {visibleSources.map((source) => (
          <article key={`${source.kind}-${source.id}`} className={`reviewer-source-card is-${source.kind}`}>
            <div className="reviewer-source-kind">
              <BookOpen size={17} aria-hidden="true" />
              <span>{source.kind === "official" ? "مصدر رسمي" : source.kind === "attached" ? "مرجع مرفق" : "رابط شخصي"}</span>
            </div>
            <strong>{source.title}</strong>
            <small>{source.subtitle}</small>
            <p>{source.description}</p>
            <div className="reviewer-source-actions">
              {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> فتح المصدر</a> : <span><FileText size={15} aria-hidden="true" /> بيانات وصفية داخل الملف</span>}
              {source.kind === "custom" ? <button type="button" onClick={() => deleteCustomSource(source)} aria-label={`حذف المصدر ${source.title}`}><Trash2 size={15} aria-hidden="true" /> حذف</button> : null}
            </div>
          </article>
        ))}
        {!visibleSources.length ? <EmptyState icon={Search} title="لا توجد نتائج مطابقة" description="غيّر عبارة البحث أو نوع المصدر." /> : null}
      </div>
    </div>
  );
}

export function ReviewerWorkspace({
  accounts = [],
  engagement = {},
  setEngagement,
  onToast,
  onOpenRound,
  onOpenStandard,
}) {
  const [activeTab, setActiveTab] = useState("pbc");
  const tabCounts = {
    pbc: (engagement.evidence?.length || 0) + (engagement.manualPbcRequests?.length || 0),
    notes: engagement.reviewerNotes?.length || 0,
    sources: officialSources.length + attachedReferenceLibrary.length + (engagement.customProfessionalSources?.length || 0),
  };
  const handleTabKeyDown = (event, currentIndex) => {
    let nextIndex = null;

    if (event.key === "ArrowLeft") nextIndex = (currentIndex + 1) % TAB_DEFINITIONS.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex - 1 + TAB_DEFINITIONS.length) % TAB_DEFINITIONS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TAB_DEFINITIONS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = TAB_DEFINITIONS[nextIndex].id;
    setActiveTab(nextTab);
    document.getElementById(`reviewer-tab-${nextTab}`)?.focus();
  };

  return (
    <div className="reviewer-workspace" dir="rtl">
      <section className="panel reviewer-hero">
        <div>
          <span className="eyebrow">مساحة المراجع · Reviewer workspace</span>
          <h2>طلبات وملاحظات ومصادر في سياق واحد</h2>
          <p>مساحة تشغيل محلية تربط أعمال المتابعة بالحساب والجولة والمعيار دون ادعاء مزامنة أو معالجة خارجية.</p>
        </div>
        <div className="reviewer-hero-mark" aria-hidden="true"><ShieldCheck size={28} /><span><b>{toArabicNumber(tabCounts.notes)}</b> ملاحظات</span></div>
      </section>

      <section className="panel reviewer-shell">
        <div className="reviewer-tabs" role="tablist" aria-label="أقسام مساحة المراجع" aria-orientation="horizontal">
          {TAB_DEFINITIONS.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              id={`reviewer-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`reviewer-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              className={activeTab === id ? "active" : ""}
              onClick={() => setActiveTab(id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              <b>{toArabicNumber(tabCounts[id])}</b>
            </button>
          ))}
        </div>

        {activeTab === "pbc" ? <PbcWorkspace engagement={engagement} setEngagement={setEngagement} onToast={onToast} onOpenRound={onOpenRound} /> : null}
        {activeTab === "notes" ? <ReviewerNotes accounts={accounts} engagement={engagement} setEngagement={setEngagement} onToast={onToast} onOpenRound={onOpenRound} onOpenStandard={onOpenStandard} /> : null}
        {activeTab === "sources" ? <SourcesWorkspace engagement={engagement} setEngagement={setEngagement} onToast={onToast} /> : null}
      </section>
    </div>
  );
}
