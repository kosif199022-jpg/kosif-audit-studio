import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const read = path => readFileSync(path, 'utf8');
const rootHtml = read('index.html');
const legacyHtml = existsSync('legacy.html') ? read('legacy.html') : rootHtml;
const studio = read('studio.js');
const legacyMarkup = `${legacyHtml}\n${studio}`;

function walk(dir='.') {
  const out=[];
  for (const name of readdirSync(dir)) {
    if (['.git','node_modules'].includes(name)) continue;
    const path = dir === '.' ? name : `${dir}/${name}`;
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path)); else out.push(path);
  }
  return out;
}

const files = walk();
const jsFiles = files.filter(path => path.endsWith('.js') || path.endsWith('.mjs'));
const cssFiles = files.filter(path => path.endsWith('.css'));
const paths = new Set();

for (const file of jsFiles) {
  execFileSync(process.execPath, ['--check', file]);
  const source = read(file);
  for (const match of source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
    const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    const url = new URL(match[1], `file:///${base}`);
    paths.add(decodeURIComponent(url.pathname.replace(/^\//, '')));
  }
}
for (const html of [rootHtml, legacyHtml, existsSync('continuous-review.html') ? read('continuous-review.html') : '']) {
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)) paths.add(match[1].replace(/^\.\//, ''));
}
for (const path of paths) assert.ok(existsSync(path), `Missing local asset/import: ${path}`);

function staticIds(markup) { return [...markup.matchAll(/\bid="([A-Za-z][\w-]*)"/g)].map(m => m[1]); }
const legacyIds = staticIds(legacyMarkup);
assert.equal(new Set(legacyIds).size, legacyIds.length, 'Duplicate legacy static element ID');
const legacyIdSet = new Set(legacyIds);
for (const file of ['app.js','studio.js']) {
  const source = read(file);
  for (const match of source.matchAll(/\$\(['"]#([A-Za-z][\w-]*)['"]\)/g)) assert.ok(legacyIdSet.has(match[1]), `Unknown legacy element #${match[1]} in ${file}`);
}

const v5SourceFiles = ['continuous-review.js', ...jsFiles.filter(path => path.startsWith('v5/continuous-'))].filter(existsSync);
const v5Ids = staticIds(rootHtml);
const v5IdSet = new Set(v5Ids);
for (const file of v5SourceFiles) for (const id of staticIds(read(file))) v5IdSet.add(id);
assert.equal(new Set(v5Ids).size, v5Ids.length, 'Duplicate V5 static element ID');
for (const file of v5SourceFiles) {
  const source = read(file);
  for (const match of source.matchAll(/\$\(['"]#([A-Za-z][\w-]*)['"]\)/g)) assert.ok(v5IdSet.has(match[1]), `Unknown V5 element #${match[1]} in ${file}`);
  for (const match of source.matchAll(/getElementById\(['"]([A-Za-z][\w-]*)['"]\)/g)) assert.ok(v5IdSet.has(match[1]), `Unknown V5 element #${match[1]} in ${file}`);
}

const legacyPanels = new Set([...legacyMarkup.matchAll(/data-view-panel="([\w-]+)"/g)].map(m => m[1]));
for (const match of legacyMarkup.matchAll(/data-(?:view|go)="([\w-]+)"/g)) assert.ok(legacyPanels.has(match[1]), `Unknown legacy view ${match[1]}`);

const sw = read('sw.js');
for (const match of sw.matchAll(/'\.\/([^']+)'/g)) assert.ok(existsSync(match[1]), `Missing cached shell file ${match[1]}`);
assert.doesNotMatch(sw, /api\/|evidence\/|Authorization[^\n]*CORE/, 'Service worker core cache must not include API/evidence/credential responses');

for (const file of cssFiles) {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal((css.match(/\{/g)||[]).length, (css.match(/\}/g)||[]).length, `CSS braces: ${file}`);
}

const manifest = JSON.parse(read('manifest.webmanifest'));
for (const shortcut of manifest.shortcuts || []) {
  const url = new URL(shortcut.url, 'https://example.test/');
  const localPath = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (localPath) assert.ok(existsSync(localPath), `Manifest shortcut asset ${localPath}`);
  const view = url.searchParams.get('view');
  if (view) {
    const targetMarkup = localPath === 'legacy.html' ? legacyMarkup : rootHtml;
    const targetPanels = new Set([...targetMarkup.matchAll(/data-view-panel="([\w-]+)"/g)].map(m => m[1]));
    assert.ok(targetPanels.has(view), `Manifest shortcut ${view} is not valid for ${localPath || 'root'}`);
  }
}
const startUrl = new URL(manifest.start_url, 'https://example.test/');
const startPath = decodeURIComponent(startUrl.pathname.replace(/^\//, ''));
if (startPath) assert.ok(existsSync(startPath), `Manifest start_url ${startPath}`);

console.log(`Static checks passed: ${legacyPanels.size} legacy views, ${v5Ids.length} V5 static IDs, ${paths.size} local assets/imports, ${jsFiles.length} JavaScript modules and ${cssFiles.length} stylesheets validated.`);
