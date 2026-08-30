import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const commandPath = new URL("../src/components/CommandPalette.jsx", import.meta.url);
const accessibilityPath = new URL("../src/components/WorkspaceAccessibility.jsx", import.meta.url);
const cssPath = new URL("../src/command-accessibility.css", import.meta.url);
const appPath = new URL("../src/App.jsx", import.meta.url);

test("command palette searches every local engagement collection and routes selections", async () => {
  const [source, app] = await Promise.all([
    readFile(commandPath, "utf8"),
    readFile(appPath, "utf8"),
  ]);

  assert.match(source, /navItems = workspaceNavItems/);
  assert.match(source, /accounts = \[\]/);
  assert.match(source, /standards = standardCatalog/);
  assert.match(source, /rounds = \[\]/);
  assert.match(source, /evidence = \[\]/);
  assert.match(source, /mappingState/);
  assert.match(source, /getAccountStandardIds\(account, mappingState, \{ includeSuggested: true \}\)/);
  assert.match(source, /standardId: standardIds\[0\] \|\| null/);
  assert.match(app, /<CommandPalette[\s\S]*mappingState=\{engagement\.standardMappings\}/);
  assert.match(source, /onView\?\./);
  assert.match(source, /onOpenStandard\?\./);
  assert.match(source, /onOpenRound\?\./);
  assert.match(source, /useDeferredValue/);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|axios|Gemini|API[_ -]?key/i);
});

test("command palette supports keyboard access, focus trapping, and focus restoration", async () => {
  const source = await readFile(commandPath, "utf8");

  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "k"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /role="combobox"/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /role="option"/);
  assert.match(source, /aria-activedescendant/);
  assert.match(source, /previousFocus\.focus\(\)/);
  assert.match(source, /aria-keyshortcuts="Control\+K Meta\+K"/);
});

test("workspace accessibility persists a readable bounded text scale and only uses local speech", async () => {
  const [source, app] = await Promise.all([
    readFile(accessibilityPath, "utf8"),
    readFile(appPath, "utf8"),
  ]);

  assert.match(source, /MIN_FONT_SCALE = 100/);
  assert.match(source, /MAX_FONT_SCALE = 125/);
  assert.match(app, /Math\.max\(100, stored\)/);
  assert.match(source, /kosif-audit-studio:font-scale:v1/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /document\.documentElement\.style\.fontSize/);
  assert.match(source, /speechSynthesis/);
  assert.match(source, /SpeechSynthesisUtterance/);
  assert.match(source, /voice\.localService === true/);
  assert.match(source, /speechSynthesis\.cancel\(\)/);
  assert.match(source, /لا يرسل هذا المكوّن النص أو بيانات الارتباط عبر الشبكة/);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|axios|Gemini|API[_ -]?key/i);
});

test("new controls preserve RTL, mobile touch targets, and responsive dialog layout", async () => {
  const command = await readFile(commandPath, "utf8");
  const accessibility = await readFile(accessibilityPath, "utf8");
  const css = await readFile(cssPath, "utf8");

  assert.match(command, /dir="rtl"/);
  assert.match(accessibility, /dir="rtl"/);
  assert.match(command, /from "lucide-react"/);
  assert.match(accessibility, /from "lucide-react"/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /max-height: calc\(100dvh - 18px\)/);
  assert.match(css, /var\(--surface\)/);
});
