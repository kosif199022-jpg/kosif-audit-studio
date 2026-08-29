/**
 * KOSIF Audit Studio deterministic engine.
 * All accountable monetary calculations use integer minor units (BigInt).
 * AI-style commentary in the UI never posts entries or approves an audit opinion.
 */

const ARABIC_DIGITS = Object.freeze({
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
});

export const ROUND_DEFINITIONS = Object.freeze([
  { id: 1, code: 'A01', title: 'قبول الارتباط والاستقلال', gate: 'توثيق القبول، الاستقلال، تضارب المصالح ونطاق الارتباط.' },
  { id: 2, code: 'A02', title: 'فهم المنشأة والبيئة', gate: 'توثيق النشاط والعمليات والنظم والحوكمة والأطراف ذات العلاقة.' },
  { id: 3, code: 'A03', title: 'الأهمية النسبية', gate: 'اعتماد الأساس والنسبة وأهمية الأداء وحد التحريف التافه.' },
  { id: 4, code: 'A04', title: 'تقييم المخاطر', gate: 'ربط مخاطر التحريف الجوهري بالتأكيدات والحسابات والإفصاحات.' },
  { id: 5, code: 'A05', title: 'الضوابط والاختبارات', gate: 'تحديد الضوابط واختبار التصميم والتنفيذ والفعالية التشغيلية.' },
  { id: 6, code: 'A06', title: 'الإجراءات الجوهرية', gate: 'تنفيذ التحليلات والتفاصيل والعينات وربط كل نتيجة بدليل.' },
  { id: 7, code: 'A07', title: 'التقديرات والأحكام', gate: 'اختبار النماذج والافتراضات والبيانات والتحيز الإداري.' },
  { id: 8, code: 'A08', title: 'الاستمرارية والأحداث اللاحقة', gate: 'تقييم التدفقات وخطط الإدارة والأحداث حتى تاريخ التقرير.' },
  { id: 9, code: 'A09', title: 'الإكمال والتحريفات', gate: 'تجميع التحريفات والمراجعة التحليلية والإقرارات الختامية.' },
  { id: 10, code: 'A10', title: 'التقرير ومراجعة الجودة', gate: 'تحديد الرأي والمسائل الرئيسية ومراجعة الشريك والاعتماد البشري.' }
]);

export function normalizeArabicDigits(value = '') {
  return String(value).replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit);
}

export function normalizeText(value = '') {
  return normalizeArabicDigits(value)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ');
}

export function parseMoneyMinor(value, decimals = 2) {
  if (typeof value === 'bigint') return value;
  if (value === null || value === undefined || value === '') return 0n;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
    throw new RangeError('decimals must be an integer between 0 and 6');
  }

  let raw = normalizeArabicDigits(value).trim();
  let negative = false;
  if (/^\(.*\)$/.test(raw)) {
    negative = true;
    raw = raw.slice(1, -1);
  }
  raw = raw
    .replace(/[\s\u00A0]/g, '')
    .replace(/[٬،]/g, ',')
    .replace(/[٫]/g, '.')
    .replace(/[^0-9,.-]/g, '');

  if (!raw || raw === '-' || raw === '.') return 0n;
  if (raw.startsWith('-')) {
    negative = !negative;
    raw = raw.slice(1);
  }

  // Treat the last separator as decimal only when the suffix is plausibly fractional.
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const lastSep = Math.max(lastComma, lastDot);
  let integerPart = raw;
  let fractionPart = '';
  if (lastSep >= 0) {
    const suffix = raw.slice(lastSep + 1).replace(/\D/g, '');
    const separatorCount = (raw.match(/[,.]/g) || []).length;
    const decimalCandidate = suffix.length > 0 && suffix.length <= decimals;
    if (decimalCandidate && (separatorCount === 1 || lastSep === Math.max(lastComma, lastDot))) {
      integerPart = raw.slice(0, lastSep);
      fractionPart = suffix;
    }
  }

  integerPart = integerPart.replace(/[,.]/g, '').replace(/\D/g, '') || '0';
  fractionPart = fractionPart.padEnd(decimals, '0').slice(0, decimals);
  const scale = 10n ** BigInt(decimals);
  const minor = BigInt(integerPart) * scale + BigInt(fractionPart || '0');
  return negative ? -minor : minor;
}

export function formatMoneyMinor(value, currency = 'SAR', locale = 'ar-SA', decimals = 2) {
  const minor = typeof value === 'bigint' ? value : BigInt(value || 0);
  const scale = 10n ** BigInt(decimals);
  const sign = minor < 0n ? -1 : 1;
  const absolute = minor < 0n ? -minor : minor;
  const whole = absolute / scale;
  const fraction = absolute % scale;
  const numeric = Number(whole) + Number(fraction) / Number(scale);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(sign * numeric);
}

export function absoluteMinor(value) {
  const v = typeof value === 'bigint' ? value : BigInt(value || 0);
  return v < 0n ? -v : v;
}

