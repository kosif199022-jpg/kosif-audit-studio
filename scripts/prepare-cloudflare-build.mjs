import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist/client');
if (!existsSync(path.join(output, 'index.html'))) throw new Error('Build the client before preparing Cloudflare.');
const source = readFileSync(path.join(root, 'worker/index.js'), 'utf8');
if ((source.match(/export default \{/g) || []).length !== 1) throw new Error('Unexpected Worker entrypoint');
// Sites-authenticated headers have no trust on a direct Cloudflare hostname.
// Keep the underlying Worker and all gates intact, denying anonymous API access.
const gateway = readFileSync(path.join(root, 'worker/ai-gateway.js'), 'utf8').replace(/export /g, '');
const wrapper = `\nexport default { async fetch(request, env, ctx) {
 const pathname = new URL(request.url).pathname;
 // Keep the OpenAI secret in the dedicated Worker. BYOK sessions stay local.
 if (pathname === '/api/ai/realtime' && env.REALTIME_SERVICE && !request.headers.get('cookie')) {
  const headers = new Headers(request.headers);
  headers.delete('cookie'); headers.delete('authorization');
  return env.REALTIME_SERVICE.fetch(new Request(request, { headers }));
 }
 if (pathname.startsWith('/api/ai/')) return handleAi(request, env);
 const headers = new Headers(request.headers);
 headers.delete('oai-authenticated-user-email');
 return sitesWorker.fetch(new Request(request, { headers }), env, ctx);
} };\n`;
writeFileSync(path.join(output, '_worker.js'), source.replace("import { handleAi } from './ai-gateway.js';", '').replace('export default {', 'const sitesWorker = {') + '\n' + gateway + wrapper);
writeFileSync(path.join(output, '_routes.json'), JSON.stringify({version:1,include:['/*'],exclude:[]}));

// Precache only the application shell and its entry dependencies. Large PDF/XLSX/DOCX
// engines remain demand-loaded and are cached only after the user opens those tools.
const entryHtml = readFileSync(path.join(output, 'index.html'), 'utf8');
const entryAssets = [...entryHtml.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match => match[1]);
const fontDir = path.join(output, 'fonts');
const optionalFonts = existsSync(fontDir) ? readdirSync(fontDir).map(file => `/fonts/${file}`) : [];
const coreAssets = ['/', '/index.html', '/manifest.webmanifest', ...entryAssets];
const revision = createHash('sha256').update(coreAssets.join('|') + entryHtml).digest('hex').slice(0, 16);

writeFileSync(path.join(output, 'sw.js'), `
const SHELL_CACHE = 'kosif-shell-${revision}';
const RUNTIME_CACHE = 'kosif-runtime-${revision}';
const CORE_ASSETS = ${JSON.stringify(coreAssets)};
const OPTIONAL_ASSETS = ${JSON.stringify(optionalFonts)};
const STATIC_PREFIXES = ['/assets/', '/fonts/', '/pdf-fonts/'];

function isSensitive(request, url) {
  return request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    request.headers.has('authorization') ||
    request.headers.has('oai-sites-authorization');
}

async function cacheOptional(cache, asset) {
  try {
    const response = await fetch(asset, { cache: 'reload' });
    if (response.ok) await cache.put(asset, response);
  } catch {}
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(CORE_ASSETS);
    await Promise.allSettled(OPTIONAL_ASSETS.map(asset => cacheOptional(cache, asset)));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('kosif-') && name !== SHELL_CACHE && name !== RUNTIME_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (isSensitive(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const shell = await caches.open(SHELL_CACHE);
          event.waitUntil(shell.put('/index.html', response.clone()).catch(() => {}));
        }
        return response;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  const isStatic = STATIC_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
  if (!isStatic && !CORE_ASSETS.includes(url.pathname) && !OPTIONAL_ASSETS.includes(url.pathname)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const target = isStatic ? RUNTIME_CACHE : SHELL_CACHE;
        const cache = await caches.open(target);
        event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
`);
console.log('Prepared Cloudflare Pages with protected APIs, offline shell fallback, and immutable runtime caching.');
