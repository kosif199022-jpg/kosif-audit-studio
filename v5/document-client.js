/** Browser client for KOSIF server-side document intelligence. No API key is accepted here. */
export function createDocumentIntelligenceClient({ baseUrl, fetchImpl = fetch } = {}) {
  const normalizedBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalizedBase) throw new Error('Document Intelligence gateway URL is required.');
  return {
    async health() {
      const response = await fetchImpl(`${normalizedBase}/health`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Gateway health failed (${response.status})`);
      return response.json();
    },
    async analyze(file, { engagementId, requestId = '', jurisdiction = 'SA', framework = 'IFRS', documentId = '' } = {}) {
      if (!(file instanceof Blob)) throw new TypeError('A File/Blob is required.');
      const form = new FormData();
      form.append('file', file, file.name || 'document.bin');
      form.append('engagementId', engagementId || 'ENG-UNASSIGNED');
      if (documentId) form.append('documentId', documentId);
      if (requestId) form.append('requestId', requestId);
      form.append('jurisdiction', jurisdiction);
      form.append('framework', framework);
      const response = await fetchImpl(`${normalizedBase}/api/documents/analyze`, { method: 'POST', body: form });
      const payload = await response.json().catch(() => ({ error: 'invalid_gateway_response' }));
      if (!response.ok) throw new Error(payload.message || payload.error || `Document analysis failed (${response.status})`);
      return payload;
    }
  };
}
