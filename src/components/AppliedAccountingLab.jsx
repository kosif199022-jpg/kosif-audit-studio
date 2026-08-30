import { useEffect, useId, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Layers3,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { getAccountStandardIds, resolveAccountMapping } from "../standards.js";
import { applyPostedAdjustmentsToAccounts } from "../reporting.js";
import {
  APPLIED_MODEL_META,
  YOUTUBE_KNOWLEDGE_SUMMARY,
  buildAccountingCycleReadiness,
  buildAppliedAccountingSummary,
  buildIfrs18Readiness,
  calculateDeferredTax,
  calculateEps,
  calculateExpectedCreditLoss,
  calculateForeignCurrency,
  calculateGoodwill,
  calculateImpairment,
  calculateInventoryNrv,
} from "../applied-accounting.js";
import { createAppliedAccountingDocxBlob } from "../professional-docx.js";
import "../applied-accounting.css";

const modelFields = Object.freeze({
  inventory: [
    { id: "cost", label: "التكلفة", value: 1_000_000 },
    { id: "estimatedSellingPrice", label: "سعر البيع المتوقع", value: 940_000 },
    { id: "completionCost", label: "تكلفة الإكمال", value: 25_000 },
    { id: "sellingCost", label: "تكلفة البيع", value: 15_000 },
  ],
  ecl: [
    { id: "exposure", label: "التعرض عند التعثر", value: 1_000_000 },
    { id: "probabilityOfDefault", label: "PD المناسب للأفق المختار %", value: 5 },
    { id: "lossGivenDefault", label: "الخسارة عند التعثر %", value: 45 },
    { id: "stage", label: "المرحلة", value: "1", options: [["1", "المرحلة 1"], ["2", "المرحلة 2"], ["3", "المرحلة 3"]] },
  ],
  impairment: [
    { id: "carryingAmount", label: "القيمة الدفترية", value: 1_000_000 },
    { id: "fairValueLessCosts", label: "القيمة العادلة ناقص تكاليف الاستبعاد", value: 820_000 },
    { id: "valueInUse", label: "القيمة قيد الاستخدام", value: 860_000 },
  ],
  deferredTax: [
    { id: "carryingAmount", label: "القيمة الدفترية", value: 1_000_000 },
    { id: "taxBase", label: "الأساس الضريبي", value: 800_000 },
    { id: "taxRate", label: "معدل الضريبة %", value: 20 },
    { id: "itemType", label: "نوع البند", value: "asset", options: [["asset", "أصل"], ["liability", "التزام"]] },
  ],
  eps: [
    { id: "profitAttributable", label: "الربح المنسوب للمساهمين", value: 10_000_000 },
    { id: "preferenceDividends", label: "توزيعات الأسهم الممتازة", value: 0 },
    { id: "weightedShares", label: "المتوسط المرجح للأسهم", value: 5_000_000 },
    { id: "dilutiveNumerator", label: "تعديل بسط الربحية المخفضة", value: 0 },
    { id: "dilutiveShares", label: "الأسهم المحتملة المخفضة", value: 250_000 },
  ],
  goodwill: [
    { id: "consideration", label: "المقابل المحول", value: 8_000_000 },
    { id: "nonControllingInterest", label: "حقوق غير المسيطرين", value: 1_000_000 },
    { id: "previousInterest", label: "القيمة العادلة للحصة السابقة", value: 0 },
    { id: "netIdentifiableAssets", label: "صافي الأصول المحددة", value: 7_500_000 },
  ],
  foreignCurrency: [
    { id: "foreignAmount", label: "المبلغ بالعملة الأجنبية", value: 100_000 },
    { id: "transactionRate", label: "سعر المعاملة", value: 3.72, step: "0.0001" },
    { id: "closingRate", label: "سعر الإقفال", value: 3.75, step: "0.0001" },
    { id: "itemType", label: "نوع البند النقدي", value: "asset", options: [["asset", "أصل"], ["liability", "التزام"]] },
  ],
});

const calculators = Object.freeze({
  inventory: calculateInventoryNrv,
  ecl: calculateExpectedCreditLoss,
  impairment: calculateImpairment,
  deferredTax: calculateDeferredTax,
  eps: calculateEps,
  goodwill: calculateGoodwill,
  foreignCurrency: calculateForeignCurrency,
});

const resultLabels = Object.freeze({
  nrv: "صافي القيمة القابلة للتحقق",
  carryingAmount: "القيمة الدفترية الناتجة",
  writeDown: "التخفيض المقترح",
  loss: "الخسارة الائتمانية المتوقعة",
  coverageRatio: "نسبة التغطية %",
  horizon: "أفق القياس",
  probabilityBasis: "أساس احتمال التعثر",
  impairmentLoss: "خسارة الهبوط",
  recoverableAmount: "القيمة القابلة للاسترداد",
  postImpairmentAmount: "الرصيد بعد الهبوط",
  temporaryDifference: "الفرق المؤقت",
  amount: "الضريبة المؤجلة",
  directionLabel: "الاتجاه المبدئي",
  basicEps: "ربحية السهم الأساسية",
  dilutedEps: "ربحية السهم المخفضة",
  goodwill: "الشهرة",
  bargainPurchaseGain: "مكسب الشراء بسعر مغرٍ",
  initialMeasurement: "القياس الأولي",
  closingMeasurement: "قياس الإقفال",
  exchangeDifference: "فرق الصرف",
  conclusion: "النتيجة التوجيهية",
});

const visibleResultKeys = Object.keys(resultLabels);
const EMPTY_CATEGORIES = Object.freeze([]);
const signedNumericFields = new Set(["profitAttributable", "dilutiveNumerator", "taxBase"]);
const percentageFields = new Set(["probabilityOfDefault", "lossGivenDefault", "taxRate"]);

function numericFieldLimits(field) {
  return {
    min: field.id === "weightedShares"
      ? 0.000001
      : signedNumericFields.has(field.id)
      ? undefined
      : ["transactionRate", "closingRate"].includes(field.id) ? 0.0001 : 0,
    max: percentageFields.has(field.id) ? 100 : undefined,
  };
}

function numericFieldError(field, value) {
  if (field.options) return "";
  const { min, max } = numericFieldLimits(field);
  const number = Number(value);
  if (value === "" || !Number.isFinite(number)) return "أدخل قيمة رقمية صحيحة.";
  if (min != null && number < min) return `يجب ألا تقل القيمة عن ${min}.`;
  if (max != null && number > max) return `يجب ألا تتجاوز القيمة ${max}.`;
  return "";
}

function initialValues(modelId) {
  return Object.fromEntries(modelFields[modelId].map((field) => [field.id, field.value]));
}

export function AppliedAccountingLab({
  selectedStandard,
  accounts = [],
  engagement = {},
  setEngagement,
  metrics,
  mappingState,
  formatCurrency,
  onToast,
}) {
  const componentId = useId();
  const preferredModel = useMemo(() => {
    const match = Object.entries(APPLIED_MODEL_META).find(([, item]) => item.standardId === selectedStandard?.id);
    return match?.[0] || "inventory";
  }, [selectedStandard?.id]);
  const [model, setModel] = useState(preferredModel);
  const [values, setValues] = useState(() => initialValues(preferredModel));

  useEffect(() => {
    setModel(preferredModel);
    setValues(initialValues(preferredModel));
  }, [preferredModel]);

  const adjustedAccounts = useMemo(
    () => applyPostedAdjustmentsToAccounts(accounts, engagement.adjustments || []),
    [accounts, engagement.adjustments],
  );
  const modelMeta = APPLIED_MODEL_META[model];
  const linkedCategories = modelMeta.linkedInput?.categories || EMPTY_CATEGORIES;
  const linkedAccounts = useMemo(() => adjustedAccounts.filter((account) => (
    linkedCategories.includes(account.category)
    &&
    getAccountStandardIds(account, mappingState)
      .includes(modelMeta.standardId)
  )), [adjustedAccounts, linkedCategories, mappingState, modelMeta.standardId]);
  const linkedExposure = useMemo(() => linkedAccounts.reduce(
    (total, account) => total + Math.abs(Number(account.amount || Number(account.debit || 0) - Number(account.credit || 0))),
    0,
  ), [linkedAccounts]);
  const linkedMappingStatus = useMemo(() => linkedAccounts.reduce((counts, account) => {
    const status = resolveAccountMapping(account, mappingState).status;
    if (status === "reviewed") counts.reviewed += 1;
    else if (status === "suggested") counts.suggested += 1;
    return counts;
  }, { reviewed: 0, suggested: 0 }), [linkedAccounts, mappingState]);
  const cycle = useMemo(() => buildAccountingCycleReadiness(adjustedAccounts, engagement, metrics), [adjustedAccounts, engagement, metrics]);
  const ifrs18 = useMemo(() => buildIfrs18Readiness(adjustedAccounts, engagement), [adjustedAccounts, engagement]);
  const summary = useMemo(() => buildAppliedAccountingSummary(adjustedAccounts, engagement, metrics), [adjustedAccounts, engagement, metrics]);
  const fieldErrors = useMemo(() => Object.fromEntries(
    modelFields[model]
      .map((field) => [field.id, numericFieldError(field, values[field.id])])
      .filter(([, error]) => error),
  ), [model, values]);
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const result = useMemo(
    () => hasFieldErrors ? null : calculators[model](values),
    [hasFieldErrors, model, values],
  );
  const money = typeof formatCurrency === "function"
    ? formatCurrency
    : (value) => new Intl.NumberFormat("ar-SA-u-nu-latn", { style: "currency", currency: "SAR" }).format(Number(value || 0));
  const formatResultValue = (key, value) => {
    if (value == null) return "غير قابل للاحتساب";
    if (typeof value !== "number") return value;
    if (key === "coverageRatio") return `${new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 2 }).format(value)}%`;
    return money(value);
  };

  const chooseModel = (nextModel) => {
    setModel(nextModel);
    setValues(initialValues(nextModel));
  };

  const linkedExposureField = modelMeta.linkedInput?.fieldId;

  const useLinkedExposure = () => {
    if (!linkedExposureField) {
      onToast?.("هذا النموذج يحتاج مدخلًا نوعيًا مستقلًا؛ لا يمكن تحويل إجمالي التعرض إلى هذا المدخل بأمان.");
      return;
    }
    if (!linkedExposure) {
      onToast?.("لا يوجد تعرض مرتبط بالمعيار الحالي لاستخدامه في السيناريو.");
      return;
    }
    const exposureField = modelFields[model].find((field) => field.id === linkedExposureField);
    if (!exposureField) return;
    setValues((current) => ({ ...current, [exposureField.id]: Math.round(linkedExposure * 100) / 100 }));
    onToast?.("تم إدراج التعرض المرتبط كنقطة بداية قابلة للتعديل.");
  };

  const downloadReport = async () => {
    if (!result) {
      onToast?.("صحح مدخلات النموذج قبل تنزيل حزمة التطبيق.");
      return;
    }
    const generatedAt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "long", timeStyle: "short" }).format(new Date());
    const inputRows = modelFields[model].map((field) => {
      const optionLabel = field.options?.find(([option]) => option === values[field.id])?.[1];
      return [field.label, optionLabel ?? values[field.id]];
    });
    const resultRows = Object.entries(result)
      .filter(([key]) => visibleResultKeys.includes(key))
      .map(([key, value]) => [resultLabels[key], formatResultValue(key, value)]);
    try {
      const blob = await createAppliedAccountingDocxBlob({
        entityName: engagement.entity?.name || "المنشأة محل المراجعة",
        period: engagement.entity?.period || "الفترة الحالية",
        summary,
        cycle,
        ifrs18,
        standardId: modelMeta.standardId,
        modelTitle: modelMeta.title,
        formula: modelMeta.formula,
        inputRows,
        resultRows,
        generatedAt,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "kosif-applied-accounting-pack.docx";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      onToast?.("تم تنزيل حزمة التطبيق المحاسبي وIFRS 18 بصيغة DOCX حقيقية.");
    } catch {
      onToast?.("تعذر إنشاء ملف DOCX. أعد المحاولة.");
    }
  };

  const readinessFieldById = {
    classification: "classificationReviewed",
    mpm: "mpmReconciled",
    aggregation: "aggregationReviewed",
    "effective-date": ifrs18.readinessChecks.find((item) => item.id === "effective-date")?.documentationField
      || "transitionPlanDocumented",
  };

  const handleModelTabKeyDown = (event, currentModel) => {
    const modelIds = Object.keys(APPLIED_MODEL_META);
    const currentIndex = modelIds.indexOf(currentModel);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % modelIds.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + modelIds.length) % modelIds.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = modelIds.length - 1;
    else return;
    event.preventDefault();
    const nextModel = modelIds[nextIndex];
    chooseModel(nextModel);
    window.requestAnimationFrame(() => {
      document.getElementById(`${componentId}-model-tab-${nextModel}`)?.focus();
    });
  };

  const toggleReadiness = (checkId) => {
    const field = readinessFieldById[checkId];
    if (!field || typeof setEngagement !== "function") return;
    setEngagement((current) => {
      const currentValue = Boolean(current.ifrs18?.[field]);
      const updatedAt = new Date().toISOString();
      const updatedBy = current.standardMappings?.review?.reviewer
        || current.analyticsReview?.reviewer
        || "المراجع البشري";
      return {
        ...current,
        humanApproval: false,
        humanApprovedAt: null,
        ifrs18: {
          ...current.ifrs18,
          [field]: !currentValue,
          updatedAt,
          updatedBy,
        },
        auditTrail: [{
          id: `LOG-${Date.now()}`,
          action: "تحديث جاهزية IFRS 18",
          actor: updatedBy,
          at: updatedAt,
          detail: `${checkId} · ${!currentValue ? "تم توثيقه" : "أُلغي توثيقه"}؛ أُعيد فتح الاعتماد النهائي.`,
        }, ...(current.auditTrail || [])],
      };
    });
    onToast?.("تم تحديث توثيق جاهزية IFRS 18 داخل الجلسة الحالية.");
  };

  return (
    <section id="applied-accounting-lab" className="applied-lab" dir="rtl" aria-labelledby={`${componentId}-title`}>
      <header className="applied-lab__hero">
        <span className="applied-lab__icon" aria-hidden="true"><Sparkles size={25} /></span>
        <div>
          <span>من الشرح إلى ورقة عمل قابلة للفحص</span>
          <h2 id={`${componentId}-title`}>مختبر التطبيق المحاسبي</h2>
          <p>نماذج رقمية، دورة إقفال، وتجهيز IFRS 18 مرتبطة بميزان المراجعة الحالي.</p>
        </div>
        <button type="button" onClick={downloadReport}><Download size={17} aria-hidden="true" /> تنزيل حزمة التطبيق</button>
      </header>

      <div className="applied-lab__provenance" role="note">
        <BookOpenCheck size={20} aria-hidden="true" />
        <p>
          حُصرت <strong>{YOUTUBE_KNOWLEDGE_SUMMARY.uniqueVideos}</strong> مادة فريدة عبر {YOUTUBE_KNOWLEDGE_SUMMARY.playlistCount} قوائم و{YOUTUBE_KNOWLEDGE_SUMMARY.standaloneVideoCount} فيديوهات مستقلة. استُخدمت كخريطة حالات وتدريب فقط؛ يظل النص الرسمي والحكم المهني هما المرجع.
        </p>
      </div>

      <div className="applied-lab__metrics" aria-label="ملخص الجاهزية">
        <article><ClipboardCheck size={20} /><span>دورة الإقفال</span><strong>{summary.cycleComplete}/{summary.cycleTotal}</strong></article>
        <article><Layers3 size={20} /><span>جاهزية IFRS 18</span><strong>{summary.ifrs18Passed}/{summary.ifrs18Total}</strong></article>
        <article>
          <FileSpreadsheet size={20} />
          <span>التعرض المرتبط</span>
          <strong dir="ltr">{money(linkedExposure)}</strong>
          <small>{linkedMappingStatus.reviewed} ربطًا راجعه الإنسان · {linkedMappingStatus.suggested} ربطًا مقترحًا</small>
        </article>
      </div>

      <section className="applied-lab__panel" aria-labelledby={`${componentId}-models-title`}>
        <div className="applied-lab__heading">
          <Calculator size={22} aria-hidden="true" />
          <div><span>سيناريو قابل لإعادة الأداء</span><h3 id={`${componentId}-models-title`}>نماذج القياس التطبيقية</h3></div>
        </div>
        <div className="applied-lab__model-tabs" role="tablist" aria-label="نماذج القياس">
          {Object.entries(APPLIED_MODEL_META).map(([id, item]) => (
            <button
              key={id}
              id={`${componentId}-model-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={model === id}
              aria-controls={`${componentId}-model-panel`}
              tabIndex={model === id ? 0 : -1}
              onClick={() => chooseModel(id)}
              onKeyDown={(event) => handleModelTabKeyDown(event, id)}
            >
              <bdi dir="ltr">{item.standardId}</bdi><span>{item.title}</span>
            </button>
          ))}
        </div>
        <div
          id={`${componentId}-model-panel`}
          className="applied-lab__scenario"
          role="tabpanel"
          aria-labelledby={`${componentId}-model-tab-${model}`}
        >
          <div className="applied-lab__scenario-head">
            <div>
              <span>{modelMeta.standardId}</span><h4>{modelMeta.title}</h4><p>{modelMeta.description}</p>
              <small className="applied-lab__formula">{modelMeta.formula}</small>
              {!linkedExposureField ? (
                <small id={`${componentId}-linked-exposure-help`} className="applied-lab__exposure-help">
                  يتطلب هذا النموذج مدخلًا نوعيًا مستقلًا؛ إجمالي التعرض ليس بديلًا آمنًا عنه.
                </small>
              ) : null}
            </div>
            <button
              type="button"
              onClick={useLinkedExposure}
              disabled={!linkedExposureField}
              aria-describedby={!linkedExposureField ? `${componentId}-linked-exposure-help` : undefined}
            >
              استخدم التعرض المرتبط
            </button>
          </div>
          <div className="applied-lab__fields">
            {modelFields[model].map((field) => (
              <label key={field.id}>
                {field.label}
                {field.options ? (
                  <select value={values[field.id]} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}>
                    {field.options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                ) : (
                  <>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={field.step || "0.01"}
                      min={numericFieldLimits(field).min}
                      max={numericFieldLimits(field).max}
                      value={values[field.id]}
                      aria-invalid={Boolean(fieldErrors[field.id])}
                      aria-describedby={fieldErrors[field.id] ? `${componentId}-${model}-${field.id}-error` : undefined}
                      onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                    />
                    {fieldErrors[field.id] ? (
                      <small id={`${componentId}-${model}-${field.id}-error`} className="applied-lab__field-error">
                        {fieldErrors[field.id]}
                      </small>
                    ) : null}
                  </>
                )}
              </label>
            ))}
          </div>
          {result ? <div className="applied-lab__results">
            {Object.entries(result).filter(([key]) => visibleResultKeys.includes(key)).map(([key, value]) => (
              <article key={key}>
                <span>{resultLabels[key]}</span>
                <strong dir={typeof value === "number" ? "ltr" : "auto"}>
                  {formatResultValue(key, value)}
                </strong>
              </article>
            ))}
          </div> : (
            <p className="applied-lab__validation-summary" role="alert">
              صحح القيم المشار إليها لعرض نتيجة قابلة لإعادة الأداء.
            </p>
          )}
          <p className="applied-lab__scenario-note"><ShieldAlert size={16} />المدخلات افتراضية وقابلة للتعديل؛ النتيجة لا تنشئ قيدًا ولا تعتمد معالجة تلقائيًا.</p>
        </div>
      </section>

      <div className="applied-lab__two-column">
        <section className="applied-lab__panel" aria-labelledby={`${componentId}-cycle-title`}>
          <div className="applied-lab__heading"><ClipboardCheck size={22} /><div><span>من التسجيل إلى التقرير</span><h3 id={`${componentId}-cycle-title`}>دورة المحاسبة والإقفال</h3></div></div>
          <div className="applied-lab__checklist">
            {cycle.map((item) => (
              <article key={item.id} className={`is-${item.status}`}>
                {item.status === "complete" ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
                <div><strong>{item.title}</strong><span>{item.standards.join(" · ")}</span><p>{item.detail}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="applied-lab__panel" aria-labelledby={`${componentId}-ifrs18-title`}>
          <div className="applied-lab__heading"><Layers3 size={22} /><div><span>خريطة انتقال لا ترحيل آلي</span><h3 id={`${componentId}-ifrs18-title`}>استعداد IFRS 18</h3></div></div>
          <div className="applied-lab__ifrs18-rows">
            {ifrs18.rows.map((item) => (
              <article key={item.id}><span>{item.label}<small>{item.accountCount} حسابًا</small></span><strong dir="ltr">{money(item.total)}</strong></article>
            ))}
          </div>
          <div className="applied-lab__readiness">
            {ifrs18.readinessChecks.map((item) => (
              <article key={item.id} className={item.pass ? "is-pass" : "is-review"}>
                {item.pass ? <BadgeCheck size={18} /> : <ShieldAlert size={18} />}
                <div><strong>{item.label}</strong><p>{item.detail}</p></div>
                {readinessFieldById[item.id] ? (
                  <button
                    type="button"
                    aria-pressed={Boolean(engagement.ifrs18?.[readinessFieldById[item.id]])}
                    aria-label={`${engagement.ifrs18?.[readinessFieldById[item.id]] ? "إلغاء التوثيق" : item.id === "effective-date" ? "توثيق خطة الانتقال" : "توثيق الاكتمال"}: ${item.label}`}
                    onClick={() => toggleReadiness(item.id)}
                  >
                    {engagement.ifrs18?.[readinessFieldById[item.id]]
                      ? "إلغاء التوثيق"
                      : item.id === "effective-date" ? "توثيق خطة الانتقال" : "توثيق الاكتمال"}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
