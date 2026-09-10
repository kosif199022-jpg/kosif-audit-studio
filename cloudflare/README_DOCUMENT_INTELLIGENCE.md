# KOSIF V5 — Document Intelligence server-side

This change upgrades the existing `kosif-audit-realtime` Worker source from Realtime-only to a unified audit gateway while preserving `/api/realtime/session`.

## New source

- `document-worker.js`: Realtime + document analysis API.
- `migrations/0001_v5_document_intelligence.sql`: optional D1 schema.
- `wrangler.document.example.toml`: D1/R2 provisioning example.

## Active wrangler config

`wrangler.toml` now points to `document-worker.js`. It intentionally contains no placeholder D1 database ID and no R2 binding, so it can be deployed safely to the existing Worker before storage resources exist. Stateless document analysis still requires the existing `OPENAI_API_KEY` Worker secret.

After creating D1 and R2, copy the real binding blocks from the example file into `wrangler.toml`, apply the migration, and redeploy.

Never commit `OPENAI_API_KEY`.
