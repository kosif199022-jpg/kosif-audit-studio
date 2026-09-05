# Security and authority boundaries

KOSIF Audit Studio is designed as an audit decision-support workspace, not an autonomous posting or opinion engine.

## Non-negotiable boundaries

- No browser-side API keys or secrets.
- No automated journal posting, adjustment approval, or final audit opinion.
- Monetary calculations use integer minor units in the deterministic engine.
- Imported engagement data remains in the browser unless the user explicitly exports it.
- Council outputs are advisory. Human approval is required and recorded separately.
- Standards cards are practical summaries; the official current text and local adoption must be verified before reliance.
- Evidence files are read locally to calculate metadata and a SHA-256 fingerprint; file bytes are not persisted by the application.
- Any substantive edit after a recorded human review invalidates that review and records the invalidation event.

## Data handling

The static application stores work locally using `localStorage`. It does not include a backend, telemetry, or analytics. Exported JSON and archive snapshots can contain engagement data and should be handled as confidential audit documentation. The local event chain is a tamper-evident operational checksum, not a digital signature or immutable enterprise archive.

## Reporting a security issue

Open a private security advisory in the repository rather than a public issue when the report includes sensitive details.

## المحادثة الصوتية المباشرة (3.2)
- لا مفاتيح في المتصفح. الوضع المحلي لا يتصل بأي خادم؛ وضع البوابة يرسل النص وسياقًا مختصرًا فقط إلى عنوان https يحدده المستخدم، ويُتوقع أن يملك الخادم مفاتيح المزوّد.
- التعرف على الكلام عبر Web Speech API للمتصفح؛ مسار الصوت خاضع لسياسة مزوّد المتصفح لا التطبيق.
- الردود المحلية حتمية ومشتقة من حالة الملف فقط؛ لا يولّد المساعد أرقامًا.
- بدء الجلسة وإنهاؤها يُسجلان في سلسلة الأحداث.
