import {
  STANDARDS,
  STANDARD_SOURCES,
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
  fnv1a,
  analyzeJournalEntries,
  scoreEvidenceQuality,
  appendAuditEvent,
  verifyAuditEventChain,
  createMaterialityRevision
} from './engine.js';
import { buildMoonSnapshot, SOCPA_2025_WATCH } from './moon-core.js';
import { SEAT_CONTRACTS, convene, resolveConflict, stanceLabel, councilVerdictLabel } from './council.js';
import { createVoiceAssistant, voiceSupport } from './voice.js';
import { buildAnalyticsSnapshot, opinionDecisionTree, conformityLabel, misstatementVerdictLabel } from './analytics.js';
import { createStudio } from './studio.js';
import { contextStamp } from './agent.js';

const STORAGE_KEY = 'kosif-audit-studio:v1';
const STATE_VERSION = 3;
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
  version: STATE_VERSION,
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
  evidence: [],
  journalEntries: [],
  journalReview: null,
  materialityRevisions: [],
  auditEvents: [],
  archiveSnapshots: [],
  councilRuns: [],
  approval: null,
  opinion: { scope: 'none', goingConcern: 'none', pervasive: false, decision: null },
  studio: { plan: null, planHistory: [], messages: [], memos: [], savedReferences: [], periodStart: '2026-01-01' },
  preferences: { theme: 'light', voiceMuted: false, voiceGateway: '' }
});

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || ![1, 2, STATE_VERSION].includes(parsed.version)) return createDefaultState();
    const savedStudio = parsed.studio && typeof parsed.studio === 'object' ? parsed.studio : {};
    return {
      ...createDefaultState(),
      ...parsed,
      version: STATE_VERSION,
      engagement: { ...createDefaultState().engagement, ...(parsed.engagement ?? {}) },
      preferences: { ...createDefaultState().preferences, ...(parsed.preferences ?? {}) },
      riskDecisions: parsed.riskDecisions ?? {},
      workpapers: Array.isArray(parsed.workpapers) ? parsed.workpapers : [],
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      pbc: Array.isArray(parsed.pbc) ? parsed.pbc : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      journalEntries: Array.isArray(parsed.journalEntries) ? parsed.journalEntries.slice(0, MAX_ROWS) : [],
      journalReview: parsed.journalReview && typeof parsed.journalReview === 'object' ? parsed.journalReview : null,
      materialityRevisions: Array.isArray(parsed.materialityRevisions) ? parsed.materialityRevisions : [],
      auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents : [],
      archiveSnapshots: Array.isArray(parsed.archiveSnapshots) ? parsed.archiveSnapshots : [],
      councilRuns: Array.isArray(parsed.councilRuns) ? parsed.councilRuns : [],
      opinion: { ...createDefaultState().opinion, ...(parsed.opinion ?? {}) },
      studio: {
        ...createDefaultState().studio, ...savedStudio,
        plan: savedStudio.plan && Array.isArray(savedStudio.plan.tasks) ? savedStudio.plan : null,
        planHistory: Array.isArray(savedStudio.planHistory) ? savedStudio.planHistory.slice(0, 5) : [],
        messages: Array.isArray(savedStudio.messages) ? savedStudio.messages.slice(-24) : [],
        memos: Array.isArray(savedStudio.memos) ? savedStudio.memos.slice(0, 20) : [],
        savedReferences: Array.isArray(savedStudio.savedReferences) ? savedStudio.savedReferences : []
      },
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
  journalReview: null,
  accountPage: 1,
  selectedFindingRiskId: null,
  analytics: null,
  opinion: null,
  paletteIndex: 0
};
let studio = null;

function recordAuditEvent(type, payload = {}) {
  state.auditEvents = appendAuditEvent(state.auditEvents, {
    type,
    actor: state.engagement.reviewer,
    timestamp: new Date().toISOString(),
    payload
  });
}

function invalidateApproval(reason) {
  if (!state.approval) return;
  const previousApproval = state.approval;
  state.approval = null;
  recordAuditEvent('HUMAN_REVIEW_INVALIDATED', {
    reason,
    previousReviewer: previousApproval.reviewer,
    previousRecordedAt: previousApproval.recordedAt
  });
}

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
  refreshEvidenceScores();
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
    pbc: state.pbc,
    evidence: state.evidence
  });
  runtime.journalReview = state.journalEntries.length
    ? analyzeJournalEntries(state.journalEntries, state.journalReview?.parameters ?? {})
    : null;
  runtime.analytics = runtime.analysis
    ? buildAnalyticsSnapshot({
      rows: runtime.analysis.rows,
      findings: state.findings,
      materiality: runtime.materiality,
      journalEntries: runtime.journalReview?.entries ?? []
    })
    : null;
  runtime.opinion = opinionDecisionTree({
    balanced: Boolean(runtime.analysis?.balanced),
    misstatements: runtime.analytics?.misstatements ?? null,
    scopeLimitation: state.opinion.scope,
    goingConcern: state.opinion.goingConcern,
    pervasiveMisstatement: Boolean(state.opinion.pervasive)
  });
  if (state.opinion.decision && state.opinion.decision.code !== runtime.opinion.code) {
    state.opinion.decision = null;
  }
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
  return { critical: 'حرجة', high: 'مرتفعة', medium: 'متوسطة', low: 'منخفضة', clear: 'بلا إشارة' }[value] ?? value;
}

function statusLabel(value) {
  return {
    open: 'مفتوحة', addressed: 'تمت الاستجابة', accepted: 'مقبولة مهنيًا',
    planning: 'تخطيط', 'in-progress': 'قيد التنفيذ', completed: 'مكتملة',
    requested: 'مطلوب', received: 'مستلم', reviewed: 'تمت مراجعته', rejected: 'غير كافٍ',
    unreviewed: 'بانتظار المراجعة',
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
  if (!options.keepScroll) {
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches || state.studio.quietMotion ? 'instant' : 'smooth' });
    $('#mainContent').focus({ preventScroll: true });
  }
  closeSidebar();
  if (view === 'reports') renderReports();
  studio?.onView(view);
  $$('.nav-item').forEach(button => button.classList.contains('active') ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current'));
}

function closeSidebar() {
  $('#appShell')?.classList.remove('sidebar-open');
  $('#sidebarBackdrop')?.classList.remove('visible');
  $('#menuButton')?.setAttribute('aria-expanded', 'false');
  $('#dockMore')?.setAttribute('aria-expanded', 'false');
  $('#sidebar').inert = matchMedia('(max-width: 900px)').matches;
  document.body.classList.remove('mobile-menu-open');
}

function toggleSidebar() {
  $('#appShell')?.classList.toggle('sidebar-open');
  $('#sidebarBackdrop')?.classList.toggle('visible');
  const expanded = $('#appShell').classList.contains('sidebar-open');
  $('#menuButton')?.setAttribute('aria-expanded', String(expanded));
  $('#dockMore')?.setAttribute('aria-expanded', String(expanded));
  $('#sidebar').inert = !expanded && matchMedia('(max-width: 900px)').matches;
  document.body.classList.toggle('mobile-menu-open', expanded && matchMedia('(max-width: 900px)').matches);
  if (expanded) $('#mainNav .nav-item').focus();
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
  invalidateApproval('تغيير مصدر ميزان المراجعة');
  state.rawRows = sanitizeRawRows(rows);
  state.sourceName = sourceName;
  state.materiality = null;
  state.materialityRevisions = [];
  state.riskDecisions = {};
  state.workpapers = [];
  state.findings = [];
  state.pbc = [];
  state.evidence = [];
  state.journalEntries = [];
  state.journalReview = null;
  state.councilRuns = [];
  state.studio = { ...createDefaultState().studio, savedReferences: state.studio.savedReferences, periodStart: state.studio.periodStart, quietMotion: state.studio.quietMotion };
  state.opinion = { ...createDefaultState().opinion };
  runtime.sample = [];
  runtime.accountPage = 1;
  analyzeRuntime();
  recordAuditEvent('TRIAL_BALANCE_IMPORTED', {
    sourceName,
    rows: state.rawRows.length,
    balanced: runtime.analysis?.balanced ?? false,
    imbalanceMinor: runtime.analysis?.imbalance?.toString() ?? '0'
  });
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
    state.materialityRevisions = createMaterialityRevision(state.materialityRevisions, result, {
      actor: state.engagement.reviewer,
      rationale: 'اقتراح تخطيط أولي للبيانات التجريبية'
    });
    recordAuditEvent('MATERIALITY_RECORDED', {
      version: state.materialityRevisions.length,
      overallMinor: result.overall.toString(),
      source: 'demo-suggestion'
    });
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
  const journalReady = Boolean(runtime.journalReview?.summary.total > 0 && runtime.journalReview.summary.pendingReview === 0);
  const evidenceReady = runtime.risks.length > 0 && graph.risksWithoutEvidence === 0;
  const workpaperReady = state.workpapers.length > 0 && state.workpapers.some((wp) => wp.status === 'completed');
  const findingReady = state.findings.every((finding) => !['open', 'management-response'].includes(finding.status));
  const pbcReady = state.pbc.length > 0 && state.pbc.filter((item) => item.status === 'reviewed').length / state.pbc.length >= 0.7;
  const approvalReady = Boolean(state.approval);
  const checks = [analysisReady, materialityReady, riskReady, journalReady, procedureReady, evidenceReady, workpaperReady, findingReady, pbcReady, approvalReady];
  const weights = [12, 10, 12, 10, 10, 12, 10, 8, 8, 8];
  return checks.reduce((sum, check, index) => sum + (check ? weights[index] : 0), 0);
}

