import { areaProfiles, bulkReviewMappings, createStandardMappings, standardCatalog } from "./standards.js";
import { createAuditRounds, createRoundEvidence, createRoundFindings } from "./audit-rounds.js";
import { buildAnalyticalReview } from "./analytics.js";
import { buildDatasetCommitment } from "./governance.js";
import { buildAdjustmentBridge } from "./reporting.js";

export const STORAGE_KEY = "kosif-audit-studio:v7";

const branches = [
  "الرياض",
  "جدة",
  "الدمام",
  "مكة",
  "المدينة",
  "القصيم",
  "أبها",
  "تبوك",
];

const debitFamilies = [
  ["cash", "11"], ["receivables", "12"], ["inventory", "13"], ["ppe", "15"],
  ["rightOfUse", "16"], ["intangibles", "17"], ["investmentProperty", "18"],
  ["cogs", "51"], ["expenses", "61"], ["financeCosts", "62"],
].map(([key, prefix]) => ({ key, prefix, ...areaProfiles[key] }));

const creditFamilies = [
  ["payables", "21"], ["contractLiabilities", "22"], ["leaseLiabilities", "23"],
  ["debt", "24"], ["provisions", "25"], ["employeeBenefits", "26"], ["tax", "27"],
  ["equity", "31"], ["revenue", "41"], ["otherIncome", "42"],
].map(([key, prefix]) => ({ key, prefix, ...areaProfiles[key] }));

const profileByPrefix = new Map(
  [...debitFamilies, ...creditFamilies].map((profile) => [profile.prefix, profile]),
);

const accountNameHints = [
  ["cash", /نقد|بنك|صندوق|وديعة/],
  ["receivables", /ذمم مدينة|عميل|عملاء|مدينون/],
  ["inventory", /مخزون|بضاعة|مواد خام/],
  ["ppe", /معدات|آلات|ممتلكات|أصل ثابت|سيارات/],
  ["rightOfUse", /حق الاستخدام/],
  ["intangibles", /غير ملموس|برنامج|برمجيات|ترخيص/],
  ["investmentProperty", /عقار استثماري/],
  ["payables", /ذمم دائنة|مورد|موردون|دائنون/],
  ["contractLiabilities", /التزام عقد|إيراد مؤجل/],
  ["leaseLiabilities", /التزام إيجار/],
  ["debt", /قرض|تمويل|اقتراض/],
  ["provisions", /مخصص|مطالبة|دعوى/],
  ["employeeBenefits", /منافع|نهاية خدمة|موظف/],
  ["tax", /زكاة|ضريبة/],
  ["equity", /رأس المال|حقوق الملكية|أرباح مبقاة|احتياطي/],
  ["revenue", /إيراد عقود|مبيعات|إيرادات تشغيلية/],
  ["otherIncome", /إيراد آخر|مكسب/],
  ["cogs", /تكلفة الإيراد|تكلفة المبيعات/],
  ["expenses", /مصروف|تكلفة تشغيلية/],
  ["financeCosts", /تكلفة تمويل|فوائد تمويل/],
];

const categoryHintFromName = (name) => accountNameHints.find(([, pattern]) => pattern.test(String(name || "")))?.[0] || null;

const riskFor = (amount, index, inherentRisk) => {
  if (inherentRisk === "high" && (amount >= 420_000 || index % 17 === 0)) return "high";
  if (amount >= 760_000 || index % 47 === 0) return "high";
  if (amount >= 330_000 || index % 13 === 0) return "medium";
  return "low";
};

const importedRiskFor = (amount, inherentRisk, { classified, conflict } = {}) => {
  if (!classified || conflict) return "high";
  if (inherentRisk === "high" && amount >= 420_000) return "high";
  if (amount >= 760_000) return "high";
  if (inherentRisk === "high" || amount >= 330_000) return "medium";
  return "low";
};

const normalizeCurrencyCode = (value, fallback = "SAR") => {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
};

const normalizeMonetaryItem = (value) => (
  value === true
  || value === 1
  || ["1", "true", "yes", "نعم", "نقدي"].includes(String(value || "").trim().toLowerCase())
);

const normalizeClosingRate = (value) => {
  if (value == null || value === "") return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};

