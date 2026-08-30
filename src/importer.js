const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

const HEADER_ALIASES = {
  code: ["code", "account code", "account no", "account number", "رقم الحساب", "رمز الحساب", "كود الحساب"],
  name: ["name", "account", "account name", "description", "اسم الحساب", "الحساب", "البيان", "الوصف"],
  debit: ["debit", "debits", "debit balance", "مدين", "رصيد مدين", "الحركة المدينة"],
  credit: ["credit", "credits", "credit balance", "دائن", "رصيد دائن", "الحركة الدائنة"],
  currency: ["currency", "account currency", "transaction currency", "العملة", "عملة الحساب", "عملة الرصيد"],
  functionalCurrency: ["functional currency", "base currency", "العملة الوظيفية", "عملة وظيفية"],
  monetaryItem: ["monetary item", "is monetary", "monetary", "هل البند نقدي", "بند نقدي", "نقدي"],
  closingRate: ["closing rate", "closing exchange rate", "year end rate", "سعر الإقفال", "سعر الاقفال", "سعر الصرف الختامي"],
};

const REQUIRED_COLUMNS = ["code", "name", "debit", "credit"];

const CURRENCY_ALIASES = new Map([
  ["ريال", "SAR"],
  ["ريال سعودي", "SAR"],
  ["saudi riyal", "SAR"],
  ["دولار", "USD"],
  ["دولار امريكي", "USD"],
  ["us dollar", "USD"],
  ["يورو", "EUR"],
  ["euro", "EUR"],
]);

function normalizeDigits(value) {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));
}

