import assert from "node:assert/strict";
import test from "node:test";
import {
  OPEN_DECISION_POLICY,
  appendAuditEntry,
  assessMisstatements,
  buildMateriality,
  buildStatementRun,
  createTrialBalanceLedger,
  exceeds,
  isa705Decide,
  normalizeAr,
  parseMinorUnits,
  runJETests,
  traceFigure,
  validateClaimProposal,
  verifyAuditChain,
} from "../src/audit-core.js";

const accounts = [
  { id: "a-cash", category: "cash", debitMinor: "100000", creditMinor: "0" },
  { id: "a-equity", category: "equity", debitMinor: "0", creditMinor: "55000" },
  { id: "a-revenue", category: "revenue", debitMinor: "0", creditMinor: "50000" },
  { id: "a-other-income", category: "otherIncome", debitMinor: "0", creditMinor: "5000" },
  { id: "a-expense", category: "expenses", debitMinor: "10000", creditMinor: "0" },
];

function statementRun(effectiveAt = "2026-08-30T10:00:00.000Z") {
  return buildStatementRun({
    engagementId: "eng_test",
    accounts,
    journalLines: createTrialBalanceLedger(accounts, "eng_test"),
    rulesetVersion: "KOSIF-RULES-1",
    effectiveAt,
  });
}

test("R1 rejects objects and numbers in materiality comparisons", () => {
  assert.throws(() => exceeds({ amount: 2n }, 1n), /requires bigint/);
  assert.throws(() => exceeds(2, 1n), /requires bigint/);
  assert.equal(exceeds(2n, 1n), true);
  assert.equal(exceeds(-2n, 1n), true);
  assert.equal(exceeds(1n, 1n), false);
});

test("A1 statement reruns keep the same figure ids and values", () => {
  const first = statementRun("2026-08-30T10:00:00.000Z");
  const second = statementRun("2026-08-31T10:00:00.000Z");
  assert.deepEqual(
    first.figures.map(({ id, scopeKey, valueInt }) => ({ id, scopeKey, valueInt })),
    second.figures.map(({ id, scopeKey, valueInt }) => ({ id, scopeKey, valueInt })),
  );
  assert.equal(first.balanceCheck.balanced, true);
  assert.equal(first.balanceCheck.differenceMinor, "0");
});

test("A2 every displayed figure has a complete trace ending at journal lines", () => {
  const graph = statementRun();
  for (const figure of graph.figures) {
    const trace = traceFigure(graph, figure.id);
    assert.ok(trace.steps.length >= 1);
    assert.equal(trace.sources.every(({ kind }) => kind === "journal_line"), true);
  }
  const broken = structuredClone(graph);
  broken.derivations[0].inputNodeIds.push("pvn_missing");
  assert.throws(() => traceFigure(broken, broken.figures[0].id), /missing input node/);
});

test("contract revenue remains a distinct traceable materiality benchmark", () => {
  const graph = statementRun();
  const revenue = graph.figures.find(({ scopeKey }) => scopeKey === "IS.REVENUE");
  const otherIncome = graph.figures.find(({ scopeKey }) => scopeKey === "IS.OTHER_INCOME");
  const netResult = graph.figures.find(({ scopeKey }) => scopeKey === "IS.NET_RESULT");
  assert.equal(revenue.valueInt, "50000");
  assert.equal(otherIncome.valueInt, "5000");
  assert.equal(netResult.valueInt, "45000");
  assert.equal(traceFigure(graph, revenue.id).sources.length, 1);
  assert.equal(traceFigure(graph, otherIncome.id).sources.length, 1);
});

test("materiality uses basis points and integer minor units only", () => {
  const materiality = buildMateriality({
    benchmarkMinor: "100000000",
    omRateBp: 500,
    pmRateBp: 7500,
    cttRateBp: 500,
    rationaleAr: "اعتمد الربح قبل الزكاة والضريبة لاستقراره خلال الفترة.",
  });
  assert.deepEqual(materiality, {
    benchmarkMinor: "100000000",
    omMinor: "5000000",
    pmMinor: "3750000",
    cttMinor: "250000",
    omRateBp: 500,
    pmRateBp: 7500,
    cttRateBp: 500,
    rationaleAr: "اعتمد الربح قبل الزكاة والضريبة لاستقراره خلال الفترة.",
  });
  assert.throws(() => buildMateriality({ benchmarkMinor: 100, omRateBp: 500, pmRateBp: 7500, cttRateBp: 500, rationaleAr: "تبرير مهني كاف ومكتوب" }), /canonical integer string/);
});

