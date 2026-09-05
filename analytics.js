// KOSIF Audit Studio — analytics.js
// طبقة التحليلات الحتمية: القوائم المالية، النسب، بنفورد، تجميع التحريفات (ISA 450)،
// شجرة قرار الرأي (ISA 705 / ISA 570)، وحزمة السعودية (زكاة تقريبية، معقولية ضريبة القيمة المضافة).
// القاعدة الحاكمة: الأموال BigInt بوحدات صغرى. النسب الإحصائية فقط تُحسب بـ Number لأنها مؤشرات لا مبالغ.
// لا شيء هنا يصدر رأيًا؛ كل مخرج "مسودة" تنتظر قرار المراجع البشري.

import { absoluteMinor, parseMoneyMinor, validateTrialBalance } from './engine.js';

export const STATEMENT_LAYOUT = Object.freeze([
  { section: 'currentAssets', statement: 'sfp', side: 'debit', label: 'أصول متداولة', categories: ['نقدية وبنوك', 'ذمم مدينة', 'مخزون', 'أصول'] },
  { section: 'nonCurrentAssets', statement: 'sfp', side: 'debit', label: 'أصول غير متداولة', categories: ['أصول ثابتة', 'أصول غير ملموسة', 'استثمارات وأدوات مالية'] },
  { section: 'currentLiabilities', statement: 'sfp', side: 'credit', label: 'التزامات متداولة', categories: ['موردون والتزامات', 'التزامات'] },
  { section: 'nonCurrentLiabilities', statement: 'sfp', side: 'credit', label: 'التزامات غير متداولة', categories: ['قروض وتمويل', 'مخصصات ومنافع موظفين'] },
  { section: 'equity', statement: 'sfp', side: 'credit', label: 'حقوق الملكية', categories: ['حقوق ملكية'] },
  { section: 'revenue', statement: 'pl', side: 'credit', label: 'الإيرادات', categories: ['عقود وإيرادات', 'إيرادات'] },
  { section: 'expenses', statement: 'pl', side: 'debit', label: 'التكاليف والمصروفات', categories: ['مصروفات', 'تكلفة ومصروفات', 'مصروفات تشغيلية'] }
]);

function sectionForRow(row) {
  const category = row.category ?? '';
  const direct = STATEMENT_LAYOUT.find((item) => item.categories.includes(category));
  if (direct) return direct.section;
  // فئات مختلطة: نوجّهها حسب اتجاه الرصيد الفعلي
  if (category === 'إيجارات') return row.net >= 0n ? 'nonCurrentAssets' : 'nonCurrentLiabilities';
  if (category === 'ضرائب وزكاة') return row.net >= 0n ? 'currentAssets' : 'currentLiabilities';
  return null;
}

function emptySection(definition) {
  return { ...definition, lines: new Map(), total: 0n, count: 0 };
}

/**
 * يبني قائمة المركز المالي وقائمة الربح أو الخسارة من ميزان المراجعة المصنف.
 * المبالغ تُعرض بالإشارة الطبيعية للقسم (أصل موجب = مدين، التزام موجب = دائن).
 */
export function buildFinancialStatements(inputRows = []) {
  const { rows, balanced, imbalance } = validateTrialBalance(inputRows);
  const sections = Object.fromEntries(STATEMENT_LAYOUT.map((item) => [item.section, emptySection(item)]));
  const unclassified = [];

  for (const row of rows) {
    const key = sectionForRow(row);
    if (!key) { unclassified.push(row); continue; }
    const section = sections[key];
    const signed = section.side === 'debit' ? row.net : -row.net;
    const line = section.lines.get(row.category) ?? { category: row.category, amount: 0n, accounts: 0 };
    line.amount += signed;
    line.accounts += 1;
    section.lines.set(row.category, line);
    section.total += signed;
    section.count += 1;
  }

  const pick = (key) => ({
    ...sections[key],
    lines: [...sections[key].lines.values()].sort((a, b) => (absoluteMinor(b.amount) > absoluteMinor(a.amount) ? 1 : -1))
  });

  const currentAssets = pick('currentAssets');
  const nonCurrentAssets = pick('nonCurrentAssets');
  const currentLiabilities = pick('currentLiabilities');
  const nonCurrentLiabilities = pick('nonCurrentLiabilities');
  const equity = pick('equity');
  const revenue = pick('revenue');
  const expenses = pick('expenses');

  const totalAssets = currentAssets.total + nonCurrentAssets.total;
  const totalLiabilities = currentLiabilities.total + nonCurrentLiabilities.total;
  const profit = revenue.total - expenses.total;
  const unclassifiedNet = unclassified.reduce((sum, row) => sum + row.net, 0n);
  // المعادلة المحاسبية بعد إغلاق النتيجة: الأصول = الالتزامات + حقوق الملكية + الربح (+ غير المصنف)
  const equationDelta = totalAssets - (totalLiabilities + equity.total + profit) - unclassifiedNet;

  return {
    sfp: { currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities, equity, totalAssets, totalLiabilities },
    pl: { revenue, expenses, profit },
    unclassified: { count: unclassified.length, net: unclassifiedNet, rows: unclassified.slice(0, 25) },
    checks: {
      trialBalanceBalanced: balanced,
      trialBalanceImbalance: imbalance,
      equationHolds: absoluteMinor(equationDelta) <= 1n,
      equationDelta
    }
  };
}