export function fnv1a(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function seededRandom(seed = 380019) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORY_RULES = [
  {
    category: 'نقدية وبنوك', normalBalance: 'debit', standards: ['IAS 7', 'IFRS 9', 'ISA 505'],
    assertions: ['الوجود', 'الحقوق والالتزامات', 'العرض'],
    keywords: ['نقد', 'صندوق', 'بنك', 'cash', 'bank', 'ودائع تحت الطلب']
  },
  {
    category: 'ذمم مدينة', normalBalance: 'debit', standards: ['IFRS 9', 'IFRS 7', 'IAS 1'],
    assertions: ['الوجود', 'التقييم', 'القطع', 'الحقوق'],
    keywords: ['عملاء', 'مدين', 'ذمم مدينه', 'receivable', 'trade debtors', 'مخصص ائتمان']
  },
  {
    category: 'مخزون', normalBalance: 'debit', standards: ['IAS 2', 'ISA 501'],
    assertions: ['الوجود', 'الاكتمال', 'التقييم', 'الحقوق'],
    keywords: ['مخزون', 'بضاعه', 'مواد خام', 'انتاج تام', 'inventory', 'stock']
  },
  {
    category: 'أصول ثابتة', normalBalance: 'debit', standards: ['IAS 16', 'IAS 36', 'IAS 23'],
    assertions: ['الوجود', 'التقييم', 'الحقوق', 'العرض'],
    keywords: ['اصول ثابته', 'ممتلكات', 'الات', 'معدات', 'مباني', 'سيارات', 'ppe', 'property plant']
  },
  {
    category: 'أصول غير ملموسة', normalBalance: 'debit', standards: ['IAS 38', 'IAS 36'],
    assertions: ['الوجود', 'التقييم', 'الحقوق', 'العرض'],
    keywords: ['غير ملموس', 'برامج', 'شهرة', 'علامه تجاريه', 'intangible', 'goodwill']
  },
  {
    category: 'استثمارات وأدوات مالية', normalBalance: 'debit', standards: ['IFRS 9', 'IFRS 7', 'IFRS 13'],
    assertions: ['الوجود', 'التقييم', 'الحقوق', 'العرض'],
    keywords: ['استثمار', 'اوراق ماليه', 'صكوك', 'اسهم', 'investment', 'financial asset']
  },
  {
    category: 'عقود وإيرادات', normalBalance: 'credit', standards: ['IFRS 15', 'IAS 1'],
    assertions: ['الحدوث', 'الاكتمال', 'الدقة', 'القطع', 'التصنيف'],
    keywords: ['ايراد', 'مبيعات', 'عقد عميل', 'revenue', 'sales', 'contract liability']
  },
  {
    category: 'إيجارات', normalBalance: 'mixed', standards: ['IFRS 16', 'IAS 36'],
    assertions: ['الاكتمال', 'التقييم', 'العرض', 'الحقوق والالتزامات'],
    keywords: ['ايجار', 'حق استخدام', 'التزام ايجار', 'lease', 'right of use']
  },
  {
    category: 'موردون والتزامات', normalBalance: 'credit', standards: ['IAS 1', 'IFRS 9', 'IAS 37'],
    assertions: ['الاكتمال', 'التقييم', 'القطع', 'الالتزامات'],
    keywords: ['مورد', 'دائن', 'التزامات', 'payable', 'creditor', 'accrual']
  },
  {
    category: 'قروض وتمويل', normalBalance: 'credit', standards: ['IFRS 9', 'IFRS 7', 'IAS 23'],
    assertions: ['الاكتمال', 'التقييم', 'العرض', 'الالتزامات'],
    keywords: ['قرض', 'تمويل', 'تسهيلات', 'loan', 'borrowing', 'finance']
  },
  {
    category: 'مخصصات ومنافع موظفين', normalBalance: 'credit', standards: ['IAS 19', 'IAS 37'],
    assertions: ['الاكتمال', 'التقييم', 'العرض'],
    keywords: ['مخصص', 'مكافاه نهايه خدمه', 'موظفين', 'provision', 'employee benefit']
  },
  {
    category: 'حقوق ملكية', normalBalance: 'credit', standards: ['IAS 1', 'IAS 33', 'IAS 32'],
    assertions: ['الوجود', 'الاكتمال', 'العرض'],
    keywords: ['راس المال', 'احتياطي', 'ارباح مبقاه', 'حقوق ملكيه', 'equity', 'capital', 'retained']
  },
  {
    category: 'مصروفات', normalBalance: 'debit', standards: ['IAS 1', 'IAS 8'],
    assertions: ['الحدوث', 'الاكتمال', 'الدقة', 'القطع', 'التصنيف'],
    keywords: ['مصروف', 'تكلفه', 'اجور', 'رواتب', 'expense', 'cost', 'salary']
  },
  {
    category: 'ضرائب وزكاة', normalBalance: 'mixed', standards: ['IAS 12', 'IAS 1'],
    assertions: ['الاكتمال', 'التقييم', 'العرض'],
    keywords: ['ضريبه', 'زكاه', 'vat', 'tax', 'ضريبة القيمه']
  }
];

export function classifyAccount(account = {}) {
  const code = normalizeArabicDigits(account.code ?? account.accountCode ?? '');
  const name = normalizeText(account.name ?? account.accountName ?? account.description ?? '');
  const haystack = `${code} ${name}`;
  const byKeyword = CATEGORY_RULES.find((rule) => rule.keywords.some((keyword) => haystack.includes(normalizeText(keyword))));
  if (byKeyword) return { ...byKeyword };

  const first = code.replace(/\D/g, '').slice(0, 1);
  const fallbacks = {
    '1': { category: 'أصول', normalBalance: 'debit', standards: ['IAS 1'], assertions: ['الوجود', 'التقييم', 'الحقوق'] },
    '2': { category: 'التزامات', normalBalance: 'credit', standards: ['IAS 1'], assertions: ['الاكتمال', 'التقييم', 'الالتزامات'] },
    '3': { category: 'حقوق ملكية', normalBalance: 'credit', standards: ['IAS 1'], assertions: ['الوجود', 'الاكتمال', 'العرض'] },
    '4': { category: 'إيرادات', normalBalance: 'credit', standards: ['IFRS 15'], assertions: ['الحدوث', 'القطع', 'الدقة'] },
    '5': { category: 'تكلفة ومصروفات', normalBalance: 'debit', standards: ['IAS 1'], assertions: ['الحدوث', 'القطع', 'الدقة'] },
    '6': { category: 'مصروفات تشغيلية', normalBalance: 'debit', standards: ['IAS 1'], assertions: ['الحدوث', 'الاكتمال', 'الدقة'] }
  };
  return fallbacks[first] ?? {
    category: 'غير مصنف', normalBalance: 'mixed', standards: ['IAS 1'],
    assertions: ['الاكتمال', 'التصنيف', 'العرض']
  };
}

const ALIASES = Object.freeze({
  code: ['code', 'accountcode', 'account_code', 'رقمالحساب', 'كودالحساب', 'كود', 'رقم'],
  name: ['name', 'accountname', 'account_name', 'اسمالحساب', 'الحساب', 'البيان', 'الوصف'],
  debit: ['debit', 'debits', 'مدين', 'رصيدمدين', 'debitbalance', 'debit_balance'],
  credit: ['credit', 'credits', 'دائن', 'رصيددائن', 'creditbalance', 'credit_balance'],
  balance: ['balance', 'netbalance', 'الرصيد', 'صافيالرصيد', 'net_balance'],
  currency: ['currency', 'العمله', 'عملة']
});

function canonicalHeader(value) {
  return normalizeText(value).replace(/[\s_\-\/\\]/g, '');
}

function pickValue(row, aliasKey) {
  const entries = Object.entries(row ?? {});
  const aliases = ALIASES[aliasKey] ?? [];
  for (const [key, value] of entries) {
    if (aliases.includes(canonicalHeader(key))) return value;
  }
  return undefined;
}

export function normalizeTrialBalanceRow(row, index = 0) {
  const rawCode = pickValue(row, 'code') ?? row.code ?? row.accountCode ?? `${index + 1}`;
  const rawName = pickValue(row, 'name') ?? row.name ?? row.accountName ?? `حساب ${index + 1}`;
  let debit = parseMoneyMinor(pickValue(row, 'debit') ?? row.debit ?? 0);
  let credit = parseMoneyMinor(pickValue(row, 'credit') ?? row.credit ?? 0);
  const balanceValue = pickValue(row, 'balance');
  if (debit === 0n && credit === 0n && balanceValue !== undefined && balanceValue !== '') {
    const net = parseMoneyMinor(balanceValue);
    if (net >= 0n) debit = net;
    else credit = -net;
  }
  if (debit < 0n) {
    credit += -debit;
    debit = 0n;
  }
  if (credit < 0n) {
    debit += -credit;
    credit = 0n;
  }
  const classification = classifyAccount({ code: rawCode, name: rawName });
  return {
    id: String(row.id ?? `TB-${String(index + 1).padStart(5, '0')}`),
    code: String(rawCode ?? '').trim(),
    name: String(rawName ?? '').trim(),
    debit,
    credit,
    net: debit - credit,
    currency: String(pickValue(row, 'currency') ?? row.currency ?? 'SAR').trim() || 'SAR',
    ...classification,
    sourceIndex: index
  };
}

export function validateTrialBalance(inputRows = []) {
  const rows = inputRows.map((row, index) => normalizeTrialBalanceRow(row, index));
  let totalDebit = 0n;
  let totalCredit = 0n;
  const rowIssues = [];
  const codeCounts = new Map();

  for (const row of rows) {
    totalDebit += row.debit;
    totalCredit += row.credit;
    if (!row.name) rowIssues.push({ rowId: row.id, severity: 'high', message: 'اسم الحساب مفقود.' });
    if (!row.code) rowIssues.push({ rowId: row.id, severity: 'medium', message: 'كود الحساب مفقود.' });
    if (row.debit > 0n && row.credit > 0n) {
      rowIssues.push({ rowId: row.id, severity: 'medium', message: 'الحساب يحمل رصيدًا مدينًا ودائنًا في الصف نفسه.' });
    }
    if (row.debit === 0n && row.credit === 0n) {
      rowIssues.push({ rowId: row.id, severity: 'low', message: 'الحساب بلا رصيد.' });
    }
    if (row.code) codeCounts.set(row.code, (codeCounts.get(row.code) ?? 0) + 1);
  }

  for (const [code, count] of codeCounts.entries()) {
    if (count > 1) rowIssues.push({ rowId: null, severity: 'medium', message: `كود الحساب ${code} مكرر ${count} مرات.` });
  }

  const imbalance = totalDebit - totalCredit;
  const balanced = absoluteMinor(imbalance) <= 1n;
  return {
    rows,
    totalDebit,
    totalCredit,
    imbalance,
    balanced,
    rowIssues,
    metrics: {
      accounts: rows.length,
      nonZero: rows.filter((row) => row.debit !== 0n || row.credit !== 0n).length,
      duplicates: [...codeCounts.values()].filter((count) => count > 1).length,
      categories: new Set(rows.map((row) => row.category)).size
    }
  };
}

function decimalRateToRatio(value, maxDecimals = 8) {
  let text = normalizeArabicDigits(value ?? 0).trim();
  if (!text || !/^\d*\.?\d+$/.test(text)) throw new TypeError('Rate must be a positive decimal number');
  const [whole = '0', fractionRaw = ''] = text.split('.');
  const fraction = fractionRaw.slice(0, maxDecimals);
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole || '0') * denominator + BigInt(fraction || '0');
  return { numerator, denominator, numeric: Number(text) };
}

