/** KOSIF V5 — authenticated optimistic-concurrency client for engagement persistence. */
import { toWireState, fromWireState } from './state-codec.js';

function cleanBase(baseUrl='') { return String(baseUrl).trim().replace(/\/$/, ''); }
async function responseJson(response) { const body = await response.json().catch(() => ({})); if (!response.ok) { const e = new Error(body.message || body.error || `HTTP ${response.status}`); e.status = response.status; e.body = body; throw e; } return body; }

export function createEngagementPersistenceClient({ baseUrl, fetchImpl = fetch } = {}) {
  const base = cleanBase(baseUrl);
  if (!base) throw new TypeError('baseUrl is required');
  const auth = token => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  return {
    async health() { return responseJson(await fetchImpl(`${base}/health`, { headers: { Accept: 'application/json' } })); },
    async create(metadata={}) {
      return responseJson(await fetchImpl(`${base}/api/engagements`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(metadata) }));
    },
    async load(engagementId, accessToken) {
      const body = await responseJson(await fetchImpl(`${base}/api/engagements/${encodeURIComponent(engagementId)}`, { headers: auth(accessToken) }));
      return { ...body, state: body.state ? fromWireState(body.state) : null };
    },
    async save(engagementId, accessToken, state, expectedVersion) {
      const body = await responseJson(await fetchImpl(`${base}/api/engagements/${encodeURIComponent(engagementId)}/state`, {
        method:'PUT', headers:auth(accessToken), body:JSON.stringify({ expectedVersion, state:toWireState(state) })
      }));
      return body;
    }
  };
}
