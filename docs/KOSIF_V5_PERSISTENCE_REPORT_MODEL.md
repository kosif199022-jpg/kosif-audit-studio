# KOSIF V5 — Persistence & Professional Report Model

This slice promotes the V5 continuous-review workspace from a browser-only proving ground into a remotely persisted engagement workflow while keeping KOSIF 4 available as the legacy workspace.

## Persistence contract

- The Worker exposes `POST /api/engagements`, authenticated `GET /api/engagements/:id`, and optimistic-concurrency `PUT /api/engagements/:id/state`.
- Every remote engagement receives a random bearer token. Only its SHA-256 hash is stored server-side; the token is returned once to the browser.
- Workspace state is encoded with an explicit schema wrapper so BigInt values survive JSON round-trips.
- D1 writes use a state version. A stale client receives HTTP 409 instead of silently overwriting newer work.
- Each successful snapshot save writes a lightweight hashed event to `engagement_events`.
- Worker schema creation is idempotent, so automatically provisioned empty D1 databases can initialize safely; SQL migrations remain checked in as the canonical schema history.

## Cloudflare resources

`wrangler.toml` declares D1 and R2 bindings without IDs/names so current Wrangler automatic provisioning can create resources on deploy. Production can later pin explicit resource IDs. R2 keeps original document blobs; D1 keeps metadata, analyses, claims, engagement state and hashed state-save events.

## Reporting contract

`v5/report-model.js` produces a source-backed report object before HTML rendering. Every section has status, facts/tables, source IDs and human-review flags. Unsupported outputs are explicit: for example, KOSIF will not fabricate a cash-flow statement without movements/comparatives, and it will not auto-authorize an audit opinion.

The report renderer consumes the model and exposes per-section readiness in the outline and source IDs inside the paper preview. This is the foundation for PDF/DOCX renderers later without changing audit logic.

## PWA direction

The installed PWA now starts in `continuous-review.html`. The legacy root workspace remains available. API/evidence responses are still excluded from Service Worker caching.
