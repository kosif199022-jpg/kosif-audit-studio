import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createImportedAccount, generateTrialBalance } from "../src/data.js";
import { createAuditRounds } from "../src/audit-rounds.js";
import {
  applyMappingReview,
  areaProfiles,
  buildMappingMetrics,
  buildStandardsCoverage,
  bulkReviewMappings,
  createStandardMappings,
  getAccountStandardIds,
  getAccountStandardLinks,
  resolveAccountMapping,
  standardCatalog,
  standardReferenceLocators,
  standardsById,
} from "../src/standards.js";

const accounts = generateTrialBalance();

test("catalog and all 20 accounting areas have complete, valid standard links", () => {
  assert.equal(Object.keys(areaProfiles).length, 20);
  assert.equal(standardsById.size, standardCatalog.length);
  assert.ok(standardCatalog.some(({ id }) => id === "IFRS 18"));
  assert.ok(standardCatalog.some(({ id }) => id === "IFRS 19"));
  assert.ok(standardCatalog.some(({ id }) => id === "ISA 250"));

  for (const [areaKey, profile] of Object.entries(areaProfiles)) {
    assert.ok(profile.label, `${areaKey} must have an Arabic label`);
    assert.ok(profile.nature, `${areaKey} must have an accounting nature`);
    assert.ok(profile.accountingStandards.length > 0, `${areaKey} must link an accounting standard`);
    assert.ok(profile.auditStandards.length > 0, `${areaKey} must link an audit standard`);
    assert.ok(profile.assertions.length > 0, `${areaKey} must link assertions`);
    assert.ok(profile.risks.length > 0, `${areaKey} must link risks`);
    assert.ok(profile.procedures.length > 0, `${areaKey} must link procedures`);
    assert.ok(profile.evidence.length > 0, `${areaKey} must link evidence`);

    for (const id of [...profile.accountingStandards, ...profile.auditStandards]) {
      assert.ok(standardsById.has(id), `${areaKey} references unknown standard ${id}`);
    }
    assert.equal(
      profile.accountingStandards.every((id) => standardsById.get(id).type === "accounting"),
      true,
    );
    assert.equal(
      profile.auditStandards.every((id) => standardsById.get(id).type === "audit"),
      true,
    );
  }
});

test("every audit round opens a real catalog entry", () => {
  const rounds = createAuditRounds();
  assert.equal(rounds.length, 20);
  for (const round of rounds) {
    assert.ok(round.standards.length > 0, `${round.id} must reference standards`);
    for (const id of round.standards) {
      assert.ok(standardsById.has(id), `${round.id} references unknown standard ${id}`);
    }
  }
});

test("generated rows expose an auditable chain from account to evidence", () => {
  assert.equal(accounts.length, 5_000);
  assert.equal(new Set(accounts.map(({ category }) => category)).size, 20);

  for (const account of accounts) {
    const profile = areaProfiles[account.category];
    assert.ok(profile, `${account.code} has an unknown area`);
    assert.equal(account.areaLabel, profile.label);
    assert.deepEqual(account.standards, profile.accountingStandards);
    assert.deepEqual(account.auditStandards, profile.auditStandards);
    assert.deepEqual(account.assertions, profile.assertions);
    assert.deepEqual(account.risks, profile.risks);
    assert.deepEqual(account.procedures, profile.procedures);
    assert.deepEqual(account.evidence, profile.evidence);
  }
});

test("adds IAS 21 only for documented foreign-currency monetary accounts", () => {
  const foreign = accounts.find(({ foreignCurrency, monetaryItem }) => foreignCurrency && monetaryItem);
  const domestic = accounts.find(({ currency, functionalCurrency, monetaryItem }) => (
    currency === "SAR" && functionalCurrency === "SAR" && monetaryItem
  ));

  assert.ok(foreign);
  assert.ok(domestic);
  const foreignResolution = resolveAccountMapping(foreign, createStandardMappings());
  const foreignLinks = getAccountStandardLinks(foreign, createStandardMappings());
  const domesticLinks = getAccountStandardLinks(domestic, createStandardMappings());
  const ias21 = foreignLinks.find(({ id }) => id === "IAS 21");

  assert.ok(foreignResolution.accountingStandardIds.includes("IAS 21"));
  assert.deepEqual(foreignResolution.contextualStandardIds, ["IAS 21"]);
  assert.ok(ias21);
  assert.equal(ias21.role, "foreign-currency-measurement");
  assert.equal(ias21.contextual, true);
  assert.match(ias21.rationale, /USD|EUR/);
  assert.match(ias21.rationale, /SAR/);
  assert.equal(domesticLinks.some(({ id }) => id === "IAS 21"), false);
  assert.deepEqual(resolveAccountMapping(domestic, createStandardMappings()).contextualStandardIds, []);
});

