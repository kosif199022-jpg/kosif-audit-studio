/**
 * KOSIF Research Intelligence Extension
 *
 * Deterministic planning helpers derived from recurring audit-report patterns in the
 * Global Financial & Audit Research Bundle. These functions support professional
 * judgement; they do not replace ISA/IFRS requirements or the engagement partner.
 *
 * Monetary inputs/outputs ending in `Minor` are integer minor units (BigInt preferred).
 */

const BPS = 10000;

function asBigIntMinor(value, fallback = 0n) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  return fallback;
}

function absMinor(value) {
  const v = asBigIntMinor(value);
  return v < 0n ? -v : v;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function pctFromRatio(numerator, denominator) {
  if (denominator === 0n) return 0;
  return Number((absMinor(numerator) * 10000n) / absMinor(denominator)) / 100;
}

function ceilRatio(amount, bps) {
  if (amount <= 0n || bps <= 0) return 0n;
  return (amount * BigInt(bps) + 9999n) / 10000n;
}

function multiplyDivideSigned(value, numerator, denominator) {
  if (denominator === 0n) return 0n;
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const rounded = (absolute * numerator + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
}

function rowAmountMinor(row = {}) {
  if (row.net !== undefined) return absMinor(row.net);
  if (row.amountMinor !== undefined) return absMinor(row.amountMinor);
  if (row.balanceMinor !== undefined) return absMinor(row.balanceMinor);
  const debit = asBigIntMinor(row.debit);
  const credit = asBigIntMinor(row.credit);
  return absMinor(debit - credit);
}

function rowId(row = {}, index = 0) {
  return String(row.id ?? row.code ?? `ROW-${index + 1}`);
}

function stableHash(value = '') {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededRandom(seed = 380019) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBigIntBelow(limit, random) {
  if (limit <= 1n) return 0n;
  const capped = limit > 9007199254740991n ? 9007199254740991n : limit;
  return BigInt(Math.floor(random() * Number(capped)));
}

function uniqueRows(rows = []) {
  const seen = new Set();
  const output = [];
  for (const [index, row] of rows.entries()) {
    const id = rowId(row, index);
    if (seen.has(id)) continue;
    seen.add(id);
    output.push(row);
  }
  return output;
}

function buildRiskMap(risks = []) {
  const map = new Map();
  for (const risk of Array.isArray(risks) ? risks : []) {
    const id = String(risk.accountId ?? risk.rowId ?? '');
    if (!id) continue;
    map.set(id, Math.max(map.get(id) ?? 0, clampNumber(risk.score, 0, 100)));
  }
  return map;
}

function orderRandom(rows, seed) {
  const random = seededRandom(seed);
  const shuffled = [...rows];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function orderSystematic(rows, seed, candidateCount) {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => String(a.code ?? a.id ?? '').localeCompare(String(b.code ?? b.id ?? ''), 'ar'));
  const count = Math.max(1, Math.min(sorted.length, candidateCount));
  const interval = Math.max(1, Math.floor(sorted.length / count));
  const start = Math.floor(seededRandom(seed)() * interval);
  const selected = [];
  for (let index = start; index < sorted.length && selected.length < count; index += interval) selected.push(sorted[index]);
  if (selected.length < count) {
    for (const row of sorted) {
      if (selected.length >= count) break;
      if (!selected.includes(row)) selected.push(row);
    }
  }
  return selected;
}

function orderRisk(rows, risks, seed) {
  const riskMap = buildRiskMap(risks);
  return [...rows].sort((a, b) => {
    const aId = String(a.id ?? a.code ?? '');
    const bId = String(b.id ?? b.code ?? '');
    const riskDelta = (riskMap.get(bId) ?? 0) - (riskMap.get(aId) ?? 0);
    if (riskDelta) return riskDelta;
    const amountA = rowAmountMinor(a);
    const amountB = rowAmountMinor(b);
    if (amountA !== amountB) return amountA > amountB ? -1 : 1;
    return stableHash(`${aId}|${seed}`) - stableHash(`${bId}|${seed}`);
  });
}

function orderMus(rows, seed, candidateCount, risks = []) {
  if (!rows.length) return [];
  const count = Math.max(1, Math.min(rows.length, candidateCount));
  const valued = rows.filter((row) => rowAmountMinor(row) > 0n);
  if (!valued.length) return orderRandom(rows, seed).slice(0, count);
  const total = valued.reduce((sum, row) => sum + rowAmountMinor(row), 0n);
  const interval = total / BigInt(count) || 1n;
  const random = seededRandom(seed);
  let cursor = randomBigIntBelow(interval, random);
  if (cursor === 0n) cursor = 1n;
  let cumulative = 0n;
  const selected = [];
  for (const row of valued) {
    cumulative += rowAmountMinor(row);
    while (cumulative >= cursor && selected.length < count) {
      selected.push(row);
      cursor += interval;
    }
    if (selected.length >= count) break;
  }
  const deduped = uniqueRows(selected);
  if (deduped.length < count) {
    const fallback = orderRisk(rows, risks, seed + 17);
    return uniqueRows([...deduped, ...fallback]).slice(0, count);
  }
  return deduped.slice(0, count);
}

function candidateOrder(rows, { method, seed, candidateCount, risks }) {
  switch (method) {
    case 'random': return orderRandom(rows, seed).slice(0, candidateCount);
    case 'systematic': return orderSystematic(rows, seed, candidateCount);
    case 'mus': return orderMus(rows, seed, candidateCount, risks);
    case 'risk':
    default: return orderRisk(rows, risks, seed).slice(0, candidateCount);
  }
}

/**
 * Plan a substantive sample using a transparent KOSIF policy layer.
 *
 * The policy deliberately does NOT claim that ISA 530 prescribes a single formula.
 * Instead it operationalizes factors repeatedly disclosed in audit reports: performance
 * materiality, assessed risk, aggregation risk, control effectiveness and expected
 * misstatement. Items at/above the reviewer-adjustable individually-significant
 * threshold are placed in a 100%-tested certainty stratum.
 */
export function planAuditSample(inputRows = [], {
  risks = [],
  method = 'mus',
  seed = 380019,
  overallMaterialityMinor = 0n,
  performanceMaterialityMinor = 0n,
  expectedMisstatementMinor = 0n,
  risk = 'medium',
  controls = 'moderate',
  aggregationRisk = 'medium',
  individuallySignificantThresholdBps = BPS,
  maxResidualSample = 500
} = {}) {
  const rows = uniqueRows(Array.isArray(inputRows) ? inputRows : []);
  const overall = absMinor(overallMaterialityMinor);
  const performance = absMinor(performanceMaterialityMinor) || (overall > 0n ? (overall * 70n) / 100n : 0n);
  const expected = absMinor(expectedMisstatementMinor);
  const significantBps = Math.max(1000, Math.min(20000, Math.trunc(Number(individuallySignificantThresholdBps) || BPS)));
  const certaintyThreshold = performance > 0n ? ceilRatio(performance, significantBps) : 0n;

  const normalizedRisk = ['low', 'medium', 'high'].includes(risk) ? risk : 'medium';
  const normalizedControls = ['strong', 'moderate', 'weak', 'none'].includes(controls) ? controls : 'moderate';
  const normalizedAggregation = ['low', 'medium', 'high'].includes(aggregationRisk) ? aggregationRisk : 'medium';
  const normalizedMethod = ['risk', 'random', 'systematic', 'mus'].includes(method) ? method : 'risk';

  const riskBaseBps = { low: 1800, medium: 3000, high: 4500 }[normalizedRisk];
  const controlMultiplierBps = { strong: 7500, moderate: 10000, weak: 12000, none: 13500 }[normalizedControls];
  const aggregationMultiplierBps = { low: 9000, medium: 10000, high: 11500 }[normalizedAggregation];
  const expectedRatioBps = performance > 0n
    ? Number(((expected > performance ? performance : expected) * 10000n) / performance)
    : 0;
  const expectedUpliftBps = Math.min(2000, Math.floor(expectedRatioBps / 5));
  let targetResidualCoverageBps = Math.floor((riskBaseBps * controlMultiplierBps) / BPS);
  targetResidualCoverageBps = Math.floor((targetResidualCoverageBps * aggregationMultiplierBps) / BPS) + expectedUpliftBps;
  targetResidualCoverageBps = Math.max(1000, Math.min(7500, targetResidualCoverageBps));

  const certaintyRows = [];
  const residualRows = [];
  for (const row of rows) {
    const amount = rowAmountMinor(row);
    if (certaintyThreshold > 0n && amount >= certaintyThreshold) certaintyRows.push(row);
    else residualRows.push(row);
  }

  const populationValue = rows.reduce((sum, row) => sum + rowAmountMinor(row), 0n);
  const certaintyValue = certaintyRows.reduce((sum, row) => sum + rowAmountMinor(row), 0n);
  const residualPopulationValue = residualRows.reduce((sum, row) => sum + rowAmountMinor(row), 0n);
  const residualTargetValue = ceilRatio(residualPopulationValue, targetResidualCoverageBps);
  const residualCap = Math.max(1, Math.min(residualRows.length || 1, Math.trunc(Number(maxResidualSample) || 500)));

  const orderedCandidates = candidateOrder(residualRows, {
    method: normalizedMethod,
    seed: Number(seed) || 380019,
    candidateCount: residualCap,
    risks
  });

  const residualSample = [];
  let residualSampleValue = 0n;
  for (const row of orderedCandidates) {
    if (residualSample.length >= residualCap) break;
    residualSample.push(row);
    residualSampleValue += rowAmountMinor(row);
    if (residualSampleValue >= residualTargetValue) break;
  }

  const selectedRows = uniqueRows([...certaintyRows, ...residualSample]);
  const selectedValue = certaintyValue + residualSampleValue;
  const targetReached = residualPopulationValue === 0n || residualSampleValue >= residualTargetValue;
  const capApplied = !targetReached && residualSample.length >= residualCap;
  const selectedIds = selectedRows.map((row, index) => rowId(row, index));
  const planId = `SMP-${stableHash(JSON.stringify({
    ids: selectedIds,
    method: normalizedMethod,
    seed: Number(seed) || 380019,
    targetResidualCoverageBps,
    significantBps
  })).toString(16).toUpperCase()}`;

  return {
    id: planId,
    policy: 'KOSIF deterministic research-informed sampling policy',
    standardsContext: ['ISA 320', 'ISA 330', 'ISA 530'],
    finalJudgment: 'human-reviewer',
    humanApprovalRequired: true,
    certaintyRows,
    residualSample,
    selectedRows,
    parameters: {
      method: normalizedMethod,
      seed: Number(seed) || 380019,
      risk: normalizedRisk,
      controls: normalizedControls,
      aggregationRisk: normalizedAggregation,
      overallMaterialityMinor: overall,
      performanceMaterialityMinor: performance,
      expectedMisstatementMinor: expected,
      individuallySignificantThresholdBps: significantBps,
      certaintyThresholdMinor: certaintyThreshold,
      targetResidualCoverageBps,
      maxResidualSample: residualCap
    },
    metrics: {
      populationCount: rows.length,
      populationValueMinor: populationValue,
      certaintyCount: certaintyRows.length,
      certaintyValueMinor: certaintyValue,
      residualPopulationCount: residualRows.length,
      residualPopulationValueMinor: residualPopulationValue,
      residualTargetValueMinor: residualTargetValue,
      residualSampleCount: residualSample.length,
      residualSampleValueMinor: residualSampleValue,
      selectedCount: selectedRows.length,
      selectedValueMinor: selectedValue,
      populationCoveragePct: pctFromRatio(selectedValue, populationValue),
      residualCoveragePct: pctFromRatio(residualSampleValue, residualPopulationValue),
      targetResidualCoveragePct: targetResidualCoverageBps / 100,
      targetReached,
      capApplied
    },
    rationale: [
      'فصل البنود ذات الأهمية الفردية في طبقة فحص 100% قبل المعاينة.',
      'تحديد امتداد العينة المتبقية وفق أهمية الأداء والمخاطر وفعالية الضوابط ومخاطر التجميع والتحريف المتوقع.',
      'استخدام اختيار حتمي قابل لإعادة الإنتاج والتتبع بالبذرة المسجلة.',
      'هذه سياسة تخطيط KOSIF قابلة للتعديل والاعتماد البشري وليست معادلة إلزامية منصوصًا عليها في ISA 530.'
    ]
  };
}

function resultMisstatementMinor(result = {}, row = null) {
  if (result.misstatementMinor !== undefined) return asBigIntMinor(result.misstatementMinor);
  const book = result.bookAmountMinor !== undefined ? asBigIntMinor(result.bookAmountMinor) : rowAmountMinor(row ?? {});
  if (result.auditedAmountMinor !== undefined) return book - asBigIntMinor(result.auditedAmountMinor);
  return 0n;
}

/**
 * Project detected residual-sample misstatement to the residual population using a
 * transparent ratio projection. Certainty-stratum errors remain known errors and are
 * not projected. Positive values represent book overstatement; negative values represent
 * book understatement when auditedAmountMinor is supplied.
 */
export function projectSampleMisstatement(plan, testResults = [], {
  overallMaterialityMinor = null,
  performanceMaterialityMinor = null,
  trivialThresholdMinor = 0n
} = {}) {
  if (!plan || !Array.isArray(plan.selectedRows)) throw new TypeError('A valid sample plan is required');
  const certaintyIds = new Set((plan.certaintyRows ?? []).map((row, index) => rowId(row, index)));
  const selectedMap = new Map((plan.selectedRows ?? []).map((row, index) => [rowId(row, index), row]));
  const resultMap = new Map((Array.isArray(testResults) ? testResults : []).map((result) => [String(result.rowId ?? result.id ?? ''), result]));

  let knownCertaintyNet = 0n;
  let knownCertaintyAbsolute = 0n;
  let residualSampleNet = 0n;
  let residualSampleAbsolute = 0n;
  let residualTestedBookValue = 0n;
  let testedCount = 0;

  for (const [id, row] of selectedMap.entries()) {
    const result = resultMap.get(id);
    if (!result) continue;
    testedCount += 1;
    const misstatement = resultMisstatementMinor(result, row);
    const absoluteMisstatement = absMinor(misstatement);
    if (certaintyIds.has(id)) {
      knownCertaintyNet += misstatement;
      knownCertaintyAbsolute += absoluteMisstatement;
    } else {
      residualSampleNet += misstatement;
      residualSampleAbsolute += absoluteMisstatement;
      residualTestedBookValue += result.bookAmountMinor !== undefined
        ? absMinor(result.bookAmountMinor)
        : rowAmountMinor(row);
    }
  }

  const residualPopulationValue = absMinor(plan.metrics?.residualPopulationValueMinor);
  const projectedResidualNet = residualTestedBookValue > 0n
    ? multiplyDivideSigned(residualSampleNet, residualPopulationValue, residualTestedBookValue)
    : 0n;
  const projectedResidualAbsolute = residualTestedBookValue > 0n
    ? multiplyDivideSigned(residualSampleAbsolute, residualPopulationValue, residualTestedBookValue)
    : 0n;
  const totalProjectedNet = knownCertaintyNet + projectedResidualNet;
  const totalProjectedAbsolute = knownCertaintyAbsolute + projectedResidualAbsolute;

  const overall = overallMaterialityMinor === null
    ? absMinor(plan.parameters?.overallMaterialityMinor)
    : absMinor(overallMaterialityMinor);
  const performance = performanceMaterialityMinor === null
    ? absMinor(plan.parameters?.performanceMaterialityMinor)
    : absMinor(performanceMaterialityMinor);
  const trivial = absMinor(trivialThresholdMinor);
  const untestedSelectedCount = Math.max(0, selectedMap.size - testedCount);
  const projectionAvailable = residualPopulationValue === 0n || residualTestedBookValue > 0n;

  let status = 'clear';
  if (!projectionAvailable || untestedSelectedCount > 0) status = 'incomplete';
  else if (overall > 0n && totalProjectedAbsolute >= overall) status = 'escalate';
  else if (performance > 0n && totalProjectedAbsolute >= performance) status = 'investigate';
  else if (trivial > 0n && totalProjectedAbsolute >= trivial) status = 'watch';

  const conclusions = {
    incomplete: 'نتائج الاختبار غير مكتملة أو لا يوجد أساس كافٍ لإسقاط تحريفات العينة المتبقية.',
    escalate: 'التحريف الكلي المتوقع بلغ أو تجاوز الأهمية النسبية الإجمالية؛ يلزم تصعيد مهني وتقييم أثره على القوائم والرأي.',
    investigate: 'التحريف الكلي المتوقع بلغ أهمية الأداء؛ يلزم توسيع العمل وتقييم تحريفات إضافية ومخاطر التجميع.',
    watch: 'التحريف المتوقع أعلى من حد التحريف التافه ويجب إدراجه في تجميع التحريفات ومتابعته.',
    clear: 'لم يتجاوز التحريف المتوقع الحدود المدخلة، مع بقاء تقييم الكفاية والملاءمة والحكم النهائي للمراجع.'
  };

  return {
    method: 'ratio-projection',
    status,
    conclusion: conclusions[status],
    humanApprovalRequired: true,
    testedCount,
    untestedSelectedCount,
    knownCertaintyNetMinor: knownCertaintyNet,
    knownCertaintyAbsoluteMinor: knownCertaintyAbsolute,
    residualSampleNetMinor: residualSampleNet,
    residualSampleAbsoluteMinor: residualSampleAbsolute,
    residualTestedBookValueMinor: residualTestedBookValue,
    residualPopulationValueMinor: residualPopulationValue,
    projectedResidualNetMinor: projectedResidualNet,
    projectedResidualAbsoluteMinor: projectedResidualAbsolute,
    totalProjectedNetMinor: totalProjectedNet,
    totalProjectedAbsoluteMinor: totalProjectedAbsolute,
    overallMaterialityMinor: overall,
    performanceMaterialityMinor: performance,
    projectionAvailable,
    note: 'الإسقاط النسبي أداة تقييم تشغيلية داخل KOSIF؛ يجب على المراجع تقييم ملاءمة طريقة الإسقاط وطبيعة التحريفات قبل الاستنتاج.'
  };
}

function normalizeText(value = '') {
  return String(value).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
}

function findingSeverityScore(severity = '') {
  return { critical: 18, high: 12, medium: 6, low: 2 }[String(severity).toLowerCase()] ?? 0;
}

/**
 * Screen significant matters for KAM consideration. This creates candidates only.
 */
export function identifyKamCandidates({ risks = [], findings = [], workpapers = [], materialityMinor = 0n, limit = 8 } = {}) {
  const materiality = absMinor(materialityMinor);
  const candidates = [];
  const findingByRisk = new Map();
  for (const finding of Array.isArray(findings) ? findings : []) {
    const id = String(finding.riskId ?? '');
    if (!id) continue;
    if (!findingByRisk.has(id)) findingByRisk.set(id, []);
    findingByRisk.get(id).push(finding);
  }

  for (const risk of Array.isArray(risks) ? risks : []) {
    const riskId = String(risk.id ?? '');
    const relatedFindings = findingByRisk.get(riskId) ?? [];
    const relatedWorkpapers = (Array.isArray(workpapers) ? workpapers : []).filter((paper) => (paper.riskIds ?? []).includes(riskId));
    const text = normalizeText([risk.title, risk.rationale, risk.category, ...(risk.standards ?? [])].join(' '));
    let score = clampNumber(risk.score, 0, 100);
    const drivers = [];

    if (['critical', 'high'].includes(String(risk.severity))) { score += 8; drivers.push('مخاطر مرتفعة/حرجة'); }
    const amount = absMinor(risk.amount);
    if (materiality > 0n && amount >= materiality) { score += 10; drivers.push('رصيد أو تعرض جوهري'); }
    if (/ايراد|revenue|fraud|احتيال/.test(text)) { score += 8; drivers.push('خطر احتيال أو إيراد'); }
    if (/تقدير|estimate|impair|انخفاض|goodwill|شهره|valuation|تقييم|provision|مخصص|tax|ضريب/.test(text)) {
      score += 8;
      drivers.push('حكم أو تقدير محاسبي معقد');
    }
    if (/استمراري|going concern/.test(text)) { score += 10; drivers.push('استمرارية'); }
    if (/control|رقاب|material weakness|ضعف جوهري/.test(text)) { score += 6; drivers.push('رقابة داخلية أو ضعف رقابي'); }
    if (relatedWorkpapers.some((paper) => paper.estimateRelated || paper.specialistRequired)) {
      score += 8;
      drivers.push('تطلب خبرة متخصصة/جهدًا إضافيًا');
    }
    if (relatedWorkpapers.some((paper) => paper.contradictoryEvidence || paper.highJudgment)) {
      score += 7;
      drivers.push('أدلة متعارضة أو حكم مرتفع');
    }
    for (const finding of relatedFindings) {
      score += findingSeverityScore(finding.severity);
      if (finding.status !== 'closed') drivers.push('نتيجة مراجعة غير مغلقة');
    }
    score = Math.min(100, score);
    if (score < 70) continue;

    candidates.push({
      riskId,
      title: risk.title ?? 'مسألة مراجعة',
      significanceScore: score,
      drivers: [...new Set(drivers)],
      financialStatementArea: risk.category ?? null,
      standards: [...new Set(risk.standards ?? [])],
      reportFrame: {
        whySignificant: risk.rationale ?? 'تتطلب المسألة اهتمامًا مهنيًا مهمًا.',
        auditResponse: risk.procedure ?? 'يجب توثيق الاستجابة الفعلية وإجراءات المراجعة المنفذة.',
        evidenceExpected: risk.evidence ?? 'يجب ربط الأدلة الفعلية قبل صياغة التقرير.',
        resultStatus: relatedFindings.some((finding) => finding.status !== 'closed') ? 'open-findings' : 'no-open-linked-findings'
      },
      finalDeterminationRequired: true
    });
  }

  return candidates
    .sort((a, b) => b.significanceScore - a.significanceScore || a.title.localeCompare(b.title, 'ar'))
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 8)));
}