function ratioOf(numerator, denominator, decimals = 2) {
  if (denominator === 0n) return null;
  const scale = 10n ** BigInt(decimals);
  const value = (numerator * scale) / denominator;
  return Number(value) / Number(scale);
}

function percentOf(numerator, denominator) {
  const value = ratioOf(numerator * 100n, denominator, 1);
  return value;
}

/**
 * نسب مالية إرشادية للإجراءات التحليلية (ISA 520). لكل نسبة معادلة ظاهرة وحكم اتجاهي بسيط.
 */
export function computeRatios(statements) {
  if (!statements) return [];
  const { sfp, pl } = statements;
  const grossRevenue = pl.revenue.total;
  const items = [
    {
      id: 'current', label: 'نسبة التداول', formula: 'الأصول المتداولة ÷ الالتزامات المتداولة',
      value: ratioOf(sfp.currentAssets.total, sfp.currentLiabilities.total), unit: 'x',
      judge: (v) => (v === null ? 'neutral' : v < 1 ? 'danger' : v < 1.2 ? 'warning' : 'success'),
      note: 'أقل من 1 مؤشر ضغط سيولة يتصل بـ ISA 570.'
    },
    {
      id: 'leverage', label: 'الالتزامات إلى حقوق الملكية', formula: 'إجمالي الالتزامات ÷ حقوق الملكية',
      value: ratioOf(sfp.totalLiabilities, sfp.equity.total), unit: 'x',
      judge: (v) => (v === null ? 'neutral' : v < 0 ? 'danger' : v > 2 ? 'warning' : 'success'),
      note: 'حقوق ملكية سالبة أو رافعة مرتفعة تستدعي فحص التعهدات والتمويل.'
    },
    {
      id: 'netMargin', label: 'هامش صافي الربح', formula: 'صافي الربح ÷ الإيرادات',
      value: percentOf(pl.profit, grossRevenue), unit: '%',
      judge: (v) => (v === null ? 'neutral' : v < 0 ? 'danger' : v < 3 ? 'warning' : 'success'),
      note: 'قارنه بالسنة السابقة والقطاع قبل أي استنتاج.'
    },
    {
      id: 'roa', label: 'العائد على الأصول', formula: 'صافي الربح ÷ إجمالي الأصول',
      value: percentOf(pl.profit, sfp.totalAssets), unit: '%',
      judge: (v) => (v === null ? 'neutral' : v < 0 ? 'danger' : 'success'),
      note: 'يُقرأ مع كفاءة الأصول الثابتة وسياسة الإهلاك.'
    },
    {
      id: 'receivableDays', label: 'أيام تحصيل الذمم', formula: 'ذمم مدينة ÷ الإيرادات × 365',
      value: (() => {
        const receivables = sfp.currentAssets.lines.find((line) => line.category === 'ذمم مدينة')?.amount ?? 0n;
        return grossRevenue > 0n ? ratioOf(receivables * 365n, grossRevenue, 0) : null;
      })(), unit: 'يوم',
      judge: (v) => (v === null ? 'neutral' : v > 120 ? 'danger' : v > 75 ? 'warning' : 'success'),
      note: 'ارتفاعها يرفع خطر ECL وفق IFRS 9 والقطع الزمني للإيراد.'
    },
    {
      id: 'inventoryShare', label: 'المخزون إلى الأصول المتداولة', formula: 'المخزون ÷ الأصول المتداولة',
      value: (() => {
        const inventory = sfp.currentAssets.lines.find((line) => line.category === 'مخزون')?.amount ?? 0n;
        return percentOf(inventory, sfp.currentAssets.total);
      })(), unit: '%',
      judge: (v) => (v === null ? 'neutral' : v > 60 ? 'warning' : 'success'),
      note: 'تركز مرتفع يستدعي اختبار صافي القيمة القابلة للتحقق (IAS 2) والجرد (ISA 501).'
    },
    {
      id: 'expenseRatio', label: 'المصروفات إلى الإيرادات', formula: 'إجمالي المصروفات ÷ الإيرادات',
      value: percentOf(pl.expenses.total, grossRevenue), unit: '%',
      judge: (v) => (v === null ? 'neutral' : v > 100 ? 'danger' : v > 95 ? 'warning' : 'success'),
      note: 'أعلى من 100% يعني خسارة تشغيلية.'
    }
  ];
  return items.map(({ judge, ...item }) => ({ ...item, status: judge(item.value) }));
}

