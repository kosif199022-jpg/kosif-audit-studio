import { buildAnalyticalReview } from "./analytics.js";
import { resolveAccountMapping } from "./standards.js";

const encoder = new TextEncoder();

const SHA256_INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotateRight(value, amount) {
  return ((value >>> amount) | (value << (32 - amount))) >>> 0;
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return encoder.encode(String(value));
}

function portableSha256Hex(value) {
  const input = asBytes(value);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;

  const view = new DataView(bytes.buffer);
  const bitLength = BigInt(input.length) * 8n;
  view.setUint32(paddedLength - 8, Number((bitLength >> 32n) & 0xffffffffn), false);
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn), false);

  const state = [...SHA256_INITIAL_STATE];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + (index * 4), false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15];
      const previous2 = words[index - 2];
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choose + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

export function sha256HexSync(value) {
  return portableSha256Hex(value);
}

function accountMinor(account) {
  if (typeof account?.amountMinor === "string" && /^\d+$/.test(account.amountMinor)) return BigInt(account.amountMinor);
  return BigInt(Math.round(Number(account?.amount || 0) * 100));
}

function compareMinorDescending(first, second) {
  const firstMinor = accountMinor(first);
  const secondMinor = accountMinor(second);
  if (firstMinor === secondMinor) return 0;
  return firstMinor > secondMinor ? -1 : 1;
}

function formatReferenceList(values) {
  return [...new Set(values.filter(Boolean))].slice(0, 6);
}

export async function sha256Hex(value, cryptoProvider = globalThis.crypto) {
  if (cryptoProvider?.subtle) {
    try {
      const digest = await cryptoProvider.subtle.digest("SHA-256", asBytes(value));
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      // The local preview can run outside a secure context. Keep exports usable
      // while preserving the exact SHA-256 contract in that environment.
    }
  }
  return portableSha256Hex(value);
}

export async function sha256BytesHex(bytes, cryptoProvider = globalThis.crypto) {
  return sha256Hex(asBytes(bytes), cryptoProvider);
}

export function buildDatasetCommitment(accounts = [], {
  period = "",
  currency = "SAR",
  exponent = 2,
  committedAt = null,
} = {}) {
  const datasetCurrency = String(currency);
  const datasetExponent = Number(exponent);
  const canonicalRows = accounts.map((account, index) => [
    index + 1,
    String(account?.code || "").trim(),
    String(account?.name || "").trim(),
    String(account?.debitMinor || "0"),
    String(account?.creditMinor || "0"),
    String(account?.currency || account?.accountCurrency || datasetCurrency),
    String(account?.functionalCurrency || account?.balanceCurrency || datasetCurrency),
    Number(account?.exponent ?? datasetExponent),
    account?.monetaryItem === true,
    account?.closingRate == null || account?.closingRate === "" ? null : String(account.closingRate),
  ]);
  // JSON over fixed-position tuples is unambiguous even when imported text
  // contains delimiter-like characters. The previous delimiter-concatenated
  // representation could admit two different row sets with the same bytes.
  const canonical = JSON.stringify({
    contract: "kosif-trial-balance-commitment-v2",
    period: String(period),
    currency: datasetCurrency,
    exponent: datasetExponent,
    committedAt: String(committedAt || ""),
    rows: canonicalRows,
  });
  const sha256 = portableSha256Hex(canonical);
  return {
    schemaVersion: 2,
    datasetId: `KOSIF-TB-${sha256.slice(0, 16).toUpperCase()}`,
    sha256,
    rowCount: accounts.length,
    period: String(period),
    currency: datasetCurrency,
    exponent: datasetExponent,
    committedAt,
  };
}

function canonicalEntry(entry, previousHash) {
  const lines = entry.lines
    .map((line) => [line.code, line.debitMinor, line.creditMinor].join(":"))
    .join("|");
  return [entry.id, entry.period, entry.postedAt, entry.description, lines, previousHash].join("§");
}

export function createJournalEntries(accounts, limit = 24) {
  const entries = [];
  for (let index = 0; index < Math.min(limit, Math.floor((accounts?.length || 0) / 2)); index += 1) {
    const first = accounts[index * 2];
    const second = accounts[(index * 2) + 1];
    const amountMinor = accountMinor(first);
    entries.push({
      id: `JE-${String(index + 1).padStart(4, "0")}`,
      period: "2025-12",
      postedAt: `2025-12-${String((index % 27) + 1).padStart(2, "0")}T${String((index % 9) + 8).padStart(2, "0")}:15:00.000Z`,
      description: `قيد ترحيل محكوم — ${first.areaLabel}`,
      status: "posted",
      totalMinor: String(amountMinor),
      lines: [
        { code: first.code, name: first.name, debitMinor: String(amountMinor), creditMinor: "0" },
        { code: second.code, name: second.name, debitMinor: "0", creditMinor: String(amountMinor) },
      ],
    });
  }
  return entries;
}

