import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalyticalReview, buildRoundRiskTrend } from "../src/analytics.js";
import { generateTrialBalance } from "../src/data.js";

const accounts = generateTrialBalance();
const round = (value, digits = 2) => Number(value.toFixed(digits));

test("analytical review is deterministic and reconciles to the 5,000-account population", () => {
  const first = buildAnalyticalReview(accounts);
  const second = buildAnalyticalReview(accounts);
  const expectedExposure = accounts.reduce((total, account) => total + account.amount, 0);
  const expectedHighRisk = accounts.reduce(
    (total, account) => total + (account.risk === "high" ? account.amount : 0),
    0,
  );

  assert.deepEqual(second, first);
  assert.equal(first.areas.length, 20);
  assert.equal(first.areas.reduce((total, area) => total + area.accountCount, 0), 5_000);
  assert.equal(round(first.areas.reduce((total, area) => total + area.exposure, 0)), round(expectedExposure));
  assert.equal(round(first.totalExposure), round(expectedExposure));
  assert.equal(round(first.highRiskExposure), round(expectedHighRisk));
  assert.equal(first.areas.every((area) => area.accountCount === 250), true);
  assert.equal(first.areas.every((area) => area.standards.length > 0), true);
});

test("ratio outputs reconcile to independently aggregated trial-balance areas", () => {
  const review = buildAnalyticalReview(accounts);
  const creditNormal = new Set([
    "payables", "contractLiabilities", "leaseLiabilities", "debt", "provisions",
    "employeeBenefits", "tax", "equity", "revenue", "otherIncome",
  ]);
  const totals = accounts.reduce((byCategory, account) => {
    const naturalMinor = creditNormal.has(account.category)
      ? BigInt(account.creditMinor) - BigInt(account.debitMinor)
      : BigInt(account.debitMinor) - BigInt(account.creditMinor);
    byCategory[account.category] = (byCategory[account.category] || 0n) + naturalMinor;
    return byCategory;
  }, {});
  const value = (key) => totals[key] || 0n;
  const expectedRatio = (numerator, denominator, multiplier = 1) => (
    denominator === 0n ? 0 : round((Number(numerator) / Number(denominator)) * multiplier)
  );
  const currentAssets = value("cash") + value("receivables") + value("inventory");
  const quickAssets = value("cash") + value("receivables");
  const currentLiabilities = value("payables") + value("contractLiabilities") + value("tax");
  const debt = value("debt") + value("leaseLiabilities");
  const revenue = value("revenue");
  const operatingExpenses = value("expenses");
  const profitBeforeTax = revenue + value("otherIncome") - value("cogs") - operatingExpenses - value("financeCosts");
  const equity = value("equity") + profitBeforeTax;

  assert.equal(review.ratios.currentRatio, expectedRatio(currentAssets, currentLiabilities));
  assert.equal(review.ratios.quickRatio, expectedRatio(quickAssets, currentLiabilities));
  assert.equal(review.ratios.debtToEquity, expectedRatio(debt, equity));
  assert.equal(review.ratios.grossMarginPct, expectedRatio(revenue - value("cogs"), revenue, 100));
  assert.equal(
    review.ratios.operatingMarginPct,
    expectedRatio(revenue - value("cogs") - operatingExpenses, revenue, 100),
  );
  assert.equal(
    review.ratios.netMarginBeforeTaxPct,
    expectedRatio(profitBeforeTax, revenue, 100),
  );
  const totalAssets = currentAssets + value("ppe") + value("rightOfUse") + value("intangibles") + value("investmentProperty");
  assert.equal(review.ratios.cashRatio, expectedRatio(value("cash"), currentLiabilities));
  assert.equal(review.ratios.debtToAssetsPct, expectedRatio(debt, totalAssets, 100));
  assert.equal(review.ratios.equityToAssetsPct, expectedRatio(equity, totalAssets, 100));
  assert.equal(review.ratios.interestCoverage, expectedRatio(revenue + value("otherIncome") - value("cogs") - operatingExpenses, value("financeCosts")));
  assert.equal(review.ratios.receivablesDaysClosing, expectedRatio(value("receivables"), revenue, 365));
  assert.equal(review.ratios.inventoryDaysClosing, expectedRatio(value("inventory"), value("cogs"), 365));
  assert.equal(review.ratioInputsMinor.revenue, revenue.toString());
  assert.equal(review.ratioInputsMinor.otherIncome, value("otherIncome").toString());
  assert.equal(review.ratioInputsMinor.equityBeforeCurrentResult, value("equity").toString());
  assert.equal(review.ratioInputsMinor.profitBeforeTax, profitBeforeTax.toString());
  assert.equal(review.ratioInputsMinor.equity, equity.toString());
  assert.equal(review.insights.find(({ id }) => id === "margin").severity, "high");
});

