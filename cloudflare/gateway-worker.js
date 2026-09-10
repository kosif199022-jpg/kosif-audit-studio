// KOSIF V5 gateway: Realtime + Document Intelligence + authenticated Engagement operations.
import baseWorker from './document-worker.js';
import { handleEngagementApi, persistenceHealth } from './engagement-api.js';
import { authorizeEngagementOperation } from './engagement-auth.js';

const origins=v=>String(v||'*').split(',').map(x=>x.trim()).filter(Boolean);
function protectedOriginAllowed(origin,env){const allowed=origins(env.PERSISTENCE_ALLOWED_ORIGIN||env.ALLOWED_ORIGIN);return !origin||allowed.includes('*')||allowed.includes(origin)}
function protectedCors(origin,env){const allowed=origins(env.PERSISTENCE_ALLOWED_ORIGIN||env.ALLOWED_ORIGIN),resolved=allowed.includes('*')?'*':(origin&&allowed.includes(origin)?origin:(allowed[0]||'null'));return{'Access-Control-Allow-Origin':resolved,'Access-Control-Allow-Methods':'POST,PUT,OPTIONS,GET','Access-Control-Allow-Headers':'Content-Type,Accept,Authorization,X-KOSIF-Engagement','Access-Control-Max-Age':'86400','Vary':'Origin'}}
function protectedJson(data,{status=200,headers={}}={}){return Response.json(data,{status,headers})}

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
    if(url.pathname==='/health'&&request.method==='GET'){
      const base=await baseWorker.fetch(request,env,ctx),body=await base.json().catch(()=>({ok:base.ok}));
      return Response.json({...body,engagementPersistence:persistenceHealth(env),documentUploadAuth:{required:Boolean(env.KOSIF_DB),mode:env.KOSIF_DB?'engagement-bearer':'compatibility'}},{status:base.status,headers:base.headers});
    }
    return baseWorker.fetch(request,env,ctx);
  }
};
