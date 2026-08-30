import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  YOUTUBE_KNOWLEDGE_SOURCES,
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
} from "../src/applied-accounting.js";

test("video curriculum inventory is explicit, deduplicated, and non-authoritative", () => {
  assert.equal(YOUTUBE_KNOWLEDGE_SOURCES.length, 13);
  assert.equal(YOUTUBE_KNOWLEDGE_SOURCES.filter((item) => item.type === "playlist").length, 10);
  assert.equal(YOUTUBE_KNOWLEDGE_SOURCES.reduce((total, item) => total + item.count, 0), 516);
  assert.equal(YOUTUBE_KNOWLEDGE_SUMMARY.uniqueVideos, 465);
  assert.match(YOUTUBE_KNOWLEDGE_SUMMARY.note, /لا تُعامل.*كنص معياري/);
});

test("applied calculators produce deterministic, bounded scenario outputs", () => {
  assert.deepEqual(
    calculateInventoryNrv({ cost: 100, estimatedSellingPrice: 90, completionCost: 5, sellingCost: 5 }),
    {
      cost: 100,
      nrv: 80,
      carryingAmount: 80,
      writeDown: 20,
      conclusion: "يلزم تخفيض مبدئي",
    },
  );
  assert.equal(
    calculateInventoryNrv({ cost: 100, estimatedSellingPrice: 90, completionCost: -10, sellingCost: -5 }).nrv,
    90,
  );

  const ecl = calculateExpectedCreditLoss({ exposure: 1_000, probabilityOfDefault: 10, lossGivenDefault: 50, stage: 2 });
  assert.equal(ecl.loss, 50);
  assert.equal(ecl.coverageRatio, 5);
  assert.equal(ecl.horizon, "العمر الكامل");
  assert.deepEqual(
    calculateExpectedCreditLoss({ exposure: 1_000, probabilityOfDefault: 10, lossGivenDefault: 50, stage: "invalid" }),
    {
      exposure: 1_000,
      probabilityOfDefault: 10,
      lossGivenDefault: 50,
      loss: 50,
      coverageRatio: 5,
      horizon: "اثنا عشر شهرًا",
      probabilityBasis: "PD لاثني عشر شهرًا",
      stage: "1",
    },
  );

  const impairment = calculateImpairment({ carryingAmount: 1_000, fairValueLessCosts: 800, valueInUse: 900 });
  assert.equal(impairment.recoverableAmount, 900);
  assert.equal(impairment.impairmentLoss, 100);

  const deferredTax = calculateDeferredTax({ carryingAmount: 1_000, taxBase: 800, taxRate: 20, itemType: "asset" });
  assert.equal(deferredTax.amount, 40);
  assert.equal(deferredTax.direction, "liability");

  const eps = calculateEps({ profitAttributable: 100, weightedShares: 10, dilutiveShares: 10 });
  assert.equal(eps.basicEps, 10);
  assert.equal(eps.dilutedEps, 5);
  const antidilutive = calculateEps({ profitAttributable: -100, weightedShares: 10, dilutiveShares: 10 });
  assert.equal(antidilutive.basicEps, -10);
  assert.equal(antidilutive.dilutedEps, -10);
  assert.equal(antidilutive.potentialSharesIncluded, false);
  assert.equal(calculateEps({ profitAttributable: 100, weightedShares: 3, dilutiveShares: 0.00001 }).potentialSharesIncluded, true);
  assert.equal(calculateEps({ profitAttributable: 100, weightedShares: 0 }).basicEps, null);

  assert.equal(calculateGoodwill({ consideration: 100, nonControllingInterest: 20, netIdentifiableAssets: 110 }).goodwill, 10);
  assert.equal(calculateGoodwill({ consideration: 100, netIdentifiableAssets: 120 }).bargainPurchaseGain, 20);
  assert.match(calculateGoodwill({ consideration: 100, netIdentifiableAssets: 100 }).conclusion, /لا تظهر شهرة أو مكسب شراء/);
  assert.equal(calculateForeignCurrency({ foreignAmount: 100, transactionRate: 3, closingRate: 3.5, itemType: "asset" }).directionLabel, "مكسب صرف مبدئي");
  assert.equal(calculateForeignCurrency({ foreignAmount: 100, transactionRate: 3, closingRate: 3.5, itemType: "liability" }).directionLabel, "خسارة صرف مبدئية");
  assert.equal(calculateForeignCurrency({ foreignAmount: 100, transactionRate: 0, closingRate: 3.5 }).exchangeDifference, null);
});