function renderDashboard() {
  const accounts = runtime.analysis?.metrics.accounts ?? 0;
  const openRisks = runtime.risks.filter((risk) => risk.status === 'open');
  const highRisks = openRisks.filter((risk) => ['critical', 'high'].includes(risk.severity));
  const completedWp = state.workpapers.filter((item) => item.status === 'completed').length;
  const graph = runtime.graph?.metrics ?? { risksWithoutEvidence: 0, risksWithoutProcedure: 0, averageEvidenceScore: 0 };
  const readiness = calculateReadiness();
  const evidenceCoverage = runtime.risks.length ? Math.round(((runtime.risks.length - (graph.risksWithoutEvidence ?? runtime.risks.length)) / runtime.risks.length) * 100) : 0;
  const journalPending = runtime.journalReview?.summary.pendingReview ?? 0;
  const snapshot = buildMoonSnapshot({
    ...state,
    riskSummary: { total: runtime.risks.length, highOpen: highRisks.length }
  });
  const nextGate = snapshot.gates.find((item) => item.status !== 'ready') ?? snapshot.gates.at(-1);
  const actionLabels = {
    data: 'تحميل الميزان', planning: 'تحديد الأهمية', risks: 'مراجعة المخاطر', journal: 'فحص القيود',
    workpapers: 'تنفيذ أوراق العمل', pbc: 'متابعة المستندات', evidence: 'تسجيل الأدلة', reports: 'مراجعة التقرير'
  };
  const stageLabels = {
    data: 'تهيئة الارتباط', planning: 'التخطيط', 'risk-response': 'تقييم المخاطر', journal: 'فحص القيود',
    fieldwork: 'التنفيذ', evidence: 'جمع المستندات', 'evidence-register': 'فحص الأدلة', review: 'المراجعة', reporting: 'التقرير', archive: 'الأرشفة'
  };

  $('#metricAccounts').textContent = accounts.toLocaleString('ar-SA');
  $('#metricRisks').textContent = openRisks.length.toLocaleString('ar-SA');
  $('#metricHighRisks').textContent = `${highRisks.length.toLocaleString('ar-SA')} مرتفعة أو حرجة`;
  $('#metricWorkpapers').textContent = state.workpapers.length.toLocaleString('ar-SA');
  $('#metricCompletedWp').textContent = `${completedWp.toLocaleString('ar-SA')} مكتملة`;
  $('#metricEvidenceGaps').textContent = (graph.risksWithoutEvidence ?? 0).toLocaleString('ar-SA');
  $('#metricEvidenceHealth').textContent = state.evidence.length ? `متوسط جودة ${graph.averageEvidenceScore ?? 0}%` : 'مخاطر بلا دليل مستلم';
  $('#readinessValue').textContent = `${readiness}%`;
  $('#readinessRing').style.setProperty('--progress', `${readiness * 3.6}deg`);
  $('#heroBalanceState').textContent = runtime.analysis ? (runtime.analysis.balanced ? 'متزن حسابيًا' : 'يوجد فرق') : 'بانتظار البيانات';
  $('#heroCoverage').textContent = `${evidenceCoverage}%`;
  $('#heroJournalState').textContent = journalPending.toLocaleString('ar-SA');
  $('#riskBadge').textContent = openRisks.length > 99 ? '99+' : String(openRisks.length);
  $('#journalBadge').textContent = journalPending > 99 ? '99+' : String(journalPending);
  const evidenceAttention = Math.max(Number(graph.risksWithoutEvidence ?? 0), Number(graph.orphanEvidence ?? 0));
  $('#evidenceBadge').textContent = evidenceAttention > 99 ? '99+' : String(evidenceAttention);
  $('#dashboardStageChip').textContent = stageLabels[nextGate?.id] ?? 'الإكمال';
  $('#dashboardNextAction').textContent = nextGate?.reason ?? 'اكتملت المؤشرات التشغيلية؛ نفّذ مراجعة الجودة وسجّل القرار البشري.';
  const nextActionView = nextGate?.actionView ?? 'reports';
  $('#nextActionButton').dataset.go = nextActionView;
  $('#nextActionLabel').textContent = actionLabels[nextActionView] ?? 'فتح الخطوة التالية';

  const readyGateCount = snapshot.gates.filter((item) => item.status === 'ready').length;
  $('#dashboardGateSummary').textContent = `${readyGateCount.toLocaleString('ar-SA')} / ${snapshot.gates.length.toLocaleString('ar-SA')}`;
  $('#dashboardGateRail').innerHTML = snapshot.gates.map((item) => `
    <button type="button" class="dashboard-gate" data-status="${e(item.status)}" ${item.actionView ? `data-go="${e(item.actionView)}"` : ''}>
      <strong>${e(item.label)}</strong><span>${e(item.status === 'ready' ? 'جاهز تشغيليًا' : item.status === 'attention' ? 'يحتاج إجراء' : 'محجوب')}</span>
    </button>`).join('');
  const blockers = snapshot.gates.filter((item) => item.status !== 'ready').slice(0, 4);
  $('#dashboardBlockers').innerHTML = blockers.length ? blockers.map((item) => `
    <div class="dashboard-blocker"><svg><use href="#i-alert"/></svg><span><strong>${e(item.label)}</strong><br>${e(item.reason)}</span></div>`).join('')
    : '<div class="empty-state compact">لا توجد عوائق تشغيلية ظاهرة. القرار النهائي يظل بشريًا.</div>';

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
  $('#materialityRevisionCount').textContent = `${state.materialityRevisions.length.toLocaleString('ar-SA')} إصدار`;
  $('#materialityRevisionHistory').innerHTML = state.materialityRevisions.length ? [...state.materialityRevisions].reverse().slice(0, 5).map((item) => `
    <div class="compact-item"><span class="status-chip neutral">v${item.version}</span><span><strong>${e(money(BigInt(item.overallMinor ?? 0)))}</strong><span>${e(item.rationale)} · ${e(item.actor)}</span></span><span>${e(formatDate(item.createdAt))}</span></div>`).join('') : '<div class="empty-state compact">لا توجد إصدارات مسجلة.</div>';
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

function journalParameters() {
  return {
    periodEnd: $('#journalPeriodEnd')?.value || state.journalReview?.parameters?.periodEnd || null,
    periodEndWindowDays: Number($('#journalWindowDays')?.value ?? state.journalReview?.parameters?.periodEndWindowDays ?? 5),
    rareUserMaxEntries: 1
  };
}

function persistJournalReview(review, sourceName) {
  state.journalEntries = review.entries.map((item) => ({
    id: item.id,
    date: item.date,
    user: item.user,
    source: item.source,
    description: item.description,
    amountMinor: item.amountMinor.toString(),
    reviewStatus: item.reviewStatus
  }));
  state.journalReview = {
    summary: review.summary,
    parameters: review.parameters,
    sourceName: sourceName || state.journalReview?.sourceName || 'سجل قيود',
    generatedAt: new Date().toISOString()
  };
  runtime.journalReview = analyzeJournalEntries(state.journalEntries, review.parameters);
}

function runJournalReview(inputRows = null, sourceName = null) {
  let rows = inputRows;
  if (!rows) {
    const pasted = $('#journalPaste').value.trim();
    rows = pasted ? parseCsv(pasted) : state.journalEntries;
    sourceName = pasted ? 'نص CSV ملصق' : state.journalReview?.sourceName;
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    showToast('حمّل سجل القيود أو الصق بيانات CSV أولًا.', 'error');
    return;
  }
  const review = analyzeJournalEntries(sanitizeRawRows(rows), journalParameters());
  invalidateApproval('إعادة تشغيل فحص قيود اليومية');
  persistJournalReview(review, sourceName);
  recordAuditEvent('JOURNAL_REVIEW_RUN', {
    sourceName: state.journalReview.sourceName,
    total: review.summary.total,
    flagged: review.summary.flagged,
    highRisk: review.summary.highRisk
  });
  saveState();
  renderAll();
  showToast(`تم فحص ${review.summary.total.toLocaleString('ar-SA')} قيدًا ووضع ${review.summary.flagged.toLocaleString('ar-SA')} في طابور المراجعة.`);
}

async function readJournalFile(file) {
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) {
    showToast('ملف القيود أكبر من 30 ميجابايت. قسّمه إلى ملفات أصغر.', 'error');
    return;
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  try {
    let rows;
    if (extension === 'csv' || file.type.includes('csv')) {
      rows = parseCsv(await file.text());
    } else if (['xlsx', 'xls'].includes(extension)) {
      const XLSX = await ensureXlsx();
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    } else {
      throw new Error('الصيغة غير مدعومة. استخدم CSV أو XLSX.');
    }
    runJournalReview(rows, file.name);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'تعذر قراءة سجل القيود.', 'error');
  }
}

function loadJournalDemo() {
  const rows = [
    { id: 'JE-2601', date: '2026-12-31', user: 'finance.manager', source: 'manual', amount: '250000', description: 'تسوية إقفال الإيرادات' },
    { id: 'JE-2602', date: '2026-12-26', user: 'temp.user', source: 'manual', amount: '100000', description: 'قيد طرف ذو علاقة' },
    { id: 'JE-2603', date: '2026-12-30', user: 'finance.manager', source: 'manual', amount: '48750.25', description: 'تسوية مخصص' },
    { id: 'JE-2604', date: '2026-12-15', user: 'erp.system', source: 'automatic', amount: '15874.34', description: 'ترحيل مبيعات يومي' },
    { id: 'JE-2605', date: '2026-12-16', user: 'erp.system', source: 'automatic', amount: '12410.18', description: 'ترحيل مبيعات يومي' },
    { id: 'JE-2606', date: '2026-12-17', user: 'erp.system', source: 'automatic', amount: '9340.55', description: 'ترحيل مشتريات يومي' },
    { id: 'JE-2607', date: '2026-11-10', user: 'accountant.a', source: 'automatic', amount: '8712.04', description: 'إهلاك شهري' },
    { id: 'JE-2608', date: '2026-11-11', user: 'accountant.a', source: 'automatic', amount: '6234.90', description: 'استحقاق رواتب' }
  ];
  $('#journalPeriodEnd').value = '2026-12-31';
  runJournalReview(rows, 'سجل قيود KOSIF التجريبي');
}

function renderJournal() {
  const review = runtime.journalReview;
  const summary = review?.summary ?? { total: 0, flagged: 0, highRisk: 0, pendingReview: 0 };
  $('#journalMetricTotal').textContent = summary.total.toLocaleString('ar-SA');
  $('#journalMetricFlagged').textContent = summary.flagged.toLocaleString('ar-SA');
  $('#journalMetricHigh').textContent = summary.highRisk.toLocaleString('ar-SA');
  $('#journalMetricPending').textContent = summary.pendingReview.toLocaleString('ar-SA');
  $('#journalSourceChip').className = `status-chip ${review ? 'success' : 'neutral'}`;
  $('#journalSourceChip').textContent = state.journalReview?.sourceName || 'لا يوجد مصدر';
  $('#journalReviewStatus').className = `status-chip ${review ? (summary.pendingReview ? 'warning' : 'success') : 'neutral'}`;
  $('#journalReviewStatus').textContent = review ? (summary.pendingReview ? 'تحتاج مراجعة' : 'مراجعة مكتملة') : 'لم يُنفذ';
  if (state.journalReview?.parameters?.periodEnd && !$('#journalPeriodEnd').value) $('#journalPeriodEnd').value = state.journalReview.parameters.periodEnd;

  const filter = $('#journalRiskFilter')?.value ?? 'flagged';
  const entries = (review?.entries ?? []).filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'flagged') return item.flags.length > 0;
    if (filter === 'pending') return item.flags.length > 0 && item.reviewStatus !== 'reviewed';
    return item.severity === filter;
  }).slice(0, 300);
  $('#journalTableBody').innerHTML = entries.length ? entries.map((item) => `
    <tr>
      <td><strong dir="ltr">${e(item.id)}</strong><br><small class="muted">${e(item.date || '—')} · ${e(item.description || 'بلا بيان')}</small></td>
      <td>${e(item.user)}<br><small class="muted">${e(item.source || 'غير محدد')}</small></td>
      <td class="number">${e(money(item.amountMinor))}</td>
      <td><span class="journal-score ${e(item.severity)}">${item.score}</span></td>
      <td><div class="journal-flags">${item.flags.length ? item.flags.map((flag) => `<span class="journal-flag" title="${e(flag.standard)}">${e(flag.label)}</span>`).join('') : '<span class="status-chip success">بلا إشارة</span>'}</div></td>
      <td><select class="table-status-select" data-journal-status="${e(item.id)}"><option value="unreviewed" ${item.reviewStatus !== 'reviewed' ? 'selected' : ''}>بانتظار المراجعة</option><option value="reviewed" ${item.reviewStatus === 'reviewed' ? 'selected' : ''}>تمت المراجعة</option></select></td>
    </tr>`).join('') : '<tr><td colspan="6"><div class="empty-state">لا توجد قيود مطابقة للتصفية.</div></td></tr>';
}

function renderStandards() {
  $('#frameworkGrid').innerHTML = FRAMEWORK_SUMMARIES.map((item) => `
    <article class="framework-card"><strong>${e(item.title)}</strong><p>${e(item.description)}</p><small>${e(item.warning)}</small></article>`).join('');
  $('#standardSourceGrid').innerHTML = STANDARD_SOURCES.map((source) => `
    <article class="source-card">
      <header><h3>${e(source.title)}</h3><span class="source-version">${e(source.version)}</span></header>
      <p>${e(source.note)}</p>
      <dl><dt>السريان</dt><dd dir="ltr">${e(source.effectiveFrom)}</dd><dt>النطاق</dt><dd>${e(source.jurisdiction)}</dd><dt>الاستخدام</dt><dd>${e(source.license)}</dd><dt>الحالة</dt><dd>${e(source.status)}</dd></dl>
    </article>`).join('');
  $('#standardsWatchList').innerHTML = SOCPA_2025_WATCH.map((item) => `
    <button type="button" class="standards-watch-item" data-standard-query="${e(item.code)}">
      <span class="standard-id">${e(item.code)}</span><span><strong>${e(item.titleAr)}</strong><small>${e(item.note)}</small></span><span class="status-chip ${item.status === 'adopted' || item.status === 'active' ? 'success' : 'warning'}">${e(item.effective || 'محلي')}</span>
    </button>`).join('');
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
      ${item.sourceId ? `<span class="standard-source-line">${e(item.sourceId)} · ساري من ${e(item.effectiveFrom)}</span>` : ''}
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
  const source = STANDARD_SOURCES.find((entry) => entry.id === item.sourceId);
  if (source) blocks.push(['المصدر والإصدار', `${source.title} — ${source.version} — ساري من ${item.effectiveFrom || source.effectiveFrom}. ${source.note}`]);
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
  invalidateApproval('إعادة توليد برنامج أوراق العمل');
  runtime.risks.forEach(buildWorkpaperForRisk);
  recordAuditEvent('WORKPAPER_PROGRAM_GENERATED', { workpapers: state.workpapers.length, risks: runtime.risks.length });
  analyzeRuntime();
  saveState();
  renderAll();
  showToast(`تم إنشاء ${state.workpapers.length} أوراق عمل وربطها بالمخاطر.`);
}

