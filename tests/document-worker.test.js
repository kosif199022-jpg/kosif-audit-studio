import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMetadata, documentSchema, responseOutputText, safeFilename } from '../cloudflare/document-worker.js';

test('worker metadata classifier recognizes bank and PDF inputs', () => {
  assert.equal(classifyMetadata('bank_december.pdf', 'application/pdf'), 'bank-statement');
  assert.equal(classifyMetadata('unknown.pdf', 'application/pdf'), 'pdf-document');
});

test('safeFilename removes path separators and control characters', () => {
  assert.equal(safeFilename('../bad\\name\n.pdf').includes('/'), false);
  assert.equal(safeFilename('../bad\\name\n.pdf').includes('\\'), false);
});

test('structured output schema prohibits extra top-level properties', () => {
  const schema = documentSchema();
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes('claims'));
  assert.ok(schema.required.includes('adjustmentCandidates'));
});

test('response output text is extracted only from output_text content', () => {
  const payload = { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] };
  assert.equal(responseOutputText(payload), '{"ok":true}');
  assert.equal(responseOutputText({ output: [{ content: [{ type: 'refusal', refusal: 'no' }] }] }), '');
});
