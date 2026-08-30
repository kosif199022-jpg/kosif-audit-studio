import { buildReportState, isAdjustmentPosted } from "./reporting.js";

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) => Math.round((finiteNumber(value) + Number.EPSILON) * 100) / 100;

const accountNet = (account = {}) => roundMoney(
  finiteNumber(account.credit) - finiteNumber(account.debit),
);

const accountExposure = (account = {}) => Math.abs(
  finiteNumber(account.amount || finiteNumber(account.debit) - finiteNumber(account.credit)),
);

export const YOUTUBE_KNOWLEDGE_SOURCES = Object.freeze([
  { id: "PL2MXY0X4flhkIyGOiJuL4DqB8CFix4vdu", title: "معايير المحاسبة الدولية والمصرية", count: 36, type: "playlist" },
  { id: "PLw7BcZ9DXQcBnevMKTzHpxNL9Z1VLOYp_", title: "شهادة CertIFR", count: 51, type: "playlist" },
  { id: "PLLsYiYPRMH2ytG3QT876N8bpTg9IvYFW0", title: "حالات عملية على المعايير", count: 83, type: "playlist" },
  { id: "PLlMxSpyAvEuUr4BSqznfCTBPDnxjgtrRB", title: "المعايير المصرية والذكاء الاصطناعي", count: 30, type: "playlist" },
  { id: "PLFxfaNxadiElRws1xw2FUwpHN89FLr_dg", title: "IAS وIFRS", count: 81, type: "playlist" },
  { id: "PL1QE57n9NoQpSh8fluLCfstOIkc7FipCJ", title: "دبلوم IFRS", count: 60, type: "playlist" },
  { id: "PLnNt-7uefZIkPB9mxqraqeFYmWgTeGpoU", title: "شهادة IFRS", count: 61, type: "playlist" },
  { id: "PLx1yTu6mEfYWsUq1Eac2SEvc-pqrH53wJ", title: "تطبيقات IFRS", count: 48, type: "playlist" },
  { id: "PLORzSxoXX4ut10rICf68r-cTJCcWP4FfW", title: "دبلوم IFRS التطبيقي", count: 51, type: "playlist" },
  { id: "PLrLeeuMbuaUfdhq9O-0FYsXAuWrUnVSGA", title: "IFRS 18", count: 12, type: "playlist" },
  { id: "nOPUA8smHbM", title: "مراجعة شاملة لمعايير IFRS", count: 1, type: "video" },
  { id: "eyXKvOrDoqw", title: "دورة المحاسبة المالية الكاملة", count: 1, type: "video" },
  { id: "mHcfK0MsNBU", title: "محاضرة التوحيد الشاملة", count: 1, type: "video" },
]);

export const YOUTUBE_KNOWLEDGE_SUMMARY = Object.freeze({
  playlistCount: 10,
  standaloneVideoCount: 3,
  listedAppearances: 516,
  uniqueVideos: 465,
  capturedAt: "2026-08-29",
  note: "استُخدمت العناوين والأوصاف والمحاور المتاحة لبناء نماذج تطبيقية؛ الأعداد لقطة للمواد الظاهرة وقت الحصر وقد تتغير، ولا تُعامل المواد التعليمية كنص معياري أو دليل مراجعة.",
});

export const YOUTUBE_TOPIC_MAP = Object.freeze([
  { topic: "الأصول والهبوط والقيمة العادلة", uniqueVideoCount: 48 },
  { topic: "التوحيد وتجميع الأعمال", uniqueVideoCount: 41 },
  { topic: "السياسات والأحداث والمخصصات", uniqueVideoCount: 37 },
  { topic: "العرض والتقارير وIFRS 18", uniqueVideoCount: 29 },
  { topic: "المخزون والتكلفة", uniqueVideoCount: 26 },
  { topic: "الإيراد والعقود", uniqueVideoCount: 24 },
  { topic: "المنافع والدفعات والأسهم", uniqueVideoCount: 21 },
  { topic: "التدفقات النقدية", uniqueVideoCount: 17 },
  { topic: "الأدوات المالية والائتمان", uniqueVideoCount: 16 },
  { topic: "الأخلاقيات والإطار المهني", uniqueVideoCount: 14 },
  { topic: "الإيجارات", uniqueVideoCount: 13 },
  { topic: "الضرائب والضريبة المؤجلة", uniqueVideoCount: 11 },
  { topic: "العملات الأجنبية", uniqueVideoCount: 7 },
  { topic: "القطاعات والأطراف والمنشآت الصغيرة", uniqueVideoCount: 6 },
]);

