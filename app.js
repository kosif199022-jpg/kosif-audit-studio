import {
  STANDARDS,
  FRAMEWORK_SUMMARIES,
  KNOWLEDGE_TRACKS,
  PROCEDURE_TEMPLATES,
  DEFAULT_PBC
} from './data.js';
import {
  ROUND_DEFINITIONS,
  normalizeText,
  parseMoneyMinor,
  formatMoneyMinor,
  validateTrialBalance,
  calculateMateriality,
  detectRisks,
  selectAuditSample,
  generateDemoAccounts,
  parseCsv,
  rowsToCsv,
  buildEvidenceGraph,
  buildRoundReadiness,
  councilReview,
  fnv1a
} from './engine.js';

const STORAGE_KEY = 'kosif-audit-studio:v1';
const MAX_ROWS = 10_000;
const ACCOUNT_PAGE_SIZE = 50;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const e = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const createDefaultState = () => ({
  version: 1,
  activeView: 'dashboard',
  engagement: {
    entity: 'شركة الأفق التجريبية',
    period: 'للسنة المنتهية في 31 ديسمبر 2026',
    currency: 'SAR',
    reviewer: 'محمود القصيف'
  },
  sourceName: null,
  rawRows: [],
  materiality: null,
  riskDecisions: {},
  workpapers: [],
  findings: [],
  pbc: [],
  councilRuns: [],
  approval: null,
  preferences: { theme: 'light' }
});

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || parsed.version !== 1) return createDefaultState();
    return {
      ...createDefaultState(),
      ...parsed,
      engagement: { ...createDefaultState().engagement, ...(parsed.engagement ?? {}) },
      preferences: { ...createDefaultState().preferences, ...(parsed.preferences ?? {}) },
      riskDecisions: parsed.riskDecisions ?? {},
      workpapers: Array.isArray(parsed.workpapers) ? parsed.workpapers : [],
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      pbc: Array.isArray(parsed.pbc) ? parsed.pbc : [],
      councilRuns: Array.isArray(parsed.councilRuns) ? parsed.councilRuns : [],
      rawRows: Array.isArray(parsed.rawRows) ? parsed.rawRows.slice(0, MAX_ROWS) : []
    };
  } catch (error) {
    console.warn('Could not load saved state', error);
    return createDefaultState();
  }
}

let state = loadState();
let storageWarningShown = false;
let storageAvailable = true;
const runtime = {
  analysis: null,
  materiality: null,
  risks: [],
  graph: null,
  sample: [],
  selectedRiskId: null,
  accountPage: 1,
  selectedFindingRiskId: null
};

function saveState() {
  if (!storageAvailable) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Could not save state', error);
    storageAvailable = false;
    if (!storageWarningShown) {
      storageWarningShown = true;
      showToast('تعذر الحفظ المحلي في هذا المتصفح. صدّر حزمة JSON للاحتفاظ بالعمل.', 'error');
    }
  }
}

function hydrateMateriality(saved) {
  if (!saved) return null;
  try {
    return {
      ...saved,
      benchmarkAmount: BigInt(saved.benchmarkAmount ?? 0),
      overall: BigInt(saved.overall ?? 0),
      performance: BigInt(saved.performance ?? 0),
      trivial: BigInt(saved.trivial ?? 0)
    };
  } catch {
    return null;
  }
}

function persistMateriality(result) {
  return {
    benchmark: result.benchmark,
    benchmarkAmount: result.benchmarkAmount.toString(),
    rate: result.rate,
    risk: result.risk,
    riskMultiplier: result.riskMultiplier,
    overall: result.overall.toString(),
    performance: result.performance.toString(),
    trivial: result.trivial.toString(),
    rationale: result.rationale,
    calculatedAt: new Date().toISOString()
  };
}

function analyzeRuntime() {
  runtime.analysis = state.rawRows.length ? validateTrialBalance(state.rawRows) : null;
  runtime.materiality = hydrateMateriality(state.materiality);
  const baseRisks = runtime.analysis
    ? detectRisks(runtime.analysis.rows, runtime.materiality?.overall ?? 0n)
    : [];
  runtime.risks = baseRisks.map((risk) => ({
    ...risk,
    status: state.riskDecisions[risk.id]?.status ?? 'open',
    humanDecision: state.riskDecisions[risk.id]?.note ?? null
  }));
  if (!runtime.risks.some((risk) => risk.id === runtime.selectedRiskId)) {
    runtime.selectedRiskId = runtime.risks[0]?.id ?? null;
  }
  runtime.graph = buildEvidenceGraph({
    rows: runtime.analysis?.rows ?? [],
    risks: runtime.risks,
    workpapers: state.workpapers,
    findings: state.findings,
    pbc: state.pbc
  });
}

function money(value) {
  return formatMoneyMinor(value ?? 0n, state.engagement.currency || 'SAR');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function severityLabel(value) {
  return { critical: 'حرجة', high: 'مرتفعة', medium: 'متوسطة', low: 'منخفضة' }[value] ?? value;
}

function statusLabel(value) {
  return {
    open: 'مفتوحة', addressed: 'تمت الاستجابة', accepted: 'مقبولة مهنيًا',
    planning: 'تخطيط', 'in-progress': 'قيد التنفيذ', completed: 'مكتملة',
    requested: 'مطلوب', received: 'مستلم', reviewed: 'تمت مراجعته', rejected: 'غير كافٍ',
    'management-response': 'رد الإدارة', adjusted: 'تم التصحيح', passed: 'غير مصححة ومقيّمة', closed: 'مغلقة'
  }[value] ?? value;
}

function showToast(message, type = 'success') {
  const region = $('#toastRegion');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function downloadBlob(content, filename, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function openView(view, options = {}) {
  const target = $(`[data-view-panel="${view}"]`);
  if (!target) return;
  $$('.view').forEach((panel) => panel.classList.toggle('active', panel === target));
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  state.activeView = view;
  saveState();
  document.title = `${$('.nav-item.active span')?.textContent ?? 'KOSIF'} — KOSIF Audit Studio`;
  if (!options.keepScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebar();
  if (view === 'reports') renderReports();
}

function closeSidebar() {
  $('#appShell')?.classList.remove('sidebar-open');
  $('#sidebarBackdrop')?.classList.remove('visible');
}

function toggleSidebar() {
  $('#appShell')?.classList.toggle('sidebar-open');
  $('#sidebarBackdrop')?.classList.toggle('visible');
}

function sanitizeRawRows(rows) {
  return rows.slice(0, MAX_ROWS).map((row) => {
    const clean = {};
    for (const [key, value] of Object.entries(row ?? {})) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) clean[String(key)] = value;
    }
    return clean;
  });
}

function setRows(rows, sourceName = 'بيانات مستوردة') {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('لم يتم العثور على صفوف بيانات قابلة للقراءة.');
  state.rawRows = sanitizeRawRows(rows);
  state.sourceName = sourceName;
  state.riskDecisions = {};
  state.workpapers = [];
  state.findings = [];
  state.pbc = [];
  state.councilRuns = [];
  state.approval = null;
  runtime.sample = [];
  runtime.accountPage = 1;
  analyzeRuntime();
  saveState();
  renderAll();
  showToast(`تم تحميل ${runtime.analysis.metrics.accounts.toLocaleString('ar-SA')} حساب وفحص التوازن.`);
}

function autoSuggestBenchmark() {
  if (!runtime.analysis) return 0n;
  const revenue = runtime.analysis.rows
    .filter((row) => ['عقود وإيرادات', 'إيرادات'].includes(row.category))
    .reduce((sum, row) => sum + row.credit, 0n);
  const assets = runtime.analysis.rows
    .filter((row) => row.normalBalance === 'debit' && !row.category.includes('مصروف') && !row.category.includes('تكلفة'))
    .reduce((sum, row) => sum + row.debit, 0n);
  return revenue > 0n ? revenue : assets;
}

function loadDemo() {
  const rows = generateDemoAccounts(5000, 380019);
  setRows(rows, 'بيانات KOSIF التجريبية — 5000 حساب');
  const suggested = autoSuggestBenchmark();
  if (suggested > 0n) {
    const result = calculateMateriality({ benchmark: 'revenue', amountMinor: suggested, risk: 'medium' });
    state.materiality = persistMateriality(result);
    analyzeRuntime();
    saveState();
    renderAll();
    showToast('أضيفت أهمية نسبية مقترحة تلقائيًا وتحتاج اعتماد المراجع.');
  }
}

async function ensureXlsx() {
  if (window.XLSX) return window.XLSX;
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-kosif-xlsx]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.XLSX), { once: true });
      existing.addEventListener('error', () => reject(new Error('تعذر تحميل قارئ Excel. احفظ الملف بصيغة CSV.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.async = true;
    script.dataset.kosifXlsx = 'true';
    const timer = window.setTimeout(() => {
      script.remove();
      reject(new Error('انتهت مهلة تحميل قارئ Excel. احفظ الملف بصيغة CSV.'));
    }, 12000);
    script.addEventListener('load', () => {
      window.clearTimeout(timer);
      window.XLSX ? resolve(window.XLSX) : reject(new Error('لم يبدأ قارئ Excel بصورة صحيحة.'));
    }, { once: true });
    script.addEventListener('error', () => {
      window.clearTimeout(timer);
      reject(new Error('تعذر تحميل قارئ Excel. احفظ الملف بصيغة CSV.'));
    }, { once: true });
    document.head.append(script);
  });
}

