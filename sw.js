const CACHE = 'kosif-audit-studio-v4.0.0';
const CORE = [
  './', './index.html', './continuous-review.html', './legacy.html',
  './styles.css', './studio.css', './app.js', './engine.js', './data.js',
  './moon-core.js', './analytics.js', './council.js', './voice.js', './agent.js', './studio.js', './reference-registry.js',
  './research-engine.js', './continuous-review.css', './continuous-review.js', './document-intelligence.css', './freshness-specialists.css', './issue-workspace.css', './council-insights.css', './statement-comparison.css', './report-intake.css', './cash-flow-workspace.css', './disclosure-workspace.css',
  './v5/engagement-machine.js', './v5/evidence-requests.js', './v5/adjustment-ledger.js', './v5/report-recipes.js', './v5/report-intake.js', './v5/continuous-report-intake.js', './v5/cash-flow-engine.js', './v5/cash-flow-workflow.js', './v5/continuous-cash-flow.js', './v5/report-cash-flow.js', './v5/disclosure-engine.js', './v5/continuous-disclosures.js', './v5/report-disclosures.js',
  './v5/traceability.js', './v5/review-loop.js', './v5/document-client.js', './v5/document-intelligence.js', './v5/audit-coverage.js', './v5/continuous-coverage.js', './v5/statement-comparison.js', './v5/continuous-statements.js',
  './v5/continuous-store.js', './v5/continuous-documents.js', './v5/continuous-council.js', './v5/continuous-issues.js', './v5/issue-workflow.js', './v5/continuous-reporting.js',
  './v5/state-codec.js', './v5/engagement-persistence.js', './v5/continuous-persistence.js', './v5/report-model.js', './v5/report-detail-builders.js',
  './v5/completion-engine.js', './v5/report-approval.js', './v5/continuous-completion.js', './v5/report-source.js', './v5/specialist-registry.js',
  './manifest.webmanifest', './icon.svg', './icon-maskable.svg'
];
const scope = self.registration.scope;
const corePaths = new Set(CORE.map(path => new URL(path, scope).pathname));
const shellUrl = new URL('./index.html', scope).href;
const cacheable = response => response.ok && !/private|no-store/i.test(response.headers.get('Cache-Control') ?? '');
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kosif-audit-studio-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.headers.has('Authorization') || !corePaths.has(url.pathname)) return;
  if ([...url.searchParams.keys()].some(key => key !== 'view')) return;
  const isMainNavigation = request.mode === 'navigate' && url.pathname === new URL('./', scope).pathname;
  const key = isMainNavigation ? shellUrl : new URL(url.pathname, url.origin).href;
  const network = fetch(request).then(async response => { if (cacheable(response)) { const cache = await caches.open(CACHE); await cache.put(key, response.clone()); } return response; });
  event.respondWith(network.catch(async () => await caches.match(key) || new Response('المحتوى غير متاح دون اتصال. افتح التطبيق مرة عند توفر الشبكة.', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } })));
});
