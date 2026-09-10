/** Browser client for KOSIF server-side document intelligence. No OpenAI API key is accepted here. */
const SESSION_KEY='kosif:v5:remote-engagement';
function browserSession(){try{return typeof localStorage!=='undefined'?JSON.parse(localStorage.getItem(SESSION_KEY)||'null')||{}:{}}catch{return{}}}
function browserEngagementToken(){return browserSession().accessToken||''}
function authHeaders({engagementId='',accessToken='',callToken='',accept='application/json'}={}){const token=callToken||accessToken||browserEngagementToken(),headers={Accept:accept};if(engagementId)headers['X-KOSIF-Engagement']=engagementId;if(token)headers.Authorization=`Bearer ${token}`;return headers}
async function jsonOrError(response,message){const payload=await response.json().catch(()=>({error:'invalid_gateway_response'}));if(!response.ok){const error=new Error(payload.message||payload.error||`${message} (${response.status})`);error.status=response.status;error.body=payload;throw error}return payload}
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
      const id = engagementId || 'ENG-UNASSIGNED';
      const form = new FormData();
      form.append('file', file, file.name || 'document.bin');
      form.append('engagementId', id);
      if (documentId) form.append('documentId', documentId);
      if (requestId) form.append('requestId', requestId);
      form.append('jurisdiction', jurisdiction);
      form.append('framework', framework);
      const headers=authHeaders({engagementId:id,accessToken,callToken,accept:'application/json'});delete headers.Accept;
      const response = await fetchImpl(`${normalizedBase}/api/documents/analyze`, { method: 'POST', headers, body: form });
      return jsonOrError(response,'Document analysis failed');
    },
    async listDocuments(engagementId,{accessToken:callToken=''}={}){
      if(!engagementId)throw new TypeError('engagementId is required');
      const response=await fetchImpl(`${normalizedBase}/api/engagements/${encodeURIComponent(engagementId)}/documents`,{headers:authHeaders({engagementId,accessToken,callToken})});
      return jsonOrError(response,'Document list failed');
    },
    async getAnalysis(documentId,{engagementId='',accessToken:callToken=''}={}){
      if(!documentId)throw new TypeError('documentId is required');
      const response=await fetchImpl(`${normalizedBase}/api/documents/${encodeURIComponent(documentId)}/analysis`,{headers:authHeaders({engagementId,accessToken,callToken})});
      return jsonOrError(response,'Document analysis fetch failed');
    },
    async getContent(documentId,{engagementId='',accessToken:callToken=''}={}){
      if(!documentId)throw new TypeError('documentId is required');
      const response=await fetchImpl(`${normalizedBase}/api/documents/${encodeURIComponent(documentId)}/content`,{headers:authHeaders({engagementId,accessToken,callToken,accept:'*/*'})});
      if(!response.ok){const payload=await response.json().catch(()=>({error:'document_content_failed'}));const error=new Error(payload.message||payload.error||`Document content failed (${response.status})`);error.status=response.status;error.body=payload;throw error}
      return response.blob();
    }
  };
}

export{authHeaders,browserEngagementToken};