async function readFile(file) {
  if (!file) return;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (file.size > 30 * 1024 * 1024) {
    showToast('الملف أكبر من 30 ميجابايت. قسّمه أو استخدم CSV أخف.', 'error');
    return;
  }
  try {
    let rows = [];
    if (extension === 'csv' || file.type.includes('csv')) {
      rows = parseCsv(await file.text());
    } else if (['xlsx', 'xls'].includes(extension)) {
      const XLSX = await ensureXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    } else {
      throw new Error('الصيغة غير مدعومة. استخدم CSV أو XLSX.');
    }
    setRows(rows, file.name);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'تعذر قراءة الملف.', 'error');
  }
}

function calculateReadiness() {
  const analysisReady = Boolean(runtime.analysis?.balanced);
  const materialityReady = Boolean(runtime.materiality?.overall > 0n);
  const openHigh = runtime.risks.filter((risk) => ['critical', 'high'].includes(risk.severity) && risk.status === 'open').length;
  const riskReady = runtime.risks.length > 0 && openHigh === 0;
  const graph = runtime.graph?.metrics ?? {};
  const procedureReady = runtime.risks.length > 0 && graph.risksWithoutProcedure === 0;
  const evidenceReady = runtime.risks.length > 0 && graph.risksWithoutEvidenceRequest === 0;
  const workpaperReady = state.workpapers.length > 0 && state.workpapers.some((wp) => wp.status === 'completed');
  const findingReady = state.findings.every((finding) => !['open', 'management-response'].includes(finding.status));
  const pbcReady = state.pbc.length > 0 && state.pbc.filter((item) => item.status === 'reviewed').length / state.pbc.length >= 0.7;
  const approvalReady = Boolean(state.approval);
  const checks = [analysisReady, materialityReady, riskReady, procedureReady, evidenceReady, workpaperReady, findingReady, pbcReady, approvalReady];
  const weights = [15, 12, 13, 13, 13, 10, 8, 8, 8];
  return checks.reduce((sum, check, index) => sum + (check ? weights[index] : 0), 0);
}

function renderDashboard() {
  const accounts = runtime.analysis?.metrics.accounts ?? 0;
  const openRisks = runtime.risks.filter((risk) => risk.status === 'open');
  const highRisks = openRisks.filter((risk) => ['critical', 'high'].includes(risk.severity));
  const completedWp = state.workpapers.filter((item) => item.status === 'completed').length;
  const graph = runtime.graph?.metrics ?? { risksWithoutEvidenceRequest: 0, risksWithoutProcedure: 0 };
  const readiness = calculateReadiness();
  const procedureCoverage = runtime.risks.length ? Math.round(((runtime.risks.length - graph.risksWithoutProcedure) / runtime.risks.length) * 100) : 0;

  $('#metricAccounts').textContent = accounts.toLocaleString('ar-SA');
  $('#metricRisks').textContent = openRisks.length.toLocaleString('ar-SA');
  $('#metricHighRisks').textContent = `${highRisks.length.toLocaleString('ar-SA')} مرتفعة أو حرجة`;
  $('#metricWorkpapers').textContent = state.workpapers.length.toLocaleString('ar-SA');
  $('#metricCompletedWp').textContent = `${completedWp.toLocaleString('ar-SA')} مكتملة`;
  $('#metricEvidenceGaps').textContent = (graph.risksWithoutEvidenceRequest ?? 0).toLocaleString('ar-SA');
  $('#readinessValue').textContent = `${readiness}%`;
  $('#readinessRing').style.setProperty('--progress', `${readiness * 3.6}deg`);
  $('#heroBalanceState').textContent = runtime.analysis ? (runtime.analysis.balanced ? 'متزن حسابيًا' : 'يوجد فرق') : 'بانتظار البيانات';
  $('#heroCoverage').textContent = `${procedureCoverage}%`;
  $('#riskBadge').textContent = openRisks.length > 99 ? '99+' : String(openRisks.length);

  const rounds = buildRoundReadiness({
    analysis: runtime.analysis,
    materiality: runtime.materiality,
    risks: runtime.risks,
    workpapers: state.workpapers,
    findings: state.findings,
    pbc: state.pbc,
    reportApproved: Boolean(state.approval)
  });
  $('#dashboardRounds').innerHTML = rounds.map((round) => `
    <div class="round-dot ${round.ready ? 'ready' : ''}">
      <button type="button" data-go="rounds" aria-label="${e(round.title)}">${round.id}</button>
      <span>${e(round.code)}</span>
    </div>`).join('');

  const topRisks = runtime.risks.slice(0, 4);
  $('#dashboardRiskList').innerHTML = topRisks.length ? topRisks.map((risk) => `
    <button class="compact-item text-reset" type="button" data-open-risk="${e(risk.id)}">
      <span class="severity-chip ${e(risk.severity)}">${e(severityLabel(risk.severity))}</span>
      <span><strong>${e(risk.title)}</strong><span>${e(risk.accountName)}</span></span>
      <strong>${risk.score}</strong>
    </button>`).join('') : '<div class="empty-state compact">حمّل الميزان لتظهر الإشارات.</div>';
}

