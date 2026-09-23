import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { V5_STYLE_ASSETS, V5_THEME_ASSETS } from '../v5/ui-assets.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const heritage = read('kosif-heritage-v5.css');
const shell = read('index.html');
const sw = read('sw.js');

test('heritage identity keeps the four KOSIF colours and paints after the dashboard theme', () => {
  for (const token of ['#f6efe3', '#241332', '#4a2a6b', '#c59a3b', '#1f6b54', '#8a6220']) assert.match(heritage, new RegExp(escape(token), 'i'));
  assert.deepEqual([...V5_THEME_ASSETS], ['./dashboard-theme.css', './kosif-heritage-v5.css']);
  assert.equal(V5_STYLE_ASSETS.at(-1), './kosif-heritage-v5.css');
  const order = [...shell.matchAll(/href="\.\/([a-z0-9-]+\.css)"/g)].map(match => match[1]);
  assert.ok(order.includes('dashboard-theme.css'), 'dashboard theme must load in the shell');
  assert.ok(order.indexOf('dashboard-theme.css') < order.indexOf('kosif-heritage-v5.css'), 'identity layer must load after the dashboard theme');
  assert.equal(order.at(-1), 'kosif-heritage-v5.css', 'identity layer must be the last painted stylesheet');
});

test('heritage layer is an override layer: every rule beats the locked dashboard palette', () => {
  const locked = read('dashboard-theme.css');
  const selectors = [...heritage.matchAll(/^([.:#a-zA-Z][^{}\n]*)\{/gm)].map(match => match[1].trim()).filter(selector => !selector.startsWith('@'));
  assert.ok(selectors.length > 30, `identity layer should restyle the shell, found ${selectors.length} rule sets`);
  const important = (heritage.match(/!important/g) || []).length;
  assert.ok(important > 100, `identity layer must outrank the locked !important palette, found ${important}`);
  assert.match(locked, /linear-gradient\(135deg,#6366f1 0%,#8b5cf6 55%,#ec4899 100%\)/i, 'the supplied dashboard palette must stay documented');
});

test('heritage layer prints one clean report surface instead of the operating shell', () => {
  assert.match(heritage, /@media print/);
  for (const hidden of ['.topbar', '.assistant', '.report-outline', '.dashboard-command-center', '.report-publication-toolbar']) assert.ok(heritage.includes(hidden), `print styles must hide ${hidden}`);
  assert.match(heritage, /\.paper\{box-shadow:none/i);
  assert.match(heritage, /\.report-section\{break-inside:avoid-page\}/);
});

test('heritage identity and assistant ship inside the offline shell without caching private APIs', () => {
  for (const asset of ['./kosif-heritage-v5.css', './kosif-assistant.css', './v5/continuous-assistant.js']) assert.match(sw, new RegExp(escape(asset)));
  assert.equal(JSON.parse(read('manifest.webmanifest')).theme_color, '#f8fafc');
  assert.doesNotMatch(sw, /\/api\//);
});