export const APPLIED_MODEL_META = Object.freeze({
  inventory: {
    standardId: "IAS 2",
    title: "اختبار التكلفة وصافي القيمة القابلة للتحقق",
    description: "يقارن تكلفة المخزون بصافي القيمة القابلة للتحقق ويحدد التخفيض المطلوب.",
    formula: "صافي القيمة = سعر البيع المتوقع − تكاليف الإكمال − تكاليف البيع؛ القيمة الدفترية = الأقل من التكلفة وصافي القيمة.",
    linkedInput: { fieldId: "cost", categories: ["inventory"] },
  },
  ecl: {
    standardId: "IFRS 9",
    title: "نموذج الخسائر الائتمانية المتوقعة",
    description: "يحسب سيناريو مبسطًا من التعرض وPD المناسب للأفق المختار وLGD؛ لا يستبدل نموذج السيناريوهات والخصم.",
    formula: "الخسارة المبسطة = EAD × PD المدخل للأفق المختار × LGD؛ المرحلة 1 تستخدم PD لاثني عشر شهرًا، والمرحلتان 2 و3 تستخدمان PD للعمر الكامل.",
    linkedInput: { fieldId: "exposure", categories: ["receivables"] },
  },
  impairment: {
    standardId: "IAS 36",
    title: "اختبار الهبوط في القيمة",
    description: "يقارن القيمة الدفترية بالقيمة القابلة للاسترداد الأعلى من بدائل القياس.",
    formula: "القيمة القابلة للاسترداد = الأعلى من القيمة قيد الاستخدام والقيمة العادلة ناقص تكاليف الاستبعاد؛ الخسارة = الزيادة في القيمة الدفترية.",
    linkedInput: { fieldId: "carryingAmount", categories: ["ppe", "rightOfUse", "intangibles", "investmentProperty"] },
  },
  deferredTax: {
    standardId: "IAS 12",
    title: "الفروق المؤقتة والضريبة المؤجلة",
    description: "يحدد الفرق المؤقت والاتجاه المبدئي لأصل أو التزام الضريبة المؤجلة.",
    formula: "الفرق المؤقت = القيمة الدفترية − الأساس الضريبي؛ الضريبة المؤجلة = القيمة المطلقة للفرق × المعدل، مع تحديد الاتجاه بحسب نوع البند.",
  },
  eps: {
    standardId: "IAS 33",
    title: "ربحية السهم الأساسية والمخفضة",
    description: "يعيد احتساب الربحية باستخدام الربح المنسوب والمتوسط المرجح والأسهم المحتملة.",
    formula: "ربحية السهم الأساسية = الربح المنسوب بعد توزيعات الممتازة ÷ المتوسط المرجح؛ تُستبعد الأدوات المضادة للتخفيض.",
  },
  goodwill: {
    standardId: "IFRS 3",
    title: "الشهرة أو مكسب الشراء بسعر مغرٍ",
    description: "يبني جسر المقابل وحقوق غير المسيطرين والحصة السابقة وصافي الأصول المحددة.",
    formula: "الشهرة = المقابل + حقوق غير المسيطرين + القيمة العادلة للحصة السابقة − صافي الأصول المحددة.",
  },
  foreignCurrency: {
    standardId: "IAS 21",
    title: "إعادة ترجمة بند نقدي أجنبي",
    description: "يقارن القياس الأولي بسعر المعاملة مع القياس في الإقفال ويظهر فرق الصرف.",
    formula: "فرق إعادة القياس = المبلغ الأجنبي × (سعر الإقفال − سعر المعاملة)؛ اتجاه الربح أو الخسارة يعتمد على كون البند أصلًا أو التزامًا.",
  },
});