function renderWorkpapers() {
  const metrics = runtime.graph?.metrics ?? {};
  const riskCount = runtime.risks.length;
  const procedureCoverage = riskCount ? Math.round(((riskCount - (metrics.risksWithoutProcedure ?? riskCount)) / riskCount) * 100) : 0;
  const evidenceCoverage = riskCount ? Math.round(((riskCount - (metrics.risksWithoutEvidence ?? riskCount)) / riskCount) * 100) : 0;
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
  invalidateApproval('تحديث قائمة طلبات المستندات');
  const before = state.pbc.length;
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
  recordAuditEvent('PBC_BASELINE_CREATED', { added: state.pbc.length - before, total: state.pbc.length });
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

function evidenceSourceLabel(value) {
  return { external: 'خارجي مستقل', internal: 'نظام داخلي', management: 'الإدارة' }[value] ?? 'غير محدد';
}

function evidenceGradeLabel(value) {
  return { strong: 'قوي', adequate: 'كافٍ', limited: 'محدود', weak: 'ضعيف' }[value] ?? value;
}

function openEvidenceForm() {
  $('#evidenceForm').reset();
  $('#evidenceDateInput').value = new Date().toISOString().slice(0, 10);
  $('#evidenceRiskInput').innerHTML = '<option value="">بدون ربط</option>' + runtime.risks.slice(0, 300).map((risk) => `<option value="${e(risk.id)}">${e(risk.title)} — ${e(risk.accountName)}</option>`).join('');
  $('#evidenceWorkpaperInput').innerHTML = '<option value="">بدون ربط</option>' + state.workpapers.slice(0, 300).map((item) => `<option value="${e(item.id)}">${e(item.id)} — ${e(item.title)}</option>`).join('');
  $('#evidenceModal').showModal();
}

async function fingerprintFile(file) {
  if (!file) return null;
  if (file.size > 30 * 1024 * 1024) throw new Error('ملف الدليل أكبر من 30 ميجابايت. سجّل مرجعًا أخف أو قسّم الملف.');
  if (!globalThis.crypto?.subtle) return `fnv1a:${fnv1a(`${file.name}|${file.size}|${file.lastModified}`).toString(16)}`;
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function refreshEvidenceScores() {
  state.evidence = state.evidence.map((item) => ({ ...item, ...scoreEvidenceQuality(item) }));
}

function renderEvidence() {
  refreshEvidenceScores();
  const metrics = runtime.graph?.metrics ?? {};
  const reviewed = state.evidence.filter((item) => item.status === 'reviewed').length;
  $('#evidenceMetricTotal').textContent = state.evidence.length.toLocaleString('ar-SA');
  $('#evidenceMetricReviewed').textContent = reviewed.toLocaleString('ar-SA');
  $('#evidenceMetricQuality').textContent = `${metrics.averageEvidenceScore ?? 0}%`;
  $('#evidenceMetricOrphan').textContent = (metrics.orphanEvidence ?? 0).toLocaleString('ar-SA');

  $('#evidenceTableBody').innerHTML = state.evidence.length ? state.evidence.map((item) => {
    const quality = scoreEvidenceQuality(item);
    return `
      <tr>
        <td class="evidence-record-title"><strong>${e(item.title)}</strong><small>${e(item.fileName || 'بيانات وصفية فقط')} · ${e(item.documentDate || 'بلا تاريخ')}</small></td>
        <td>${e(evidenceSourceLabel(item.sourceType))}${item.obtainedDirectly ? '<br><small class="muted">مستلم مباشرة</small>' : ''}</td>
        <td><div class="evidence-links">${[...(item.riskIds ?? []), ...(item.workpaperIds ?? [])].length ? [...(item.riskIds ?? []), ...(item.workpaperIds ?? [])].map((id) => `<span class="table-tag">${e(id)}</span>`).join('') : '<span class="muted">بلا ربط</span>'}</div></td>
        <td><span class="evidence-grade ${e(quality.grade)}" title="${e(quality.gaps.join(' '))}">${quality.score}% · ${e(evidenceGradeLabel(quality.grade))}</span></td>
        <td><select class="table-status-select" data-evidence-status="${e(item.id)}"><option value="received" ${item.status === 'received' ? 'selected' : ''}>مستلم</option><option value="reviewed" ${item.status === 'reviewed' ? 'selected' : ''}>تمت مراجعته</option><option value="rejected" ${item.status === 'rejected' ? 'selected' : ''}>غير كافٍ</option></select></td>
        <td><div class="action-cell"><button type="button" data-delete-evidence="${e(item.id)}" aria-label="حذف الدليل"><svg><use href="#i-trash"/></svg></button></div></td>
      </tr>`;
  }).join('') : '<tr><td colspan="6"><div class="empty-state compact">لا توجد أدلة مسجلة.</div></td></tr>';

  const paths = runtime.risks.slice(0, 16);
  $('#evidencePathStatus').textContent = `${paths.length.toLocaleString('ar-SA')} مسار`;
  $('#evidencePathList').innerHTML = paths.length ? paths.map((risk) => {
    const workpaper = state.workpapers.find((item) => (item.riskIds ?? []).includes(risk.id));
    const linkedEvidence = state.evidence.filter((item) => (item.riskIds ?? []).includes(risk.id));
    const finding = state.findings.find((item) => item.riskId === risk.id);
    return `
      <article class="evidence-path">
        <header><h3>${e(risk.title)}</h3><span class="severity-chip ${e(risk.severity)}">${e(severityLabel(risk.severity))}</span></header>
        <p>${e(risk.accountCode)} — ${e(risk.accountName)}</p>
        <div class="trace-steps">
          <span class="trace-step">الحساب</span><span class="trace-arrow">←</span><span class="trace-step">${e(risk.id)}</span><span class="trace-arrow">←</span>
          <span class="trace-step ${workpaper ? '' : 'missing'}">${workpaper ? e(workpaper.id) : 'إجراء مفقود'}</span><span class="trace-arrow">←</span>
          <span class="trace-step ${linkedEvidence.length ? '' : 'missing'}">${linkedEvidence.length ? `${linkedEvidence.length} دليل` : 'دليل مفقود'}</span><span class="trace-arrow">←</span>
          <span class="trace-step ${finding ? '' : 'missing'}">${finding ? e(finding.id) : 'استنتاج مفقود'}</span>
        </div>
      </article>`;
  }).join('') : '<div class="empty-state">حلّل الميزان لتظهر مسارات الإثبات.</div>';
}

function renderCouncil() {
  const latest = state.councilRuns[0];
  const stanceClass = { clear: 'success', caution: 'warning', objection: 'danger', blocked: 'critical' };
  if (!latest || !latest.positions) {
    $('#councilOverview').innerHTML = '<div class="empty-state">اعقد جلسة بعد تحميل الميزان وتحديد الأهمية النسبية.</div>';
    $('#councilGrid').innerHTML = '';
    $('#councilConflicts').innerHTML = '';
    $('#councilAsks').innerHTML = '<div class="empty-state compact">لا طلبات بعد.</div>';
  } else {
    const counts = ['blocked', 'objection', 'caution', 'clear'].map((stance) => [stance, latest.positions.filter((item) => item.stance === stance).length]);
    $('#councilOverview').innerHTML = `
      <article class="council-result">
        <div class="agreement-meter" data-verdict="${e(latest.verdict)}"><strong>${latest.consensus}%</strong><span>مؤشر توافق استشاري</span></div>
        <div class="council-conclusion"><span class="status-chip ${{ blocked: 'danger', objections: 'danger', cautions: 'warning', clear: 'success' }[latest.verdict]}">${e(councilVerdictLabel(latest.verdict))}</span><h2>${e(latest.verdictText)}</h2><p>${e(formatDate(latest.createdAt))} · ${e(latest.id)} · ${e(latest.authority)}</p>
          <div class="stance-strip">${counts.map(([stance, count]) => `<span class="stance-pill ${stanceClass[stance]}"><strong>${count}</strong>${e(stanceLabel(stance))}</span>`).join('')}</div></div>
      </article>`;
    $('#councilConflicts').innerHTML = latest.conflicts.length ? `<div class="conflict-head"><span class="eyebrow">حالات نزاع</span><h2>${latest.conflicts.length} تعارض بين المقاعد يحتاج حسمًا بشريًا</h2></div>` + latest.conflicts.map((conflict) => `
      <article class="conflict-card ${conflict.resolution ? 'resolved' : ''}">
        <div class="conflict-seats"><span>${e(conflict.titles[0])}</span><i>⇄</i><span>${e(conflict.titles[1])}</span></div>
        <p>${e(conflict.reason)}</p>
        ${conflict.resolution ? `<div class="decision-note ${conflict.resolution.decision === 'uphold' ? 'danger' : 'success'}">حسم ${e(conflict.resolution.reviewer)} — ${conflict.resolution.decision === 'uphold' ? 'تأييد الاعتراض' : 'تجاوز الاعتراض بمبرر'}: ${e(conflict.resolution.note)}<small>${e(formatDate(conflict.resolution.recordedAt))}</small></div>`
          : `<div class="hero-actions compact"><button class="button secondary small" data-resolve-conflict="${e(conflict.id)}" data-decision="uphold">أؤيد الاعتراض</button><button class="button ghost small" data-resolve-conflict="${e(conflict.id)}" data-decision="override">أتجاوزه بمبرر موثق</button></div>`}
      </article>`).join('') : '';
    $('#councilGrid').innerHTML = latest.positions.map((seat) => `
      <article class="council-seat" data-stance="${e(seat.stance)}">
        <header><div><h2>${e(seat.title)}</h2><small>${e(seat.domain)}</small></div><span class="status-chip ${stanceClass[seat.stance]}">${e(stanceLabel(seat.stance))}</span></header>
        <p>${e(seat.statement)}</p>
        ${seat.basis.length ? `<div class="seat-basis">${seat.basis.map((item) => `<span>${e(item)}</span>`).join('')}</div>` : ''}
        ${seat.asks.length ? `<ul class="seat-asks">${seat.asks.map((item) => `<li>${e(item)}</li>`).join('')}</ul>` : ''}
      </article>`).join('');
    $('#councilAsks').innerHTML = latest.asks.length ? latest.asks.map((ask, index) => `<div class="ask-item"><span class="tree-index">${index + 1}</span><span>${e(ask)}</span></div>`).join('') : '<div class="empty-state compact">لا طلبات مفتوحة من المقاعد.</div>';
  }
  $('#councilHistory').innerHTML = state.councilRuns.length ? state.councilRuns.slice(0, 8).map((run) => `
    <div class="compact-item"><span class="status-chip ${run.blockers?.length ? 'warning' : 'success'}">${run.consensus ?? run.agreement}%</span><span><strong>${e(formatDate(run.createdAt))}</strong><span>${run.conflicts ? `${run.conflicts.length} نزاع · ${run.conflicts.filter((item) => item.resolution).length} محسوم` : `${run.blockers?.length ?? 0} موانع`}</span></span><span>${e(run.id)}</span></div>`).join('') : '<div class="empty-state compact">لا توجد جلسات محفوظة.</div>';
  $('#contractGrid').innerHTML = SEAT_CONTRACTS.map((seat) => `
    <article class="contract-card"><h3>${e(seat.title)}</h3><small>${e(seat.domain)}</small><div class="contract-cols"><div><span class="eyebrow">يستطيع</span><ul>${seat.may.map((item) => `<li>${e(item)}</li>`).join('')}</ul></div><div><span class="eyebrow">لا يستطيع</span><ul class="deny">${seat.mayNot.map((item) => `<li>${e(item)}</li>`).join('')}</ul></div></div></article>`).join('');
}

function reportGateData() {
  const openHigh = runtime.risks.filter((risk) => ['critical', 'high'].includes(risk.severity) && risk.status === 'open').length;
  const unresolvedCritical = state.findings.filter((finding) => finding.severity === 'critical' && !['adjusted', 'closed', 'passed'].includes(finding.status)).length;
  const eventChain = verifyAuditEventChain(state.auditEvents);
  return [
    { label: 'الميزان متزن', pass: Boolean(runtime.analysis?.balanced) },
    { label: 'الأهمية محددة', pass: Boolean(runtime.materiality?.overall > 0n) },
    { label: 'المخاطر العالية مستجاب لها', pass: runtime.risks.length > 0 && openHigh === 0 },
    { label: 'القيود المعلّمة تمت مراجعتها', pass: Boolean(runtime.journalReview?.summary.total > 0 && runtime.journalReview.summary.pendingReview === 0) },
    { label: 'كل خطر مدعوم بدليل مراجع قابل للتتبع', pass: runtime.risks.length > 0 && runtime.graph?.metrics.risksWithoutReviewedEvidence === 0 },
    { label: 'لا نتائج حرجة مفتوحة', pass: unresolvedCritical === 0 },
    { label: 'سلسلة الأحداث سليمة', pass: eventChain.valid && eventChain.checked > 0 },
    { label: 'الاعتماد البشري مسجل', pass: Boolean(state.approval), action: true }
  ];
}

function auditEventLabel(type) {
  return {
    VOICE_SESSION_STARTED: 'بدء جلسة صوتية', VOICE_SESSION_ENDED: 'إنهاء جلسة صوتية', COUNCIL_SESSION_CONVENED: 'انعقاد مجلس المراجعين', COUNCIL_CONFLICT_RESOLVED: 'حسم نزاع في المجلس', OPINION_INPUTS_CHANGED: 'تغيير مدخلات الرأي', OPINION_DRAFT_ACCEPTED: 'اعتماد مبدئي لمسودة الرأي', OPINION_DRAFT_REJECTED: 'رفض مسودة الرأي', STATEMENTS_EXPORTED: 'تصدير القوائم المشتقة',
    ENGAGEMENT_WORKSPACE_OPENED: 'فتح مساحة الارتباط',
    ENGAGEMENT_ENTITY_CHANGED: 'تغيير بيانات المنشأة',
    TRIAL_BALANCE_IMPORTED: 'استيراد ميزان المراجعة',
    MATERIALITY_RECORDED: 'تسجيل إصدار الأهمية',
    RISK_RESPONSE_RECORDED: 'تسجيل استجابة خطر',
    JOURNAL_REVIEW_RUN: 'تشغيل فحص القيود',
    JOURNAL_ENTRY_REVIEW_STATUS_CHANGED: 'مراجعة قيد يومية',
    WORKPAPER_PROGRAM_GENERATED: 'توليد برنامج العمل',
    WORKPAPER_STATUS_CHANGED: 'تحديث ورقة عمل',
    PBC_BASELINE_CREATED: 'إنشاء قائمة PBC',
    PBC_REQUEST_CREATED: 'إضافة طلب مستند',
    PBC_STATUS_CHANGED: 'تحديث طلب مستند',
    EVIDENCE_REGISTERED: 'تسجيل دليل',
    EVIDENCE_STATUS_CHANGED: 'مراجعة دليل',
    EVIDENCE_REMOVED: 'حذف سجل دليل',
    FINDING_RECORDED: 'تسجيل نتيجة',
    FINDING_REMOVED: 'حذف نتيجة',
    COUNCIL_REVIEW_RUN: 'تشغيل المجلس الاستشاري',
    HUMAN_REVIEW_RECORDED: 'تسجيل المراجعة البشرية',
    HUMAN_REVIEW_INVALIDATED: 'إبطال اعتماد سابق',
    ARCHIVE_SNAPSHOT_CREATED: 'إنشاء لقطة أرشيف'
  }[type] ?? type;
}

function renderReports() {
  const gates = reportGateData();
  $('#reportGates').innerHTML = gates.map((gate) => `
    <div class="report-gate ${gate.pass ? 'pass' : 'fail'}"><svg><use href="#${gate.pass ? 'i-check' : 'i-x'}"/></svg><span>${e(gate.label)}</span>${gate.action && !gate.pass ? '<button class="text-button" id="recordApprovalButton" type="button">تسجيل</button>' : ''}</div>`).join('');
  $('#reportEntity').textContent = state.engagement.entity;
  $('#reportPeriod').textContent = state.engagement.period;
  $('#reportStatus').textContent = state.approval ? `مراجعة بشرية مسجلة — ${state.approval.reviewer}` : 'مسودة — غير معتمدة';
  const initialChain = verifyAuditEventChain(state.auditEvents);
  $('#auditTrailStatus').className = `status-chip ${initialChain.valid ? 'success' : 'danger'}`;
  $('#auditTrailStatus').textContent = initialChain.valid ? `${initialChain.checked.toLocaleString('ar-SA')} حدثًا سليمة` : `كسر عند الحدث ${initialChain.brokenAt}`;
  $('#auditEventList').innerHTML = state.auditEvents.length ? [...state.auditEvents].reverse().slice(0, 10).map((item) => `
    <div class="audit-event"><span class="audit-sequence">#${item.sequence}</span><span><strong>${e(auditEventLabel(item.type))}</strong><small>${e(item.actor)} · ${e(formatDate(item.timestamp))}</small></span><code>${e(item.hash)}</code></div>`).join('') : '<div class="empty-state compact">لا توجد أحداث مسجلة.</div>';
  const high = runtime.risks.filter((risk) => ['critical', 'high'].includes(risk.severity)).length;
  const openFindings = state.findings.filter((finding) => !['closed', 'adjusted', 'passed'].includes(finding.status)).length;
  const readiness = calculateReadiness();
  $('#reportKpis').innerHTML = [
    ['الحسابات', runtime.analysis?.metrics.accounts ?? 0],
    ['المخاطر المرتفعة', high],
    ['قيود تنتظر المراجعة', runtime.journalReview?.summary.pendingReview ?? 0],
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
  const analytics = runtime.analytics;
  $('#reportAnalytics').innerHTML = analytics ? [
    ['إجمالي الأصول', money(analytics.statements.sfp.totalAssets)],
    ['إجمالي الالتزامات', money(analytics.statements.sfp.totalLiabilities)],
    ['حقوق الملكية', money(analytics.statements.sfp.equity.total)],
    [analytics.statements.pl.profit >= 0n ? 'صافي الربح' : 'صافي الخسارة', money(analytics.statements.pl.profit)],
    ['المعادلة المحاسبية', analytics.statements.checks.equationHolds ? 'محققة' : 'غير محققة'],
    ['بنفورد (MAD)', `${analytics.benfordBalances.mad} — ${conformityLabel(analytics.benfordBalances.conformity)}`],
    ['مؤشرات الاستمرارية', `${analytics.goingConcern.filter((item) => item.hit).length} من ${analytics.goingConcern.length}`],
    ['التعرض غير المصحح', `${money(analytics.misstatements.exposure)} — ${misstatementVerdictLabel(analytics.misstatements.verdict)}`]
  ].map(([label, value]) => `<div><span>${e(label)}</span><strong>${e(value)}</strong></div>`).join('') : '<p class="muted">لا توجد بيانات.</p>';
  const latestCouncil = state.councilRuns[0];
  $('#reportCouncil').innerHTML = latestCouncil?.positions ? `<p><strong>${e(councilVerdictLabel(latestCouncil.verdict))}</strong> — توافق ${latestCouncil.consensus}٪ · ${latestCouncil.conflicts.length} نزاع (${latestCouncil.conflicts.filter((item) => item.resolution).length} محسوم). ${e(latestCouncil.verdictText)}</p>${latestCouncil.positions.filter((item) => item.stance !== 'clear').map((item) => `<div class="report-finding-row"><span><strong>${e(item.title)}</strong><span>${e(item.statement)}</span></span><span>${e(stanceLabel(item.stance))}</span></div>`).join('')}` : '<p class="muted">لم تُعقد جلسة مجلس.</p>';
  const opinion = runtime.opinion;
  $('#reportOpinion').innerHTML = opinion ? `<p><strong>${e(opinion.label)}</strong> — ${e(opinion.standard)}. ${opinion.basis.map((item) => e(item)).join(' ')}${opinion.emphasis ? ` ${e(opinion.emphasis)}` : ''}</p><p class="muted">${state.opinion.decision ? opinionDecisionLabel(state.opinion.decision) : 'مسودة آلية لم يُسجل المراجع موقفًا منها بعد؛ لا تمثل رأي مراجعة.'}</p>` : '';
  const eventChain = verifyAuditEventChain(state.auditEvents);
  $('#reportProvenance').innerHTML = [
    ['أحداث السجل', state.auditEvents.length.toLocaleString('ar-SA')],
    ['سلامة السلسلة', eventChain.valid ? 'سليمة' : `كسر عند ${eventChain.brokenAt}`],
    ['إصدارات الأهمية', state.materialityRevisions.length.toLocaleString('ar-SA')],
    ['الأدلة المسجلة', state.evidence.length.toLocaleString('ar-SA')],
    ['مصدر الميزان', state.sourceName || 'غير مسجل'],
    ['المرجع المحلي', 'SOCPA 2025']
  ].map(([label, value]) => `<div><span>${e(label)}</span><strong>${e(value)}</strong></div>`).join('');
  const canArchive = gates.every((gate) => gate.pass);
  $('#archiveSnapshotButton').disabled = !canArchive;
  $('#archiveSnapshotButton').title = canArchive ? 'إنشاء حزمة أرشيف قابلة للتحقق' : 'أكمل جميع البوابات أولًا';
}

function ratioValue(item) {
  if (item.value === null || item.value === undefined) return '—';
  const number = item.unit === 'يوم' ? Math.round(item.value).toLocaleString('ar-SA') : item.value.toLocaleString('ar-SA', { maximumFractionDigits: 2 });
  return item.unit === '%' ? `${number}٪` : item.unit === 'x' ? `${number}×` : `${number} ${item.unit}`;
}

function statementSection(section, { emphasize = false } = {}) {
  const lines = section.lines.length ? section.lines.map((line) => `
    <div class="statement-line"><span>${e(line.category)}<small>${line.accounts.toLocaleString('ar-SA')} حساب</small></span><strong class="number ${line.amount < 0n ? 'negative' : ''}">${e(money(line.amount))}</strong></div>`).join('') : '<div class="statement-line muted"><span>لا توجد بنود</span><strong>—</strong></div>';
  return `<div class="statement-section ${emphasize ? 'emphasize' : ''}"><div class="statement-head"><span>${e(section.label)}</span><strong class="number">${e(money(section.total))}</strong></div>${lines}</div>`;
}

function renderAnalytics() {
  const snapshot = runtime.analytics;
  $('#analyticsEmpty').hidden = Boolean(snapshot);
  $('#analyticsLayout').hidden = !snapshot;
  $('#analyticsBadge').textContent = snapshot ? snapshot.ratios.filter((item) => ['danger', 'warning'].includes(item.status)).length.toLocaleString('ar-SA') : '0';
  if (!snapshot) return;
  const { statements, ratios, benfordBalances, goingConcern, saudi } = snapshot;
  const { sfp, pl, checks, unclassified } = statements;

  $('#equationStrip').innerHTML = [
    ['الأصول', money(sfp.totalAssets), ''],
    ['=', '', 'operator'],
    ['الالتزامات', money(sfp.totalLiabilities), ''],
    ['+', '', 'operator'],
    ['حقوق الملكية', money(sfp.equity.total), ''],
    ['+', '', 'operator'],
    [pl.profit >= 0n ? 'ربح الفترة' : 'خسارة الفترة', money(pl.profit), pl.profit < 0n ? 'negative' : ''],
    [checks.equationHolds ? '✓ المعادلة محققة' : `فرق ${money(checks.equationDelta)}`, unclassified.count ? `${unclassified.count.toLocaleString('ar-SA')} حساب غير مصنف بصافي ${money(unclassified.net)}` : 'كل الحسابات مصنفة', checks.equationHolds ? 'verdict pass' : 'verdict fail']
  ].map(([label, value, cls]) => `<div class="equation-cell ${cls}"><span>${e(label)}</span>${value ? `<strong>${e(value)}</strong>` : ''}</div>`).join('');

  $('#sfpChip').textContent = `${sfp.currentAssets.count + sfp.nonCurrentAssets.count + sfp.currentLiabilities.count + sfp.nonCurrentLiabilities.count + sfp.equity.count} حساب`;
  $('#sfpBody').innerHTML = statementSection(sfp.currentAssets) + statementSection(sfp.nonCurrentAssets)
    + `<div class="statement-total"><span>إجمالي الأصول</span><strong class="number">${e(money(sfp.totalAssets))}</strong></div>`
    + statementSection(sfp.currentLiabilities) + statementSection(sfp.nonCurrentLiabilities)
    + `<div class="statement-total"><span>إجمالي الالتزامات</span><strong class="number">${e(money(sfp.totalLiabilities))}</strong></div>`
    + statementSection(sfp.equity, { emphasize: true });
  $('#plChip').textContent = pl.profit >= 0n ? 'ربح' : 'خسارة';
  $('#plChip').className = `status-chip ${pl.profit >= 0n ? 'success' : 'danger'}`;
  $('#plBody').innerHTML = statementSection(pl.revenue) + statementSection(pl.expenses)
    + `<div class="statement-total ${pl.profit < 0n ? 'negative' : ''}"><span>${pl.profit >= 0n ? 'صافي الربح' : 'صافي الخسارة'}</span><strong class="number">${e(money(pl.profit))}</strong></div>`;

  $('#ratioGrid').innerHTML = ratios.map((item) => `
    <article class="ratio-card" data-status="${e(item.status)}">
      <span class="ratio-label">${e(item.label)}</span>
      <strong class="ratio-value">${e(ratioValue(item))}</strong>
      <code class="ratio-formula">${e(item.formula)}</code>
      <small>${e(item.note)}</small>
    </article>`).join('');

  const chartHeight = 150;
  const maxPct = Math.max(35, ...benfordBalances.digits.map((item) => Math.max(item.observed, item.expected)));
  $('#benfordChart').innerHTML = `
    <svg viewBox="0 0 420 ${chartHeight + 36}" class="benford-svg" role="img" aria-label="توزيع الرقم الأول مقارنة بمنحنى بنفورد">
      ${benfordBalances.digits.map((item, index) => {
        const x = 20 + index * 44;
        const obs = (item.observed / maxPct) * chartHeight;
        const exp = (item.expected / maxPct) * chartHeight;
        const hot = benfordBalances.suspicious.includes(item.digit);
        return `<rect x="${x}" y="${chartHeight - obs + 8}" width="26" height="${obs}" rx="5" class="bar ${hot ? 'hot' : ''}"><title>الرقم ${item.digit}: ملاحظ ${item.observed}% · متوقع ${item.expected}%</title></rect>
          <line x1="${x - 4}" x2="${x + 30}" y1="${chartHeight - exp + 8}" y2="${chartHeight - exp + 8}" class="expected"/>
          <text x="${x + 13}" y="${chartHeight + 28}" text-anchor="middle" class="axis">${item.digit}</text>`;
      }).join('')}
    </svg>
    <div class="benford-legend"><span><i class="bar"></i>ملاحظ</span><span><i class="line"></i>بنفورد المتوقع</span><span><i class="bar hot"></i>انحراف &gt; 3 نقاط</span></div>`;
  $('#benfordChip').className = `status-chip ${{ close: 'success', acceptable: 'success', marginal: 'warning', nonconformity: 'danger', insufficient: 'neutral' }[benfordBalances.conformity]}`;
  $('#benfordChip').textContent = `MAD ${benfordBalances.mad}`;
  $('#benfordNote').textContent = `${benfordBalances.total.toLocaleString('ar-SA')} قيمة. ${conformityLabel(benfordBalances.conformity)}. أرصدة الميزان تجميعية بطبيعتها؛ الاختبار الأقوى يكون على قيود اليومية أو الفواتير.`;

  const hits = goingConcern.filter((item) => item.hit);
  $('#goingConcernChip').className = `status-chip ${hits.length >= 2 ? 'danger' : hits.length ? 'warning' : 'success'}`;
  $('#goingConcernChip').textContent = `${hits.length.toLocaleString('ar-SA')} من ${goingConcern.length}`;
  $('#goingConcernList').innerHTML = goingConcern.map((item) => `
    <div class="indicator ${item.hit ? 'hit' : ''}"><svg><use href="#${item.hit ? 'i-alert' : 'i-check'}"/></svg><span>${e(item.label)}<small>${e(item.ref)}</small></span></div>`).join('')
    + `<p class="muted small">المؤشرات لا تعني وجود عدم تأكد جوهري؛ تقييم الإدارة ومدة الاثني عشر شهرًا وخطط التمويل تُفحص في ورقة عمل الاستمرارية.</p>`;

  $('#saudiGrid').innerHTML = `
    <div class="saudi-card" data-status="${e(saudi.vat.status)}">
      <span class="eyebrow">ضريبة القيمة المضافة — 15٪</span>
      <div class="saudi-rows">
        <div><span>الإيراد × 15٪ (مخرجات متوقعة)</span><strong class="number">${e(money(saudi.vat.expectedOutput))}</strong></div>
        <div><span>صافي حسابات الضريبة المسجلة (${saudi.vat.accounts.toLocaleString('ar-SA')} حساب)</span><strong class="number">${e(money(saudi.vat.recorded))}</strong></div>
        <div><span>الفرق</span><strong class="number">${e(money(saudi.vat.variance))}${saudi.vat.variancePct !== null ? ` (${saudi.vat.variancePct.toLocaleString('ar-SA')}٪)` : ''}</strong></div>
      </div>
      <small>${saudi.vat.status === 'no-account' ? 'لم يُعثر على حساب ضريبة القيمة المضافة في الميزان؛ افحص اكتمال دليل الحسابات.' : e(saudi.vat.note)}</small>
    </div>
    <div class="saudi-card" data-status="neutral">
      <span class="eyebrow">تقدير الوعاء الزكوي — 2.5٪</span>
      <div class="saudi-rows">
        <div><span>الوعاء التقريبي</span><strong class="number">${e(money(saudi.zakat.base))}</strong></div>
        <div><span>الزكاة التقديرية</span><strong class="number">${e(money(saudi.zakat.estimate))}</strong></div>
      </div>
      <small>${e(saudi.zakat.note)}</small>
    </div>`;
}

function opinionDecisionLabel(decision) {
  if (!decision) return '';
  return decision.accepted
    ? `اعتمد ${e(decision.reviewer)} المسودة كموقف مبدئي في ${e(formatDate(decision.recordedAt))} — الرأي النهائي يظل مسؤولية المراجع الموقّع.`
    : `رفض ${e(decision.reviewer)} المسودة: ${e(decision.reason)}`;
}

function renderOpinion() {
  const misstatements = runtime.analytics?.misstatements;
  const opinion = runtime.opinion;
  $('#opinionScope').value = state.opinion.scope;
  $('#opinionGoingConcern').value = state.opinion.goingConcern;
  $('#opinionPervasive').checked = Boolean(state.opinion.pervasive);
  $('#opinionBadge').textContent = { unmodified: '✓', qualified: '!', adverse: '✕', disclaimer: '?', blocked: '—' }[opinion?.code] ?? '—';

  if (!misstatements) {
    $('#misstatementChip').textContent = 'بانتظار البيانات';
    $('#misstatementMeter').innerHTML = '';
    $('#misstatementBuckets').innerHTML = '';
    $('#misstatementTableBody').innerHTML = '<tr><td colspan="4"><div class="empty-state compact">حمّل الميزان وحدد الأهمية النسبية.</div></td></tr>';
  } else {
    const chipClass = { material: 'danger', approaching: 'warning', below: 'success', 'no-materiality': 'neutral' }[misstatements.verdict];
    $('#misstatementChip').className = `status-chip ${chipClass}`;
    $('#misstatementChip').textContent = misstatementVerdictLabel(misstatements.verdict);
    const pct = Math.min(100, misstatements.overallRatio ?? 0);
    const perfPct = misstatements.overall > 0n ? Number((misstatements.performance * 100n) / misstatements.overall) : 70;
    $('#misstatementMeter').innerHTML = `
      <div class="meter-track"><div class="meter-fill" data-verdict="${e(misstatements.verdict)}" style="width:${pct}%"></div><i class="meter-mark" style="right:${perfPct}%" title="أهمية الأداء"></i><i class="meter-mark overall" style="right:100%" title="الأهمية الإجمالية"></i></div>
      <div class="meter-labels"><span>التعرض غير المصحح: <strong>${e(money(misstatements.exposure))}</strong>${misstatements.overallRatio !== null ? ` — ${misstatements.overallRatio.toLocaleString('ar-SA')}٪ من الأهمية الإجمالية` : ''}</span><span>أهمية الأداء ${e(money(misstatements.performance))} · الإجمالية ${e(money(misstatements.overall))}</span></div>`;
    $('#misstatementBuckets').innerHTML = [
      ['مصححة', misstatements.corrected, 'success'],
      ['غير مصححة ومقيّمة', misstatements.uncorrected, 'warning'],
      ['بانتظار قرار', misstatements.pending, 'info'],
      ['واضحة التفاهة', misstatements.trivial, 'neutral']
    ].map(([label, value, cls]) => `<div class="bucket ${cls}"><span>${e(label)}</span><strong class="number">${e(money(value))}</strong></div>`).join('');
    const bucketLabel = { corrected: 'مصححة', uncorrected: 'غير مصححة', pending: 'بانتظار قرار', trivial: 'واضحة التفاهة' };
    $('#misstatementTableBody').innerHTML = misstatements.rows.length ? misstatements.rows.map((row) => `
      <tr><td><strong>${e(row.title)}</strong></td><td><span class="status-chip ${{ corrected: 'success', uncorrected: 'warning', pending: 'info', trivial: 'neutral' }[row.bucket]}">${e(bucketLabel[row.bucket])}</span></td><td class="number">${e(money(row.amount))}</td><td>${e(statusLabel(row.status))}</td></tr>`).join('')
      : '<tr><td colspan="4"><div class="empty-state compact">لا توجد نتائج مسجلة بعد. تُسجل التحريفات من شاشة المخاطر والنتائج.</div></td></tr>';
  }

  $('#opinionLabel').textContent = opinion?.label ?? '—';
  $('#opinionStandard').textContent = opinion?.standard ?? '';
  $('#opinionCard').dataset.code = opinion?.code ?? 'blocked';
  $('#opinionBasis').innerHTML = [...(opinion?.basis ?? []), ...(opinion?.emphasis ? [opinion.emphasis] : [])].map((item) => `<li>${e(item)}</li>`).join('');
  const steps = [
    ['الميزان متزن؟', Boolean(runtime.analysis?.balanced)],
    ['أدلة كافية ومناسبة؟', state.opinion.scope === 'none'],
    ['التحريفات غير المصححة دون الأهمية النسبية؟', misstatements?.verdict !== 'material'],
    ['الاستمرارية بلا عدم تأكد أو مع إفصاح كافٍ؟', !['inadequate-disclosure', 'unable-to-conclude'].includes(state.opinion.goingConcern)],
    ['الأثر غير منتشر؟', !(state.opinion.pervasive || state.opinion.scope === 'pervasive')]
  ];
  $('#opinionTree').innerHTML = steps.map(([label, pass], index) => `<div class="tree-step ${pass ? 'pass' : 'fail'}"><span class="tree-index">${index + 1}</span><span>${e(label)}</span><svg><use href="#${pass ? 'i-check' : 'i-x'}"/></svg></div>`).join('');
  $('#opinionDecision').innerHTML = state.opinion.decision ? `<div class="decision-note ${state.opinion.decision.accepted ? 'success' : 'danger'}">${opinionDecisionLabel(state.opinion.decision)}</div>` : '<div class="decision-note neutral">لم يُسجل موقف بشري تجاه هذه المسودة بعد.</div>';
  $('#opinionAcceptButton').disabled = !opinion || opinion.code === 'blocked';
}

const PALETTE_COMMANDS = [
  { id: 'demo', label: 'تحميل 5000 حساب تجريبي', hint: 'بيانات حتمية ببذرة ثابتة', keys: 'demo', run: () => loadDemo() },
  { id: 'theme', label: 'تبديل المظهر الفاتح/الداكن', hint: 'تفضيل محلي', keys: 'theme', run: () => $('#themeButton').click() },
  { id: 'export', label: 'تصدير حزمة JSON', hint: 'حزمة الارتباط بلا أسرار', keys: 'export json', run: () => $('#exportJsonButton').click() },
  { id: 'print', label: 'طباعة / PDF التقرير', hint: 'مسودة تقرير الارتباط', keys: 'print pdf', run: () => { openView('reports'); setTimeout(() => window.print(), 250); } }
];

function paletteItems(query = '') {
  const q = normalizeText(query);
  const views = $$('#mainNav .nav-item').map((button) => ({
    id: `view:${button.dataset.view}`,
    label: button.querySelector('span')?.textContent ?? button.dataset.view,
    hint: 'الانتقال إلى الشاشة',
    keys: button.dataset.view,
    run: () => openView(button.dataset.view)
  }));
  const standards = STANDARDS.slice(0, 200).map((standard) => ({
    id: `std:${standard.id}`,
    label: `${standard.code} — ${standard.title}`,
    hint: 'فتح بطاقة المعيار',
    keys: `${standard.code} ${standard.title}`,
    run: () => { openView('standards'); openStandard(standard.id); }
  }));
  const all = [...views, ...PALETTE_COMMANDS, ...standards];
  if (!q) return all.slice(0, 12);
  return all.filter((item) => normalizeText(`${item.label} ${item.keys}`).includes(q)).slice(0, 12);
}

function renderPalette() {
  const items = paletteItems($('#paletteInput').value);
  runtime.paletteItems = items;
  runtime.paletteIndex = Math.min(runtime.paletteIndex, Math.max(0, items.length - 1));
  $('#paletteList').innerHTML = items.length ? items.map((item, index) => `
    <button type="button" role="option" class="palette-item ${index === runtime.paletteIndex ? 'active' : ''}" data-palette-index="${index}"><span>${e(item.label)}</span><small>${e(item.hint)}</small></button>`).join('') : '<div class="empty-state compact">لا نتائج.</div>';
}

function openPalette() {
  runtime.paletteIndex = 0;
  $('#paletteInput').value = '';
  renderPalette();
  $('#paletteDialog').showModal();
  $('#paletteInput').focus();
}

function runPaletteItem(index) {
  const item = runtime.paletteItems?.[index];
  if (!item) return;
  $('#paletteDialog').close();
  item.run();
}

function exportStatementsCsv() {
  const snapshot = runtime.analytics;
  if (!snapshot) return showToast('لا توجد قوائم لتصديرها.', 'error');
  const { sfp, pl } = snapshot.statements;
  const sections = [sfp.currentAssets, sfp.nonCurrentAssets, sfp.currentLiabilities, sfp.nonCurrentLiabilities, sfp.equity, pl.revenue, pl.expenses];
  const rows = sections.flatMap((section) => [
    ...section.lines.map((line) => ({ statement: section.statement === 'sfp' ? 'المركز المالي' : 'الربح أو الخسارة', section: section.label, line: line.category, accounts: line.accounts, amount: formatMoneyMinor(line.amount, state.engagement.currency, 'en-US') })),
    { statement: section.statement === 'sfp' ? 'المركز المالي' : 'الربح أو الخسارة', section: section.label, line: 'الإجمالي', accounts: section.count, amount: formatMoneyMinor(section.total, state.engagement.currency, 'en-US') }
  ]);
  downloadBlob(`\uFEFF${rowsToCsv(rows)}`, `kosif-statements-${Date.now()}.csv`, 'text/csv;charset=utf-8');
  recordAuditEvent('STATEMENTS_EXPORTED', { lines: rows.length });
  saveState();
  showToast('تم تصدير القوائم المشتقة.');
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
  renderJournal();
  renderStandards();
  renderWorkpapers();
  renderPbc();
  renderEvidence();
  renderCouncil();
  renderAnalytics();
  renderOpinion();
  renderReports();
  renderKnowledge();
  studio?.render();
}

function studioContext() {
  return { engagement: state.engagement, analysis: runtime.analysis, materiality: runtime.materiality, risks: runtime.risks, evidence: state.evidence, workpapers: state.workpapers, pbc: state.pbc, findings: state.findings, journalReview: runtime.journalReview, analytics: runtime.analytics, opinion: runtime.opinion, graph: runtime.graph, gates: reportGateData(), council: state.councilRuns[0] ?? null };
}

function packageExport() {
  const eventChain = verifyAuditEventChain(state.auditEvents);
  return {
    product: 'KOSIF Audit Studio',
    schemaVersion: STATE_VERSION,
    exportedAt: new Date().toISOString(),
    engagement: state.engagement,
    sourceName: state.sourceName,
    rawRows: state.rawRows,
    materiality: state.materiality,
    materialityRevisions: state.materialityRevisions,
    riskDecisions: state.riskDecisions,
    opinion: { inputs: { scope: state.opinion.scope, goingConcern: state.opinion.goingConcern, pervasive: state.opinion.pervasive }, draft: runtime.opinion, decision: state.opinion.decision },
    computed: runtime.analysis ? {
      totalDebitMinor: runtime.analysis.totalDebit.toString(),
      totalCreditMinor: runtime.analysis.totalCredit.toString(),
      imbalanceMinor: runtime.analysis.imbalance.toString(),
      balanced: runtime.analysis.balanced,
      risks: runtime.risks.map((risk) => ({ ...risk, amount: risk.amount.toString() })),
      evidenceGraph: runtime.graph,
      journalReview: runtime.journalReview ? {
        ...runtime.journalReview,
        entries: runtime.journalReview.entries.map((item) => ({ ...item, amountMinor: item.amountMinor.toString() }))
      } : null
    } : null,
    workpapers: state.workpapers,
    findings: state.findings,
    pbc: state.pbc,
    evidence: state.evidence,
    archiveSnapshots: state.archiveSnapshots,
    councilRuns: state.councilRuns,
    studio: state.studio,
    approval: state.approval,
    auditTrail: { events: state.auditEvents, verification: eventChain },
    standardsRegistry: STANDARD_SOURCES,
    guardrails: {
      automatedPosting: false,
      automatedOpinion: false,
      humanApprovalRequired: true,
      officialStandardsVerificationRequired: true
    }
  };
}

function createArchiveSnapshot() {
  const gates = reportGateData();
  if (!gates.every((gate) => gate.pass)) {
    showToast('لا يمكن إنشاء لقطة الأرشيف قبل اكتمال جميع البوابات.', 'error');
    return;
  }
  const createdAt = new Date().toISOString();
  recordAuditEvent('ARCHIVE_SNAPSHOT_CREATED', {
    createdAt,
    reviewer: state.approval?.reviewer,
    sourceName: state.sourceName,
    eventCountBeforeArchive: state.auditEvents.length
  });
  const archive = packageExport();
  const serialized = JSON.stringify(archive, null, 2);
  const snapshot = {
    id: `ARC-${fnv1a(`${createdAt}|${serialized.length}`).toString(16).toUpperCase()}`,
    createdAt,
    reviewer: state.approval.reviewer,
    contentHash: `fnv1a:${fnv1a(serialized).toString(16).padStart(8, '0')}`,
    eventCount: state.auditEvents.length
  };
  state.archiveSnapshots.push(snapshot);
  saveState();
  renderAll();
  downloadBlob(JSON.stringify({ ...archive, archiveSeal: snapshot }, null, 2), `kosif_archive_${createdAt.slice(0, 10)}.json`, 'application/json;charset=utf-8');
  showToast('تم إنشاء لقطة أرشيف موثقة بالبصمة وسلسلة الأحداث.');
}

function bindEvents() {
  const sidebarMedia = matchMedia('(max-width: 900px)');
  sidebarMedia.addEventListener('change', closeSidebar);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('#appShell').classList.contains('sidebar-open')) { closeSidebar(); $('#menuButton').focus(); }
  });
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
    const previousEntity = state.engagement.entity;
    invalidateApproval('تغيير بيانات المنشأة');
    state.engagement.entity = entity.trim();
    recordAuditEvent('ENGAGEMENT_ENTITY_CHANGED', { previousEntity, entity: state.engagement.entity });
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

  $('#downloadJournalTemplateButton').addEventListener('click', () => downloadBlob(
    '\uFEFFرقم القيد,تاريخ القيد,المستخدم,المصدر,المبلغ,البيان\nJE-001,2026-12-31,auditor.user,يدوي,100000,تسوية نهاية الفترة\nJE-002,2026-12-15,erp.system,آلي,15230.75,ترحيل مبيعات\n',
    'kosif_journal_template.csv',
    'text/csv;charset=utf-8'
  ));
  $('#loadJournalDemoButton').addEventListener('click', loadJournalDemo);
  $('#journalFileInput').addEventListener('change', (event) => readJournalFile(event.target.files[0]));
  $('#runJournalReviewButton').addEventListener('click', () => runJournalReview());
  $('#journalRiskFilter').addEventListener('change', renderJournal);
  $('#journalTableBody').addEventListener('change', (event) => {
    const select = event.target.closest('[data-journal-status]');
    if (!select) return;
    const entry = state.journalEntries.find((item) => item.id === select.dataset.journalStatus);
    if (!entry) return;
    invalidateApproval('تغيير حالة مراجعة قيد يومية');
    entry.reviewStatus = select.value;
    const review = analyzeJournalEntries(state.journalEntries, journalParameters());
    persistJournalReview(review, state.journalReview?.sourceName);
    recordAuditEvent('JOURNAL_ENTRY_REVIEW_STATUS_CHANGED', { entryId: entry.id, status: entry.reviewStatus });
    saveState();
    renderAll();
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
      invalidateApproval('تعديل الأهمية النسبية');
      state.materiality = persistMateriality(result);
      state.materialityRevisions = createMaterialityRevision(state.materialityRevisions, result, {
        actor: state.engagement.reviewer,
        rationale: result.rationale
      });
      recordAuditEvent('MATERIALITY_RECORDED', {
        version: state.materialityRevisions.length,
        benchmark: result.benchmark,
        overallMinor: result.overall.toString(),
        risk: result.risk
      });
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
      invalidateApproval('تحديث استجابة خطر');
      state.riskDecisions[risk.id] = { status: 'addressed', note: 'تمت الاستجابة وربط الخطر بإجراء؛ يلزم توثيق نتيجة التنفيذ.', decidedAt: new Date().toISOString() };
      recordAuditEvent('RISK_RESPONSE_RECORDED', { riskId: risk.id, decision: 'addressed' });
    } else if (button.dataset.riskAction === 'accept') {
      const note = window.prompt('سجّل مبرر القبول المهني للخطر المتبقي:', risk.humanDecision ?? '');
      if (!note?.trim()) return;
      invalidateApproval('تسجيل قبول مهني لخطر');
      state.riskDecisions[risk.id] = { status: 'accepted', note: note.trim(), decidedAt: new Date().toISOString() };
      recordAuditEvent('RISK_RESPONSE_RECORDED', { riskId: risk.id, decision: 'accepted', rationale: note.trim() });
    } else if (button.dataset.riskAction === 'workpaper') {
      invalidateApproval('ربط ورقة عمل جديدة');
      const workpaper = buildWorkpaperForRisk(risk);
      recordAuditEvent('WORKPAPER_LINKED', { riskId: risk.id, workpaperId: workpaper.id });
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
    invalidateApproval('إضافة نتيجة مراجعة');
    state.findings.push(finding);
    recordAuditEvent('FINDING_RECORDED', { findingId: finding.id, riskId: finding.riskId, severity: finding.severity, status: finding.status });
    $('#findingModal').close();
    analyzeRuntime(); saveState(); renderAll(); showToast('تم تسجيل النتيجة وربطها بملف الارتباط.');
  });
  $('#findingsTableBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-finding]');
    if (!button) return;
    invalidateApproval('حذف نتيجة مراجعة');
    recordAuditEvent('FINDING_REMOVED', { findingId: button.dataset.deleteFinding });
    state.findings = state.findings.filter((item) => item.id !== button.dataset.deleteFinding);
    analyzeRuntime(); saveState(); renderAll(); showToast('تم حذف النتيجة.');
  });

  $('#standardSearch').addEventListener('input', renderStandards);
  $('#frameworkFilter').addEventListener('change', renderStandards);
  $('#standardsWatchList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-standard-query]');
    if (!button) return;
    $('#standardSearch').value = button.dataset.standardQuery;
    $('#frameworkFilter').value = 'all';
    renderStandards();
    $('#standardSearch').focus({ preventScroll: false });
  });
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
      invalidateApproval('تغيير حالة ورقة عمل');
      workpaper.status = select.value;
      workpaper.updatedAt = new Date().toISOString();
      recordAuditEvent('WORKPAPER_STATUS_CHANGED', { workpaperId: workpaper.id, status: workpaper.status });
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
    invalidateApproval('إضافة طلب مستند');
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
    recordAuditEvent('PBC_REQUEST_CREATED', { title, status: $('#pbcStatusInput').value });
    $('#pbcModal').close();
    analyzeRuntime(); saveState(); renderAll(); showToast('تم حفظ طلب المستند وربطه بالمخاطر المناسبة.');
  });
  $('#pbcBoard').addEventListener('change', (event) => {
    const input = event.target.closest('[data-pbc-toggle]');
    if (!input) return;
    const item = state.pbc.find((entry) => entry.id === input.dataset.pbcToggle);
    if (item) {
      invalidateApproval('تغيير حالة طلب مستند');
      item.status = input.checked ? 'reviewed' : 'requested';
      item.updatedAt = new Date().toISOString();
      recordAuditEvent('PBC_STATUS_CHANGED', { pbcId: item.id, status: item.status });
      analyzeRuntime(); saveState(); renderAll();
    }
  });

  $('#addEvidenceButton').addEventListener('click', openEvidenceForm);
  $('#evidenceForm').addEventListener('submit', async (event) => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    try {
      const file = $('#evidenceFileInput').files[0] ?? null;
      const fileHash = await fingerprintFile(file);
      const riskId = $('#evidenceRiskInput').value;
      const workpaperId = $('#evidenceWorkpaperInput').value;
      const evidenceRecord = {
        id: `E-${fnv1a(`${$('#evidenceTitleInput').value}|${Date.now()}`).toString(16).toUpperCase()}`,
        title: $('#evidenceTitleInput').value.trim(),
        sourceType: $('#evidenceSourceTypeInput').value,
        documentDate: $('#evidenceDateInput').value,
        status: $('#evidenceStatusInput').value,
        obtainedDirectly: $('#evidenceDirectInput').checked,
        riskIds: riskId ? [riskId] : [],
        workpaperIds: workpaperId ? [workpaperId] : [],
        fileName: file?.name ?? null,
        fileSize: file?.size ?? null,
        mimeType: file?.type ?? null,
        fileHash,
        reviewer: state.engagement.reviewer,
        createdAt: new Date().toISOString()
      };
      Object.assign(evidenceRecord, scoreEvidenceQuality(evidenceRecord));
      invalidateApproval('إضافة دليل مراجعة');
      state.evidence.push(evidenceRecord);
      recordAuditEvent('EVIDENCE_REGISTERED', {
        evidenceId: evidenceRecord.id,
        riskIds: evidenceRecord.riskIds,
        workpaperIds: evidenceRecord.workpaperIds,
        score: evidenceRecord.score,
        hasFileHash: Boolean(fileHash)
      });
      $('#evidenceModal').close();
      analyzeRuntime();
      saveState();
      renderAll();
      showToast(`تم تسجيل الدليل بدرجة جودة ${evidenceRecord.score}%.`);
    } catch (error) {
      showToast(error.message || 'تعذر تسجيل الدليل.', 'error');
    }
  });
  $('#evidenceTableBody').addEventListener('change', (event) => {
    const select = event.target.closest('[data-evidence-status]');
    if (!select) return;
    const item = state.evidence.find((entry) => entry.id === select.dataset.evidenceStatus);
    if (!item) return;
    invalidateApproval('تغيير حالة دليل مراجعة');
    item.status = select.value;
    item.reviewedAt = select.value === 'reviewed' ? new Date().toISOString() : null;
    Object.assign(item, scoreEvidenceQuality(item));
    recordAuditEvent('EVIDENCE_STATUS_CHANGED', { evidenceId: item.id, status: item.status, score: item.score });
    analyzeRuntime(); saveState(); renderAll();
  });
  $('#evidenceTableBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-evidence]');
    if (!button) return;
    invalidateApproval('حذف دليل مراجعة');
    recordAuditEvent('EVIDENCE_REMOVED', { evidenceId: button.dataset.deleteEvidence });
    state.evidence = state.evidence.filter((item) => item.id !== button.dataset.deleteEvidence);
    analyzeRuntime(); saveState(); renderAll(); showToast('تم حذف سجل الدليل مع الاحتفاظ بأثر العملية في سجل الأحداث.');
  });

  $('#runCouncilButton').addEventListener('click', () => {
    if (!runtime.analysis) { showToast('حمّل البيانات قبل عقد الجلسة.', 'error'); return; }
    invalidateApproval('عقد جلسة مجلس جديدة');
    const session = convene({
      analysis: runtime.analysis, materiality: runtime.materiality, risks: runtime.risks, findings: state.findings,
      workpapers: state.workpapers, pbc: state.pbc, evidence: state.evidence, journalReview: runtime.journalReview,
      analytics: runtime.analytics, opinion: runtime.opinion, gates: reportGateData(), graph: runtime.graph, currency: state.engagement.currency
    });
    session.sourceStamp = contextStamp(studioContext());
    state.councilRuns.unshift(session);
    state.councilRuns = state.councilRuns.slice(0, 20);
    recordAuditEvent('COUNCIL_SESSION_CONVENED', { sessionId: session.id, consensus: session.consensus, verdict: session.verdict, conflicts: session.conflicts.length, objections: session.positions.filter((item) => item.stance === 'objection').length });
    saveState(); renderAll(); showToast(`انعقد المجلس: ${councilVerdictLabel(session.verdict)} — بلا اعتماد أو رأي آلي.`);
  });
  $('#councilContractsButton').addEventListener('click', () => $('#councilContractsDialog').showModal());
  $('#councilConflicts').addEventListener('click', (event) => {
    const button = event.target.closest('[data-resolve-conflict]');
    if (!button || !state.councilRuns[0]) return;
    studio.openConflict(button.dataset.resolveConflict, button.dataset.decision);
  });

  $('#exportJsonButton').addEventListener('click', () => downloadBlob(JSON.stringify(packageExport(), null, 2), 'kosif_audit_engagement.json', 'application/json;charset=utf-8'));
  $('#archiveSnapshotButton').addEventListener('click', createArchiveSnapshot);
  $('#printReportButton').addEventListener('click', () => window.print());
  $('#reportGates').addEventListener('click', (event) => {
    if (!event.target.closest('#recordApprovalButton')) return;
    const reviewer = window.prompt('اسم المراجع الذي أتم المراجعة البشرية:', state.engagement.reviewer);
    if (!reviewer?.trim()) return;
    state.approval = { reviewer: reviewer.trim(), recordedAt: new Date().toISOString(), scope: 'تسجيل مراجعة بشرية لبوابات الملف فقط؛ لا يمثل إصدار رأي تلقائي.' };
    recordAuditEvent('HUMAN_REVIEW_RECORDED', { reviewer: reviewer.trim(), scope: state.approval.scope });
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
    } else if (state.evidence.some((item) => normalizeText(`${item.title} ${item.fileName ?? ''} ${(item.riskIds ?? []).join(' ')}`).includes(normalized))) {
      openView('evidence');
    } else if ((runtime.journalReview?.entries ?? []).some((item) => normalizeText(`${item.id} ${item.user} ${item.description}`).includes(normalized))) {
      openView('journal'); $('#journalRiskFilter').value = 'all'; renderJournal();
    } else if (runtime.risks.some((risk) => normalizeText(`${risk.title} ${risk.accountName}`).includes(normalized))) {
      openView('risks'); $('#riskSearch').value = query; renderRisks();
    } else {
      openView('data'); $('#accountSearch').value = query; runtime.accountPage = 1; renderAccountsTable();
    }
  });
}