function multiplyMinorByRatio(amount, ...ratios) {
  let numerator = amount;
  let denominator = 1n;
  for (const ratio of ratios) {
    numerator *= ratio.numerator;
    denominator *= ratio.denominator;
  }
  if (denominator === 0n) throw new RangeError('Rate denominator cannot be zero');
  // Round half-up while keeping all accountable calculations in integer minor units.
  return (numerator + denominator / 2n) / denominator;
}

export function calculateMateriality({
  benchmark = 'revenue',
  amountMinor = 0n,
  risk = 'medium',
  customRate = null,
  performanceRate = 0.70,
  trivialRate = 0.05
} = {}) {
  const amount = absoluteMinor(typeof amountMinor === 'bigint' ? amountMinor : parseMoneyMinor(amountMinor));
  const benchmarkRates = {
    revenue: '0.01',
    profit: '0.05',
    assets: '0.01',
    equity: '0.02',
    expenses: '0.01'
  };
  const riskMultipliers = { low: '1', medium: '0.85', high: '0.65' };
  const selectedRateText = customRate === null || customRate === ''
    ? (benchmarkRates[benchmark] ?? '0.01')
    : String(customRate);
  const selectedRate = decimalRateToRatio(selectedRateText);
  const riskRatio = decimalRateToRatio(riskMultipliers[risk] ?? '0.85');
  const performanceRatio = decimalRateToRatio(String(Math.min(0.95, Math.max(0.3, Number(performanceRate)))));
  const trivialRatio = decimalRateToRatio(String(Math.min(0.1, Math.max(0.01, Number(trivialRate)))));
  if (selectedRate.numeric < 0.0001) throw new RangeError('Rate must be at least 0.0001');

  const overall = multiplyMinorByRatio(amount, selectedRate, riskRatio);
  const performance = multiplyMinorByRatio(overall, performanceRatio);
  const trivial = multiplyMinorByRatio(overall, trivialRatio);
  return {
    benchmark,
    benchmarkAmount: amount,
    rate: selectedRate.numeric,
    risk,
    riskMultiplier: riskRatio.numeric,
    overall,
    performance,
    trivial,
    rationale: `تم تطبيق نسبة ${(selectedRate.numeric * 100).toFixed(2)}% مع معامل مخاطر ${riskRatio.numeric.toFixed(2)}. يلزم اعتماد المراجع المسؤول.`
  };
}

