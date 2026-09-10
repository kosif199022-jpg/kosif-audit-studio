# Document Intelligence rollout checklist

1. Merge only after `npm test` and `npm run check` pass.
2. Redeploy the existing `kosif-audit-realtime` Worker from `cloudflare/` so `/api/realtime/session` remains available and `/api/documents/analyze` is added.
3. Verify `/health` reports `documentIntelligence.configured=true`.
4. Create D1 `kosif-audit`, apply `migrations/0001_v5_document_intelligence.sql`, then add the real `KOSIF_DB` binding.
5. Create R2 bucket `kosif-audit-documents`, add `KOSIF_DOCUMENTS` binding.
6. Redeploy and confirm `/health` reports D1/R2 enabled.
7. Test a PDF/image, then a request-linked supporting document, then a CSV trial balance + accepted adjustment + report preview.

No API key belongs in the browser or repository.
