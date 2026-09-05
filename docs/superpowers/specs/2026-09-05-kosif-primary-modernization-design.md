# KOSIF Stable — Primary Product Modernization Design

## Status
Approved architectural design pending written-spec review.

## Context
KOSIF Stable (`kosif-audit-studio`) is now the primary product, primary repository, and primary user experience for the project.

The earlier SEE work remains a source of stronger implementation patterns—Cloudflare Worker APIs, D1/R2 persistence, human authority gates, append-only audit events, traceability, safer PWA behavior, and governed deployment—but SEE is no longer the product shell that KOSIF must conform to.

The modernization goal is therefore to evolve KOSIF from the inside while preserving its current identity, professional workflow, and interaction model.

## Architectural classification
This is an architectural modernization, not a bounded refactor.

It changes state ownership, persistence, authority boundaries, API contracts, deployment behavior, and the way existing frontend modules obtain and mutate professional data.

## Primary decision
Use **progressive internal modernization**.

KOSIF remains the product and UI. The internals are upgraded in controlled layers:

`KOSIF UI → typed audit core → Cloudflare Worker API → D1 + R2`

The static/current application is not replaced in one rewrite. Existing screens remain usable while capabilities are moved behind typed engines and server-backed repositories module by module.

## Goals

1. Keep KOSIF Stable as the canonical product experience.
2. Preserve current professional capabilities and regression behavior during migration.
3. Move authoritative professional state from browser-local storage to D1.
4. Move retained evidence/source files to R2.
5. Introduce typed deterministic engines for calculations and signals.
6. Enforce human-only professional approvals and closure decisions on the server.
7. Add tamper-evident audit history.
8. Modernize UI implementation progressively without a big-bang rewrite.
9. Keep deployment continuously usable after each wave.
10. Reuse the strongest architectural lessons from SEE without making KOSIF a copy of SEE.

## Non-goals

- Do not replace KOSIF identity with SEE branding or navigation.
- Do not perform a full React rewrite before proving parity.
- Do not keep `localStorage` as an authoritative professional database.
- Do not auto-migrate unknown legacy browser state into production truth.
- Do not grant AI or reviewer-council automation approval authority.
- Do not duplicate official standards text unnecessarily.
- Do not introduce a second professional source of truth during migration.
- Do not deploy incomplete migration waves to production as if they are complete.

# 1. Target architecture

## 1.1 Presentation layer

KOSIF remains the visible product.

During early migration the existing `index.html`, `styles.css`, `app.js`, `engine.js`, `data.js`, and `moon-core.js` may remain in place while their responsibilities are reduced.

Newer UI modules can be introduced progressively. The implementation technology may evolve, but screen behavior, workflow reachability, RTL support, light/dark styling, and KOSIF visual identity remain the compatibility target.

## 1.2 Typed audit core

Deterministic professional logic is extracted from large frontend scripts into focused modules with explicit inputs and outputs.

Core modules include:

- money/minor-unit parsing;
- trial-balance validation;
- account classification;
- materiality;
- sampling;
- risk signals;
- journal signals;
- evidence quality;
- trace health;
- engagement rounds;
- standards/source metadata;
- reporting/readiness helpers.

Each module must be independently testable and must not depend on DOM state or browser-local persistence.

## 1.3 Repository/adapter boundary

Existing KOSIF UI does not access persistence directly once a module enters migration.

A compatibility repository layer sits between UI and state:

`Legacy/New UI → repository interface → API-backed implementation`

A legacy implementation may exist temporarily for modules not yet migrated, but each module has exactly one authoritative owner at a time.

When a module is declared migrated, its legacy write path is disabled rather than kept as a silent fallback.

## 1.4 Cloudflare Worker API

Professional reads and mutations move behind `/api/v1`.

The Worker is responsible for:

- validation;
- authorization/actor context;
- human authority gates;
- D1 transactions;
- R2 evidence/source-object operations;
- append-only audit events;
- integrity verification;
- stable error codes;
- production health reporting.

The client is never trusted to enforce professional approval rules by itself.

## 1.5 D1 as professional source of truth

D1 owns professional metadata and engagement state once migrated.

Core entities include:

- engagements;
- trial-balance imports and lines;
- account mappings/classifications;
- materiality revisions;
- risks, risk signals, and risk responses;
- journal entries and review runs/items/decisions;
- procedures and procedure runs;
- PBC requests;
- workpapers;
- review notes;
- evidence metadata and links;
- evidence-quality assessments;
- round decisions;
- standards usage;
- report versions;
- archive snapshots;
- migration records;
- audit events and event-chain metadata.

