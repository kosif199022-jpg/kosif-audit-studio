import {
  generateDemoAccounts,
  validateTrialBalance,
  calculateMateriality,
  detectRisks,
  formatMoneyMinor,
  parseMoneyMinor
} from './engine.js';
import {
  planAuditSample,
  projectSampleMisstatement,
  identifyKamCandidates,
  scopeGroupAuditComponents,
  evaluateControlRemediation
} from './research-engine.js';

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = (value) => formatMoneyMinor(typeof value === 'bigint' ? value : BigInt(value || 0), 'SAR', 'ar-SA');
const pct = (value) => `${Number(value || 0).toFixed(1)}%`;

const state = {
  analysis: null,
  materiality: null,
  risks: [],
  plan: null,
  projection: null
};

function metric(label, value) {
  return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function statusClass(status) {
  if (['clear', 'remediated'].includes(status)) return 'good';
  if (['escalate', 'design_gap', 'implementation_gap', 'operating_gap'].includes(status)) return 'danger';
  if (['investigate', 'watch', 'sustainability_monitoring'].includes(status)) return 'warn';
  return 'info';
}

function runPlan() {
  const risk = $('#risk').value;
  const controls = $('#controls').value;
  const aggregationRisk = $('#aggregation').value;
  const method = $('#method').value;
  const expectedMisstatementMinor = parseMoneyMinor($('#expected').value || '0');
  const maxResidualSample = Number($('#maxSample').value || 500);

  const demo = generateDemoAccounts(5000, 380019);
  state.analysis = validateTrialBalance(demo);
  state.materiality = calculateMateriality({
    benchmark: 'assets',
    amountMinor: state.analysis.totalDebit,
    risk
  });
  state.risks = detectRisks(state.analysis.rows, state.materiality.overall);
  state.plan = planAuditSample(state.analysis.rows, {
    risks: state.risks,
    method,
    seed: 380019,
    overallMaterialityMinor: state.materiality.overall,
    performanceMaterialityMinor: state.materiality.performance,
    expectedMisstatementMinor,
    risk,
    controls,
    aggregationRisk,
    maxResidualSample
  });
  state.projection = null;
  renderSample();
  renderProjection();
  renderKams();
}

function renderSample() {
  const p = state.plan;
  if (!p) return;
  $('#sampleMetrics').innerHTML = [
    metric('المجتمع', p.metrics.populationCount.toLocaleString('ar-SA')),
    metric('فحص 100%', p.metrics.certaintyCount.toLocaleString('ar-SA')),
    metric('العينة المتبقية', p.metrics.residualSampleCount.toLocaleString('ar-SA')),
    metric('التغطية بالقيمة', pct(p.metrics.populationCoveragePct))
  ].join('');
  const rows = [
    ['الأهمية الإجمالية', money(state.materiality.overall), 'تحدد سقف التقييم الإجمالي للارتباط.'],
    ['أهمية الأداء', money(state.materiality.performance), 'تستخدم في تحديد امتداد الاختبار وخطر التجميع.'],
    ['عتبة الفحص 100%', money(p.parameters.certaintyThresholdMinor), 'كل بند يساويها أو يتجاوزها يدخل طبقة certainty.'],
    ['هدف تغطية المجتمع المتبقي', pct(p.metrics.targetResidualCoveragePct), 'سياسة KOSIF تتغير مع المخاطر والضوابط والتحريف المتوقع.'],
    ['التغطية الفعلية للمجتمع المتبقي', pct(p.metrics.residualCoveragePct), p.metrics.targetReached ? 'تم بلوغ هدف التغطية.' : 'لم يُبلغ الهدف بسبب سقف العينة؛ يتطلب قرارًا.'],
    ['قيمة البنود المختارة', money(p.metrics.selectedValueMinor), `${p.metrics.selectedCount.toLocaleString('ar-SA')} بندًا إجمالًا.`],
    ['حالة السقف', p.metrics.capApplied ? 'تم تطبيق الحد الأقصى' : 'لم يقيّد الخطة', p.metrics.capApplied ? 'راجع السقف أو وسّع الاختبار.' : 'امتداد الاختبار حقق سياسة الخطة الحالية.']
  ];
  $('#sampleTable').innerHTML = rows.map((row) => `<tr><td>${esc(row[0])}</td><td>${esc(row[1])}</td><td>${esc(row[2])}</td></tr>`).join('');
}

function simulateErrors() {
  if (!state.plan?.selectedRows?.length) return;
  const selected = state.plan.selectedRows;
  const targets = [];
  const certainty = state.plan.certaintyRows.slice(0, 1);
  if (certainty[0]) targets.push(certainty[0]);
  for (const row of state.plan.residualSample.slice(0, 5 - targets.length)) targets.push(row);
  const rates = [125n, 90n, 65n, 45n, 30n];
  const targetIds = new Set(targets.map((row) => String(row.id)));
  const results = selected.map((row, index) => {
    const book = row.net < 0n ? -row.net : row.net;
    if (!targetIds.has(String(row.id))) return { rowId: row.id, bookAmountMinor: book, misstatementMinor: 0n };
    const targetIndex = targets.findIndex((target) => String(target.id) === String(row.id));
    const misstatement = (book * rates[Math.max(0, targetIndex)] + 9999n) / 10000n;
    return { rowId: row.id, bookAmountMinor: book, misstatementMinor: index % 2 ? -misstatement : misstatement };
  });
  state.projection = projectSampleMisstatement(state.plan, results, {
    trivialThresholdMinor: state.materiality.trivial
  });
  renderProjection();
}

function renderProjection() {
  const box = $('#projectionBox');
  const p = state.projection;
  if (!p) {
    box.innerHTML = '<div class="item"><strong>لم تُشغّل المحاكاة بعد</strong><small>اضغط «محاكاة 5 تحريفات» لرؤية تقييم تجريبي.</small></div>';
    return;
  }
  box.innerHTML = `
    <div class="item"><span class="status ${statusClass(p.status)}">${esc(p.status)}</span><strong style="margin-top:10px">${esc(p.conclusion)}</strong></div>
    <div class="item"><small>تحريفات certainty المعروفة</small><strong>${esc(money(p.knownCertaintyAbsoluteMinor))}</strong></div>
    <div class="item"><small>تحريف العينة المتبقية</small><strong>${esc(money(p.residualSampleAbsoluteMinor))}</strong></div>
    <div class="item"><small>الإسقاط المطلق على المجتمع المتبقي</small><strong>${esc(money(p.projectedResidualAbsoluteMinor))}</strong></div>
    <div class="item"><small>إجمالي التحريف المتوقع</small><strong>${esc(money(p.totalProjectedAbsoluteMinor))}</strong></div>
    <div class="note">محاكاة تعليمية؛ لا تمثل نتيجة مراجعة حقيقية. طريقة الإسقاط وملاءمتها يجب أن يعتمدها المراجع.</div>`;
}

function renderKams() {
  const candidates = identifyKamCandidates({
    risks: state.risks,
    findings: [],
    workpapers: [],
    materialityMinor: state.materiality?.overall ?? 0n,
    limit: 6
  });
  $('#kamList').innerHTML = candidates.length ? candidates.map((item) => `
    <div class="item">
      <span class="status info">${item.significanceScore}/100</span>
      <strong style="margin-top:8px">${esc(item.title)}</strong>
      <small>${esc(item.drivers.join(' · ') || 'أهمية مرتفعة وفق شاشة الترشيح')}</small>
      <div class="bar"><i style="width:${item.significanceScore}%"></i></div>
    </div>`).join('') : '<div class="item"><strong>لا توجد مرشحات حالية</strong><small>الترشيح لا يعني الإدراج النهائي في تقرير المراجع.</small></div>';
}

function renderGroupScope() {
  const million = 100000000n;
  const scope = scopeGroupAuditComponents([
    { id: 'C-SA', name: 'السعودية', revenueMinor: 520n * million, assetsMinor: 610n * million, riskScore: 74, significantFslis: ['Revenue', 'Receivables'] },
    { id: 'C-AE', name: 'الإمارات', revenueMinor: 230n * million, assetsMinor: 180n * million, riskScore: 84, significantFslis: ['Revenue'] },
    { id: 'C-EG', name: 'مصر', revenueMinor: 120n * million, assetsMinor: 90n * million, riskScore: 62, significantFslis: ['Inventory'] },
    { id: 'C-UK', name: 'المملكة المتحدة', revenueMinor: 70n * million, assetsMinor: 75n * million, riskScore: 51 },
    { id: 'C-IN', name: 'الهند SSC', revenueMinor: 35n * million, assetsMinor: 25n * million, riskScore: 67, significantFslis: ['Shared services controls'] },
    { id: 'C-OTH', name: 'مكونات أخرى', revenueMinor: 25n * million, assetsMinor: 20n * million, riskScore: 28 }
  ]);
  $('#groupMetrics').innerHTML = [
    metric('Full scope', scope.metrics.fullScopeCount),
    metric('Specific FSLI', scope.metrics.specificLineItemCount),
    metric('تغطية الإيراد', pct(scope.metrics.revenueCoveragePct)),
    metric('تغطية الأصول', pct(scope.metrics.assetCoveragePct))
  ].join('');
  const labels = { full_scope: 'Full scope', specific_line_items: 'Specific FSLIs', targeted_risk_assessment: 'Targeted risk' };
  $('#groupTable').innerHTML = scope.components.map((component) => `<tr><td>${esc(component.name)}</td><td>${component.riskScore}</td><td>${pct(component.revenueSharePct)}</td><td>${esc(labels[component.scope])}</td></tr>`).join('');
}

function renderControls() {
  const evaluation = evaluateControlRemediation([
    { id: 'CTRL-01', title: 'اعتماد القيود اليدوية', deficiencySeverity: 'material weakness', designEffective: true, implemented: true, operatingEffective: true, sustainabilityEvidencePeriods: 1 },
    { id: 'CTRL-02', title: 'مراجعة صلاحيات المستخدمين', deficiencySeverity: 'significant deficiency', designEffective: true, implemented: true, operatingEffective: true, sustainabilityEvidencePeriods: 3 },
    { id: 'CTRL-03', title: 'إقفال الحسابات المعلقة', deficiencySeverity: 'deficiency', designEffective: false, implemented: false, operatingEffective: false, sustainabilityEvidencePeriods: 0 },
    { id: 'CTRL-04', title: 'مراجعة نموذج ECL', deficiencySeverity: 'significant deficiency', designEffective: true, implemented: true, operatingEffective: false, sustainabilityEvidencePeriods: 0 }
  ]);
  $('#controlMetrics').innerHTML = [
    metric('إجمالي الضوابط', evaluation.summary.total),
    metric('معالجة', evaluation.summary.remediated),
    metric('تحت مراقبة الاستدامة', evaluation.summary.monitoring),
    metric('فجوات مفتوحة', evaluation.summary.openGaps)
  ].join('');
  const labels = { remediated: 'معالجة', sustainability_monitoring: 'مراقبة الاستدامة', design_gap: 'فجوة تصميم', implementation_gap: 'فجوة تنفيذ', operating_gap: 'فجوة فعالية تشغيلية' };
  $('#controlList').innerHTML = evaluation.controls.map((control) => `<div class="item"><span class="status ${statusClass(control.status)}">${esc(labels[control.status])}</span><strong style="margin-top:8px">${esc(control.title)}</strong><small>${esc(control.blockers.join(' · ') || 'لا توجد موانع آلية ظاهرة؛ يلزم اعتماد المراجع.')}</small></div>`).join('');
}

$('#runPlan').addEventListener('click', runPlan);
$('#simulateErrors').addEventListener('click', simulateErrors);
for (const id of ['risk', 'controls', 'aggregation', 'method']) $("#" + id).addEventListener('change', runPlan);
renderGroupScope();
renderControls();
runPlan();
