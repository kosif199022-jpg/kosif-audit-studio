// Browser regression: a page on another origin reads the gateway's /health (Chromium enforces CORS).
// Usage (needs Playwright): node tools/gateway-cors-browser.mjs "$PWD/cloudflare/gateway-worker.js"
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/user/cloude/package.json')('playwright');
const gw = (await import(process.argv[2])).default;
const PAGE = 'http://localhost:8791', GW = 'http://localhost:8790';
const env = { ALLOWED_ORIGIN: 'https://kosif-audit-studio.pages.dev', PERSISTENCE_ALLOWED_ORIGIN: `${PAGE},https://kosif-audit-studio.pages.dev` };
const srv = http.createServer(async (req, res) => {
  const r = await gw.fetch(new Request(GW + req.url, { method: req.method, headers: req.headers }), env, {});
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8790);
const page = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>x</title>'); }).listen(8791);
const page2 = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>y</title>'); }).listen(8792);
const b = await chromium.launch(); const p = await b.newPage(); const out = {};
for (const [name, origin] of [['listed origin', PAGE], ['unlisted origin', 'http://localhost:8792']]) {
  await p.goto(origin);
  out[name] = await p.evaluate(async (gw) => {
    const r = {};
    try { const x = await fetch(gw + '/health'); r.simpleGet = x.ok ? 'readable' : 'status ' + x.status; } catch (e) { r.simpleGet = 'blocked'; }
    try { const x = await fetch(gw + '/health', { headers: { 'Content-Type': 'application/json' } }); r.preflightedGet = x.ok ? 'readable' : 'status ' + x.status; } catch (e) { r.preflightedGet = 'blocked'; }
    return r;
  }, GW);
}
await b.close(); srv.close(); page.close(); page2.close();
console.log(JSON.stringify(out));
