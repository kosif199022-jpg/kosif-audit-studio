import assert from "node:assert/strict";
import test from "node:test";
import { createImportedAccount, generateTrialBalance } from "../src/data.js";

const toCents = (value) => Math.round(value * 100);

test("generates exactly 5,000 deterministic trial-balance accounts", () => {
  const first = generateTrialBalance();
  const second = generateTrialBalance();

  assert.equal(first.length, 5_000);
  assert.deepEqual(second, first);
});

test("keeps the generated trial balance exactly balanced in cents", () => {
  const accounts = generateTrialBalance();
  const totals = accounts.reduce(
    (result, account) => {
      assert.ok(Number.isFinite(account.debit));
      assert.ok(Number.isFinite(account.credit));
      assert.ok(account.debit >= 0);
      assert.ok(account.credit >= 0);
      assert.notEqual(account.debit > 0, account.credit > 0, `${account.code} must be one-sided`);

      result.debit += toCents(account.debit);
      result.credit += toCents(account.credit);
      return result;
    },
    { debit: 0, credit: 0 },
  );

  assert.equal(totals.debit, totals.credit);
  assert.ok(totals.debit > 0);
});

test("stores every balance as an exact SAR-equivalent minor-unit integer with currency metadata", () => {
  const accounts = generateTrialBalance();
  const foreignAccounts = accounts.filter(({ foreignCurrency }) => foreignCurrency);
  const totals = accounts.reduce(
    (result, account) => {
      assert.ok(["SAR", "USD", "EUR"].includes(account.currency));
      assert.equal(account.functionalCurrency, "SAR");
      assert.equal(account.balanceCurrency, "SAR");
      assert.equal(account.amountBasis, "functional-currency-equivalent");
      assert.equal(account.exponent, 2);
      assert.match(account.debitMinor, /^\d+$/);
      assert.match(account.creditMinor, /^\d+$/);
      assert.match(account.amountMinor, /^\d+$/);

      const debitMinor = BigInt(account.debitMinor);
      const creditMinor = BigInt(account.creditMinor);
      const amountMinor = BigInt(account.amountMinor);
      assert.equal(debitMinor, BigInt(toCents(account.debit)));
      assert.equal(creditMinor, BigInt(toCents(account.credit)));
      assert.equal(amountMinor, debitMinor + creditMinor);

      result.debit += debitMinor;
      result.credit += creditMinor;
      return result;
    },
    { debit: 0n, credit: 0n },
  );

  assert.equal(totals.debit, totals.credit);
  assert.ok(totals.debit > 0n);
  assert.equal(foreignAccounts.length, 4);
  assert.equal(foreignAccounts.every(({ category }) => ["cash", "receivables"].includes(category)), true);
  assert.equal(foreignAccounts.every(({ monetaryItem, closingRate }) => monetaryItem && closingRate > 0), true);
});

test("covers 20 accounting areas evenly with complete linkage metadata", () => {
  const accounts = generateTrialBalance();
  const counts = new Map();

  for (const account of accounts) {
    counts.set(account.category, (counts.get(account.category) || 0) + 1);
    assert.ok(account.areaLabel);
    assert.ok(account.nature);
    assert.ok(account.suggestedStandardIds.length > 0);
    assert.ok(account.auditStandards.length > 0);
    assert.ok(account.assertions.length > 0);
    assert.ok(account.risks.length > 0);
    assert.ok(account.procedures.length > 0);
    assert.ok(account.evidence.length > 0);
  }

  assert.equal(counts.size, 20);
  assert.equal([...counts.values()].every((count) => count === 250), true);
});

test("assigns a unique non-empty account code to every row", () => {
  const accounts = generateTrialBalance();
  const codes = accounts.map(({ code }) => code);

  assert.equal(codes.every((code) => typeof code === "string" && code.length > 0), true);
  assert.equal(new Set(codes).size, accounts.length);
});

test("carries imported currency attributes into the account model with SAR-safe defaults", () => {
  const foreign = createImportedAccount({
    code: "110099",
    name: "بنك بالدولار",
    debitMinor: "375000",
    creditMinor: "0",
    currency: "USD",
    functionalCurrency: "SAR",
    monetaryItem: true,
    closingRate: 3.75,
  });
  const domestic = createImportedAccount({ code: "110100", name: "بنك محلي", debitMinor: "10000", creditMinor: "0" });

  assert.equal(foreign.currency, "USD");
  assert.equal(foreign.functionalCurrency, "SAR");
  assert.equal(foreign.monetaryItem, true);
  assert.equal(foreign.foreignCurrency, true);
  assert.equal(foreign.closingRate, 3.75);
  assert.equal(foreign.balanceCurrency, "SAR");
  assert.equal(domestic.currency, "SAR");
  assert.equal(domestic.functionalCurrency, "SAR");
  assert.equal(domestic.monetaryItem, false);
  assert.equal(domestic.foreignCurrency, false);
});

test("imported-account risk is driven by evidence and exposure rather than row position", () => {
  const row = { code: "120100", name: "ذمم مدينة محلية", debitMinor: "25000000", creditMinor: "0" };
  const first = createImportedAccount(row, 0);
  const later = createImportedAccount(row, 47);
  const unclassified = createImportedAccount({ code: "990100", name: "حساب غير مصنف", debitMinor: "100", creditMinor: "0" }, 3);

  assert.equal(first.risk, later.risk);
  assert.equal(unclassified.risk, "high");
});
