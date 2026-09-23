import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastViolations } from '../scripts/theme-contrast.mjs';
import { V5_STYLE_ASSETS } from '../v5/ui-assets.js';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
/** كل ورقة أنماط تعمل داخل شاشة V5: أصول التسجيل + طبقات الهوية وحاوية البناء. */
const V5_SHEETS = [...new Set([...V5_STYLE_ASSETS, './continuous-review.css', './dashboard-theme.css', './kosif-heritage-v5.css', './kosif-assistant.css', './product-model.css'])].map(asset => asset.replace(/^\.\//, ''));
/** الورقات التي كانت على القشرة الداكنة ونُقلت إلى هوية KOSIF الورقية. */
const PAPER_SHEETS = ['council-insights.css', 'issue-workspace.css', 'document-intelligence.css', 'freshness-specialists.css', 'statement-comparison.css', 'statement-lineage.css', 'cash-flow-workspace.css', 'equity-workspace.css', 'disclosure-workspace.css', 'report-intake.css', 'report-publication.css', 'trace-inspector.css', 'workspace-navigation.css'];
/** ألوان القشرة الداكنة القديمة: أسطح وأحدود ونصوص. لا يجوز أن تعود إلى شاشات V5. */
const DARK_SHELL_LITERALS = ['#342741', '#100c16', '#0f0b14', '#1a1322', '#16101d', '#aaa1b4', '#8f8798', '#5eead4', '#a78bfa', '#f6f2fa'];

test('no V5 rule paints text that is nearly invisible against its own surface', () => {
  const violations = contrastViolations(V5_STYLE_ASSETS, { root, threshold: 3 });
  assert.deepEqual(violations, [], violations.map(v => `${v.file} :: ${v.selector} → ${v.color} on ${v.background} (${v.ratio}:1)`).join('\n'));
});

test('the workbench stylesheets keep the paper palette and never return to the dark shell', () => {
  for (const sheet of PAPER_SHEETS) {
    const css = read(sheet);
    for (const literal of DARK_SHELL_LITERALS) assert.ok(!css.includes(literal), `${sheet} still uses the dark shell colour ${literal}`);
    const palette = ['#fffdf8', '#f8f2e7', '#f6efe3', '#ece1cd', '#241332', '#4a2a6b', '#c59a3b', '#8a6220', '#1f6b54', '#a4343a'];
    const used = palette.filter(token => css.includes(token));
    assert.ok(used.length >= 2, `${sheet} must be painted with the KOSIF paper palette, found only ${used.join(', ') || 'none'}`);
  }
  const paper = read('kosif-heritage-v5.css');
  for (const token of ['#fffdf8', '#f8f2e7', '#f6efe3']) assert.ok(paper.includes(token), `identity layer must define ${token}`);
});

test('every V5 stylesheet keeps balanced braces after the palette migration', () => {
  for (const sheet of V5_SHEETS) {
    const css = read(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, `unbalanced CSS braces: ${sheet}`);
  }
});