function severityFromScore(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function pushRisk(target, row, rule) {
  const score = Math.max(1, Math.min(100, rule.score));
  target.push({
    id: `R-${fnv1a(`${row.id}|${rule.rule}|${rule.rationale}`).toString(16).toUpperCase()}`,
    rule: rule.rule,
    title: rule.title,
    severity: severityFromScore(score),
    score,
    accountId: row.id,
    accountCode: row.code,
    accountName: row.name,
    category: row.category,
    amount: absoluteMinor(row.net),
    standards: [...new Set([...(row.standards ?? []), ...(rule.standards ?? [])])],
    assertions: [...new Set([...(row.assertions ?? []), ...(rule.assertions ?? [])])],
    rationale: rule.rationale,
    procedure: rule.procedure,
    evidence: rule.evidence,
    status: 'open',
    humanDecision: null
  });
}

export function detectRisks(inputRows = [], materialityMinor = 0n) {
  const { rows } = validateTrialBalance(inputRows);
  const threshold = absoluteMinor(typeof materialityMinor === 'bigint' ? materialityMinor : parseMoneyMinor(materialityMinor));
  const risks = [];
  const materiality = threshold > 0n ? threshold : 10000000n; // 100,000.00 default

  for (const row of rows) {
    const amount = absoluteMinor(row.net);
    const normalizedName = normalizeText(row.name);
    const amountRatio = Number(amount > 0n ? (amount * 100n) / materiality : 0n);
    const largeScore = Math.min(95, 35 + Math.round(amountRatio / 2));

    if (row.normalBalance === 'debit' && row.credit > row.debit && amount > 0n) {
      pushRisk(risks, row, {
        rule: 'ABNORMAL-CREDIT', title: 'رصيد دائن غير معتاد', score: Math.max(55, largeScore),
        rationale: `اتجاه الرصيد لا يتفق مع الطبيعة المتوقعة لفئة ${row.category}.`,
        procedure: 'افحص القيود المكوّنة، التسويات، التصنيف، والأرصدة المقابلة ثم اطلب مصادقة أو مستندًا مؤيدًا.',
        evidence: 'كشف حساب، قيود الأستاذ، تسويات، مصادقات خارجية.',
        standards: ['ISA 315', 'ISA 330'], assertions: ['التصنيف', 'التقييم']
      });
    }
    if (row.normalBalance === 'credit' && row.debit > row.credit && amount > 0n) {
      pushRisk(risks, row, {
        rule: 'ABNORMAL-DEBIT', title: 'رصيد مدين غير معتاد', score: Math.max(55, largeScore),
        rationale: `اتجاه الرصيد لا يتفق مع الطبيعة المتوقعة لفئة ${row.category}.`,
        procedure: 'حلّل الحركة والقيود العكسية والتسويات الختامية وافحص صحة العرض وإعادة التصنيف.',
        evidence: 'الأستاذ العام، مستندات القيد، التسويات، إقرارات الإدارة.',
        standards: ['ISA 315', 'ISA 330'], assertions: ['التصنيف', 'الاكتمال']
      });
    }

    if (amount >= materiality) {
      pushRisk(risks, row, {
        rule: 'MATERIAL-BALANCE', title: 'رصيد جوهري', score: Math.max(60, largeScore),
        rationale: 'الرصيد يساوي أو يتجاوز الأهمية النسبية الإجمالية المحددة للارتباط.',
        procedure: 'صمّم إجراءات جوهرية مخصصة تشمل التحليلات، اختبار التفاصيل، القطع، والتقييم.',
        evidence: 'تفصيل الرصيد، عينات المستندات، مصادقات، إعادة احتساب.',
        standards: ['ISA 320', 'ISA 330'], assertions: row.assertions
      });
    } else if (amount >= (materiality * 60n) / 100n) {
      pushRisk(risks, row, {
        rule: 'NEAR-MATERIAL', title: 'رصيد قريب من الأهمية النسبية', score: 48,
        rationale: 'الرصيد أقل من الأهمية النسبية لكنه كبير بما يكفي لتبرير تغطية مستقلة.',
        procedure: 'أدرجه ضمن خطة النطاق وطبّق تحليلًا واتجاهات وعينة موجهة للمخاطر.',
        evidence: 'تحليل حساب، مقارنة، عينة مستندية.',
        standards: ['ISA 320', 'ISA 530'], assertions: row.assertions
      });
    }

    if (amount >= 1000000n && amount % 10000000n === 0n) {
      pushRisk(risks, row, {
        rule: 'ROUND-AMOUNT', title: 'مبلغ كبير مستدير', score: 44,
        rationale: 'الرصيد الكبير المستدير قد ينتج عن قيد يدوي أو تقدير أو تسوية ختامية.',
        procedure: 'استخرج القيود المكوّنة وحدد المستخدم والتوقيت والمستند والتفويض.',
        evidence: 'سجل القيود، سجل المستخدمين، مستندات التفويض.',
        standards: ['ISA 240'], assertions: ['الحدوث', 'الدقة']
      });
    }

    if (['معلق', 'تسويه', 'وسيط', 'فروقات', 'suspense', 'clearing'].some((term) => normalizedName.includes(normalizeText(term)))) {
      pushRisk(risks, row, {
        rule: 'SUSPENSE', title: 'حساب وسيط أو معلّق', score: amount >= materiality ? 82 : 68,
        rationale: 'الحسابات المعلقة والوسيطة قد تخفي أخطاء تصنيف أو قيودًا غير مكتملة.',
        procedure: 'حلّل كامل الحركة بندًا بندًا، صفّر البنود القديمة، وحدد مالك كل فرق وخطة إقفاله.',
        evidence: 'كشف تفصيلي، مستندات التسوية، أعمار البنود، اعتماد الإقفال.',
        standards: ['ISA 240', 'ISA 450'], assertions: ['الاكتمال', 'التصنيف', 'الدقة']
      });
    }

    if (['طرف ذو علاقه', 'اطراف ذات علاقه', 'شركاء', 'related party'].some((term) => normalizedName.includes(normalizeText(term)))) {
      pushRisk(risks, row, {
        rule: 'RELATED-PARTY', title: 'رصيد طرف ذي علاقة', score: 74,
        rationale: 'المعاملات مع الأطراف ذات العلاقة تحمل مخاطر اكتمال وإفصاح وتسعير غير اعتيادية.',
        procedure: 'طابق سجل الأطراف، افحص الاعتمادات والشروط والتسعير والمصادقات والإفصاح.',
        evidence: 'سجل الأطراف، محاضر، عقود، مصادقات، إفصاحات.',
        standards: ['IAS 24', 'ISA 550'], assertions: ['الاكتمال', 'العرض', 'الحدوث']
      });
    }

    if (row.category === 'ذمم مدينة' && amount > 0n) {
      pushRisk(risks, row, {
        rule: 'ECL', title: 'خسائر ائتمانية متوقعة', score: amount >= materiality ? 78 : 52,
        rationale: 'الذمم المدينة تتطلب تقييم قابلية التحصيل ومنهج خسائر الائتمان المتوقعة.',
        procedure: 'اختبر أعمار الديون والتحصيلات اللاحقة والسيناريوهات المستقبلية ومعدلات التعثر والتغطية.',
        evidence: 'أعمار الديون، تحصيلات لاحقة، نموذج ECL، بيانات تاريخية ومستقبلية.',
        standards: ['IFRS 9', 'IFRS 7', 'ISA 540'], assertions: ['التقييم', 'الوجود']
      });
    }

    if (row.category === 'مخزون' && amount > 0n) {
      pushRisk(risks, row, {
        rule: 'INVENTORY-NRV', title: 'وجود وتقييم المخزون', score: amount >= materiality ? 76 : 49,
        rationale: 'المخزون معرّض لمخاطر الوجود والتقادم وصافي القيمة القابلة للتحقق والقطع.',
        procedure: 'احضر الجرد أو نفّذ إجراءات بديلة، اختبر التسعير والتقادم والقطع وNRV.',
        evidence: 'محاضر الجرد، بطاقات الصنف، فواتير، مبيعات لاحقة، تحليل تقادم.',
        standards: ['IAS 2', 'ISA 501'], assertions: ['الوجود', 'التقييم', 'القطع']
      });
    }

    if (row.category === 'عقود وإيرادات' && amount > 0n) {
      pushRisk(risks, row, {
        rule: 'REVENUE-RECOGNITION', title: 'الاعتراف بالإيراد والقطع', score: amount >= materiality ? 85 : 67,
        rationale: 'الإيراد يُفترض عادةً أنه مجال خطر احتيال ما لم يُدعّم استبعاد موثق.',
        procedure: 'اختبر العقود والتزامات الأداء والسعر والتخصيص والتوقيت والقطع والمرتجعات.',
        evidence: 'عقود، فواتير، شحن وتسليم، إشعارات دائن، تحصيلات لاحقة.',
        standards: ['IFRS 15', 'ISA 240'], assertions: ['الحدوث', 'القطع', 'الدقة']
      });
    }

    if (row.category === 'مخصصات ومنافع موظفين' && amount > 0n) {
      pushRisk(risks, row, {
        rule: 'ESTIMATE', title: 'تقدير محاسبي جوهري', score: amount >= materiality ? 79 : 58,
        rationale: 'المخصصات والمنافع تعتمد على افتراضات وحكم إداري وقد تتأثر بالتحيز.',
        procedure: 'اختبر المنهج والبيانات والافتراضات، استعن بخبير عند الحاجة، ونفّذ تحليل حساسية.',
        evidence: 'نموذج التقدير، بيانات الإدخال، تقرير خبير، تحليل حساسية، أحداث لاحقة.',
        standards: ['IAS 19', 'IAS 37', 'ISA 540'], assertions: ['التقييم', 'الاكتمال']
      });
    }
  }

  const unique = new Map();
  for (const risk of risks) unique.set(risk.id, risk);
  return [...unique.values()].sort((a, b) => b.score - a.score || Number(b.amount - a.amount));
}

export function selectAuditSample(inputRows = [], {
  method = 'risk',
  size = 25,
  seed = 380019,
  materialityMinor = 0n
} = {}) {
  const { rows } = validateTrialBalance(inputRows);
  const cappedSize = Math.max(1, Math.min(rows.length || 1, Number(size) || 25));
  if (rows.length === 0) return [];
  const materiality = absoluteMinor(typeof materialityMinor === 'bigint' ? materialityMinor : parseMoneyMinor(materialityMinor));
  const random = seededRandom(seed);

  if (method === 'systematic') {
    const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code, 'ar'));
    const interval = Math.max(1, Math.floor(sorted.length / cappedSize));
    const start = Math.floor(random() * interval);
    return sorted.filter((_, index) => index >= start && (index - start) % interval === 0).slice(0, cappedSize);
  }

  if (method === 'random') {
    const shuffled = [...rows];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, cappedSize);
  }

  if (method === 'mus') {
    const positive = rows.filter((row) => absoluteMinor(row.net) > 0n);
    const total = positive.reduce((sum, row) => sum + absoluteMinor(row.net), 0n);
    if (total === 0n) return selectAuditSample(rows, { method: 'random', size: cappedSize, seed });
    const interval = total / BigInt(cappedSize) || 1n;
    let cursor = BigInt(Math.floor(random() * Number(interval > 9007199254740991n ? 9007199254740991n : interval)));
    const sample = [];
    let cumulative = 0n;
    for (const row of positive.sort((a, b) => b.code.localeCompare(a.code, 'ar'))) {
      cumulative += absoluteMinor(row.net);
      while (cumulative >= cursor && sample.length < cappedSize) {
        if (!sample.some((item) => item.id === row.id)) sample.push(row);
        cursor += interval;
      }
      if (sample.length >= cappedSize) break;
    }
    return sample;
  }

  // Risk-based: cover material items first, then score weighted remainder deterministically.
  const risks = detectRisks(rows, materiality);
  const scoreMap = new Map();
  for (const risk of risks) scoreMap.set(risk.accountId, Math.max(scoreMap.get(risk.accountId) ?? 0, risk.score));
  return [...rows]
    .map((row) => ({ row, rank: (scoreMap.get(row.id) ?? 0) * 1_000_000 + Number(absoluteMinor(row.net) % 1_000_000n) + random() }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, cappedSize)
    .map((item) => item.row);
}

