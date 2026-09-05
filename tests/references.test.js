import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCES, referenceStatus, searchReferences } from '../reference-registry.js';
test('effective date uses period START with inclusive boundary', () => {
 const r = REFERENCES.find(r => r.id === 'ifrs18');
 assert.equal(referenceStatus(r, '2026-12-31').code, 'upcoming');
 assert.equal(referenceStatus(r, '2027-01-01').code, 'effective');
 assert.equal(referenceStatus(r, '2027-02-30').code, 'unknown');
 assert.equal(referenceStatus(r, '').code, 'unknown');
});
test('search is Arabic normalized; verified registry contains only HTTPS official links', () => {
 assert.ok(searchReferences('الاستمراريه').some(r => r.id === 'isa570'));
 assert.ok(REFERENCES.every(r => new URL(r.url).protocol === 'https:' && r.verifiedAt));
});