function renderData() {
  const analysis = runtime.analysis;
  $('#analyzeButton').disabled = !analysis;
  $('#exportTbButton').disabled = !analysis;
  $('#totalDebit').textContent = analysis ? money(analysis.totalDebit) : '—';
  $('#totalCredit').textContent = analysis ? money(analysis.totalCredit) : '—';
  $('#imbalanceValue').textContent = analysis ? money(analysis.imbalance) : '—';
  $('#rowIssuesCount').textContent = analysis?.rowIssues.length.toLocaleString('ar-SA') ?? '0';
  const chip = $('#balanceChip');
  chip.className = 'status-chip neutral';
  chip.textContent = 'بانتظار ملف';
  if (analysis) {
    chip.className = `status-chip ${analysis.balanced ? 'success' : 'danger'}`;
    chip.textContent = analysis.balanced ? 'متزن حسابيًا' : 'غير متزن';
  }
  renderAccountsTable();
}

function renderAccountsTable() {
  const body = $('#accountsTableBody');
  const query = normalizeText($('#accountSearch')?.value ?? '');
  const rows = runtime.analysis?.rows.filter((row) => {
    if (!query) return true;
    return normalizeText(`${row.code} ${row.name} ${row.category} ${row.standards.join(' ')}`).includes(query);
  }) ?? [];
  const pageCount = Math.max(1, Math.ceil(rows.length / ACCOUNT_PAGE_SIZE));
  runtime.accountPage = Math.min(runtime.accountPage, pageCount);
  const start = (runtime.accountPage - 1) * ACCOUNT_PAGE_SIZE;
  const pageRows = rows.slice(start, start + ACCOUNT_PAGE_SIZE);

  body.innerHTML = pageRows.length ? pageRows.map((row) => `
    <tr>
      <td><strong dir="ltr">${e(row.code)}</strong></td>
      <td>${e(row.name)}<br><small class="muted">${e(row.assertions.join('، '))}</small></td>
      <td>${e(row.category)}</td>
      <td class="number">${row.debit ? e(money(row.debit)) : '—'}</td>
      <td class="number">${row.credit ? e(money(row.credit)) : '—'}</td>
      <td><div class="table-tags">${row.standards.map((item) => `<span class="table-tag">${e(item)}</span>`).join('')}</div></td>
    </tr>`).join('') : '<tr><td colspan="6"><div class="empty-state">لا توجد حسابات مطابقة.</div></td></tr>';
  $('#accountTableSummary').textContent = `${rows.length.toLocaleString('ar-SA')} حساب — ${state.sourceName ?? 'لا يوجد مصدر'}`;
  $('#accountPage').textContent = `${runtime.accountPage} / ${pageCount}`;
  $('#prevAccounts').disabled = runtime.accountPage <= 1;
  $('#nextAccounts').disabled = runtime.accountPage >= pageCount;
}

function renderMateriality() {
  const result = runtime.materiality;
  $('#overallMateriality').textContent = result ? money(result.overall) : '—';
  $('#performanceMateriality').textContent = result ? money(result.performance) : '—';
  $('#trivialMateriality').textContent = result ? money(result.trivial) : '—';
  $('#materialityRationale').textContent = result?.rationale ?? 'لم يُجر الحساب بعد.';
  const status = $('#materialityStatus');
  status.className = `status-chip ${result ? 'warning' : 'neutral'}`;
  status.textContent = result ? 'محسوبة — تحتاج اعتمادًا' : 'غير محددة';
  if (result) {
    $('#benchmark').value = result.benchmark;
    $('#benchmarkAmount').value = (Number(result.benchmarkAmount) / 100).toFixed(2);
    $('#engagementRisk').value = result.risk;
    $('#customRate').value = result.rate;
  }
  renderSample();
}

function renderSample() {
  const body = $('#sampleTableBody');
  body.innerHTML = runtime.sample.length ? runtime.sample.map((row, index) => `
    <tr><td>${index + 1}</td><td dir="ltr">${e(row.code)}</td><td>${e(row.name)}</td><td class="number">${e(money(row.net))}</td><td>${e(row.category)}</td></tr>`).join('')
    : '<tr><td colspan="5"><div class="empty-state compact">حدّد البيانات ثم أنشئ عينة.</div></td></tr>';
  const status = $('#sampleStatus');
  status.className = `status-chip ${runtime.sample.length ? 'success' : 'neutral'}`;
  status.textContent = runtime.sample.length ? `${runtime.sample.length} عنصرًا` : 'لا توجد عينة';
  $('#exportSampleButton').disabled = runtime.sample.length === 0;
}

function renderRounds() {
  const rounds = buildRoundReadiness({
    analysis: runtime.analysis,
    materiality: runtime.materiality,
    risks: runtime.risks,
    workpapers: state.workpapers,
    findings: state.findings,
    pbc: state.pbc,
    reportApproved: Boolean(state.approval)
  });
  $('#roundsTimeline').innerHTML = rounds.map((round) => `
    <article class="round-card ${round.ready ? 'ready' : ''}">
      <div class="round-number">${round.id}</div>
      <div><span class="eyebrow">${e(round.code)}</span><h2>${e(round.title)}</h2><p>${e(round.gate)}</p></div>
      <div class="round-meta"><span class="status-chip ${round.ready ? 'success' : 'neutral'}">${round.ready ? 'بوابة جاهزة' : 'تحتاج عملًا'}</span></div>
    </article>`).join('');
}

function filteredRisks() {
  const query = normalizeText($('#riskSearch')?.value ?? '');
  const severity = $('#riskSeverityFilter')?.value ?? 'all';
  const status = $('#riskStatusFilter')?.value ?? 'all';
  return runtime.risks.filter((risk) => {
    const textMatch = !query || normalizeText(`${risk.title} ${risk.accountName} ${risk.accountCode} ${risk.category} ${risk.standards.join(' ')}`).includes(query);
    return textMatch && (severity === 'all' || risk.severity === severity) && (status === 'all' || risk.status === status);
  });
}

function renderRisks() {
  const allRisks = filteredRisks();
  const risks = allRisks.slice(0, 200);
  const list = $('#riskList');
  list.innerHTML = risks.length ? risks.map((risk) => `
    <button class="risk-card ${risk.id === runtime.selectedRiskId ? 'selected' : ''}" data-risk-id="${e(risk.id)}" data-severity="${e(risk.severity)}" type="button">
      <span class="risk-score-bar" aria-hidden="true"></span>
      <span class="risk-main"><h3>${e(risk.title)}</h3><p>${e(risk.accountCode)} — ${e(risk.accountName)} · ${e(risk.category)}</p></span>
      <span class="risk-meta"><strong>${risk.score}</strong><span class="severity-chip ${e(risk.severity)}">${e(severityLabel(risk.severity))}</span><small>${e(statusLabel(risk.status))}</small></span>
    </button>`).join('') + (allRisks.length > risks.length ? `<div class="empty-state compact">يُعرض أعلى ${risks.length} من ${allRisks.length.toLocaleString('ar-SA')} إشارة. استخدم البحث والتصفية للوصول إلى البقية.</div>` : '') : '<div class="empty-state">لا توجد مخاطر مطابقة للتصفية.</div>';
  renderRiskDetail();
  renderFindings();
}

