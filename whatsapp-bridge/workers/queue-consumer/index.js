// Sends one queued bundle at a time through the bridge. The idempotency key from the
// dispatcher makes retries safe: the bridge skips anything that already went out.
const RETRY_S = 120;

export default {
  async fetch() {
    return new Response('KOSIF paced queue consumer online\n');
  },
  async queue(batch, env) {
    for (const msg of batch.messages) {
      try {
        const r = await env.DISPATCH.fetch(new Request('https://wa-kosif-dispatch.internal/internal-bundle', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(msg.body),
        }));
        const text = await r.text();
        // 4xx other than 409/424 (bad number, bad request) will not succeed on retry.
        const permanent = r.status >= 400 && r.status < 500 && r.status !== 409 && r.status !== 424;
        console.log(JSON.stringify({ key: msg.body.idempotencyKey, status: r.status, attempts: msg.attempts, body: text.slice(0, 500) }));
        if (r.ok || permanent) msg.ack();
        else msg.retry({ delaySeconds: RETRY_S });
      } catch (e) {
        console.error(JSON.stringify({ key: msg.body?.idempotencyKey, error: String(e?.message || e) }));
        msg.retry({ delaySeconds: RETRY_S });
      }
    }
  },
};
