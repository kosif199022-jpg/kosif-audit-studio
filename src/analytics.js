const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));

function sumCategoryMinor(accounts, keys) {
  const allowed = new Set(keys);
  return accounts.reduce((total, account) => total + (allowed.has(account.category) ? naturalBalanceMinor(account) : 0n), 0n);
}

const CREDIT_NORMAL_CATEGORIES = new Set([
  "payables", "contractLiabilities", "leaseLiabilities", "debt", "provisions",
  "employeeBenefits", "tax", "equity", "revenue", "otherIncome",
]);

function canonicalMinor(value) {
  return /^-?\d+$/.test(String(value ?? "")) ? BigInt(value) : null;
}

function naturalBalanceMinor(account) {
  const debit = canonicalMinor(account?.debitMinor);
  const credit = canonicalMinor(account?.creditMinor);
  if (debit !== null && credit !== null) {
    return CREDIT_NORMAL_CATEGORIES.has(account?.category) ? credit - debit : debit - credit;
  }
  const amount = canonicalMinor(account?.amountMinor);
  if (amount !== null) return amount;
  return BigInt(Math.round(Number(account?.amount || 0) * 100));
}

function accountExposureMinor(account) {
  const amount = naturalBalanceMinor(account);
  return amount < 0n ? -amount : amount;
}

const minorToNumber = (minor) => Number(minor) / 100;

function safeRatio(numerator, denominator, multiplier = 1) {
  return denominator ? round((numerator / denominator) * multiplier) : 0;
}

function ratioFromMinor(numerator, denominator, multiplier = 1n, digits = 2) {
  if (denominator === 0n) return 0;
  const scale = 10n ** BigInt(digits);
  const scaled = numerator * multiplier * scale;
  const sign = (scaled < 0n) !== (denominator < 0n) ? -1n : 1n;
  const absoluteScaled = scaled < 0n ? -scaled : scaled;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absoluteScaled / absoluteDenominator;
  const remainder = absoluteScaled % absoluteDenominator;
  const rounded = quotient + (remainder * 2n >= absoluteDenominator ? 1n : 0n);
  return Number(sign * rounded) / Number(scale);
}