function renderRiskDetail() {
  const risk = runtime.risks.find((item) => item.id === runtime.selectedRiskId);
  const detail = $('#riskDetail');
  if (!risk) {
    detail.innerHTML = '<div class="empty-state compact">اختر خطرًا لعرض الربط المعياري والإجراء والدليل.</div>';
    return;
  }
  detail.innerHTML = `
    <div class="panel-header"><span class="severity-chip ${e(risk.severity)}">${e(severityLabel(risk.severity))} · ${risk.score}</span><span class="status-chip ${risk.status === 'open' ? 'warning' : 'success'}">${e(statusLabel(risk.status))}</span></div>
    <h2>${e(risk.title)}</h2>
    <div class="detail-account">${e(risk.accountCode)} — ${e(risk.accountName)} · ${e(money(risk.amount))}</div>
    <div class="detail-block"><h3>لماذا ظهرت الإشارة؟</h3><p>${e(risk.rationale)}</p></div>
    <div class="detail-block"><h3>الاستجابة المقترحة</h3><p>${e(risk.procedure)}</p></div>
    <div class="detail-block"><h3>الدليل المتوقع</h3><p>${e(risk.evidence)}</p></div>
    <div class="detail-block"><h3>الربط</h3><div class="detail-tags">${[...risk.standards, ...risk.assertions].map((item) => `<span class="table-tag">${e(item)}</span>`).join('')}</div></div>
    ${risk.humanDecision ? `<div class="detail-block"><h3>قرار المراجع</h3><p>${e(risk.humanDecision)}</p></div>` : ''}
    <div class="detail-actions">
      <button class="button secondary" type="button" data-risk-action="address" data-id="${e(risk.id)}"><svg><use href="#i-check"/></svg>تمت الاستجابة</button>
      <button class="button ghost" type="button" data-risk-action="accept" data-id="${e(risk.id)}">قبول مهني</button>
      <button class="button secondary" type="button" data-risk-action="workpaper" data-id="${e(risk.id)}"><svg><use href="#i-file"/></svg>ورقة عمل</button>
      <button class="button primary" type="button" data-risk-action="finding" data-id="${e(risk.id)}"><svg><use href="#i-plus"/></svg>تسجيل نتيجة</button>
    </div>`;
}

function renderFindings() {
  const body = $('#findingsTableBody');
  body.innerHTML = state.findings.length ? state.findings.map((finding) => `
    <tr>
      <td><strong>${e(finding.title)}</strong><br><small class="muted">${e(finding.description.slice(0, 100))}${finding.description.length > 100 ? '…' : ''}</small></td>
      <td><span class="severity-chip ${e(finding.severity)}">${e(severityLabel(finding.severity))}</span></td>
      <td class="number">${e(money(BigInt(finding.amountMinor ?? 0)))}</td>
      <td><span class="status-chip ${['closed','adjusted','passed'].includes(finding.status) ? 'success' : 'warning'}">${e(statusLabel(finding.status))}</span></td>
      <td dir="ltr">${e(finding.reference || '—')}</td>
      <td><div class="action-cell"><button type="button" data-delete-finding="${e(finding.id)}" aria-label="حذف"><svg><use href="#i-trash"/></svg></button></div></td>
    </tr>`).join('') : '<tr><td colspan="6"><div class="empty-state compact">لا توجد نتائج مسجلة.</div></td></tr>';
  $('#findingCountChip').textContent = `${state.findings.length.toLocaleString('ar-SA')} نتيجة`;
}

function renderStandards() {
  $('#frameworkGrid').innerHTML = FRAMEWORK_SUMMARIES.map((item) => `
    <article class="framework-card"><strong>${e(item.title)}</strong><p>${e(item.description)}</p><small>${e(item.warning)}</small></article>`).join('');
  const query = normalizeText($('#standardSearch')?.value ?? '');
  const framework = $('#frameworkFilter')?.value ?? 'all';
  const standards = STANDARDS.filter((item) => {
    const frameworkMatch = framework === 'all' || (framework === 'IFRS' ? item.framework === 'IFRS' : item.framework === framework);
    const searchMatch = !query || normalizeText(`${item.id} ${item.titleAr} ${item.titleEn} ${item.objective} ${item.triggers.join(' ')} ${item.procedures.join(' ')}`).includes(query);
    return frameworkMatch && searchMatch;
  });
  $('#standardsGrid').innerHTML = standards.length ? standards.map((item) => `
    <button class="standard-card" type="button" data-standard-id="${e(item.id)}">
      <span class="standard-top"><span class="standard-id">${e(item.id)}</span><span class="framework-pill">${e(item.framework)}</span></span>
      <h2>${e(item.titleAr)}</h2><span class="en-title">${e(item.titleEn)}</span>
      <p>${e(item.objective)}</p>
      <span class="standard-triggers">${item.triggers.slice(0, 3).map((trigger) => `<span>${e(trigger)}</span>`).join('')}</span>
    </button>`).join('') : '<div class="empty-state">لا توجد معايير مطابقة.</div>';
}

function openStandard(id) {
  const item = STANDARDS.find((standard) => standard.id === id);
  if (!item) return;
  $('#standardModalFramework').textContent = item.framework;
  $('#standardModalTitle').textContent = `${item.id} — ${item.titleAr}`;
  const blocks = [
    ['الهدف', item.objective],
    ['محفزات التطبيق', item.triggers],
    ['الاعتراف', item.recognition],
    ['القياس', item.measurement],
    ['العرض', item.presentation],
    ['الإفصاح', item.disclosure],
    ['إجراءات مراجعة', item.procedures],
    ['أدلة متوقعة', item.evidence],
    ['معايير مرتبطة', item.related]
  ];
  $('#standardModalBody').innerHTML = `<div class="standard-detail-grid">${blocks.map(([title, value]) => `
    <section class="standard-detail-block"><h3>${e(title)}</h3>${Array.isArray(value) ? `<ul>${value.map((entry) => `<li>${e(entry)}</li>`).join('')}</ul>` : `<p>${e(value)}</p>`}</section>`).join('')}</div>
    <div class="human-gate" style="margin-top:14px"><svg><use href="#i-shield"/></svg><span>هذه بطاقة تطبيقية مختصرة. ثبّت الحكم من النص الرسمي والإصدار الساري وظروف المنشأة قبل اعتماد المذكرة.</span></div>`;
  $('#standardModal').showModal();
}

