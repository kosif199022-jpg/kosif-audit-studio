import { createFreshEngagement, createImportedAccount } from "./data.js";
import { buildDatasetCommitment } from "./governance.js";
import { SNAPSHOT_SCHEMA_VERSION } from "./session-export.js";

const CANONICAL_NONNEGATIVE_INTEGER = /^(0|[1-9]\d*)$/;
const POSITIVE_DECIMAL = /^(?:[1-9]\d*)(?:\.\d+)?$|^0\.\d*[1-9]\d*$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const RAW_ACCOUNT_KEYS = new Set([
  "code",
  "name",
  "debitMinor",
  "creditMinor",
  "accountCurrency",
  "balanceCurrency",
  "exponent",
  "monetaryItem",
  "closingRate",
]);
const RESTORE_PAYLOAD_KEYS = new Set(["contractVersion", "dataset", "accounts", "commitment"]);
const DATASET_KEYS = new Set(["period", "currency", "exponent", "committedAt", "totalDebitMinor", "totalCreditMinor"]);
const COMMITMENT_KEYS = new Set(["schemaVersion", "datasetId", "sha256", "rowCount", "period", "currency", "exponent", "committedAt"]);
const MAX_GRAPH_NODES = 600_000;
const MAX_GRAPH_DEPTH = 40;
const MAX_CONTAINER_KEYS = 100_000;
const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);
const SUPPORTED_EXPONENT = 2;

export const MAX_SESSION_SNAPSHOT_BYTES = 32 * 1024 * 1024;
export const MAX_SESSION_SNAPSHOT_ACCOUNTS = 50_000;

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertSafeObjectGraph(root) {
  const stack = [{ value: root, depth: 0 }];
  let visited = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== "object") continue;
    visited += 1;
    if (visited > MAX_GRAPH_NODES) fail("snapshot_too_complex", "لقطة الجلسة تتجاوز حد التعقيد المسموح.");
    if (depth > MAX_GRAPH_DEPTH) fail("snapshot_too_deep", "لقطة الجلسة تحتوي تداخلًا أعمق من الحد المسموح.");
    const keys = Object.keys(value);
    if (keys.length > MAX_CONTAINER_KEYS) fail("snapshot_too_complex", "أحد أقسام لقطة الجلسة يتجاوز الحد المسموح.");
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key)) fail("unsafe_key", "لقطة الجلسة تحتوي مفتاحًا غير مسموح.");
      stack.push({ value: value[key], depth: depth + 1 });
    }
  }
}

function assertExactKeys(value, allowed, label) {
  if (!isPlainRecord(value)) fail("invalid_field", `${label} غير صالح.`);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) fail("unexpected_field", `${label} يحتوي الحقل غير المسموح «${unexpected}».`);
  const missing = [...allowed].find((key) => !Object.hasOwn(value, key));
  if (missing) fail("invalid_field", `${label} يفتقد الحقل «${missing}».`);
}

function requiredText(value, label, maxLength = 500) {
  if (
    typeof value !== "string"
    || !value.trim()
    || value.length > maxLength
    || CONTROL_CHARACTERS.test(value)
  ) fail("invalid_field", `${label} غير صالح.`);
  return value.trim();
}

function canonicalMinor(value, label) {
  if (typeof value !== "string" || !CANONICAL_NONNEGATIVE_INTEGER.test(value)) {
    fail("invalid_money", `${label} يجب أن يكون عددًا صحيحًا غير سالب بصيغة معيارية في الوحدات الصغرى.`);
  }
  const minor = BigInt(value);
  if (minor > MAX_SAFE_MINOR) fail("unsafe_amount", `${label} يتجاوز حد العرض والحساب الآمن لهذه النسخة.`);
  return value;
}

function canonicalIso(value, label) {
  const text = requiredText(value, label, 40);
  let normalized;
  try {
    normalized = new Date(text).toISOString();
  } catch {
    fail("invalid_commitment_time", `${label} غير صالح.`);
  }
  if (normalized !== text) fail("invalid_commitment_time", `${label} يجب أن يكون توقيت ISO UTC معياريًا.`);
  return text;
}

function strictCurrency(value, label) {
  const currency = requiredText(value, label, 3);
  if (!CURRENCY_CODE.test(currency)) fail("invalid_currency", `${label} غير صالحة.`);
  return currency;
}

function closingRate(value, label) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 40 || !POSITIVE_DECIMAL.test(value)) {
    fail("invalid_closing_rate", `${label} غير صالح.`);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) fail("invalid_closing_rate", `${label} غير صالح.`);
  return value;
}