export function calculateInventoryNrv({
  cost,
  estimatedSellingPrice,
  completionCost,
  sellingCost,
} = {}) {
  const normalizedCost = Math.max(0, finiteNumber(cost));
  const normalizedSellingPrice = Math.max(0, finiteNumber(estimatedSellingPrice));
  const normalizedCompletionCost = Math.max(0, finiteNumber(completionCost));
  const normalizedSellingCost = Math.max(0, finiteNumber(sellingCost));
  const nrv = Math.max(
    0,
    normalizedSellingPrice - normalizedCompletionCost - normalizedSellingCost,
  );
  const carryingAmount = Math.min(normalizedCost, nrv);
  return {
    cost: roundMoney(normalizedCost),
    nrv: roundMoney(nrv),
    carryingAmount: roundMoney(carryingAmount),
    writeDown: roundMoney(Math.max(0, normalizedCost - nrv)),
    conclusion: normalizedCost > nrv ? "يلزم تخفيض مبدئي" : "لا يظهر تخفيض من هذا السيناريو",
  };
}

export function calculateExpectedCreditLoss({
  exposure,
  probabilityOfDefault,
  lossGivenDefault,
  stage = "1",
} = {}) {
  const normalizedExposure = Math.max(0, finiteNumber(exposure));
  const pd = Math.min(100, Math.max(0, finiteNumber(probabilityOfDefault))) / 100;
  const lgd = Math.min(100, Math.max(0, finiteNumber(lossGivenDefault))) / 100;
  const loss = normalizedExposure * pd * lgd;
  const normalizedStage = ["1", "2", "3"].includes(String(stage)) ? String(stage) : "1";
  return {
    exposure: roundMoney(normalizedExposure),
    probabilityOfDefault: roundMoney(pd * 100),
    lossGivenDefault: roundMoney(lgd * 100),
    loss: roundMoney(loss),
    coverageRatio: normalizedExposure ? roundMoney((loss / normalizedExposure) * 100) : 0,
    horizon: normalizedStage === "1" ? "اثنا عشر شهرًا" : "العمر الكامل",
    probabilityBasis: normalizedStage === "1" ? "PD لاثني عشر شهرًا" : "PD للعمر الكامل",
    stage: normalizedStage,
  };
}

export function calculateImpairment({
  carryingAmount,
  fairValueLessCosts,
  valueInUse,
} = {}) {
  const carrying = Math.max(0, finiteNumber(carryingAmount));
  const recoverableAmount = Math.max(
    0,
    finiteNumber(fairValueLessCosts),
    finiteNumber(valueInUse),
  );
  const loss = Math.max(0, carrying - recoverableAmount);
  return {
    carryingAmount: roundMoney(carrying),
    recoverableAmount: roundMoney(recoverableAmount),
    impairmentLoss: roundMoney(loss),
    postImpairmentAmount: roundMoney(carrying - loss),
    conclusion: loss ? "تظهر خسارة هبوط في السيناريو" : "لا تظهر خسارة هبوط في السيناريو",
  };
}

export function calculateDeferredTax({
  carryingAmount,
  taxBase,
  taxRate,
  itemType = "asset",
} = {}) {
  const carrying = finiteNumber(carryingAmount);
  const normalizedTaxBase = finiteNumber(taxBase);
  const rate = Math.min(100, Math.max(0, finiteNumber(taxRate))) / 100;
  const temporaryDifference = carrying - normalizedTaxBase;
  const liabilityDirection = itemType === "liability" ? temporaryDifference < 0 : temporaryDifference > 0;
  const amount = Math.abs(temporaryDifference) * rate;
  return {
    carryingAmount: roundMoney(carrying),
    taxBase: roundMoney(normalizedTaxBase),
    temporaryDifference: roundMoney(temporaryDifference),
    amount: roundMoney(amount),
    direction: amount === 0 ? "none" : liabilityDirection ? "liability" : "asset",
    directionLabel: amount === 0 ? "لا فرق مؤقت" : liabilityDirection ? "التزام ضريبة مؤجلة مبدئي" : "أصل ضريبة مؤجلة مبدئي",
  };
}