export async function buildJournalHashChain(entries) {
  let previousHash = "0".repeat(64);
  const chain = [];
  for (const entry of entries || []) {
    const hash = await sha256Hex(canonicalEntry(entry, previousHash));
    chain.push({ ...entry, previousHash, hash });
    previousHash = hash;
  }
  return chain;
}

export async function verifyJournalHashChain(entries) {
  let previousHash = "0".repeat(64);
  for (const entry of entries || []) {
    if (entry.previousHash !== previousHash) return false;
    const expected = await sha256Hex(canonicalEntry(entry, previousHash));
    if (entry.hash !== expected) return false;
    previousHash = entry.hash;
  }
  return true;
}

export function buildRiskSample(accounts, sampleSize = 36) {
  const population = Array.isArray(accounts) ? accounts : [];
  if (!population.length || sampleSize <= 0) return [];
  const boundedSize = Math.min(sampleSize, population.length);
  const selected = new Map();
  const ranked = [...population].sort((a, b) => {
    const riskWeight = { high: 3, medium: 2, low: 1 };
    const riskDelta = (riskWeight[b.risk] || 0) - (riskWeight[a.risk] || 0);
    return riskDelta || compareMinorDescending(a, b);
  });

  const targetedCount = Math.ceil(boundedSize * 0.6);
  for (const account of ranked.slice(0, targetedCount)) {
    selected.set(account.id, { account, basis: account.risk === "high" ? "مخاطر مرتفعة" : "قيمة مرتفعة" });
  }

  const remaining = population.filter((account) => !selected.has(account.id));
  const needed = boundedSize - selected.size;
  const interval = needed ? Math.max(1, Math.floor(remaining.length / needed)) : 1;
  for (let index = 7; selected.size < boundedSize && index < remaining.length; index += interval) {
    const account = remaining[index];
    selected.set(account.id, { account, basis: "اختيار منهجي قابل للإعادة" });
  }
  for (const account of remaining) {
    if (selected.size >= boundedSize) break;
    if (!selected.has(account.id)) selected.set(account.id, { account, basis: "استكمال المجتمع" });
  }

  return [...selected.values()].map(({ account, basis }, index) => ({
    order: index + 1,
    id: account.id,
    code: account.code,
    name: account.name,
    area: account.areaLabel,
    risk: account.risk,
    amountMinor: account.amountMinor,
    amount: account.amount,
    basis,
  }));
}

function isCouncilAdjustmentPosted(adjustment) {
  if (
    adjustment?.status !== "accepted"
    || !adjustment?.journalReference
    || !Number.isFinite(Date.parse(adjustment?.reviewedAt || ""))
    || !Number.isFinite(Date.parse(adjustment?.postedAt || ""))
    || Date.parse(adjustment.reviewedAt) > Date.parse(adjustment.postedAt)
    || !adjustment?.reviewedBy
    || !adjustment?.currency
    || !/^\d+$/.test(adjustment?.amountMinor || "")
    || !Array.isArray(adjustment?.lines)
    || adjustment.lines.length < 2
  ) return false;
  let debit = 0n;
  let credit = 0n;
  for (const line of adjustment.lines) {
    if (!line?.accountId || !line?.code || !line?.name || !/^\d+$/.test(line?.debitMinor || "") || !/^\d+$/.test(line?.creditMinor || "")) return false;
    const lineDebit = BigInt(line.debitMinor);
    const lineCredit = BigInt(line.creditMinor);
    if ((lineDebit > 0n) === (lineCredit > 0n)) return false;
    debit += lineDebit;
    credit += lineCredit;
  }
  return debit > 0n && debit === credit && debit === BigInt(adjustment.amountMinor);
}