function componentShareBps(amount, total) {
  if (total <= 0n) return 0;
  return Number((absMinor(amount) * 10000n) / total);
}

/**
 * Research-informed group-audit scoping screen. Percentage thresholds are explicit
 * KOSIF policy defaults, not standard-mandated cut-offs, and are reviewer-adjustable.
 */
export function scopeGroupAuditComponents(inputComponents = [], {
  fullScopeShareBps = 1500,
  specificScopeShareBps = 500,
  fullScopeRiskScore = 80,
  specificScopeRiskScore = 60
} = {}) {
  const components = (Array.isArray(inputComponents) ? inputComponents : []).map((component, index) => ({
    ...component,
    id: String(component.id ?? `COMP-${index + 1}`),
    name: String(component.name ?? `مكون ${index + 1}`),
    revenueMinor: absMinor(component.revenueMinor),
    assetsMinor: absMinor(component.assetsMinor),
    riskScore: clampNumber(component.riskScore, 0, 100)
  }));
  const totalRevenue = components.reduce((sum, component) => sum + component.revenueMinor, 0n);
  const totalAssets = components.reduce((sum, component) => sum + component.assetsMinor, 0n);
  const fullShare = Math.max(1, Math.min(10000, Number(fullScopeShareBps) || 1500));
  const specificShare = Math.max(1, Math.min(fullShare, Number(specificScopeShareBps) || 500));
  const fullRisk = clampNumber(fullScopeRiskScore, 1, 100);
  const specificRisk = Math.min(fullRisk, clampNumber(specificScopeRiskScore, 1, 100));

  const scoped = components.map((component) => {
    const revenueShareBps = componentShareBps(component.revenueMinor, totalRevenue);
    const assetShareBps = componentShareBps(component.assetsMinor, totalAssets);
    const reasons = [];
    let scope = 'targeted_risk_assessment';
    if (component.riskScore >= fullRisk || revenueShareBps >= fullShare || assetShareBps >= fullShare) {
      scope = 'full_scope';
      if (component.riskScore >= fullRisk) reasons.push('مخاطر مرتفعة');
      if (revenueShareBps >= fullShare) reasons.push('حصة إيراد كبيرة');
      if (assetShareBps >= fullShare) reasons.push('حصة أصول كبيرة');
    } else if (component.riskScore >= specificRisk || revenueShareBps >= specificShare || assetShareBps >= specificShare || (component.significantFslis ?? []).length) {
      scope = 'specific_line_items';
      if (component.riskScore >= specificRisk) reasons.push('مخاطر متوسطة/مرتفعة');
      if (revenueShareBps >= specificShare || assetShareBps >= specificShare) reasons.push('حجم يستلزم تغطية موجهة');
      if ((component.significantFslis ?? []).length) reasons.push('بنود مالية محددة ذات أهمية');
    } else {
      reasons.push('مكون غير جوهري نسبيًا مع بقاء إجراءات تقييم مخاطر موجهة');
    }
    return {
      ...component,
      revenueSharePct: revenueShareBps / 100,
      assetSharePct: assetShareBps / 100,
      scope,
      reasons
    };
  });

  const substantive = scoped.filter((component) => ['full_scope', 'specific_line_items'].includes(component.scope));
  const coveredRevenue = substantive.reduce((sum, component) => sum + component.revenueMinor, 0n);
  const coveredAssets = substantive.reduce((sum, component) => sum + component.assetsMinor, 0n);

  return {
    components: scoped.sort((a, b) => b.riskScore - a.riskScore || b.revenueSharePct - a.revenueSharePct),
    metrics: {
      componentCount: scoped.length,
      fullScopeCount: scoped.filter((component) => component.scope === 'full_scope').length,
      specificLineItemCount: scoped.filter((component) => component.scope === 'specific_line_items').length,
      targetedRiskAssessmentCount: scoped.filter((component) => component.scope === 'targeted_risk_assessment').length,
      revenueCoveragePct: pctFromRatio(coveredRevenue, totalRevenue),
      assetCoveragePct: pctFromRatio(coveredAssets, totalAssets),
      totalRevenueMinor: totalRevenue,
      totalAssetsMinor: totalAssets
    },
    policy: {
      fullScopeSharePct: fullShare / 100,
      specificScopeSharePct: specificShare / 100,
      fullScopeRiskScore: fullRisk,
      specificScopeRiskScore: specificRisk,
      reviewerAdjustable: true,
      note: 'النسب حدود سياسة داخلية في KOSIF وليست نسبًا إلزامية مقررة في معيار المراجعة.'
    },
    humanApprovalRequired: true
  };
}