function bindAnalyticsEvents() {
  $('#exportStatementsButton').addEventListener('click', exportStatementsCsv);
  $('#opinionForm').addEventListener('change', () => {
    const next = { scope: $('#opinionScope').value, goingConcern: $('#opinionGoingConcern').value, pervasive: $('#opinionPervasive').checked };
    const changed = next.scope !== state.opinion.scope || next.goingConcern !== state.opinion.goingConcern || next.pervasive !== state.opinion.pervasive;
    if (!changed) return;
    invalidateApproval('تغيير مدخلات الحكم المهني للرأي');
    state.opinion = { ...state.opinion, ...next, decision: null };
    recordAuditEvent('OPINION_INPUTS_CHANGED', next);
    analyzeRuntime(); saveState(); renderAll();
  });
  $('#opinionAcceptButton').addEventListener('click', () => {
    if (!runtime.opinion || runtime.opinion.code === 'blocked') return;
    const reviewer = prompt('اسم المراجع الذي يعتمد المسودة كموقف مبدئي:', state.engagement.reviewer);
    if (!reviewer?.trim()) return;
    state.opinion.decision = { accepted: true, code: runtime.opinion.code, reviewer: reviewer.trim(), recordedAt: new Date().toISOString() };
    recordAuditEvent('OPINION_DRAFT_ACCEPTED', { code: runtime.opinion.code, reviewer: reviewer.trim() });
    saveState(); renderOpinion(); renderReports(); showToast('سُجل الموقف المبدئي. الرأي النهائي يصدر بتوقيع المراجع خارج التطبيق.');
  });
  $('#opinionRejectButton').addEventListener('click', () => {
    if (!runtime.opinion) return;
    const reason = prompt('سبب رفض المسودة الآلية:');
    if (!reason?.trim()) return;
    state.opinion.decision = { accepted: false, code: runtime.opinion.code, reviewer: state.engagement.reviewer, reason: reason.trim(), recordedAt: new Date().toISOString() };
    recordAuditEvent('OPINION_DRAFT_REJECTED', { code: runtime.opinion.code, reason: reason.trim() });
    saveState(); renderOpinion(); renderReports(); showToast('سُجل الرفض وسببه في سجل الأحداث.');
  });

  $('#paletteButton').addEventListener('click', openPalette);
  $('#paletteInput').addEventListener('input', () => { runtime.paletteIndex = 0; renderPalette(); });
  $('#paletteInput').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); runtime.paletteIndex = Math.min((runtime.paletteItems?.length ?? 1) - 1, runtime.paletteIndex + 1); renderPalette(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); runtime.paletteIndex = Math.max(0, runtime.paletteIndex - 1); renderPalette(); }
    if (event.key === 'Enter') { event.preventDefault(); runPaletteItem(runtime.paletteIndex); }
    if (event.key === 'Escape') { event.preventDefault(); $('#paletteDialog').close(); }
  });
  $('#paletteDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  $('#paletteList').addEventListener('click', (event) => {
    const item = event.target.closest('[data-palette-index]');
    if (item) runPaletteItem(Number(item.dataset.paletteIndex));
  });

  const quickKeys = { d: 'dashboard', b: 'data', p: 'planning', r: 'risks', j: 'journal', a: 'analytics', w: 'workpapers', e: 'evidence', o: 'opinion', s: 'standards', c: 'council', t: 'reports' };
  let pendingG = false;
  document.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); return; }
    if (typing) return;
    if (event.key === '/') { event.preventDefault(); openPalette(); return; }
    if (event.key.toLowerCase() === 'g') { pendingG = true; setTimeout(() => { pendingG = false; }, 900); return; }
    if (pendingG && quickKeys[event.key.toLowerCase()]) { pendingG = false; openView(quickKeys[event.key.toLowerCase()]); }
  });
}

