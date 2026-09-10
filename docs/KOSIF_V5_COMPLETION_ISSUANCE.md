# KOSIF V5 — Completion & Controlled Report Issuance

This slice converts completion from an implicit report score into an explicit professional workflow.

## Separation of authority

Completion requirements are either **system-derived** or **human professional decisions**. System gates read facts such as open evidence requests, unresolved issues, pending adjustments, council completion and traceability health. Human gates require an identified human actor and rationale; AI actors are rejected by domain code.

For audit/review engagements the human completion set includes materiality approval, subsequent events, going concern, related parties, legal/contingencies, written representations, KAM determination and uncorrected misstatements. Preparation engagements use a final statement-presentation review, with an additional disclosure review for full financial statements.

## Append-only decisions

A completion decision never overwrites the prior decision. Reassessment creates a new `CMP-*` entry linked through `previousDecisionId`. A reviewer can therefore document that a check was completed and later re-opened/blocked when new evidence appears.

## Report review

Every sensitive report section has review history. The report model exposes `humanReviewRequired` and a current review decision. A report cannot be issued if required sections are unavailable, traceability is incomplete, the engagement readiness snapshot is not ready, required human section reviews are incomplete, or Completion Room gates remain open.

Issued reports are immutable to the section-review API. Further changes require a new report version rather than editing the issued artifact.

## UI

`continuous-completion.js` adds a Completion Room immediately before Report Studio. It shows system gates separately from human gates, captures rationale for human decisions, exposes section-level report review, and enables the final issue action only when the combined domain gate passes.
