import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("root render is protected by the KOSIF recovery boundary and mounts only ResetApp", async () => {
  const [main, boundary] = await Promise.all([
    read("src/main.jsx"),
    read("src/components/AppErrorBoundary.jsx"),
  ]);
  assert.match(main, /<AppErrorBoundary>/);
  assert.match(main, /import\("\.\/ResetApp\.jsx"\)/);
  assert.doesNotMatch(main, /CloudPersistenceBoundary|GlobalAuditLauncher|import\("\.\/App\.jsx"\)/);
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /إعادة تحميل KOSIF/);
  assert.doesNotMatch(boundary, /OPENAI_API_KEY|provider\.key|engagement\s*=/);
});

test("reset workflow is deferred behind a fast boot shell and carries its own isolated visual layer", async () => {
  const [main, resetApp] = await Promise.all([read("src/main.jsx"), read("src/ResetApp.jsx")]);
  assert.match(main, /lazy\(\(\) => import\("\.\/ResetApp\.jsx"\)/);
  assert.match(main, /<Suspense fallback={<AppBootFallback \/>}>/);
  assert.match(resetApp, /import "\.\/reset-app\.css";/);
  assert.doesNotMatch(main, /styles\.css|design-v66\.css|space-cinematic\.css/);
});

test("iPhone shell keeps RTL, safe-area, and standalone app metadata", async () => {
  const [html, manifest, resetCss] = await Promise.all([
    read("index.html"),
    read("public/manifest.webmanifest"),
    read("src/reset-app.css"),
  ]);
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(resetCss, /env\(safe-area-inset-bottom\)/);
  assert.match(resetCss, /100dvh/);
});

test("Cloudflare static headers keep the existing restrictive browser policy", async () => {
  const headers = await read("public/_headers");
  assert.match(headers, /Permissions-Policy: microphone=\(self\)/);
  assert.match(headers, /camera=\(\)/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /\/assets\/\*[\s\S]*immutable/);
});

test("PWA cache is offline-capable but never captures API or credentialed traffic", async () => {
  const [packager, pwa] = await Promise.all([
    read("scripts/prepare-cloudflare-build.mjs"),
    read("src/intelligence/pwa.js"),
  ]);
  assert.match(packager, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(packager, /request\.headers\.has\('authorization'\)/);
  assert.match(packager, /request\.mode === 'navigate'/);
  assert.match(packager, /caches\.match\('\/index\.html'\)/);
  assert.match(packager, /STATIC_PREFIXES/);
  assert.match(pwa, /kosif:pwa-update-ready/);
  assert.match(pwa, /registration\.update\(\)/);
  assert.match(pwa, /window\.isSecureContext/);
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
