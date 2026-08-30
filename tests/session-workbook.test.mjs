import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { createFreshEngagement, generateTrialBalance, initialEngagement } from "../src/data.js";
import { buildDatasetCommitment } from "../src/governance.js";
import { buildMappingMetrics, standardCatalog } from "../src/standards.js";
import { buildTemporarySessionSnapshot } from "../src/session-export.js";
import {
  SESSION_WORKBOOK_SHEETS,
  buildSessionWorkpaperModel,
  createSessionWorkbookBytes,
} from "../src/session-workbook.js";

const generatedAt = "2026-08-28T18:30:00.000Z";

function metricsFor(accounts, engagement) {
  const debitMinor = accounts.reduce((sum, account) => sum + BigInt(account.debitMinor || 0), 0n);
  const creditMinor = accounts.reduce((sum, account) => sum + BigInt(account.creditMinor || 0), 0n);
  const mapping = buildMappingMetrics(accounts, engagement.standardMappings);
  const descriptor = engagement.sourceDataset || engagement.demo?.commitment || {};
  return {
    accountCount: accounts.length,
    totalDebit: Number(debitMinor) / 100,
    totalCredit: Number(creditMinor) / 100,
    balanceDifference: Number(debitMinor - creditMinor) / 100,
    isBalanced: debitMinor === creditMinor,
    unmapped: mapping.unresolved,
    mappingRate: mapping.mappingRate,
    datasetId: descriptor.datasetId,
    datasetDigest: descriptor.sha256,
    datasetPeriod: descriptor.period,
    datasetCurrency: descriptor.currency,
    datasetCommittedAt: descriptor.committedAt,
  };
}

test("builds a reopenable 12-sheet workbook from the complete live session", async () => {
  const accounts = generateTrialBalance();
  const snapshot = await buildTemporarySessionSnapshot({
    accounts,
    engagement: initialEngagement,
    metrics: metricsFor(accounts, initialEngagement),
    dataProfile: { source: "demo", label: "بيانات العرض الشاملة", rowCount: accounts.length },
    stages: [],
    generatedAt,
  });
  const { bytes, filename, model } = await createSessionWorkbookBytes(snapshot, { date: new Date(generatedAt) });
  const workbook = XLSX.read(bytes, { type: "array", cellFormula: true });

  assert.deepEqual(workbook.SheetNames, SESSION_WORKBOOK_SHEETS);
  assert.deepEqual(model.sheetNames, SESSION_WORKBOOK_SHEETS);
  assert.equal(model.sheets["ميزان المراجعة"].length, 5_001);
  assert.equal(model.sheets["قبل التسويات"].length, 5_001);
  assert.equal(model.sheets["الخريطة المعيارية"].length, standardCatalog.length + 1);
  assert.equal(model.sheets["الجولات"].length, 21);
  assert.equal(model.sheets["البوابات"].length, 13);
  assert.equal(model.sheets["البوابات"].slice(1).every((row) => row[2] === "PASS"), true);
  assert.deepEqual(
    model.sheets["ملخص الارتباط"].find((row) => row[0] === "دورة المحاسبة والإقفال"),
    ["دورة المحاسبة والإقفال", "12/12"],
  );
  assert.deepEqual(
    model.sheets["ملخص الارتباط"].find((row) => row[0] === "مواد المعرفة الفريدة المحصورة"),
    ["مواد المعرفة الفريدة المحصورة", 465],
  );
  assert.equal(model.sheets["أساس التقرير"].filter((row) => row[0] === "دورة الإقفال").length, 12);
  assert.equal(model.sheets["أساس التقرير"].filter((row) => row[0] === "جاهزية IFRS 18").length, 4);
  assert.equal(model.sheets["المصادر والفحوص"].filter((row) => row[0] === "مصدر تدريب").length, 13);
  assert.match(filename, new RegExp(initialEngagement.demo.commitment.datasetId));
  assert.ok(bytes.byteLength > 100_000);
  assert.equal(workbook.Sheets["ملخص الارتباط"].A1.v, "الحقل");
});

test("keeps an imported draft isolated, exact, and spreadsheet-safe", async () => {
  const demoAccounts = generateTrialBalance();
  const accounts = [
    { ...demoAccounts[0], id: "I-00001", code: "110099", name: "=HYPERLINK(\"https://example.invalid\")" },
    { ...demoAccounts[1], id: "I-00002", code: "+210099", name: "حساب دائن مستورد" },
  ];
  const commitment = buildDatasetCommitment(accounts, {
    period: "2025",
    currency: "SAR",
    committedAt: generatedAt,
  });
  const engagement = createFreshEngagement(initialEngagement, {
    source: "import",
    label: "fixture.xlsx",
    rowCount: accounts.length,
    importedAt: generatedAt,
    committedAt: generatedAt,
    ...commitment,
  }, generatedAt);
  const snapshot = await buildTemporarySessionSnapshot({
    accounts,
    engagement,
    metrics: metricsFor(accounts, engagement),
    dataProfile: { source: "import", label: "fixture.xlsx", rowCount: accounts.length, importedAt: generatedAt },
    stages: [],
    generatedAt,
  });
  const { bytes, model } = await createSessionWorkbookBytes(snapshot, { date: new Date(generatedAt) });
  const workbook = XLSX.read(bytes, { type: "array", cellFormula: true });

  assert.equal(model.sheets["ميزان المراجعة"].length, 3);
  assert.equal(model.sheets["قبل التسويات"].length, 3);
  assert.equal(model.sheets["ميزان المراجعة"][1][2], "'=HYPERLINK(\"https://example.invalid\")");
  assert.equal(model.sheets["ميزان المراجعة"][2][1], "'+210099");
  assert.equal(model.sheets["البوابات"].slice(1).every((row) => row[2] === "PASS"), false);
  assert.equal(JSON.stringify(model).includes("KOSIF-DEMO-5000-v7"), false);
  assert.equal(model.sheets["ملخص الارتباط"].some((row) => row.includes("مسودة محكومة")), true);

  for (const sheet of Object.values(workbook.Sheets)) {
    for (const cell of Object.values(sheet)) {
      if (cell && typeof cell === "object" && "v" in cell) assert.equal("f" in cell, false);
    }
  }
});