const BENFORD_EXPECTED = Object.freeze([0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046]);

function firstDigit(minor) {
  const digits = absoluteMinor(minor).toString();
  // نعمل على الوحدة الرئيسية: نتجاهل الهللات إن كان المبلغ أصغر من ريال واحد
  const major = digits.length > 2 ? digits.slice(0, -2) : '';
  const first = major.replace(/^0+/, '')[0];
  return first ? Number(first) : null;
}

/**
 * تحليل الرقم الأول وفق قانون بنفورد لمجموعة مبالغ (أرصدة أو قيود).
 * MAD وفق حدود Nigrini: ≤0.006 مطابقة وثيقة، ≤0.012 مقبولة، ≤0.015 هامشية، أكبر = عدم مطابقة.
 */
export function benfordAnalysis(amounts = []) {
  const counts = Array(9).fill(0);
  let total = 0;
  for (const raw of amounts) {
    const minor = typeof raw === 'bigint' ? raw : parseMoneyMinor(raw);
    const digit = firstDigit(minor);
    if (!digit) continue;
    counts[digit - 1] += 1;
    total += 1;
  }
  const digits = counts.map((count, index) => {
    const observed = total ? count / total : 0;
    const expected = BENFORD_EXPECTED[index];
    return {
      digit: index + 1,
      count,
      observed: Number((observed * 100).toFixed(2)),
      expected: Number((expected * 100).toFixed(2)),
      deviation: Number(((observed - expected) * 100).toFixed(2))
    };
  });
  const mad = total ? digits.reduce((sum, item) => sum + Math.abs(item.observed - item.expected) / 100, 0) / 9 : 0;
  const conformity = total < 100 ? 'insufficient' : mad <= 0.006 ? 'close' : mad <= 0.012 ? 'acceptable' : mad <= 0.015 ? 'marginal' : 'nonconformity';
  const suspicious = digits.filter((item) => total >= 100 && item.deviation > 3).map((item) => item.digit);
  return { total, digits, mad: Number(mad.toFixed(4)), conformity, suspicious };
}

export function conformityLabel(value) {
  return {
    insufficient: 'عينة أصغر من 100 قيمة — لا يُعتمد الاختبار',
    close: 'مطابقة وثيقة',
    acceptable: 'مطابقة مقبولة',
    marginal: 'مطابقة هامشية',
    nonconformity: 'عدم مطابقة — يلزم فحص تركّز الأرقام'
  }[value] ?? value;
}

/**
 * تجميع التحريفات وفق ISA 450: المصححة، غير المصححة، الواضحة التفاهة، ومقارنتها بالأهمية النسبية.
 */
export function aggregateMisstatements(findings = [], materiality = null) {
  const overall = materiality?.overall ?? 0n;
  const performance = materiality?.performance ?? 0n;
  const trivial = materiality?.trivial ?? 0n;
  const rows = findings.map((finding) => {
    const amount = absoluteMinor(BigInt(finding.amountMinor ?? 0));
    const corrected = finding.status === 'adjusted';
    const evaluated = finding.status === 'passed';
    const bucket = corrected ? 'corrected' : trivial > 0n && amount < trivial ? 'trivial' : evaluated ? 'uncorrected' : 'pending';
    return { id: finding.id, title: finding.title, severity: finding.severity, status: finding.status, amount, bucket };
  });
  const sum = (bucket) => rows.filter((row) => row.bucket === bucket).reduce((total, row) => total + row.amount, 0n);
  const corrected = sum('corrected');
  const uncorrected = sum('uncorrected');
  const pending = sum('pending');
  const trivialTotal = sum('trivial');
  const exposure = uncorrected + pending;
  const overallRatio = overall > 0n ? Number((exposure * 1000n) / overall) / 10 : null;
  const verdict = overall === 0n ? 'no-materiality'
    : exposure >= overall ? 'material'
      : exposure >= performance ? 'approaching'
        : 'below';
  return { rows, corrected, uncorrected, pending, trivial: trivialTotal, exposure, overallRatio, verdict, overall, performance, trivialThreshold: trivial };
}

