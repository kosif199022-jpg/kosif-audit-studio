# KOSIF V5 — Report Freshness, Council Delta & Dynamic Specialists

## Report freshness

Every report model now captures a deterministic `sourceFingerprint` at build time. The fingerprint reflects the engagement identity plus accountable source state: documents and document hashes/versions, evidence review state, issues, evidence requests, council rounds and adjustment decisions. Report objects themselves and completion decisions are intentionally excluded so reviewing a report does not invalidate its own source snapshot.

Section review and final issue APIs accept the current engagement and reject a report if its source fingerprint no longer matches. The UI marks the latest report `FRESH` or `STALE`; stale reports cannot be section-approved or issued and must be rebuilt.

The source fingerprint is a deterministic change detector, not a cryptographic evidence hash. Cryptographic integrity remains the responsibility of SHA-256 document hashes and server-side state hashes.

## Council delta

The Council workspace renders the delta between the latest two rounds using the existing domain delta engine: evidence added, issues added/closed and current open requests. The first round is labelled as the baseline rather than pretending a comparison exists.

## Dynamic specialist routing

KOSIF can recommend specialist involvement when issues or document analyses contain supported triggers for valuation, actuarial work, legal matters, IT audit, forensic investigation, treasury/financial instruments or consolidation/group work.

A specialist recommendation is not a fabricated specialist opinion. The recommendation becomes an advisory council seat whose stance is `caution` and whose primary action is to request a concrete specialist memo/deliverable. That ask then flows through the normal Evidence Request engine, including duplicate suppression and acceptance criteria.

This preserves the professional boundary: KOSIF can identify when expertise is needed, but the specialist work itself must be received and reviewed as evidence before it can influence the conclusion.