const DEMO_DEBIT_TEMPLATES = [
  ['111001', 'الصندوق الرئيسي'], ['112001', 'بنك الرياض - جاري'], ['113001', 'عملاء محليون'],
  ['114001', 'مخزون مواد خام'], ['115001', 'مصروفات مدفوعة مقدمًا'], ['121001', 'مبانٍ'],
  ['122001', 'آلات ومعدات'], ['123001', 'حق استخدام أصل'], ['131001', 'برامج وأنظمة'],
  ['141001', 'استثمارات بالقيمة العادلة'], ['510001', 'تكلفة المبيعات'], ['610001', 'رواتب وأجور'],
  ['620001', 'مصروف إيجار'], ['630001', 'مصروف تسويق'], ['640001', 'مصروفات إدارية']
];

const DEMO_CREDIT_TEMPLATES = [
  ['211001', 'موردون محليون'], ['212001', 'مصروفات مستحقة'], ['213001', 'ضريبة قيمة مضافة مستحقة'],
  ['221001', 'قرض بنكي طويل الأجل'], ['222001', 'التزام عقد إيجار'], ['231001', 'مخصص مكافأة نهاية الخدمة'],
  ['311001', 'رأس المال'], ['321001', 'احتياطي نظامي'], ['331001', 'أرباح مبقاة'],
  ['411001', 'إيرادات مبيعات'], ['412001', 'إيرادات خدمات'], ['413001', 'التزام عقد مع عميل']
];

