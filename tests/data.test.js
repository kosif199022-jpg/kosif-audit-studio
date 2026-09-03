import test from 'node:test';
import assert from 'node:assert/strict';
import * as AuditData from '../data.js';

test('standards catalogue exposes versioned license-aware sources', () => {
  const sources = AuditData.STANDARD_SOURCES;
  assert.ok(Array.isArray(sources), 'STANDARD_SOURCES must exist');
  assert.ok(sources.length >= 4);
  for (const source of sources) {
    assert.ok(source.id);
    assert.ok(source.version);
    assert.ok(source.effectiveFrom);
    assert.ok(source.jurisdiction);
    assert.ok(source.license);
  }
  assert.ok(sources.some((source) => source.id === 'socpa-endorsement-2025'));
  assert.ok(sources.some((source) => source.id === 'ifrs-ar-2018' && source.status === 'historical'));
});

test('IFRS for SMEs sections 1 through 10 are searchable standards cards', () => {
  const cards = AuditData.STANDARDS.filter((item) => item.framework === 'IFRS SME');
  assert.equal(cards.length, 10);
  assert.deepEqual(cards.map((item) => item.id), [
    'SME 1', 'SME 2', 'SME 3', 'SME 4', 'SME 5',
    'SME 6', 'SME 7', 'SME 8', 'SME 9', 'SME 10'
  ]);
  assert.ok(cards.every((item) => item.sourceId && item.effectiveFrom));
});
