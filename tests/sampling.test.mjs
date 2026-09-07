import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPORTED_CONFIDENCE,
  evaluateMonetarySample as evaluateEngine,
  planMonetarySample,
  samplingToMisstatementSchedule,
} from "../src/sampling.js";
import { resolveMinor, tryResolveMinor } from "../src/minor-units.js";

const evaluateMonetarySample = (plan, findings) => evaluateEngine(plan, findings, { examinedIds: plan.items.map(item => item.id) });

function population(count, baseMinor = 500_000n) {
  return Array.from({ length: count }, (_, index) => ({
    id: `acc_${String(index + 1).padStart(4, "0")}`,
    code: `1${String(index + 1).padStart(4, "0")}`,
    name: `حساب ${index + 1}`,
    amountMinor: (baseMinor + BigInt(index) * 13_711n).toString(),
    risk: index % 7 === 0 ? "high" : "medium",
  }));
}

const plan = () => planMonetarySample({
  accounts: population(400),
  tolerableMisstatementMinor: "90000000",
  confidence: 95,
  seed: "eng_demo|2025",
});

test("sample size is derived from tolerable misstatement, not hardcoded", () => {
  const wide = planMonetarySample({ accounts: population(400), tolerableMisstatementMinor: "90000000" });
  const tight = planMonetarySample({ accounts: population(400), tolerableMisstatementMinor: "30000000" });
  assert.ok(tight.sampleSize > wide.sampleSize, "tighter materiality must enlarge the sample");
  assert.ok(BigInt(tight.samplingIntervalMinor) < BigInt(wide.samplingIntervalMinor));
  assert.equal(BigInt(wide.samplingIntervalMinor), 90000000n * 100n / 300n);
});

test("higher confidence enlarges the sample at constant materiality", () => {
  const sizes = SUPPORTED_CONFIDENCE.map((confidence) => planMonetarySample({
    accounts: population(400), tolerableMisstatementMinor: "90000000", confidence,
  }).sampleSize);
  for (let index = 1; index < sizes.length; index += 1) {
    assert.ok(sizes[index] >= sizes[index - 1], `confidence ${SUPPORTED_CONFIDENCE[index]} must not shrink the sample`);
  }
});

test("items at or above the interval are examined 100% and excluded from projection", () => {
  const accounts = [...population(120), { id: "acc_whale", code: "19999", name: "بند ضخم", amountMinor: "600000000" }];
  const result = planMonetarySample({ accounts, tolerableMisstatementMinor: "90000000" });
  const whale = result.items.find((item) => item.id === "acc_whale");
  assert.equal(whale.stratum, "high_value");
  assert.equal(result.highValueMinor, "600000000");
  const evaluation = evaluateMonetarySample(result, [{ id: "acc_whale", misstatementMinor: "1000000" }]);
  assert.equal(evaluation.knownMisstatementMinor, "1000000");
  assert.equal(evaluation.projectedMisstatementMinor, "0", "100% items are known, never projected");
});

test("selection is reproducible for a seed and moves with it", () => {
  const a = planMonetarySample({ accounts: population(400), tolerableMisstatementMinor: "90000000", seed: "s1" });
  const b = planMonetarySample({ accounts: population(400), tolerableMisstatementMinor: "90000000", seed: "s1" });
  const c = planMonetarySample({ accounts: population(400), tolerableMisstatementMinor: "90000000", seed: "s2" });
  assert.deepEqual(a.items.map(({ id }) => id), b.items.map(({ id }) => id));
  assert.notDeepEqual(a.items.map(({ id }) => id), c.items.map(({ id }) => id));
  assert.equal(a.randomStartMinor, b.randomStartMinor);
});

test("ISA 530.14 — misstatements are projected onto the population by tainting", () => {
  const result = plan();
  const target = result.items.find((item) => item.stratum === "representative");
  const half = (BigInt(target.bookMinor) / 2n).toString();
  const evaluation = evaluateMonetarySample(result, [{ id: target.id, misstatementMinor: half }]);
  const interval = BigInt(result.samplingIntervalMinor);
  // تلوث 50% على فاصل المعاينة ⇒ إسقاط ≈ نصف الفاصل، لا نصف قيمة البند.
  const projected = BigInt(evaluation.projectedMisstatementMinor);
  assert.ok(projected > interval / 2n - 20n && projected < interval / 2n + 20n, `projected ${projected}`);
  assert.ok(projected > BigInt(half), "projection must scale the finding to the population");
});