test("A4 ISA 705 decision table is complete and type is derived", () => {
  const cases = [
    [{ basis: "none", isMaterial: false, isPervasive: false }, "unmodified"],
    [{ basis: "misstatement", isMaterial: false, isPervasive: false }, "unmodified"],
    [{ basis: "misstatement", isMaterial: true, isPervasive: false }, "qualified"],
    [{ basis: "misstatement", isMaterial: true, isPervasive: true }, "adverse"],
    [{ basis: "scope_limitation", isMaterial: true, isPervasive: true }, "disclaimer"],
    [{ basis: "scope_limitation", isMaterial: true, isPervasive: false }, "qualified"],
  ];
  for (const [input, expected] of cases) assert.equal(isa705Decide(input), expected);
  assert.equal(assessMisstatements([], "1000", { basis: "misstatement" }).opinionType, "unmodified");
  assert.equal(assessMisstatements([{ amountMinor: "1001", corrected: false }], "1000", { basis: "misstatement" }).opinionType, "qualified");
  assert.equal(assessMisstatements([{ amountMinor: "1", corrected: false, qualitative: true, qualitativeRationaleAr: "معاملة طرف ذي علاقة لم يفصح عنها كما يلزم." }], "1000", { basis: "misstatement" }).isMaterial, true);
});

test("materiality does not net overstatements against understatements", () => {
  const material = assessMisstatements([
    { amountMinor: "1001", corrected: false },
    { amountMinor: "-1001", corrected: false },
  ], "1000");
  assert.equal(material.netMinor, "0");
  assert.equal(material.grossMinor, "2002");
  assert.equal(material.quantitativeExposureMinor, "1001");
  assert.equal(material.quantitativeBasis, "max_directional_aggregate_without_netting");
  assert.equal(material.isMaterial, true);

  const immaterial = assessMisstatements([
    { amountMinor: "600", corrected: false },
    { amountMinor: "-600", corrected: false },
  ], "1000");
  assert.equal(immaterial.isMaterial, false);

  const directionalAggregate = assessMisstatements([
    { amountMinor: "600", corrected: false },
    { amountMinor: "600", corrected: false },
    { amountMinor: "-1200", corrected: false },
  ], "1000");
  assert.equal(directionalAggregate.overstatementMinor, "1200");
  assert.equal(directionalAggregate.understatementMinor, "1200");
  assert.equal(directionalAggregate.isMaterial, true);

  assert.equal(assessMisstatements([{ amountMinor: "5000", corrected: true }], "1000").isMaterial, false);
  assert.equal(assessMisstatements([{ amountMinor: "1000", corrected: false }], "1000").isMaterial, false);
});

test("scope limitations use documented human materiality and deterministic ISA 705 output", () => {
  const qualified = assessMisstatements([], "1000", {
    basis: "scope_limitation",
    scopeLimitationIsMaterial: true,
    scopeLimitationRationaleAr: "تعذر الحصول على أدلة كافية بشأن رصيد جوهري.",
  });
  assert.equal(qualified.opinionType, "qualified");

  const disclaimer = assessMisstatements([], "1000", {
    basis: "scope_limitation",
    scopeLimitationIsMaterial: true,
    scopeLimitationRationaleAr: "تعذر الحصول على أدلة كافية بشأن نطاق واسع من الأرصدة.",
    isPervasive: true,
    pervasivenessRationaleAr: "يمتد القيد إلى عناصر متعددة وأساسية في القوائم المالية.",
  });
  assert.equal(disclaimer.opinionType, "disclaimer");
  assert.throws(() => assessMisstatements([], "1000", {
    basis: "scope_limitation",
    scopeLimitationIsMaterial: true,
    scopeLimitationRationaleAr: "قصير",
  }), /documented human rationale/);
});

test("A5 ClaimValidator rejects unclaimed, mismatched, and opinion-bearing narratives", () => {
  const facts = [{ id: "fact_cash", engagement_id: "eng_test", unit: "halala", value_num: "125000000" }];
  const base = {
    engagement_id: "eng_test",
    text_ar: "بلغ النقد 1,250,000.00 ريال.",
    claims: [{ span: [10, 22], fact_id: "fact_cash", relation: "value_of" }],
  };
  assert.deepEqual(validateClaimProposal(base, facts), { status: "passed" });
  assert.equal(validateClaimProposal({ ...base, claims: [] }, facts).code, "unclaimed_number");
  assert.equal(validateClaimProposal({ ...base, text_ar: "بلغ النقد 1,200,000.00 ريال." }, facts).code, "fact_value_mismatch");
  assert.equal(validateClaimProposal({ ...base, text_ar: `${base.text_ar} والرأي متحفظ.` }, facts).code, "opinion_language_forbidden");
  assert.equal(validateClaimProposal({ ...base, text_ar: "بلغ النقد مليون ريال." }, facts).code, "spelled_number_forbidden");
});

