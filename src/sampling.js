// معاينة وحدة النقد (MUS/PPS) وفق ISA 530.
//
// المحرك الحالي `buildRiskSample` اختيار حكمي: حجم ثابت (36)، بلا اشتقاق من
// الأهمية النسبية، وبلا إسقاط للأخطاء على المجتمع. ISA 530 فقرة 14 تُلزم
// بإسقاط التحريفات المكتشفة على المجتمع، وفقرة 15 بتقييم النتيجة. هذا الملف
// يغطي الدورة كاملة بحساب صحيح بالكامل (BigInt + نقاط أساس) وبذرة قابلة
// لإعادة الإنتاج، فلا يدخل أي عدد عائم مسار القرار.

import { sha256HexSync } from "./governance.js";
import { absMinor, resolveAccountMinor, resolveMinor } from "./minor-units.js";

export const SAMPLING_ENGINE_VERSION = "KOSIF-MUS-v2";

/** معاملات موثوقية بواسون ×100 (تراكمية حسب عدد التحريفات المتوقع اكتشافها). */
// One-sided Poisson limits: solve P(X <= n | lambda) = 1 - confidence.
// Rounded upward to 0.01; tables support at most ten representative findings.
const POISSON_FACTORS = Object.freeze({
  99: [461, 664, 841, 1005, 1161, 1311, 1458, 1600, 1741, 1879, 2015],
  95: [300, 475, 630, 776, 916, 1052, 1185, 1315, 1444, 1571, 1697],
  90: [231, 389, 533, 669, 800, 928, 1054, 1178, 1300, 1421, 1541],
  85: [190, 338, 473, 602, 727, 850, 971, 1090, 1208, 1325, 1442],
  80: [161, 300, 428, 552, 673, 791, 908, 1024, 1138, 1252, 1366],
  75: [139, 270, 393, 511, 628, 743, 856, 969, 1081, 1192, 1302],
  70: [121, 244, 362, 477, 590, 701, 812, 921, 1031, 1139, 1247],
  50: [70, 168, 268, 368, 468, 568, 667, 767, 867, 967, 1067],
});

/** معاملات التوسعة ×100 عند وجود تحريف متوقع. */
const EXPANSION_FACTORS = Object.freeze({ 99: 190, 95: 160, 90: 150, 85: 140, 80: 130, 75: 125, 70: 120, 50: 100 });

const TAINT_SCALE = 1_000_000n; // دقة التلوث: جزء من مليون

export const SUPPORTED_CONFIDENCE = Object.freeze(
  Object.keys(POISSON_FACTORS).map(Number).sort((a, b) => a - b),
);

function mulDivFloor(amount, multiplier, divisor) {
  if (divisor === 0n) throw new RangeError("divisor cannot be zero");
  const product = amount * multiplier;
  let quotient = product / divisor;
  if (product % divisor !== 0n && ((product < 0n) !== (divisor < 0n))) quotient -= 1n;
  return quotient;
}

function ceilDiv(numerator, divisor) {
  if (divisor <= 0n) throw new RangeError("divisor must be positive");
  return numerator <= 0n ? 0n : (numerator + divisor - 1n) / divisor;
}

function reliabilityFactor(confidence, misstatementCount) {
  const table = POISSON_FACTORS[confidence];
  if (!table) throw new RangeError(`unsupported confidence level ${confidence}`);
  if (misstatementCount >= table.length) throw new RangeError("more than ten representative findings require expanded procedures");
  return BigInt(table[misstatementCount]);
}

/** بذرة حتمية: بداية عشوائية مشتقة من بصمة المدخلات، لا من ساعة النظام. */
export function deterministicStart(seed, interval) {
  if (interval <= 0n) return 0n;
  const digest = sha256HexSync(`${SAMPLING_ENGINE_VERSION}:${seed}`);
  return BigInt(`0x${digest.slice(0, 24)}`) % interval;
}

