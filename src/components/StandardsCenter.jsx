import { useEffect, useMemo, useRef, useState } from "react";
import { ProfessionalStandardsTools } from "./ProfessionalStandardsTools.jsx";
import { AppliedAccountingLab } from "./AppliedAccountingLab.jsx";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  ExternalLink,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import {
  applyMappingReview,
  attachedReferenceLibrary,
  buildMappingMetrics,
  buildStandardsCoverage,
  bulkReviewMappings,
  getAccountStandardLinks,
  getStandard,
  officialSources,
  resolveAccountMapping,
  standardCatalog,
  standardOptions,
} from "../standards.js";
import "../capabilities.css";

const typeLabels = {
  all: "الكل",
  accounting: "المحاسبة",
  audit: "المراجعة",
};
const linkRoleLabels = {
  primary: "اعتراف أو قياس رئيس",
  supporting: "قياس أو تطبيق مساند",
  "presentation-disclosure": "عرض وإفصاح",
  "reviewer-selected": "اختيار المراجع",
  "audit-procedure": "إجراء مراجعة",
};
const linkStatusLabels = {
  review_required: "يتطلب مراجعة بشرية",
  reviewed: "معتمد بقرار مراجع",
  suggested: "اقتراح آلي",
};

const normalizeSearch = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .trim();

const safeNumber = (formatter, value) =>
  typeof formatter === "function"
    ? formatter(value)
    : new Intl.NumberFormat("ar-SA-u-nu-latn").format(Number(value || 0));

const safeCurrency = (formatter, value) =>
  typeof formatter === "function"
    ? formatter(value)
    : new Intl.NumberFormat("ar-SA-u-nu-latn", {
        style: "currency",
        currency: "SAR",
        maximumFractionDigits: 2,
      }).format(Number(value || 0));