/* ===== Live voice ===== */
let voice = null;
let waveFrame = null;

function voiceContext() {
  const analytics = runtime.analytics;
  const gates = reportGateData();
  const latestCouncil = state.councilRuns[0];
  const openHigh = runtime.risks.filter((risk) => ['critical', 'high'].includes(risk.severity) && risk.status === 'open');
  return {
    entity: state.engagement.entity,
    period: state.engagement.period,
    readiness: calculateReadiness(),
    nextAction: $('#dashboardNextAction')?.textContent ?? '',
    analysis: runtime.analysis ? { balanced: runtime.analysis.balanced, accounts: runtime.analysis.metrics.accounts, categories: runtime.analysis.metrics.categories, imbalanceText: money(runtime.analysis.imbalance) } : null,
    materiality: runtime.materiality ? { overall: money(runtime.materiality.overall), performance: money(runtime.materiality.performance), trivial: money(runtime.materiality.trivial), benchmark: { revenue: 'الإيرادات', assets: 'إجمالي الأصول', profit: 'الربح قبل الضريبة', equity: 'حقوق الملكية', expenses: 'المصروفات' }[runtime.materiality.benchmark] ?? runtime.materiality.benchmark } : null,
    risks: { total: runtime.risks.length, high: openHigh.length, top: runtime.risks.slice(0, 3).map((risk) => `${risk.title} في ${risk.accountName}`) },
    journal: runtime.journalReview ? { total: runtime.journalReview.summary.total, flagged: runtime.journalReview.summary.flagged, pending: runtime.journalReview.summary.pendingReview } : null,
    statements: analytics ? { assets: money(analytics.statements.sfp.totalAssets), liabilities: money(analytics.statements.sfp.totalLiabilities), equity: money(analytics.statements.sfp.equity.total), profit: money(analytics.statements.pl.profit), profitLabel: analytics.statements.pl.profit >= 0n ? 'صافي الربح' : 'صافي الخسارة', equationHolds: analytics.statements.checks.equationHolds } : null,
    ratios: analytics ? analytics.ratios.slice(0, 4).map((item) => ({ label: item.label, value: ratioValue(item) })) : [],
    benford: analytics ? { total: analytics.benfordBalances.total, mad: analytics.benfordBalances.mad, label: conformityLabel(analytics.benfordBalances.conformity) } : null,
    goingConcern: analytics ? { hits: analytics.goingConcern.filter((item) => item.hit).map((item) => item.label) } : null,
    misstatements: analytics ? { exposure: money(analytics.misstatements.exposure), verdict: misstatementVerdictLabel(analytics.misstatements.verdict) } : null,
    opinion: runtime.opinion ? { label: runtime.opinion.label, standard: runtime.opinion.standard, basis: runtime.opinion.basis.join(' ') } : null,
    gates: { failed: gates.filter((gate) => !gate.pass).map((gate) => gate.label) },
    council: latestCouncil?.positions ? { verdict: councilVerdictLabel(latestCouncil.verdict), consensus: latestCouncil.consensus, objections: latestCouncil.positions.filter((item) => item.stance === 'objection').length, conflicts: latestCouncil.conflicts.length, resolved: latestCouncil.conflicts.filter((item) => item.resolution).length } : null
  };
}

