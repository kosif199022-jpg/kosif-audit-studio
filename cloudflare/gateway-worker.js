// KOSIF V5 gateway: delegates Realtime/Document Intelligence to the existing worker
// and owns authenticated Engagement Persistence as a separate module.
import baseWorker from './document-worker.js';
import { handleEngagementApi, persistenceHealth } from './engagement-api.js';

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/engagements')){
      const response=await handleEngagementApi(request,env);
      if(response)return response;
    }
    if(url.pathname==='/health'&&request.method==='GET'){
      const base=await baseWorker.fetch(request,env,ctx),body=await base.json().catch(()=>({ok:base.ok}));
      return Response.json({...body,engagementPersistence:persistenceHealth(env)},{status:base.status,headers:base.headers});
    }
    return baseWorker.fetch(request,env,ctx);
  }
};
