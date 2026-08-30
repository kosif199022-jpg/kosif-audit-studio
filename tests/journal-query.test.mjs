import assert from "node:assert/strict";
import test from "node:test";
import { paginateJournalEntries, queryJournalEntries } from "../src/journal-query.js";

const entries = Array.from({ length: 21 }, (_, index) => ({
  id: `JV-2025-${String(index + 1).padStart(4, "0")}`,
  period: index < 10 ? "2025-11" : "2025-12",
  description: index === 12 ? "إيراد عقد عميل رئيس" : `قيد تجريبي ${index + 1}`,
  lines: [{ code: index === 12 ? "4100" : "1100", name: index === 12 ? "ايرادات العقود" : "النقد" }],
}));

test("journal search normalizes Arabic and matches entry and line fields", () => {
  assert.equal(queryJournalEntries(entries, "إِيــرَاد 4100").length, 1);
  assert.equal(queryJournalEntries(entries, "2025-11").length, 10);
  assert.equal(queryJournalEntries(entries, "JV-2025-0021")[0].id, "JV-2025-0021");
});

test("journal pagination clamps pages without dropping the filtered total", () => {
  const first = paginateJournalEntries(entries, 1, 8);
  const last = paginateJournalEntries(entries, 99, 8);
  assert.deepEqual({ total: first.total, pageCount: first.pageCount, count: first.items.length }, { total: 21, pageCount: 3, count: 8 });
  assert.deepEqual({ page: last.page, count: last.items.length, id: last.items[0].id }, { page: 3, count: 5, id: "JV-2025-0017" });
});