const foreignAccountMetadataByPair = new Map([
  [40, { currency: "USD", functionalCurrency: "SAR", monetaryItem: true, closingRate: 3.75 }],
  [81, { currency: "EUR", functionalCurrency: "SAR", monetaryItem: true, closingRate: 4.08 }],
  [160, { currency: "USD", functionalCurrency: "SAR", monetaryItem: true, closingRate: 3.75 }],
  [241, { currency: "EUR", functionalCurrency: "SAR", monetaryItem: true, closingRate: 4.08 }],
]);

function createAccount({
  id,
  code,
  name,
  category,
  profile,
  debit,
  credit,
  risk,
  mapped,
  currency = "SAR",
  functionalCurrency = "SAR",
  monetaryItem = false,
  closingRate = null,
}) {
  const amount = debit || credit;
  const accountCurrency = normalizeCurrencyCode(currency);
  const normalizedFunctionalCurrency = normalizeCurrencyCode(functionalCurrency);
  return {
    id,
    code,
    name,
    category,
    areaLabel: profile.label,
    nature: profile.nature,
    standard: profile.accountingStandards[0],
    suggestedStandardIds: [...profile.accountingStandards],
    standards: [...profile.accountingStandards],
    standardLinks: (profile.standardLinks || []).map((link) => ({ ...link })),
    auditStandards: [...profile.auditStandards],
    assertions: [...profile.assertions],
    risks: [...profile.risks],
    procedures: [...profile.procedures],
    evidence: [...profile.evidence],
    inherentRisk: profile.inherentRisk,
    debit,
    credit,
    amount,
    debitMinor: String(Math.round(debit * 100)),
    creditMinor: String(Math.round(credit * 100)),
    amountMinor: String(Math.round(amount * 100)),
    currency: accountCurrency,
    functionalCurrency: normalizedFunctionalCurrency,
    monetaryItem: normalizeMonetaryItem(monetaryItem),
    closingRate: normalizeClosingRate(closingRate),
    foreignCurrency: accountCurrency !== normalizedFunctionalCurrency,
    balanceCurrency: normalizedFunctionalCurrency,
    amountBasis: "functional-currency-equivalent",
    exponent: 2,
    risk,
    mapped,
  };
}

export function createImportedAccount(row, index = 0) {
  const code = String(row?.code || `IMPORT-${index + 1}`).trim();
  const name = String(row?.name || `حساب مستورد ${index + 1}`).trim();
  const debitMinor = BigInt(row?.debitMinor || 0);
  const creditMinor = BigInt(row?.creditMinor || 0);
  const debit = Number(debitMinor) / 100;
  const credit = Number(creditMinor) / 100;
  const inferred = profileByPrefix.get(code.slice(0, 2));
  const nameHint = categoryHintFromName(name);
  const prefixConflictsWithName = Boolean(inferred && nameHint && nameHint !== inferred.key);
  const fallbackKey = debitMinor > 0n ? "expenses" : "otherIncome";
  const profile = inferred || { key: fallbackKey, prefix: code.slice(0, 2), ...areaProfiles[fallbackKey] };
  const currency = normalizeCurrencyCode(row?.currency);
  const functionalCurrency = normalizeCurrencyCode(row?.functionalCurrency);
  const importedAmount = Number(debitMinor + creditMinor) / 100;
  const account = createAccount({
    id: `I-${String(index + 1).padStart(5, "0")}`,
    code,
    name,
    category: profile.key,
    profile,
    debit,
    credit,
    risk: importedRiskFor(importedAmount, profile.inherentRisk, {
      classified: Boolean(inferred),
      conflict: prefixConflictsWithName,
    }),
    mapped: Boolean(inferred && !prefixConflictsWithName),
    currency,
    functionalCurrency,
    monetaryItem: normalizeMonetaryItem(row?.monetaryItem),
    closingRate: normalizeClosingRate(row?.closingRate),
  });
  return {
    ...account,
    classificationSource: inferred ? "account-code-prefix" : "unclassified-fallback",
    classificationConflict: prefixConflictsWithName,
    classificationHint: nameHint,
    mappingWarning: prefixConflictsWithName
      ? `اسم الحساب يشير إلى ${areaProfiles[nameHint]?.label || nameHint} بينما بادئة الرمز تشير إلى ${inferred.label}.`
      : !inferred ? "بادئة الحساب غير معروفة؛ التصنيف الحالي نقطة بدء ولا يجوز اعتماده جماعيًا." : null,
    debitMinor: String(debitMinor),
    creditMinor: String(creditMinor),
    amountMinor: String(debitMinor + creditMinor),
  };
}