export function misstatementVerdictLabel(value) {
  return {
    'no-materiality': 'الأهمية النسبية غير محددة',
    material: 'التحريفات غير المصححة تتجاوز الأهمية النسبية',
    approaching: 'التحريفات تقترب من الأهمية النسبية — أعد تقييم الأداء',
    below: 'التحريفات غير المصححة دون الأهمية النسبية'
  }[value] ?? value;
}

/**
 * شجرة قرار حتمية لمسودة الرأي (ISA 700 / 705 / 570). المخرج توصية تنتظر اعتماد المراجع.
 */
export function opinionDecisionTree({
  balanced = false,
  misstatements = null,
  scopeLimitation = 'none',        // none | material | pervasive
  goingConcern = 'none',            // none | adequate-disclosure | inadequate-disclosure | unable-to-conclude
  pervasiveMisstatement = false
} = {}) {
  const basis = [];
  let code = 'unmodified';

  if (!balanced) {
    basis.push('ميزان المراجعة غير متزن؛ لا يمكن بناء رأي قبل حل الفرق.');
    return { code: 'blocked', label: 'لا يمكن الاستنتاج', standard: 'ISA 700.10', basis, pervasive: false, requiresHuman: true };
  }
  if (!misstatements || !['below', 'approaching', 'material'].includes(misstatements.verdict)) {
    return { code: 'blocked', label: 'التقييم غير مكتمل', standard: 'ISA 450 / ISA 320', basis: ['حدد الأهمية وأكمل تقييم التحريفات قبل صياغة مسودة الرأي.'], pervasive: false, requiresHuman: true };
  }
  if (goingConcern === 'unable-to-conclude' || scopeLimitation === 'pervasive') {
    code = 'disclaimer';
    basis.push(scopeLimitation === 'pervasive'
      ? 'قيد على النطاق منتشر الأثر: تعذر الحصول على أدلة كافية ومناسبة (ISA 705.9).'
      : 'تعذر الاستنتاج بشأن الاستمرارية بسبب حالات عدم تأكد متعددة (ISA 570.24).');
  } else if ((misstatements?.verdict === 'material' && pervasiveMisstatement) || goingConcern === 'inadequate-disclosure') {
    code = 'adverse';
    basis.push(goingConcern === 'inadequate-disclosure'
      ? 'إفصاح غير كافٍ عن عدم تأكد جوهري بشأن الاستمرارية (ISA 570.23).'
      : 'تحريف جوهري ومنتشر الأثر في القوائم المالية (ISA 705.8).');
  } else if (misstatements?.verdict === 'material' || scopeLimitation === 'material') {
    code = 'qualified';
    if (misstatements?.verdict === 'material') basis.push('تحريفات غير مصححة جوهرية لكنها غير منتشرة (ISA 705.7أ).');
    if (scopeLimitation === 'material') basis.push('قيد على النطاق جوهري لكنه غير منتشر (ISA 705.7ب).');
  } else {
    basis.push('لم تُرصد تحريفات جوهرية غير مصححة ولا قيود نطاق جوهرية (ISA 700).');
    if (misstatements?.verdict === 'approaching') basis.push('التحريفات تقترب من الأهمية النسبية: وثّق التقييم النوعي قبل الإكمال (ISA 450.11).');
  }
  const emphasis = goingConcern === 'adequate-disclosure'
    ? 'يلزم قسم منفصل «عدم تأكد جوهري يتعلق بالاستمرارية» (ISA 570.22).'
    : null;

  const labels = { unmodified: 'رأي غير معدل', qualified: 'رأي متحفظ', adverse: 'رأي معارض', disclaimer: 'الامتناع عن إبداء الرأي' };
  return {
    code,
    label: labels[code],
    standard: code === 'unmodified' ? 'ISA 700' : 'ISA 705',
    basis,
    emphasis,
    pervasive: code === 'adverse' || code === 'disclaimer',
    requiresHuman: true
  };
}

/**
 * مؤشرات الاستمرارية (ISA 570.A3) المستمدة من القوائم المبنية آليًا. قائمة مؤشرات لا استنتاج.
 */
