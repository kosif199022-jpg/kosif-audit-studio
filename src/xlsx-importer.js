import { findTrialBalanceHeaderRow } from "./importer.js";

export async function workbookArrayBufferToCsv(arrayBuffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(arrayBuffer, {
    type: "array",
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    raw: true,
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("لا يحتوي المصنف على أوراق قابلة للقراءة.");

  let sheetName = firstSheetName;
  let sheet = workbook.Sheets[firstSheetName];
  let headerRow = 0;

  for (const candidateName of workbook.SheetNames) {
    const candidate = workbook.Sheets[candidateName];
    if (!candidate?.["!ref"]) continue;
    const usedRange = XLSX.utils.decode_range(candidate["!ref"]);
    const scanRange = {
      s: { r: usedRange.s.r, c: usedRange.s.c },
      e: { r: Math.min(usedRange.e.r, usedRange.s.r + 49), c: usedRange.e.c },
    };
    const previewRows = XLSX.utils.sheet_to_json(candidate, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: true,
      range: scanRange,
    });
    const relativeHeaderRow = findTrialBalanceHeaderRow(previewRows);
    if (relativeHeaderRow < 0) continue;
    sheetName = candidateName;
    sheet = candidate;
    headerRow = usedRange.s.r + relativeHeaderRow;
    break;
  }

  const selectedRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
    range: headerRow,
  });
  const text = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(selectedRows), { FS: ",", RS: "\n", blankrows: false });
  if (!text.trim()) throw new Error("الورقة المختارة فارغة.");
  return {
    text,
    sheetName,
    sheetCount: workbook.SheetNames.length,
    headerRow: headerRow + 1,
  };
}