/**
 * Track remediation of control deficiencies through design, implementation,
 * operating effectiveness and sustainability evidence.
 */
export function evaluateControlRemediation(inputControls = [], { minimumSustainabilityPeriods = 2 } = {}) {
  const periods = Math.max(1, Math.min(12, Math.trunc(Number(minimumSustainabilityPeriods) || 2)));
  const controls = (Array.isArray(inputControls) ? inputControls : []).map((control, index) => {
    let status = 'remediated';
    const blockers = [];
    if (!control.designEffective) { status = 'design_gap'; blockers.push('فعالية التصميم غير مثبتة'); }
    else if (!control.implemented) { status = 'implementation_gap'; blockers.push('التنفيذ غير مكتمل'); }
    else if (!control.operatingEffective) { status = 'operating_gap'; blockers.push('الفعالية التشغيلية غير مثبتة'); }
    else if (Number(control.sustainabilityEvidencePeriods ?? 0) < periods) {
      status = 'sustainability_monitoring';
      blockers.push(`يلزم دليل استدامة عبر ${periods} فترات على الأقل وفق سياسة KOSIF الحالية`);
    }
    return {
      ...control,
      id: String(control.id ?? `CTRL-${index + 1}`),
      status,
      blockers,
      humanConclusionRequired: true
    };
  });
  const openMaterialWeaknesses = controls.filter((control) => normalizeText(control.deficiencySeverity).includes('material') && control.status !== 'remediated');
  return {
    controls,
    summary: {
      total: controls.length,
      remediated: controls.filter((control) => control.status === 'remediated').length,
      monitoring: controls.filter((control) => control.status === 'sustainability_monitoring').length,
      openGaps: controls.filter((control) => ['design_gap', 'implementation_gap', 'operating_gap'].includes(control.status)).length,
      openMaterialWeaknesses: openMaterialWeaknesses.length
    },
    humanApprovalRequired: true
  };
}
