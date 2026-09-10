# KOSIF V5 — Continuous Audit & Financial Reporting Core

## Product contract

KOSIF V5 is organized around one governed loop:

`Document -> Understanding -> Issue/Risk -> Council -> Evidence Request -> New Evidence -> Council Re-review -> Adjustment -> Completion -> Report`

The deterministic accounting engine remains authoritative for money, balancing, materiality arithmetic, sampling arithmetic, financial-statement derivation and other accountable calculations. AI/council layers may explain, challenge, classify and propose, but may not silently alter source financial data or issue a final professional opinion.

## Migration strategy

This is a strangler migration, not a rewrite. Existing KOSIF 4 remains operational while V5 domain modules are introduced beside it. New workflows should call pure V5 modules. Existing `app.js` should then shrink gradually until it becomes bootstrap/navigation/orchestration only.

## New domain objects

- Engagement
- Document / DocumentVersion
- Evidence
- Issue
- EvidenceRequest
- CouncilRound
- Adjustment / AdjustmentLine
- Decision
- ReportRun
- DomainEvent

Future iterations add Claim/Extraction as first-class persisted entities when the server-side document pipeline is connected.

## Modules delivered in this slice

- `v5/engagement-machine.js`: pure engagement state machine, blockers, report readiness and next-action engine.
- `v5/evidence-requests.js`: governed, deduplicated evidence requests with explicit acceptance criteria.
- `v5/review-loop.js`: immutable council rounds, evidence batches, request refresh and round delta/readiness.
- `v5/adjustment-ledger.js`: balanced double-entry proposals, human decisions and adjusted-trial-balance derivation without mutating source rows.
- `v5/report-recipes.js`: intent-driven report recipes; Arabic `ميزانية` resolves to Statement of Financial Position and requirements activate by account categories.
- `v5/traceability.js`: graph linking documents, evidence, issues, requests, rounds, adjustments and reports.
- `continuous-review.html/js/css`: V5 proving-ground interface reusing current KOSIF deterministic analysis and governed council for structured trial-balance data.

## Required next migration slices

1. Persist Engagement/Document/Evidence/Request/CouncilRound/Adjustment/Report in D1 and files in R2.
2. Add server-side document intake: SHA-256, MIME/magic-byte validation, classification, extraction, claims, period/entity/currency/unit normalization.
3. Replace current PBC strings with persisted EvidenceRequest objects.
4. Adapt the existing council UI to CouncilRound objects and round deltas.
5. Move findings to Issue objects without losing legacy exports.
6. Route accepted Adjustments into statements; keep original trial balance immutable.
7. Replace `renderReports()` string assembly with ReportModel -> section builders -> quality gates -> renderer pipeline.
8. Add runtime schemas for AI/API outputs; document text is always untrusted data, never instruction authority.
9. Migrate localStorage-only engagement persistence to server-backed storage with optimistic concurrency and role permissions.
10. Transition stable domain contracts to TypeScript while keeping legacy JS adapters.

## Hard invariants

- No floating point for accountable money.
- No automatic posting of AI-proposed adjustments.
- No mutation of original trial balance or prior council rounds.
- Every accepted adjustment must balance and have human actor + rationale.
- Missing critical evidence can block completion or create a scope-limitation condition; it must never be treated as favorable evidence.
- Report readiness is explainable through explicit checks, not an opaque AI score.
- Every material report number/judgment should ultimately trace to source facts/evidence and decision history.
- Standard requirements, firm policy and KOSIF heuristics must remain distinguishable.
