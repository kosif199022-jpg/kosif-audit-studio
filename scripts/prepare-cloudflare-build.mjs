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
 if (new URL(request.url).pathname.startsWith('/api/ai/')) return handleAi(request, env);
 const headers = new Headers(request.headers);
 headers.delete('oai-authenticated-user-email');
 return sitesWorker.fetch(new Request(request, { headers }), env, ctx);
} };\n`;
writeFileSync(path.join(output, '_worker.js'), source.replace('export default {', 'const sitesWorker = {') + '\n' + gateway + wrapper);
writeFileSync(path.join(output, '_routes.json'), JSON.stringify({version:1,include:['/*'],exclude:[]}));
const assets = ['/', '/index.html', '/manifest.webmanifest', ...['assets','fonts'].flatMap(dir => readdirSync(path.join(output,dir)).map(file => `/${dir}/${file}`))];
const revision = createHash('sha256').update(assets.join('|') + readFileSync(path.join(output,'index.html'),'utf8')).digest('hex').slice(0,16);
writeFileSync(path.join(output, 'sw.js'), `
const CACHE = 'kosif-primary-${revision}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('kosif-primary-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
 const request = event.request; const url = new URL(request.url);
 if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || request.headers.has('authorization') || request.headers.has('oai-sites-authorization') || !ASSETS.includes(url.pathname)) return;
 event.respondWith(fetch(request).then(response => {
  if (response.ok) event.waitUntil(caches.open(CACHE).then(c => c.put(request,response.clone())).catch(() => {}));
  return response;
 }).catch(() => caches.match(request).then(cached => cached || Response.error())));
});
`);
console.log('Prepared Cloudflare Pages with the existing Worker and protected API boundary.');
