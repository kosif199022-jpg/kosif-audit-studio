import { KOSIF_STORAGE_KEY, SOCPA_2025_WATCH, buildMoonSnapshot, parseStoredState } from './moon-core.js';

const $ = (selector, root = document) => root.querySelector(selector);
const nf = new Intl.NumberFormat('ar-SA');
const df = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short' });

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function currentState() {
  try {
    return parseStoredState(localStorage.getItem(KOSIF_STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function statusMeta(status) {
  return {
    ready: ['جاهز تشغيليًا', 'success'],
    attention: ['يحتاج إجراء', 'warning'],
    blocked: ['محجوب', 'danger'],
    future: ['غير منفذ بعد', 'neutral']
  }[status] ?? ['غير معروف', 'neutral'];
}

function ensureStylesheet() {
  if ($('link[data-moon-layer]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './moon-layer.css';
  link.dataset.moonLayer = 'true';
  document.head.append(link);
}

function buildNavItem() {
  const button = document.createElement('button');
  button.className = 'nav-item moon-nav-item';
  button.type = 'button';
  button.dataset.view = 'moon';
  button.innerHTML = '<svg aria-hidden="true"><use href="#i-moon"/></svg><span>Moon — مركز القيادة</span><span class="moon-nav-signal" aria-hidden="true"></span>';
  return button;
}

function buildView() {
  const section = document.createElement('section');
  section.className = 'view moon-command-view';
  section.id = 'view-moon';
  section.dataset.viewPanel = 'moon';
  section.setAttribute('aria-labelledby', 'moonCommandTitle');
  section.innerHTML = `
    <div class="moon-heading">
      <div>
        <span class="eyebrow">طبقة تشغيل توافقية فوق KOSIF</span>
        <h1 id="moonCommandTitle">Moon Command Center</h1>
        <p>مركز قيادة للجاهزية والتتبّع والتحديثات المعيارية. لا يكرر محركات KOSIF الحتمية ولا يمنح الذكاء الاصطناعي سلطة اعتماد.</p>
      </div>
      <div class="moon-heading-actions">
        <button class="button secondary" type="button" id="moonRefreshButton">تحديث اللقطة</button>
        <button class="button primary" type="button" id="moonExportButton"><svg><use href="#i-download"/></svg>تصدير لقطة Moon</button>
      </div>
    </div>

    <div class="moon-command-shell">
      <section class="moon-command-summary" aria-label="ملخص Moon">
        <div class="moon-orbit" aria-hidden="true"><span></span></div>
        <div class="moon-command-copy">
          <span class="moon-command-label">القرار المهني يبقى بشريًا</span>
          <h2 id="moonEngagementName">ملف المراجعة</h2>
          <p id="moonEngagementPeriod">—</p>
          <div class="moon-authority-row" id="moonAuthorityRow"></div>
        </div>
        <div class="moon-trace-score" aria-label="صحة التتبع">
          <strong id="moonTraceValue">0%</strong>
          <span>صحة التتبّع</span>
          <small>مؤشر اكتمال روابط المصدر، وليس حكم جودة مراجعة.</small>
        </div>
      </section>

      <section class="moon-kpi-rail" aria-label="مؤشرات تشغيلية">
        <article><span>صفوف المصدر</span><strong id="moonRows">0</strong></article>
        <article><span>أوراق العمل</span><strong id="moonWorkpapers">0</strong></article>
        <article><span>نتائج مفتوحة</span><strong id="moonOpenFindings">0</strong></article>
        <article><span>PBC مراجع</span><strong id="moonReviewedPbc">0</strong></article>
        <article><span>جولات المجلس</span><strong id="moonCouncilRuns">0</strong></article>
      </section>
    </div>

    <div class="moon-layout">
      <article class="panel moon-gates-panel">
        <div class="panel-header">
          <div><span class="eyebrow">Governed Workflow</span><h2>بوابات دورة المراجعة</h2></div>
          <span class="status-chip neutral" id="moonGateSummary">0 / 0</span>
        </div>
        <p class="moon-panel-note">الحالات أدناه مؤشرات تشغيلية مبنية على البيانات المحفوظة في KOSIF؛ لا تستبدل الاعتماد المهني أو فحص الجودة.</p>
        <div class="moon-gates" id="moonGates"></div>
      </article>

      <aside class="panel moon-provenance-panel">
        <div class="panel-header"><div><span class="eyebrow">Provenance</span><h2>غلاف المصدر</h2></div></div>
        <dl class="moon-provenance" id="moonProvenance"></dl>
        <div class="human-gate">
          <svg><use href="#i-shield"/></svg>
          <span>أي رقم أو استنتاج نهائي يجب أن يظل قابلاً للعودة إلى مصدره وإصداره وحالة مراجعته.</span>
        </div>
      </aside>
    </div>

    <article class="panel moon-standards-watch">
      <div class="panel-header">
        <div><span class="eyebrow">SOCPA 2025</span><h2>رادار التحديثات المعيارية</h2></div>
        <button class="text-button" type="button" data-go="standards">فتح مكتبة المعايير</button>
      </div>
      <p class="moon-panel-note">طبقة مختصرة لتوجيه المستخدم إلى التحديث الصحيح. النص الرسمي يبقى في المصدر المعتمد ولا يُستبدل بملخص Moon.</p>
      <div class="moon-standard-list" id="moonStandardsWatch"></div>
    </article>

    <article class="panel moon-actions-panel">
      <div class="panel-header"><div><span class="eyebrow">Next Best Action</span><h2>مسارات العمل السريعة</h2></div></div>
      <div class="moon-action-rail">
        <button type="button" data-go="data"><svg><use href="#i-upload"/></svg><span><strong>البيانات</strong><small>ميزان المراجعة والاستيراد</small></span></button>
        <button type="button" data-go="planning"><svg><use href="#i-target"/></svg><span><strong>التخطيط</strong><small>الأهمية والعينات</small></span></button>
        <button type="button" data-go="risks"><svg><use href="#i-alert"/></svg><span><strong>المخاطر</strong><small>التقييم والاستجابة</small></span></button>
        <button type="button" data-go="workpapers"><svg><use href="#i-file"/></svg><span><strong>أوراق العمل</strong><small>الإجراءات والأدلة</small></span></button>
        <button type="button" data-go="council"><svg><use href="#i-users"/></svg><span><strong>مجلس AI</strong><small>تحليل استشاري فقط</small></span></button>
        <button type="button" data-go="reports"><svg><use href="#i-report"/></svg><span><strong>التقرير</strong><small>البوابات والتصدير</small></span></button>
      </div>
    </article>
  `;
  return section;
}

function renderStandardsWatch() {
  const target = $('#moonStandardsWatch');
  if (!target) return;
  target.innerHTML = SOCPA_2025_WATCH.map((item) => `
    <article class="moon-standard-item">
      <div class="moon-standard-code">${escapeHtml(item.code)}</div>
      <div class="moon-standard-body">
        <h3>${escapeHtml(item.titleAr)}</h3>
        <p>${escapeHtml(item.note)}</p>
        <small>${escapeHtml(item.sourcePages)}</small>
      </div>
      <button class="moon-standard-open" type="button" data-moon-standard="${escapeHtml(item.code)}">بحث في المكتبة</button>
    </article>
  `).join('');
}

function renderMoon() {
  if (!$('#view-moon')) return;
  const snapshot = buildMoonSnapshot(currentState());
  const metrics = snapshot.metrics;
  const engagement = snapshot.engagement;

  $('#moonEngagementName').textContent = engagement.entity || 'ملف المراجعة';
  $('#moonEngagementPeriod').textContent = engagement.period || 'لم تُحدد فترة الارتباط';
  $('#moonTraceValue').textContent = `${metrics.traceHealth}%`;
  $('#moonRows').textContent = nf.format(metrics.rows);
  $('#moonWorkpapers').textContent = nf.format(metrics.workpapers);
  $('#moonOpenFindings').textContent = nf.format(metrics.openFindings);
  $('#moonReviewedPbc').textContent = `${nf.format(metrics.reviewedPbc)} / ${nf.format(metrics.pbc)}`;
  $('#moonCouncilRuns').textContent = nf.format(metrics.councilRuns);

  $('#moonAuthorityRow').innerHTML = `
    <span><svg><use href="#i-check"/></svg>AI يقترح ويحلل</span>
    <span><svg><use href="#i-shield"/></svg>الرأي والاعتماد للبشر</span>
    <span><svg><use href="#i-link"/></svg>التتبّع قبل الاستنتاج</span>
  `;

  const readyCount = snapshot.gates.filter((item) => item.status === 'ready').length;
  $('#moonGateSummary').textContent = `${nf.format(readyCount)} / ${nf.format(snapshot.gates.length)}`;
  $('#moonGates').innerHTML = snapshot.gates.map((item, index) => {
    const [label, tone] = statusMeta(item.status);
    const action = item.actionView
      ? `<button type="button" class="moon-gate-action" data-go="${escapeHtml(item.actionView)}">فتح</button>`
      : '<span class="moon-gate-action disabled">—</span>';
    return `
      <div class="moon-gate-row" data-status="${escapeHtml(item.status)}">
        <div class="moon-gate-index">${nf.format(index + 1)}</div>
        <div class="moon-gate-copy"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.reason)}</span></div>
        <span class="status-chip ${tone}">${escapeHtml(label)}</span>
        ${action}
      </div>`;
  }).join('');

  const approval = snapshot.provenance.hasHumanApproval ? 'مسجلة' : 'غير مسجلة';
  $('#moonProvenance').innerHTML = `
    <div><dt>المصدر</dt><dd>${escapeHtml(snapshot.provenance.sourceName || 'لا يوجد مصدر محفوظ')}</dd></div>
    <div><dt>مخطط التخزين</dt><dd>v${escapeHtml(snapshot.provenance.storageSchemaVersion ?? '—')}</dd></div>
    <div><dt>لقطة الأهمية</dt><dd>${snapshot.provenance.hasMaterialitySnapshot ? 'موجودة' : 'غير موجودة'}</dd></div>
    <div><dt>المراجعة البشرية</dt><dd>${approval}</dd></div>
    <div><dt>توليد اللقطة</dt><dd>${escapeHtml(df.format(new Date(snapshot.generatedAt)))}</dd></div>
  `;

  const signal = $('.moon-nav-signal');
  if (signal) signal.dataset.level = metrics.openFindings > 0 ? 'attention' : snapshot.provenance.hasHumanApproval ? 'ready' : 'neutral';
}

function downloadSnapshot() {
  const snapshot = buildMoonSnapshot(currentState());
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `moon_kosif_snapshot_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function bindMoonEvents() {
  $('#moonRefreshButton')?.addEventListener('click', renderMoon);
  $('#moonExportButton')?.addEventListener('click', downloadSnapshot);
  $('#moonStandardsWatch')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-moon-standard]');
    if (!button) return;
    const code = button.dataset.moonStandard;
    const nav = $('#mainNav [data-view="standards"]');
    nav?.click();
    window.setTimeout(() => {
      const search = $('#standardSearch');
      if (!search) return;
      search.value = code;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.focus({ preventScroll: true });
    }, 0);
  });

  let timer = null;
  const schedule = () => {
    if (!$('#view-moon')?.classList.contains('active')) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(renderMoon, 80);
  };
  document.addEventListener('click', schedule, true);
  document.addEventListener('change', schedule, true);
  document.addEventListener('submit', schedule, true);
}

function installMoonLayer() {
  if ($('#view-moon')) return;
  ensureStylesheet();
  const nav = $('#mainNav');
  const main = $('#mainContent');
  if (!nav || !main) return;

  const navItem = buildNavItem();
  const firstNav = nav.querySelector('[data-view="dashboard"]');
  firstNav?.insertAdjacentElement('afterend', navItem);

  const view = buildView();
  const dashboard = $('#view-dashboard');
  dashboard?.insertAdjacentElement('afterend', view);

  renderStandardsWatch();
  bindMoonEvents();
  renderMoon();

  const saved = currentState();
  if (saved.activeView === 'moon') {
    window.setTimeout(() => navItem.click(), 0);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installMoonLayer, { once: true });
} else {
  installMoonLayer();
}
