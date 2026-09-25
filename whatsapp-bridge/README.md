# جسر واتساب — Cloudflare Worker + Container + Baileys

```
ChatGPT / Claude (MCP) / أي Workflow ──HTTPS + كلمة سر──► Worker (wa-kosif)
                                                          │
                                                          ▼
                                           Durable Object "WaBridge"
                                           ├─ جلسة واتساب (SQLite، دائمة)
                                           ├─ الوارد (آخر 1000 رسالة)
                                           ├─ سجل المُرسَل + jobs (idempotency) + المجدول
                                           └─ poll كل 15 ثانية + Webhook
                                                          │
                                                          ▼
                              R2 (ملفات محفوظة) ──► Container: Baileys (Node) ──► WhatsApp
```

- مفيش متصفح. Baileys بيتصل بواتساب مباشرة.
- جلسة واتساب **مش محفوظة على قرص الـ Container**. بتتحفظ في تخزين الـ Durable Object. ولو الـ Container وقف أو اتنقل، الـ Durable Object بيرجّع له الجلسة وهو بيقوم تاني، ومش هتحتاج ربط جديد.
- الـ Container **مش شغال 24 ساعة** افتراضياً. بيقوم لما يوصله طلب، وبيقفل بعد 10 دقايق من غير أي طلبات. ولو عايز استقبال فوري طول الوقت، فعّل `keepAlive` من الإعدادات (تكلفة أعلى).
- الرسايل الواردة بتتحفظ في الـ Durable Object، فتقدر تقراها حتى والـ Container نايم.

## الربط (أول مرة بس)

افتح `https://wa-kosif.<subdomain>.workers.dev/pair?key=API_KEY`. أول تشغيل ممكن ياخد دقيقة. عندك طريقتين:

- **QR**: واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز ← امسح الكود.
- **برقم الموبايل (من غير كاميرا)**: اكتب رقمك في الصفحة واطلب كود، وفي واتساب اختر «الربط برقم الهاتف بدلاً من ذلك» وأدخل الكود. مناسب لو الجلسة على نفس الموبايل. لو الجسر مربوط بالفعل، افصل الأول من `/logout` أو من لوحة التحكم.

## الروابط

كل الروابط محمية بـ `Authorization: Bearer API_KEY` (أو `?key=API_KEY` للصفحات). `openapi.json` بس مفتوح.

| الرابط | الوظيفة |
|---|---|
| `GET /pair` | صفحة الربط (QR أو كود برقم الموبايل) |
| `GET /dashboard` | لوحة تحكم: الحالة، إرسال، الوارد، المُرسَل، المجدول، الإعدادات |
| `POST /send` | نص: `{"to","message"}`. ملف: نفس الطلب مع `fileUrl` أو `fileBase64` أو `stored` (+`filename`, `mimetype`)، و`message` بيبقى caption. موقع: `latitude`+`longitude`. `to` رقم أو معرّف جروب `…@g.us` |
| `POST /send-bundle` | نص + عدة ملفات لمستلم واحد بالترتيب: `{"to","message","attachments":[{"stored":"cv-ar"},{"fileUrl":"…"}],"idempotencyKey":"…"}`. كل الملفات بتتجاب قبل أول إرسال؛ ولو ملف فشل بيوقف ويقولك إيه اللي اتبعت |
| `POST /send-media` | ملف واحد (نفس حقول المرفق). موجود للتوافق مع الأدوات القديمة |
| `GET /jobs/{key}` | نتيجة التسليم لمفتاح idempotency |
| `GET /messages` | الوارد، الأحدث أولاً. `limit`، `from=<رقم>`، `chat=<معرّف>`، `after=<seq>`، `sync=0` للقراءة من الذاكرة بس بدون الاتصال بواتساب |
| `POST /read` | تعليم رسايل كمقروءة: `{"chat","ids":[…]}` |
| `GET /check?to=` | الرقم على واتساب ولا لأ |
| `GET /groups` · `GET /contacts` | الجروبات، وجهات الاتصال اللي الجسر شافها |
| `GET /log` | سجل اللي اتبعت عبر الجسر |
| `POST /schedule` · `GET /schedule` · `DELETE /schedule/{id}` | إرسال في وقت لاحق: `{"to","message","at":"2026-10-01T09:00:00+03:00"}` |
| `GET/POST /config` | `{"webhookUrl","keepAlive","maxPerMinute"}` |
| `POST /pair/code` | `{"phone"}` → كود ربط برقم الموبايل |
| `GET /status` · `POST /logout` | الحالة، وفك الربط ومسح الجلسة |
| `GET /openapi.json` | مواصفات الـ API لإضافتها كـ Action في ChatGPT |

الرقم يتكتب بالصيغة الدولية (مثال: `201012345678`)، أو بالصيغة المصرية المحلية (مثال: `01012345678`) وهيتحوّل تلقائياً.

### Idempotency

ابعت `idempotencyKey` (أو هيدر `Idempotency-Key`) مع أي إرسال. تكرار نفس المفتاح **مبيبعتش تاني** وبيرجّع `duplicate: true`. ولو bundle فشل في النص، إعادة الطلب بنفس المفتاح بتبعت الناقص بس (`resumed: true`).

