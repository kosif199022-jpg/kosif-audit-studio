const VERIFIED_AT = "2026-08-28T00:00:00.000Z";

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

export const ACC_AUDIT_ROUNDS = deepFreeze([
  { id: "R01", sequence: 1, title: "القبول والتخطيط والاستقلال", evidenceItems: 48, findings: { total: 4, resolved: 3, open: 1 } },
  { id: "R02", sequence: 2, title: "فهم المجموعة والرقابة الداخلية", evidenceItems: 65, findings: { total: 5, resolved: 4, open: 1 } },
  { id: "R03", sequence: 3, title: "تقييم المخاطر والغش", evidenceItems: 82, findings: { total: 3, resolved: 3, open: 0 } },
  { id: "R04", sequence: 4, title: "الأهمية النسبية والعينات", evidenceItems: 99, findings: { total: 6, resolved: 4, open: 2 } },
  { id: "R05", sequence: 5, title: "الإيرادات والعملاء والعقود", evidenceItems: 116, findings: { total: 4, resolved: 3, open: 1 } },
  { id: "R06", sequence: 6, title: "المخزون والتكلفة والموردون", evidenceItems: 133, findings: { total: 5, resolved: 4, open: 1 } },
  { id: "R07", sequence: 7, title: "الأصول والإيجارات والانخفاض", evidenceItems: 150, findings: { total: 3, resolved: 3, open: 0 } },
  { id: "R08", sequence: 8, title: "الأدوات المالية والعملات والضرائب", evidenceItems: 167, findings: { total: 4, resolved: 3, open: 1 } },
  { id: "R09", sequence: 9, title: "العرض والإفصاحات والاستمرارية", evidenceItems: 184, findings: { total: 2, resolved: 2, open: 0 } },
  { id: "R10", sequence: 10, title: "الإكمال ومراجعة الجودة والمسودة", evidenceItems: 201, findings: { total: 1, resolved: 1, open: 0 } },
]);

const cloudflareV2 = {
  id: "cloudflare-v2-live",
  label: "KOSIF Stable Capabilities v2 — السطح الحي",
  sourceKind: "live-surface-observation",
  verifiedAt: VERIFIED_AT,
  source: {
    publicUrl: "https://kosif-stable-capabilities-v2.kosif199022.workers.dev/",
    dashboardUrl: "https://dash.cloudflare.com/9ff3d8494afab356ecbf95a2a231a6b5/workers/services/view/kosif-stable-capabilities-v2/production",
  },
  datasetId: null,
  entityName: "محمود القصيف",
  currency: "SAR",
  accountCount: 5_000,
  auditRoundCount: 20,
  findingCount: 20,
  resolvedFindingCount: null,
  openFindingCount: null,
  evidenceCount: null,
  documentRequestCount: null,
  journalEntryCount: null,
  standardsCoverageCount: null,
  capabilityGroupCount: null,
  endpointPathCount: null,
  totalDebit: 2_544_568_750,
  materiality: 6_349_212.5,
  reportIssued: true,
  analytics: null,
  rounds: null,
  limitations: [
    "القيم رُصدت من واجهة التشغيل الحية ولم تُعد حسابياً من ملف ميزان مراجعة خام.",
    "حالة المنشأة المختارة محفوظة على مستوى أصل المتصفح، لذلك لا تمثل عقد GitHub الافتراضي.",
    "هذه نتيجة مرجعية مستقلة ولا يجوز دمج أرقامها مع v3 أو عقود GitHub.",
  ],
};

