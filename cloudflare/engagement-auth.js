// KOSIF V5 — shared engagement-token authorization for protected document operations.
function bearer(request){const m=(request.headers.get('Authorization')||'').match(/^Bearer\s+(.+)$/i);return m?.[1]?.trim()||null}
async function sha256(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value,d=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function timingSafeEqual(a='',b=''){a=String(a);b=String(b);if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
export async function authorizeEngagementOperation(request,env,engagementId){
  if(!env.KOSIF_DB?.prepare)return{required:false,authorized:true};
  if(!engagementId)return{required:true,authorized:false,status:400,error:'engagement_header_required'};
  const token=bearer(request);if(!token)return{required:true,authorized:false,status:401,error:'authorization_required'};
  try{const row=await env.KOSIF_DB.prepare('SELECT access_token_hash FROM engagement_sessions WHERE engagement_id=?').bind(String(engagementId)).first();if(!row)return{required:true,authorized:false,status:404,error:'engagement_not_found'};if(!timingSafeEqual(await sha256(token),row.access_token_hash))return{required:true,authorized:false,status:403,error:'invalid_engagement_token'};return{required:true,authorized:true}}
  catch(error){return{required:true,authorized:false,status:503,error:'engagement_authorization_unavailable',message:error?.message||'authorization query failed'}}
}
export{bearer,timingSafeEqual};
