import { sha256HexSync } from "./governance.js";

export const AUDIT_CORE_VERSION = "KOSIF-AUDIT-CORE-v1";
export const CANONICAL_VERSION = "KOSIF-C14N-v1";
export const GENESIS_HASH = "0".repeat(64);

const MONEY_INTEGER = /^-?(0|[1-9]\d*)$/;
const OPINION_TERMS = /(?:^|[^\u0621-\u064A])(متحفظ|معارض|معاكس|امتناع|غير\s*معد[ّ]?ل)(?![\u0621-\u064A])/u;
const SPELLED_NUMBER_TERMS = /(?:مليون|مليار|ألف|الف|مئة|مائه|مائة)/u;
const NUMERIC_TOKEN = /[-+]?[0-9٠-٩۰-۹][0-9٠-٩۰-۹.,٬٫]*/gu;

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeDigits(value) {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));
}

export function normalizeAr(value) {
  return normalizeDigits(String(value ?? "").normalize("NFC"))
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ﻻﻷﻹﻵ]/g, "لا")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalInteger(value, label = "integer") {
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "string" || !MONEY_INTEGER.test(value)) {
    throw new TypeError(`${label} requires bigint or a canonical integer string`);
  }
  return BigInt(value).toString();
}

export function toBigInt(value, label = "amount") {
  return BigInt(canonicalInteger(value, label));
}

export function absBig(value) {
  const amount = toBigInt(value);
  return amount < 0n ? -amount : amount;
}

export function parseMinorUnits(rawValue, exponent = 2) {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 6) {
    throw new TypeError("currency exponent must be a small integer");
  }
  let value = normalizeDigits(rawValue).trim();
  let negative = false;
  if (value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1).trim();
  }
  if (value.startsWith("-")) {
    negative = !negative;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }
  value = value.replace(/[\s٬,]/g, "").replace("٫", ".");
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new TypeError("invalid monetary value");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > exponent) throw new RangeError("precision exceeds currency exponent");
  const minor = BigInt(whole) * (10n ** BigInt(exponent))
    + BigInt((fraction + "0".repeat(exponent)).slice(0, exponent) || "0");
  return negative ? -minor : minor;
}

export function formatMinorUnits(value, currency = "SAR", locale = "ar-SA-u-nu-latn") {
  const amount = toBigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const formattedWhole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole);
  return `${negative ? "−" : ""}${formattedWhole}.${fraction} ${currency}`;
}

export function mulDivFloor(amount, multiplier, divisor) {
  const left = toBigInt(amount, "amount");
  const right = toBigInt(multiplier, "multiplier");
  const denominator = toBigInt(divisor, "divisor");
  if (denominator === 0n) throw new RangeError("divisor cannot be zero");
  const product = left * right;
  let quotient = product / denominator;
  const remainder = product % denominator;
  if (remainder !== 0n && ((product < 0n) !== (denominator < 0n))) quotient -= 1n;
  return quotient;
}

export function exceeds(amount, threshold) {
  if (typeof amount !== "bigint" || typeof threshold !== "bigint") {
    throw new TypeError("materiality comparison requires bigint");
  }
  return absBig(amount) > threshold;
}

function canonicalize(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) output[key] = canonicalize(value[key]);
    }
    return output;
  }
  if (typeof value === "string") return value.normalize("NFC");
  return value;
}

export function canonicalJSON(value) {
  return JSON.stringify(canonicalize(value));
}

export function stableId(prefix, payload) {
  return `${prefix}_${sha256HexSync(`${CANONICAL_VERSION}:${canonicalJSON(payload)}`).slice(0, 26)}`;
}

