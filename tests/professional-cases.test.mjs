import assert from "node:assert/strict";
import test from "node:test";
import {
  casesForStandard,
  getProfessionalCase,
  professionalCaseAreas,
  professionalCases,
} from "../src/professional-cases.js";
import { getStandard } from "../src/standards.js";

test("professional cases convert the curriculum into governed accounting and audit workflows", () => {
  assert.equal(professionalCases.length, 14);
  assert.ok(professionalCaseAreas.length >= 10);
  for (const professionalCase of professionalCases) {
    assert.match(professionalCase.id, /^CASE-/);
    assert.ok(professionalCase.standards.length >= 2);
    assert.ok(professionalCase.assertions.length >= 3);
    assert.ok(professionalCase.facts.length >= 3);
    assert.ok(professionalCase.accountingQuestions.length >= 2);
    assert.ok(professionalCase.auditRisks.length >= 2);
    assert.ok(professionalCase.procedures.length >= 2);
    assert.ok(professionalCase.evidence.length >= 2);
    assert.ok(professionalCase.expectedOutput.length >= 2);
    assert.match(professionalCase.frameworkGate, /IFRS|EAS|IAS|الزكاة/);
    assert.match(professionalCase.effectiveDateGate, /السريان|النافذة|الفترة/);
    assert.ok(Object.isFrozen(professionalCase));
    assert.equal(
      new Set(professionalCase.standards).size,
      professionalCase.standards.length,
      `${professionalCase.id} contains duplicate standards`,
    );
    for (const standardId of professionalCase.standards) {
      assert.ok(getStandard(standardId), `${professionalCase.id} references unknown ${standardId}`);
    }
  }
});

test("professional cases cover the high-value video themes and support contextual lookup", () => {
  for (const standardId of ["IFRS 15", "IFRS 9", "IAS 2", "IFRS 16", "IAS 8", "IAS 21", "IFRS 3", "IFRS 10", "IAS 36", "IAS 12", "IAS 7", "IFRS 18"]) {
    assert.ok(casesForStandard(standardId).length > 0, `${standardId} should have a case`);
  }
  assert.equal(getProfessionalCase("CASE-GROUP-001")?.area, "التوحيد وتجميع الأعمال");
  assert.match(getProfessionalCase("CASE-FI-001")?.accountingQuestions.join(" "), /منذ الاعتراف الأولي/);
  assert.match(getProfessionalCase("CASE-TAX-001")?.frameworkGate, /افصل.*IAS 12.*الزكاة/);
  assert.equal(getProfessionalCase("missing"), null);
});

test("professional cases are guidance objects and contain no provider calls or copied standards", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => (
    readFile(new URL("../src/professional-cases.js", import.meta.url), "utf8")
  ));
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.doesNotMatch(source, /API[_ -]?key|Gemini|OpenAI|Claude/i);
  assert.doesNotMatch(source, /النص الكامل للمعيار|اقتباس حرفي/);
});
