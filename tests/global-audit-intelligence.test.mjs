import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  GLOBAL_AUDIT_PATTERNS,
  analyzeAuditorFees,
  buildPatternAuditPlan,
  buildSensitivityScenarios,
  searchGlobalAuditPatterns,
} from "../src/global-audit-patterns.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("global audit patterns are unique, sourced, procedural, and human-governed", () => {
  assert.ok(GLOBAL_AUDIT_PATTERNS.length >= 10);
  assert.equal(new Set(GLOBAL_AUDIT_PATTERNS.map((item) => item.id)).size, GLOBAL_AUDIT_PATTERNS.length);
  for (const pattern of GLOBAL_AUDIT_PATTERNS) {
    assert.ok(pattern.titleAr.length > 8);
    assert.ok(pattern.sourceExamples.length >= 1);
    assert.ok(pattern.procedures.length >= 4);
    assert.ok(pattern.evidence.length >= 4);
    assert.ok(pattern.assertions.length >= 3);
    for (const source of pattern.sourceExamples) {
      assert.ok(source.entity && source.period && source.locator && source.sourceFamily);
    }
  }
});

test("KAM/CAM methodology preserves significance, response, evidence, and source traceability", () => {
  const kam = GLOBAL_AUDIT_PATTERNS.find((item) => item.id === "kam-cam");
  assert.ok(kam);
  assert.ok(kam.standards.includes("ISA 701"));
  assert.match(kam.procedures.join(" "), /سبب|أهمية/);
  assert.match(kam.procedures.join(" "), /إجراءات|استجابة/);
  assert.match(kam.evidence.join(" "), /مرجع صفحة|إفصاح/);
});

test("pattern search normalizes Arabic and finds professional themes", () => {
  assert.ok(searchGlobalAuditPatterns("التقديرات").some((item) => item.id === "estimate-sensitivity"));
  assert.ok(searchGlobalAuditPatterns("استقلال").some((item) => item.id === "auditor-independence-fees"));
  assert.ok(searchGlobalAuditPatterns("سيبراني").some((item) => item.id === "cyber-governance"));
});

test("generated audit plan is deterministic and cannot assert an automatic opinion", () => {
  const a = buildPatternAuditPlan("estimate-sensitivity", { entityName: "شركة اختبار", reviewer: "مدير المراجعة", materialityMinor: "12500000" });
  const b = buildPatternAuditPlan("estimate-sensitivity", { entityName: "شركة اختبار", reviewer: "مدير المراجعة", materialityMinor: "12500000" });
  assert.deepEqual(a, b);
  assert.equal(a.authority, "advisory-only-human-review-required");
  assert.equal(a.procedures.length, 4);
  assert.ok(a.procedures.every((item) => item.status === "planned" && item.owner === "مدير المراجعة"));
  assert.doesNotMatch(JSON.stringify(a), /automatic-opinion|رأي آلي|اعتماد تلقائي/i);
});

test("sensitivity calculations use integer minor units and preserve exact shocks", () => {
  const rows = buildSensitivityScenarios("100000000", [-1000, 1000]);
  assert.deepEqual(rows, [
    { shockBp: -1000, stressedMinor: "90000000", deltaMinor: "-10000000" },
    { shockBp: 1000, stressedMinor: "110000000", deltaMinor: "10000000" },
  ]);
});

test("auditor fee lens raises review signals without making an independence conclusion", () => {
  const normal = analyzeAuditorFees({ audit: "100000", auditRelated: "10000", tax: "5000", other: "0" });
  assert.equal(normal.total, "115000");
  assert.equal(normal.nonAuditToAuditPct, "15.00%");
  assert.equal(normal.flags.length, 0);

  const elevated = analyzeAuditorFees({ audit: "100000", auditRelated: "70000", tax: "40000", other: "20000" });
  assert.ok(elevated.flags.length >= 2);
  assert.match(elevated.conclusionAr, /ليست حكمًا|تقييم بشري/);
});

test("global audit workspace remains archived and testable but is no longer mounted in reset production", async () => {
  const [main, launcher, studio, css] = await Promise.all([
    read("src/main.jsx"),
    read("src/components/GlobalAuditLauncher.jsx"),
    read("src/components/GlobalAuditIntelligence.jsx"),
    read("src/global-audit-intelligence.css"),
  ]);
  assert.doesNotMatch(main, /GlobalAuditLauncher|GlobalAuditIntelligence/);
  assert.match(launcher, /lazy\(\(\) => import\("\.\/GlobalAuditIntelligence\.jsx"\)/);
  assert.match(studio, /12,505-page methodology extraction/);
  assert.match(studio, /محرك حساسية حتمي/);
  assert.match(studio, /محلل رسوم المراجع والخدمات/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /height: 100dvh/);
});