export function generateTrialBalance() {
  const accounts = [];

  for (let pair = 0; pair < 2_500; pair += 1) {
    const amount = Number((1_250 + ((pair * 7_919) % 890_000) + (pair % 9) * 117.35).toFixed(2));
    const debitFamily = debitFamilies[pair % debitFamilies.length];
    const creditFamily = creditFamilies[pair % creditFamilies.length];
    const branch = branches[pair % branches.length];
    const suffix = String(pair + 1).padStart(4, "0");
    const serial = Math.floor(pair / branches.length) + 1;
    const debitRisk = riskFor(amount, pair, debitFamily.inherentRisk);
    const creditRisk = pair % 19 === 0 ? "high" : riskFor(amount, pair, creditFamily.inherentRisk);
    const foreignMetadata = foreignAccountMetadataByPair.get(pair);
    const debitMonetaryItem = ["cash", "receivables"].includes(debitFamily.key);

    accounts.push(createAccount({
      id: `D-${suffix}`,
      code: `${debitFamily.prefix}${suffix}`,
      name: `${debitFamily.label} — ${branch} ${serial}${foreignMetadata ? ` · حساب ${foreignMetadata.currency}` : ""}`,
      category: debitFamily.key,
      profile: debitFamily,
      debit: amount,
      credit: 0,
      risk: debitRisk,
      mapped: true,
      monetaryItem: debitMonetaryItem,
      ...(foreignMetadata || {}),
    }));
    accounts.push(createAccount({ id: `C-${suffix}`, code: `${creditFamily.prefix}${suffix}`, name: `${creditFamily.label} — ${branch} ${serial}`, category: creditFamily.key, profile: creditFamily, debit: 0, credit: amount, risk: creditRisk, mapped: pair % 97 !== 0 }));
  }

  return accounts;
}

export const categoryOptions = [
  { value: "all", label: "كل التصنيفات" },
  ...[...debitFamilies, ...creditFamilies].map(({ key, label }) => ({ value: key, label })),
];

const baseEngagement = {
  version: 3,
  entity: {
    name: "شركة محمود القصيف القابضة",
    period: "السنة المنتهية في 31 ديسمبر 2025م",
    currency: "ريال سعودي",
    activity: "التقنية والخدمات المهنية",
    framework: "المعايير الدولية كما اعتمدتها الهيئة",
    entityType: "شركة غير مدرجة",
  },
  acceptance: {
    independence: true,
    conflicts: true,
    integrity: true,
    terms: true,
    approvedAt: "2026-08-22T10:30:00.000Z",
  },
  rounds: createAuditRounds(),
  evidence: createRoundEvidence(),
  findings: createRoundFindings(),
  adjustments: [
    { id: "AJE-003", title: "مخصص خسائر ائتمانية", amount: 684_250, status: "pending", debitCategory: "expenses", creditCategory: "receivables" },
    { id: "AJE-002", title: "تسوية قطع الإيراد", amount: 412_800, status: "pending", debitCategory: "revenue", creditCategory: "contractLiabilities" },
    { id: "AJE-001", title: "فرق جرد المخزون", amount: 185_750, status: "pending", debitCategory: "cogs", creditCategory: "inventory" },
  ],
  standardMappings: {
    schemaVersion: 1,
    overrides: {},
    review: { confirmedAt: null, reviewer: "مدير المراجعة", rationale: null },
  },
  mappingConfirmed: false,
  materialityPolicy: {
    id: "KOSIF-MAT-075",
    basis: "revenue",
    percentage: 0.75,
    performancePercentage: 75,
    omRateBp: 75,
    pmRateBp: 7500,
    cttRateBp: 500,
    rationaleAr: "اعتمدت الإيرادات معيارًا أوليًا لثباتها وارتباطها بحجم نشاط المنشأة خلال الفترة.",
    version: "2026.1",
    approvedBy: "شريك الارتباط",
  },
  opinionAssessment: {
    basis: "none",
    scopeLimitationIsMaterial: false,
    scopeLimitationRationaleAr: "",
    isPervasive: false,
    pervasivenessRationaleAr: "لا توجد تحريفات غير مصححة أو قيود نطاق جوهرية في سيناريو العرض المكتمل.",
  },
  analyticsReview: { acknowledged: false, acknowledgedAt: null, reviewer: null },
  periodLocks: [
    { id: "2025-12", label: "ديسمبر 2025", status: "soft_closed", preparedBy: "مدير الحسابات", approvedBy: null, reason: "بانتظار اعتماد شريك الارتباط", lockedAt: null },
    { id: "2026-01", label: "يناير 2026", status: "open", preparedBy: null, approvedBy: null, reason: "فترة متابعة مفتوحة", lockedAt: null },
  ],
  auditTrail: [
    { id: "LOG-004", action: "إنشاء لقطة التحليلات", actor: "محرك KOSIF", at: "2026-08-27T11:45:00.000Z", detail: "حُفظت النسب وتحليل الرقم الأول مع الإصدار." },
    { id: "LOG-003", action: "استلام دليل", actor: "فريق المخازن", at: "2026-08-26T14:20:00.000Z", detail: "رُبط محضر الجرد بالطلب PBC-006 والجولة R-004." },
    { id: "LOG-002", action: "إقفال أولي للفترة", actor: "مدير الحسابات", at: "2026-08-25T16:10:00.000Z", detail: "انتقلت الفترة 2025-12 إلى الإقفال الأولي." },
    { id: "LOG-001", action: "قبول الارتباط", actor: "شريك الارتباط", at: "2026-08-22T10:30:00.000Z", detail: "اكتملت فحوص الاستقلال والتعارض والنزاهة والشروط." },
  ],
  council: {
    engineVersion: "KOSIF-COUNCIL-v4",
    rounds: [],
    humanDecision: { status: "pending", reviewer: "شريك الارتباط", rationale: "", decidedAt: null },
  },
  humanApproval: false,
  humanApprovedAt: null,
  report: {
    status: "draft",
    opinion: "لم يُحدد — مسودة محكومة",
    lastUpdated: "27 أغسطس 2026 · 11:45",
  },
};

