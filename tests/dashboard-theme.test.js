import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { V5_STYLE_ASSETS } from '../v5/ui-assets.js';

const theme=readFileSync(new URL('../dashboard-theme.css',import.meta.url),'utf8');
const nav=readFileSync(new URL('../dashboard-navigation-theme.css',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const shell=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../continuous-review.js',import.meta.url),'utf8');

test('KOSIF locks the supplied dashboard palette typography and hero gradient',()=>{
  for(const token of ['#f8fafc','#ffffff','#1e293b','#64748b','#eef2f7','#6366f1','#a855f7','#8b5cf6','#ec4899','#10b981','#f59e0b','#f43f5e','#06b6d4']) assert.match(theme,new RegExp(token.replace('#','\\#'),'i'));
  assert.match(theme,/Tajawal/);
  assert.match(theme,/linear-gradient\(135deg,#6366f1 0%,#8b5cf6 55%,#ec4899 100%\)/i);
  assert.match(theme,/border-radius:24px/i);
  assert.match(theme,/0 16px 48px -12px rgba\(139,92,246,\.45\)/i);
});

test('workspace navigation is bridged into the same light dashboard theme',()=>{
  assert.match(nav,/rgba\(255,255,255,\.94\)/i);
  assert.match(nav,/linear-gradient\(135deg,#6366f1,#a855f7\)/i);
  assert.match(nav,/background:#fff!important/i);
});

test('dashboard theme loads after every V5 workbench style and is painted from first navigation',()=>{
  assert.equal(V5_STYLE_ASSETS.at(-1),'./dashboard-theme.css');
  assert.match(shell,/name="theme-color" content="#f8fafc"/i);
  assert.match(shell,/Tajawal:wght@300;400;500;700;800;900/i);
  assert.match(shell,/href="\.\/dashboard-theme\.css"/i);
});

test('dashboard capability assets are in the offline shell without caching private APIs',()=>{
  for(const asset of ['./dashboard-capabilities.css','./dashboard-navigation-theme.css','./dashboard-theme.css','./v5/dashboard-capabilities.js','./v5/restore-points.js','./v5/spreadsheet-intake.js','./v5/continuous-spreadsheet-intake.js','./v5/continuous-dashboard.js','./v5/dashboard-suite.js']) assert.match(sw,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(sw,/\/api\/engagements/);
  assert.doesNotMatch(sw,/\/api\/documents\/analyze/);
});

test('dashboard suite stays outside the bootstrap and preserves modular shell size contract',()=>{
  assert.match(bootstrap,/dashboard-suite\.js/);
  assert.match(bootstrap,/renderDashboardSuite/);
  assert.ok(bootstrap.length<3000,`bootstrap grew to ${bootstrap.length} bytes`);
});
