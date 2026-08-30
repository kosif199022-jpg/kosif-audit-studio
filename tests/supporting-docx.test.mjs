import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  createAppliedAccountingDocxBlob,
  createTechnicalMemoDocxBlob,
  DOCX_MIME,
} from "../src/professional-docx.js";

async function inspectDocx(blob) {
  assert.equal(blob.type, DOCX_MIME);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 2)), "PK");
  const archive = await JSZip.loadAsync(bytes);
  assert.ok(archive.file("[Content_Types].xml"));
  assert.ok(archive.file("word/document.xml"));
  return archive.file("word/document.xml").async("string");
}

test("technical memo export is an RTL OOXML document", async () => {
  const xml = await inspectDocx(await createTechnicalMemoDocxBlob({
    standardId: "IFRS 15",
    standardTitle: "الإيراد من العقود مع العملاء",
    entityName: "شركة الاختبار",
    period: "2026",
    accountCount: 2,
    exposure: "100,000 ر.س",
    decisionTreeId: "IFRS 15",
    decisionTreeTitle: "العقود مع العملاء",
    decisionHistory: [{ question: "هل العقد قابل للإنفاذ؟", answer: "نعم" }],
    conclusion: "يتطلب استكمال أدلة القطع الزمني.",
    generatedAt: "30 أغسطس 2026",
  }));

  assert.match(xml, /مذكرة بحث فني/);
  assert.match(xml, /IFRS 15/);
  assert.match(xml, /w:bidi/);
  assert.match(xml, /w:bidiVisual/);
});

test("applied accounting export is an RTL OOXML document", async () => {
  const xml = await inspectDocx(await createAppliedAccountingDocxBlob({
    entityName: "شركة الاختبار",
    period: "2026",
    summary: { cycleComplete: 3, cycleTotal: 5, ifrs18Passed: 2, ifrs18Total: 4, uniqueVideoSources: 8 },
    cycle: [{ title: "الإقفال", standards: ["IAS 1"], status: "complete", detail: "مكتمل" }],
    ifrs18: { rows: [{ label: "التشغيل", accountCount: 12, total: "250,000 ر.س" }] },
    standardId: "IAS 2",
    modelTitle: "صافي القيمة القابلة للتحقق",
    formula: "الأقل من التكلفة وصافي القيمة القابلة للتحقق",
    inputRows: [["التكلفة", "100,000"]],
    resultRows: [["التخفيض المقترح", "5,000"]],
    generatedAt: "30 أغسطس 2026",
  }));

  assert.match(xml, /حزمة التطبيق المحاسبي/);
  assert.match(xml, /IFRS 18/);
  assert.match(xml, /w:bidi/);
  assert.match(xml, /w:bidiVisual/);
});
