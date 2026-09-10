const CACHE = 'kosif-audit-studio-v5.0.0-core';
const CORE = [
  './', './index.html', './styles.css', './studio.css', './app.js', './engine.js', './data.js',
  './moon-core.js', './analytics.js', './council.js', './voice.js', './agent.js', './studio.js', './reference-registry.js',
  './research-engine.js', './continuous-review.html', './continuous-review.css', './continuous-review.js',
  './v5/engagement-machine.js', './v5/evidence-requests.js', './v5/adjustment-ledger.js', './v5/report-recipes.js',
  './v5/traceability.js', './v5/review-loop.js', './manifest.webmanifest', './icon.svg', './icon-maskable.svg'
];
const scope = self.registration.scope;
const corePaths = new Set(CORE.map(path => new URL(path, scope).pathname));
const shellUrl = new URL('./index.html', scope).href;
const cacheable = response => response.ok && !/private|no-store/i.test(response.headers.get('Cache-Control') ?? '');

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('kosif-audit-studio-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.headers.has('Authorization') || !corePaths.has(url.pathname)) return;
  if ([...url.searchParams.keys()].some(key => key !== 'view')) return;
  const isMainNavigation = request.mode === 'navigate' && url.pathname === new URL('./', scope).pathname;
  const key = isMainNavigation ? shellUrl : new URL(url.pathname, url.origin).href;
  const network = fetch(request).then(async response => {
    if (cacheable(response)) { const cache = await caches.open(CACHE); await cache.put(key, response.clone()); }
    return response;
  });
  event.respondWith(network.catch(async () => await caches.match(key) || new Response('المحتوى غير متاح دون اتصال. افتح التطبيق مرة عند توفر الشبكة.', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } })));
});