export function generateDemoAccounts(count = 5000, seed = 380019) {
  const requested = Math.max(10, Math.min(10000, Math.floor(Number(count) || 5000)));
  const random = seededRandom(seed);
  const rows = [];
  const pairCount = Math.floor(requested / 2);
  for (let i = 0; i < pairCount; i += 1) {
    const debitTemplate = DEMO_DEBIT_TEMPLATES[Math.floor(random() * DEMO_DEBIT_TEMPLATES.length)];
    const creditTemplate = DEMO_CREDIT_TEMPLATES[Math.floor(random() * DEMO_CREDIT_TEMPLATES.length)];
    const base = 1_000 + Math.floor(random() * 2_500_000);
    const amount = Math.round(base / (i % 17 === 0 ? 1000 : 1)) * (i % 17 === 0 ? 1000 : 1);
    const suffix = String(i + 1).padStart(4, '0');
    let debitName = `${debitTemplate[1]} ${suffix}`;
    let creditName = `${creditTemplate[1]} ${suffix}`;
    if (i % 113 === 0) debitName = `حساب معلّق ${suffix}`;
    if (i % 197 === 0) creditName = `طرف ذو علاقة ${suffix}`;
    rows.push({
      code: `${debitTemplate[0]}${suffix}`,
      name: debitName,
      debit: amount,
      credit: 0,
      currency: 'SAR'
    });
    rows.push({
      code: `${creditTemplate[0]}${suffix}`,
      name: creditName,
      debit: 0,
      credit: amount,
      currency: 'SAR'
    });
  }
  if (rows.length < requested) {
    rows.push({ code: `990000${String(requested).padStart(4, '0')}`, name: 'حساب إحصائي بلا رصيد', debit: 0, credit: 0, currency: 'SAR' });
  }
  return rows.slice(0, requested);
}

