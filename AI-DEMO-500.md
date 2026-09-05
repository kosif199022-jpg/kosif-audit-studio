# 500-account training workspace and AI connections

The existing three themes, 5,000-account workspace, human approval gates and Sites worker remain available. The new 500-account workspace is isolated from the active engagement. It computes balanced totals, materiality, linked populations and deterministic risk samples across all 20 audit rounds. Evidence, findings and completion approvals are explicitly synthetic training fixtures, not performed real-world audit procedures. Download the trial balance (CSV), workpapers (Excel), full snapshot and round results (JSON), round report (TXT), or print to PDF.

## Source observations

- https://mahmoud-eldesouky.kosif199022.workers.dev/audit/ exposes council, source-fabric, reporting and accounting workspaces. The additions reuse this application's existing council, standards, reporting and accounting engines to link the new training workflow.
- https://kosif-stable.kosif199022.workers.dev/ exposes demo, standards, staged auditing and AI capability routes. The new workspace adopts the staged results presentation and provides its own isolated AI gateway.

These are workflow references; neither source deployment was modified. No source credentials were copied.

## Bring your own API key

Open **اتصالات AI والمراجعين**, choose OpenAI, Gemini or Claude, enter a model available to your provider account and save the API key. Choose an assistant/reviewer role, write the question, approve sending its aggregate context and run. The 500-account workspace also offers **مراجعة التجربة عبر API** for that specific dataset.

Keys are encrypted with AES-GCM in Cloudflare KV, scoped to a Secure HttpOnly SameSite cookie and expire after 24 hours. Keys are never included in local storage, session exports or configuration responses. Delete the connection to remove its server session. Production requires AI_SESSIONS KV and AI_KEY_ENCRYPTION_SECRET (64 hexadecimal characters) as a Cloudflare secret. Never commit this secret. Changing it invalidates existing encrypted connections.

Requests use fixed provider endpoints, explicit consent, bounded input/output and a numeric aggregate allowlist. The text you write is sent as written; avoid including confidential details you do not intend to share. Replies are advisory and cannot execute tools, change accounts or approve gates. Provider charges and model access depend on the user's account. Saving a key does not validate it; the first request does. Integration tests use mocked providers; no real user key was available for a live provider test.

Provider references:
- https://developers.openai.com/api/reference/resources/responses/methods/create/
- https://ai.google.dev/api/generate-content
- https://platform.claude.com/docs/en/api/messages/create

## Deployment

GitHub branch `codex/preserve-theme-cloudflare` deploys automatically to https://kosif-audit-studio.pages.dev through Cloudflare Pages. `npm run build:cloudflare` builds and runs all tests before generating the Pages worker, including the AI gateway. The existing Sites build remains intact.
