import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL(
  "../src/components/ProfessionalStandardsTools.jsx",
  import.meta.url,
);
const cssUrl = new URL("../src/professional-tools.css", import.meta.url);
const standardsCenterUrl = new URL("../src/components/StandardsCenter.jsx", import.meta.url);

test("professional standards tools restore the safe SOCPA research workflows", async () => {
  const component = await readFile(componentUrl, "utf8");

  assert.match(component, /from "lucide-react"/);
  assert.match(component, /رادار SOCPA/);
  assert.match(component, /role="tablist"/);
  assert.match(component, /onKeyDown=\{\(event\) => handleRadarTabKeyDown/);
  assert.match(component, /accounting:[\s\S]*assurance:[\s\S]*transition:[\s\S]*saudi:/);
  assert.match(component, /مقارنة مرجعي 2018 و2025/);
  assert.match(component, /بيانات وصفية وليست نصوصًا معيارية/);
  assert.match(component, /لا تستنتج الأداة فروق الفقرات تلقائيًا/);
});

test("decision trees cover transition, consolidation, and the restored accounting workflows", async () => {
  const component = await readFile(componentUrl, "utf8");

  for (const standardId of ["IFRS 15", "IFRS 16", "IFRS 19", "IFRS 9", "IAS 19", "IAS 8", "IFRS 10", "IFRS 18"]) {
    assert.match(component, new RegExp(`"${standardId.replace(" ", "\\s")}"`));
  }
  assert.match(component, /الإفصاحات المخفضة للمنشآت التابعة/);
  assert.match(component, /تبقى أحكام الاعتراف والقياس في المعايير الأخرى دون استبدال/);
  assert.match(component, /شجرة القرار التفاعلية/);
  assert.match(component, /answerQuestion\("yes"\)/);
  assert.match(component, /answerQuestion\("no"\)/);
  assert.match(component, /نتيجة توجيهية/);
  assert.match(component, /عرض مسار الإجابات/);
  assert.match(component, /مقاييس الأداء/);
  assert.match(component, /نطاق التوحيد والسيطرة/);
  assert.match(component, /تحصيل التدفقات التعاقدية وبيع الأصول المالية معًا/);
  assert.match(component, /result:fvoci/);
});

test("professional case engine links facts, risks, procedures, evidence, and live account exposure", async () => {
  const [component, css] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(component, /محرك الحالات المهنية التطبيقية/);
  assert.match(component, /professionalCases\.map/);
  assert.match(component, /activeCase\.accountingQuestions/);
  assert.match(component, /activeCase\.auditRisks/);
  assert.match(component, /activeCase\.procedures/);
  assert.match(component, /activeCase\.evidence/);
  assert.match(component, /caseAccountContext\.exposure/);
  assert.match(component, /activeCase\.standards\.filter[\s\S]*getStandard\(standardId\)\?\.type === "accounting"/);
  assert.doesNotMatch(component, /activeCase\.standards\);[\s\S]*includeSuggested: true/);
  assert.match(component, /بوابات الإطار والسريان/);
  assert.doesNotMatch(component, /includeSuggested/);
  assert.match(component, /الحالة المهنية التطبيقية/);
  assert.match(css, /\.professional-tools__case-grid/);
  assert.match(css, /content-visibility: auto/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*professional-tools__case-grid/);
});

test("technical memo is account-aware, printable, and exports real DOCX", async () => {
  const [component, css, standardsCenter] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(standardsCenterUrl, "utf8"),
  ]);

  assert.match(
    component,
    /ProfessionalStandardsTools\(\{[\s\S]*selectedStandard,[\s\S]*accounts = \[\],[\s\S]*mappingState,[\s\S]*formatCurrency,[\s\S]*context = \{\},[\s\S]*onToast/,
  );
  assert.match(component, /getAccountStandardIds\(account, mappingState\)\.includes\(selectedId\)/);
  assert.match(component, /typeof formatCurrency === "function"[\s\S]*formatCurrency\(accountContext\.exposure\)/);
  assert.doesNotMatch(component, /formatNumber\(accountContext\.exposure\).*ر\.س/);
  assert.match(standardsCenter, /<ProfessionalStandardsTools[\s\S]*formatCurrency=\{formatCurrency\}/);
  assert.match(component, /شجرة القرار المستخدمة/);
  assert.match(component, /createTechnicalMemoDocxBlob/);
  assert.match(component, /\.docx`/);
  assert.doesNotMatch(component, /application\/msword/);
  assert.match(component, /contentWindow\?\.print\(\)/);
  assert.match(component, /استنتاج المراجع/);
  assert.match(component, /ليست بديلًا عن النص الرسمي النافذ/);
  assert.match(css, /direction|\[dir/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test("restored tools stay local and do not expose provider secrets or protected source text", async () => {
  const component = await readFile(componentUrl, "utf8");

  assert.doesNotMatch(component, /https?:\/\//);
  assert.doesNotMatch(component, /\bfetch\s*\(/);
  assert.doesNotMatch(component, /Gemini|OpenAI|Claude|API[_ -]?key|مفتاح API/i);
  assert.doesNotMatch(component, /اقتباس حرفي|النص الكامل للمعيار/);
});
