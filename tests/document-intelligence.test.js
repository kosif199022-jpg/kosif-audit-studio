import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDocumentMetadata, normalizeDocumentAnalysis, analysisToEvidence, analysisToIssues, analysisRequestsAsCouncilAsks, documentRiskSignals } from '../v5/document-intelligence.js';

test('metadata classifier recognizes audit document families without reading content', () => {
  assert.equal(classifyDocumentMetadata({ name: 'ميزان المراجعة 2026.xlsx' }).type, 'trial-balance');
  assert.equal(classifyDocumentMetadata({ name: 'Riyadh Bank December.pdf' }).type, 'bank-statement');
  assert.equal(classifyDocumentMetadata({ name: 'scan.png', mimeType: 'image/png' }).type, 'image-document');
});

test('AI document analysis is normalized and monetary values cannot contain floats', () => {
  const result = normalizeDocumentAnalysis({
    documentType: 'bank-statement', extractionConfidence: 'high',
    claims: [
      { id: 'C1', label: 'الرصيد', amountMinor: '182245000', confidence: 'high', page: 2 },
      { id: 'C2', label: 'قيمة غير صالحة', amountMinor: '12.34', confidence: 'certain' }
    ],
    risks: [{ id: 'R1', title: 'فرق بنك', severity: 'critical', claimIds: ['C1'] }]
  });
  assert.equal(result.claims[0].amountMinor, '182245000');
  assert.equal(result.claims[1].amountMinor, null);
  assert.equal(result.claims[1].confidence, 'low');
});

test('claims become unreviewed evidence and risks become issues, never human conclusions', () => {
  const document = { id: 'DOC-1', name: 'bank.pdf', sha256: 'abc' };
  const analysis = normalizeDocumentAnalysis({
    claims: [{ id: 'C1', label: 'رصيد البنك', amountMinor: '10000', accountHint: 'بنك الرياض' }],
    risks: [{ id: 'R1', title: 'فرق بنك', severity: 'high', claimIds: ['C1'], standards: ['ISA 505'] }]
  });
  const evidence = analysisToEvidence(document, analysis, { createdAt: '2026-01-01T00:00:00Z' });
  const issues = analysisToIssues(document, analysis, []);
  assert.equal(evidence[0].reviewStatus, 'unreviewed');
  assert.equal(evidence[0].provenance.documentId, 'DOC-1');
  assert.equal(issues[0].status, 'open');
  assert.equal(issues[0].source, 'document-intelligence');
});

test('document requests are transformed to governed council asks with acceptance criteria', () => {
  const analysis = normalizeDocumentAnalysis({ requests: [{ title: 'مصادقة البنك', priority: 'critical', acceptanceCriteria: ['مصدر خارجي', 'يغطي 31 ديسمبر'] }] });
  const asks = analysisRequestsAsCouncilAsks(analysis);
  assert.equal(asks[0].priority, 'critical');
  assert.equal(asks[0].acceptanceCriteria.length, 2);
  assert.equal(asks[0].acceptanceCriteria[0].required, true);
});

test('document risk signals remain open and trace back to the source document', () => {
  const document = { id: 'DOC-9', name: 'contract.pdf' };
  const analysis = normalizeDocumentAnalysis({ risks: [{ id: 'R9', title: 'التزام محتمل', severity: 'medium', standards: ['IAS 37'] }] });
  const signals = documentRiskSignals(document, analysis);
  assert.equal(signals[0].status, 'open');
  assert.equal(signals[0].sourceDocumentId, 'DOC-9');
});
