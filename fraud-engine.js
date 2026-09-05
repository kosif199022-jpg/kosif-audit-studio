// KOSIF Audit Studio - Fraud Engine
// Deterministic fraud indicators layer. Advisory only.

export function analyzeFraudSignals(entries = []) {
  const signals = [];

  for (const entry of entries) {
    const amount = Math.abs(Number(entry.amount ?? 0));
    const description = String(entry.description ?? '').trim();
    const date = String(entry.date ?? '');

    if (amount > 1000000) {
      signals.push({
        type: 'LARGE_AMOUNT',
        severity: 'high',
        entry,
        reason: 'مبلغ قيد مرتفع يحتاج فحصًا إضافيًا'
      });
    }

    if (!description) {
      signals.push({
        type: 'MISSING_DESCRIPTION',
        severity: 'medium',
        entry,
        reason: 'القيد بدون وصف'
      });
    }

    if (/12-31|12\/31/.test(date)) {
      signals.push({
        type: 'PERIOD_END_ENTRY',
        severity: 'medium',
        entry,
        reason: 'قيد قريب من نهاية الفترة'
      });
    }
  }

  return {
    score: Math.min(100, signals.length * 10),
    signals
  };
}