test("mapping metrics distinguish suggestions, manual reviews, and unresolved rows", () => {
  const initial = createStandardMappings();
  const initialMetrics = buildMappingMetrics(accounts, initial);

  assert.deepEqual(initialMetrics, {
    accountCount: 5_000,
    total: 5_000,
    suggested: 4_974,
    auto: 4_974,
    reviewed: 0,
    reviewRequired: 26,
    resolved: 4_974,
    mapped: 4_974,
    unresolved: 26,
    mappingRate: 99.5,
    overrideCount: 0,
  });

  const unresolvedAccount = accounts.find(({ mapped }) => !mapped);
  assert.ok(unresolvedAccount);
  assert.equal(resolveAccountMapping(unresolvedAccount, initial).status, "review_required");
  assert.deepEqual(getAccountStandardIds(unresolvedAccount, initial), []);
  assert.ok(getAccountStandardIds(unresolvedAccount, initial, { includeSuggested: true }).length > 0);

  const reviewed = applyMappingReview(
    initial,
    unresolvedAccount,
    unresolvedAccount.suggestedStandardIds,
    {
      reviewer: "مدير المراجعة",
      rationale: "فحص طبيعة الرصيد والمستندات",
      reviewedAt: "2026-08-27T12:00:00.000Z",
    },
  );

  assert.notEqual(reviewed, initial);
  assert.deepEqual(initial, { schemaVersion: 1, overrides: {} });
  const resolution = resolveAccountMapping(unresolvedAccount, reviewed);
  assert.equal(resolution.status, "reviewed");
  assert.equal(resolution.reviewer, "مدير المراجعة");
  assert.deepEqual(resolution.accountingStandardIds, unresolvedAccount.suggestedStandardIds);
  assert.ok(resolution.effectiveStandardIds.every((id) => standardsById.has(id)));
});

test("manual mapping rejects unknown and audit-only ids from the accounting override", () => {
  const account = accounts.find(({ mapped }) => !mapped);
  const reviewed = applyMappingReview(createStandardMappings(), account, [
    "UNKNOWN 999",
    "ISA 500",
    "IFRS 15",
    "IFRS 15",
  ], {
    reviewer: "مدير المراجعة",
    rationale: "تصحيح الربط بعد فحص طبيعة الحساب",
    reviewedAt: "2026-08-27T12:30:00.000Z",
  });

  assert.deepEqual(reviewed.overrides[account.id].standardIds, ["IFRS 15"]);
  assert.deepEqual(resolveAccountMapping(account, reviewed).accountingStandardIds, ["IFRS 15"]);
});

test("bulk review only persists the 26 accounts that require a decision", () => {
  const reviewed = bulkReviewMappings(accounts, createStandardMappings(), {
    reviewer: "شريك الارتباط",
    rationale: "اعتماد الاقتراح بعد فحص قائمة الاستثناءات",
    reviewedAt: "2026-08-27T13:00:00.000Z",
  });
  const metrics = buildMappingMetrics(accounts, reviewed);

  assert.equal(Object.keys(reviewed.overrides).length, 26);
  assert.equal(reviewed.lastBulkReview.reviewedCount, 26);
  assert.equal(metrics.suggested, 4_974);
  assert.equal(metrics.reviewed, 26);
  assert.equal(metrics.unresolved, 0);
  assert.equal(metrics.mappingRate, 100);
});

test("coverage keeps unresolved exposure separate until a reviewer confirms it", () => {
  const account = accounts.find(({ mapped }) => !mapped);
  const initialCoverage = buildStandardsCoverage([account], createStandardMappings());
  const suggestedId = account.suggestedStandardIds[0];
  const initialItem = initialCoverage.find(({ id }) => id === suggestedId);

  assert.equal(initialItem.accountCount, 0);
  assert.equal(initialItem.reviewRequiredAccountCount, 1);
  assert.equal(initialItem.reviewRequiredExposure, account.amount);

  const reviewedState = applyMappingReview(
    createStandardMappings(),
    account,
    account.suggestedStandardIds,
    {
      reviewer: "مدير المراجعة",
      rationale: "اعتماد الربط بعد فحص الحساب",
      reviewedAt: "2026-08-27T12:45:00.000Z",
    },
  );
  const reviewedItem = buildStandardsCoverage([account], reviewedState)
    .find(({ id }) => id === suggestedId);

  assert.equal(reviewedItem.accountCount, 1);
  assert.equal(reviewedItem.reviewedAccountCount, 1);
  assert.equal(reviewedItem.reviewRequiredAccountCount, 0);
  assert.equal(reviewedItem.totalExposure, account.amount);
  assert.ok(reviewedItem.areas.includes(account.areaLabel));
  assert.ok(reviewedItem.risks.length > 0);
  assert.ok(reviewedItem.procedures.length > 0);
  assert.ok(reviewedItem.evidence.length > 0);
});

test("empty or anonymous overrides remain unresolved and cannot masquerade as reviewed", () => {
  const account = accounts.find(({ mapped }) => !mapped);
  assert.throws(() => applyMappingReview(createStandardMappings(), account, [], {
    reviewer: "",
    rationale: "",
    reviewedAt: "invalid",
  }));
  const forged = { schemaVersion: 1, overrides: { [account.id]: { standardIds: [] } } };
  assert.equal(resolveAccountMapping(account, forged).status, "review_required");
  assert.equal(buildMappingMetrics([account], forged).unresolved, 1);
});

