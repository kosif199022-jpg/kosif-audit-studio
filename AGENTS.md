# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

Preserve KOSIF's violet-and-gold identity. Use secondary colors only as semantic workspace accents (assurance, evidence, council, and exceptions), keep dense professional text readable, and prioritize the audited working surface over marketing-sized hero sections.

## Approved baseline — 2026-09-05
The user selected https://kosif-audit-studio.taunt-apron-speak.chatgpt.site/ as the source of truth. Its served JS exactly matches branch codex/restore-v2-mahmoud-capabilities at e27a4fd195fd10ce0a812a402b62256d3655784d (SHA-256 6ad420a583b3c363e7d391280d468fd4330670be74992ada06bfb7b0e1457142). Preserve all three themes, current workflows, and human approval gates. Add the previously developed agent, work planning and reference capabilities using existing theme variables. Deploy via Cloudflare with GitHub as source.

## Training and AI preferences — 2026-09-05
Preserve the selected baseline and themes while learning from the two referenced KOSIF Workers. Keep the 500-account, 20-round training dataset separate from the current engagement and clearly label synthetic evidence/approvals. Provide user-configurable API connections for assistants and reviewers; keys must remain server-side, isolated per session and excluded from exports. AI output remains advisory.