const cloudflareV3 = {
  id: "cloudflare-v3-live",
  label: "KOSIF Stable Capabilities v3 — السطح الحي",
  sourceKind: "live-surface-observation",
  verifiedAt: VERIFIED_AT,
  source: {
    publicUrl: "https://kosif-stable-capabilities-v3.kosif199022.workers.dev/",
    dashboardUrl: "https://dash.cloudflare.com/9ff3d8494afab356ecbf95a2a231a6b5/workers/services/view/kosif-stable-capabilities-v3/production",
  },
  datasetId: null,
  entityName: "شركة محمود الدسوقي القابضة للتجارة والتوزيع",
  currency: "SAR",
  accountCount: 330,
  auditRoundCount: 20,
  findingCount: 20,
  resolvedFindingCount: null,
  openFindingCount: null,
  evidenceCount: null,
  documentRequestCount: 19,
  journalEntryCount: null,
  standardsCoverageCount: null,
  capabilityGroupCount: null,
  endpointPathCount: null,
  totalDebit: 880_943_250,
  materiality: 3_057_450,
  reportIssued: true,
  analytics: {
    revenue: 305_745_000,
    cost: 169_455_000,
    otherExpenses: 114_064_500,
    profitBeforeTax: 22_225_500,
    currentRatio: 1.37,
    quickRatio: 0.93,
    grossMarginPct: 44.6,
    pretaxMarginPct: 7.3,
    benfordChiSquared: 3.5,
    duplicateCount: 35,
  },
  rounds: null,
  limitations: [
    "القيم رُصدت من واجهة التشغيل الحية ولم تُعد حسابياً من ملف ميزان مراجعة خام.",
    "رُصد تقرير مُصدّر، لكنه خلط مجموعة قديمة من 110 حسابات مع المجموعة الحالية ذات 330 حسابًا.",
    "كانت 19 من 20 جولة بحاجة إلى مستندات، وطلبات PBC المستوفاة 0 من 19، ومع ذلك ظهر التقرير صادرًا.",
    "لم يتضمن تصدير JSON سجل رقابة أو بصمات أدلة أو بوابات اعتماد قابلة للتحقق.",
    "شفرة v3 المتاحة في GitHub تعمل كمرآة تمرر الطلبات إلى v2؛ اختلاف الحالة المرصودة لا يثبت وجود محرك نتائج مستقل.",
    "هذه نتيجة مرجعية مستقلة ولا يجوز دمج أرقامها مع v2 أو عقود GitHub.",
  ],
};

const cloudflareStable = {
  id: "cloudflare-stable-live",
  label: "KOSIF Stable — السطح الحي",
  sourceKind: "live-surface-observation",
  verifiedAt: "2026-08-29T00:00:00.000Z",
  source: {
    publicUrl: "https://kosif-stable.kosif199022.workers.dev/",
  },
  datasetId: null,
  entityName: "شركة الوادي القابضة للصناعات الغذائية",
  currency: "SAR",
  accountCount: 110,
  auditRoundCount: 3,
  findingCount: 16,
  resolvedFindingCount: null,
  openFindingCount: null,
  evidenceCount: 14,
  documentRequestCount: 12,
  pbcRenderedCount: 0,
  journalEntryCount: 8,
  reclassificationCount: 4,
  standardsCoverageCount: null,
  capabilityGroupCount: null,
  endpointPathCount: null,
  totalDebit: 533_905_000,
  materiality: 1_853_000,
  reportIssued: true,
  analytics: null,
  rounds: null,
  claimedCounts: {
    collectedDocumentCount: 14,
    documentRequestCount: 12,
    journalEntryCount: 8,
    reclassificationCount: 4,
  },
  renderedCounts: {
    accountCount: 110,
    auditRoundCount: 3,
    findingCount: 16,
    pbcRequestCount: 0,
  },
  exportFormats: ["JSON", "CSV", "DOC", "PDF"],
  defects: [
    {
      id: "rendered-source-leakage",
      severity: "critical",
      summary: "تسرّبت مقاطع من شفرة JavaScript إلى سطح التطبيق المرئي.",
    },
    {
      id: "analytics-rendering-failure",
      severity: "high",
      summary: "تعطّل رسم قسم التحليلات في الرحلة الحية المرصودة.",
    },
    {
      id: "pbc-count-mismatch",
      severity: "high",
      summary: "ادعى ملخص الجولات 12 طلب مستندات (8 + 4)، بينما عرضت واجهة PBC عددًا يساوي صفرًا.",
      claimedCount: 12,
      renderedCount: 0,
    },
  ],
  limitations: [
    "القيم رُصدت من واجهة التشغيل الحية ولم تُعد حسابياً من ملف ميزان مراجعة خام.",
    "العدد 16 يمثل النتائج الظاهرة عبر الجولات الثلاث، لا عقد بيانات مُصدّرًا قابلاً لإعادة الاحتساب.",
    "العدد 14 للمستندات و12 لطلبات المستندات و8 لقيود التسوية و4 لإعادات التبويب أعداد ادعاها التقرير أو ملخص الجولات؛ حُفظت منفصلة عن الأعداد المعروضة.",
    "لم تُرصد بصمات أدلة قابلة للتحقق، لذلك لا يتضمن هذا السيناريو أي بصمات مفترضة.",
  ],
};