function normalizeHeader(value) {
  return normalizeDigits(value)
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function detectDelimiter(lines) {
  const candidates = ["\t", ",", ";", "|"];
  const sample = lines.slice(0, 8);
  const scores = candidates.map((delimiter) => {
    const counts = sample.map((line) => parseDelimitedLine(line, delimiter).length);
    const usable = counts.filter((count) => count >= 3);
    const consistency = usable.length
      ? usable.filter((count) => count === usable[0]).length / usable.length
      : 0;
    return { delimiter, score: usable.length * 10 + consistency * 5 + Math.max(0, ...counts) };
  });
  return scores.sort((a, b) => b.score - a.score)[0]?.delimiter || ",";
}

function resolveColumns(headers) {
  const normalized = headers.map(normalizeHeader);
  return Object.fromEntries(Object.entries(HEADER_ALIASES).map(([field, aliases]) => {
    const normalizedAliases = aliases.map(normalizeHeader);
    const exactIndex = normalized.findIndex((header) => normalizedAliases.includes(header));
    if (exactIndex >= 0 || !REQUIRED_COLUMNS.includes(field)) return [field, exactIndex];
    return [field, normalized.findIndex((header) => normalizedAliases.some((alias) => header.startsWith(`${alias} `)))];
  }));
}

function normalizeCurrencyCode(value, fallback = "SAR") {
  const raw = normalizeDigits(value).trim();
  if (!raw) return { value: fallback, valid: true, defaulted: true };
  const upper = raw.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return { value: upper, valid: true, defaulted: false };
  const alias = CURRENCY_ALIASES.get(normalizeHeader(raw));
  if (alias) return { value: alias, valid: true, defaulted: false };
  return { value: fallback, valid: false, defaulted: true };
}

function parseMonetaryItem(value) {
  const normalized = normalizeHeader(value);
  if (!normalized) return { value: false, valid: true, defaulted: true };
  if (["1", "true", "yes", "y", "نعم", "نقدي", "monetary"].includes(normalized)) {
    return { value: true, valid: true, defaulted: false };
  }
  if (["0", "false", "no", "n", "لا", "غير نقدي", "non monetary", "nonmonetary"].includes(normalized)) {
    return { value: false, valid: true, defaulted: false };
  }
  return { value: false, valid: false, defaulted: true };
}

function parseClosingRate(value) {
  const raw = normalizeDigits(value).trim();
  if (!raw) return { value: null, valid: true };
  const normalized = raw
    .replace(/\s+/g, "")
    .replace(/[٬,]/g, ".")
    .replace(/٫/g, ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return { value: null, valid: false };
  const rate = Number(normalized);
  return Number.isFinite(rate) && rate > 0
    ? { value: rate, valid: true }
    : { value: null, valid: false };
}

function optionalCell(cells, columnIndex) {
  return columnIndex >= 0 ? cells[columnIndex] : "";
}

export function findTrialBalanceHeaderRow(rows, maxRows = 50) {
  const limit = Math.min(Array.isArray(rows) ? rows.length : 0, maxRows);
  for (let index = 0; index < limit; index += 1) {
    const row = Array.isArray(rows[index]) ? rows[index] : [];
    const columns = resolveColumns(row);
    if (REQUIRED_COLUMNS.every((field) => columns[field] >= 0)) return index;
  }
  return -1;
}

export function parseMoneyToMinor(rawValue) {
  let value = normalizeDigits(rawValue).trim();
  if (!value || value === "-") return 0n;

  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }

  value = value
    .replace(/\s+/g, "")
    .replace(/(?:SAR|SR|ر\.س|ريال(?:سعودي)?)/gi, "")
    .replace(/[٬']/g, ",")
    .replace(/٫/g, ".");

  if (value.startsWith("-")) {
    negative = !negative;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }

  if (!/^\d+(?:[,.]\d+)*$/.test(value)) {
    throw new TypeError(`قيمة مالية غير صالحة: ${rawValue}`);
  }

  const separators = [",", "."].filter((separator) => value.includes(separator));
  let whole = value;
  let fraction = "";

  if (separators.length === 2) {
    const decimalSeparator = value.lastIndexOf(",") > value.lastIndexOf(".") ? "," : ".";
    const decimalIndex = value.lastIndexOf(decimalSeparator);
    const tail = value.slice(decimalIndex + 1);
    if (!/^\d{1,2}$/.test(tail)) {
      throw new TypeError(`القيمة المالية تتجاوز منزلتين عشريتين: ${rawValue}`);
    }
    const grouped = value.slice(0, decimalIndex);
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    const groups = grouped.split(groupingSeparator);
    if (grouped.includes(decimalSeparator) || groups[0].length < 1 || groups[0].length > 3 || groups.slice(1).some((group) => group.length !== 3)) {
      throw new TypeError(`تنسيق فواصل الآلاف غير صالح: ${rawValue}`);
    }
    whole = groups.join("");
    fraction = tail;
  } else if (separators.length === 1) {
    const separator = separators[0];
    const groups = value.split(separator);
    if (groups.length === 2 && /^\d{1,2}$/.test(groups[1])) {
      [whole, fraction] = groups;
    } else if (
      groups[0] !== "0"
      && groups[0].length >= 1
      && groups[0].length <= 3
      && groups.slice(1).every((group) => /^\d{3}$/.test(group))
    ) {
      whole = groups.join("");
    } else {
      throw new TypeError(`القيمة المالية تتجاوز منزلتين عشريتين أو تستخدم تجميعًا غير صالح: ${rawValue}`);
    }
  }

  if (!/^\d+$/.test(whole || "0") || (fraction && !/^\d{1,2}$/.test(fraction))) {
    throw new TypeError(`قيمة مالية غير صالحة: ${rawValue}`);
  }

  const minor = (BigInt(whole || "0") * 100n) + BigInt((fraction || "").padEnd(2, "0") || "0");
  return negative ? -minor : minor;
}

export function parseTrialBalanceText(text) {
  const lines = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], errors: [{ row: 0, message: "أضف صف العناوين وصف بيانات واحدًا على الأقل." }], warnings: [], balanced: false, totalDebitMinor: 0n, totalCreditMinor: 0n, delimiter: null };
  }

  const delimiter = detectDelimiter(lines);
  const headers = parseDelimitedLine(lines[0], delimiter);
  const columns = resolveColumns(headers);
  const missing = REQUIRED_COLUMNS.filter((field) => columns[field] < 0);

  if (missing.length) {
    const labels = { code: "رمز الحساب", name: "اسم الحساب", debit: "مدين", credit: "دائن" };
    return {
      rows: [],
      errors: [{ row: 1, message: `تعذر العثور على الأعمدة: ${missing.map((field) => labels[field]).join("، ")}.` }],
      warnings: [],
      balanced: false,
      totalDebitMinor: 0n,
      totalCreditMinor: 0n,
      delimiter,
    };
  }

  const rows = [];
  const errors = [];
  const warnings = [];
  const seenCodes = new Set();
  let totalDebitMinor = 0n;
  let totalCreditMinor = 0n;

  for (let index = 1; index < lines.length; index += 1) {
    const sourceRow = index + 1;
    const cells = parseDelimitedLine(lines[index], delimiter);
    const code = normalizeDigits(cells[columns.code] || "").trim();
    const name = String(cells[columns.name] || "").trim();
    if (!code && !name) continue;
    if (!code || !name) {
      errors.push({ row: sourceRow, message: "يجب إدخال رمز الحساب واسمه." });
      continue;
    }
    if (seenCodes.has(code)) {
      errors.push({ row: sourceRow, message: `رمز الحساب ${code} مكرر.` });
      continue;
    }

    let debitMinor;
    let creditMinor;
    try {
      debitMinor = parseMoneyToMinor(cells[columns.debit]);
      creditMinor = parseMoneyToMinor(cells[columns.credit]);
    } catch (error) {
      errors.push({ row: sourceRow, message: error.message });
      continue;
    }

    if (debitMinor < 0n) {
      creditMinor += -debitMinor;
      debitMinor = 0n;
      warnings.push({ row: sourceRow, message: "نُقل الرصيد المدين السالب إلى الجانب الدائن؛ راجعه قبل الالتزام." });
    }
    if (creditMinor < 0n) {
      debitMinor += -creditMinor;
      creditMinor = 0n;
      warnings.push({ row: sourceRow, message: "نُقل الرصيد الدائن السالب إلى الجانب المدين؛ راجعه قبل الالتزام." });
    }
    if (debitMinor > 0n && creditMinor > 0n) {
      errors.push({ row: sourceRow, message: "لا يمكن أن يحتوي الحساب على رصيد مدين ودائن معًا." });
      continue;
    }
    if (debitMinor > BigInt(Number.MAX_SAFE_INTEGER) || creditMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
      errors.push({ row: sourceRow, message: "القيمة تتجاوز حد العرض الآمن لهذه النسخة؛ قسّم الحساب أو استخدم طبقة الخادم المحكومة." });
      continue;
    }
    if (debitMinor === 0n && creditMinor === 0n) {
      warnings.push({ row: sourceRow, message: "استُبعد حساب صفري من ملف الاستيراد." });
      continue;
    }

    const parsedCurrency = normalizeCurrencyCode(optionalCell(cells, columns.currency));
    const parsedFunctionalCurrency = normalizeCurrencyCode(optionalCell(cells, columns.functionalCurrency));
    const parsedMonetaryItem = parseMonetaryItem(optionalCell(cells, columns.monetaryItem));
    const parsedClosingRate = parseClosingRate(optionalCell(cells, columns.closingRate));

    if (!parsedCurrency.valid) {
      warnings.push({ row: sourceRow, message: "عملة الحساب غير معروفة؛ استُخدم SAR كافتراض آمن." });
    }
    if (!parsedFunctionalCurrency.valid) {
      warnings.push({ row: sourceRow, message: "العملة الوظيفية غير معروفة؛ استُخدم SAR كافتراض آمن." });
    }
    if (!parsedMonetaryItem.valid) {
      warnings.push({ row: sourceRow, message: "تعذر تفسير حقل البند النقدي؛ اعتُبر غير نقدي حتى يراجعه المستخدم." });
    }
    if (!parsedClosingRate.valid) {
      warnings.push({ row: sourceRow, message: "سعر الإقفال غير صالح؛ لم يُستخدم في أي قياس." });
    }
    if (
      parsedCurrency.value !== parsedFunctionalCurrency.value
      && parsedMonetaryItem.value
      && parsedClosingRate.value == null
    ) {
      warnings.push({ row: sourceRow, message: "بند نقدي بعملة أجنبية بلا سعر إقفال؛ يلزم استكمال السعر قبل إعادة التقييم وفق IAS 21." });
    }

    seenCodes.add(code);
    totalDebitMinor += debitMinor;
    totalCreditMinor += creditMinor;
    rows.push({
      code,
      name,
      debitMinor: String(debitMinor),
      creditMinor: String(creditMinor),
      currency: parsedCurrency.value,
      functionalCurrency: parsedFunctionalCurrency.value,
      monetaryItem: parsedMonetaryItem.value,
      closingRate: parsedClosingRate.value,
      balanceCurrency: parsedFunctionalCurrency.value,
      amountBasis: "functional-currency-equivalent",
      sourceRow,
    });
  }

  const differenceMinor = totalDebitMinor >= totalCreditMinor
    ? totalDebitMinor - totalCreditMinor
    : totalCreditMinor - totalDebitMinor;

  return {
    rows,
    errors,
    warnings,
    balanced: rows.length > 0 && errors.length === 0 && differenceMinor === 0n,
    totalDebitMinor,
    totalCreditMinor,
    differenceMinor,
    delimiter,
  };
}

export function createCsvTemplate() {
  return [
    "رمز الحساب,اسم الحساب,مدين,دائن,العملة,العملة الوظيفية,هل البند نقدي,سعر الإقفال",
    "110001,النقد في الصندوق,125000.00,0,SAR,SAR,نعم,1",
    "410001,إيرادات الخدمات,0,125000.00,SAR,SAR,لا,1",
  ].join("\n");
}