function EmptyList({ children }) {
  return (
    <div className="cap-empty" role="status">
      <FileCheck2 size={24} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function DetailList({ title, items, emptyText }) {
  return (
    <section className="cap-detail-group">
      <h4>{title}</h4>
      {items?.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{emptyText}</p>
      )}
    </section>
  );
}

function PracticalBrief({ icon: Icon, title, items }) {
  const values = (items || []).filter(Boolean).slice(0, 2);
  return (
    <article>
      <Icon size={19} aria-hidden="true" />
      <div>
        <h4>{title}</h4>
        {values.length ? (
          <ul>
            {values.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>يُحدد بعد ربط حساب فعلي ومراجعة طبيعة الرصيد.</p>
        )}
      </div>
    </article>
  );
}

export function StandardsCenter({
  accounts = [],
  engagement = {},
  setEngagement,
  metrics = {},
  onToast,
  formatNumber,
  formatCurrency,
  requestedStandardId,
  requestedAccountId,
  requestedSource,
}) {
  const detailRef = useRef(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedStandardId, setSelectedStandardId] = useState(
    standardCatalog[0]?.id || "",
  );
  const [queueSearch, setQueueSearch] = useState("");
  const [reviewer, setReviewer] = useState(
    engagement.standardMappings?.review?.reviewer ||
      engagement.standardMappings?.lastBulkReview?.reviewer ||
      "مدير المراجعة",
  );
  const [rationale, setRationale] = useState(
    engagement.standardMappings?.review?.rationale ||
      "تمت مراجعة طبيعة الحساب والتأكيدات والمخاطر قبل اعتماد الربط.",
  );
  const [draftSelections, setDraftSelections] = useState({});

  const mappingState = engagement.standardMappings;
  const mappingMetrics = useMemo(
    () => buildMappingMetrics(accounts, mappingState),
    [accounts, mappingState],
  );
  const coverage = useMemo(
    () => buildStandardsCoverage(accounts, mappingState),
    [accounts, mappingState],
  );
  const coverageById = useMemo(
    () => new Map(coverage.map((item) => [item.id, item])),
    [coverage],
  );

  const filteredStandards = useMemo(() => {
    const needle = normalizeSearch(search);
    return standardCatalog.filter((standard) => {
      if (typeFilter !== "all" && standard.type !== typeFilter) return false;
      if (!needle) return true;
      return normalizeSearch(
        [
          standard.id,
          standard.title,
          standard.summary,
          standard.source,
          ...(standard.requirements || []),
        ].join(" "),
      ).includes(needle);
    });
  }, [search, typeFilter]);

  const unresolvedAccounts = useMemo(
    () =>
      accounts
        .map((account) => ({
          account,
          resolution: resolveAccountMapping(account, mappingState),
        }))
        .filter(({ resolution }) => resolution.status === "review_required"),
    [accounts, mappingState],
  );

  const filteredQueue = useMemo(() => {
    const needle = normalizeSearch(queueSearch);
    if (!needle) return unresolvedAccounts;
    return unresolvedAccounts.filter(({ account, resolution }) =>
      normalizeSearch(
        [
          account.code,
          account.name,
          account.areaLabel,
          ...resolution.suggestedStandardIds,
        ].join(" "),
      ).includes(needle),
    );
  }, [queueSearch, unresolvedAccounts]);

  const selectedStandard =
    getStandard(selectedStandardId) ||
    filteredStandards[0] ||
    standardCatalog[0];
  const selectedCoverage = selectedStandard
    ? coverageById.get(selectedStandard.id)
    : null;
  const requestedAccount = useMemo(
    () => accounts.find((account) => account.id === requestedAccountId) || null,
    [accounts, requestedAccountId],
  );
  const requestedAccountLink = useMemo(
    () => {
      if (!requestedAccount || !selectedStandard) return null;
      const accountingLink = getAccountStandardLinks(requestedAccount, mappingState, {
        includeSuggested: true,
      }).find((link) => link.id === selectedStandard.id);
      if (accountingLink) return accountingLink;
      if ((requestedAccount.auditStandards || []).includes(selectedStandard.id)) {
        return {
          id: selectedStandard.id,
          role: "audit-procedure",
          rationale: `معيار إجراء مراجعة مرتبط بتأكيدات ${requestedAccount.assertions?.join("، ") || "الحساب"} ومخاطره؛ لا يمثل أساس الاعتراف أو القياس المحاسبي.`,
        };
      }
      return null;
    },
    [requestedAccount, mappingState, selectedStandard],
  );
  const showRequestedAccountContext = Boolean(
    requestedAccount
      && requestedAccountLink
      && selectedStandard?.id === requestedStandardId,
  );
  const selectedOfficialSources = useMemo(() => {
    const sourceIds = new Set(selectedStandard?.officialSourceIds || []);
    return officialSources.filter((source) => sourceIds.has(source.id));
  }, [selectedStandard]);
  const practicalBrief = useMemo(() => {
    const accountProcedures = requestedAccount?.procedures || [];
    const accountEvidence = requestedAccount?.evidence || [];
    const standardChecks =
      selectedStandard?.type === "audit"
        ? selectedStandard.auditFocus || selectedStandard.requirements || []
        : selectedStandard?.requirements || [];
    return {
      why: [
        showRequestedAccountContext
          ? requestedAccountLink?.rationale
          : selectedStandard?.scope?.[0] || selectedStandard?.summary,
      ],
      checks: accountProcedures.length
        ? accountProcedures
        : selectedCoverage?.procedures?.length
          ? selectedCoverage.procedures
          : standardChecks,
      evidence: accountEvidence.length
        ? accountEvidence
        : selectedCoverage?.evidence || [],
    };
  }, [
    requestedAccount,
    requestedAccountLink,
    selectedCoverage,
    selectedStandard,
    showRequestedAccountContext,
  ]);

  useEffect(() => {
    if (
      filteredStandards[0] &&
      !filteredStandards.some((standard) => standard.id === selectedStandardId)
    ) {
      setSelectedStandardId(filteredStandards[0].id);
    }
  }, [filteredStandards, selectedStandardId]);

  useEffect(() => {
    if (!requestedStandardId || !getStandard(requestedStandardId)) return;
    setSearch("");
    setTypeFilter("all");
    setSelectedStandardId(requestedStandardId);
    window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      detailRef.current?.focus({ preventScroll: true });
    });
  }, [requestedStandardId]);

  const notify = (message) => {
    if (typeof onToast === "function") onToast(message);
  };

  const updateMappingState = (producer) => {
    if (typeof setEngagement !== "function") return;
    setEngagement((current) => {
      const standardMappings = producer(current.standardMappings);
      return {
        ...current,
        standardMappings: {
          ...standardMappings,
          review: { ...(standardMappings.review || {}), confirmedAt: null },
        },
        mappingConfirmed: false,
        humanApproval: false,
        humanApprovedAt: null,
      };
    });
  };

  const selectedIdsFor = (account, resolution) =>
    draftSelections[account.id] || resolution.suggestedStandardIds;

  const toggleSuggestion = (account, resolution, standardId) => {
    const currentIds = selectedIdsFor(account, resolution);
    const nextIds = currentIds.includes(standardId)
      ? currentIds.filter((id) => id !== standardId)
      : [...currentIds, standardId];
    setDraftSelections((current) => ({ ...current, [account.id]: nextIds }));
  };

  const reviewAccount = (account, resolution) => {
    if (!reviewer.trim() || !rationale.trim()) {
      notify("أدخل اسم المراجع وأساس القرار قبل اعتماد الربط.");
      return;
    }
    const reviewedAt = new Date().toISOString();
    const ids = selectedIdsFor(account, resolution);
    if (!ids.length) {
      notify(
        "اختر معيارًا محاسبيًا واحدًا على الأقل؛ لا يُعتمد ربط فارغ لحساب مالي.",
      );
      return;
    }
    updateMappingState((currentMapping) => {
      return applyMappingReview(currentMapping, account, ids, {
        reviewer,
        rationale,
        reviewedAt,
        source: "manual-review",
      });
    });
    setDraftSelections((current) => {
      const next = { ...current };
      delete next[account.id];
      return next;
    });
    notify(`تم توثيق مراجعة ربط الحساب ${account.code}.`);
  };

  const reviewAllUnresolved = () => {
    if (!reviewer.trim() || !rationale.trim()) {
      notify("أدخل اسم المراجع وأساس القرار قبل المراجعة الجماعية.");
      return;
    }
    if (!unresolvedAccounts.length) {
      notify("لا توجد حسابات معلقة للمراجعة.");
      return;
    }
    const reviewedAt = new Date().toISOString();
    updateMappingState((currentMapping) => {
      return bulkReviewMappings(accounts, currentMapping, {
        reviewer,
        rationale,
        reviewedAt,
        source: "bulk-review",
      });
    });
    const safeCount = unresolvedAccounts.filter(
      ({ account }) => !account.classificationConflict && account.classificationSource !== "unclassified-fallback",
    ).length;
    notify(
      `تمت مراجعة ${safeNumber(formatNumber, safeCount)} حسابًا؛ بقيت حالات التعارض لتصحيحها يدويًا.`,
    );
  };

  const confirmResolvedMappings = () => {
    if (!reviewer.trim() || !rationale.trim()) {
      notify("أدخل اسم المراجع وأساس القرار قبل اعتماد الخريطة المكتملة.");
      return;
    }
    if (mappingMetrics.unresolved) {
      notify("راجع الحسابات المعلقة قبل اعتماد الخريطة.");
      return;
    }
    const reviewedAt = new Date().toISOString();
    setEngagement((current) => ({
      ...current,
      standardMappings: {
        ...current.standardMappings,
        review: {
          reviewer: reviewer.trim(),
          rationale: rationale.trim(),
          confirmedAt: reviewedAt,
        },
      },
      mappingConfirmed: true,
      humanApproval: false,
      humanApprovedAt: null,
      auditTrail: [
        {
          id: `LOG-${Date.now()}`,
          action: "اعتماد خريطة المعايير",
          actor: reviewer.trim(),
          at: reviewedAt,
          detail: `${accounts.length} حسابًا · لا توجد استثناءات معلقة · ${rationale.trim()}`,
        },
        ...(current.auditTrail || []),
      ],
    }));
    notify("تم اعتماد الخريطة المكتملة وتوثيق المراجع والأساس والتوقيت.");
  };

  return (
    <div className="view-stack capabilities-view" dir="rtl">
      <section
        className="panel page-intro cap-intro"
        aria-labelledby="standards-center-title"
      >
        <div className="cap-intro-copy">
          <span className="eyebrow">مكتبة معيارية قابلة للتتبع</span>
          <h2 id="standards-center-title">
            مركز المعايير والربط بميزان المراجعة
          </h2>
          <p>
            اربط كل حساب بمتطلبات المحاسبة والمراجعة والتأكيدات والأدلة، مع فصل
            الاقتراح الآلي عن قرار المراجع الموثق.
          </p>
        </div>
        <div className="cap-intro-status" aria-label="حالة الربط">
          <ShieldCheck size={24} aria-hidden="true" />
          <span>
            <bdi dir="ltr">{mappingMetrics.mappingRate}%</bdi>
            <small>تغطية الحسابات</small>
          </span>
        </div>
      </section>

      <section className="cap-summary-grid" aria-label="ملخص مركز المعايير">
        <article className="cap-metric">
          <BookOpenCheck size={21} aria-hidden="true" />
          <span>
            <small>المعايير المتاحة</small>
            <strong>{safeNumber(formatNumber, standardCatalog.length)}</strong>
          </span>
        </article>
        <article className="cap-metric">
          <CheckCircle2 size={21} aria-hidden="true" />
          <span>
            <small>حسابات محلولة</small>
            <strong>{safeNumber(formatNumber, mappingMetrics.resolved)}</strong>
          </span>
        </article>
        <article
          className={`cap-metric ${mappingMetrics.unresolved ? "is-warning" : "is-success"}`}
        >
          <AlertTriangle size={21} aria-hidden="true" />
          <span>
            <small>تحتاج مراجعة</small>
            <strong>
              {safeNumber(formatNumber, mappingMetrics.unresolved)}
            </strong>
          </span>
        </article>
        <article
          className={`cap-metric ${metrics.isBalanced === false ? "is-warning" : "is-success"}`}
        >
          <ClipboardCheck size={21} aria-hidden="true" />
          <span>
            <small>حالة الميزان</small>
            <strong>
              {metrics.isBalanced === false ? "يوجد فرق" : "متوازن"}
            </strong>
          </span>
        </article>
      </section>

      <section
        className="panel cap-library"
        aria-labelledby="standards-library-title"
      >
        <div className="cap-section-head">
          <div>
            <span className="eyebrow">المحاسبة والمراجعة</span>
            <h3 id="standards-library-title">دليل المعايير التشغيلي</h3>
            <p>
              ملخصات مهنية مساعدة؛ يرجع دائمًا إلى النص الرسمي الأحدث والحكم
              المهني.
            </p>
          </div>
          <div className="cap-library-controls">
            <label className="cap-search">
              <span className="sr-only">ابحث في المعايير</span>
              <Search size={17} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="رقم المعيار أو عنوانه أو متطلباته"
              />
            </label>
            <div className="cap-tabs" role="group" aria-label="نوع المعيار">
              {Object.entries(typeLabels).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={typeFilter === value ? "active" : ""}
                  aria-pressed={typeFilter === value}
                  onClick={() => setTypeFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="cap-library-grid">
          <div className="cap-standard-list" aria-label="قائمة المعايير">
            {filteredStandards.length ? (
              filteredStandards.map((standard) => {
                const itemCoverage = coverageById.get(standard.id);
                const active = selectedStandard?.id === standard.id;
                return (
                  <button
                    key={standard.id}
                    type="button"
                    className={`cap-standard-row ${active ? "active" : ""}`}
                    aria-pressed={active}
                    onClick={() => setSelectedStandardId(standard.id)}
                  >
                    <span className={`cap-standard-kind ${standard.type}`}>
                      {standard.family}
                    </span>
                    <span>
                      <strong dir="ltr">{standard.id}</strong>
                      <small>{standard.title}</small>
                    </span>
                    <bdi dir="ltr">
                      {safeNumber(
                        formatNumber,
                        itemCoverage?.accountCount || 0,
                      )}
                    </bdi>
                  </button>
                );
              })
            ) : (
              <EmptyList>لا توجد نتائج مطابقة لعبارة البحث.</EmptyList>
            )}
          </div>

          {selectedStandard ? (
            <article
              ref={detailRef}
              tabIndex="-1"
              className="cap-standard-detail"
              aria-live="polite"
            >
              <header>
                <span className={`cap-standard-kind ${selectedStandard.type}`}>
                  {selectedStandard.type === "audit" ? "مراجعة" : "محاسبة"}
                </span>
                <div>
                  <bdi dir="ltr">{selectedStandard.id}</bdi>
                  <h3>{selectedStandard.title}</h3>
                </div>
              </header>
              {showRequestedAccountContext ? (
                <div className="cap-standard-context" role="status">
                  <BookOpenCheck size={20} aria-hidden="true" />
                  <div>
                    <strong>
                      فُتح من الحساب{" "}
                      <bdi dir="ltr">{requestedAccount.code}</bdi> —{" "}
                      {requestedAccount.name}
                    </strong>
                    <span>{requestedAccountLink.rationale}</span>
                    <small>
                      {requestedAccount.areaLabel} ·{" "}
                      {linkRoleLabels[requestedAccountLink?.role] || "رابط معياري"} · المصدر:{" "}
                      {requestedSource === "trial-balance"
                        ? "ميزان المراجعة"
                        : requestedSource || "التطبيق"}
                    </small>
                    <b className={`cap-context-status status-${requestedAccountLink.status || "suggested"}`}>
                      {requestedAccountLink.status === "suggested" && engagement.mappingConfirmed
                        ? "معتمد ضمن الخريطة الموثقة"
                        : linkStatusLabels[requestedAccountLink.status] || "رابط موثق"}
                    </b>
                  </div>
                </div>
              ) : null}
              <section className="cap-standard-practical" aria-label="الملخص العملي للمعيار">
                <PracticalBrief
                  icon={BookOpenCheck}
                  title="لماذا ينطبق؟"
                  items={practicalBrief.why}
                />
                <PracticalBrief
                  icon={ClipboardCheck}
                  title="ماذا يفحص المراجع؟"
                  items={practicalBrief.checks}
                />
                <PracticalBrief
                  icon={FileCheck2}
                  title="ما الدليل المتوقع؟"
                  items={practicalBrief.evidence}
                />
              </section>
              <p className="cap-standard-summary">{selectedStandard.summary}</p>
              <dl className="cap-standard-facts">
                <div>
                  <dt>الحسابات المرتبطة</dt>
                  <dd>
                    {safeNumber(
                      formatNumber,
                      selectedCoverage?.accountCount || 0,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>التعرض المالي</dt>
                  <dd dir="ltr">
                    {safeCurrency(
                      formatCurrency,
                      selectedCoverage?.totalExposure || 0,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>حسابات معلقة</dt>
                  <dd>
                    {safeNumber(
                      formatNumber,
                      selectedCoverage?.reviewRequiredAccountCount || 0,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>السريان</dt>
                  <dd>{selectedStandard.effective}</dd>
                </div>
              </dl>
              <DetailList
                title="النطاق وسبب التطبيق"
                items={selectedStandard.scope}
                emptyText="لم يسجل نطاق مختصر."
              />
              <DetailList
                title="الاعتراف والقياس"
                items={selectedStandard.recognitionMeasurement}
                emptyText="لا ينشئ هذا المعيار أساس قياس مستقلًا."
              />
              <DetailList
                title="العرض والإفصاح"
                items={selectedStandard.presentationDisclosure}
                emptyText="لا توجد متطلبات عرض مختصرة مسجلة."
              />
              <DetailList
                title={
                  selectedStandard.type === "audit"
                    ? "تركيز المراجعة"
                    : "متطلبات تشغيلية"
                }
                items={
                  selectedStandard.type === "audit"
                    ? selectedStandard.auditFocus
                    : selectedStandard.requirements
                }
                emptyText="لا توجد متطلبات مختصرة مسجلة."
              />
              <DetailList
                title="الأحكام والتنبيهات"
                items={selectedStandard.judgments}
                emptyText="لا توجد أحكام إضافية مسجلة."
              />
              <div className="cap-detail-grid">
                <DetailList
                  title="مجالات الميزان"
                  items={selectedCoverage?.areas}
                  emptyText="لم يُربط مجال بهذا المعيار بعد."
                />
                <DetailList
                  title="المخاطر"
                  items={selectedCoverage?.risks}
                  emptyText="تظهر المخاطر عند ربط حسابات فعلية."
                />
                <DetailList
                  title="إجراءات المراجعة"
                  items={selectedCoverage?.procedures}
                  emptyText="تظهر الإجراءات عند ربط حسابات فعلية."
                />
                <DetailList
                  title="الأدلة المطلوبة"
                  items={selectedCoverage?.evidence}
                  emptyText="تظهر الأدلة عند ربط حسابات فعلية."
                />
              </div>
              {selectedStandard.relatedStandards?.length ? (
                <section className="cap-detail-group">
                  <h4>معايير مرتبطة</h4>
                  <div className="cap-check-chips">
                    {selectedStandard.relatedStandards.map((standardId) => (
                      <button
                        key={standardId}
                        type="button"
                        onClick={() => setSelectedStandardId(standardId)}
                      >
                        <span dir="ltr">{standardId}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              {selectedStandard.references?.length ? (
                <section className="cap-standard-references">
                  <h4>المراجع المرفقة المستخدمة في الملخص</h4>
                  {selectedStandard.references.map((reference) => (
                    <div key={reference.id}>
                      <strong>{reference.title}</strong>
                      <span>{reference.role}</span>
                      <small>
                        {reference.location} · {reference.authority}
                      </small>
                    </div>
                  ))}
                </section>
              ) : null}
              <section className="cap-standard-locators" aria-label="موضع المعيار في المراجع">
                <div className="cap-locator-heading">
                  <div>
                    <h4>موضع المرجع</h4>
                    <p>بيانات تحديد فقط؛ لا تنشر المنصة نص المعيار أو ملفه.</p>
                  </div>
                  <BookOpenCheck size={19} aria-hidden="true" />
                </div>
                {selectedStandard.referenceLocators?.length ? (
                  <div className="cap-locator-list">
                    {selectedStandard.referenceLocators.map((reference, index) => (
                      <article key={`${reference.referenceId}-${reference.printedStart}-${index}`}>
                        <strong>{reference.citationLabel}</strong>
                        <div className="cap-locator-chips">
                          <span>طبعة {reference.edition}</span>
                          <span>المطبوع ص {reference.printedStart}–{reference.printedEnd}</span>
                          <span>ملف PDF ص {reference.pdfStart}–{reference.pdfEnd}</span>
                          {reference.applicability === "future-or-early-adoption" ? <span className="is-warning">مستقبلي/تطبيق مبكر</span> : null}
                          {reference.applicability === "ifrs-18-transition-only" ? <span className="is-warning">موضع انتقالي منفصل</span> : null}
                        </div>
                        <small>مرجع موضع فقط · تحقق من النسخة الرسمية النافذة قبل القرار المهني.</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="cap-locator-empty">
                    لا يتوافر موضع صفحة مرفق لهذا المعيار؛ استخدم روابط الجهة المصدرة أدناه دون افتراض أن مرفقات IFRS هي مصدر لمعيار مراجعة.
                  </p>
                )}
                {selectedOfficialSources.length ? (
                  <div className="cap-standard-official-links">
                    {selectedOfficialSources.map((source) => (
                      <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                        {source.issuer} · المصدر الرسمي
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </section>
              <footer>
                <BookOpenCheck size={16} aria-hidden="true" />
                <span>{selectedStandard.source}</span>
              </footer>
            </article>
          ) : null}
        </div>
      </section>

      <ProfessionalStandardsTools
        key={selectedStandard?.id}
        selectedStandard={selectedStandard}
        accounts={accounts}
        mappingState={mappingState}
        formatCurrency={formatCurrency}
        context={{
          entityName: engagement.entity?.name,
          period: engagement.entity?.period,
          reviewer,
        }}
        onToast={notify}
      />

      <AppliedAccountingLab
        selectedStandard={selectedStandard}
        accounts={accounts}
        engagement={engagement}
        setEngagement={setEngagement}
        metrics={metrics}
        mappingState={mappingState}
        formatCurrency={formatCurrency}
        onToast={notify}
      />

      <section
        className="panel cap-sources"
        aria-labelledby="official-sources-title"
      >
        <div className="cap-section-head">
          <div>
            <span className="eyebrow">مصادر رسمية</span>
            <h3 id="official-sources-title">مراجع التحقق والتحديث</h3>
            <p>
              روابط الجهة المصدرة هي المرجع عند التحديث؛ تعرض المنصة الملخص
              والبيانات الوصفية فقط.
            </p>
          </div>
          <span className="cap-count-pill success">
            متحقق حتى 19 أغسطس 2026
          </span>
        </div>
        <div className="cap-source-grid">
          {officialSources.map((source) => (
            <a
              key={source.id}
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              <span>
                <strong>{source.issuer}</strong>
                <small>
                  {source.status === "project"
                    ? "مشاريع وتحديثات"
                    : "مصدر نافذ"}
                </small>
              </span>
              <b>{source.title}</b>
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          ))}
        </div>
      </section>

      <section
        className="panel cap-sources"
        aria-labelledby="attached-sources-title"
      >
        <div className="cap-section-head">
          <div>
            <span className="eyebrow">المرفقات المهنية</span>
            <h3 id="attached-sources-title">مكتبة الاستناد داخل ملف العمل</h3>
            <p>
              استخدمت المرفقات لتطوير الوصف ومسار التقرير؛ المواد التطبيقية
              مساعدة وغير ملزمة، والنسخة 2025 هي مرجع الحزمة الرئيسي.
            </p>
          </div>
          <span className="cap-count-pill">
            {safeNumber(formatNumber, attachedReferenceLibrary.length)} مراجع
          </span>
        </div>
        <div className="cap-reference-library">
          {attachedReferenceLibrary.map((reference) => (
            <article key={reference.id}>
              <strong>{reference.title}</strong>
              <span>{reference.role}</span>
              <small>
                {reference.location} · {reference.authority}
              </small>
            </article>
          ))}
        </div>
      </section>

      <section
        className="panel cap-review-panel"
        aria-labelledby="mapping-review-title"
      >
        <div className="cap-section-head">
          <div>
            <span className="eyebrow">قرار بشري موثق</span>
            <h3 id="mapping-review-title">
              قائمة مراجعة الحسابات غير المربوطة
            </h3>
            <p>
              المراجعة لا تغيّر قيمة الحساب؛ تسجل فقط قرار ربطه بمعيار محاسبي مع
              اسم المراجع وسبب القرار ووقته.
            </p>
          </div>
          <span
            className={`cap-count-pill ${mappingMetrics.unresolved ? "warning" : "success"}`}
          >
            {safeNumber(formatNumber, mappingMetrics.unresolved)} معلق
          </span>
        </div>

        <div className="cap-review-metadata">
          <label>
            <span>اسم المراجع</span>
            <input
              value={reviewer}
              onChange={(event) => setReviewer(event.target.value)}
              placeholder="مثال: مدير المراجعة"
              required
            />
          </label>
          <label className="cap-rationale">
            <span>أساس قرار الربط</span>
            <textarea
              rows="2"
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="وثّق سبب الاعتماد أو التعديل"
              required
            />
          </label>
          <button
            type="button"
            className="button button-gold"
            disabled={!reviewer.trim() || !rationale.trim()}
            onClick={
              mappingMetrics.unresolved
                ? reviewAllUnresolved
                : confirmResolvedMappings
            }
          >
            <UserCheck size={18} aria-hidden="true" />{" "}
            {mappingMetrics.unresolved
              ? "مراجعة الكل"
              : engagement.mappingConfirmed
                ? "إعادة توثيق الاعتماد"
                : "اعتماد الخريطة المكتملة"}
          </button>
        </div>

        {unresolvedAccounts.length ? (
          <>
            <label className="cap-search cap-queue-search">
              <span className="sr-only">ابحث في الحسابات المعلقة</span>
              <Search size={17} aria-hidden="true" />
              <input
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
                placeholder="ابحث برقم الحساب أو الاسم أو المجال"
              />
            </label>
            <div
              className="cap-review-queue"
              aria-label="الحسابات التي تحتاج مراجعة"
            >
              {filteredQueue.length ? (
                filteredQueue.map(({ account, resolution }) => {
                  const selectedIds = selectedIdsFor(account, resolution);
                  return (
                    <article key={account.id} className="cap-review-card">
                      <div className="cap-review-account">
                        <span className={`risk-badge risk-${account.risk}`}>
                          {account.risk === "high"
                            ? "مرتفع"
                            : account.risk === "medium"
                              ? "متوسط"
                              : "منخفض"}
                        </span>
                        <div>
                          <bdi dir="ltr">{account.code}</bdi>
                          <strong>{account.name}</strong>
                          <small>
                            {account.areaLabel} ·{" "}
                            {safeCurrency(formatCurrency, account.amount)}
                          </small>
                        </div>
                      </div>
                      {account.mappingWarning ? (
                        <p className="cap-mapping-warning">
                          <AlertTriangle size={16} aria-hidden="true" />
                          {account.mappingWarning}
                        </p>
                      ) : null}
                      <fieldset>
                        <legend>
                          المعايير المقترحة — اختر ما سيعتمده المراجع
                        </legend>
                        <div className="cap-check-chips">
                          {resolution.suggestedStandardIds.length ? (
                            resolution.suggestedStandardIds.map(
                              (standardId) => (
                                <label
                                  key={standardId}
                                  className={
                                    selectedIds.includes(standardId)
                                      ? "checked"
                                      : ""
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.includes(standardId)}
                                    onChange={() =>
                                      toggleSuggestion(
                                        account,
                                        resolution,
                                        standardId,
                                      )
                                    }
                                  />
                                  <span dir="ltr">{standardId}</span>
                                </label>
                              ),
                            )
                          ) : (
                            <small>
                              لا يوجد اقتراح صالح؛ اختر معيارًا مناسبًا يدويًا
                              قبل الاعتماد.
                            </small>
                          )}
                        </div>
                        <label className="cap-add-standard">
                          <span>إضافة معيار آخر إلى القرار</span>
                          <select
                            value=""
                            onChange={(event) => {
                              if (
                                event.target.value &&
                                !selectedIds.includes(event.target.value)
                              )
                                toggleSuggestion(
                                  account,
                                  resolution,
                                  event.target.value,
                                );
                            }}
                          >
                            <option value="">اختر من المكتبة…</option>
                            {standardOptions
                              .filter(
                                (option) => !selectedIds.includes(option.value),
                              )
                              .map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                          </select>
                        </label>
                      </fieldset>
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={!selectedIds.length}
                        onClick={() => reviewAccount(account, resolution)}
                      >
                        <ClipboardCheck size={17} aria-hidden="true" /> اعتماد
                        وتوثيق
                      </button>
                    </article>
                  );
                })
              ) : (
                <EmptyList>لا يوجد حساب معلق يطابق البحث.</EmptyList>
              )}
            </div>
          </>
        ) : (
          <div className="cap-complete-state">
            <CheckCircle2 size={26} aria-hidden="true" />
            <div>
              <strong>اكتملت خريطة المعايير</strong>
              <span>
                كل الحسابات محلولة، وأي قرار يدوي محفوظ ببيانات المراجع
                والتوقيت.
              </span>
            </div>
          </div>
        )}

        <div className="cap-governance-note">
          <Sparkles size={18} aria-hidden="true" />
          <p>
            الاقتراحات الآلية نقطة بداية فقط. اعتماد الربط لا يمثل رأيًا
            محاسبيًا أو تقرير مراجعة، ولا يستبدل فحص العقود والأدلة.
          </p>
        </div>
      </section>
    </div>
  );
}

export default StandardsCenter;
