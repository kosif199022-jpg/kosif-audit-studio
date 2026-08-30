import assert from "node:assert/strict";
import test from "node:test";
import { parseMoneyToMinor, parseTrialBalanceText } from "../src/importer.js";

test("parses Arabic, Persian, grouped, decimal, and parenthesized money exactly", () => {
  assert.equal(parseMoneyToMinor("١٬٢٣٤٫٥٠"), 123_450n);
  assert.equal(parseMoneyToMinor("۱۲۳۴,۵"), 123_450n);
  assert.equal(parseMoneyToMinor("(2,500.75)"), -250_075n);
  assert.equal(parseMoneyToMinor("SAR 90"), 9_000n);
  assert.equal(parseMoneyToMinor("1,234,567.89"), 123_456_789n);
  assert.equal(parseMoneyToMinor("1.234.567,89"), 123_456_789n);
});

test("rejects precision beyond minor units instead of silently multiplying it", () => {
  for (const value of ["1.2345", "12.3456", "0.001", "1234,567", "1,23,456"]) {
    assert.throws(() => parseMoneyToMinor(value), /تتجاوز منزلتين|تجميع/);
  }

  const result = parseTrialBalanceText([
    "code;name;debit;credit",
    "100;Cash;1.2345;0",
    "200;Revenue;0;1.2345",
  ].join("\n"));
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(result.balanced, false);
});

test("stages a balanced Arabic CSV with exact minor units", () => {
  const result = parseTrialBalanceText([
    "رمز الحساب,اسم الحساب,مدين,دائن",
    "110001,النقد,١٢٥٠٫٣٥,0",
    "410001,إيرادات الخدمات,0,1250.35",
  ].join("\n"));

  assert.equal(result.rows.length, 2);
  assert.equal(result.errors.length, 0);
  assert.equal(result.balanced, true);
  assert.equal(result.totalDebitMinor, 125_035n);
  assert.equal(result.totalCreditMinor, 125_035n);
  assert.equal(result.rows[0].debitMinor, "125035");
  assert.equal(result.rows[0].currency, "SAR");
  assert.equal(result.rows[0].functionalCurrency, "SAR");
  assert.equal(result.rows[0].monetaryItem, false);
});

test("reads optional IAS 21 currency metadata without changing the SAR-equivalent balance", () => {
  const result = parseTrialBalanceText([
    "رمز الحساب,اسم الحساب,مدين,دائن,العملة,العملة الوظيفية,هل البند نقدي,سعر الإقفال",
    "110101,حساب بنكي بالدولار,3750,0,USD,SAR,نعم,3.75",
    "410101,إيراد مقابل بالريال,0,3750,SAR,SAR,لا,1",
  ].join("\n"));

  assert.equal(result.errors.length, 0);
  assert.equal(result.balanced, true);
  assert.equal(result.rows[0].currency, "USD");
  assert.equal(result.rows[0].functionalCurrency, "SAR");
  assert.equal(result.rows[0].monetaryItem, true);
  assert.equal(result.rows[0].closingRate, 3.75);
  assert.equal(result.rows[0].balanceCurrency, "SAR");
  assert.equal(result.rows[0].amountBasis, "functional-currency-equivalent");
  assert.equal(result.rows[0].debitMinor, "375000");
});

test("rejects duplicate codes and does not claim the staged data is balanced", () => {
  const result = parseTrialBalanceText([
    "code;name;debit;credit",
    "100;Cash;100;0",
    "100;Duplicate;0;100",
  ].join("\n"));

  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /مكرر/);
  assert.equal(result.balanced, false);
});

test("moves a negative balance across sides with an explicit warning", () => {
  const result = parseTrialBalanceText([
    "account code\taccount name\tdebit\tcredit",
    "100\tCash\t-100\t0",
    "200\tPayable\t100\t0",
  ].join("\n"));

  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.rows[0].creditMinor, "10000");
  assert.equal(result.balanced, true);
});
