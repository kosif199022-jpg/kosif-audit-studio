import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../cloudflare/wrangler.toml', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../continuous-review.js', import.meta.url), 'utf8');

test('V5 PWA shell includes document intelligence modules without caching API responses', () => {
  for (const asset of ['./document-intelligence.css','./v5/document-intelligence.js','./v5/document-client.js','./v5/continuous-store.js','./v5/continuous-documents.js','./v5/continuous-council.js','./v5/continuous-reporting.js']) assert.match(sw, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(sw, /\/api\/documents\/analyze/);
});

test('Cloudflare active config preserves worker name and switches to unified document worker without secrets', () => {
  assert.match(wrangler, /name\s*=\s*"kosif-audit-realtime"/);
  assert.match(wrangler, /main\s*=\s*"document-worker\.js"/);
  assert.match(wrangler, /DOCUMENT_MODEL/);
  assert.doesNotMatch(wrangler, /OPENAI_API_KEY\s*=/);
  assert.doesNotMatch(wrangler, /REPLACE_WITH_D1_DATABASE_ID/);
});

test('continuous-review bootstrap is modular instead of returning to a monolithic controller', () => {
  assert.match(bootstrap, /continuous-documents\.js/);
  assert.match(bootstrap, /continuous-council\.js/);
  assert.match(bootstrap, /continuous-reporting\.js/);
  assert.ok(bootstrap.length < 3000);
});