export function goingConcernIndicators(statements, ratios = []) {
  if (!statements) return [];
  const { sfp, pl } = statements;
  const byId = Object.fromEntries(ratios.map((item) => [item.id, item.value]));
  const indicators = [
    { id: 'negative-equity', label: 'صافي التزامات أو حقوق ملكية سالبة', hit: sfp.equity.total + pl.profit < 0n, ref: 'ISA 570.A3 — مالية' },
    { id: 'working-capital', label: 'رأس مال عامل سالب', hit: sfp.currentAssets.total < sfp.currentLiabilities.total, ref: 'ISA 570.A3 — مالية' },
    { id: 'net-loss', label: 'خسارة صافية للفترة', hit: pl.profit < 0n, ref: 'ISA 570.A3 — مالية' },
    { id: 'heavy-leverage', label: 'اعتماد مرتفع على التمويل مقابل حقوق الملكية', hit: byId.leverage !== null && byId.leverage !== undefined && byId.leverage > 3, ref: 'ISA 570.A3 — مالية' },
    { id: 'collection', label: 'تباطؤ تحصيل الذمم فوق 120 يومًا', hit: (byId.receivableDays ?? 0) > 120, ref: 'ISA 570.A3 — تشغيلية' }
  ];
  return indicators;
}

/**
 * حزمة السعودية: تقدير الوعاء الزكوي التقريبي ومعقولية ضريبة القيمة المضافة.
 * التقدير إرشادي للاختبار التحليلي فقط؛ الوعاء الفعلي يخضع للائحة الزكاة وقرارات ZATCA.
 */
export function saudiCompliancePack(statements, rows = [], { vatRateBp = 1500n, zakatRateBp = 250n } = {}) {
  if (!statements) return null;
  const { sfp, pl } = statements;
  // تبسيط: الوعاء ≈ حقوق الملكية + الالتزامات غير المتداولة − الأصول غير المتداولة، وربح الفترة المعدل
  const base = sfp.equity.total + sfp.nonCurrentLiabilities.total - sfp.nonCurrentAssets.total;
  const adjustedProfit = pl.profit > 0n ? pl.profit : 0n;
  const zakatBase = base > adjustedProfit ? base : adjustedProfit;
  const zakatEstimate = zakatBase > 0n ? (zakatBase * zakatRateBp) / 10000n : 0n;

  const vatRows = rows.filter((row) => /vat|ضريبة القيمه|ضريبه القيمه|القيمة المضافة|القيمه المضافه/i.test(`${row.name} ${row.code}`));
  const recordedVat = vatRows.reduce((sum, row) => sum - row.net, 0n); // دائن موجب
  const expectedOutputVat = (pl.revenue.total * vatRateBp) / 10000n;
  const variance = expectedOutputVat - recordedVat;
  const variancePct = expectedOutputVat > 0n ? Number((absoluteMinor(variance) * 1000n) / expectedOutputVat) / 10 : null;

  return {
    zakat: { base: zakatBase, rateBp: zakatRateBp, estimate: zakatEstimate, note: 'وعاء تقريبي للاختبار التحليلي وفق نموذج مبسط؛ لا يُستخدم للإقرار.' },
    vat: {
      accounts: vatRows.length,
      recorded: recordedVat,
      expectedOutput: expectedOutputVat,
      variance,
      variancePct,
      status: vatRows.length === 0 ? 'no-account' : variancePct === null ? 'neutral' : variancePct > 25 ? 'danger' : variancePct > 10 ? 'warning' : 'success',
      note: 'يفترض إخضاع كامل الإيراد للنسبة الأساسية؛ الفروق قد تعود لتوريدات معفاة أو صفرية أو رصيد صافٍ بعد المدخلات.'
    }
  };
}

export function buildAnalyticsSnapshot({ rows = [], findings = [], materiality = null, journalEntries = [] } = {}) {
  if (!rows.length) return null;
  const statements = buildFinancialStatements(rows);
  const ratios = computeRatios(statements);
  const benfordBalances = benfordAnalysis(statements ? validateTrialBalance(rows).rows.map((row) => row.net) : []);
  const benfordJournal = journalEntries.length ? benfordAnalysis(journalEntries.map((item) => item.amountMinor ?? item.amount ?? 0)) : null;
  const misstatements = aggregateMisstatements(findings, materiality);
  const goingConcern = goingConcernIndicators(statements, ratios);
  const saudi = saudiCompliancePack(statements, validateTrialBalance(rows).rows);
  return { statements, ratios, benfordBalances, benfordJournal, misstatements, goingConcern, saudi };
}