function buildWorkpaperForRisk(risk) {
  const template = PROCEDURE_TEMPLATES.find((item) => item.category === risk.category) ?? {
    id: 'WP-GENERIC', title: risk.category, category: risk.category,
    objective: `معالجة خطر ${risk.title} على التأكيدات ذات الصلة.`,
    steps: [risk.procedure, 'حدد المجتمع واختبر اكتماله.', 'نفّذ الإجراء ووثّق الاستثناءات.', 'قيّم النتيجة واربطها بالأدلة والتحريفات.'],
    evidence: [risk.evidence]
  };
  const existing = state.workpapers.find((item) => item.templateId === template.id);
  if (existing) {
    existing.riskIds = [...new Set([...(existing.riskIds ?? []), risk.id])];
    return existing;
  }
  const workpaper = {
    id: `WP-${fnv1a(`${template.id}|${Date.now()}`).toString(16).toUpperCase()}`,
    templateId: template.id,
    title: template.title,
    category: template.category,
    objective: template.objective,
    steps: template.steps,
    evidence: template.evidence,
    riskIds: [risk.id],
    status: 'planning',
    owner: state.engagement.reviewer,
    estimateRelated: Boolean(template.estimateRelated),
    createdAt: new Date().toISOString()
  };
  state.workpapers.push(workpaper);
  return workpaper;
}

function generateWorkpapers() {
  if (!runtime.risks.length) {
    showToast('حلّل ميزان المراجعة أولًا لتوليد برنامج مرتبط بالمخاطر.', 'error');
    return;
  }
  runtime.risks.forEach(buildWorkpaperForRisk);
  analyzeRuntime();
  saveState();
  renderAll();
  showToast(`تم إنشاء ${state.workpapers.length} أوراق عمل وربطها بالمخاطر.`);
}

function renderWorkpapers() {
  const metrics = runtime.graph?.metrics ?? {};
  const riskCount = runtime.risks.length;
  const procedureCoverage = riskCount ? Math.round(((riskCount - (metrics.risksWithoutProcedure ?? riskCount)) / riskCount) * 100) : 0;
  const evidenceCoverage = riskCount ? Math.round(((riskCount - (metrics.risksWithoutEvidenceRequest ?? riskCount)) / riskCount) * 100) : 0;
  const findingCoverage = state.findings.length ? Math.round(((state.findings.length - (metrics.findingsWithoutWorkpaper ?? state.findings.length)) / state.findings.length) * 100) : 0;
  $('#procedureCoverage').textContent = `${procedureCoverage}%`;
  $('#evidenceCoverage').textContent = `${evidenceCoverage}%`;
  $('#findingCoverage').textContent = `${findingCoverage}%`;
  $('#workpaperBoard').innerHTML = state.workpapers.length ? state.workpapers.map((item) => `
    <article class="workpaper-card">
      <header><div><span class="eyebrow">${e(item.id)}</span><h2>${e(item.title)}</h2></div><span class="status-chip ${item.status === 'completed' ? 'success' : item.status === 'in-progress' ? 'warning' : 'neutral'}">${e(statusLabel(item.status))}</span></header>
      <p>${e(item.objective)}</p>
      <ol>${item.steps.map((step) => `<li>${e(step)}</li>`).join('')}</ol>
      <div class="detail-tags">${(item.evidence ?? []).map((entry) => `<span class="table-tag">${e(entry)}</span>`).join('')}</div>
      <div class="workpaper-footer"><span class="muted">${(item.riskIds ?? []).length} مخاطر · ${e(item.owner)}</span><select data-workpaper-status="${e(item.id)}"><option value="planning" ${item.status === 'planning' ? 'selected' : ''}>تخطيط</option><option value="in-progress" ${item.status === 'in-progress' ? 'selected' : ''}>قيد التنفيذ</option><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>مكتملة</option></select></div>
    </article>`).join('') : '<div class="empty-state">لا توجد أوراق عمل. أنشئها من المخاطر أو أضف نتيجة مهنية.</div>';
}

function datePlusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function matchRisksForPbc(title) {
  const text = normalizeText(title);
  const filters = [];
  if (/بنك|نقد|خزين/.test(text)) filters.push((risk) => risk.category === 'نقدية وبنوك');
  if (/عميل|ذمم|تحصيل/.test(text)) filters.push((risk) => ['ذمم مدينة', 'عقود وإيرادات'].includes(risk.category));
  if (/مورد|مدفوع/.test(text)) filters.push((risk) => risk.category === 'موردون والتزامات');
  if (/طرف|علاق/.test(text)) filters.push((risk) => risk.rule === 'RELATED-PARTY');
  if (/مخزون|جرد/.test(text)) filters.push((risk) => risk.category === 'مخزون');
  if (/استمراري|تمويل/.test(text)) filters.push((risk) => ['قروض وتمويل', 'نقدية وبنوك'].includes(risk.category) || risk.severity === 'critical');
  if (/حدث|قضي|قانون/.test(text)) filters.push((risk) => risk.standards.some((standard) => ['IAS 10', 'IAS 37'].includes(standard)));
  if (/ميزان|استاذ|قيد/.test(text)) return runtime.risks.map((risk) => risk.id);
  const selected = filters.length ? runtime.risks.filter((risk) => filters.some((filter) => filter(risk))) : runtime.risks.slice(0, 3);
  return selected.map((risk) => risk.id);
}

function seedPbc() {
  const existingTitles = new Set(state.pbc.map((item) => normalizeText(item.title)));
  for (const template of DEFAULT_PBC) {
    if (existingTitles.has(normalizeText(template.title))) continue;
    state.pbc.push({
      id: `PBC-${fnv1a(`${template.title}|${Date.now()}|${state.pbc.length}`).toString(16).toUpperCase()}`,
      title: template.title,
      owner: template.owner,
      due: datePlusDays(template.dueOffset),
      priority: template.priority,
      status: 'requested',
      riskIds: matchRisksForPbc(template.title),
      createdAt: new Date().toISOString()
    });
  }
  analyzeRuntime();
  saveState();
  renderAll();
  showToast('تمت إضافة قائمة PBC الأساسية وربطها بالمخاطر ذات الصلة.');
}

function renderPbc() {
  const counts = {
    total: state.pbc.length,
    requested: state.pbc.filter((item) => item.status === 'requested').length,
    received: state.pbc.filter((item) => item.status === 'received').length,
    reviewed: state.pbc.filter((item) => item.status === 'reviewed').length
  };
  $('#pbcSummary').innerHTML = [
    ['إجمالي الطلبات', counts.total], ['مطلوب', counts.requested], ['مستلم للفحص', counts.received], ['تمت مراجعته', counts.reviewed]
  ].map(([label, count]) => `<div><span>${e(label)}</span><strong>${count.toLocaleString('ar-SA')}</strong></div>`).join('');
  const today = new Date().toISOString().slice(0, 10);
  $('#pbcBoard').innerHTML = state.pbc.length ? state.pbc.map((item) => `
    <article class="pbc-card ${item.due < today && !['reviewed'].includes(item.status) ? 'overdue' : ''}">
      <input type="checkbox" data-pbc-toggle="${e(item.id)}" ${item.status === 'reviewed' ? 'checked' : ''} aria-label="تمت مراجعة الطلب">
      <div><h3>${e(item.title)}</h3><p>${(item.riskIds ?? []).length} مخاطر مرتبطة · ${e(statusLabel(item.status))}</p></div>
      <span class="pbc-owner">${e(item.owner)}</span>
      <span class="pbc-date">${e(formatDate(item.due))}</span>
      <span class="severity-chip ${e(item.priority)}">${e(severityLabel(item.priority))}</span>
    </article>`).join('') : '<div class="empty-state">لم تُنشأ طلبات مستندات بعد.</div>';
}