export function calculateEps({
  profitAttributable,
  preferenceDividends,
  weightedShares,
  dilutiveNumerator = 0,
  dilutiveShares = 0,
} = {}) {
  const numerator = finiteNumber(profitAttributable) - finiteNumber(preferenceDividends);
  const denominator = Math.max(0, finiteNumber(weightedShares));
  const dilutedNumerator = numerator + finiteNumber(dilutiveNumerator);
  const dilutedDenominator = denominator + Math.max(0, finiteNumber(dilutiveShares));
  const rawBasicEps = denominator ? numerator / denominator : null;
  const rawCandidateDilutedEps = dilutedDenominator
    ? dilutedNumerator / dilutedDenominator
    : null;
  const potentialSharesIncluded = rawBasicEps != null
    && rawCandidateDilutedEps != null
    && rawCandidateDilutedEps < rawBasicEps;
  const basicEps = rawBasicEps == null ? null : roundMoney(rawBasicEps);
  const candidateDilutedEps = rawCandidateDilutedEps == null ? null : roundMoney(rawCandidateDilutedEps);
  return {
    numerator: roundMoney(numerator),
    weightedShares: roundMoney(denominator),
    basicEps,
    dilutedEps: basicEps == null
      ? null
      : potentialSharesIncluded ? candidateDilutedEps : basicEps,
    potentialSharesIncluded,
    denominatorValid: denominator > 0,
  };
}

export function calculateGoodwill({
  consideration,
  nonControllingInterest,
  previousInterest,
  netIdentifiableAssets,
} = {}) {
  const bridge = finiteNumber(consideration)
    + finiteNumber(nonControllingInterest)
    + finiteNumber(previousInterest)
    - finiteNumber(netIdentifiableAssets);
  return {
    bridge: roundMoney(bridge),
    goodwill: roundMoney(Math.max(0, bridge)),
    bargainPurchaseGain: roundMoney(Math.max(0, -bridge)),
    conclusion: bridge > 0
      ? "شهرة مبدئية قبل اختبارات الاكتمال والقياس"
      : bridge < 0
        ? "مكسب شراء مبدئي يتطلب إعادة تقييم القياسات"
        : "لا تظهر شهرة أو مكسب شراء من الجسر قبل استكمال اختبارات القياس.",
  };
}

export function calculateForeignCurrency({
  foreignAmount,
  transactionRate,
  closingRate,
  itemType = "asset",
} = {}) {
  const amount = finiteNumber(foreignAmount);
  const normalizedTransactionRate = finiteNumber(transactionRate);
  const normalizedClosingRate = finiteNumber(closingRate);
  const validRates = normalizedTransactionRate > 0 && normalizedClosingRate > 0;
  const initialMeasurement = validRates ? amount * normalizedTransactionRate : null;
  const closingMeasurement = validRates ? amount * normalizedClosingRate : null;
  if (!validRates) {
    return {
      foreignAmount: roundMoney(amount),
      initialMeasurement: null,
      closingMeasurement: null,
      exchangeDifference: null,
      direction: "invalid",
      directionLabel: "تعذر تحديد اتجاه الربح أو الخسارة",
      conclusion: "يلزم إدخال سعري معاملة وإقفال موجبين قبل إعادة القياس.",
    };
  }
  const exchangeDifference = closingMeasurement - initialMeasurement;
  const normalizedItemType = itemType === "liability" ? "liability" : "asset";
  const isGain = exchangeDifference !== 0
    && (normalizedItemType === "asset" ? exchangeDifference > 0 : exchangeDifference < 0);
  return {
    foreignAmount: roundMoney(amount),
    initialMeasurement: roundMoney(initialMeasurement),
    closingMeasurement: roundMoney(closingMeasurement),
    exchangeDifference: roundMoney(exchangeDifference),
    direction: exchangeDifference === 0 ? "none" : exchangeDifference > 0 ? "increase" : "decrease",
    itemType: normalizedItemType,
    directionLabel: exchangeDifference === 0 ? "لا فرق صرف" : isGain ? "مكسب صرف مبدئي" : "خسارة صرف مبدئية",
  };
}