export function parseCsv(text = '') {
  const source = String(text).replace(/^\uFEFF/, '');
  const lines = source.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];

  const sniff = lines[0];
  const candidates = [',', ';', '\t'];
  const delimiter = candidates
    .map((candidate) => ({ candidate, count: sniff.split(candidate).length }))
    .sort((a, b) => b.count - a.count)[0].candidate;

  const parseLine = (line) => {
    const cells = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        cells.push(value.trim());
        value = '';
      } else {
        value += char;
      }
    }
    cells.push(value.trim());
    return cells;
  };

  const headers = parseLine(lines[0]).map((header, index) => header || `column_${index + 1}`);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function rowsToCsv(inputRows = []) {
  const { rows } = validateTrialBalance(inputRows);
  const header = ['كود الحساب', 'اسم الحساب', 'مدين', 'دائن', 'التصنيف', 'المعايير', 'التأكيدات'];
  const lines = rows.map((row) => [
    row.code,
    row.name,
    (Number(row.debit) / 100).toFixed(2),
    (Number(row.credit) / 100).toFixed(2),
    row.category,
    row.standards.join(' | '),
    row.assertions.join(' | ')
  ].map(csvEscape).join(','));
  return `\uFEFF${header.map(csvEscape).join(',')}\n${lines.join('\n')}`;
}

export function buildEvidenceGraph({ rows = [], risks = [], workpapers = [], findings = [], pbc = [] } = {}) {
  const nodes = [];
  const edges = [];
  const seen = new Set();
  const addNode = (id, type, label, meta = {}) => {
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({ id, type, label, ...meta });
  };
  const addEdge = (from, to, relation) => {
    if (seen.has(from) && seen.has(to)) edges.push({ from, to, relation });
  };

  for (const row of validateTrialBalance(rows).rows) addNode(row.id, 'account', `${row.code} — ${row.name}`, { amount: row.net.toString() });
  for (const risk of risks) {
    addNode(risk.id, 'risk', risk.title, { severity: risk.severity, score: risk.score });
    addEdge(risk.accountId, risk.id, 'exposes');
  }
  for (const workpaper of workpapers) {
    addNode(workpaper.id, 'workpaper', workpaper.title, { status: workpaper.status });
    for (const riskId of workpaper.riskIds ?? []) addEdge(riskId, workpaper.id, 'addressed_by');
  }
  for (const request of pbc) {
    addNode(request.id, 'pbc', request.title, { status: request.status });
    for (const riskId of request.riskIds ?? []) addEdge(riskId, request.id, 'requests_evidence');
  }
  for (const finding of findings) {
    addNode(finding.id, 'finding', finding.title, { severity: finding.severity, status: finding.status });
    if (finding.riskId) addEdge(finding.riskId, finding.id, 'results_in');
    if (finding.workpaperId) addEdge(finding.workpaperId, finding.id, 'documents');
  }

  const riskIds = new Set(risks.map((risk) => risk.id));
  const addressedRiskIds = new Set(edges.filter((edge) => edge.relation === 'addressed_by').map((edge) => edge.from));
  const evidenceRiskIds = new Set(edges.filter((edge) => edge.relation === 'requests_evidence').map((edge) => edge.from));
  return {
    nodes,
    edges,
    metrics: {
      risks: riskIds.size,
      risksWithoutProcedure: [...riskIds].filter((id) => !addressedRiskIds.has(id)).length,
      risksWithoutEvidenceRequest: [...riskIds].filter((id) => !evidenceRiskIds.has(id)).length,
      findingsWithoutWorkpaper: findings.filter((finding) => !finding.workpaperId).length
    }
  };
}

