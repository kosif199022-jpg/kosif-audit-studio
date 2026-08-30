import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as XLSX from "xlsx";
import { initialEngagement } from "../src/data.js";
import { parseTrialBalanceText } from "../src/importer.js";
import { standardCatalog } from "../src/standards.js";
import { workbookArrayBufferToCsv } from "../src/xlsx-importer.js";

function valuesInRange(sheet, range) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, range, defval: "" }).flat();
}

function rowsInRange(sheet, range) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, range, defval: "" });
}

function pdfPageCount(bytes) {
  const source = bytes.toString("latin1");
  return (source.match(/\/Type\s*\/Page\b/g) || []).length;
}

test("published workpapers remain reconciled with the complete demo contract", async () => {
  const [bytes, pdfBytes] = await Promise.all([
    readFile(new URL("../public/downloads/kosif-audit-workpapers-5000.xlsx", import.meta.url)),
    readFile(new URL("../public/downloads/kosif-audit-report-5000.pdf", import.meta.url)),
  ]);
  const workbook = XLSX.read(bytes, { type: "buffer", cellFormula: true });
  const sourceVersion = initialEngagement.demoDatasetVersion;
  const sourceDatasetId = initialEngagement.demo.commitment.datasetId;
  const sourceDigest = initialEngagement.demo.commitment.sha256;

  assert.equal(sourceVersion, "KOSIF-DEMO-5000-v7");
  assert.equal(sourceDatasetId, `KOSIF-TB-${sourceDigest.slice(0, 16).toUpperCase()}`);
  assert.equal(workbook.SheetNames.length, 12);
  for (const sheetName of workbook.SheetNames) {
    const releaseLine = String(workbook.Sheets[sheetName].A4?.v || "");
    assert.match(releaseLine, new RegExp(sourceVersion));
    assert.match(releaseLine, new RegExp(sourceDatasetId));
  }
  assert.equal(valuesInRange(workbook.Sheets["ميزان المراجعة"], "C7:C5006").filter(Boolean).length, 5_000);
  assert.equal(valuesInRange(workbook.Sheets["قبل التسويات"], "C7:C5006").filter(Boolean).length, 5_000);
  assert.equal(standardCatalog.length, 61);
  assert.deepEqual(
    valuesInRange(workbook.Sheets["الخريطة المعيارية"], "A7:A67").filter(Boolean),
    standardCatalog.map(({ id }) => id),
  );
  assert.equal(valuesInRange(workbook.Sheets["الجولات"], "A7:A26").filter(Boolean).length, 20);
  assert.equal(valuesInRange(workbook.Sheets["الأدلة"], "A7:A26").filter(Boolean).length, 20);
  assert.equal(valuesInRange(workbook.Sheets["الملاحظات"], "A7:A26").filter(Boolean).length, 20);
  assert.deepEqual(valuesInRange(workbook.Sheets["البوابات"], "D7:D18"), Array(12).fill("PASS"));
  const summaryRows = XLSX.utils.sheet_to_json(workbook.Sheets["ملخص الارتباط"], { header: 1, defval: "" });
  assert.deepEqual(
    summaryRows.find((row) => row[0] === "دورة المحاسبة والإقفال")?.slice(0, 4),
    ["دورة المحاسبة والإقفال", 12, 12, "12/12"],
  );
  assert.deepEqual(
    summaryRows.find((row) => row[0] === "النماذج التطبيقية")?.slice(0, 4),
    ["النماذج التطبيقية", 7, 7, "متاحة"],
  );
  assert.equal(workbook.Sheets["أساس التقرير"].B9.v, 1_282_800);
  assert.equal(workbook.Sheets["أساس التقرير"].C9.v, 1_282_800);
  assert.ok(Math.abs(workbook.Sheets["أساس التقرير"].D15.v - (-1.0135)) < 1e-10);

  const accountRows = rowsInRange(workbook.Sheets["ميزان المراجعة"], "A7:V5006");
  const foreignMonetaryRows = accountRows.filter((row) => row[9] && row[9] !== row[10]);
  assert.equal(foreignMonetaryRows.length, 4);
  assert.deepEqual([...new Set(foreignMonetaryRows.map((row) => row[9]))].sort(), ["EUR", "USD"]);
  assert.equal(foreignMonetaryRows.every((row) => row[10] === "SAR"), true);
  assert.equal(foreignMonetaryRows.every((row) => row[11] === "نقدي" && Number(row[12]) > 0), true);
  assert.equal(foreignMonetaryRows.every((row) => String(row[15]).split(" | ").includes("IAS 21")), true);

  const checks = rowsInRange(workbook.Sheets["المصادر والفحوص"], "A8:G18");
  assert.equal(checks.length, 11);
  assert.equal(checks.every((row) => row[1] === row[2] && row[3] === 0 && row[5] === "OK"), true);
  const stableSource = rowsInRange(workbook.Sheets["المصادر والفحوص"], "A20:C28")
    .find((row) => row[0] === "Cloudflare Stable");
  assert.deepEqual(stableSource?.slice(0, 2), [
    "Cloudflare Stable",
    "https://kosif-stable.kosif199022.workers.dev/",
  ]);
  const stableReference = rowsInRange(workbook.Sheets["المصادر والفحوص"], "A30:G35")
    .find((row) => row[0] === "KOSIF Stable — السطح الحي");
  assert.deepEqual(stableReference?.slice(2, 6), ["SAR", 110, 3, 16]);

  const pdfSource = pdfBytes.toString("latin1");
  assert.equal(pdfPageCount(pdfBytes), 15);
  assert.match(pdfSource, new RegExp(sourceVersion));

  const converted = await workbookArrayBufferToCsv(bytes);
  const staged = parseTrialBalanceText(converted.text);
  assert.equal(converted.sheetName, "ميزان المراجعة");
  assert.equal(converted.headerRow, 6);
  assert.equal(staged.rows.length, 5_000);
  assert.equal(staged.errors.length, 0);
  assert.equal(staged.balanced, true);
});