export function buildIfrs18Readiness(accounts = [], engagement = {}) {
  const categories = {
    operating: { id: "operating", label: "التشغيل", total: 0, accountCount: 0 },
    investing: { id: "investing", label: "الاستثمار", total: 0, accountCount: 0 },
    financing: { id: "financing", label: "التمويل", total: 0, accountCount: 0 },
    tax: { id: "tax", label: "ضريبة الدخل", total: 0, accountCount: 0 },
    discontinued: { id: "discontinued", label: "العمليات غير المستمرة", total: 0, accountCount: 0 },
  };
  const reviewRequired = [];
  const profitOrLossCategories = new Set(["revenue", "otherIncome", "cogs", "expenses", "financeCosts"]);

  for (const account of accounts) {
    const name = String(account.name || "");
    const category = String(account.category || "");
    const looksLikeProfitOrLoss = profitOrLossCategories.has(category) || /^[456]/.test(String(account.code || ""));
    if (!looksLikeProfitOrLoss) continue;

    let bucket = "operating";
    if (/غير مستمر|متوقف|discontinued/i.test(name)) bucket = "discontinued";
    else if (category === "financeCosts" || /تكلفة تمويل|مصروف فوائد|finance costs?|interest expense/i.test(name)) bucket = "financing";
    else if (/ضريبة دخل|مصروف ضريب|income tax/i.test(name)) bucket = "tax";
    else if (category === "otherIncome" && /استثمار|توزيعات|عائد مالي|فوائد|investment|dividend|interest/i.test(name)) bucket = "investing";

    categories[bucket].total = roundMoney(categories[bucket].total + accountNet(account));
    categories[bucket].accountCount += 1;
    if (category === "otherIncome" && bucket !== "discontinued") {
      reviewRequired.push({
        accountId: account.id,
        code: account.code,
        name,
        reason: "الإيراد الآخر يحتاج توثيق طبيعته والأنشطة التجارية الرئيسية قبل تثبيت فئة IFRS 18.",
      });
    }
  }

  const rows = Object.values(categories);
  const operatingProfit = categories.operating.total;
  const profitBeforeFinancingAndTax = roundMoney(
    operatingProfit + categories.investing.total,
  );
  const profitBeforeTax = roundMoney(
    profitBeforeFinancingAndTax + categories.financing.total,
  );
  const profitFromContinuingOperations = roundMoney(profitBeforeTax + categories.tax.total);
  const profitAfterTax = roundMoney(
    profitFromContinuingOperations + categories.discontinued.total,
  );
  const earlyAdoptionDocumented = Boolean(engagement.ifrs18?.earlyAdoptionDocumented);
  const effectiveForPeriodDocumented = Boolean(engagement.ifrs18?.effectiveForPeriodDocumented);
  const transitionPlanDocumented = Boolean(engagement.ifrs18?.transitionPlanDocumented);
  const mpmReconciled = Boolean(engagement.ifrs18?.mpmReconciled);
  const aggregationReviewed = Boolean(engagement.ifrs18?.aggregationReviewed);
  const classificationReviewed = Boolean(engagement.ifrs18?.classificationReviewed);
  const reportingPeriodText = String(
    engagement.sourceDataset?.period
      || engagement.demo?.commitment?.period
      || engagement.entity?.period
      || "",
  );
  const reportingYear = Number(reportingPeriodText.match(/20\d{2}/)?.[0] || 0);
  const effectivePeriodCandidate = reportingYear >= 2027;

  return {
    rows,
    totals: {
      operatingProfit,
      profitBeforeFinancingAndTax,
      profitBeforeTax,
      profitFromContinuingOperations,
      profitAfterTax,
    },
    reviewRequired,
    readinessChecks: [
      { id: "classification", label: "تصنيف بنود الربح أو الخسارة", pass: accounts.length > 0 && classificationReviewed, detail: !accounts.length ? "لا توجد بنود ربح أو خسارة قابلة للفحص." : classificationReviewed ? `وثّق المراجع تصنيف البنود والأنشطة الرئيسية؛ شملت المراجعة ${reviewRequired.length} بندًا ذا تصنيف توجيهي حساس.` : `الخريطة اسمية وتوجيهية فقط؛ يلزم توثيق النشاط الرئيس ومراجعة ${reviewRequired.length} بندًا حساسًا قبل الاعتماد.` },
      { id: "mpm", label: "مصالحة مقاييس الأداء المحددة من الإدارة", pass: mpmReconciled, detail: mpmReconciled ? "المصالحة موثقة في حالة الارتباط." : "لم تسجل مصالحة MPM مع أقرب مجموع فرعي IFRS." },
      { id: "aggregation", label: "مراجعة التجميع والتفصيل", pass: aggregationReviewed, detail: aggregationReviewed ? "تم توثيق مراجعة التجميع والتفصيل." : "يلزم فحص البنود المجمعة والإيضاحات المقابلة." },
      {
        id: "effective-date",
        label: "السريان أو خطة الانتقال",
        pass: effectiveForPeriodDocumented || earlyAdoptionDocumented || transitionPlanDocumented,
        documentationField: effectivePeriodCandidate ? "effectiveForPeriodDocumented" : "transitionPlanDocumented",
        detail: effectiveForPeriodDocumented
          ? "وثّق المراجع أن الفترة السنوية تبدأ في 1 يناير 2027 أو بعده، وأن أحكام الانتقال منطبقة."
          : earlyAdoptionDocumented
            ? "التطبيق المبكر موثق."
            : transitionPlanDocumented
              ? "خطة الانتقال موثقة دون تقديم المعيار كنافذ على الفترة الحالية."
              : "ثبّت بداية الفترة وتاريخ السريان؛ إن لم يكن المعيار نافذًا فوثّق خطة الانتقال أو تطبيقًا مبكرًا صحيحًا.",
      },
    ],
  };
}