export function buildRoundReadiness({ analysis, materiality, risks = [], workpapers = [], findings = [], pbc = [], reportApproved = false } = {}) {
  const checks = [
    Boolean(analysis),
    Boolean(analysis?.metrics?.accounts > 0),
    Boolean(materiality?.overall > 0n),
    risks.length > 0,
    workpapers.length > 0,
    workpapers.some((item) => item.status === 'completed'),
    workpapers.some((item) => (item.estimateRelated ?? false)),
    pbc.some((item) => /استمراري|لاحق/.test(normalizeText(item.title))) || findings.some((item) => /استمراري|لاحق/.test(normalizeText(item.title))),
    findings.every((item) => item.status !== 'open') && Boolean(analysis),
    Boolean(reportApproved)
  ];
  return ROUND_DEFINITIONS.map((round, index) => ({
    ...round,
    ready: checks[index],
    status: checks[index] ? 'ready' : 'pending'
  }));
}

export function councilReview({ risks = [], findings = [], materiality = null, analysis = null } = {}) {
  const openFindings = findings.filter((finding) => finding.status !== 'closed');
  const criticalRisks = risks.filter((risk) => ['critical', 'high'].includes(risk.severity));
  const evidenceGap = risks.filter((risk) => !risk.evidence).length;
  const balanced = Boolean(analysis?.balanced);
  const materialitySet = Boolean(materiality?.overall > 0n);

  const seats = [
    {
      id: 'technical', title: 'مقعد المعايير المحاسبية',
      conclusion: criticalRisks.some((risk) => risk.standards.some((standard) => standard.startsWith('IFRS') || standard.startsWith('IAS')))
        ? 'توجد أرصدة جوهرية تتطلب مذكرة اعتراف وقياس وعرض وإفصاح معيارية قبل الإكمال.'
        : 'لم تظهر فجوة معيارية مرتفعة من البيانات المتاحة، مع بقاء ضرورة فحص الإفصاحات.',
      confidence: criticalRisks.length ? 76 : 61
    },
    {
      id: 'audit', title: 'مقعد منهجية المراجعة',
      conclusion: materialitySet
        ? `الأهمية النسبية محددة؛ يلزم ربط ${criticalRisks.length} خطر مرتفع باستجابة واختبار ودليل.`
        : 'لا يجوز إكمال تصميم الاختبارات قبل اعتماد الأهمية النسبية وأهمية الأداء.',
      confidence: materialitySet ? 82 : 94
    },
    {
      id: 'analytics', title: 'مقعد التحليلات والبيانات',
      conclusion: balanced
        ? `الميزان متزن حسابيًا، لكن الاتزان لا يثبت صحة التصنيف أو الوجود أو التقييم. تم رصد ${risks.length} إشارة.`
        : 'الميزان غير متزن؛ يجب حل فرق المدين والدائن قبل الاعتماد على التحليلات اللاحقة.',
      confidence: 91
    },
    {
      id: 'skeptic', title: 'مقعد الشك المهني',
      conclusion: openFindings.length
        ? `هناك ${openFindings.length} نتيجة غير مغلقة؛ اطلب أدلة من مصادر مستقلة واختبر تحيز الإدارة.`
        : 'لا توجد نتائج مفتوحة، لكن يلزم اختبار اكتمال النتائج وعدم اعتبار غياب الاستثناء دليلًا كافيًا.',
      confidence: 73
    }
  ];

  const blockers = [];
  if (!balanced) blockers.push('فرق ميزان المراجعة غير محلول.');
  if (!materialitySet) blockers.push('الأهمية النسبية غير معتمدة.');
  if (openFindings.some((finding) => finding.severity === 'critical')) blockers.push('نتيجة حرجة ما زالت مفتوحة.');
  if (evidenceGap > 0) blockers.push(`${evidenceGap} مخاطر بلا وصف دليل متوقع.`);

  const agreement = Math.max(0, Math.min(100, 100 - blockers.length * 18 - Math.min(30, openFindings.length * 3)));
  return {
    id: `C-${Date.now()}`,
    createdAt: new Date().toISOString(),
    seats,
    agreement,
    blockers,
    advisoryConclusion: blockers.length
      ? 'الملف غير جاهز لقرار نهائي؛ عالج موانع الإكمال وسجّل قرار المراجع البشري.'
      : 'لا توجد موانع نظامية ظاهرة من البيانات المتاحة؛ القرار والرأي يظلان مسؤولية المراجع البشري.',
    humanApprovalRequired: true
  };
}