const githubAcc = {
  id: "github-acc-mahrousa-contract",
  label: "GitHub Acc — عقد مصر المحروسة التركيبي",
  sourceKind: "github-source-contract",
  verifiedAt: VERIFIED_AT,
  source: {
    repository: "kosif199022-jpg/Acc",
    ref: "main",
    path: "workers/kosif-stable/modules/capabilities/vendor/kosif/egypt-mahrousa-demo-v1.mjs",
  },
  datasetId: "mahrousa.synthetic.2026.1",
  entityName: "شركة مصر المحروسة القابضة والصناعات ش.م.م",
  currency: "EGP",
  accountCount: 5_000,
  auditRoundCount: 10,
  findingCount: 37,
  resolvedFindingCount: 30,
  openFindingCount: 7,
  evidenceCount: 1_245,
  documentRequestCount: null,
  journalEntryCount: null,
  standardsCoverageCount: 51,
  capabilityGroupCount: 29,
  endpointPathCount: 92,
  totalDebit: 3_899_090_362.5,
  materiality: null,
  reportIssued: false,
  analytics: null,
  rounds: ACC_AUDIT_ROUNDS,
  limitations: [
    "بيانات تركيبية للتجربة والتدريب وليست قوائم مالية أو شهادة امتثال أو تقرير مراجعة خارجي.",
    "الجولات مكتملة داخل المحاكاة فقط، وتبقى البنود المفتوحة ومراجعة الشريك مانعة للإصدار.",
    "العدد 51 يمثل مواضع معيارية في fixture، لا 51 معيارًا ساريًا؛ منها أرقام غير صادرة وبنود مستبدلة أو مستقبلية.",
    "أرقام هذا العقد لا تمثل السطحين الحيين v2 أو v3.",
  ],
};

const githubMahmoudLab = {
  id: "github-mahmoud-audit-lab",
  label: "GitHub mahmoud1990 — مختبر التدقيق 5000",
  sourceKind: "github-generated-artifact",
  verifiedAt: VERIFIED_AT,
  source: {
    repository: "kosif199022-jpg/mahmoud1990",
    ref: "main",
    paths: [
      "artifacts/eldesouky-global-5000/company.json",
      "artifacts/eldesouky-global-5000/audit-execution-report.json",
      "artifacts/eldesouky-global-5000/studio.json",
    ],
  },
  datasetId: "eldesouky-global-5000",
  entityName: "شركة محمود الدسوقي العالمية",
  currency: "SAR",
  accountCount: 5_000,
  auditRoundCount: null,
  findingCount: null,
  resolvedFindingCount: null,
  openFindingCount: null,
  evidenceCount: null,
  documentRequestCount: null,
  journalEntryCount: 1_601,
  standardsCoverageCount: null,
  capabilityGroupCount: null,
  endpointPathCount: null,
  totalDebit: 8_007_025_560,
  materiality: 12_041_264.54,
  reportIssued: null,
  analytics: {
    riskFlagCount: 167,
    anomalyCount: 185,
    benfordNed: 6.5,
    altmanZ: 0.31,
    compositeRisk: 66.9,
  },
  rounds: null,
  limitations: [
    "هذه قيم ثابتة من مخرجات مختبر GitHub وليست إعادة احتساب من بيانات التطبيق الحالي.",
    "المختبر مجموعة مستقلة عن v2 وv3 وعن عقد مصر المحروسة؛ لا تجوز مطابقة الإجماليات بينها.",
    "وجود مخرجات تحليلية لا يعني صدور رأي مراجعة أو اعتماد مهني.",
  ],
};

