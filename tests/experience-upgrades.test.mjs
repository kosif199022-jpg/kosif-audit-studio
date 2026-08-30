import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("ships the v3-inspired appearance system and executive presentation mode", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(app, /\["violet-light", "violet-dark", "heritage"\]/);
  assert.match(app, /document\.documentElement\.dataset\.theme/);
  assert.match(app, /presentation-mode/);
  assert.match(css, /\[data-theme="violet-dark"\]/);
  assert.match(css, /\.presentation-mode \.side-rail \{ display: none; \}/);
  assert.match(css, /audit-intelligence-hero\.webp/);
});

test("keeps every workspace reachable from the compact mobile navigation", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(app, /const moreItems = navItems\.filter/);
  assert.match(app, /id="mobile-more-menu"/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(app, /document\.addEventListener\("pointerdown"/);
  assert.match(app, /moreButtonRef\.current\?\.focus\(\)/);
  assert.match(css, /\.bottom-more-menu\s*\{/);
});

test("keeps semantic status colors and dense workspace text readable", async () => {
  const css = await readFile(new URL("../src/design-v66.css", import.meta.url), "utf8");

  assert.match(css, /--blue: #4d5abb/);
  assert.match(css, /--orange: #8b5114/);
  assert.match(css, /--red: #a13a43/);
  assert.match(css, /\.main-content small \{ font-size: \.75rem !important; \}/);
  assert.match(css, /\.status-pending,[\s\S]*background: var\(--gold-soft\)/);
  assert.match(css, /@container \(max-width: 900px\)/);
});

test("labels external AI providers honestly and exposes verified demo exports", async () => {
  const council = await readFile(new URL("../src/components/AuditCouncil.jsx", import.meta.url), "utf8");
  const providerRegistry = await readFile(new URL("../src/council-providers.js", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const asset = await stat(new URL("../public/assets/audit-intelligence-hero.webp", import.meta.url));
  const pdf = await stat(new URL("../public/downloads/kosif-audit-report-5000.pdf", import.meta.url));
  const workbook = await stat(new URL("../public/downloads/kosif-audit-workpapers-5000.xlsx", import.meta.url));

  assert.match(providerRegistry, /KOSIF المحلي/);
  assert.match(providerRegistry, /Gemini/);
  assert.match(providerRegistry, /OpenAI/);
  assert.match(providerRegistry, /Claude/);
  assert.match(providerRegistry, /backend_required/);
  assert.match(council, /فحص جاهزية المزودات/);
  assert.match(council, /لا تُرسل بيانات الارتباط إلى مزوّد خارجي/);
  assert.match(app, /kosif-audit-report-5000\.pdf/);
  assert.match(app, /kosif-audit-workpapers-5000\.xlsx/);
  assert.ok(asset.size > 10_000);
  assert.ok(pdf.size > 10_000);
  assert.ok(workbook.size > 10_000);
});