Schemas are additive and migration-safe. Existing professional history is not overwritten merely to fit a new shape.

## 1.6 R2 as retained-object store

R2 stores retained evidence files and explicitly retained import/source files.

D1 stores object metadata, SHA-256, provenance, relationship links, status, and review information.

The browser does not become long-term evidence storage.

# 2. Progressive conversion strategy

## 2.1 Baseline first

Before architectural migration, current KOSIF behavior is treated as a regression baseline.

Existing tests remain in force, including deterministic demo behavior, money parsing, CSV handling, materiality behavior, sampling, journal indicators, evidence quality, standards metadata, event-chain expectations, human archive gates, and other currently tested KOSIF behavior.

Where an important current behavior has no regression test, a characterization test is added before changing that flow.

## 2.2 Extract engines before replacing screens

Calculation and signal logic is moved first.

The old UI calls the extracted engine through compatibility adapters so visual rewrites are not required to gain determinism and testability.

This reduces risk because logic ownership changes before interaction ownership changes.

## 2.3 Introduce API-backed repositories

After engine extraction, each professional domain receives a repository interface.

The first API-backed implementation becomes authoritative for that domain after its migration gate passes.

No screen may write both D1 and localStorage as co-equal truth.

## 2.4 Move authority to the server

Human-sensitive actions are enforced by the Worker regardless of client behavior.

At minimum the following remain human-only:

- materiality approval;
- high-risk closure/acceptance;
- review-note clearance;
- report approval;
- archive snapshot creation/approval;
- posting or accepting accounting conclusions where applicable.

AI, Moon, or advisory councils may generate analysis, suggestions, or challenge prompts, but cannot complete these actions.

## 2.5 Modernize UI module by module

Recommended migration order:

1. Command Center / Engagement shell
2. Trial Balance and planning
3. Materiality and risk
4. Journal Review
5. Procedures, PBC, workpapers, and review notes
6. Evidence and trace
7. Rounds A01–A10
8. Standards and knowledge
9. Council/advisory surfaces
10. Reports, exports, and archive

The user experience remains recognizably KOSIF throughout.

# 3. Data model and migration assistant

## 3.1 Core data ownership

After migration of a domain, D1 is the only professional authority for that domain.

`localStorage` is limited to non-sensitive UI preferences such as theme, density, language preference, dismissed tips, or similar presentation-only settings.

## 3.2 Legacy migration assistant

Legacy KOSIF state is migrated through an explicit assistant:

`Export legacy state → Preview → Validate → Conflict review → Human confirm → Import to D1`

The import must not silently read browser state and promote it to production truth.

## 3.3 Migration metadata

Every legacy migration records at least:

- migration ID;
- source format/version;
- source SHA-256;
- source environment if known;
- importing actor;
- import timestamp;
- validation result;
- conflict summary;
- imported entity counts;
- rejected/unmapped records;
- engine/parser version.

## 3.4 Idempotency

Migration imports are idempotent.

The same source package cannot create duplicate professional entities when replayed.

Duplicate detection uses stable source identity/hash plus entity-level legacy identifiers where available.

## 3.5 Ambiguous legacy data

If legacy data cannot be mapped reliably, the migration assistant marks it `needs_review` rather than inventing relationships.

Human confirmation is required before ambiguous records become linked professional state.

## 3.6 Original legacy package

The user may keep the exported legacy JSON package as a historical source artifact.

After successful migration, edits to that old package cannot alter D1 state.

# 4. Professional entities

## 4.1 Engagements

Engagement records own client, period, lifecycle, status, and engagement-level configuration.

## 4.2 Trial balance

Use `trial_balance_imports` and `trial_balance_lines` with provenance.

Required capabilities include CSV/XLSX support, Arabic/English headers, exact minor-unit parsing, balance validation, duplicate checks, source hash, parser version, and accepted mapping metadata.

## 4.3 Materiality

Materiality is revision-based and immutable once superseded.

A revision can contain:

- benchmark type and amount;
- overall materiality;
- performance materiality;
- trivial threshold;
- risk profile;
- deterministic policy version;
- rationale;
- reviewer/approver metadata;
- supersession link.

## 4.4 Risks and deterministic signals

`risk_signals` are explainable deterministic indicators.

`risks` remain professional judgments.

A signal can suggest or support a risk, but cannot become a final professional conclusion automatically.

## 4.5 Journal review