export const FS_LINE_DEFINITIONS = Object.freeze([
  { code: "BS.CA.CASH", statement: "BS", labelAr: "النقد وما في حكمه", normalSide: "debit", categories: ["cash"], sortOrder: 10 },
  { code: "BS.CA.RECEIVABLES", statement: "BS", labelAr: "الذمم المدينة", normalSide: "debit", categories: ["receivables"], sortOrder: 20 },
  { code: "BS.CA.INVENTORY", statement: "BS", labelAr: "المخزون", normalSide: "debit", categories: ["inventory"], sortOrder: 30 },
  { code: "BS.NCA.PPE", statement: "BS", labelAr: "الممتلكات والآلات والمعدات", normalSide: "debit", categories: ["ppe", "rightOfUse", "intangibles", "investmentProperty"], sortOrder: 40 },
  { code: "BS.CL.PAYABLES", statement: "BS", labelAr: "الالتزامات المتداولة", normalSide: "credit", categories: ["payables", "contractLiabilities", "tax"], sortOrder: 50 },
  { code: "BS.NCL.FINANCING", statement: "BS", labelAr: "التمويل والالتزامات طويلة الأجل", normalSide: "credit", categories: ["leaseLiabilities", "debt", "provisions", "employeeBenefits"], sortOrder: 60 },
  { code: "BS.EQ.EQUITY", statement: "BS", labelAr: "حقوق الملكية قبل نتيجة الفترة", normalSide: "credit", categories: ["equity"], sortOrder: 70 },
  { code: "IS.REVENUE", statement: "IS", labelAr: "إيرادات العقود", normalSide: "credit", categories: ["revenue"], sortOrder: 80 },
  { code: "IS.OTHER_INCOME", statement: "IS", labelAr: "إيرادات ومكاسب أخرى", normalSide: "credit", categories: ["otherIncome"], sortOrder: 90 },
  { code: "IS.EXPENSES", statement: "IS", labelAr: "المصروفات والتكاليف", normalSide: "debit", categories: ["cogs", "expenses", "financeCosts"], sortOrder: 100 },
]);

const FS_BY_CATEGORY = new Map(
  FS_LINE_DEFINITIONS.flatMap((line) => line.categories.map((category) => [category, line])),
);

export function createTrialBalanceLedger(accounts, engagementId = "eng_demo") {
  return (accounts || []).map((account, index) => ({
    id: stableId("jl", { engagementId, accountId: account.id, sourceRow: index + 1 }),
    engagementId,
    entryId: stableId("je", { engagementId, sourceRow: index + 1 }),
    accountId: account.id,
    lineNo: 1,
    debitMinor: canonicalInteger(account.debitMinor || "0", "debitMinor"),
    creditMinor: canonicalInteger(account.creditMinor || "0", "creditMinor"),
    sourceKind: "trial_balance_adapter",
    sourceRow: index + 1,
  }));
}

function inputValueForLine(line, definition) {
  const debit = toBigInt(line.debitMinor, "debitMinor");
  const credit = toBigInt(line.creditMinor, "creditMinor");
  return definition.normalSide === "debit" ? debit - credit : credit - debit;
}

