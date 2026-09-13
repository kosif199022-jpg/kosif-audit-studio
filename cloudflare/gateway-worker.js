// KOSIF V5 gateway: Realtime + Document Intelligence + authenticated Engagement operations.
import baseWorker from './document-worker.js';
import { handleEngagementApi, persistenceHealth } from './engagement-api.js';
import { authorizeEngagementOperation } from './engagement-auth.js';

const origins=v=>String(v||'*').split(',').map(x=>x.trim()).filter(Boolean);
function protectedOriginAllowed(origin,env){const allowed=origins(env.PERSISTENCE_ALLOWED_ORIGIN||env.ALLOWED_ORIGIN);return !origin||allowed.includes('*')||allowed.includes(origin)}
function protectedCors(origin,env){const allowed=origins(env.PERSISTENCE_ALLOWED_ORIGIN||env.ALLOWED_ORIGIN),resolved=allowed.includes('*')?'*':(origin&&allowed.includes(origin)?origin:(allowed[0]||'null'));return{'Access-Control-Allow-Origin':resolved,'Access-Control-Allow-Methods':'POST,PUT,OPTIONS,GET','Access-Control-Allow-Headers':'Content-Type,Accept,Authorization,X-KOSIF-Engagement','Access-Control-Max-Age':'86400','Vary':'Origin'}}
function protectedJson(data,{status=200,headers={}}={}){return Response.json(data,{status,headers})}
function applyProtectedHeaders(response,headers){const out=new Headers(response.headers);for(const [k,v] of Object.entries(headers))out.set(k,v);out.set('Cache-Control','private, no-store');return new Response(response.body,{status:response.status,statusText:response.statusText,headers:out})}

async function handleProtectedDocument(request,env){
  const origin=request.headers.get('Origin'),headers=protectedCors(origin,env);
  if(!protectedOriginAllowed(origin,env))return protectedJson({error:'origin_not_allowed'},{status:403,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return null;
  if(!env.KOSIF_DB?.prepare)return null;
  const engagementId=(request.headers.get('X-KOSIF-Engagement')||'').trim();
  const auth=await authorizeEngagementOperation(request,env,engagementId);
  if(!auth.authorized)return protectedJson({error:auth.error,message:auth.message||null},{status:auth.status||403,headers});
  let form;try{form=await request.clone().formData()}catch{return protectedJson({error:'invalid_multipart_form'},{status:400,headers})}
  const bodyEngagement=String(form.get('engagementId')||'').trim();
  if(bodyEngagement&&bodyEngagement!==engagementId)return protectedJson({error:'engagement_id_mismatch'},{status:409,headers});
  return null;
}

async function documentOwner(env,documentId){
  if(!env.KOSIF_DB?.prepare)return null;
  return env.KOSIF_DB.prepare('SELECT engagement_id, storage_key, mime_type, name FROM documents WHERE id=?').bind(documentId).first();
}

async function handleProtectedDocumentRead(request,env,ctx){
  const url=new URL(request.url);
  const listMatch=url.pathname.match(/^\/api\/engagements\/([^/]+)\/documents$/);
  const analysisMatch=url.pathname.match(/^\/api\/documents\/([^/]+)\/analysis$/);
  const contentMatch=url.pathname.match(/^\/api\/documents\/([^/]+)\/content$/);
  if(!listMatch&&!analysisMatch&&!contentMatch)return null;
  const origin=request.headers.get('Origin'),headers=protectedCors(origin,env);
  if(!protectedOriginAllowed(origin,env))return protectedJson({error:'origin_not_allowed'},{status:403,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='GET')return protectedJson({error:'method_not_allowed'},{status:405,headers});
  if(!env.KOSIF_DB?.prepare)return null;

  let engagementId,documentId=null,row=null;
  if(listMatch)engagementId=decodeURIComponent(listMatch[1]);
  else{
    documentId=decodeURIComponent((analysisMatch||contentMatch)[1]);
    try{row=await documentOwner(env,documentId)}catch(error){return protectedJson({error:'document_lookup_unavailable',message:error?.message||null},{status:503,headers})}
    if(!row)return protectedJson({error:'document_not_found'},{status:404,headers});
    engagementId=String(row.engagement_id||'');
    const claimed=(request.headers.get('X-KOSIF-Engagement')||'').trim();
    if(claimed&&claimed!==engagementId)return protectedJson({error:'engagement_id_mismatch'},{status:409,headers});
  }

  const auth=await authorizeEngagementOperation(request,env,engagementId);
  if(!auth.authorized)return protectedJson({error:auth.error,message:auth.message||null},{status:auth.status||403,headers});

  if(contentMatch){
    if(!env.KOSIF_DOCUMENTS?.get)return protectedJson({error:'r2_not_configured'},{status:503,headers});
    if(!row?.storage_key)return protectedJson({error:'document_content_not_persisted'},{status:404,headers});
    let object;try{object=await env.KOSIF_DOCUMENTS.get(row.storage_key)}catch(error){return protectedJson({error:'document_storage_unavailable',message:error?.message||null},{status:503,headers})}
    if(!object)return protectedJson({error:'document_content_not_found'},{status:404,headers});
    const out=new Headers(headers);out.set('Content-Type',row.mime_type||object.httpMetadata?.contentType||'application/octet-stream');out.set('Cache-Control','private, no-store');out.set('X-KOSIF-Document',documentId);out.set('X-Content-Type-Options','nosniff');
    const safeName=encodeURIComponent(String(row.name||'document').replace(/[\r\n]/g,' '));out.set('Content-Disposition',`inline; filename*=UTF-8''${safeName}`);
    return new Response(object.body,{status:200,headers:out});
  }

  const response=await baseWorker.fetch(request,env,ctx);
  return applyProtectedHeaders(response,headers);
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/engagements')){
      const response=await handleEngagementApi(request,env);
      if(response)return response;
    }
    if(url.pathname==='/api/documents/analyze'){
      const protectedResponse=await handleProtectedDocument(request,env);
      if(protectedResponse)return protectedResponse;
    }
    const protectedRead=await handleProtectedDocumentRead(request,env,ctx);
    if(protectedRead)return protectedRead;
    if(url.pathname==='/health'&&request.method==='GET'){
      const base=await baseWorker.fetch(request,env,ctx),body=await base.json().catch(()=>({ok:base.ok}));
      return Response.json({...body,engagementPersistence:persistenceHealth(env),documentUploadAuth:{required:Boolean(env.KOSIF_DB),mode:env.KOSIF_DB?'engagement-bearer':'compatibility'},documentReadAuth:{required:Boolean(env.KOSIF_DB),mode:env.KOSIF_DB?'engagement-bearer':'compatibility'}},{status:base.status,headers:base.headers});
    }
    return baseWorker.fetch(request,env,ctx);
  }
};

export{handleProtectedDocumentRead,documentOwner};
