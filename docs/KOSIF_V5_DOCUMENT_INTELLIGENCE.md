# KOSIF V5 — Document Intelligence

## Purpose

Connect the continuous-review domain to a server-side document-intelligence gateway while preserving the deterministic accounting engine and Realtime voice endpoint.

Flow: `document -> SHA-256 -> server analysis -> claims/risk signals -> council -> governed evidence requests -> re-review -> adjustment candidate -> human decision -> adjusted TB -> report`.

## Boundaries

Document content is untrusted data. Extracted claims enter the engagement as unreviewed evidence. Risk output is a signal, not proof. Adjustment output is only a candidate until mapped to real accounts, balanced by the deterministic ledger, and explicitly accepted by a human reviewer. The gateway has no audit-opinion authority and never posts entries automatically.

## Storage

D1/R2 are optional bindings. `KOSIF_DOCUMENTS` stores source bytes with SHA-256 metadata. `KOSIF_DB` stores document metadata, analysis JSON and claims. Apply `cloudflare/migrations/0001_v5_document_intelligence.sql` after provisioning the real D1 database.

## Deployment

Source merge is not proof of production deployment. The active Worker must be redeployed after merge; D1/R2 persistence requires real Cloudflare resources and bindings.