export function buildStatementRun({
  engagementId,
  accounts,
  journalLines,
  mappingByAccount = null,
  rulesetVersion,
  effectiveAt,
}) {
  if (!engagementId || !rulesetVersion || !effectiveAt) throw new TypeError("statement run requires fixed identity, ruleset, and effective time");
  const accountMap = new Map((accounts || []).map((account) => [account.id, account]));
  const sourceRows = (journalLines || []).map((line) => {
    const account = accountMap.get(line.accountId);
    const mappedCode = mappingByAccount?.[line.accountId];
    const definition = mappedCode
      ? FS_LINE_DEFINITIONS.find((item) => item.code === mappedCode)
      : FS_BY_CATEGORY.get(account?.category);
    if (!account || !definition) return null;
    return {
      line,
      account,
      definition,
      value: inputValueForLine(line, definition),
    };
  }).filter(Boolean).sort((a, b) => a.line.id.localeCompare(b.line.id));

  const snapshotHash = sha256HexSync(canonicalJSON(sourceRows.map(({ line, definition, value }) => ({
    id: line.id,
    accountId: line.accountId,
    fsLineCode: definition.code,
    valueInt: value.toString(),
  }))));
  const runId = stableId("run", { engagementId, kind: "statements", snapshotHash, rulesetVersion });
  const provenanceNodes = [];
  const derivations = [];
  const figures = [];
  const figureNodeById = new Map();

  const addFigure = ({ scopeKey, labelAr, statement, inputNodes, value, formula, scope = "fs_line" }) => {
    const sortedInputs = [...inputNodes].sort((a, b) => a.id.localeCompare(b.id));
    const derivationId = stableId("drv", { engagementId, runId, scope, scopeKey, inputs: sortedInputs.map(({ id }) => id), formula });
    const valueInt = toBigInt(value).toString();
    const figureId = stableId("fig", { engagementId, runId, scope, scopeKey, valueInt, derivationId });
    const derivation = { id: derivationId, engagementId, runId, kind: "sum_of_nodes", formula, inputNodeIds: sortedInputs.map(({ id }) => id) };
    const figure = { id: figureId, engagementId, runId, scope, scopeKey, labelAr, statement, unit: "halala", valueInt, computedAt: effectiveAt, rulesetVersion, derivationId };
    const node = { id: stableId("pvn", { engagementId, kind: "figure", figureId }), engagementId, kind: "figure", entityId: figureId, unit: "halala", valueInt, createdAt: effectiveAt };
    derivations.push(derivation);
    figures.push(figure);
    provenanceNodes.push(node);
    figureNodeById.set(figureId, node);
    return figure;
  };

  const categoryFigures = new Map();
  for (const definition of FS_LINE_DEFINITIONS) {
    const rows = sourceRows.filter((row) => row.definition.code === definition.code);
    const nodes = rows.map(({ line, value }) => {
      const node = { id: stableId("pvn", { engagementId, kind: "journal_line", entityId: line.id }), engagementId, kind: "journal_line", entityId: line.id, unit: "halala", valueInt: value.toString(), createdAt: effectiveAt };
      provenanceNodes.push(node);
      return node;
    });
    const value = rows.reduce((sum, row) => sum + row.value, 0n);
    categoryFigures.set(definition.code, addFigure({
      scopeKey: definition.code,
      labelAr: definition.labelAr,
      statement: definition.statement,
      inputNodes: nodes,
      value,
      formula: `SUM(journal_lines WHERE fs_line='${definition.code}')`,
    }));
  }

  const revenue = categoryFigures.get("IS.REVENUE");
  const otherIncome = categoryFigures.get("IS.OTHER_INCOME");
  const expenses = categoryFigures.get("IS.EXPENSES");
  const netResult = addFigure({
    scopeKey: "IS.NET_RESULT",
    labelAr: "نتيجة الفترة",
    statement: "IS",
    inputNodes: [figureNodeById.get(revenue.id), figureNodeById.get(otherIncome.id), figureNodeById.get(expenses.id)],
    value: toBigInt(revenue.valueInt) + toBigInt(otherIncome.valueInt) - toBigInt(expenses.valueInt),
    formula: "IS.REVENUE + IS.OTHER_INCOME - IS.EXPENSES",
  });
  const currentResult = addFigure({
    scopeKey: "BS.EQ.CURRENT_RESULT",
    labelAr: "نتيجة الفترة ضمن حقوق الملكية",
    statement: "BS",
    inputNodes: [figureNodeById.get(netResult.id)],
    value: netResult.valueInt,
    formula: "CARRY(IS.NET_RESULT)",
  });
  const assetFigures = [...categoryFigures.values()].filter((figure) => figure.scopeKey.startsWith("BS.CA") || figure.scopeKey.startsWith("BS.NCA"));
  const liabilityEquityFigures = [...categoryFigures.values()].filter((figure) => figure.scopeKey.startsWith("BS.CL") || figure.scopeKey.startsWith("BS.NCL") || figure.scopeKey === "BS.EQ.EQUITY");
  const totalAssetsValue = assetFigures.reduce((sum, figure) => sum + toBigInt(figure.valueInt), 0n);
  const totalLiabilitiesEquityValue = [...liabilityEquityFigures, currentResult].reduce((sum, figure) => sum + toBigInt(figure.valueInt), 0n);
  const totalAssets = addFigure({ scopeKey: "BS.TOTAL_ASSETS", labelAr: "إجمالي الأصول", statement: "BS", inputNodes: assetFigures.map((figure) => figureNodeById.get(figure.id)), value: totalAssetsValue, formula: "SUM(BS asset figures)" });
  const totalLiabilitiesEquity = addFigure({ scopeKey: "BS.TOTAL_LIABILITIES_EQUITY", labelAr: "إجمالي الالتزامات وحقوق الملكية", statement: "BS", inputNodes: [...liabilityEquityFigures, currentResult].map((figure) => figureNodeById.get(figure.id)), value: totalLiabilitiesEquityValue, formula: "SUM(BS liability and equity figures)" });
  const difference = totalAssetsValue - totalLiabilitiesEquityValue;
  const balanceDifference = addFigure({ scopeKey: "BS.BALANCE_DIFFERENCE", labelAr: "فرق معادلة المركز المالي", statement: "BS", inputNodes: [figureNodeById.get(totalAssets.id), figureNodeById.get(totalLiabilitiesEquity.id)], value: difference, formula: "BS.TOTAL_ASSETS - BS.TOTAL_LIABILITIES_EQUITY", scope: "control" });

  return {
    engineVersion: AUDIT_CORE_VERSION,
    run: { id: runId, engagementId, kind: "statements", inputSnapshotHash: snapshotHash, rulesetVersion, effectiveAt },
    figures,
    derivations,
    provenanceNodes,
    balanceCheck: { balanced: difference === 0n, differenceMinor: difference.toString(), figureId: balanceDifference.id },
  };
}

