import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('KOSIF V5 is the primary root shell and legacy workspace remains accessible', () => {
  const index = read('index.html');
  const legacy = read('legacy.html');
  const continuous = read('continuous-review.html');
  assert.match(index, /KOSIF 5 — Audit & Financial Reporting OS/);
  assert.match(index, /continuous-review\.js/);
  assert.doesNotMatch(index, /src="\.\/app\.js"/);
  assert.match(index, /href="\.\/legacy\.html"/);
  assert.match(continuous, /href="\.\/legacy\.html"/);
  assert.match(legacy, /KOSIF 4 — Audit Intelligence Studio/);
  assert.match(legacy, /src="\.\/app\.js"/);
});

test('PWA launches V5 root and explicitly keeps the legacy shortcut', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.ok(manifest.shortcuts.some(item => item.url === './legacy.html'));
  const sw = read('sw.js');
  assert.match(sw, /'\.\/legacy\.html'/);
  assert.match(sw, /'\.\/continuous-review\.html'/);
});