Journal state includes source entries, deterministic review runs, flagged items, signal rationales, human dispositions, reviewer identity, and immutable decision history where required.

## 4.6 Procedures, PBC, workpapers, and review notes

These entities support fieldwork execution and review workflow.

Closing or clearing professional items records actor, rationale, timestamp, and audit event.

## 4.7 Evidence

Evidence metadata is stored in D1 and retained objects in R2.

Evidence includes SHA-256, MIME/size, provenance, review status, risk/procedure/workpaper links, and immutable evidence-quality snapshots.

Evidence quality is an indicator, not a sufficiency conclusion.

## 4.8 Trace

Trace health exposes missing links and covered paths such as:

`account → risk → procedure → run → evidence → workpaper → finding/conclusion → report`

Trace coverage must not be presented as an audit opinion.

## 4.9 Rounds

A01–A10 decisions remain explicit, versioned where needed, and tied to actor/rationale.

## 4.10 Standards and knowledge

Static standards/source cards remain source-controlled typed data where practical.

Engagement-specific use is persisted in D1.

Reference metadata distinguishes current, adopted, transition, historical, training, and local material with source/version/effective-date/jurisdiction/license/provenance fields.

## 4.11 Reports and archive

Reports are versioned and governed.

Archive snapshots are immutable closure records created only after required human approvals, readiness checks, evidence/trace requirements, and audit-chain integrity conditions are satisfied.

# 5. Audit integrity

Every professional mutation creates an append-only audit event.

A server-side hash chain makes historical changes detectable.

The chain includes:

- deterministic sequence;
- event ID;
- canonical event payload;
- actor;
- action;
- entity type/ID;
- timestamp;
- previous hash;
- event hash;
- algorithm/version.

Hash-chain verification failure is surfaced prominently and can block archive when chain integrity is a configured prerequisite.

This mechanism provides tamper evidence, not external notarization or a digital signature.

# 6. API and error model

All newly governed professional APIs live under `/api/v1`.

Representative resources include:

- `/engagements`
- `/engagements/:id/trial-balance`
- `/engagements/:id/materiality`
- `/engagements/:id/risks`
- `/engagements/:id/risk-signals`
- `/engagements/:id/journal`
- `/engagements/:id/procedures`
- `/engagements/:id/pbc`
- `/engagements/:id/workpapers`
- `/engagements/:id/review-notes`
- `/engagements/:id/evidence`
- `/engagements/:id/rounds`
- `/engagements/:id/standard-usages`
- `/engagements/:id/reports`
- `/engagements/:id/archive-snapshots`
- `/engagements/:id/audit-events/integrity`
- `/migrations/legacy-kosif`

Mutations return stable machine-readable error codes plus user-facing Arabic messages where appropriate.

Validation failures identify source row/column/sheet for imports when possible.

Authority failures identify the unmet gate without exposing secrets or internal implementation details.

No API failure is replaced by invented production values in the UI.

# 7. Security and privacy

## 7.1 Client trust boundary

The browser is not trusted to enforce professional authority.

Client-side disabling of a button is only a UX affordance; the Worker must reject unauthorized state transitions.

## 7.2 Secrets

No secret tokens or Cloudflare credentials are embedded in client assets.

## 7.3 Evidence privacy

Evidence and authenticated API payloads are never cached by the service worker.

The PWA may cache only the static shell and safe public assets.

## 7.4 Demo versus real-client mode

Demo/public-pilot mode is operationally separate from real-client use.

Real client data is not permitted until deployment access controls are configured and verified.

## 7.5 AI authority

AI/advisory outputs are labeled as advisory.

They cannot approve materiality, clear review notes, close high risks, approve final reports, create final archive snapshots, or claim a statutory audit opinion.

# 8. Testing strategy

Use TDD for each new implementation capability.

## 8.1 Characterization/regression tests

Before changing a current KOSIF flow, capture its expected behavior if it is not already tested.

Existing regression tests remain part of the contract.

## 8.2 Engine tests

Typed engines receive deterministic unit tests for money parsing, TB validation, materiality, sampling, risk signals, journal signals, evidence quality, trace health, and other extracted logic.

## 8.3 Repository/API tests

Each migrated domain tests:

- reads;
- writes;
- validation;
- actor/rationale requirements;
- authority gates;
- idempotency where relevant;
- legacy-state independence after cutover.

## 8.4 Migration tests

Migration tests cover:

- valid legacy package;
- invalid package;
- duplicate replay;
- ambiguous relationships;
- conflict reporting;
- partial/rejected records;
- stable source hash behavior.

