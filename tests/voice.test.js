import test from 'node:test';
import assert from 'node:assert/strict';
import { routeIntent } from '../voice.js';

const api = { openView() {}, viewLabel: (view) => ({ analytics: 'التحليلات المالية', risks: 'المخاطر' })[view] ?? view, stop() {}, actions: { loadDemo() {}, convene: () => ({ verdictText: 'x', consensus: 80 }) } };
const context = {
  analysis: { balanced: true, accounts: 5000, categories: 18 },
  materiality: { overall: '1,000', performance: '700', trivial: '50', benchmark: 'الإيرادات' },
  risks: { total: 12, high: 3, top: ['أ', 'ب', 'ج'] },
  journal: null, statements: null, ratios: [], benford: null, goingConcern: null, misstatements: null, opinion: { label: 'رأي غير معدل', standard: 'ISA 700', basis: '' },
  readiness: 40, nextAction: 'حمّل القيود.', gates: { failed: [] }, council: null
};

test('navigation intents resolve Arabic view names with normalization', () => {
  assert.equal(routeIntent('افتح التحليلات', context, api).view, 'analytics');
  assert.equal(routeIntent('إفتح شاشة الأخطار', context, api).view, 'risks');
  assert.equal(routeIntent('التحليلات', context, api).view, 'analytics');
});

test('status intents read from context without inventing numbers', () => {
  assert.match(routeIntent('هل الميزان متزن؟', context, api).reply, /5000/);
  assert.match(routeIntent('ما هي الأهمية النسبية', context, api).reply, /1,000/);
  assert.match(routeIntent('كم خطر مرتفع', context, api).reply, /3 مرتفعة/);
  assert.match(routeIntent('أين وصلنا', context, api).reply, /40/);
});

test('unknown requests fall back to guidance and never to a fabricated answer', () => {
  const result = routeIntent('ما رأيك في الطقس', context, api);
  assert.equal(result.intent, 'unknown');
  assert.match(result.reply, /مساعدة/);
});
