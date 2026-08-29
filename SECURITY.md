# Security and authority boundaries

KOSIF Audit Studio is designed as an audit decision-support workspace, not an autonomous posting or opinion engine.

## Non-negotiable boundaries

- No browser-side API keys or secrets.
- No automated journal posting, adjustment approval, or final audit opinion.
- Monetary calculations use integer minor units in the deterministic engine.
- Imported engagement data remains in the browser unless the user explicitly exports it.
- Council outputs are advisory. Human approval is required and recorded separately.
- Standards cards are practical summaries; the official current text and local adoption must be verified before reliance.

## Data handling

The static application stores work locally using `localStorage`. It does not include a backend, telemetry, or analytics. Exported JSON can contain engagement data and should be handled as confidential audit documentation.

## Reporting a security issue

Open a private security advisory in the repository rather than a public issue when the report includes sensitive details.
