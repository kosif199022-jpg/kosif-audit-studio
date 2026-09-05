# KOSIF Cloud Foundation v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a secure, versioned D1-backed cloud session and engagement workspace-state contract without changing the existing KOSIF UI or weakening authentication.

**Architecture:** Extend the existing Worker route manifest and RBAC matrix, add one append-only D1 table for descriptive workspace revisions, and add a small browser transport module. Existing Sites identity remains authoritative; direct Cloudflare identity is intentionally not broadened in this slice. Workspace writes use optimistic concurrency and canonical SHA-256 hashing.

**Tech Stack:** React 19, Vite 6, Cloudflare Workers/Pages, D1/SQLite, Drizzle schema, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-05-cloud-foundation-v1-design.md`

## Global Constraints

- Preserve the three existing themes and current public UI behavior.
- Never trust a client-supplied Cloudflare email header without cryptographic identity verification.
- All new API routes are deny-by-default and explicitly permissioned.
- Workspace state is append-only, tenant-isolated, optimistic-concurrency controlled, and <= 131072 canonical UTF-8 bytes.
- Workspace state excludes raw account rows, source/evidence bytes, staging buffers, secrets, and API keys.
- Do not merge to `main`; target `codex/preserve-theme-cloudflare` only after verification.

---

### Task 1: Add branch CI and establish a green baseline

**Files:**
- Create: `.github/workflows/cloud-foundation-v1.yml`

**Interfaces:**
- Consumes: existing `npm test` script.
- Produces: push/PR CI for `codex/cloud-foundation-v1`.

- [ ] **Step 1: Create CI workflow**

```yaml
name: Cloud Foundation v1 CI
on:
  push:
    branches: [codex/cloud-foundation-v1]
  pull_request:
    branches: [codex/preserve-theme-cloudflare]
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Push and verify baseline**

Expected: workflow completes successfully before feature tests are introduced.

### Task 2: Define failing Worker and D1 tests

**Files:**
- Modify: `tests/sites-worker.test.mjs`
- Modify: `tests/d1-integrity.test.mjs`

**Interfaces:**
- Consumes: `API_ROUTE_MANIFEST`, `ROLE_PERMISSIONS`, new exported `normalizeWorkspaceState`.
- Produces: executable contract for routing, permissions, sanitizer, migration guards.

- [ ] **Step 1: Add Worker contract tests**

Add assertions for:

```js
assert.equal(API_ROUTE_MANIFEST.some(r => r.method === 'GET' && r.path === '/api/session'), true);
assert.equal(API_ROUTE_MANIFEST.some(r => r.method === 'GET' && r.path === '/api/engagements'), true);
assert.equal(API_ROUTE_MANIFEST.some(r => r.method === 'GET' && r.path === '/api/engagements/:id/workspace'), true);
assert.equal(API_ROUTE_MANIFEST.some(r => r.method === 'PUT' && r.path === '/api/engagements/:id/workspace'), true);
assert.equal(authorizeRole('viewer', 'workspace:read'), true);
assert.equal(authorizeRole('viewer', 'workspace:write'), false);
assert.equal(authorizeRole('senior', 'workspace:write'), true);
```

Test `normalizeWorkspaceState` with an allowlisted object and with forbidden `accounts` and invalid non-object input.

- [ ] **Step 2: Add D1 guard tests**

After migrations, insert revision 1 for `eng_1`, verify cross-tenant insert fails, verify update/delete fail, archive `eng_1` and verify a new revision insert fails.

- [ ] **Step 3: Update packaging expectation**

Expected migrations:

```js
[
  '0000_execution_contract_v1_1.sql',
  '0001_execution_guards.sql',
  '0002_cloud_foundation_v1.sql'
]
```

- [ ] **Step 4: Push tests and verify RED**

Expected: CI fails because new routes/export/migration do not exist.

### Task 3: Add D1 workspace revision model

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle/0002_cloud_foundation_v1.sql`

**Interfaces:**
- Produces table `engagement_workspace_revisions`.

- [ ] **Step 1: Add Drizzle schema**

Define columns and constraints exactly as the design spec states, including composite tenant/engagement FK and JSON/revision checks.

- [ ] **Step 2: Add migration SQL**

Create the table, indexes, append-only update/delete triggers, and archived-engagement insert guard.

- [ ] **Step 3: Push and verify**

Expected: D1 tests for the new table pass; Worker tests remain red until Task 4.

### Task 4: Implement Worker cloud API contract

**Files:**
- Modify: `worker/index.js`

**Interfaces:**
- Produces: `GET /api/session`, `GET /api/engagements`, `GET /api/engagements/:id/workspace`, `PUT /api/engagements/:id/workspace`, exported `normalizeWorkspaceState`.

- [ ] **Step 1: Extend permissions and manifest**

Add `session:read`, `engagement:list`, `workspace:read`, `workspace:write`; viewer has read/list/session but not write.

- [ ] **Step 2: Implement `normalizeWorkspaceState`**

Use the exact allowlist from the spec, reject forbidden raw/binary keys, canonicalize the retained object, and enforce the 131072-byte UTF-8 limit.

- [ ] **Step 3: Implement session/list/read/write handlers**

Ensure tenant on session/list, scope all engagement reads by tenant, return revision 0 when no workspace exists, enforce optimistic concurrency, write revision/hash/audit-log atomically with D1 `batch`.

- [ ] **Step 4: Run CI**

Expected: Worker and D1 tests pass.

### Task 5: Add browser cloud transport with conflict-safe autosave

**Files:**
- Create: `src/cloud-sync.js`
- Create: `tests/cloud-sync.test.mjs`

**Interfaces:**
- Produces: `getCloudSession`, `listCloudEngagements`, `loadCloudWorkspace`, `saveCloudWorkspace`, `createWorkspaceAutosave`.

- [ ] **Step 1: Write failing transport tests**

Test path/method/body, `409` conflict exposing `currentRevision`, and debounce coalescing rapid saves.

- [ ] **Step 2: Push and verify RED**

Expected: CI fails because `src/cloud-sync.js` does not exist.

- [ ] **Step 3: Implement minimal transport**

Use same-origin fetch with JSON, no credentials or secrets stored by the module, structured `CloudSyncError`, and caller-supplied snapshots/revisions.

- [ ] **Step 4: Push and verify GREEN**

Expected: complete `npm test` passes.

### Task 6: Document the delivered boundary and merge safely

**Files:**
- Modify: `README.md`
- Modify: `docs/CLOUDFLARE_BASELINE_ADOPTION.md`

**Interfaces:**
- Produces: accurate operator documentation.

- [ ] **Step 1: Document cloud foundation**

State that D1 workspace revision APIs are available behind the existing trusted identity boundary, raw source/evidence migration remains future work, and direct Cloudflare identity remains denied until verified auth is configured.

- [ ] **Step 2: Run final CI verification**

Expected: full suite green on the final feature-branch commit.

- [ ] **Step 3: Open PR**

Base: `codex/preserve-theme-cloudflare`; head: `codex/cloud-foundation-v1`.

- [ ] **Step 4: Merge only if verified**

Use squash or merge according to repository policy; do not target `main`.