function setVoiceState(stateName, label) {
  $('#voiceOrb').dataset.state = stateName;
  $('#voiceStateLabel').textContent = label;
}

function appendVoiceBubble(role, text, meta = '') {
  const container = $('#voiceTranscript');
  container.querySelector('.voice-hint')?.remove();
  const bubble = document.createElement('div');
  bubble.className = `voice-bubble ${role}`;
  bubble.innerHTML = `${e(text)}${meta ? `<small>${e(meta)}</small>` : ''}`;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function drawWave() {
  const canvas = $('#voiceWave');
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const styles = getComputedStyle(document.documentElement);
  ctx.clearRect(0, 0, width, height);
  const level = voice?.isActive() ? voice.level() : 0;
  const speaking = voice?.isSpeaking();
  const bars = 48;
  const gap = width / bars;
  const t = Date.now() / 220;
  ctx.fillStyle = speaking ? styles.getPropertyValue('--primary').trim() : styles.getPropertyValue('--accent').trim();
  for (let i = 0; i < bars; i += 1) {
    const quiet = state.studio.quietMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wobble = quiet ? .08 : speaking ? (Math.sin(t + i * .55) + 1) / 2 * .55 + .1 : level * (0.4 + Math.abs(Math.sin(i * .7 + t)) * .9) + .04;
    const h = Math.max(3, wobble * height * .9);
    ctx.globalAlpha = .25 + wobble * .75;
    ctx.beginPath();
    ctx.roundRect(i * gap + gap * .25, (height - h) / 2, gap * .5, h, 3);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  waveFrame = requestAnimationFrame(drawWave);
}

function ensureVoice() {
  if (voice) return voice;
  const viewLabels = Object.fromEntries($$('#mainNav .nav-item').map((button) => [button.dataset.view, button.querySelector('span')?.textContent ?? button.dataset.view]));
  voice = createVoiceAssistant({
    getContext: voiceContext,
    api: {
      openView: (view) => openView(view),
      viewLabel: (view) => viewLabels[view] ?? view,
      stop: () => stopVoice(),
      actions: {
        loadDemo: () => loadDemo(),
        convene: () => { if (!runtime.analysis) return null; $('#runCouncilButton').click(); return state.councilRuns[0]; }
      }
    },
    onEvent: (event) => {
      if (event.type === 'listening') { setVoiceState('listening', 'أستمع… تكلّم متى شئت'); $('#voiceFab').classList.add('live'); $('#voiceToggleButton').classList.add('live'); $('#voiceToggleButton span').textContent = 'إيقاف الاستماع'; }
      if (event.type === 'interim') $('#voiceInterim').textContent = event.text;
      if (event.type === 'final') { $('#voiceInterim').textContent = ''; appendVoiceBubble('user', event.text); setVoiceState('thinking', 'أفكّر…'); }
      if (event.type === 'thinking') setVoiceState('thinking', 'أستشير البوابة…');
      if (event.type === 'reply') appendVoiceBubble('assistant', event.reply, event.intent === 'gateway' ? 'عبر البوابة الخادمية' : 'موجّه محلي حتمي');
      if (event.type === 'speaking') setVoiceState('speaking', 'أتحدث — قاطعني بالكلام');
      if (event.type === 'interrupted') setVoiceState('listening', 'أستمع…');
      if (event.type === 'idle' && voice.isActive()) setVoiceState('listening', 'أستمع…');
      if (event.type === 'stopped') { setVoiceState('idle', 'متوقف'); $('#voiceFab').classList.remove('live'); $('#voiceToggleButton').classList.remove('live'); $('#voiceToggleButton span').textContent = 'ابدأ الاستماع'; $('#voiceInterim').textContent = ''; }
      if (event.type === 'unsupported') showToast('المتصفح لا يدعم التعرف على الكلام؛ جرّب Chrome أو Edge. النطق والنص ما زالا يعملان.', 'error');
      if (event.type === 'error' && event.code === 'not-allowed') showToast('لم يُسمح بالميكروفون. فعّله من إعدادات الموقع.', 'error');
    }
  });
  voice.setMuted(Boolean(state.preferences.voiceMuted));
  if (state.preferences.voiceGateway) voice.setGateway({ url: state.preferences.voiceGateway });
  return voice;
}

function openVoicePanel() {
  ensureVoice();
  $('#voicePanel').hidden = false;
  $('#voiceGatewayUrl').value = state.preferences.voiceGateway || '';
  $('#voiceMuteButton use').setAttribute('href', state.preferences.voiceMuted ? '#i-mic-off' : '#i-sun');
  if (!waveFrame) drawWave();
  if (!voice.support.recognition) setVoiceState('idle', 'التعرف على الكلام غير متاح في هذا المتصفح');
}

function startVoice() {
  openVoicePanel();
  if (voice.start()) recordAuditEvent('VOICE_SESSION_STARTED', { mode: voice.getGateway() ? 'gateway' : 'local' });
}

function stopVoice() {
  if (!voice) return;
  voice.stop();
  recordAuditEvent('VOICE_SESSION_ENDED', { turns: voice.transcript().length });
  saveState();
}

function bindVoiceEvents() {
  $('#voiceFab').addEventListener('click', () => (voice?.isActive() ? stopVoice() : startVoice()));
  $('#voiceTopButton').addEventListener('click', () => ($('#voicePanel').hidden ? openVoicePanel() : ($('#voicePanel').hidden = true)));
  $('#voiceToggleButton').addEventListener('click', () => (voice?.isActive() ? stopVoice() : startVoice()));
  $('#voiceCloseButton').addEventListener('click', () => { $('#voicePanel').hidden = true; });
  $('#voiceSettingsButton').addEventListener('click', () => { $('#voiceSettings').hidden = !$('#voiceSettings').hidden; });
  $('#voiceMuteButton').addEventListener('click', () => {
    state.preferences.voiceMuted = !state.preferences.voiceMuted;
    voice?.setMuted(state.preferences.voiceMuted);
    $('#voiceMuteButton use').setAttribute('href', state.preferences.voiceMuted ? '#i-mic-off' : '#i-sun');
    saveState();
  });
  $('#voiceGatewayUrl').addEventListener('change', (event) => {
    const url = event.target.value.trim();
    if (url && !/^https:\/\//.test(url)) { showToast('البوابة يجب أن تكون عبر https فقط.', 'error'); event.target.value = ''; return; }
    state.preferences.voiceGateway = url;
    voice?.setGateway(url ? { url } : null);
    saveState();
    showToast(url ? 'تم ربط البوابة الخادمية؛ يُرسل النص فقط.' : 'عدت إلى الوضع المحلي.');
  });
  $('#voiceChips').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-say]');
    if (!chip) return;
    openVoicePanel();
    appendVoiceBubble('user', chip.dataset.say);
    voice.respond(chip.dataset.say);
  });
  document.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() === 'v') { event.preventDefault(); voice?.isActive() ? stopVoice() : startVoice(); }
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker registration failed', error));
  }
}

