import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseTrialBalanceText } from "../src/importer.js";
import { workbookArrayBufferToCsv } from "../src/xlsx-importer.js";

test("reads the first XLSX sheet locally and feeds the exact staging validator", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["رمز الحساب", "اسم الحساب", "مدين", "دائن"],
    ["110001", "النقد", 125000.25, 0],
    ["410001", "الإيرادات", 0, 125000.25],
  ]), "ميزان المراجعة");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["ignored"]]), "تعليمات");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

  const converted = await workbookArrayBufferToCsv(bytes);
  const staged = parseTrialBalanceText(converted.text);

  assert.equal(converted.sheetName, "ميزان المراجعة");
  assert.equal(converted.sheetCount, 2);
  assert.equal(staged.rows.length, 2);
  assert.equal(staged.errors.length, 0);
  assert.equal(staged.balanced, true);
  assert.equal(staged.totalDebitMinor, 12_500_025n);
  assert.equal(staged.totalCreditMinor, 12_500_025n);
});

test("rejects XLSX cells with more than two decimal places", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["code", "name", "debit", "credit"],
    ["100", "Cash", 1.2345, 0],
    ["200", "Revenue", 0, 1.2345],
  ]), "TB");
  const converted = await workbookArrayBufferToCsv(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
  const staged = parseTrialBalanceText(converted.text);

  assert.equal(staged.rows.length, 0);
  assert.equal(staged.errors.length, 2);
  assert.equal(staged.balanced, false);
});

test("finds a trial-balance sheet and header after summary and title rows", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["ملخص الارتباط"],
    ["الحسابات", 2],
  ]), "الملخص");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["ميزان مراجعة العميل"],
    ["للسنة المنتهية في 31 ديسمبر"],
    [],
    ["رمز الحساب", "اسم الحساب", "مدين", "دائن"],
    ["110001", "النقد", 125000.25, 0],
    ["410001", "الإيرادات", 0, 125000.25],
  ]), "ميزان المراجعة");

  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const converted = await workbookArrayBufferToCsv(bytes);
  const staged = parseTrialBalanceText(converted.text);

  assert.equal(converted.sheetName, "ميزان المراجعة");
  assert.equal(converted.headerRow, 4);
  assert.equal(staged.rows.length, 2);
  assert.equal(staged.errors.length, 0);
  assert.equal(staged.balanced, true);
});
