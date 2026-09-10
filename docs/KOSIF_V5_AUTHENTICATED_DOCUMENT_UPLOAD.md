# KOSIF V5 — Authenticated Document Upload

When D1 engagement persistence is configured, `/api/documents/analyze` is now protected by the same per-engagement bearer token used for workspace persistence.

The browser sends `X-KOSIF-Engagement` and `Authorization: Bearer <engagement-token>`. The gateway verifies the token hash against `engagement_sessions` before delegating the request to Document Intelligence. It also verifies that the multipart `engagementId` agrees with the protected header, preventing a valid token for one engagement from being used to write documents into another engagement namespace.

The OpenAI API key remains server-side and is never accepted by the browser document client. CORS preflight for the protected route explicitly permits the Authorization and engagement headers, while `PERSISTENCE_ALLOWED_ORIGIN` controls which browser origins may call it.

For backward-compatible environments where D1 is not configured, the route keeps the previous compatibility behavior. Once D1 is present, authorization becomes fail-closed: missing token, wrong token, unknown engagement, origin mismatch or identity mismatch is rejected before document analysis.