export function createCompleteDemoEngagement(accounts = generateTrialBalance()) {
  const mappingReviewedAt = "2026-08-25T10:00:00.000Z";
  const standardMappings = bulkReviewMappings(accounts, createStandardMappings(), {
    reviewer: "مدير المراجعة",
    rationale: "فُحصت قائمة الاستثناءات وربطت المقترحات بطبيعة الحساب والتأكيدات والمخاطر والأدلة المتاحة.",
    reviewedAt: mappingReviewedAt,
    source: "complete-demo-review",
  });
  const roundStart = Date.parse("2026-08-26T07:00:00.000Z");
  const roundCompletedAt = (index) => new Date(roundStart + (index * 120 * 60 * 1_000)).toISOString();
  const completedRounds = baseEngagement.rounds.map((round, index) => ({
    ...round,
    status: "complete",
    progress: 100,
    startedAt: new Date(Date.parse(roundCompletedAt(index)) - (90 * 60 * 1_000)).toISOString(),
    completedAt: roundCompletedAt(index),
    conclusion: `${round.summary} اكتملت الإجراءات وربطت النتيجة بالدليل والمعايير، وأُقفل سجل الجولة.`,
    result: {
      findingIds: [...(round.findingIds || [])],
      evidenceIds: [...(round.evidenceIds || [])],
      standards: [...(round.standards || [])],
      disposition: "evidence-sufficient",
    },
  }));
  const approvedEvidence = baseEngagement.evidence.map((item, index) => ({
    ...item,
    status: "approved",
    fileSize: 2_048 + (index * 37),
    mediaType: "application/pdf",
    attachedAt: new Date(Date.parse(roundCompletedAt(index)) - (60 * 60 * 1_000)).toISOString(),
    attachmentStorage: "synthetic-fixture-metadata",
    reviewedAt: new Date(Date.parse(roundCompletedAt(index)) - (45 * 60 * 1_000)).toISOString(),
    verifiedAt: new Date(Date.parse(roundCompletedAt(index)) - (45 * 60 * 1_000)).toISOString(),
    verificationMethod: "synthetic-fixture-digest",
    reviewedBy: index % 2 ? "مدير المراجعة" : "رئيس فريق الاختبارات",
    conclusion: `الدليل كافٍ ومناسب للإجراء المرتبط بالجولة ${item.roundId} ضمن نطاق بيانات العرض الاصطناعية.`,
  }));
  const closedFindings = baseEngagement.findings.map((item, index) => ({
    ...item,
    status: "closed",
    closedAt: new Date(Date.parse(roundCompletedAt(index)) - (20 * 60 * 1_000)).toISOString(),
    closedBy: item.severity === "high" ? "مدير المراجعة" : "رئيس الفريق",
    resolution: `${item.recommendation} تم التحقق من التنفيذ وربط الاستنتاج بالدليل ${item.evidenceIds?.[0] || "—"}.`,
  }));
  const adjustmentAccounts = [
    { debit: "expenses", credit: "receivables" },
    { debit: "revenue", credit: "contractLiabilities" },
    { debit: "cogs", credit: "inventory" },
  ];
  const acceptedAdjustments = baseEngagement.adjustments.map((item, index) => ({
    ...item,
    status: "accepted",
    amountMinor: String(Math.round(item.amount * 100)),
    reviewedAt: `2026-08-28T${String(10 + index).padStart(2, "0")}:15:00.000Z`,
    reviewedBy: "شريك الارتباط",
    journalReference: `JE-AUD-${String(index + 1).padStart(3, "0")}`,
    postedAt: `2026-08-28T${String(10 + index).padStart(2, "0")}:20:00.000Z`,
    currency: "SAR",
    lines: (() => {
      const plan = adjustmentAccounts[index];
      const pickLargest = (category) => accounts
        .filter((account) => account.category === category)
        .reduce((largest, account) => !largest || BigInt(account.amountMinor) > BigInt(largest.amountMinor) ? account : largest, null);
      const debitAccount = pickLargest(plan.debit);
      const creditAccount = pickLargest(plan.credit);
      const amountMinor = String(Math.round(item.amount * 100));
      return [
        { accountId: debitAccount?.id || null, code: debitAccount?.code || plan.debit, name: debitAccount?.name || plan.debit, debitMinor: amountMinor, creditMinor: "0" },
        { accountId: creditAccount?.id || null, code: creditAccount?.code || plan.credit, name: creditAccount?.name || plan.credit, debitMinor: "0", creditMinor: amountMinor },
      ];
    })(),
  }));
  const analyticalReview = buildAnalyticalReview(
    buildAdjustmentBridge(accounts, acceptedAdjustments).adjustedAccounts,
  );
  const datasetCommitment = buildDatasetCommitment(accounts, {
    period: baseEngagement.entity.period,
    currency: "SAR",
    committedAt: "2026-08-22T10:00:00.000Z",
  });

  return {
    ...baseEngagement,
    version: 7,
    demoDatasetVersion: "KOSIF-DEMO-5000-v7",
    demo: {
      id: "KOSIF-DEMO-5000-v7",
      label: "ملف ارتباط تجريبي شامل · 20 جولة",
      accountCount: accounts.length,
      areaCount: Object.keys(areaProfiles).length,
      standardCount: standardCatalog.length,
      roundCount: completedRounds.length,
      evidenceCount: approvedEvidence.length,
      findingCount: closedFindings.length,
      adjustmentCount: acceptedAdjustments.length,
      generatedAt: "2026-08-28T15:00:00.000Z",
      synthetic: true,
      commitment: datasetCommitment,
    },
    rounds: completedRounds,
    evidence: approvedEvidence,
    findings: closedFindings,
    adjustments: acceptedAdjustments,
    standardMappings: {
      ...standardMappings,
      review: {
        confirmedAt: "2026-08-25T10:00:00.000Z",
        reviewer: "مدير المراجعة",
        rationale: "اعتماد الخريطة بعد مراجعة 26 استثناءً وتوثيق أساس كل قرار.",
      },
    },
    mappingConfirmed: true,
    materialityPolicy: {
      ...baseEngagement.materialityPolicy,
      approvedAt: "2026-08-22T11:00:00.000Z",
    },
    analyticsReview: {
      acknowledged: true,
      acknowledgedAt: "2026-08-27T22:00:00.000Z",
      reviewer: "مدير المراجعة",
      conclusion: "تمت مراجعة النسب والتركيز وخمس إشارات بنفورد والهامش التشغيلي السالب، وربطت الإشارات بالإجراءات المنفذة دون اعتبارها دليل غش منفردًا.",
      reviewedSignals: [
        ...analyticalReview.benford.filter((item) => item.flagged).map((item) => `BENFORD-${item.digit}`),
        ...(analyticalReview.ratios.operatingMarginPct < 0 ? ["OPERATING-MARGIN-NEGATIVE"] : []),
      ],
      engine: "KOSIF-ANALYTICS-v1",
      snapshot: {
        accountCount: accounts.length,
        areas: Object.keys(areaProfiles).length,
        totalExposure: analyticalReview.totalExposure,
        benfordFlagDigits: analyticalReview.benford.filter((item) => item.flagged).map((item) => item.digit),
        ratios: analyticalReview.ratios,
        status: "reviewed",
      },
    },
    periodLocks: [
      { id: "2025-12", label: "ديسمبر 2025", status: "locked", preparedBy: "مدير الحسابات", approvedBy: "شريك الارتباط", reason: "اكتملت التسويات والأدلة ومراجعة الجودة ضمن سيناريو العرض الشامل.", lockedAt: "2026-08-28T13:00:00.000Z" },
      { id: "2026-01", label: "يناير 2026", status: "open", preparedBy: null, approvedBy: null, reason: "فترة متابعة مفتوحة بعد تاريخ التقرير.", lockedAt: null },
    ],
    auditTrail: [
      { id: "LOG-012", action: "اعتماد التقرير", actor: "شريك الارتباط", at: "2026-08-28T15:00:00.000Z", detail: "اكتملت بوابات الإصدار بعد جميع الجولات والأدلة والتسويات، واختير رأي غير معدل لبيانات العرض." },
      { id: "LOG-011", action: "اعتماد خطة المجلس", actor: "شريك الارتباط", at: "2026-08-28T14:00:00.000Z", detail: "اعتماد خطة المتابعة بعد إقفال فجوات الأدلة؛ لا يمثل ذلك رأيًا آليًا." },
      { id: "LOG-010", action: "قفل الفترة المالية", actor: "شريك الارتباط", at: "2026-08-28T13:00:00.000Z", detail: "قُفلت 2025-12 بقاعدة الشخصين بعد ترحيل التسويات الثلاث." },
      { id: "LOG-009", action: "ترحيل قيود التسوية", actor: "شريك الارتباط", at: "2026-08-28T12:20:00.000Z", detail: "قُبلت القيود AJE-001 إلى AJE-003 ورُبطت بقيود JE-AUD-001 إلى JE-AUD-003 ثنائية القيد." },
      { id: "LOG-008", action: "مراجعة التحليلات", actor: "مدير المراجعة", at: "2026-08-27T22:00:00.000Z", detail: "وُثقت مراجعة إشارات بنفورد والهامش التشغيلي السالب وربطت بإجراءات الجولات." },
      { id: "LOG-007", action: "إقفال الجولة النهائية", actor: "شريك الارتباط", at: "2026-08-27T21:00:00.000Z", detail: "R-020 · اكتملت جولة تكوين الرأي والتقرير بعد ربط F-020 وPBC-020." },
      { id: "LOG-006", action: "إغلاق جميع النتائج", actor: "مدير المراجعة", at: "2026-08-27T20:40:00.000Z", detail: "أُغلقت النتائج العشرون بعد تنفيذ الإجراءات الإضافية وربط الأدلة." },
      { id: "LOG-005", action: "اعتماد حزم الأدلة", actor: "رئيس فريق الاختبارات", at: "2026-08-27T20:15:00.000Z", detail: "اكتملت طلبات PBC-001 إلى PBC-020 وربطت بالجولات والتأكيدات والنتائج." },
      { id: "LOG-004", action: "اعتماد خريطة المعايير", actor: "مدير المراجعة", at: mappingReviewedAt, detail: "اكتمل ربط 5,000 حساب، بما فيها 26 استثناءً راجعها الإنسان." },
      { id: "LOG-003", action: "اعتماد الأهمية النسبية", actor: "شريك الارتباط", at: "2026-08-22T11:00:00.000Z", detail: "اعتمدت سياسة الأهمية النسبية وأهمية التنفيذ لسيناريو العرض." },
      { id: "LOG-002", action: "قبول الارتباط", actor: "شريك الارتباط", at: "2026-08-22T10:30:00.000Z", detail: "اكتملت فحوص الاستقلال والتعارض والنزاهة والشروط." },
      { id: "LOG-001", action: "إنشاء بيانات العرض", actor: "محرك KOSIF", at: "2026-08-22T10:00:00.000Z", detail: "أُنشئ مجتمع اصطناعي متوازن من 5,000 حساب مع وسم المصدر والإصدار." },
    ],
    council: {
      engineVersion: "KOSIF-COUNCIL-v4",
      rounds: [
        {
          id: "CR-002",
          generatedAt: "2026-08-28T13:45:00.000Z",
          engineVersion: "KOSIF-COUNCIL-v4",
          consensus: { status: "clear", high: 0, medium: 0, low: 4, recommendation: "جاهز للعرض على المراجع البشري بعد اكتمال الأدلة والتسويات." },
          advisorResults: [
            { id: "data-integrity", severity: "low", verdict: "السكان متوازنة وفريدة", refs: ["TB", "JE", "LOG"] },
            { id: "technical", severity: "low", verdict: "اكتملت خريطة المعايير", refs: ["MAP", "IAS 1", "IAS 8", "ISA 315"] },
            { id: "risk-evidence", severity: "low", verdict: "أُغلقت فجوات الأدلة", refs: ["PBC-001", "PBC-020"] },
            { id: "completion", severity: "low", verdict: "الجولات والتسويات مكتملة", refs: ["R-020", "AJE-003"] },
          ],
          population: accounts.length,
          sampleSize: 36,
          status: "complete",
        },
        {
          id: "CR-001",
          generatedAt: "2026-08-27T18:30:00.000Z",
          engineVersion: "KOSIF-COUNCIL-v4",
          consensus: { status: "action_required", high: 2, medium: 1, low: 1, recommendation: "استكمال المصادقات والتسويات قبل الإقفال." },
          advisorResults: [
            { id: "data-integrity", severity: "low", verdict: "السكان متوازنة", refs: ["TB"] },
            { id: "technical", severity: "medium", verdict: "26 قرار ربط يحتاج مراجعة", refs: ["MAP"] },
            { id: "risk-evidence", severity: "high", verdict: "فجوات أدلة مرتفعة", refs: ["PBC-019", "PBC-020"] },
            { id: "completion", severity: "high", verdict: "جولتان وتسوية معلقة", refs: ["R-019", "R-020", "AJE-003"] },
          ],
          population: accounts.length,
          sampleSize: 36,
          status: "complete",
        },
      ],
      humanDecision: {
        status: "approved",
        reviewer: "شريك الارتباط",
        rationale: "راجعت آراء المقاعد وفجوات الجولة الأولى، وتحققت من إغلاقها في الجولة الثانية قبل اعتماد خطة الإقفال.",
        decidedAt: "2026-08-28T14:00:00.000Z",
      },
    },
    humanApproval: true,
    humanApprovedAt: "2026-08-28T15:00:00.000Z",
    report: {
      status: "ready",
      opinion: "رأي غير معدل — جاهز للإصدار",
      lastUpdated: "28 أغسطس 2026 · 15:00",
    },
  };
}