test("natural signed balances reduce revenue for debit returns and include current result in equity", () => {
  const fixture = [
    { id: "cash", code: "1100", name: "نقد", category: "cash", debitMinor: "190000", creditMinor: "0", amountMinor: "190000", risk: "low" },
    { id: "sales", code: "4100", name: "مبيعات", category: "revenue", debitMinor: "0", creditMinor: "100000", amountMinor: "100000", risk: "medium" },
    { id: "returns", code: "4101", name: "مرتجعات مبيعات", category: "revenue", debitMinor: "10000", creditMinor: "0", amountMinor: "10000", risk: "high" },
    { id: "capital", code: "3100", name: "رأس المال", category: "equity", debitMinor: "0", creditMinor: "100000", amountMinor: "100000", risk: "low" },
  ];

  const review = buildAnalyticalReview(fixture);

  assert.equal(review.ratioInputsMinor.revenue, "90000");
  assert.equal(review.ratioInputs.revenue, 900);
  assert.equal(review.ratioInputs.equityBeforeCurrentResult, 1_000);
  assert.equal(review.ratioInputs.profitBeforeTax, 900);
  assert.equal(review.ratioInputs.equity, 1_900);
  assert.equal(review.ratios.grossMarginPct, 100);
  assert.equal(review.ratios.equityToAssetsPct, 100);
  assert.equal(review.totalExposure, 4_000);
  assert.equal(review.riskDistribution.find(({ risk }) => risk === "high").count, 1);
  assert.match(review.ratioDefinitions.equityToAssets, /نتيجة الفترة قبل الضريبة/);
});

test("Benford analysis accounts for every positive row and uses bounded percentages", () => {
  const review = buildAnalyticalReview(accounts);

  assert.equal(review.benford.length, 9);
  assert.equal(review.benford.reduce((total, item) => total + item.count, 0), 5_000);
  assert.equal(review.benford.every(({ digit }, index) => digit === index + 1), true);
  assert.equal(review.benford.every(({ expectedPct, actualPct }) => (
    expectedPct > 0 && expectedPct < 100 && actualPct >= 0 && actualPct <= 100
  )), true);
  assert.equal(
    review.benfordFlags,
    review.benford.filter(({ flagged }) => flagged).length,
  );
});

test("insights retain the accounting and audit traceability needed for follow-up", () => {
  const review = buildAnalyticalReview(accounts);

  assert.deepEqual(review.insights.map(({ id }) => id), [
    "liquidity",
    "leverage",
    "margin",
    "concentration",
  ]);
  for (const insight of review.insights) {
    assert.ok(["low", "medium", "high"].includes(insight.severity));
    assert.match(insight.standard, /^(IAS|IFRS)/);
    assert.match(insight.auditStandard, /^ISA/);
    assert.ok(insight.detail.length > 20);
  }
});

test("empty input returns a safe zero-state instead of NaN or Infinity", () => {
  const review = buildAnalyticalReview([]);

  assert.deepEqual(review.ratios, {
    currentRatio: 0,
    quickRatio: 0,
    debtToEquity: 0,
    grossMarginPct: 0,
    operatingMarginPct: 0,
    netMarginBeforeTaxPct: 0,
    cashRatio: 0,
    debtToAssetsPct: 0,
    equityToAssetsPct: 0,
    interestCoverage: 0,
    receivablesDaysClosing: 0,
    inventoryDaysClosing: 0,
  });
  assert.equal(review.totalExposure, 0);
  assert.equal(review.highRiskExposure, 0);
  assert.equal(review.highRiskExposurePct, 0);
  assert.equal(review.topTenExposurePct, 0);
  assert.equal(review.areas.length, 0);
  assert.equal(review.benford.reduce((total, item) => total + item.count, 0), 0);
  assert.equal(JSON.stringify(review).includes("null"), false);
});

test("analytics UI does not present zero leverage as meaningful when equity is non-positive", async () => {
  const { readFile } = await import("node:fs/promises");
  const component = await readFile(new URL("../src/components/AnalyticsWorkspace.jsx", import.meta.url), "utf8");
  assert.match(component, /equityIsPositive/);
  assert.match(component, /غير قابل للتفسير/);
});

test("diagnostic chart data is deterministic, exact, and complete", () => {
  const review = buildAnalyticalReview(accounts);
  assert.equal(review.riskDistribution.reduce((total, item) => total + item.count, 0), accounts.length);
  assert.equal(review.largestBalances.length, 8);
  assert.equal(review.largestBalances.every((item) => /^\d+$/.test(item.amountMinor)), true);
  assert.equal(review.largestBalances.every((item, index, rows) => index === 0 || BigInt(rows[index - 1].amountMinor) >= BigInt(item.amountMinor)), true);

  const trend = buildRoundRiskTrend(
    [{ id: "R-1", findingIds: ["F-1", "F-2"] }, { id: "R-2", findingIds: ["F-3"] }],
    [{ id: "F-1", severity: "high" }, { id: "F-2", severity: "low" }, { id: "F-3", severity: "medium" }],
  );
  assert.deepEqual(trend.map(({ id, weightedScore }) => ({ id, weightedScore })), [{ id: "R-1", weightedScore: 4 }, { id: "R-2", weightedScore: 2 }]);
});
