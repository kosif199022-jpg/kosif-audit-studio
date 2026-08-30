import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateTrialBalance, initialEngagement } from "../src/data.js";
import { standardsById } from "../src/standards.js";

const accounts = generateTrialBalance();

test("every audit insight derives exposure from linked trial-balance categories", () => {
  const roundsById = new Map(initialEngagement.rounds.map((round) => [round.id, round]));
  const evidenceById = new Map(initialEngagement.evidence.map((item) => [item.id, item]));

  for (const finding of initialEngagement.findings) {
    assert.ok(finding.categoryKeys.length > 0, `${finding.id} category linkage`);
    const relatedAccounts = accounts.filter((account) =>
      finding.categoryKeys.includes(account.category),
    );
    const exposure = relatedAccounts.reduce(
      (total, account) => total + Number(account.amount || 0),
      0,
    );

    assert.ok(relatedAccounts.length > 0, `${finding.id} related accounts`);
    assert.ok(exposure > 0, `${finding.id} derived exposure`);
    assert.ok(roundsById.has(finding.roundId), `${finding.id} round`);
    assert.ok(
      finding.evidenceIds.every((id) => evidenceById.has(id)),
      `${finding.id} evidence`,
    );
    assert.ok(
      finding.standardIds.every((id) => standardsById.has(id)),
      `${finding.id} standards`,
    );
  }
});

test("quantified findings distinguish tested differences from broad account exposure", () => {
  const quantified = initialEngagement.findings.filter(
    (finding) => Number(finding.quantifiedAmount || 0) > 0,
  );
  assert.equal(quantified.length, 3);
  assert.deepEqual(
    quantified.map((finding) => finding.quantifiedAmount),
    [412_800, 684_250, 185_750],
  );
  for (const finding of quantified) {
    assert.equal(
      finding.quantifiedAmountMinor,
      String(Math.round(finding.quantifiedAmount * 100)),
    );
    assert.ok(finding.quantifiedBasis);
  }
});

test("audit insight cards preserve account context when opening standards", async () => {
  const component = await readFile(
    new URL("../src/components/AuditInsightCards.jsx", import.meta.url),
    "utf8",
  );

  assert.match(component, /المبلغ المحدد/);
  assert.match(component, /تعرض مجال الميزان/);
  assert.match(component, /الإجراء التالي/);
  assert.match(component, /الجولة/);
  assert.match(component, /دليل معتمد/);
  assert.match(
    component,
    /onOpenStandard\?\.\(id, account\?\.id \|\| null, "finding-card"\)/,
  );
  assert.doesNotMatch(component, /Gemini|API[_ -]?key|مفتاح Gemini/i);
});

test("mobile rounds use a timeline and reserve safe space above navigation", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(app, /round-timeline-item/);
  assert.match(app, /round-timeline-node/);
  assert.match(app, /requestedRoundId/);
  assert.match(app, /السجلات المرتبطة/);
  assert.match(css, /padding-block-end: calc\(112px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.round-timeline-item:not\(:last-child\)::before/);
  assert.match(css, /\.audit-insight-standards button,[\s\S]*min-height: 44px/);
});