### ملفات محفوظة (R2)

الـ bucket `wa-kosif-files` مربوط باسم `FILES`. الأسماء المختصرة في `STORED` جوه `src/index.ts` (حالياً `cv-ar` و`cv-en`). أي ملف تاني في الـ bucket تقدر تبعته بـ `{"r2Key":"path/in/bucket.pdf"}`.

## الحماية من الحظر

- **حد إرسال**: 15 رسالة في الدقيقة افتراضياً (`maxPerMinute`)، وبعدها الجسر بيرجّع 429. الـ bundle بيتحسب بعدد عناصره.
- بيتأكد إن الرقم على واتساب قبل الإرسال، وبيظهر «يكتب…» قبل الرسايل النصية.
- الجسر متعمَّد إنه **ما يدعمش إرسالاً جماعياً** لعدة مستلمين في طلب واحد.

## Webhook (ربطه بأي Workflow)

حط رابط https في `webhookUrl`، وكل رسالة واردة جديدة هتتبعت له `POST` بالشكل ده:

```json
{ "event": "messages", "messages": [ { "seq": 12, "id": "…", "chat": "2010…@s.whatsapp.net", "group": false,
  "sender": "2010…@s.whatsapp.net", "phone": "2010…", "name": "أحمد", "timestamp": 1790000000000, "type": "text", "text": "…" } ] }
```

بيتبعت لما الجسر يلاقي الرسالة: خلال 15 ثانية لو الـ Container شغال، أو أول ما يقوم. للاستقبال الفوري طول الوقت فعّل `keepAlive`.

## MCP لـ Claude

Worker منفصل `wa-kosif-mcp` (`workers/mcp/`) بيقدّم أدوات: إرسال نص/ملف/bundle، قراءة الوارد، الجروبات، الجدولة، حالة التسليم، وحالة الاتصال. ضيفه في Claude كـ MCP server على `https://wa-kosif-mcp.<subdomain>.workers.dev/mcp`، ومعاه skill في `plugin/skills/whatsapp-messaging/`. كلمة السر بتتبعت مع كل أداة في `key`.

## الاختبارات والنشر

- `npm test`: اختبار شامل Worker ← Durable Object ← container بـ Baileys وCloudflare مستبدلين بـ stubs (`test/`). `npm run typecheck` للـ Worker.
- النشر شغال أوتوماتيك من workflow `deploy-whatsapp-bridge.yml` في repo `kosif-audit-studio` (لأن `CLOUDFLARE_API_TOKEN` محفوظ هناك): يعمل typecheck واختبارات ثم ينشر `wa-kosif` و`wa-kosif-mcp`. أو من جهازك (محتاج Docker): `npm ci && npm run deploy && npm run deploy:mcp`.
- لازم يكون عندك **Workers Paid**. الـ 5 دولار حد أدنى، واستهلاك الـ Container بيتحسب زيادة حسب التشغيل.
- كلمات السر مش محفوظة في أي مكان. اللي محفوظ في `wrangler.jsonc` هو بصماتها SHA-256 (`API_KEY_SHA256`، مفصولة بفواصل لو أكتر من واحدة). علشان تغيّر أو تضيف: `printf %s 'NEW_KEY' | sha256sum`.

## ربطه بـ ChatGPT

1. ChatGPT ← Explore GPTs ← Create ← Configure ← **Create new action**.
2. **Import from URL**: `https://wa-kosif.<subdomain>.workers.dev/openapi.json`
3. **Authentication**: API Key ← Auth Type: **Bearer** ← حط قيمة `API_KEY`.
4. في التعليمات اكتب مثلاً: "لما أطلب إرسال رسالة واتساب استخدم sendWhatsAppMessage بالرقم الدولي والنص، وأكّد معايا الرقم والنص قبل الإرسال. لو فيه ملفات مع الرسالة استخدم sendWhatsAppBundle. لما أسأل عن رسايل وصلتني استخدم listWhatsAppMessages. لو ذكرت جروب بالاسم هات معرّفه من listWhatsAppGroups."

## تنبيهات

- Baileys **مش API رسمي** من واتساب. لو بعتّ رسايل كتير أو لأرقام مش حافظاك، الرقم ممكن يتحظر.
- أي حد معاه كلمة سر يقدر يبعت من رقمك ويقرأ الوارد. لو اتسربت، شيل بصمتها من `API_KEY_SHA256` وانشر، وممكن تفك الربط من الموبايل (الأجهزة المرتبطة).
- لو الموبايل الأساسي فضل أكتر من 14 يوم من غير ما يفتح واتساب، واتساب بيفك ربط الأجهزة المرتبطة، وساعتها افتح `/pair` تاني.
- الوارد بيتسجّل بس وقت ما الجسر متصل. الرسايل اللي وصلت وهو نايم بتتجاب أول ما يقوم (واتساب بيبعت اللي فات للأجهزة المرتبطة).
