/** Browser client for KOSIF server-side document intelligence. No OpenAI API key is accepted here. */
const SESSION_KEY='kosif:v5:remote-engagement';
function browserEngagementToken(){try{return typeof localStorage!=='undefined'?JSON.parse(localStorage.getItem(SESSION_KEY)||'null')?.accessToken||'':''}catch{return''}}
export function createDocumentIntelligenceClient({ baseUrl, fetchImpl = fetch, accessToken = '' } = {}) {
  const normalizedBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalizedBase) throw new Error('Document Intelligence gateway URL is required.');
  return {
    async health() {
      const response = await fetchImpl(`${normalizedBase}/health`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Gateway health failed (${response.status})`);
      return response.json();
    },
    async analyze(file, { engagementId, requestId = '', jurisdiction = 'SA', framework = 'IFRS', documentId = '', accessToken: callToken = '' } = {}) {
      if (!(file instanceof Blob)) throw new TypeError('A File/Blob is required.');
      const id = engagementId || 'ENG-UNASSIGNED', token = callToken || accessToken || browserEngagementToken();
      const form = new FormData();
      form.append('file', file, file.name || 'document.bin');
      form.append('engagementId', id);
      if (documentId) form.append('documentId', documentId);
      if (requestId) form.append('requestId', requestId);
      form.append('jurisdiction', jurisdiction);
      form.append('framework', framework);
      const headers = { 'X-KOSIF-Engagement': id };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetchImpl(`${normalizedBase}/api/documents/analyze`, { method: 'POST', headers, body: form });
      const payload = await response.json().catch(() => ({ error: 'invalid_gateway_response' }));
      if (!response.ok) {
        const error = new Error(payload.message || payload.error || `Document analysis failed (${response.status})`);
        error.status = response.status; error.body = payload; throw error;
      }
      return payload;
    }
  };
}