function renderCouncil() {
  const latest = state.councilRuns[0];
  if (!latest) {
    $('#councilOverview').innerHTML = '<div class="empty-state">شغّل جولة بعد تحميل البيانات وتحديد الأهمية.</div>';
    $('#councilGrid').innerHTML = '';
  } else {
    $('#councilOverview').innerHTML = `
      <article class="council-result"><div class="agreement-meter"><strong>${latest.agreement}%</strong><span>مؤشر اتفاق استشاري</span></div><div class="council-conclusion"><h2>${e(latest.advisoryConclusion)}</h2><p>${e(formatDate(latest.createdAt))}</p>${latest.blockers.length ? `<ul class="blocker-list">${latest.blockers.map((item) => `<li>${e(item)}</li>`).join('')}</ul>` : ''}</div></article>`;
    $('#councilGrid').innerHTML = latest.seats.map((seat) => `
      <article class="council-seat"><header><h2>${e(seat.title)}</h2><span class="confidence">ثقة تحليلية ${seat.confidence}%</span></header><p>${e(seat.conclusion)}</p></article>`).join('');
  }
  $('#councilHistory').innerHTML = state.councilRuns.length ? state.councilRuns.slice(0, 8).map((run) => `
    <div class="compact-item"><span class="status-chip ${run.blockers.length ? 'warning' : 'success'}">${run.agreement}%</span><span><strong>${e(formatDate(run.createdAt))}</strong><span>${run.blockers.length} موانع إكمال</span></span><span>${e(run.id)}</span></div>`).join('') : '<div class="empty-state compact">لا توجد جولات محفوظة.</div>';
}

function reportGateData() {
  const openHigh = runtime.risks.filter((risk) => ['critical', 'high'].includes(risk.severity) && risk.status === 'open').length;
  const unresolvedCritical = state.findings.filter((finding) => finding.severity === 'critical' && !['adjusted', 'closed', 'passed'].includes(finding.status)).length;
  return [
    { label: 'الميزان متزن', pass: Boolean(runtime.analysis?.balanced) },
    { label: 'الأهمية محددة', pass: Boolean(runtime.materiality?.overall > 0n) },
    { label: 'المخاطر العالية مستجاب لها', pass: runtime.risks.length > 0 && openHigh === 0 },
    { label: 'لا نتائج حرجة مفتوحة', pass: unresolvedCritical === 0 },
    { label: 'الاعتماد البشري مسجل', pass: Boolean(state.approval), action: true }
  ];
}

function renderReports() {
  const gates = reportGateData();
  $('#reportGates').innerHTML = gates.map((gate) => `
    <div class="report-gate ${gate.pass ? 'pass' : 'fail'}"><svg><use href="#${gate.pass ? 'i-check' : 'i-x'}"/></svg><span>${e(gate.label)}</span>${gate.action && !gate.pass ? '<button class="text-button" id="recordApprovalButton" type="button">تسجيل</button>' : ''}</div>`).join('');
  $('#reportEntity').textContent = state.engagement.entity;
  $('#reportPeriod').textContent = state.engagement.period;
  $('#reportStatus').textContent = state.approval ? `مراجعة بشرية مسجلة — ${state.approval.reviewer}` : 'مسودة — غير معتمدة';
  const high = runtime.risks.filter((risk) => ['critical', 'high'].includes(risk.severity)).length;
  const openFindings = state.findings.filter((finding) => !['closed', 'adjusted', 'passed'].includes(finding.status)).length;
  const readiness = calculateReadiness();
  $('#reportKpis').innerHTML = [
    ['الحسابات', runtime.analysis?.metrics.accounts ?? 0],
    ['المخاطر المرتفعة', high],
    ['النتائج المفتوحة', openFindings],
    ['جاهزية الملف', `${readiness}%`]
  ].map(([label, value]) => `<div><span>${e(label)}</span><strong>${e(value)}</strong></div>`).join('');
  if (runtime.analysis) {
    const balanceText = runtime.analysis.balanced ? 'الميزان متزن حسابيًا' : `يوجد فرق قدره ${money(runtime.analysis.imbalance)}`;
    const materialityText = runtime.materiality ? `والأهمية الإجمالية المقترحة ${money(runtime.materiality.overall)}` : 'ولم تُسجّل أهمية نسبية بعد';
    $('#reportExecutiveText').textContent = `${balanceText}، ${materialityText}. رصد المحرك ${runtime.risks.length} إشارة مخاطر، منها ${high} مرتفعة أو حرجة. الاتزان الحسابي لا يثبت صحة الاعتراف أو القياس أو العرض أو الإفصاح.`;
  } else {
    $('#reportExecutiveText').textContent = 'لم تُحلل بيانات بعد.';
  }
  $('#reportRisks').innerHTML = runtime.risks.length ? runtime.risks.slice(0, 8).map((risk) => `
    <div class="report-risk-row"><span><strong>${e(risk.title)}</strong><span>${e(risk.accountName)} · ${e(risk.rationale)}</span></span><span>${e(severityLabel(risk.severity))} · ${risk.score}</span></div>`).join('') : '<p class="muted">لا توجد بيانات.</p>';
  $('#reportFindings').innerHTML = state.findings.length ? state.findings.map((finding) => `
    <div class="report-finding-row"><span><strong>${e(finding.title)}</strong><span>${e(finding.description)}</span></span><span>${e(statusLabel(finding.status))} · ${e(money(BigInt(finding.amountMinor ?? 0)))}</span></div>`).join('') : '<p class="muted">لا توجد نتائج مسجلة.</p>';
}

function renderKnowledge() {
  $('#knowledgeCount').textContent = KNOWLEDGE_TRACKS.length.toLocaleString('ar-SA');
  $('#knowledgeGrid').innerHTML = KNOWLEDGE_TRACKS.map((track) => `
    <article class="knowledge-card">
      <header><span class="eyebrow">${e(track.id)}</span><span class="source-type">${track.type === 'playlist' ? 'قائمة تشغيل' : 'فيديو'} · ${track.status === 'mapped' ? 'مربوط' : 'مفهرس'}</span></header>
      <h2>${e(track.title)}</h2>
      <div class="focus-list">${track.focus.map((item) => `<span>${e(item)}</span>`).join('')}</div>
      <div class="module-map"><small>تحول داخل التطبيق إلى:</small><p>${e(track.appModules.join(' ← '))}</p></div>
      <a href="${e(track.url)}" target="_blank" rel="noopener noreferrer"><svg><use href="#i-link"/></svg>فتح المصدر الأصلي</a>
    </article>`).join('');
}

function renderTopbar() {
  $('#topbarTitle').textContent = `${state.engagement.entity} — ${state.engagement.period.replace('للسنة المنتهية في ', '')}`;
  document.documentElement.dataset.theme = state.preferences.theme;
  $('#themeButton use')?.setAttribute('href', state.preferences.theme === 'dark' ? '#i-sun' : '#i-moon');
}