function restoreRawAccount(rawAccount, index, dataset) {
  const label = `الحساب رقم ${index + 1}`;
  assertExactKeys(rawAccount, RAW_ACCOUNT_KEYS, label);
  const code = requiredText(rawAccount.code, `رمز ${label}`, 120);
  const name = requiredText(rawAccount.name, `اسم ${label}`, 500);
  const debitMinor = canonicalMinor(rawAccount.debitMinor, `مدين ${label}`);
  const creditMinor = canonicalMinor(rawAccount.creditMinor, `دائن ${label}`);
  if (BigInt(debitMinor) > 0n && BigInt(creditMinor) > 0n) fail("invalid_account_sides", `${label} يحتوي مدينًا ودائنًا معًا.`);
  if (BigInt(debitMinor) === 0n && BigInt(creditMinor) === 0n) fail("zero_account", `${label} صفري ولا يجوز إدخاله في لقطة الاستعادة.`);
  const accountCurrency = strictCurrency(rawAccount.accountCurrency, `عملة ${label}`);
  const balanceCurrency = strictCurrency(rawAccount.balanceCurrency, `عملة قياس ${label}`);
  if (balanceCurrency !== dataset.currency) fail("mixed_dataset_currency", `${label} لا يستخدم عملة قياس مجموعة البيانات.`);
  if (!Number.isInteger(rawAccount.exponent) || rawAccount.exponent !== dataset.exponent) {
    fail("mixed_dataset_exponent", `${label} لا يستخدم دقة الوحدات الصغرى لمجموعة البيانات.`);
  }
  if (typeof rawAccount.monetaryItem !== "boolean") fail("invalid_field", `صفة البند النقدي في ${label} غير صالحة.`);
  const normalizedClosingRate = closingRate(rawAccount.closingRate, `سعر الإقفال في ${label}`);

  const account = createImportedAccount({
    code,
    name,
    debitMinor,
    creditMinor,
    currency: accountCurrency,
    functionalCurrency: balanceCurrency,
    monetaryItem: rawAccount.monetaryItem,
    closingRate: normalizedClosingRate,
  }, index);
  return { ...account, source: "untrusted-local-restore" };
}

function commitmentMatches(expected, actual) {
  return expected.schemaVersion === actual.schemaVersion
    && expected.datasetId === actual.datasetId
    && expected.sha256 === actual.sha256
    && expected.rowCount === actual.rowCount
    && expected.period === actual.period
    && expected.currency === actual.currency
    && expected.exponent === actual.exponent
    && expected.committedAt === actual.committedAt;
}

