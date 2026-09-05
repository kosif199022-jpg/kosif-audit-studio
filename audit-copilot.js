// KOSIF Audit Studio — Audit Copilot foundation
// Initial deterministic audit assistant layer.
// Designed to be connected later with the existing audit state and evidence flows.

export function scoreAuditRisk(account) {
  const amount = Math.abs(Number(account.amount ?? 0));
  const movement = Number(account.changeRate ?? 0);
  let score = 0;

  if (amount > 1000000) score += 30;
  if (Math.abs(movement) > 40) score += 25;
  if (account.endPeriodEntry) score += 25;
  if (!account.description) score += 10;
  if (account.manual === true) score += 10;

  return Math.min(score, 100);
}

export function suggestAuditProcedures(account) {
  const risk = scoreAuditRisk(account);
  const procedures = [];

  if (risk >= 50) {
    procedures.push('اختبار مستندات مؤيدة للعينة');
    procedures.push('تحليل أسباب التغيرات غير المعتادة');
  }

  if (account.endPeriodEntry) {
    procedures.push('اختبار قيود نهاية الفترة');
  }

  return {
    riskScore: risk,
    procedures,
    requiresHumanApproval: true
  };
}