function renderAll() {
  analyzeRuntime();
  renderTopbar();
  renderDashboard();
  renderData();
  renderMateriality();
  renderRounds();
  renderRisks();
  renderStandards();
  renderWorkpapers();
  renderPbc();
  renderCouncil();
  renderReports();
  renderKnowledge();
}

function packageExport() {
  return {
    product: 'KOSIF Audit Studio',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    engagement: state.engagement,
    sourceName: state.sourceName,
    rawRows: state.rawRows,
    materiality: state.materiality,
    riskDecisions: state.riskDecisions,
    computed: runtime.analysis ? {
      totalDebitMinor: runtime.analysis.totalDebit.toString(),
      totalCreditMinor: runtime.analysis.totalCredit.toString(),
      imbalanceMinor: runtime.analysis.imbalance.toString(),
      balanced: runtime.analysis.balanced,
      risks: runtime.risks.map((risk) => ({ ...risk, amount: risk.amount.toString() })),
      evidenceGraph: runtime.graph
    } : null,
    workpapers: state.workpapers,
    findings: state.findings,
    pbc: state.pbc,
    councilRuns: state.councilRuns,
    approval: state.approval,
    guardrails: {
      automatedPosting: false,
      automatedOpinion: false,
      humanApprovalRequired: true,
      officialStandardsVerificationRequired: true
    }
  };
}

