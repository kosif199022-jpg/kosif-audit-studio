import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createProfessionalDocxBlob, DOCX_MIME } from "../src/professional-docx.js";

test("R5 creates a real OOXML DOCX package with RTL report content", async () => {
  const blob = await createProfessionalDocxBlob({
    engagement: { entity: { name: "شركة اختبار", period: "2025", framework: "IFRS" } },
    metrics: { accountCount: 2, materiality: 100 },
    managementRows: [{ priority: "high", status: "open", title: "نقطة رقابة", recommendation: "تنفيذ الإجراء", references: ["F-1"] }],
    complianceRows: [{ standardId: "IFRS 15", title: "الإيراد", accountCount: 1, exposure: 500, reviewRequiredAccountCount: 0 }],
    unresolvedIssues: [{ reference: "F-1", title: "استثناء", detail: "يتطلب متابعة بشرية" }],
    currency: (value) => `${value} SAR`,
    generatedAt: new Date("2026-08-30T12:00:00.000Z"),
  });
  assert.equal(blob.type, DOCX_MIME);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 2)], [0x50, 0x4b]);
  const zip = await JSZip.loadAsync(bytes);
  for (const path of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels"]) assert.ok(zip.file(path), path);
  const documentXml = await zip.file("word/document.xml").async("string");
  assert.match(documentXml, /شركة اختبار/);
  assert.match(documentXml, /w:bidi/);
  assert.match(documentXml, /w:bidiVisual/);
  assert.match(documentXml, /نقطة رقابة/);
});