test("IFRS 18 readiness is a transparent classification aid, not automatic adoption", () => {
  const accounts = [
    { id: "r", code: "4101", name: "إيراد عقود", category: "revenue", debit: 0, credit: 1_000 },
    { id: "c", code: "5101", name: "تكلفة الإيراد", category: "cogs", debit: 400, credit: 0 },
    { id: "f", code: "6201", name: "تكلفة تمويل", category: "financeCosts", debit: 50, credit: 0 },
    { id: "i", code: "4201", name: "إيراد توزيعات استثمار", category: "otherIncome", debit: 0, credit: 40 },
    { id: "o", code: "4202", name: "إيراد آخر", category: "otherIncome", debit: 0, credit: 10 },
    { id: "t", code: "6301", name: "مصروف ضريبة دخل", category: "expenses", debit: 120, credit: 0 },
    { id: "d", code: "4301", name: "ربح عملية غير مستمرة", category: "otherIncome", debit: 0, credit: 30 },
  ];
  const readiness = buildIfrs18Readiness(accounts, {});

  assert.equal(readiness.totals.operatingProfit, 610);
  assert.equal(readiness.totals.profitBeforeFinancingAndTax, 650);
  assert.equal(readiness.totals.profitBeforeTax, 600);
  assert.equal(readiness.totals.profitFromContinuingOperations, 480);
  assert.equal(readiness.totals.profitAfterTax, 510);
  assert.equal(readiness.reviewRequired.length, 2);
  assert.equal(readiness.rows.find((item) => item.id === "investing").total, 40);
  assert.equal(readiness.readinessChecks.find((item) => item.id === "effective-date").pass, false);
});

test("IFRS 18 readiness records human classification, transition, MPM, and aggregation decisions independently", () => {
  const readiness = buildIfrs18Readiness([
    { id: "r", code: "4101", name: "إيراد عقود", category: "revenue", debit: 0, credit: 100 },
  ], {
    ifrs18: {
      classificationReviewed: true,
      transitionPlanDocumented: true,
      mpmReconciled: true,
      aggregationReviewed: true,
    },
  });
  const checks = Object.fromEntries(readiness.readinessChecks.map((item) => [item.id, item]));

  assert.equal(checks["effective-date"].pass, true);
  assert.match(checks["effective-date"].detail, /خطة الانتقال موثقة/);
  assert.equal(checks.mpm.pass, true);
  assert.equal(checks.aggregation.pass, true);
  assert.equal(checks.classification.pass, true);
});

test("IFRS 18 effective-period documentation is distinct from a pre-effective transition plan", () => {
  const readiness = buildIfrs18Readiness([], {
    entity: { period: "السنة المنتهية في 31 ديسمبر 2027" },
    ifrs18: { effectiveForPeriodDocumented: true },
  });
  const effective = readiness.readinessChecks.find((item) => item.id === "effective-date");
  assert.equal(effective.pass, true);
  assert.equal(effective.documentationField, "effectiveForPeriodDocumented");
  assert.match(effective.detail, /1 يناير 2027/);
});

test("accounting cycle readiness links data, adjustments, review, locks, and human approval", () => {
  const accounts = [
    { category: "cash", debit: 100, credit: 0 },
    { category: "revenue", debit: 0, credit: 100 },
    { category: "receivables", debit: 50, credit: 0 },
    { category: "payables", debit: 0, credit: 50 },
    { category: "inventory", debit: 20, credit: 0 },
    { category: "equity", debit: 0, credit: 20 },
    { category: "ppe", debit: 30, credit: 0 },
    { category: "debt", debit: 0, credit: 30 },
  ];
  const engagement = {
    entity: { period: "السنة المنتهية في 31 ديسمبر 2025م" },
    adjustments: [{
      status: "accepted",
      journalReference: "J-1",
      reviewedAt: "2026-08-20T10:00:00.000Z",
      postedAt: "2026-08-20T11:00:00.000Z",
      reviewedBy: "مدير المراجعة",
      currency: "SAR",
      amountMinor: "10000",
      lines: [
        { accountId: "cash", code: "1101", name: "النقد", debitMinor: "10000", creditMinor: "0" },
        { accountId: "revenue", code: "4101", name: "الإيراد", debitMinor: "0", creditMinor: "10000" },
      ],
    }],
    analyticsReview: { acknowledged: true },
    periodLocks: [{ id: "2025-12", status: "locked" }],
    humanApproval: true,
    report: { status: "ready" },
  };
  const cycle = buildAccountingCycleReadiness(accounts, engagement);
  const summary = buildAppliedAccountingSummary(accounts, engagement);

  assert.equal(cycle.length, 12);
  assert.equal(cycle.find((item) => item.id === "statements").status, "complete");
  assert.equal(cycle.find((item) => item.id === "report").status, "review");
  assert.equal(summary.cycleComplete, 11);
  assert.equal(summary.cycleTotal, 12);
});