export const REFERENCE_SCENARIOS = deepFreeze({
  cloudflareV2,
  cloudflareV3,
  cloudflareStable,
  githubAcc,
  githubMahmoudLab,
});

export const REFERENCE_RESULTS = REFERENCE_SCENARIOS;

export const REFERENCE_RESULT_GROUPS = deepFreeze({
  cloudflareLiveSurfaces: {
    id: "cloudflare-live-surfaces",
    label: "أسطح Cloudflare الحية",
    scenarioIds: [cloudflareV2.id, cloudflareV3.id, cloudflareStable.id],
  },
  githubAccContract: {
    id: "github-acc-contract",
    label: "عقد GitHub Acc",
    scenarioIds: [githubAcc.id],
  },
  githubMahmoudAuditLab: {
    id: "github-mahmoud-audit-lab",
    label: "مختبر GitHub mahmoud1990",
    scenarioIds: [githubMahmoudLab.id],
  },
});

const scenarioAliases = deepFreeze({
  v2: "cloudflareV2",
  v3: "cloudflareV3",
  stable: "cloudflareStable",
  acc: "githubAcc",
  mahrousa: "githubAcc",
  mahmoud: "githubMahmoudLab",
  lab: "githubMahmoudLab",
  [cloudflareV2.id]: "cloudflareV2",
  [cloudflareV3.id]: "cloudflareV3",
  [cloudflareStable.id]: "cloudflareStable",
  [githubAcc.id]: "githubAcc",
  [githubMahmoudLab.id]: "githubMahmoudLab",
});

export function getReferenceScenario(id) {
  if (typeof id !== "string") return null;
  const key = Object.hasOwn(REFERENCE_SCENARIOS, id) ? id : scenarioAliases[id];
  return key ? REFERENCE_SCENARIOS[key] : null;
}

export function buildReferenceComparison(ids = Object.keys(REFERENCE_SCENARIOS)) {
  const requestedIds = Array.isArray(ids) ? ids : [ids];
  const rows = requestedIds.map(getReferenceScenario).filter(Boolean).map((scenario) => ({
    id: scenario.id,
    label: scenario.label,
    sourceKind: scenario.sourceKind,
    verifiedAt: scenario.verifiedAt,
    datasetId: scenario.datasetId,
    entityName: scenario.entityName,
    currency: scenario.currency,
    accounts: scenario.accountCount,
    rounds: scenario.auditRoundCount,
    findings: scenario.findingCount,
    resolvedFindings: scenario.resolvedFindingCount,
    openFindings: scenario.openFindingCount,
    evidence: scenario.evidenceCount,
    documentRequests: scenario.documentRequestCount,
    pbcRenderedCount: scenario.pbcRenderedCount ?? null,
    journalEntries: scenario.journalEntryCount,
    reclassifications: scenario.reclassificationCount ?? null,
    totalDebit: scenario.totalDebit,
    materiality: scenario.materiality,
    reportIssued: scenario.reportIssued,
    claimedCounts: scenario.claimedCounts ?? null,
    renderedCounts: scenario.renderedCounts ?? null,
    exportFormats: scenario.exportFormats ?? null,
    defects: scenario.defects ?? null,
    limitations: scenario.limitations,
  }));
  return deepFreeze(rows);
}