function mostFrequentAccountingStandards(accounts, engagement, limit = 3) {
  const counts = new Map();
  for (const account of accounts || []) {
    const resolution = resolveAccountMapping(account, engagement?.standardMappings);
    for (const id of resolution.accountingStandardIds || []) {
      if (id === "IFRS 18") continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .map(([id]) => id);
}

export function buildCouncilSnapshot(accounts, engagement, mappingMetrics, options = {}) {
  const analysis = buildAnalyticalReview(accounts);
  const duplicateCodes = (accounts?.length || 0) - new Set((accounts || []).map(({ code }) => code)).size;
  const totalDebitMinor = (accounts || []).reduce((total, account) => total + BigInt(account.debitMinor || 0), 0n);
  const totalCreditMinor = (accounts || []).reduce((total, account) => total + BigInt(account.creditMinor || 0), 0n);
  const openHigh = (engagement?.findings || []).filter((item) => item.severity === "high" && item.status !== "closed");
  const pendingEvidence = (engagement?.evidence || []).filter((item) => item.status !== "approved");
  const pendingAdjustments = (engagement?.adjustments || []).filter((item) => !isCouncilAdjustmentPosted(item));
  const incompleteRounds = (engagement?.rounds || []).filter((item) => item.status !== "complete");
  const mappingRate = Number(mappingMetrics?.mappingRate || 0);
  const mappingApproved = Boolean(
    mappingRate === 100
    && Number(mappingMetrics?.unresolved || 0) === 0
    && engagement?.mappingConfirmed === true
    && Number.isFinite(Date.parse(engagement?.standardMappings?.review?.confirmedAt || ""))
    && engagement?.standardMappings?.review?.reviewer
    && engagement?.standardMappings?.review?.rationale
  );
  const technicalReferences = mostFrequentAccountingStandards(accounts, engagement);
  const datasetDigest = options.datasetDigest || engagement?.sourceDataset?.sha256 || engagement?.demo?.commitment?.sha256 || null;
  const analysisBasis = options.analysisBasis || "source-trial-balance";

  const advisors = [
    {
      id: "data-integrity",
      role: "مدقق البيانات والدفتر",
      standard: "ISA 230 · ISA 500",
      severity: totalDebitMinor !== totalCreditMinor || duplicateCodes ? "high" : "low",
      verdict: totalDebitMinor === totalCreditMinor && duplicateCodes === 0 ? "السكان متوازنة وفريدة" : "توجد مشكلة سلامة بيانات",
      detail: `فُحص ${accounts.length.toLocaleString("ar-SA-u-nu-latn")} حسابًا على أساس ${analysisBasis}؛ التكرارات ${duplicateCodes} وفارق الوحدات الصغرى ${(totalDebitMinor - totalCreditMinor).toString()}${datasetDigest ? `؛ بصمة المصدر ${datasetDigest.slice(0, 12)}…` : ""}.`,
      actions: duplicateCodes ? ["معالجة رموز الحسابات المكررة قبل الاختبار"] : ["تثبيت لقطة البيانات وربطها ببصمة الترحيل"],
      refs: ["TB", "LOG", "JE"],
    },
    {
      id: "technical",
      role: "المراجع الفني للمعايير",
      standard: "IFRS / IAS · ISA 315",
      severity: mappingApproved ? "low" : "medium",
      verdict: mappingApproved ? "اكتملت خريطة المعايير واعتمدها المراجع" : "الخريطة غير معتمدة مهنيًا بعد",
      detail: `تغطية الربط ${mappingRate.toFixed(1)}%؛ حالة الاعتماد البشري ${mappingApproved ? "موثقة" : "ناقصة"}. لا يدخل IFRS 18 في ربط بيانات 2025 إلا عند تطبيق مبكر موثق.`,
      actions: mappingApproved ? ["تحديث تحقق المصادر قبل الإصدار"] : ["مراجعة قائمة الاستثناءات", "توثيق المراجع والأساس وتوقيت اعتماد الخريطة"],
      refs: formatReferenceList(["MAP", "ISA 315", ...technicalReferences]),
    },
    {
      id: "risk-evidence",
      role: "مدقق المخاطر والأدلة",
      standard: "ISA 330 · ISA 500 · ISA 530",
      severity: openHigh.length || pendingEvidence.length ? "high" : "low",
      verdict: openHigh.length ? `${openHigh.length} ملاحظات مرتفعة لم تُغلق` : "لا توجد ملاحظة مرتفعة مفتوحة",
      detail: `${pendingEvidence.length} طلبات أدلة غير معتمدة؛ تعرض المخاطر المرتفعة ${analysis.highRiskExposurePct.toFixed(2)}% من المجتمع.`,
      actions: ["تنفيذ العينة الموجهة بالمخاطر", "ربط كل مستند بطلب وجولة وتأكيد"],
      refs: formatReferenceList([...pendingEvidence.map(({ id }) => id), ...openHigh.map(({ id }) => id)]),
    },
    {
      id: "completion",
      role: "مراجع الإقفال والتقرير",
      standard: "ISA 450 · ISA 700 · ISA 705",
      severity: pendingAdjustments.length || incompleteRounds.length ? "medium" : "low",
      verdict: incompleteRounds.length ? `${incompleteRounds.length} جولات لم تُقفل` : pendingAdjustments.length ? "توجد تسويات غير مرحلة بقيد صحيح" : "الجولات والتسويات مكتملة",
      detail: `${pendingAdjustments.length} تسويات غير مستوفية للترحيل المتوازن والتوثيق؛ مدخلات الحكم والاعتماد النهائي بشريان، ونوع الرأي مشتق حتميًا وفق ISA 705.`,
      actions: ["حسم التسويات", "تشغيل قائمة الإكمال", "توثيق مدخلات ISA 705 واعتماد الرأي المشتق"],
      refs: formatReferenceList([...pendingAdjustments.map(({ id }) => id), ...incompleteRounds.map(({ id }) => id)]),
    },
  ];

  const high = advisors.filter(({ severity }) => severity === "high").length;
  const medium = advisors.filter(({ severity }) => severity === "medium").length;
  const configuredEngineVersion = engagement?.council?.engineVersion;
  return {
    generatedAt: new Date().toISOString(),
    engineVersion: configuredEngineVersion && configuredEngineVersion !== "KOSIF-COUNCIL-v3"
      ? configuredEngineVersion
      : "KOSIF-COUNCIL-v4",
    analysisBasis,
    datasetDigest,
    advisors,
    consensus: {
      status: high ? "action_required" : medium ? "review" : "clear",
      high,
      medium,
      low: advisors.length - high - medium,
      recommendation: high ? "تنفيذ إجراءات إضافية قبل الإقفال" : medium ? "استكمال نقاط المراجعة قبل الاعتماد" : "جاهز للعرض على المراجع البشري",
    },
  };
}

export function buildEvidenceLineage(accounts, engagement, limit = 6) {
  const highRiskAccounts = (accounts || [])
    .filter(({ risk }) => risk === "high")
    .sort(compareMinorDescending)
    .slice(0, limit);

  return highRiskAccounts.map((account) => {
    const resolution = resolveAccountMapping(account, engagement?.standardMappings);
    const evidence = engagement?.evidence || [];
    const accountStandardIds = new Set(resolution.effectiveStandardIds || []);
    const request = evidence.find((item) => item.categoryKeys?.includes(account.category))
      || evidence.find((item) => item.area === account.areaLabel)
      || evidence.find((item) => (
        item.standardIds?.some((standardId) => accountStandardIds.has(standardId))
        && item.assertions?.some((assertion) => account.assertions?.includes(assertion))
      ))
      || evidence.find((item) => item.assertions?.some((assertion) => account.assertions?.includes(assertion)));
    const finding = (engagement?.findings || []).find((item) => request?.findingIds?.includes(item.id))
      || (engagement?.findings || []).find((item) => item.categoryKeys?.includes(account.category))
      || (engagement?.findings || []).find((item) => resolution.effectiveStandardIds.includes(item.standard));

    return {
      accountId: account.id,
      code: account.code,
      account: account.name,
      standard: resolution.effectiveStandardIds[0] || account.standard,
      assertion: account.assertions?.[0] || "—",
      risk: account.risks?.[0] || "—",
      procedure: account.procedures?.[0] || "—",
      evidence: request?.id || account.evidence?.[0] || "—",
      roundId: request?.roundId || "—",
      finding: finding?.id || "—",
    };
  });
}

export function buildReconciliationCases(entries) {
  const source = (entries || []).slice(0, 12);
  return source.map((entry, index) => {
    let method = "exact";
    let differenceMinor = 0n;
    let status = "matched";
    if (index % 6 === 5) {
      method = "exception";
      differenceMinor = 12_500n;
      status = "review";
    } else if (index % 5 === 4) {
      method = "tolerance";
      differenceMinor = 75n;
    } else if (index % 4 === 3) {
      method = "combined";
    } else if (index % 3 === 2) {
      method = "split";
    }
    return {
      id: `REC-${String(index + 1).padStart(3, "0")}`,
      bookReference: entry.id,
      amountMinor: entry.totalMinor,
      differenceMinor: String(differenceMinor),
      method,
      status,
    };
  });
}
