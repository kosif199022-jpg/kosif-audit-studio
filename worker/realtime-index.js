import { handleAi } from './ai-gateway.js';
export default { async fetch(request, env) { if (new URL(request.url).pathname.startsWith('/api/ai/')) return handleAi(request, env); return new Response(JSON.stringify({error:'not_found'}), {status:404, headers:{'content-type':'application/json'}}); } };
