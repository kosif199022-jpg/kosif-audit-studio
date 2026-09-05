# KOSIF Cloud Foundation v1 — Design

## Purpose

Move KOSIF one safe step from a browser-local audit studio toward a multi-user cloud product without changing the existing visual identity, deterministic audit engines, or Cloudflare deployment baseline.

This slice is intentionally transitional. It makes cloud identity/session state, engagement discovery, and versioned descriptive workspace state first-class server concepts. It does **not** pretend that raw trial-balance rows or evidence bytes have been migrated yet.

## Decisions

1. `codex/preserve-theme-cloudflare` remains the deployment baseline. Development occurs on `codex/cloud-foundation-v1` and merges back only after tests pass.
2. D1 remains the structured source of truth for cloud metadata. Browser storage remains a local cache/fallback during migration.
3. Existing trusted Sites identity (`oai-authenticated-user-email`) remains the only accepted user identity in this slice. Direct Cloudflare requests must stay deny-by-default until a cryptographically verified Cloudflare Access/OIDC adapter is implemented. We will not trust a client-spoofable email header.
4. Tenant authorization continues through `tenant_members`; every new route receives an explicit permission in the route manifest and RBAC matrix.
5. Workspace state is append-only and versioned with optimistic concurrency. A save never overwrites history.
6. Workspace state contains descriptive engagement/workflow metadata only. It must not contain raw account rows, source-file bytes, evidence bytes, staging buffers, secrets, or provider API keys.
7. Saves are limited to 128 KiB after canonical JSON serialization.
8. Archived engagements are read-only. Workspace revision inserts receive the same archive guard and append-only protections as other engagement-owned tables.
9. The audit log records a workspace save using revision number and content hash only; the full state is not duplicated into the log.

## API

### `GET /api/session`

Returns the authenticated subject's tenant and role after ensuring the initial tenant/member record exists.

Response shape:

```json
{
  "session": {
    "subject": "auditor@example.test",
    "tenant_id": "ten_...",
    "role": "owner",
    "capabilities": ["engagement:list", "engagement:read", "workspace:read", "workspace:write"]
  }
}
```

### `GET /api/engagements`

Lists up to 100 engagements for the authenticated tenant, newest first. Archived records are included and clearly identified by `status`/`archived_at`.

### `GET /api/engagements/:id/workspace`

Returns the latest workspace revision. If no cloud revision exists, returns revision `0` and `state: null` so the browser can offer an initial migration save.

### `PUT /api/engagements/:id/workspace`

Input:

```json
{
  "base_revision": 3,
  "state": { "version": 7, "entity": {}, "acceptance": {} }
}
```

Rules:

- `base_revision` must be a non-negative integer.
- `state` must be a JSON object.
- only approved top-level keys are retained.
- forbidden raw/binary keys cause `422` rather than silent persistence.
- serialized canonical state must be <= 131072 bytes.
- if `base_revision` is not the latest revision, return `409` with the current revision.
- archived engagements reject writes.
- successful save creates revision `base_revision + 1`, SHA-256 hash, author, timestamp, and an audit-log entry.

## Allowed workspace keys

`version`, `demoDatasetVersion`, `entity`, `acceptance`, `report`, `standardMappings`, `materialityPolicy`, `analyticsReview`, `council`, `periodLocks`, `auditTrail`, `rounds`, `evidence`, `findings`, `adjustments`, `externalAiRuns`, `sourceDataset`.

The state is still bounded by size and JSON validity; this allowlist is a migration contract, not permission to include binary data inside an allowed object.

## Database

Add `engagement_workspace_revisions`:

- `engagement_id` text
- `tenant_id` text
- `revision` integer
- `state_json` text
- `state_hash` text
- `saved_by` text
- `saved_at` text
- primary key `(engagement_id, revision)`
- composite FK `(tenant_id, engagement_id)` -> `engagements(tenant_id, id)`
- `json_valid(state_json)` check
- non-negative revision check
- append-only update/delete triggers
- archived-engagement insert guard

## Client boundary

Add `src/cloud-sync.js` as a small transport module. It exposes session/list/load/save functions and a debounced autosave controller. It does not own React state and it never serializes account arrays or file bytes itself. React integration can be introduced incrementally after the API foundation is proven.

The autosave controller only sends a snapshot supplied by the caller and requires the caller to provide the last acknowledged revision. Conflicts are surfaced to the UI rather than overwritten.

## Testing

1. Worker manifest: every new API route is declared and anonymous calls remain `401`.
2. RBAC: owner/partner/manager/senior can write workspace; viewer can read but cannot write.
3. Pure workspace sanitizer: rejects raw/binary keys, preserves only allowlisted keys, enforces object input and size limit.
4. D1 migration: cross-tenant workspace insert fails, archive insert fails, update/delete fail.
5. Packaging: migration `0002_cloud_foundation_v1.sql` is copied to Sites build.
6. Client transport: conflict errors preserve server revision; debounce coalesces rapid saves.
7. Full `npm test` is required before merge.

## Non-goals for v1

- no Cloudflare Access JWT verification yet;
- no R2 upload or evidence migration yet;
- no raw trial-balance or ledger migration through the workspace JSON endpoint;
- no billing, client portal, MFA, or external AI execution changes;
- no redesign of the three existing themes;
- no merge to `main`.

## Success criteria

The feature branch passes the complete test suite, can be merged into the Cloudflare deployment branch without changing existing public UI behavior, and establishes a secure, versioned server contract that later UI work can adopt without a database redesign.