if (state.auditEvents.length === 0) {
  recordAuditEvent('ENGAGEMENT_WORKSPACE_OPENED', {
    entity: state.engagement.entity,
    period: state.engagement.period,
    migratedToSchema: STATE_VERSION
  });
  saveState();
}
analyzeRuntime();
studio = createStudio({
  getContext: studioContext,
  getState: () => state.studio,
  updateState: (next) => { state.studio = next; saveState(); },
  recordEvent: recordAuditEvent,
  notify: showToast,
  actions: {
    openView, toggleSidebar, save: saveState, download: downloadBlob,
    openRisk: (id) => { runtime.selectedRiskId = id; openView('risks'); renderRisks(); },
    resolveConflict: (id, decision) => {
      state.councilRuns[0] = resolveConflict(state.councilRuns[0], id, decision);
      recordAuditEvent('COUNCIL_CONFLICT_RESOLVED', { sessionId: state.councilRuns[0].id, conflictId: id, ...decision });
      saveState(); renderCouncil(); renderReports(); showToast('سُجل رد المراجع وسنده في سجل الملف.');
    }
  }
});
bindEvents();
bindAnalyticsEvents();
bindVoiceEvents();
renderAll();
const requestedView = new URLSearchParams(location.search).get('view');
const availableViews = new Set($$('[data-view-panel]').map((panel) => panel.dataset.viewPanel));
const initialView = availableViews.has(requestedView)
  ? requestedView
  : availableViews.has(state.activeView) ? state.activeView : 'dashboard';
openView(initialView, { keepScroll: true });
registerServiceWorker();
