import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Cloudflare Pages root promotes V5 while legacy remains explicitly reachable',()=>{
  const redirects=readFileSync(new URL('../_redirects',import.meta.url),'utf8').trim();
  assert.equal(redirects,'/ /continuous-review.html 302');
  const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.start_url,'./continuous-review.html');
  const bootstrap=readFileSync(new URL('../continuous-review.js',import.meta.url),'utf8');
  assert.match(bootstrap,/index\.html\?legacy=1/);
});
