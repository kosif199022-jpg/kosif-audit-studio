# KOSIF Production Maintenance — 2026-09-10

## Scope

Production branch: `codex/preserve-theme-cloudflare`.

The maintenance pass covers executable and configuration code in `src`, `worker`, `scripts`, `db`, `drizzle`, `tests`, `.github`, and the root runtime/build configuration. Generated assets and binary reference material are not treated as source code.

## Changes applied

- Added a repository-wide quality gate before every production build.
- Rejects likely API-key leakage into browser code, direct browser calls to OpenAI, dynamic code execution (`eval` / `new Function`), and `document.write` in runtime paths.
- Added a hard growth ceiling for `src/App.jsx` so the existing monolith cannot silently expand further.
- Added production bundle budgets and stable vendor chunking for React, icons, PDF, XLSX, and document tooling.
- Reduced the main production entry from roughly 962 KB to roughly 731 KB without removing audit capabilities.
- Added a root React error boundary so an unexpected render exception produces an Arabic recovery screen instead of a blank application.
- Hardened iPhone/PWA metadata with `viewport-fit=cover`, Safe Area support, dark standalone metadata, and matching manifest colors.
- Added Cloudflare static security/cache headers while retaining microphone permission for live voice.
- Upgraded GitHub Actions to Node-24-based `checkout@v5` and `setup-node@v5` releases.
- Added regression tests for recovery, iPhone shell metadata, security headers, and the production quality gates.

## Verification

Latest maintenance validation before this document:

- Repository health: **180 executable/config files**, approximately **2.25 MiB**, **0 maintenance warnings**.
- Production tests: **276 passed / 0 failed**.
- Main application entry: approximately **731 KB** (about **24% smaller** than the prior approximately 962 KB entry).
- Bundle budget: PASS.
- Cloudflare production bundle preparation: PASS.

## Remaining technical debt

`src/App.jsx` is still a large integration module. It is intentionally protected by a growth ceiling rather than rewritten in this maintenance pass because a large one-shot refactor would add unnecessary production regression risk. The next structural refactor should extract complete workspaces and immutable navigation/configuration into independently lazy-loaded modules while preserving the current acceptance tests.

The PDF worker remains a large specialist asset. It is isolated from the main entry; further reduction should come from feature-level lazy loading rather than replacing the established PDF engine without a compatibility test matrix.