function normalizePopulation(accounts) {
  if (!Array.isArray(accounts) || !accounts.length) throw new TypeError("transaction population is empty");
  const ids = new Set();
  for (const account of accounts) {
    if (typeof account?.id !== "string" || !account.id.trim() || ids.has(account.id)) throw new TypeError("unique non-empty transaction IDs are required");
    ids.add(account.id);
    if (resolveAccountMinor(account) <= 0n) throw new RangeError("MUS requires positive balances; test zero and negative items separately");
  }
  return accounts
    .map((account, index) => ({
      id: account?.id ?? `row_${index + 1}`,
      code: account?.code ?? null,
      name: account?.name ?? null,
      area: account?.areaLabel ?? null,
      risk: account?.risk ?? null,
      bookMinor: absMinor(resolveAccountMinor(account, account?.code || `row_${index + 1}`)),
      signedMinor: resolveAccountMinor(account, account?.code || `row_${index + 1}`),
    }))
    .filter((item) => item.bookMinor > 0n)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * يخطط عينة MUS.
 * tolerableMisstatementMinor  = الأهمية النسبية للأداء (ISA 320)
 * expectedMisstatementMinor   = توقع المراجع للتحريف في المجتمع
 */
export function planMonetarySample({
  accounts,
  tolerableMisstatementMinor,
  expectedMisstatementMinor = "0",
  confidence = 95,
  seed = "kosif",
  maxSampleSize = 100000,
}) {
  if (!SUPPORTED_CONFIDENCE.includes(confidence)) {
    throw new RangeError(`confidence must be one of ${SUPPORTED_CONFIDENCE.join(", ")}`);
  }
  if (!Number.isSafeInteger(maxSampleSize) || maxSampleSize < 1) throw new RangeError("maxSampleSize must be a positive safe integer");
  const tolerable = resolveMinor(tolerableMisstatementMinor, undefined, "tolerable");
  const expected = resolveMinor(expectedMisstatementMinor, undefined, "expected");
  if (tolerable <= 0n) throw new RangeError("tolerable misstatement must be positive");
  if (expected < 0n) throw new RangeError("expected misstatement cannot be negative");

  const population = normalizePopulation(accounts);
  const populationMinor = population.reduce((total, item) => total + item.bookMinor, 0n);

  const rf = reliabilityFactor(confidence, 0);
  const ef = BigInt(EXPANSION_FACTORS[confidence]);
  // المخصص المتاح = الأهمية المحتملة − (التحريف المتوقع × معامل التوسعة)
  const allowance = tolerable - mulDivFloor(expected, ef, 100n);
  if (allowance <= 0n) {
    return {
      engineVersion: SAMPLING_ENGINE_VERSION,
      viable: false,
      reason: "expected_misstatement_consumes_tolerable",
      confidence,
      populationMinor: populationMinor.toString(),
      tolerableMinor: tolerable.toString(),
      expectedMinor: expected.toString(),
      items: [],
    };
  }

  const interval = mulDivFloor(allowance, 100n, rf);
  if (interval <= 0n) throw new RangeError("sampling interval collapsed to zero");

  // بنود عالية القيمة: كل بند ≥ الفاصل يُصاب حتمًا، فيُفحص 100% ويخرج من المعاينة.
  const highValue = population.filter((item) => item.bookMinor >= interval);
  const residual = population.filter((item) => item.bookMinor < interval);
  const highValueMinor = highValue.reduce((total, item) => total + item.bookMinor, 0n);
  const residualMinor = residual.reduce((total, item) => total + item.bookMinor, 0n);

  const plannedSize = Number(ceilDiv(residualMinor, interval));
  const cappedSize = Math.min(plannedSize, maxSampleSize);
  const capped = cappedSize < plannedSize;

  // اختيار منهجي على محور الوحدات النقدية التراكمية.
  const populationDigest = sha256HexSync(JSON.stringify(population.map(({ id, bookMinor }) => [id, bookMinor.toString()])));
  const start = deterministicStart(`${seed}|${populationDigest}|${interval}`, interval);
  const selected = [];
  const seen = new Set();
  let cursor = start;
  let cumulative = 0n;
  for (const item of residual) {
    const next = cumulative + item.bookMinor;
    while (cursor < next && selected.length < cappedSize) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        selected.push({ ...item, stratum: "representative", hitUnitMinor: (cursor + 1n).toString() });
      }
      cursor += interval;
    }
    cumulative = next;
    if (selected.length >= cappedSize) break;
  }

  const items = [
    ...highValue.map((item, index) => ({
      order: index + 1,
      ...item,
      bookMinor: item.bookMinor.toString(),
      signedMinor: item.signedMinor.toString(),
      stratum: "high_value",
      basis: "قيمة دفترية ≥ فاصل المعاينة — فحص 100%",
      hitUnitMinor: null,
    })),
    ...selected.map((item, index) => ({
      order: highValue.length + index + 1,
      ...item,
      bookMinor: item.bookMinor.toString(),
      signedMinor: item.signedMinor.toString(),
      basis: "اختيار احتمالي متناسب مع القيمة",
    })),
  ];

  return {
    engineVersion: SAMPLING_ENGINE_VERSION,
    viable: !capped,
    reason: capped ? "sample_limit_below_required_size" : null,
    populationDigest,
    confidence,
    seed,
    reliabilityFactorX100: rf.toString(),
    expansionFactorX100: ef.toString(),
    tolerableMinor: tolerable.toString(),
    expectedMinor: expected.toString(),
    allowanceMinor: allowance.toString(),
    samplingIntervalMinor: interval.toString(),
    populationCount: population.length,
    populationMinor: populationMinor.toString(),
    highValueCount: highValue.length,
    highValueMinor: highValueMinor.toString(),
    residualCount: residual.length,
    residualMinor: residualMinor.toString(),
    plannedSampleSize: plannedSize,
    sampleSize: items.length,
    capped,
    randomStartMinor: start.toString(),
    items,
  };
}