## 8.5 Integrity tests

Audit-chain tests prove that modifying a historical event payload causes verification failure.

Archive tests prove that human approval and configured integrity/readiness gates cannot be bypassed from the client.

## 8.6 UI tests

UI coverage verifies module reachability, current server state rendering, loading/empty/error states, RTL behavior, accessibility basics, and absence of confidential PWA caching.

## 8.7 Release verification

A production release is not declared successful until the current release run proves:

1. dependency install;
2. full automated tests;
3. typecheck/lint where configured;
4. production build;
5. D1 migration validation/application;
6. R2 binding/bucket readiness;
7. Cloudflare deployment;
8. production health check.

# 9. Delivery waves

## Wave 0 — Baseline and repository boundary

- lock current behavior with tests;
- introduce typed project structure;
- define repository interfaces;
- add compatibility adapters;
- establish CI baseline.

## Wave 1 — Typed audit engines

- extract money/TB/materiality/sampling/risk/journal/evidence/trace logic;
- preserve current UI through adapters;
- prove deterministic parity with tests.

## Wave 2 — D1/R2 and `/api/v1`

- introduce Cloudflare Worker API;
- create additive D1 schema/migrations;
- add R2 evidence/source-object support;
- migrate engagement shell and first read/write domains.

## Wave 3 — Server authority and audit integrity

- enforce human-only gates;
- append audit events for professional mutations;
- add event hash-chain generation and verification;
- add readiness/archive blockers.

## Wave 4 — Legacy Migration Assistant

- export package format;
- preview and validation;
- conflict review;
- idempotent D1 import;
- explicit human confirmation;
- domain-level cutover markers.

## Wave 5 — Progressive UI modernization

Modernize KOSIF screens without replacing KOSIF identity.

Move modules one by one to API-backed components while preserving workflow and design compatibility.

## Wave 6 — Reports, exports, and archive

- versioned reporting;
- controlled JSON/CSV exports;
- browser print/PDF surface;
- immutable archive snapshot;
- final trace/readiness integration.

## Wave 7 — Production hardening

- access control verification;
- real-client-mode policy;
- monitoring/health behavior;
- PWA security review;
- migration rollback/operational documentation;
- final mobile/accessibility review.

Each wave must leave the application usable and CI green before the next wave is considered complete.

# 10. Cutover rules

A professional domain is considered migrated only when:

1. its current behavior is regression-covered;
2. its deterministic logic is extracted/tested where applicable;
3. its repository interface is API-backed;
4. D1/R2 persistence is verified;
5. server-side authority rules are enforced;
6. UI reads production state through the repository/API;
7. legacy writes for that domain are disabled;
8. migration behavior is documented/tested if legacy state exists.

There is no global big-bang cutover.

# 11. Compatibility principles

- KOSIF remains the visible product throughout modernization.
- Existing workflows are preserved unless an approved governance/security change intentionally strengthens them.
- Browser-local professional state is phased out, not silently synchronized forever.
- SEE code is a source of patterns and reusable concepts, not a second runtime dependency.
- Static standards/reference content remains distinguishable from engagement-specific professional decisions.
- Historical/training/local material is never presented as current authoritative guidance without status/provenance.

# 12. Acceptance criteria

The modernization program succeeds when:

- KOSIF Stable is still recognizably the same product experience;
- D1 is the authoritative store for migrated professional domains;
- R2 stores retained evidence/source objects;
- `localStorage` contains presentation-only preferences;
- deterministic engines are typed and tested;
- existing KOSIF professional behavior remains regression-covered;
- human-only authority is enforced server-side;
- audit history is append-only and tamper-evident;
- the Legacy Migration Assistant is explicit, reviewable, and idempotent;
- migrated UI modules use `/api/v1` rather than browser-local professional state;
- PWA caching excludes authenticated APIs and evidence;
- reports/archive remain human-gated;
- real client data is blocked until production access controls are verified;
- production deployment is declared successful only after fresh CI, migration, deployment, and health evidence.

# 13. Implementation constraints

- Use additive, reversible migrations wherever feasible.
- Never delete legacy user data as an automatic consequence of successful migration.
- Avoid unrelated refactors outside the domain being migrated.
- Keep modules small enough to understand and test independently.
- Preserve deterministic seeds/versions in reproducible engines.
- Use integer/minor-unit money representations for professional calculations.
- Preserve source/version/provenance metadata for imported data and reference materials.
- Do not make unsupported claims that a migrated feature has parity until its tests and production path prove it.
