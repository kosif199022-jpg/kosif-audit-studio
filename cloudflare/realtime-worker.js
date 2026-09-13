// KOSIF Audit Studio — Cloudflare Worker for OpenAI Realtime WebRTC
// Required secret binding: OPENAI_API_KEY
// Optional plain-text binding: ALLOWED_ORIGIN (defaults to *)

function cors(origin, allowedOrigin) {
  const allowed = allowedOrigin || '*';
  const resolved = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  return {
    'Access-Control-Allow-Origin': resolved,
    'Access-Control-Allow-Methods': 'POST,OPTIONS,GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request.headers.get('Origin'), env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'kosif-realtime', configured: Boolean(env.OPENAI_API_KEY) }, { headers });
    }

    if (url.pathname !== '/api/realtime/session' || request.method !== 'POST') {
      return Response.json({ error: 'not_found' }, { status: 404, headers });
    }

    if (!env.OPENAI_API_KEY) {
      return Response.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 503, headers });
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/sdp')) {
      return Response.json({ error: 'Content-Type must be application/sdp' }, { status: 415, headers });
    }

    const sdp = await request.text();
    if (!sdp || sdp.length > 200_000) {
      return Response.json({ error: 'Invalid SDP offer' }, { status: 400, headers });
    }

    const session = {
      type: 'realtime',
      model: 'gpt-realtime',
      instructions: 'أنت مساعد KOSIF للمراجعة المالية. تحدث بالعربية بوضوح واختصار. لا تدّع تنفيذ إجراء لم يحدث داخل التطبيق. القرار المهني النهائي للمراجع البشري.',
      audio: {
        input: {
          transcription: { model: 'gpt-4o-mini-transcribe', language: 'ar' },
          turn_detection: { type: 'server_vad' }
        },
        output: { voice: 'marin' }
      }
    };

    const form = new FormData();
    form.append('sdp', sdp);
    form.append('session', JSON.stringify(session));

    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form
    });

    const body = await upstream.text();
    const responseHeaders = new Headers(headers);
    responseHeaders.set('Content-Type', upstream.headers.get('Content-Type') || 'application/sdp');
    const location = upstream.headers.get('Location');
    if (location) responseHeaders.set('X-Realtime-Call-Location', location);

    return new Response(body, { status: upstream.status, headers: responseHeaders });
  }
};
