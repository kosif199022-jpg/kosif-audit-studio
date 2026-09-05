# KOSIF 4 — Agent Studio design

User mandate: extend the supplied v3.2 application with advanced capabilities, cinematic Arabic interfaces, mobile/laptop ergonomics, agents, reviewers, references and workflows. The supplied archive is the feature baseline; main is the Git history base. The live Cloudflare Worker is a different, service-bound deployment, so this change is prepared on a feature branch and does not replace its runtime.

## Product

- Preserve every existing audit screen, deterministic BigInt engine, local engagement, exports, voice assistant and human approval boundaries.
- Add an Agent Studio that answers from the current engagement, creates a prioritized evidence-based task plan and drafting memos. Explicitly identify the local rules mode; never imply a model call that did not occur.
- Add a workflow desk with assignees, due dates, states, rationales and export. Completing a task never closes a risk, approves a report or changes evidence.
- Add a verified reference registry with publisher, edition, official link, verification date and effective-period-start dates. Applicability uses a chosen reporting-period start, not today's date, and local endorsement remains separately checked.
- Add council source snapshots, stale-session warnings, per-seat references and stricter missing-input/decision handling.
- Rework the visual system with ink/plum surfaces, mint highlights, editorial typography, an orbit composition drawn in CSS, staggered entrance motion, compact task rows and five-destination mobile navigation. Respect reduced motion and visible focus; all controls have functional destinations.

## Modules and contracts

`reference-registry.js`: `REFERENCES`, `referenceStatus(reference, periodStart)`, `searchReferences(query)`.
`agent.js`: `contextStamp(context)`, `buildActionPlan(context, options)`, `answerAgent(query, context)`, `transitionTask(task, status, decision)`, `draftMemo(context, topic)`; pure functions, JSON-safe outputs, fixed-time test inputs.
`studio.js`: `createStudio({getContext,getState,updateState,actions,recordEvent,notify})` mounts and renders new screens; no independent persistent store.
`studio.css`: consistent overrides plus new components and responsive motion.
`app.js`: state migration, context adapter, data invalidation and existing action integration.

## Acceptance

1. Existing source tests pass after importing v3.2.
2. Empty data cannot create a favorable audit conclusion. Missing materiality blocks the opinion draft.
3. Plans are deterministic for identical inputs/time, reference real risks and preserve audit state; stale plans cannot execute new status changes until regenerated.
4. Human task completion requires a reviewer and rationale; tasks do not impersonate risk/report decisions.
5. Date applicability covers exact boundaries and rejects malformed dates.
6. All new data exports and persists with existing engagement state. Demo reloading clears engagement-specific derived plans.
7. Static HTML, JavaScript, local assets, PWA cache and mobile styles are verified. Browser QA is not requested and is not claimed.