export function traceFigure(graph, figureId) {
  const figureMap = new Map((graph?.figures || []).map((figure) => [figure.id, figure]));
  const derivationMap = new Map((graph?.derivations || []).map((derivation) => [derivation.id, derivation]));
  const nodeMap = new Map((graph?.provenanceNodes || []).map((node) => [node.id, node]));
  const visitedFigures = new Set();
  const sources = [];
  const steps = [];
  const visit = (id) => {
    if (visitedFigures.has(id)) throw new Error("cycle detected in derivation graph");
    visitedFigures.add(id);
    const figure = figureMap.get(id);
    if (!figure) throw new Error(`unknown figure ${id}`);
    const derivation = derivationMap.get(figure.derivationId);
    if (!derivation) throw new Error(`missing derivation for ${id}`);
    steps.push({ figure, derivation });
    for (const inputNodeId of derivation.inputNodeIds) {
      const node = nodeMap.get(inputNodeId);
      if (!node) throw new Error(`missing input node ${inputNodeId}`);
      if (node.kind === "figure") visit(node.entityId);
      else sources.push(node);
    }
    visitedFigures.delete(id);
  };
  visit(figureId);
  return { figure: figureMap.get(figureId), steps, sources: sources.sort((a, b) => a.entityId.localeCompare(b.entityId)) };
}

export function buildMateriality({ benchmarkMinor, omRateBp, pmRateBp, cttRateBp, rationaleAr }) {
  const benchmark = toBigInt(benchmarkMinor, "benchmarkMinor");
  if (benchmark < 0n) throw new RangeError("materiality benchmark cannot be negative");
  for (const [name, rate] of Object.entries({ omRateBp, pmRateBp, cttRateBp })) {
    if (!Number.isInteger(rate) || rate < 1 || rate > 10_000) throw new RangeError(`${name} must be integer basis points`);
  }
  if (normalizeAr(rationaleAr).length < 10) throw new TypeError("materiality rationale is required");
  const om = mulDivFloor(benchmark, BigInt(omRateBp), 10_000n);
  const pm = mulDivFloor(om, BigInt(pmRateBp), 10_000n);
  const ctt = mulDivFloor(om, BigInt(cttRateBp), 10_000n);
  return { benchmarkMinor: benchmark.toString(), omMinor: om.toString(), pmMinor: pm.toString(), cttMinor: ctt.toString(), omRateBp, pmRateBp, cttRateBp, rationaleAr: String(rationaleAr).trim() };
}

export function isa705Decide({ basis, isMaterial, isPervasive }) {
  if (!["misstatement", "scope_limitation", "none"].includes(basis)) throw new TypeError("unsupported opinion basis");
  if (typeof isMaterial !== "boolean" || typeof isPervasive !== "boolean") throw new TypeError("opinion flags must be boolean");
  if (basis === "none" || !isMaterial) return "unmodified";
  if (basis === "misstatement") return isPervasive ? "adverse" : "qualified";
  return isPervasive ? "disclaimer" : "qualified";
}