export function createFreshEngagement(previous = baseEngagement, source = {}, changedAt = new Date().toISOString()) {
  const fresh = JSON.parse(JSON.stringify(baseEngagement));
  const sourceLabel = String(source?.label || "ميزان مراجعة مستورد");

  return {
    ...fresh,
    version: 7,
    demoDatasetVersion: "KOSIF-DEMO-5000-v7",
    demo: null,
    sourceDataset: {
      source: "import",
      label: sourceLabel,
      rowCount: Number(source?.rowCount || 0),
      importedAt: source?.importedAt || source?.committedAt || changedAt,
      committedAt: source?.committedAt || source?.importedAt || changedAt,
      schemaVersion: Number(source?.schemaVersion || 1),
      datasetId: String(source?.datasetId || ""),
      sha256: String(source?.sha256 || ""),
      period: String(source?.period || previous?.entity?.period || fresh.entity.period),
      currency: String(source?.currency || "SAR"),
      warnings: Number(source?.warnings || 0),
      sessionOnly: true,
    },
    entity: { ...fresh.entity, ...(previous?.entity || {}) },
    acceptance: {
      independence: false,
      conflicts: false,
      integrity: false,
      terms: false,
      approvedAt: null,
    },
    materialityPolicy: {
      ...fresh.materialityPolicy,
      ...(previous?.materialityPolicy || {}),
      approvedBy: null,
      approvedAt: null,
    },
    rounds: fresh.rounds.map((round, index) => ({
      ...round,
      status: index === 0 ? "active" : "planned",
      progress: index === 0 ? 8 : 0,
      startedAt: index === 0 ? changedAt : null,
      completedAt: null,
      conclusion: null,
      result: null,
    })),
    evidence: fresh.evidence.map((item) => ({
      ...item,
      status: "pending",
      version: 1,
      fileName: null,
      fileSize: null,
      mediaType: null,
      hash: null,
      hashInput: null,
      attachedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      conclusion: null,
      attachmentStorage: null,
    })),
    findings: fresh.findings.map((item) => ({
      ...item,
      status: "open",
      closedAt: null,
      closedBy: null,
      resolution: null,
    })),
    adjustments: fresh.adjustments.map((item) => ({
      ...item,
      status: "pending",
      amountMinor: String(Math.round(Number(item.amount || 0) * 100)),
      reviewedAt: null,
      reviewedBy: null,
      journalReference: null,
      postedAt: null,
      lines: [],
    })),
    standardMappings: createStandardMappings(),
    mappingConfirmed: false,
    analyticsReview: { acknowledged: false, acknowledgedAt: null, reviewer: null, conclusion: null, reviewedSignals: [], snapshot: null },
    periodLocks: [
      { id: "2025-12", label: "ديسمبر 2025", status: "soft_closed", preparedBy: "مدير الحسابات", approvedBy: null, reason: "أعيد فتح الفترة بعد اعتماد لقطة بيانات جديدة.", lockedAt: null },
      { id: "2026-01", label: "يناير 2026", status: "open", preparedBy: null, approvedBy: null, reason: "فترة متابعة مفتوحة", lockedAt: null },
    ],
    auditTrail: [
      { id: `LOG-${Date.parse(changedAt) || Date.now()}`, action: "اعتماد لقطة بيانات", actor: "مدير المراجعة", at: changedAt, detail: `${sourceLabel} · ${Number(source?.rowCount || 0)} حسابًا · أُعيد فتح الجولات والأدلة والنتائج والتسويات والبوابات لمنع وراثة نتائج سابقة.` },
    ],
    council: {
      engineVersion: "KOSIF-COUNCIL-v4",
      rounds: [],
      humanDecision: { status: "pending", reviewer: "شريك الارتباط", rationale: "", decidedAt: null },
    },
    opinionAssessment: {
      basis: "misstatement",
      scopeLimitationIsMaterial: false,
      scopeLimitationRationaleAr: "",
      isPervasive: false,
      pervasivenessRationaleAr: "",
    },
    humanApproval: false,
    humanApprovedAt: null,
    report: {
      status: "draft",
      opinion: "لم يُحدد — مسودة محكومة",
      lastUpdated: changedAt,
    },
  };
}

