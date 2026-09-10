import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("root render is protected by the KOSIF recovery boundary", async () => {
  const [main, boundary] = await Promise.all([
    read("src/main.jsx"),
    read("src/components/AppErrorBoundary.jsx"),
  ]);
  assert.match(main, /<AppErrorBoundary>/);
  assert.match(main, /<CloudPersistenceBoundary>/);
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /إعادة تحميل KOSIF/);
  assert.doesNotMatch(boundary, /OPENAI_API_KEY|provider\.key|engagement\s*=/);
});

test("full workspace and heavy visual CSS are deferred behind a fast boot shell", async () => {
  const main = await read("src/main.jsx");
  assert.match(main, /lazy\(async \(\) =>/);
  assert.match(main, /import\("\.\/App\.jsx"\)/);
  assert.match(main, /import\("\.\/styles\.css"\)/);
  assert.match(main, /import\("\.\/design-v66\.css"\)/);
  assert.match(main, /import\("\.\/space-cinematic\.css"\)/);
  assert.match(main, /<Suspense fallback={<AppBootFallback \/>}>/);
  assert.doesNotMatch(main, /^import "\.\/styles\.css";/m);
  assert.doesNotMatch(main, /^import "\.\/design-v66\.css";/m);
  assert.doesNotMatch(main, /^import "\.\/space-cinematic\.css";/m);
});

test("iPhone shell keeps RTL, safe-area, and standalone app metadata", async () => {
  const [html, manifest] = await Promise.all([
    read("index.html"),
    read("public/manifest.webmanifest"),
  ]);
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"theme_color": "#070c20"/);
});

test("Cloudflare static headers allow only the microphone capability needed by live voice", async () => {
  const headers = await read("public/_headers");
  assert.match(headers, /Permissions-Policy: microphone=\(self\)/);
  assert.match(headers, /camera=\(\)/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /\/assets\/\*[\s\S]*immutable/);
});

test("production build keeps repository and bundle quality gates enabled", async () => {
  const [pkg, vite] = await Promise.all([
    read("package.json"),
    read("vite.config.mjs"),
  ]);
  assert.match(pkg, /"quality": "node scripts\/repository-health\.mjs"/);
  assert.match(pkg, /"quality:bundle": "node scripts\/bundle-budget\.mjs"/);
  assert.match(vite, /manualChunks/);
  assert.match(vite, /vendor-react/);
});