export function assessMisstatements(misstatements, omMinor, {
  basis = "misstatement",
  isPervasive = false,
  pervasivenessRationaleAr = "",
  scopeLimitationIsMaterial = false,
  scopeLimitationRationaleAr = "",
} = {}) {
  if (!["misstatement", "scope_limitation", "none"].includes(basis)) throw new TypeError("unsupported opinion basis");
  const open = (misstatements || []).filter((item) => !item.corrected);
  const net = open.reduce((sum, item) => sum + toBigInt(item.amountMinor, "misstatement amount"), 0n);
  const overstatement = open.reduce((sum, item) => {
    const amount = toBigInt(item.amountMinor, "misstatement amount");
    return amount > 0n ? sum + amount : sum;
  }, 0n);
  const understatement = open.reduce((sum, item) => {
    const amount = toBigInt(item.amountMinor, "misstatement amount");
    return amount < 0n ? sum + absBig(amount) : sum;
  }, 0n);
  const maxIndividual = open.reduce((largest, item) => {
    const amount = absBig(toBigInt(item.amountMinor, "misstatement amount"));
    return amount > largest ? amount : largest;
  }, 0n);
  const gross = overstatement + understatement;
  const quantitativeExposure = [overstatement, understatement, maxIndividual]
    .reduce((largest, amount) => amount > largest ? amount : largest, 0n);
  const qualitative = open.some((item) => item.qualitative === true && normalizeAr(item.qualitativeRationaleAr).length >= 10);
  if (typeof scopeLimitationIsMaterial !== "boolean") throw new TypeError("scope limitation materiality must be boolean");
  if (basis === "scope_limitation" && scopeLimitationIsMaterial && normalizeAr(scopeLimitationRationaleAr).length < 10) {
    throw new TypeError("material scope limitation requires a documented human rationale");
  }
  const effectiveBasis = open.length || basis === "scope_limitation" ? basis : "none";
  const isMaterial = effectiveBasis === "scope_limitation"
    ? scopeLimitationIsMaterial
    : effectiveBasis === "misstatement" && (exceeds(quantitativeExposure, toBigInt(omMinor, "omMinor")) || qualitative);
  if (isPervasive && normalizeAr(pervasivenessRationaleAr).length < 10) throw new TypeError("pervasiveness requires a documented human rationale");
  if (isPervasive && !isMaterial) throw new TypeError("pervasiveness requires a material matter");
  return {
    netMinor: net.toString(),
    grossMinor: gross.toString(),
    overstatementMinor: overstatement.toString(),
    understatementMinor: understatement.toString(),
    maxIndividualMinor: maxIndividual.toString(),
    quantitativeExposureMinor: quantitativeExposure.toString(),
    quantitativeBasis: "max_directional_aggregate_without_netting",
    openCount: open.length,
    qualitative,
    isMaterial,
    isPervasive,
    basis: effectiveBasis,
    opinionType: isa705Decide({ basis: effectiveBasis, isMaterial, isPervasive }),
    pervasivenessRationaleAr: String(pervasivenessRationaleAr || ""),
    scopeLimitationIsMaterial,
    scopeLimitationRationaleAr: String(scopeLimitationRationaleAr || ""),
  };
}

function normalizedClaimValue(text, unit) {
  if (unit === "halala") return parseMinorUnits(text).toString();
  const value = normalizeDigits(text).replace(/[٬,]/g, "").trim();
  if (!/^-?\d+$/.test(value)) throw new TypeError("claim is not an integer value");
  return BigInt(value).toString();
}