export function buildAnalyticalReview(accounts) {
  const cashMinor = sumCategoryMinor(accounts, ["cash"]);
  const receivablesMinor = sumCategoryMinor(accounts, ["receivables"]);
  const inventoryMinor = sumCategoryMinor(accounts, ["inventory"]);
  const currentAssetsMinor = cashMinor + receivablesMinor + inventoryMinor;
  const quickAssetsMinor = cashMinor + receivablesMinor;
  const currentLiabilitiesMinor = sumCategoryMinor(accounts, ["payables", "contractLiabilities", "tax"]);
  const debtMinor = sumCategoryMinor(accounts, ["debt", "leaseLiabilities"]);
  const equityBeforeCurrentResultMinor = sumCategoryMinor(accounts, ["equity"]);
  const revenueMinor = sumCategoryMinor(accounts, ["revenue"]);
  const otherIncomeMinor = sumCategoryMinor(accounts, ["otherIncome"]);
  const cogsMinor = sumCategoryMinor(accounts, ["cogs"]);
  const operatingExpensesMinor = sumCategoryMinor(accounts, ["expenses"]);
  const financeCostsMinor = sumCategoryMinor(accounts, ["financeCosts"]);
  const profitBeforeTaxMinor = revenueMinor + otherIncomeMinor - cogsMinor - operatingExpensesMinor - financeCostsMinor;
  const equityMinor = equityBeforeCurrentResultMinor + profitBeforeTaxMinor;
  const totalAssetsMinor = sumCategoryMinor(accounts, ["cash", "receivables", "inventory", "ppe", "rightOfUse", "intangibles", "investmentProperty"]);
  const totalExposureMinor = accounts.reduce((total, account) => total + accountExposureMinor(account), 0n);
  const highRiskExposureMinor = accounts.reduce((total, account) => total + (account.risk === "high" ? accountExposureMinor(account) : 0n), 0n);
  const sortedAmountsMinor = accounts.map(accountExposureMinor).sort((a, b) => a === b ? 0 : a > b ? -1 : 1);
  const topTenExposureMinor = sortedAmountsMinor.slice(0, 10).reduce((total, amount) => total + amount, 0n);
  const totalExposure = minorToNumber(totalExposureMinor);
  const highRiskExposure = minorToNumber(highRiskExposureMinor);
  const topTenExposure = minorToNumber(topTenExposureMinor);
  const riskDistribution = ["high", "medium", "low"].map((risk) => ({
    risk,
    count: accounts.filter((account) => account.risk === risk).length,
  }));
  const largestBalances = [...accounts]
    .sort((left, right) => {
      const leftAmount = accountExposureMinor(left);
      const rightAmount = accountExposureMinor(right);
      return leftAmount === rightAmount ? String(left.code).localeCompare(String(right.code)) : leftAmount > rightAmount ? -1 : 1;
    })
    .slice(0, 8)
    .map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      risk: account.risk,
      amountMinor: accountExposureMinor(account).toString(),
    }));

  const digitCounts = Array(10).fill(0);
  for (const account of accounts) {
    const absoluteMinor = accountExposureMinor(account);
    const firstDigit = Number(absoluteMinor.toString().replace(/^0+/, "")[0] || 0);
    if (firstDigit >= 1 && firstDigit <= 9) digitCounts[firstDigit] += 1;
  }
  const benfordSample = digitCounts.reduce((total, count) => total + count, 0);
  const benford = Array.from({ length: 9 }, (_, index) => {
    const digit = index + 1;
    const expectedPct = Math.log10(1 + (1 / digit)) * 100;
    const actualPct = benfordSample ? (digitCounts[digit] / benfordSample) * 100 : 0;
    const deviationPct = actualPct - expectedPct;
    return {
      digit,
      count: digitCounts[digit],
      expectedPct: round(expectedPct, 1),
      actualPct: round(actualPct, 1),
      deviationPct: round(deviationPct, 1),
      flagged: Math.abs(deviationPct) >= 5,
    };
  });

  const areaMap = new Map();
  for (const account of accounts) {
    const area = areaMap.get(account.category) || {
      key: account.category,
      label: account.areaLabel,
      accountCount: 0,
      exposureMinor: 0n,
      high: 0,
      medium: 0,
      low: 0,
      standards: new Set(),
    };
    area.accountCount += 1;
    area.exposureMinor += accountExposureMinor(account);
    area[account.risk] += 1;
    for (const id of account.standards || []) area.standards.add(id);
    areaMap.set(account.category, area);
  }

  const areas = [...areaMap.values()]
    .map((area) => ({ ...area, exposure: minorToNumber(area.exposureMinor), exposureMinor: String(area.exposureMinor), standards: [...area.standards] }))
    .sort((a, b) => b.exposure - a.exposure);

  const ratios = {
    currentRatio: ratioFromMinor(currentAssetsMinor, currentLiabilitiesMinor),
    quickRatio: ratioFromMinor(quickAssetsMinor, currentLiabilitiesMinor),
    debtToEquity: ratioFromMinor(debtMinor, equityMinor),
    grossMarginPct: ratioFromMinor(revenueMinor - cogsMinor, revenueMinor, 100n),
    operatingMarginPct: ratioFromMinor(revenueMinor - cogsMinor - operatingExpensesMinor, revenueMinor, 100n),
    netMarginBeforeTaxPct: ratioFromMinor(profitBeforeTaxMinor, revenueMinor, 100n),
    cashRatio: ratioFromMinor(cashMinor, currentLiabilitiesMinor),
    debtToAssetsPct: ratioFromMinor(debtMinor, totalAssetsMinor, 100n),
    equityToAssetsPct: ratioFromMinor(equityMinor, totalAssetsMinor, 100n),
    interestCoverage: ratioFromMinor(revenueMinor + otherIncomeMinor - cogsMinor - operatingExpensesMinor, financeCostsMinor),
    receivablesDaysClosing: ratioFromMinor(receivablesMinor, revenueMinor, 365n),
    inventoryDaysClosing: ratioFromMinor(inventoryMinor, cogsMinor, 365n),
  };

  const ratioInputsMinor = {
    cash: cashMinor.toString(),
    receivables: receivablesMinor.toString(),
    inventory: inventoryMinor.toString(),
    currentAssets: currentAssetsMinor.toString(),
    currentLiabilities: currentLiabilitiesMinor.toString(),
    debt: debtMinor.toString(),
    equityBeforeCurrentResult: equityBeforeCurrentResultMinor.toString(),
    profitBeforeTax: profitBeforeTaxMinor.toString(),
    equity: equityMinor.toString(),
    totalAssets: totalAssetsMinor.toString(),
    revenue: revenueMinor.toString(),
    otherIncome: otherIncomeMinor.toString(),
    cogs: cogsMinor.toString(),
    operatingExpenses: operatingExpensesMinor.toString(),
    financeCosts: financeCostsMinor.toString(),
  };
  const ratioInputs = Object.fromEntries(
    Object.entries(ratioInputsMinor).map(([key, value]) => [key, minorToNumber(BigInt(value))]),
  );

  const insights = [
    {
      id: "liquidity",
      severity: ratios.currentRatio < 1 ? "high" : ratios.currentRatio < 1.5 ? "medium" : "low",
      title: "السيولة قصيرة الأجل",
      detail: `نسبة التداول ${ratios.currentRatio.toFixed(2)} مرة ونسبة السيولة السريعة ${ratios.quickRatio.toFixed(2)} مرة.`,
      standard: "IAS 1",
      auditStandard: "ISA 570",
    },
    {
      id: "leverage",
      severity: equityMinor <= 0n ? "high" : ratios.debtToEquity > 2 ? "high" : ratios.debtToEquity > 1 ? "medium" : "low",
      title: "الرفع المالي",
      detail: equityMinor <= 0n
        ? "حقوق الملكية بعد نتيجة الفترة قبل الضريبة غير موجبة؛ نسبة الدين إليها غير قابلة للتفسير وتستلزم تقييم الاستمرارية."
        : `الدين إلى حقوق الملكية ${ratios.debtToEquity.toFixed(2)} مرة؛ راجع التعهدات والتصنيف والاستمرارية.`,
      standard: "IFRS 9",
      auditStandard: "ISA 570",
    },
    {
      id: "margin",
      severity: ratios.grossMarginPct < 0 || ratios.operatingMarginPct < 0 ? "high" : ratios.operatingMarginPct < 10 ? "medium" : "low",
      title: "اتجاه الهامش",
      detail: `هامش الربح الإجمالي ${ratios.grossMarginPct.toFixed(1)}% والتشغيلي ${ratios.operatingMarginPct.toFixed(1)}%.`,
      standard: "IFRS 15",
      auditStandard: "ISA 520",
    },
    {
      id: "concentration",
      severity: safeRatio(topTenExposure, totalExposure, 100) > 10 ? "medium" : "low",
      title: "تركيز الأرصدة",
      detail: `أعلى عشرة حسابات تمثل ${safeRatio(topTenExposure, totalExposure, 100).toFixed(2)}% من إجمالي التعرض.`,
      standard: "IFRS 7",
      auditStandard: "ISA 530",
    },
  ];

  return {
    ratios,
    ratioDefinitions: {
      revenue: "إيرادات العقود فقط؛ تُعرض الإيرادات والمكاسب الأخرى منفصلة.",
      grossMargin: "(إيرادات العقود − تكلفة الإيرادات) ÷ إيرادات العقود.",
      operatingMargin: "(إيرادات العقود − تكلفة الإيرادات − المصروفات التشغيلية) ÷ إيرادات العقود؛ لا تشمل تكاليف التمويل.",
      netMarginBeforeTax: "إيرادات العقود + الإيرادات الأخرى − تكلفة الإيرادات − المصروفات التشغيلية − تكاليف التمويل، نسبةً إلى إيرادات العقود.",
      equityToAssets: "حقوق الملكية قبل نتيجة الفترة + نتيجة الفترة قبل الضريبة، نسبةً إلى أصول الإقفال.",
    },
    ratioInputs,
    ratioInputsMinor,
    benford,
    benfordFlags: benford.filter((item) => item.flagged).length,
    areas,
    riskDistribution,
    largestBalances,
    insights,
    totalExposure,
    highRiskExposure,
    highRiskExposurePct: safeRatio(highRiskExposure, totalExposure, 100),
    topTenExposurePct: safeRatio(topTenExposure, totalExposure, 100),
  };
}

export function buildRoundRiskTrend(rounds = [], findings = []) {
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  return rounds.map((round) => {
    const linked = (round.findingIds || []).map((id) => findingsById.get(id)).filter(Boolean);
    const high = linked.filter((item) => item.severity === "high").length;
    const medium = linked.filter((item) => item.severity === "medium").length;
    const low = linked.filter((item) => item.severity === "low").length;
    return {
      id: round.id,
      label: round.title || round.id,
      high,
      medium,
      low,
      weightedScore: (high * 3) + (medium * 2) + low,
      status: round.status,
    };
  });
}