test("future IFRS 18 stays in the catalog but is not a default 2025 account mapping", () => {
  assert.ok(standardsById.has("IFRS 18"));
  assert.ok(standardsById.has("IFRS 19"));
  assert.equal(areaProfiles.expenses.accountingStandards.includes("IFRS 18"), false);
  assert.equal(areaProfiles.otherIncome.accountingStandards.includes("IFRS 18"), false);
  assert.equal(Object.values(areaProfiles).some((profile) => profile.accountingStandards.includes("IFRS 19")), false);
});

test("restored IFRS 5, IFRS 17, and IAS 27 stay available without automatic account mapping", () => {
  for (const id of ["IFRS 5", "IFRS 17", "IAS 27"]) {
    const standard = standardsById.get(id);
    assert.ok(standard, id);
    assert.equal(standard.locatorStatus, "official-only");
    assert.deepEqual(standard.referenceLocators, []);
    assert.ok(standard.officialSourceIds.includes("ifrs-navigator"));
    assert.equal(Object.values(areaProfiles).some((profile) => profile.accountingStandards.includes(id)), false);
  }
});

test("every standard exposes click-through description, scope, and source metadata", () => {
  for (const standard of standardCatalog) {
    assert.ok(standard.summary);
    assert.ok(Array.isArray(standard.scope) && standard.scope.length > 0, `${standard.id} scope`);
    assert.ok(Array.isArray(standard.references), `${standard.id} references`);
    assert.ok(standard.source);
  }
});

test("accounting standards use safe locators or an explicit official-only future reference", () => {
  const accountingStandards = standardCatalog.filter(({ type }) => type === "accounting");
  const forbidden = new Set(["rawText", "excerpt", "path", "blob", "bytes", "content"]);

  for (const standard of accountingStandards) {
    if (["IFRS 19", "IFRS 5", "IFRS 17", "IAS 27"].includes(standard.id)) {
      assert.deepEqual(standard.referenceLocators, []);
      assert.ok(standard.officialSourceIds.includes("ifrs-navigator"));
      if (standard.id === "IFRS 19") assert.match(standard.effective, /2027|التطبيق المبكر/);
      else assert.equal(standard.locatorStatus, "official-only");
      continue;
    }
    assert.ok(standard.referenceLocators.length > 0, `${standard.id} locator`);
    assert.deepEqual(standard.referenceLocators, standardReferenceLocators[standard.id]);
    for (const reference of standard.referenceLocators) {
      assert.equal(reference.referenceId, "ifrs-ar-2025");
      assert.equal(reference.edition, "2025");
      assert.equal(reference.access, "locator-only");
      assert.ok(reference.printedStart <= reference.printedEnd, `${standard.id} printed range`);
      assert.equal(reference.pdfStart, reference.printedStart + 1, `${standard.id} PDF start`);
      assert.equal(reference.pdfEnd, reference.printedEnd + 1, `${standard.id} PDF end`);
      assert.ok(reference.pdfEnd <= 1464, `${standard.id} PDF bound`);
      for (const key of Object.keys(reference)) assert.equal(forbidden.has(key), false, `${standard.id} leaks ${key}`);
    }
  }

  assert.deepEqual(
    standardReferenceLocators["SOCPA ZAKAT"].map(({ printedStart, printedEnd }) => [printedStart, printedEnd]),
    [[1389, 1393]],
  );
  assert.deepEqual(
    standardReferenceLocators["IAS 8"].map(({ printedStart, printedEnd, applicability }) => [printedStart, printedEnd, applicability || null]),
    [[874, 884, null], [885, 900, "ifrs-18-transition-only"]],
  );
  assert.equal(standardsById.get("IFRS 18").referenceLocators[0].applicability, "future-or-early-adoption");
});

test("audit standards use issuer links without invented attached-page locations", () => {
  for (const standard of standardCatalog.filter(({ type }) => type === "audit")) {
    assert.deepEqual(standard.referenceLocators, []);
    assert.ok(standard.officialSourceIds.includes("iaasb-projects"));
  }
});

test("standard reader only presents an account context for a real selected link", async () => {
  const reader = await readFile(new URL("../src/components/StandardsCenter.jsx", import.meta.url), "utf8");
  assert.match(reader, /requestedAccount\s*&&\s*requestedAccountLink/);
  assert.match(reader, /selectedStandard\?\.id === requestedStandardId/);
  assert.match(reader, /لماذا ينطبق؟/);
  assert.match(reader, /ماذا يفحص المراجع؟/);
  assert.match(reader, /ما الدليل المتوقع؟/);
  assert.match(reader, /requestedAccount\?\.procedures/);
  assert.match(reader, /requestedAccount\?\.evidence/);
  assert.doesNotMatch(reader, /يعرض هذا السياق سبب انطباق المعيار/);
});

test("imported account name conflicts are routed to human review", () => {
  const conflict = createImportedAccount({ code: "110001", name: "مخزون آخر المدة", debitMinor: "10000", creditMinor: "0" });
  assert.equal(conflict.classificationConflict, true);
  assert.equal(conflict.mapped, false);
  assert.equal(resolveAccountMapping(conflict, createStandardMappings()).status, "review_required");
});