export const initialEngagement = createCompleteDemoEngagement();

export const navItems = [
  { id: "overview", label: "نظرة عامة" },
  { id: "data-intake", label: "استيراد وتحضير البيانات" },
  { id: "trial-balance", label: "ميزان المراجعة" },
  { id: "traceability", label: "رسم الإسناد" },
  { id: "standards", label: "مركز المعايير" },
  { id: "applied", label: "مختبر التطبيق المحاسبي" },
  { id: "analytics", label: "التحليلات المالية" },
  { id: "integrity", label: "الدفتر والرقابة" },
  { id: "council", label: "مجلس المراجعين الذكي" },
  { id: "risk", label: "المخاطر والمعايير" },
  { id: "rounds", label: "جولات المراجعة" },
  { id: "evidence", label: "طلبات الأدلة" },
  { id: "reviewer-workspace", label: "مساحة المراجع" },
  { id: "results", label: "مركز النتائج" },
  { id: "reports", label: "المخرجات" },
  { id: "settings", label: "إعداد الارتباط" },
];

export const statusLabels = {
  pending: "بانتظار الاستلام",
  review: "قيد الفحص",
  received: "مستلم",
  approved: "معتمد",
  active: "قيد التنفيذ",
  complete: "مكتمل",
  open: "مفتوح",
  closed: "مغلق",
  draft: "مسودة",
  accepted: "مقبول",
  planned: "مخطط",
  soft_closed: "إقفال أولي",
  locked: "مقفل",
  open_period: "مفتوح",
};
