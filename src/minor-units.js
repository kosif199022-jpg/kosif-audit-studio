// وحدة واحدة لتحويل القيم النقدية إلى وحدات صغرى (هللات).
// السبب: كانت ثلاثة ملفات تكرر السقوط إلى `BigInt(Math.round(Number(x) * 100))`،
// وهو مسار يقبل بصمت ما يرفضه المسار الصارم، ويسقط الإشارة السالبة، ويفقد الدقة
// فوق 2^53. هذا الملف يمنع تكرار ذلك.

const CANONICAL_MINOR = /^-?(?:0|[1-9]\d*)$/;
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeDigits(value) {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));
}

/** يحوّل نصًا نقديًا إلى وحدات صغرى دون أي عملية عائمة. يرمي عند التجاوز. */
export function parseMajorToMinor(rawValue, exponent = 2) {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 6) {
    throw new TypeError("currency exponent must be a small integer");
  }
  let value = normalizeDigits(rawValue).trim();
  if (!value) throw new TypeError("empty monetary value");
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
  value = value.replace(/[\s\u00a0٬,]/g, "").replace("٫", ".");
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new TypeError(`invalid monetary value "${rawValue}"`);
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > exponent) {
    throw new RangeError(`precision exceeds currency exponent for "${rawValue}"`);
  }
  const minor = BigInt(whole) * (10n ** BigInt(exponent))
    + BigInt((fraction + "0".repeat(exponent)).slice(0, exponent) || "0");
  return negative ? -minor : minor;
}

/**
 * المصدر الوحيد لقراءة مبلغ الحساب.
 * يقبل bigint أو سلسلة صحيحة قانونية (بما فيها السالبة)، وإلا يقرأ الحقل
 * القديم بالوحدات الكبرى عبر مسار نصي دقيق. لا يوجد `Math.round(x * 100)`.
 */
export function resolveMinor(minorValue, legacyMajorValue, label = "amount") {
  if (typeof minorValue === "bigint") return minorValue;
  if (typeof minorValue === "number") {
    if (!Number.isSafeInteger(minorValue)) {
      throw new TypeError(`${label}: minor units must be an exact integer, received ${minorValue}`);
    }
    return BigInt(minorValue);
  }
  if (typeof minorValue === "string" && minorValue.trim() !== "") {
    const candidate = normalizeDigits(minorValue).trim();
    if (!CANONICAL_MINOR.test(candidate)) {
      throw new TypeError(`${label}: non-canonical minor units "${minorValue}"`);
    }
    return BigInt(candidate);
  }
  if (legacyMajorValue === undefined || legacyMajorValue === null || legacyMajorValue === "") return 0n;
  if (typeof legacyMajorValue === "number" && !Number.isFinite(legacyMajorValue)) {
    throw new TypeError(`${label}: non-finite legacy amount`);
  }
  return parseMajorToMinor(legacyMajorValue);
}

/** نسخة لا ترمي، للمسارات العرضية فقط. تُبلّغ عن الفشل بدل ابتلاعه. */
export function tryResolveMinor(minorValue, legacyMajorValue, label = "amount") {
  try {
    return { ok: true, value: resolveMinor(minorValue, legacyMajorValue, label) };
  } catch (error) {
    return { ok: false, value: 0n, reason: error.message };
  }
}

export function resolveAccountMinor(account, label = "amountMinor") {
  return resolveMinor(account?.amountMinor, account?.amount, label);
}

export function absMinor(value) {
  return value < 0n ? -value : value;
}

/** عرض دقيق بلا تحويل عائم — يبقى صحيحًا فوق 2^53. */
export function formatMinorExact(value, locale = "ar-SA-u-nu-latn") {
  const amount = typeof value === "bigint" ? value : resolveMinor(value, null, "display amount");
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(absolute / 100n);
  return `${negative ? "−" : ""}${whole}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