export function validateClaimProposal(proposal, facts) {
  const textAr = String(proposal?.text_ar || proposal?.textAr || "");
  if (OPINION_TERMS.test(normalizeAr(textAr))) return { status: "rejected", code: "opinion_language_forbidden" };
  if (SPELLED_NUMBER_TERMS.test(normalizeAr(textAr))) return { status: "rejected", code: "spelled_number_forbidden" };
  const factMap = facts instanceof Map ? facts : new Map((facts || []).map((fact) => [fact.id, fact]));
  const claims = Array.isArray(proposal?.claims) ? proposal.claims : [];
  const tokens = [...textAr.matchAll(NUMERIC_TOKEN)].map((match) => ({ start: match.index, end: match.index + match[0].length, text: match[0] }));
  for (const token of tokens) {
    const claim = claims.find(({ span }) => Array.isArray(span) && span[0] <= token.start && span[1] >= token.end);
    if (!claim) return { status: "rejected", code: "unclaimed_number", span: [token.start, token.end] };
    const fact = factMap.get(claim.fact_id || claim.factId);
    if (!fact || fact.engagement_id !== proposal.engagement_id) return { status: "rejected", code: "invalid_fact_reference" };
    try {
      if (normalizedClaimValue(token.text, fact.unit) !== canonicalInteger(fact.value_num ?? fact.valueInt, "fact value")) {
        return { status: "rejected", code: "fact_value_mismatch", factId: fact.id };
      }
    } catch {
      return { status: "rejected", code: "invalid_claim_value", factId: fact.id };
    }
  }
  return { status: "passed" };
}

export function appendAuditEntry(chain, { engagementId, actor, action, payload, at }) {
  if (!engagementId || !actor || !action || !at) throw new TypeError("audit entry fields are required");
  const previous = chain?.length ? chain[chain.length - 1] : null;
  const prevHash = previous?.entryHash || GENESIS_HASH;
  const canonicalPayload = { engagement_id: engagementId, actor, action, payload, at };
  const entryHash = sha256HexSync(`${prevHash}${canonicalJSON(canonicalPayload)}`);
  return { seq: (previous?.seq || 0) + 1, engagementId, actor, action, payload, at, canonicalVersion: CANONICAL_VERSION, prevHash, entryHash };
}

export function verifyAuditChain(chain, engagementId) {
  let prevHash = GENESIS_HASH;
  for (let index = 0; index < (chain || []).length; index += 1) {
    const entry = chain[index];
    if (entry.engagementId !== engagementId || entry.prevHash !== prevHash || entry.seq !== index + 1) return { valid: false, brokenSeq: entry.seq || index + 1 };
    const expected = sha256HexSync(`${prevHash}${canonicalJSON({ engagement_id: entry.engagementId, actor: entry.actor, action: entry.action, payload: entry.payload, at: entry.at })}`);
    if (entry.entryHash !== expected) return { valid: false, brokenSeq: entry.seq };
    prevHash = entry.entryHash;
  }
  return { valid: true, brokenSeq: null, headHash: prevHash };
}

function entryTotalMinor(entry) {
  return (entry.lines || []).reduce((total, line) => total + toBigInt(line.debitMinor || "0"), 0n);
}

function finding(testCode, entry, detail, severity = "attention") {
  return {
    id: stableId("fnd", { testCode, entryId: entry?.id || null, detail }),
    testCode,
    testVersion: "1.0.0",
    severity,
    entryId: entry?.id || null,
    detail,
  };
}

