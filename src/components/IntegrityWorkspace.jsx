import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Landmark,
  Link2,
  LockKeyhole,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import {
  buildJournalHashChain,
  buildReconciliationCases,
  createJournalEntries,
  verifyJournalHashChain,
} from "../governance.js";
import { paginateJournalEntries, queryJournalEntries } from "../journal-query.js";
import "../governance.css";

const reconciliationLabels = {
  exact: "مطابقة تامة",
  tolerance: "ضمن السماحية",
  split: "دفعة مجزأة",
  combined: "مطابقة مجمعة",
  exception: "استثناء",
};

function localDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function shortHash(value) {
  return value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "قيد الحساب";
}

function IntegrityMetric({ icon: Icon, label, value, helper, tone = "teal" }) {
  return <article className={`gov-integrity-metric tone-${tone}`}><span><Icon size={20} /></span><div><small>{label}</small><strong>{value}</strong><p>{helper}</p></div></article>;
}

export function IntegrityWorkspace({ accounts, engagement, setEngagement, formatCurrency, formatNumber, onToast }) {
  const drafts = useMemo(() => createJournalEntries(accounts, 24), [accounts]);
  const [chain, setChain] = useState([]);
  const [chainState, setChainState] = useState("loading");
  const [selectedPeriodId, setSelectedPeriodId] = useState(engagement.periodLocks?.[0]?.id || "2025-12");
  const [preparedBy, setPreparedBy] = useState("مدير الحسابات");
  const [approvedBy, setApprovedBy] = useState("شريك الارتباط");
  const [reason, setReason] = useState("اكتملت التسويات الأساسية وأصبحت الفترة جاهزة للقفل المحكوم.");
  const [journalQuery, setJournalQuery] = useState("");
  const [journalPage, setJournalPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setChainState("loading");
    buildJournalHashChain(drafts)
      .then(async (result) => {
        const valid = await verifyJournalHashChain(result);
        if (!cancelled) {
          setChain(result);
          setChainState(valid ? "verified" : "failed");
        }
      })
      .catch(() => {
        if (!cancelled) setChainState("failed");
      });
    return () => { cancelled = true; };
  }, [drafts]);

  const periods = engagement.periodLocks || [];
  const selectedPeriod = periods.find(({ id }) => id === selectedPeriodId) || periods[0];
  const reconciliation = useMemo(() => buildReconciliationCases(chain.length ? chain : drafts), [chain, drafts]);
  const matchedCases = reconciliation.filter(({ status }) => status === "matched").length;
  const lockedPeriods = periods.filter(({ status }) => status === "locked").length;
  const journalEntries = chain.length ? chain : drafts;
  const filteredJournalEntries = useMemo(
    () => queryJournalEntries(journalEntries, journalQuery),
    [journalEntries, journalQuery],
  );
  const journalPageState = useMemo(
    () => paginateJournalEntries(filteredJournalEntries, journalPage, 8),
    [filteredJournalEntries, journalPage],
  );

  useEffect(() => {
    if (journalPage !== journalPageState.page) setJournalPage(journalPageState.page);
  }, [journalPage, journalPageState.page]);

  const notify = (message) => {
    if (typeof onToast === "function") onToast(message);
  };

  const changePeriodStatus = (nextStatus) => {
    if (!selectedPeriod) return;
    if (!preparedBy.trim() || !approvedBy.trim() || !reason.trim()) {
      notify("أدخل المُعدّ والمعتمد وسبب القرار قبل المتابعة.");
      return;
    }
    if (preparedBy.trim() === approvedBy.trim()) {
      notify("قاعدة الشخصين تتطلب أن يختلف المُعدّ عن المعتمد.");
      return;
    }
    const now = new Date().toISOString();
    const action = nextStatus === "locked" ? "قفل فترة محاسبية" : "إعادة فتح فترة محاسبية";
    setEngagement((current) => ({
      ...current,
      periodLocks: current.periodLocks.map((period) => period.id === selectedPeriod.id ? {
        ...period,
        status: nextStatus,
        preparedBy: preparedBy.trim(),
        approvedBy: approvedBy.trim(),
        reason: reason.trim(),
        lockedAt: nextStatus === "locked" ? now : null,
        reopenedAt: nextStatus === "open" ? now : period.reopenedAt,
      } : period),
      auditTrail: [{
        id: `LOG-${Date.now()}`,
        action,
        actor: approvedBy.trim(),
        at: now,
        detail: `${selectedPeriod.id} · أعدّه ${preparedBy.trim()} · ${reason.trim()}`,
      }, ...(current.auditTrail || [])],
      humanApproval: false,
      humanApprovedAt: null,
    }));
    notify(nextStatus === "locked" ? "قُفلت الفترة وسُجل القرار بقاعدة الشخصين." : "أُعيد فتح الفترة وسُجل السبب؛ أُلغي اعتماد التقرير السابق إن وجد.");
  };

  return (
    <div className="view-stack governance-view" dir="rtl">
      <section className="panel page-intro gov-intro">
        <div><span className="eyebrow">سلامة الترحيل والأثر</span><h2>الدفتر والرقابة المحكومة</h2><p>قيود متوازنة ببصمة SHA-256 مترابطة، وقفل فترات بقاعدة شخصين، وسجل قرارات لا يُحذف من واجهة العمل.</p></div>
        <div className={`gov-intro-mark ${chainState === "verified" ? "success" : chainState === "failed" ? "warning" : ""}`}><Fingerprint size={24} /><span><strong>{chainState === "verified" ? "سليم" : chainState === "failed" ? "فشل" : "يفحص"}</strong><small>سلسلة البصمات</small></span></div>
      </section>

      <section className="gov-integrity-grid" aria-label="ملخص الرقابة">
        <IntegrityMetric icon={Link2} label="قيود مختبرة" value={formatNumber(chain.length || drafts.length)} helper="كل قيد متوازن في الوحدات الصغرى" tone="blue" />
        <IntegrityMetric icon={Fingerprint} label="التحقق التسلسلي" value={chainState === "verified" ? "ناجح" : chainState === "loading" ? "جارٍ" : "يتطلب فحصًا"} helper="أي تغيير يكسر البصمة التالية" tone={chainState === "verified" ? "green" : "red"} />
        <IntegrityMetric icon={LockKeyhole} label="فترات مقفلة" value={formatNumber(lockedPeriods)} helper={`من ${formatNumber(periods.length)} فترات مسجلة`} tone={lockedPeriods ? "green" : "gold"} />
        <IntegrityMetric icon={Landmark} label="مطابقات بنكية" value={`${formatNumber(matchedCases)} / ${formatNumber(reconciliation.length)}`} helper="تامة وسماحية ومجزأة ومجمعة" tone={matchedCases === reconciliation.length ? "green" : "gold"} />
      </section>

      <div className="gov-two-column gov-control-grid">
        <section className="panel gov-period-panel">
          <div className="gov-section-head"><div><span className="eyebrow">Period locks</span><h3>إدارة الفترات</h3><p>القفل لا يتم بزر منفرد؛ يلزم مُعدّ ومعتمد مختلفان وسبب محفوظ.</p></div><KeyRound size={25} /></div>
          <div className="gov-period-list">
            {periods.map((period) => <button key={period.id} type="button" className={selectedPeriod?.id === period.id ? "active" : ""} onClick={() => setSelectedPeriodId(period.id)}><span><strong>{period.label}</strong><small dir="ltr">{period.id}</small></span><b className={`gov-period-status ${period.status}`}>{period.status === "locked" ? "مقفل" : period.status === "soft_closed" ? "إقفال أولي" : "مفتوح"}</b></button>)}
          </div>
          <div className="gov-approval-form">
            <label><span>مُعدّ القرار</span><input value={preparedBy} onChange={(event) => setPreparedBy(event.target.value)} /></label>
            <label><span>المعتمد</span><input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} /></label>
            <label className="wide"><span>سبب القفل أو إعادة الفتح</span><textarea rows="3" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          </div>
          <div className="gov-actions">
            {selectedPeriod?.status === "locked"
              ? <button type="button" className="button button-outline" onClick={() => changePeriodStatus("open")}><RotateCcw size={17} /> إعادة فتح موثقة</button>
              : <button type="button" className="button button-gold" onClick={() => changePeriodStatus("locked")}><LockKeyhole size={17} /> قفل الفترة</button>}
          </div>
          {selectedPeriod ? <div className="gov-period-record"><ShieldCheck size={18} /><span><strong>{selectedPeriod.reason}</strong><small>{selectedPeriod.approvedBy ? `اعتمدها ${selectedPeriod.approvedBy} · ${localDateTime(selectedPeriod.lockedAt || selectedPeriod.reopenedAt)}` : "تنتظر اعتماد الشخص الثاني"}</small></span></div> : null}
        </section>

        <section className="panel gov-audit-log-panel">
          <div className="gov-section-head"><div><span className="eyebrow">Append-only UI view</span><h3>سجل القرارات</h3><p>الأحداث الجديدة تُضاف في المقدمة ولا يوجد حذف من الواجهة.</p></div><UserCheck size={25} /></div>
          <div className="gov-audit-log">
            {(engagement.auditTrail || []).slice(0, 8).map((event) => <article key={event.id}><span className="gov-log-mark" /><div><strong>{event.action}</strong><p>{event.detail}</p><small>{event.actor} · {localDateTime(event.at)}</small></div><bdi>{event.id}</bdi></article>)}
          </div>
        </section>
      </div>

      <section className="panel gov-table-panel">
        <div className="gov-section-head"><div><span className="eyebrow">Hash-chained journal</span><h3>عينة القيود المرحلة</h3><p>يعرض التطبيق بصمة كل قيد وسابقه؛ التفاصيل المالية باقية بوحدات SAR الصغرى.</p></div><span className={`gov-count ${chainState === "verified" ? "success" : "warning"}`}>{chainState === "verified" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{chainState === "verified" ? "تم التحقق" : "جارٍ الفحص"}</span></div>
        <div className="gov-journal-toolbar">
          <label><Search size={17} aria-hidden="true" /><span className="sr-only">بحث في عينة القيود</span><input value={journalQuery} onChange={(event) => { setJournalQuery(event.target.value); setJournalPage(1); }} placeholder="ابحث برقم القيد أو الفترة أو البيان أو الحساب" /></label>
          <span>{formatNumber(journalPageState.total)} من {formatNumber(journalEntries.length)} قيدًا</span>
        </div>
        <div className="table-scroll" tabIndex="0"><table><thead><tr><th>القيد</th><th>الفترة</th><th>البيان</th><th className="numeric">القيمة</th><th>بصمة السابق</th><th>بصمة القيد</th></tr></thead><tbody>{journalPageState.items.map((entry) => <tr key={entry.id}><td><strong dir="ltr">{entry.id}</strong></td><td dir="ltr">{entry.period}</td><td>{entry.description}</td><td className="numeric">{formatCurrency(Number(BigInt(entry.totalMinor)) / 100)}</td><td><code>{shortHash(entry.previousHash)}</code></td><td><code>{shortHash(entry.hash)}</code></td></tr>)}</tbody></table></div>
        {!journalPageState.total ? <div className="gov-journal-empty">لا توجد قيود تطابق البحث الحالي.</div> : null}
        <div className="gov-journal-pagination" aria-label="ترقيم صفحات عينة القيود"><button type="button" className="button button-outline compact" disabled={journalPageState.page <= 1} onClick={() => setJournalPage((page) => page - 1)}>السابق</button><span>صفحة {formatNumber(journalPageState.page)} من {formatNumber(journalPageState.pageCount)}</span><button type="button" className="button button-outline compact" disabled={journalPageState.page >= journalPageState.pageCount} onClick={() => setJournalPage((page) => page + 1)}>التالي</button></div>
      </section>

      <section className="panel gov-table-panel">
        <div className="gov-section-head"><div><span className="eyebrow">Bank reconciliation</span><h3>حالات التسوية البنكية</h3><p>تُفصل المطابقة الآلية عن الاستثناء؛ لا تُنشأ تسوية محاسبية ولا تُرحل تلقائيًا.</p></div></div>
        <div className="table-scroll" tabIndex="0"><table><thead><tr><th>الحالة</th><th>مرجع الدفتر</th><th>طريقة المطابقة</th><th className="numeric">القيمة</th><th className="numeric">الفرق</th><th>القرار</th></tr></thead><tbody>{reconciliation.map((item) => <tr key={item.id}><td><bdi>{item.id}</bdi></td><td><bdi>{item.bookReference}</bdi></td><td>{reconciliationLabels[item.method]}</td><td className="numeric">{formatCurrency(Number(BigInt(item.amountMinor)) / 100)}</td><td className="numeric">{formatCurrency(Number(BigInt(item.differenceMinor)) / 100)}</td><td>{item.status === "matched" ? <span className="gov-count success"><CheckCircle2 size={14} /> مطابق</span> : <span className="gov-count warning"><AlertTriangle size={14} /> فحص بشري</span>}</td></tr>)}</tbody></table></div>
      </section>

      <section className="governance-banner gov-local-control-note">
        <AlertTriangle size={20} />
        <div><strong>حدود النسخة الحالية</strong><p>البصمات والقفل وسجل القرارات ضوابط قابلة للتحقق داخل جلسة المتصفح، وليست دفترًا مركزيًا دائمًا. التشغيل المؤسسي يتطلب خادمًا بصلاحيات RBAC، وفصل مستأجرين، وتخزينًا إلحاقيًا غير قابل للمحو.</p></div>
      </section>
    </div>
  );
}

export default IntegrityWorkspace;