function bindEvents() {
  $('#mainNav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (button) openView(button.dataset.view);
  });
  document.addEventListener('click', (event) => {
    const go = event.target.closest('[data-go]');
    if (go) openView(go.dataset.go);
    const dashboardRisk = event.target.closest('[data-open-risk]');
    if (dashboardRisk) {
      runtime.selectedRiskId = dashboardRisk.dataset.openRisk;
      openView('risks');
      renderRisks();
    }
    const close = event.target.closest('[data-close-dialog]');
    if (close) document.getElementById(close.dataset.closeDialog)?.close();
  });
  $('#menuButton').addEventListener('click', toggleSidebar);
  $('#sidebarBackdrop').addEventListener('click', closeSidebar);
  $('#themeButton').addEventListener('click', () => {
    state.preferences.theme = state.preferences.theme === 'dark' ? 'light' : 'dark';
    saveState();
    renderTopbar();
  });
  $('#topbarTitle').addEventListener('click', () => {
    const entity = window.prompt('اسم المنشأة:', state.engagement.entity);
    if (!entity?.trim()) return;
    state.engagement.entity = entity.trim();
    saveState();
    renderAll();
  });

  $('#heroDemoButton').addEventListener('click', loadDemo);
  $('#loadDemoButton').addEventListener('click', loadDemo);
  $('#dropZone').addEventListener('click', () => $('#fileInput').click());
  $('#dropZone').addEventListener('keydown', (event) => {
    if (['Enter', ' '].includes(event.key)) { event.preventDefault(); $('#fileInput').click(); }
  });
  $('#fileInput').addEventListener('change', (event) => readFile(event.target.files[0]));
  for (const eventName of ['dragenter', 'dragover']) {
    $('#dropZone').addEventListener(eventName, (event) => { event.preventDefault(); $('#dropZone').classList.add('dragging'); });
  }
  for (const eventName of ['dragleave', 'drop']) {
    $('#dropZone').addEventListener(eventName, (event) => { event.preventDefault(); $('#dropZone').classList.remove('dragging'); });
  }
  $('#dropZone').addEventListener('drop', (event) => readFile(event.dataTransfer.files[0]));
  $('#analyzeButton').addEventListener('click', () => { analyzeRuntime(); renderAll(); showToast('أعيد تشغيل التحليل وربط المعايير والمخاطر.'); });
  $('#accountSearch').addEventListener('input', () => { runtime.accountPage = 1; renderAccountsTable(); });
  $('#prevAccounts').addEventListener('click', () => { runtime.accountPage = Math.max(1, runtime.accountPage - 1); renderAccountsTable(); });
  $('#nextAccounts').addEventListener('click', () => { runtime.accountPage += 1; renderAccountsTable(); });
  $('#downloadTemplateButton').addEventListener('click', () => downloadBlob('\uFEFFكود الحساب,اسم الحساب,مدين,دائن,العملة\n111001,الصندوق,150000,0,SAR\n311001,رأس المال,0,150000,SAR\n', 'kosif_trial_balance_template.csv', 'text/csv;charset=utf-8'));
  $('#exportTbButton').addEventListener('click', () => {
    if (!runtime.analysis) return;
    downloadBlob(rowsToCsv(runtime.analysis.rows), 'kosif_classified_trial_balance.csv', 'text/csv;charset=utf-8');
  });

  $('#materialityForm').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const result = calculateMateriality({
        benchmark: $('#benchmark').value,
        amountMinor: parseMoneyMinor($('#benchmarkAmount').value),
        risk: $('#engagementRisk').value,
        customRate: $('#customRate').value === '' ? null : $('#customRate').value,
        performanceRate: Number($('#performanceRate').value),
        trivialRate: Number($('#trivialRate').value)
      });
      state.materiality = persistMateriality(result);
      state.approval = null;
      analyzeRuntime();
      saveState();
      renderAll();
      showToast('تم حساب الأهمية وإعادة تقييم المخاطر. يلزم اعتماد الأساس مهنيًا.');
    } catch (error) {
      showToast(error.message || 'تعذر حساب الأهمية.', 'error');
    }
  });
  $('#generateSampleButton').addEventListener('click', () => {
    if (!runtime.analysis?.rows.length) { showToast('حمّل ميزان المراجعة أولًا.', 'error'); return; }
    runtime.sample = selectAuditSample(runtime.analysis.rows, {
      method: $('#sampleMethod').value,
      size: Number($('#sampleSize').value),
      seed: Number($('#sampleSeed').value),
      materialityMinor: runtime.materiality?.overall ?? 0n
    });
    renderSample();
    showToast('تم توليد العينة ببذرة قابلة لإعادة التنفيذ.');
  });
  $('#exportSampleButton').addEventListener('click', () => downloadBlob(rowsToCsv(runtime.sample), 'kosif_audit_sample.csv', 'text/csv;charset=utf-8'));

  for (const input of ['riskSearch', 'riskSeverityFilter', 'riskStatusFilter']) {
    $(`#${input}`).addEventListener(input === 'riskSearch' ? 'input' : 'change', renderRisks);
  }
  $('#riskList').addEventListener('click', (event) => {
    const card = event.target.closest('[data-risk-id]');
    if (!card) return;
    runtime.selectedRiskId = card.dataset.riskId;
    renderRisks();
  });
  $('#riskDetail').addEventListener('click', (event) => {
    const button = event.target.closest('[data-risk-action]');
    if (!button) return;
    const risk = runtime.risks.find((item) => item.id === button.dataset.id);
    if (!risk) return;
    if (button.dataset.riskAction === 'address') {
      state.riskDecisions[risk.id] = { status: 'addressed', note: 'تمت الاستجابة وربط الخطر بإجراء؛ يلزم توثيق نتيجة التنفيذ.', decidedAt: new Date().toISOString() };
    } else if (button.dataset.riskAction === 'accept') {
      const note = window.prompt('سجّل مبرر القبول المهني للخطر المتبقي:', risk.humanDecision ?? '');
      if (!note?.trim()) return;
      state.riskDecisions[risk.id] = { status: 'accepted', note: note.trim(), decidedAt: new Date().toISOString() };
    } else if (button.dataset.riskAction === 'workpaper') {
      buildWorkpaperForRisk(risk);
      showToast('تم إنشاء/تحديث ورقة العمل وربطها بالخطر.');
    } else if (button.dataset.riskAction === 'finding') {
      runtime.selectedFindingRiskId = risk.id;
      $('#findingTitle').value = risk.title;
      $('#findingReference').value = risk.standards.join(' / ');
      $('#findingDescription').value = `${risk.rationale}\n\nالإجراء: ${risk.procedure}\n\nالدليل المتوقع: ${risk.evidence}`;
      $('#findingSeverity').value = risk.severity;
      $('#findingModal').showModal();
      return;
    }
    analyzeRuntime(); saveState(); renderAll();
  });
  $('#addFindingButton').addEventListener('click', () => {
    runtime.selectedFindingRiskId = null;
    $('#findingForm').reset();
    $('#findingAmount').value = '0';
    $('#findingModal').showModal();
  });
  $('#findingForm').addEventListener('submit', (event) => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    const finding = {
      id: `F-${fnv1a(`${$('#findingTitle').value}|${Date.now()}`).toString(16).toUpperCase()}`,
      title: $('#findingTitle').value.trim(),
      severity: $('#findingSeverity').value,
      amountMinor: parseMoneyMinor($('#findingAmount').value).toString(),
      reference: $('#findingReference').value.trim(),
      status: $('#findingStatus').value,
      description: $('#findingDescription').value.trim(),
      riskId: runtime.selectedFindingRiskId,
      workpaperId: state.workpapers.find((wp) => (wp.riskIds ?? []).includes(runtime.selectedFindingRiskId))?.id ?? null,
      createdAt: new Date().toISOString()
    };
    state.findings.push(finding);
    $('#findingModal').close();
    analyzeRuntime(); saveState(); renderAll(); showToast('تم تسجيل النتيجة وربطها بملف الارتباط.');
  });
  $('#findingsTableBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-finding]');
    if (!button) return;
    state.findings = state.findings.filter((item) => item.id !== button.dataset.deleteFinding);
    analyzeRuntime(); saveState(); renderAll(); showToast('تم حذف النتيجة.');
  });

  $('#standardSearch').addEventListener('input', renderStandards);
  $('#frameworkFilter').addEventListener('change', renderStandards);
  $('#standardsGrid').addEventListener('click', (event) => {
    const card = event.target.closest('[data-standard-id]');
    if (card) openStandard(card.dataset.standardId);
  });
  $('#generateWorkpapersButton').addEventListener('click', generateWorkpapers);
  $('#workpaperBoard').addEventListener('change', (event) => {
    const select = event.target.closest('[data-workpaper-status]');
    if (!select) return;
    const workpaper = state.workpapers.find((item) => item.id === select.dataset.workpaperStatus);
    if (workpaper) {
      workpaper.status = select.value;
      workpaper.updatedAt = new Date().toISOString();
      analyzeRuntime(); saveState(); renderAll();
    }
  });

  $('#seedPbcButton').addEventListener('click', seedPbc);
  $('#addPbcButton').addEventListener('click', () => {
    $('#pbcForm').reset();
    $('#pbcDueInput').value = datePlusDays(3);
    $('#pbcModal').showModal();
  });
  $('#pbcForm').addEventListener('submit', (event) => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    const title = $('#pbcTitleInput').value.trim();
    state.pbc.push({
      id: `PBC-${fnv1a(`${title}|${Date.now()}`).toString(16).toUpperCase()}`,
      title,
      owner: $('#pbcOwnerInput').value.trim(),
      due: $('#pbcDueInput').value,
      priority: $('#pbcPriorityInput').value,
      status: $('#pbcStatusInput').value,
      riskIds: matchRisksForPbc(title),
      createdAt: new Date().toISOString()
    });
    $('#pbcModal').close();
    analyzeRuntime(); saveState(); renderAll(); showToast('تم حفظ طلب المستند وربطه بالمخاطر المناسبة.');
  });
  $('#pbcBoard').addEventListener('change', (event) => {
    const input = event.target.closest('[data-pbc-toggle]');
    if (!input) return;
    const item = state.pbc.find((entry) => entry.id === input.dataset.pbcToggle);
    if (item) {
      item.status = input.checked ? 'reviewed' : 'requested';
      item.updatedAt = new Date().toISOString();
      analyzeRuntime(); saveState(); renderAll();
    }
  });

  $('#runCouncilButton').addEventListener('click', () => {
    if (!runtime.analysis) { showToast('حمّل البيانات قبل تشغيل المجلس.', 'error'); return; }
    const run = councilReview({ risks: runtime.risks, findings: state.findings, materiality: runtime.materiality, analysis: runtime.analysis });
    state.councilRuns.unshift(run);
    state.councilRuns = state.councilRuns.slice(0, 20);
    saveState(); renderAll(); showToast('اكتملت الجولة الاستشارية دون اعتماد أو رأي آلي.');
  });

  $('#exportJsonButton').addEventListener('click', () => downloadBlob(JSON.stringify(packageExport(), null, 2), 'kosif_audit_engagement.json', 'application/json;charset=utf-8'));
  $('#printReportButton').addEventListener('click', () => window.print());
  $('#reportGates').addEventListener('click', (event) => {
    if (!event.target.closest('#recordApprovalButton')) return;
    const reviewer = window.prompt('اسم المراجع الذي أتم المراجعة البشرية:', state.engagement.reviewer);
    if (!reviewer?.trim()) return;
    state.approval = { reviewer: reviewer.trim(), recordedAt: new Date().toISOString(), scope: 'تسجيل مراجعة بشرية لبوابات الملف فقط؛ لا يمثل إصدار رأي تلقائي.' };
    saveState(); renderAll(); showToast('تم تسجيل المراجعة البشرية في سجل الملف.');
  });

  $('#globalSearch').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const query = event.currentTarget.value.trim();
    if (!query) return;
    const normalized = normalizeText(query);
    const standardMatch = STANDARDS.some((item) => normalizeText(`${item.id} ${item.titleAr}`).includes(normalized));
    if (standardMatch) {
      openView('standards'); $('#standardSearch').value = query; renderStandards();
    } else if (runtime.risks.some((risk) => normalizeText(`${risk.title} ${risk.accountName}`).includes(normalized))) {
      openView('risks'); $('#riskSearch').value = query; renderRisks();
    } else {
      openView('data'); $('#accountSearch').value = query; runtime.accountPage = 1; renderAccountsTable();
    }
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker registration failed', error));
  }
}

analyzeRuntime();
bindEvents();
renderAll();
openView(state.activeView, { keepScroll: true });
registerServiceWorker();