test("ISA 530.15 — upper limit carries basic precision even with zero findings", () => {
  const result = plan();
  const clean = evaluateMonetarySample(result, []);
  assert.equal(clean.projectedMisstatementMinor, "0");
  assert.equal(clean.basicPrecisionMinor, (BigInt(result.samplingIntervalMinor) * 300n / 100n).toString());
  assert.equal(clean.upperMisstatementLimitMinor, clean.basicPrecisionMinor);
  assert.ok(clean.acceptable, "a clean sample at plan parameters must support the population");
});

test("upper limit breaches tolerable misstatement once findings accumulate", () => {
  const result = plan();
  const picks = result.items.filter((item) => item.stratum === "representative").slice(0, 6);
  const evaluation = evaluateMonetarySample(result, picks.map((item) => ({
    id: item.id, misstatementMinor: item.bookMinor,
  })));
  assert.equal(evaluation.misstatementCount, 6);
  assert.ok(BigInt(evaluation.upperMisstatementLimitMinor) > BigInt(evaluation.mostLikelyMisstatementMinor));
  assert.equal(evaluation.acceptable, false);
  assert.match(evaluation.conclusionAr, /ISA 450/);
});

test("incremental precision is ranked — largest taintings carry the larger loading", () => {
  const result = plan();
  const picks = result.items.filter((item) => item.stratum === "representative").slice(0, 3);
  const evaluation = evaluateMonetarySample(result, picks.map((item, index) => ({
    id: item.id, misstatementMinor: (BigInt(item.bookMinor) / BigInt(index + 1)).toString(),
  })));
  const loadings = evaluation.detail.map((row) => BigInt(row.incrementalPrecisionMinor));
  for (let index = 1; index < loadings.length; index += 1) {
    assert.ok(loadings[index] <= loadings[index - 1], "incremental factors must decay by rank");
  }
});

test("evaluation refuses findings outside the drawn sample", () => {
  assert.throws(() => evaluateMonetarySample(plan(), [{ id: "not_sampled", misstatementMinor: "100" }]), /unsampled/);
});

test("misstatement cannot exceed the book value of the item", () => {
  const result = plan();
  const target = result.items[0];
  assert.throws(() => evaluateMonetarySample(result, [
    { id: target.id, misstatementMinor: (BigInt(target.bookMinor) + 1n).toString() },
  ]), /exceeds book value/);
});

test("expected misstatement consuming tolerable yields a non-viable plan, not a silent sample", () => {
  const result = planMonetarySample({
    accounts: population(50), tolerableMisstatementMinor: "1000000", expectedMisstatementMinor: "900000",
  });
  assert.equal(result.viable, false);
  assert.equal(result.reason, "expected_misstatement_consumes_tolerable");
  assert.throws(() => evaluateMonetarySample(result, []), /non-viable/);
});

test("result feeds the ISA 450 schedule without asserting an opinion", () => {
  const evaluation = evaluateMonetarySample(plan(), []);
  const row = samplingToMisstatementSchedule(evaluation, { area: "الذمم المدينة" });
  assert.equal(row.corrected, false);
  assert.equal(row.requiresHumanReview, true);
  assert.equal(row.amountMinor, evaluation.mostLikelyMisstatementMinor);
  assert.ok(!("opinionType" in row), "sampling must never emit an opinion");
});

test("canonical minor units accept negatives and reject silent precision loss", () => {
  assert.equal(resolveMinor("-500000", undefined), -500000n);
  assert.equal(resolveMinor(undefined, "-1234.56"), -123456n);
  assert.equal(resolveMinor("١٢٣٤٥", undefined), 12345n);
  assert.throws(() => resolveMinor(undefined, "100.005"), /precision exceeds/);
  assert.throws(() => resolveMinor("12.5", undefined), /non-canonical/);
  assert.equal(resolveMinor(undefined, "95000000000000.07"), 9500000000000007n);
  assert.equal(tryResolveMinor("oops", undefined).ok, false);
});