test("A6 audit integrity reports the first injected change", () => {
  const first = appendAuditEntry([], { engagementId: "eng_test", actor: "partner", action: "created", payload: { version: 1 }, at: "2026-08-30T10:00:00.000Z" });
  const second = appendAuditEntry([first], { engagementId: "eng_test", actor: "manager", action: "mapped", payload: { set: "map_1" }, at: "2026-08-30T11:00:00.000Z" });
  assert.equal(verifyAuditChain([first, second], "eng_test").valid, true);
  assert.deepEqual(verifyAuditChain([first, { ...second, action: "changed" }], "eng_test"), { valid: false, brokenSeq: 2 });
});

test("A8 Arabic normalization and monetary parsing preserve exact halalas", () => {
  assert.equal(normalizeAr("  إِيــرَاد ١٢٣  "), "ايراد 123");
  assert.equal(parseMinorUnits("١٬٢٣٤٫٥٠"), 123450n);
  assert.equal(parseMinorUnits("(۹۹٫۰۵)"), -9905n);
  assert.throws(() => parseMinorUnits("1.005"), /precision/);
});

test("all ten ISA 240 journal-entry tests produce versioned deterministic findings", () => {
  const entries = [
    {
      id: "je-1", entryNo: "1", entryDate: "2025-12-26", postedDate: "2026-01-02", postedBy: "rare-user", isManual: true,
      lines: [
        { accountId: "revenue", accountCode: "4100", debitMinor: "0", creditMinor: "99990000" },
        { accountId: "cash", accountCode: "1100", debitMinor: "99980000", creditMinor: "0" },
      ],
    },
    { id: "je-2", entryNo: "3", entryDate: "2025-12-28", postedDate: "2025-12-28", postedBy: "main", lines: [{ accountId: "a", accountCode: "1200", debitMinor: "10000000", creditMinor: "0" }, { accountId: "b", accountCode: "2100", debitMinor: "0", creditMinor: "10000000" }] },
  ];
  const findings = runJETests(entries, {
    periodEnd: "2025-12-31",
    holidays: ["2025-12-28"],
    calendarVersion: "SA-2025-v1",
    revenueAccountIds: ["revenue"],
    approvalLimitsMinor: ["100000000"],
    thresholdMarginBp: 100,
    rareUserRateBp: 6000,
    benfordMinimumPopulation: 2,
    benfordDeviationBp: 1,
    roundZeros: 4,
  });
  const codes = new Set(findings.map(({ testCode }) => testCode));
  for (const code of ["JE.ROUND", "JE.WEEKEND", "JE.AFTER_END", "JE.RARE_PAIR", "JE.MANUAL_REV", "JE.THRESHOLD", "JE.RARE_USER", "JE.BENFORD", "JE.UNBALANCED", "JE.SEQ_GAP"]) {
    assert.equal(codes.has(code), true, `missing ${code}`);
  }
  assert.equal(findings.every(({ testVersion, id }) => testVersion === "1.0.0" && /^fnd_[a-f0-9]{26}$/.test(id)), true);
  assert.deepEqual(findings, runJETests(entries, {
    periodEnd: "2025-12-31", holidays: ["2025-12-28"], calendarVersion: "SA-2025-v1", revenueAccountIds: ["revenue"], approvalLimitsMinor: ["100000000"], thresholdMarginBp: 100, rareUserRateBp: 6000, benfordMinimumPopulation: 2, benfordDeviationBp: 1, roundZeros: 4,
  }));
});

test("open architecture decisions are explicit and fail-safe", () => {
  assert.deepEqual(OPEN_DECISION_POLICY, {
    pervasiveness: "overall_opinion_assessment_with_human_rationale",
    unauditedOpeningBalances: "isa510_finding_then_human_scope_assessment",
    holidayCalendar: "versioned_vendored_sa_calendar_no_runtime_fetch",
    qualitativeMateriality: "phase1_human_override_with_category_and_rationale",
  });
});