test("report readiness requires a lock that matches the reporting period", () => {
  const accounts = [
    { category: "cash", debit: 100, credit: 0 },
    { category: "revenue", debit: 0, credit: 100 },
  ];
  const cycle = buildAccountingCycleReadiness(accounts, {
    entity: { period: "السنة المنتهية في 31 ديسمبر 2025م" },
    periodLocks: [{ id: "2024-12", status: "locked" }, { id: "2025-12", status: "open" }],
    humanApproval: true,
    report: { status: "ready" },
  });
  assert.equal(cycle.find((item) => item.id === "report").status, "review");
});

test("an imported trial balance does not masquerade as subsidiary ledgers or external evidence", () => {
  const accounts = [
    { category: "cash", debit: 100, credit: 0 },
    { category: "revenue", debit: 0, credit: 100 },
  ];
  const cycle = buildAccountingCycleReadiness(accounts, {
    sourceDataset: { source: "import" },
    adjustments: [],
    analyticsReview: { acknowledged: false },
  });

  assert.equal(cycle.find((item) => item.id === "statements").status, "complete");
  assert.equal(cycle.find((item) => item.id === "recording").status, "review");
  assert.match(cycle.find((item) => item.id === "recording").detail, /دفتر أستاذ/);
  assert.equal(cycle.find((item) => item.id === "cash").status, "review");
  assert.match(cycle.find((item) => item.id === "cash").detail, /كشف بنك/);
  assert.equal(cycle.find((item) => item.id === "revenue").status, "review");
  assert.match(cycle.find((item) => item.id === "revenue").detail, /العقود/);
});

test("applied lab is local, responsive, contextual, and exports a governed report", async () => {
  const [component, css, standardsCenter] = await Promise.all([
    readFile(new URL("../src/components/AppliedAccountingLab.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/applied-accounting.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/StandardsCenter.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(component, /مختبر التطبيق المحاسبي/);
  assert.match(component, /نماذج القياس التطبيقية/);
  assert.match(component, /استعداد IFRS 18/);
  assert.match(component, /دورة المحاسبة والإقفال/);
  assert.match(component, /getAccountStandardIds/);
  assert.doesNotMatch(component, /includeSuggested/);
  assert.match(component, /resolveAccountMapping/);
  assert.match(component, /onKeyDown=\{\(event\) => handleModelTabKeyDown/);
  assert.match(component, /aria-invalid=\{Boolean\(fieldErrors\[field\.id\]\)\}/);
  assert.match(component, /aria-label=\{`\$\{engagement\.ifrs18/);
  assert.match(component, /createAppliedAccountingDocxBlob/);
  assert.match(component, /kosif-applied-accounting-pack\.docx/);
  assert.doesNotMatch(component, /application\/msword/);
  assert.match(component, /const inputRows = modelFields\[model\]/);
  assert.match(component, /modelMeta\.formula/);
  assert.match(component, /linkedInput\?\.categories/);
  assert.match(component, /classification: "classificationReviewed"/);
  assert.match(component, /لا تنشئ قيدًا ولا تعتمد معالجة تلقائيًا/);
  assert.match(component, /documentationField[\s\S]*transitionPlanDocumented/);
  assert.match(component, /field\.id === "weightedShares"/);
  assert.match(component, /standardMappings\?\.review\?\.reviewer/);
  assert.match(component, /setEngagement\(\(current\) =>/);
  assert.doesNotMatch(component, /\bfetch\s*\(/);
  assert.doesNotMatch(component, /https?:\/\//);
  assert.match(standardsCenter, /<AppliedAccountingLab[\s\S]*engagement=\{engagement\}[\s\S]*setEngagement=\{setEngagement\}/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