/**
 * يقيّم العينة بعد الفحص — ISA 530 فقرتا 14 و15.
 * misstatements: [{ id, misstatementMinor }] بالقيم الموجبة للتحريف الزائد.
 * يستخدم حد Stringer: دقة أساسية + إسقاط مرتّب بمعاملات تزايدية.
 */
export function evaluateMonetarySample(plan, misstatements = [], { examinedIds = [] } = {}) {
  if (!plan?.viable) throw new TypeError("cannot evaluate a non-viable sampling plan");
  if (plan.capped) throw new TypeError("cannot evaluate a capped sample");
  const examined = new Set(examinedIds);
  if (examined.size !== plan.items.length || plan.items.some(item => !examined.has(item.id))) throw new TypeError("all sampled items must be examined before evaluation");
  const interval = BigInt(plan.samplingIntervalMinor);
  const tolerable = BigInt(plan.tolerableMinor);
  const byId = new Map(plan.items.map((item) => [item.id, item]));

  const known = [];
  const taints = [];
  const findingIds = new Set();
  for (const entry of misstatements) {
    if (findingIds.has(entry?.id)) throw new TypeError("duplicate finding for sampled item");
    findingIds.add(entry?.id);
    const item = byId.get(entry?.id);
    if (!item) throw new RangeError(`misstatement references an unsampled item: ${entry?.id}`);
    const amount = resolveMinor(entry.misstatementMinor, undefined, "misstatement");
    if (amount < 0n) throw new RangeError("understatements require separate evaluation");
    if (amount === 0n) continue;
    const book = BigInt(item.bookMinor);
    if (amount > book) throw new RangeError(`misstatement exceeds book value for ${item.id}`);
    if (item.stratum === "high_value") {
      // بنود مفحوصة 100% — التحريف معلوم ولا يُسقط.
      known.push({ id: item.id, knownMinor: amount.toString() });
    } else {
      const taint = mulDivFloor(amount, TAINT_SCALE, book); // نسبة التلوث ×1e6
      taints.push({ id: item.id, taint, actualMinor: amount, bookMinor: book });
    }
  }

  const knownMinor = known.reduce((total, item) => total + BigInt(item.knownMinor), 0n);
  taints.sort((a, b) => (b.taint === a.taint ? String(a.id).localeCompare(String(b.id)) : b.taint > a.taint ? 1 : -1));

  const basicPrecision = plan.residualCount === 0 ? 0n : ceilDiv(interval * reliabilityFactor(plan.confidence, 0), 100n);
  let projectedMinor = 0n;
  let incrementalPrecision = 0n;
  const detail = [];

  taints.forEach((entry, index) => {
    const rank = index + 1;
    const projection = ceilDiv(entry.actualMinor * interval, entry.bookMinor);
    // معامل تزايدي = RF(n) − RF(n−1) − 1، مطبق على الإسقاط المرتّب تنازليًا.
    const step = reliabilityFactor(plan.confidence, rank) - reliabilityFactor(plan.confidence, rank - 1) - 100n;
    const increment = step > 0n ? ceilDiv(projection * step, 100n) : 0n;
    projectedMinor += projection;
    incrementalPrecision += increment;
    detail.push({
      rank,
      id: entry.id,
      bookMinor: entry.bookMinor.toString(),
      actualMinor: entry.actualMinor.toString(),
      taintPpm: entry.taint.toString(),
      projectedMinor: projection.toString(),
      incrementalPrecisionMinor: increment.toString(),
    });
  });

  const upperLimit = knownMinor + projectedMinor + basicPrecision + incrementalPrecision;
  const mostLikely = knownMinor + projectedMinor;
  const acceptable = upperLimit <= tolerable;

  return {
    engineVersion: SAMPLING_ENGINE_VERSION,
    confidence: plan.confidence,
    populationDigest: plan.populationDigest,
    requiresHumanReview: true,
    sampleSize: plan.sampleSize,
    misstatementCount: known.length + taints.length,
    knownMisstatementMinor: knownMinor.toString(),
    projectedMisstatementMinor: projectedMinor.toString(),
    mostLikelyMisstatementMinor: mostLikely.toString(),
    basicPrecisionMinor: basicPrecision.toString(),
    incrementalPrecisionMinor: incrementalPrecision.toString(),
    upperMisstatementLimitMinor: upperLimit.toString(),
    tolerableMinor: tolerable.toString(),
    headroomMinor: (tolerable - upperLimit).toString(),
    acceptable,
    conclusionAr: acceptable
      ? "الحد الأعلى للتحريف ضمن الأهمية النسبية للأداء — يدعم المجتمع الاستنتاج عند مستوى الثقة المخطط."
      : "الحد الأعلى للتحريف يتجاوز الأهمية النسبية للأداء — يلزم توسيع الإجراءات أو طلب تسوية أو تقييم الأثر على الرأي وفق ISA 450.",
    isaReferences: ["ISA 320", "ISA 450", "ISA 530"],
    detail,
    knownDetail: known,
  };
}

/** ربط النتيجة بمسار ISA 450 دون إصدار رأي — القرار يبقى بشريًا. */
export function samplingToMisstatementSchedule(evaluation, { area = "عينة موجهة", basisAr = "" } = {}) {
  return {
    source: "isa530_sample",
    area,
    amountMinor: evaluation.mostLikelyMisstatementMinor,
    upperLimitMinor: evaluation.upperMisstatementLimitMinor,
    corrected: false,
    qualitative: false,
    qualitativeRationaleAr: "",
    basisAr: basisAr || `إسقاط عينة MUS عند ثقة ${evaluation.confidence}% بحجم ${evaluation.sampleSize}.`,
    requiresHumanReview: true,
  };
}
