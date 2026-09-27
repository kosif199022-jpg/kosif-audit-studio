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
  /* since e3e1bbb the root shell paints with the KOSIF One editorial theme, layered after the dashboard theme */
  const editorial=readFileSync(new URL('../kosif-one-editorial-theme.css',import.meta.url),'utf8');
  const paint=shell.match(/name="theme-color" content="(#[0-9a-f]{6})"/i)?.[1];
  assert.equal(paint?.toLowerCase(),'#24113f');
  assert.match(editorial,new RegExp(paint,'i'),'theme-color must be a colour the editorial theme paints');
  assert.match(shell,/family=IBM\+Plex\+Sans\+Arabic:wght@400;500;600;700/i);
  assert.match(shell,/family=Noto\+Kufi\+Arabic:wght@500;600;700;800/i);
  for(const font of ['IBM Plex Sans Arabic','Noto Kufi Arabic']) assert.match(editorial,new RegExp(font),`${font} is loaded because the editorial theme uses it`);
  const dash=shell.indexOf('href="./dashboard-theme.css"'),ed=shell.indexOf('href="./kosif-one-editorial-theme.css"');
  assert.ok(dash>0,'dashboard theme is linked from first navigation');
  assert.ok(ed>dash,'the editorial theme loads after the dashboard theme');
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