export function runJETests(entries, params = {}) {
  const population = [...(entries || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const findings = [];
  const pairCounts = new Map();
  const userCounts = new Map();
  for (const entry of population) {
    const codes = [...new Set((entry.lines || []).map((line) => line.accountCode || line.accountId).filter(Boolean))].sort();
    const pair = codes.join("|");
    if (pair) pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
    const user = String(entry.postedBy || "");
    if (user) userCounts.set(user, (userCounts.get(user) || 0) + 1);
  }
  const holidays = new Set(params.holidays || []);
  const revenueAccounts = new Set(params.revenueAccountIds || []);
  const periodEnd = params.periodEnd ? Date.parse(`${params.periodEnd}T00:00:00Z`) : null;
  for (const entry of population) {
    const debit = (entry.lines || []).reduce((sum, line) => sum + toBigInt(line.debitMinor || "0"), 0n);
    const credit = (entry.lines || []).reduce((sum, line) => sum + toBigInt(line.creditMinor || "0"), 0n);
    const total = entryTotalMinor(entry);
    const totalDigits = total.toString();
    const trailingZeros = totalDigits.match(/0+$/)?.[0]?.length || 0;
    if (trailingZeros >= (params.roundZeros ?? 5)) findings.push(finding("JE.ROUND", entry, { trailingZeros, totalMinor: total.toString() }));
    const entryDate = String(entry.entryDate || "").slice(0, 10);
    const weekday = entryDate ? new Date(`${entryDate}T00:00:00Z`).getUTCDay() : -1;
    if (weekday === 5 || weekday === 6 || holidays.has(entryDate)) findings.push(finding("JE.WEEKEND", entry, { entryDate, calendarVersion: params.calendarVersion || "SA-v1" }));
    const postedAt = Date.parse(entry.postedDate || entry.postedAt || "");
    const datedAt = Date.parse(entry.entryDate || "");
    if (periodEnd != null && postedAt > periodEnd && datedAt <= periodEnd) findings.push(finding("JE.AFTER_END", entry, { entryDate: entry.entryDate, postedDate: entry.postedDate || entry.postedAt }));
    const pair = [...new Set((entry.lines || []).map((line) => line.accountCode || line.accountId).filter(Boolean))].sort().join("|");
    if (pair && (pairCounts.get(pair) || 0) < (params.rarePairThreshold ?? 2)) findings.push(finding("JE.RARE_PAIR", entry, { pair, occurrences: pairCounts.get(pair) || 0 }));
    if (entry.isManual && (entry.lines || []).some((line) => revenueAccounts.has(line.accountId))) findings.push(finding("JE.MANUAL_REV", entry, { revenueAccount: true }, "significant"));
    for (const limit of params.approvalLimitsMinor || []) {
      const threshold = toBigInt(limit);
      const margin = mulDivFloor(threshold, BigInt(params.thresholdMarginBp ?? 100), 10_000n);
      if (total < threshold && threshold - total <= margin) findings.push(finding("JE.THRESHOLD", entry, { totalMinor: total.toString(), thresholdMinor: threshold.toString() }));
    }
    const userCount = userCounts.get(String(entry.postedBy || "")) || 0;
    if (entry.postedBy && BigInt(userCount * 10_000) < BigInt(population.length * (params.rareUserRateBp ?? 100))) findings.push(finding("JE.RARE_USER", entry, { postedBy: entry.postedBy, occurrences: userCount }));
    if (debit !== credit) findings.push(finding("JE.UNBALANCED", entry, { debitMinor: debit.toString(), creditMinor: credit.toString() }, "significant"));
  }
  const entryNumbers = population.map((entry) => String(entry.entryNo || "")).filter((value) => /^\d+$/.test(value)).map(BigInt).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  for (let index = 1; index < entryNumbers.length; index += 1) {
    if (entryNumbers[index] - entryNumbers[index - 1] > 1n) findings.push(finding("JE.SEQ_GAP", null, { after: entryNumbers[index - 1].toString(), before: entryNumbers[index].toString() }));
  }
  const leading = Array(9).fill(0);
  for (const entry of population) {
    const digit = entryTotalMinor(entry).toString().replace(/^0+/, "")[0];
    if (digit && digit !== "-") leading[Number(digit) - 1] += 1;
  }
  const expectedBp = [3010, 1761, 1249, 969, 792, 669, 580, 512, 458];
  const count = leading.reduce((sum, value) => sum + value, 0);
  if (count >= (params.benfordMinimumPopulation ?? 30)) {
    const maxDeviationBp = leading.reduce((maximum, value, index) => {
      const actualBp = Math.trunc((value * 10_000) / count);
      return Math.max(maximum, Math.abs(actualBp - expectedBp[index]));
    }, 0);
    if (maxDeviationBp > (params.benfordDeviationBp ?? 500)) findings.push(finding("JE.BENFORD", null, { population: count, maxDeviationBp }));
  }
  return findings.sort((a, b) => a.testCode.localeCompare(b.testCode) || String(a.entryId).localeCompare(String(b.entryId)));
}

export const OPEN_DECISION_POLICY = Object.freeze({
  pervasiveness: "overall_opinion_assessment_with_human_rationale",
  unauditedOpeningBalances: "isa510_finding_then_human_scope_assessment",
  holidayCalendar: "versioned_vendored_sa_calendar_no_runtime_fetch",
  qualitativeMateriality: "phase1_human_override_with_category_and_rationale",
});
