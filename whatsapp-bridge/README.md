# جسر واتساب — Cloudflare Worker + Container + Baileys

```
ChatGPT / Claude / أي Workflow ──HTTPS + كلمة سر──► Worker (wa-kosif)
                                                     │
                                                     ▼
                                      Durable Object "WaBridge"
                                      ├─ جلسة واتساب (SQLite، دائمة)
                                      ├─ الوارد (آخر 1000 رسالة)
                                      ├─ سجل المُرسَل + الرسايل المجدولة
                                      └─ poll كل 15 ثانية + Webhook
                                                     │
                                                     ▼
                                      Container: Baileys (Node) ──► WhatsApp
```

- مفيش متصفح. Baileys بيتصل بواتساب مباشرة.
- جلسة واتساب **مش محفوظة على قرص الـ Container**. بتتحفظ في تخزين الـ Durable Object. ولو الـ Container وقف أو اتنقل، الـ Durable Object بيرجّع له الجلسة وهو بيقوم تاني، ومش هتحتاج QR جديد.
- الـ Container **مش شغال 24 ساعة** افتراضياً. بيقوم لما يوصله طلب، وبيقفل بعد 10 دقايق من غير أي طلبات. ولو عايز استقبال فوري طول الوقت، فعّل `keepAlive` من الإعدادات (تكلفة أعلى).
- الرسايل الواردة بتتحفظ في الـ Durable Object، فتقدر تقراها حتى والـ Container نايم.

## الروابط

كل الروابط محمية بـ `Authorization: Bearer API_KEY` (أو `?key=API_KEY` للصفحات).

| الرابط | الوظيفة |
|---|---|
| `GET /pair` | صفحة QR لأول ربط. بعد الربط بتقول "تم الربط" ومبتطلعش QR تاني |
| `GET /dashboard` | لوحة تحكم: الحالة، إرسال، الوارد، المُرسَل، المجدول، الإعدادات |
| `POST /send` | إرسال. `{"to","message"}` للنص، أو `imageUrl` / `videoUrl` / `documentUrl` (+`fileName`) / `latitude`+`longitude`. `message` بيبقى caption مع الميديا. `to` رقم أو معرّف جروب `…@g.us` |
| `GET /messages` | الوارد، الأحدث أولاً. `limit`، `from=<رقم>`، `chat=<معرّف>`، `after=<seq>`، `sync=0` للقراءة من الذاكرة بس بدون الاتصال بواتساب |
| `POST /read` | تعليم رسايل كمقروءة: `{"chat","ids":[…]}` |
| `GET /check?to=` | الرقم على واتساب ولا لأ |
| `GET /groups` | الجروبات اللي الرقم فيها (الاسم والمعرّف) |
| `GET /contacts` | جهات الاتصال اللي الجسر شافها (اسم ورقم) |
| `GET /log` | سجل اللي اتبعت عبر الجسر |
| `POST /schedule` | إرسال في وقت لاحق: `{"to","message","at":"2026-10-01T09:00:00+03:00"}` |
| `GET /schedule` · `DELETE /schedule/{id}` | عرض وإلغاء المجدول |
| `GET/POST /config` | `{"webhookUrl","keepAlive","maxPerMinute"}` |
| `GET /status` | الرقم مربوط ولا لأ |
| `POST /logout` | يفك الربط ويمسح الجلسة المحفوظة |
| `GET /openapi.json` | مواصفات الـ API لإضافتها كـ Action في ChatGPT (بدون كلمة سر) |

الرقم يتكتب بالصيغة الدولية (مثال: `201012345678`)، أو بالصيغة المصرية المحلية (مثال: `01012345678`) وهيتحوّل تلقائياً.

## الحماية من الحظر

- **حد إرسال**: 15 رسالة في الدقيقة افتراضياً (`maxPerMinute`)، وبعدها الجسر بيرجّع 429.
- **محاكاة الكتابة**: قبل كل رسالة نصية بيظهر "يكتب…" لثواني حسب طول الرسالة.
- بيتأكد إن الرقم على واتساب قبل الإرسال.

## Webhook (ربطه بأي Workflow)

حط رابط https في `webhookUrl`، وكل رسالة واردة جديدة هتتبعت له `POST` بالشكل ده:

```json
{ "event": "messages", "messages": [ { "seq": 12, "id": "…", "chat": "2010…@s.whatsapp.net", "group": false,
  "sender": "2010…@s.whatsapp.net", "phone": "2010…", "name": "أحمد", "timestamp": 1790000000000, "type": "text", "text": "…" } ] }
```

الـ Webhook بيتبعت لما الجسر يلاقي الرسالة: فوراً لو الـ Container شغال (poll كل 15 ثانية)، أو أول ما يقوم. لو عايز استقبال فوري طول الوقت فعّل `keepAlive`.

## خطوات النشر

1. في Cloudflare لازم يكون عندك **Workers Paid**. الـ 5 دولار حد أدنى، واستهلاك الـ Container بيتحسب زيادة حسب الذاكرة والمعالج ووقت التشغيل.
2. النشر شغال أوتوماتيك من workflow `deploy-whatsapp-bridge.yml` في repo `kosif-audit-studio` (لأن `CLOUDFLARE_API_TOKEN` محفوظ هناك) مع كل push على فرع الجسر. أو من جهازك (محتاج Docker): `npm ci && npx wrangler deploy`.
3. كلمة السر (`API_KEY`) مش محفوظة في أي مكان. اللي محفوظ في `wrangler.jsonc` هو بصمتها SHA-256 بس (`API_KEY_SHA256`). علشان تغيّرها: `printf %s 'NEW_KEY' | sha256sum` وحط الناتج مكان القيمة القديمة وانشر تاني.
4. افتح `https://wa-kosif.<subdomain>.workers.dev/pair?key=API_KEY`. أول تشغيل ممكن ياخد دقيقة أو أكتر. امسح الـ QR من: واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز.

## ربطه بـ ChatGPT

1. ChatGPT ← Explore GPTs ← Create ← Configure ← **Create new action**.
2. **Import from URL**: `https://wa-kosif.<subdomain>.workers.dev/openapi.json`
3. **Authentication**: API Key ← Auth Type: **Bearer** ← حط قيمة `API_KEY`.
4. في التعليمات اكتب مثلاً: "لما أطلب إرسال رسالة واتساب استخدم sendWhatsAppMessage بالرقم الدولي والنص، وأكّد معايا الرقم والنص قبل الإرسال. لما أسأل عن رسايل وصلتني استخدم listWhatsAppMessages. لو ذكرت جروب بالاسم هات معرّفه من listWhatsAppGroups."

## تنبيهات

- Baileys **مش API رسمي** من واتساب. لو بعتّ رسايل كتير أو لأرقام مش حافظاك، الرقم ممكن يتحظر.
- أي حد معاه `API_KEY` يقدر يبعت من رقمك ويقرأ الوارد. لو اتسربت، غيّرها فوراً، وممكن تفك الربط من الموبايل (الأجهزة المرتبطة).
- لو الموبايل الأساسي فضل أكتر من 14 يوم من غير ما يفتح واتساب، واتساب بيفك ربط الأجهزة المرتبطة، وساعتها افتح `/pair` تاني.
- الوارد بيتسجّل بس وقت ما الجسر متصل. الرسايل اللي وصلت وهو نايم بتتجاب أول ما يقوم (واتساب بيبعت اللي فات للأجهزة المرتبطة).