export function parseSessionSnapshotText(text, {
  restoredAt = new Date().toISOString(),
  maxBytes = MAX_SESSION_SNAPSHOT_BYTES,
  maxAccounts = MAX_SESSION_SNAPSHOT_ACCOUNTS,
} = {}) {
  if (typeof text !== "string") fail("invalid_input", "ملف الجلسة يجب أن يكون نص JSON.");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_SESSION_SNAPSHOT_BYTES) fail("invalid_limit", "حد حجم لقطة الجلسة غير صالح.");
  if (!Number.isSafeInteger(maxAccounts) || maxAccounts < 1 || maxAccounts > MAX_SESSION_SNAPSHOT_ACCOUNTS) fail("invalid_limit", "حد عدد حسابات لقطة الجلسة غير صالح.");
  if (new TextEncoder().encode(text).byteLength > maxBytes) fail("snapshot_too_large", "حجم لقطة الجلسة يتجاوز 32 MB.");
  const normalizedRestoredAt = canonicalIso(restoredAt, "وقت الاستعادة");
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    fail("invalid_json", "ملف الجلسة ليس JSON صالحًا.");
  }
  assertSafeObjectGraph(snapshot);
  if (snapshot?.manifest?.format !== "kosif-session-snapshot" || snapshot?.manifest?.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    fail("unsupported_snapshot", `يدعم التطبيق لقطة KOSIF بالإصدار ${SNAPSHOT_SCHEMA_VERSION} فقط.`);
  }

  const payload = snapshot.restorePayload;
  assertExactKeys(payload, RESTORE_PAYLOAD_KEYS, "عقد الاستعادة");
  if (payload.contractVersion !== 1) fail("unsupported_restore_contract", "إصدار عقد الاستعادة غير مدعوم.");
  assertExactKeys(payload.dataset, DATASET_KEYS, "وصف مجموعة البيانات");
  assertExactKeys(payload.commitment, COMMITMENT_KEYS, "بصمة مجموعة البيانات");
  const period = requiredText(payload.dataset.period, "فترة اللقطة", 300);
  const currency = strictCurrency(payload.dataset.currency, "عملة اللقطة");
  if (!Number.isInteger(payload.dataset.exponent) || payload.dataset.exponent !== SUPPORTED_EXPONENT) {
    fail("unsupported_exponent", `تدعم هذه النسخة دقة عملة واحدة مقدارها ${SUPPORTED_EXPONENT} فقط.`);
  }
  const exponent = payload.dataset.exponent;
  const committedAt = canonicalIso(payload.dataset.committedAt, "وقت التزام اللقطة");
  const expectedTotalDebitMinor = canonicalMinor(payload.dataset.totalDebitMinor, "إجمالي المدين");
  const expectedTotalCreditMinor = canonicalMinor(payload.dataset.totalCreditMinor, "إجمالي الدائن");

  const sourceAccounts = payload.accounts;
  if (!Array.isArray(sourceAccounts) || sourceAccounts.length < 1 || sourceAccounts.length > maxAccounts) {
    fail("invalid_population", `عدد الحسابات يجب أن يكون بين 1 و${maxAccounts}.`);
  }
  const dataset = { period, currency, exponent, committedAt };
  const accounts = sourceAccounts.map((account, index) => restoreRawAccount(account, index, dataset));
  if (new Set(accounts.map(({ id }) => id)).size !== accounts.length || new Set(accounts.map(({ code }) => code)).size !== accounts.length) {
    fail("duplicate_accounts", "تحتوي اللقطة معرفات أو رموز حسابات مكررة.");
  }
  const totalDebitMinor = accounts.reduce((total, account) => total + BigInt(account.debitMinor), 0n);
  const totalCreditMinor = accounts.reduce((total, account) => total + BigInt(account.creditMinor), 0n);
  if (totalDebitMinor > MAX_SAFE_MINOR || totalCreditMinor > MAX_SAFE_MINOR) fail("unsafe_total", "إجماليات اللقطة تتجاوز حد الحساب الآمن لهذه النسخة.");
  if (totalDebitMinor !== totalCreditMinor) fail("unbalanced_snapshot", "ميزان اللقطة غير متوازن.");
  if (expectedTotalDebitMinor !== totalDebitMinor.toString() || expectedTotalCreditMinor !== totalCreditMinor.toString()) {
    fail("totals_mismatch", "إجماليات عقد الاستعادة لا تطابق صفوف الحسابات.");
  }

  if (!SHA256.test(String(payload.commitment.sha256 || ""))) fail("commitment_mismatch", "بصمة مجموعة البيانات غير صالحة.");
  const sourceCommitment = buildDatasetCommitment(accounts, { period, currency, exponent, committedAt });
  if (!commitmentMatches(payload.commitment, sourceCommitment)) fail("commitment_mismatch", "بصمة مجموعة البيانات لا تطابق محتوى عقد الاستعادة.");

  const commitment = buildDatasetCommitment(accounts, { period, currency, exponent, committedAt: normalizedRestoredAt });
  const profile = {
    ...commitment,
    source: "import",
    label: "استعادة JSON محلية محكومة",
    rowCount: accounts.length,
    importedAt: normalizedRestoredAt,
    committedAt: normalizedRestoredAt,
    warnings: 1,
    trust: "untrusted-local-restore",
    sessionOnly: true,
  };
  const engagement = createFreshEngagement({
    entity: {
      name: "منشأة مستعادة محليًا",
      period,
      currency: currency === "SAR" ? "ريال سعودي" : currency,
      activity: "يلزم استكماله وإعادة اعتماده",
      framework: "المعايير الدولية كما اعتمدتها الهيئة",
      entityType: "يلزم تحديده",
    },
  }, profile, normalizedRestoredAt);
  engagement.auditTrail[0].detail += " تم التحقق من عقد البيانات وبصمته واتزانه، وأُعيد اشتقاق التصنيفات من الرموز والأسماء. لم تُستعد هوية منشأة غير موثقة أو سياسة أهمية أو اعتماد أو دليل أو نتيجة أو قفل.";
  return {
    accounts,
    engagement,
    dataProfile: profile,
    snapshotManifest: snapshot.manifest,
    preview: {
      entityName: engagement.entity.name,
      period,
      currency,
      exponent,
      rowCount: accounts.length,
      datasetId: sourceCommitment.datasetId,
      digest: sourceCommitment.sha256,
      committedAt,
    },
  };
}
