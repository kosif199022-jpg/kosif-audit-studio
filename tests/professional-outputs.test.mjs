import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateTrialBalance, initialEngagement } from "../src/data.js";
import { buildStandardsCoverage } from "../src/standards.js";

test("professional outputs have enough live session data for the management letter and compliance matrix", () => {
  const accounts = generateTrialBalance();
  const coverage = buildStandardsCoverage(accounts, initialEngagement.standardMappings);
  const linked = coverage.filter((item) => item.accountCount > 0 || item.reviewRequiredAccountCount > 0);

  assert.equal(accounts.length, 5_000);
  assert.equal(initialEngagement.findings.length, 20);
  assert.ok(initialEngagement.auditTrail.length > 0);
  assert.ok(linked.length > 0);
  assert.ok(linked.some((item) => item.totalExposure > 0));
});

test("professional outputs derive, disclose, open, read, download, and print without claiming a signed report", async () => {
  const component = await readFile(
    new URL("../src/components/ProfessionalOutputs.jsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../src/professional-outputs.css", import.meta.url),
    "utf8",
  );

  assert.match(component, /buildManagementLetterRows\(accounts = \[\], engagement = \{\}\)/);
  assert.match(component, /buildAnalyticalReview\(accounts\)/);
  assert.match(component, /engagement\.findings/);
  assert.match(component, /engagement\.auditTrail/);
  assert.match(component, /buildStandardsCoverage\(accounts, mappingState\)/);
  assert.match(component, /getAccountStandardIds\(account, mappingState, \{ includeSuggested: true \}\)/);
  assert.match(component, /buildUnresolvedIssues\(accounts = \[\], engagement = \{\}, metrics = null\)/);
  assert.match(component, /buildReportState\(engagement, metrics\)/);
  assert.match(component, /gate\.id === "evidence"/);
  assert.match(component, /فشل بوابة سلامة الأدلة/);
  assert.match(component, /buildUnresolvedIssues\(accounts, engagement, metrics\)/);
  assert.match(component, /isAdjustmentPosted\(adjustment\)/);
  assert.match(component, /onOpenStandard\?\.\(row\.standardId, row\.accountId \|\| null, "professional-compliance"\)/);
  assert.match(component, /speechSynthesis/);
  assert.match(component, /SpeechSynthesisUtterance/);
  assert.match(component, /createProfessionalDocxBlob/);
  assert.match(component, /kosif-professional-draft-\$\{date\}\.docx/);
  assert.match(component, /frame\.contentWindow\?\.print\(\)/);
  assert.match(component, /frame\.srcdoc = html/);
  assert.match(component, /مسودة مهنية مساعدة/);
  assert.match(component, /ليست تقرير تدقيق موقعًا/);
  assert.doesNotMatch(component, /تقرير تدقيق موقع ومعتمد|رأي آلي معتمد/);
  assert.match(css, /direction|dir=/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.doesNotMatch(css, /body \* \{ visibility: hidden/);
  assert.match(css, /\.po-standard-link/);
});