export function buildAccountingCycleReadiness(accounts = [], engagement = {}, metrics = null) {
  const categoryCounts = new Map();
  for (const account of accounts) {
    categoryCounts.set(account.category, (categoryCounts.get(account.category) || 0) + 1);
  }
  const debit = accounts.reduce((total, account) => total + finiteNumber(account.debit), 0);
  const credit = accounts.reduce((total, account) => total + finiteNumber(account.credit), 0);
  const balanced = Math.abs(debit - credit) < 0.01;
  const postedAdjustments = (engagement.adjustments || []).filter(isAdjustmentPosted);
  const allAdjustmentsPosted = (engagement.adjustments || []).length > 0
    && postedAdjustments.length === (engagement.adjustments || []).length;
  const reportingPeriod = String(
    engagement.sourceDataset?.period
      || engagement.demo?.commitment?.period
      || engagement.entity?.period
      || "",
  );
  const reportingPeriodToken = reportingPeriod.match(/20\d{2}(?:-\d{2})?/)?.[0] || "";
  const lockedPeriod = Boolean(reportingPeriodToken) && (engagement.periodLocks || []).some((item) => {
    if (item.status !== "locked") return false;
    const lockId = String(item.id || "");
    const lockReference = `${lockId} ${item.label || ""}`;
    return lockReference.includes(reportingPeriodToken)
      || (Boolean(lockId) && reportingPeriodToken.includes(lockId))
      || (!reportingPeriodToken.includes("-") && lockReference.includes(reportingPeriodToken));
  });
  const importedSession = engagement.sourceDataset?.source === "import";
  const dataSources = engagement.dataSources || {};
  const sourceReady = (id) => !importedSession || dataSources[id] === true || dataSources[id]?.status === "committed";
  const canonicalReportReady = Boolean(metrics) && buildReportState(engagement, metrics).reportReady;

  const sourceCheck = (categories) => categories.some((category) => (categoryCounts.get(category) || 0) > 0);
  const step = (id, title, standards, pass, detail, missingLabel) => ({
    id,
    title,
    standards,
    status: pass ? "complete" : accounts.length ? "review" : "missing",
    detail: pass ? detail : missingLabel,
  });

  return [
    step("statements", "بنية القوائم والميزان", ["IAS 1", "IFRS 18"], accounts.length > 0 && balanced, `${accounts.length} حسابًا والميزان متوازن.`, "يلزم ميزان متوازن ومجتمع حسابات مثبت."),
    step("recording", "التسجيل والقيود", ["الإطار المفاهيمي"], accounts.length > 0 && sourceReady("generalLedger"), importedSession ? "دفتر الأستاذ ملتزم ومربوط بالميزان المستورد." : "مجتمع العرض التجريبي يتضمن سلسلة قيود قابلة لإعادة الأداء.", "الميزان وحده لا يثبت مجتمع القيود؛ يلزم دفتر أستاذ ملتزم ومربوط بالفترة."),
    step("adjustments", "قيود التسوية والإقفال", ["IAS 8"], allAdjustmentsPosted, `${postedAdjustments.length} قيد تسوية مرحّل.`, "توجد قيود غير مرحلة أو لم تُنشأ تسويات موثقة."),
    step("cash", "النقد والتسويات البنكية", ["IAS 7", "IFRS 9"], sourceCheck(["cash"]) && sourceReady("bankStatements"), `${categoryCounts.get("cash")} حسابًا نقديًا ومصدر التسوية البنكية متاحان.`, "وجود حسابات النقد لا يثبت المطابقة؛ يلزم كشف بنك مستقل وربط التسوية."),
    step("receivables", "الذمم وخسائر الائتمان", ["IFRS 9", "IFRS 7"], sourceCheck(["receivables"]) && sourceReady("receivablesAging"), `${categoryCounts.get("receivables")} حساب ذمم وكشف أعمار متاحان لنموذج ECL.`, "يلزم كشف أعمار الذمم وبيانات التعثر؛ رصيد الميزان وحده لا يكفي لنموذج ECL."),
    step("inventory", "المخزون والتكلفة", ["IAS 2"], sourceCheck(["inventory", "cogs"]) && sourceReady("inventoryListing"), "المخزون وتكلفة الإيراد وسجل الأصناف متاحة للاختبار.", "يلزم سجل أصناف وكميات وتكلفة/NRV؛ وجود رصيد المخزون وحده لا يكفي."),
    step("assets", "الأصول والإهلاك والهبوط", ["IAS 16", "IAS 36", "IAS 38", "IAS 40"], sourceCheck(["ppe", "intangibles", "investmentProperty"]) && sourceReady("fixedAssetRegister"), "فئات الأصول وسجل الأصول طويل الأجل متاحان.", "يلزم سجل أصول وحركة وإهلاك ومؤشرات هبوط بجانب رصيد الميزان."),
    step("liabilities", "الالتزامات والتمويل", ["IFRS 9", "IFRS 16", "IAS 37"], sourceCheck(["payables", "debt", "leaseLiabilities", "provisions"]) && sourceReady("liabilitiesSchedule"), "فئات الالتزام وجداول الاستحقاق والعقود متاحة.", "يلزم جدول التزامات واستحقاقات وعقود؛ التصنيف من الميزان نقطة بدء فقط."),
    step("revenue", "الإيراد والعقود", ["IFRS 15"], sourceCheck(["revenue", "contractLiabilities"]) && sourceReady("revenueContracts"), "حسابات الإيراد وعينة العقود متاحة للاختبار.", "يلزم مجتمع العقود والتزامات الأداء والقطع؛ إجمالي الإيراد وحده لا يكفي."),
    step("cashflows", "قائمة التدفقات النقدية", ["IAS 7"], sourceCheck(["cash"]) && sourceReady("cashFlowBridge") && Boolean(engagement.analyticsReview?.acknowledged), "جسر حركة النقد والتحليل البشري متاحان.", "يلزم جسر حركة النقد ومطابقته بالقوائم وإقرار التحليلات."),
    step("analysis", "النسب والتحليل المالي", ["ISA 520"], Boolean(engagement.analyticsReview?.acknowledged), "أقر المراجع التحليلات المسجلة.", "التحليلات لم يقرها مراجع بشري."),
    step("report", "الإصدار والاعتماد", ["ISA 700", "ISA 705"], canonicalReportReady && lockedPeriod, "اجتاز التقرير البوابات الاثنتي عشرة والفترة المقفلة تطابق فترة التقرير.", "يلزم اجتياز بوابات التقرير الاثنتي عشرة وقفل فترة التقرير نفسها؛ حالة الواجهة وحدها لا تكفي."),
  ];
}

export function buildAppliedAccountingSummary(accounts = [], engagement = {}, metrics = null) {
  const cycle = buildAccountingCycleReadiness(accounts, engagement, metrics);
  const ifrs18 = buildIfrs18Readiness(accounts, engagement);
  return {
    uniqueVideoSources: YOUTUBE_KNOWLEDGE_SUMMARY.uniqueVideos,
    cycleComplete: cycle.filter((item) => item.status === "complete").length,
    cycleTotal: cycle.length,
    ifrs18Passed: ifrs18.readinessChecks.filter((item) => item.pass).length,
    ifrs18Total: ifrs18.readinessChecks.length,
    linkedExposure: roundMoney(accounts.reduce((total, account) => total + accountExposure(account), 0)),
  };
}
