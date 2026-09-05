import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const html=readFileSync('index.html','utf8');
const studio=readFileSync('studio.js','utf8');
const allMarkup=html+'\n'+studio;
const paths=new Set();
for(const file of readdirSync('.').filter(f=>f.endsWith('.js'))){
 execFileSync(process.execPath,['--check',file]);
 const text=readFileSync(file,'utf8');
 for(const match of text.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g))paths.add(match[1]);
}
for(const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g))paths.add(match[1]);
for(const path of paths)assert.ok(existsSync(path),`Missing local asset: ${path}`);
const ids=[...allMarkup.matchAll(/\bid="([A-Za-z][\w-]*)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'Duplicate static element ID');
const idSet=new Set(ids);
for(const file of ['app.js','studio.js']){
 const source=readFileSync(file,'utf8');
 for(const match of source.matchAll(/\$\(['"]#([A-Za-z][\w-]*)['"]\)/g))assert.ok(idSet.has(match[1]),`Unknown element #${match[1]} in ${file}`);
}
const panels=new Set([...allMarkup.matchAll(/data-view-panel="(\w+)"/g)].map(m=>m[1]));
for(const match of allMarkup.matchAll(/data-(?:view|go)="(\w+)"/g))assert.ok(panels.has(match[1]),`Unknown view ${match[1]}`);
const sw=readFileSync('sw.js','utf8');
for(const match of sw.matchAll(/'\.\/([^']+)'/g))assert.ok(existsSync(match[1]),`Missing cached shell file ${match[1]}`);
for(const file of ['styles.css','studio.css']){
 const css=readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,`CSS braces: ${file}`);
}
const manifest=JSON.parse(readFileSync('manifest.webmanifest','utf8'));
for(const shortcut of manifest.shortcuts){const view=new URL(shortcut.url,'https://example.test').searchParams.get('view');assert.ok(panels.has(view),`Manifest shortcut ${view}`);}
console.log(`Static checks passed: ${panels.size} views, ${ids.length} IDs, ${paths.size} local assets and imports; all JavaScript syntax valid.`);
