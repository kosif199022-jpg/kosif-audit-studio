# جسر واتساب — Cloudflare Worker + Container + Baileys

```
ChatGPT / Claude ──HTTPS + كلمة سر──► Worker (wa-kosif)
                                        │
                                        ▼
                         Durable Object "WaBridge"  ◄── يحفظ جلسة واتساب (SQLite)
                                        │
                                        ▼
                         Container: Baileys (Node) ──► WhatsApp
```

- مفيش متصفح. Baileys بيتصل بواتساب مباشرة.
- جلسة واتساب **مش محفوظة على قرص الـ Container**. بتتحفظ في تخزين الـ Durable Object. ولو الـ Container وقف أو اتنقل، الـ Durable Object بيرجّع له الجلسة وهو بيقوم تاني، ومش هتحتاج QR جديد.
- الـ Container **مش شغال 24 ساعة**. بيقوم لما يوصله طلب، وبيقفل بعد 10 دقائق من غير أي طلبات (`sleepAfter`)، وده بيقلّل التكلفة.

## الروابط

| الرابط | الوظيفة |
|---|---|
| `GET /pair?key=API_KEY` | صفحة QR لأول ربط. بعد ما الربط ينجح بتقول "تم الربط" ومبتطلعش QR تاني |
| `POST /send` | `{"to":"201012345678","message":"..."}` مع `Authorization: Bearer API_KEY` |
| `GET /status` | الرقم مربوط ولا لأ |
| `POST /logout` | يفك الربط ويمسح الجلسة المحفوظة |
| `GET /openapi.json` | مواصفات الـ API لإضافتها كـ Action في ChatGPT |

الرقم يتكتب بالصيغة الدولية (مثال: `201012345678`)، أو بالصيغة المصرية المحلية (مثال: `01012345678`) وهيتحوّل تلقائياً.

## خطوات النشر (Workers Builds)

1. في Cloudflare لازم يكون عندك **Workers Paid**. الـ 5 دولار حد أدنى، واستهلاك الـ Container بيتحسب زيادة حسب الذاكرة والمعالج ووقت التشغيل.
2. Workers & Pages ← Create ← **Import a repository** ← اختار `cloude`.
   - **Root directory**: `whatsapp-bridge`
   - **Build command**: `npm ci`
   - **Deploy command**: `npx wrangler deploy`
   - **Branch**: الفرع اللي فيه الكود.
3. كلمة السر (`API_KEY`) مش محفوظة في أي مكان. اللي محفوظ في `wrangler.jsonc` هو بصمتها SHA-256 بس (`API_KEY_SHA256`). علشان تغيّرها: `printf %s 'NEW_KEY' | sha256sum` وحط الناتج مكان القيمة القديمة وانشر تاني.
4. افتح `https://wa-kosif.<subdomain>.workers.dev/pair?key=API_KEY`. أول تشغيل ممكن ياخد دقيقة أو أكتر. امسح الـ QR من: واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز.

أو من جهازك (محتاج Docker): `npm ci && npx wrangler deploy`

النشر الحالي شغال من workflow `deploy-whatsapp-bridge.yml` في repo `kosif-audit-studio`، لأن `CLOUDFLARE_API_TOKEN` محفوظ هناك.

## ربطه بـ ChatGPT

1. ChatGPT ← Explore GPTs ← Create ← Configure ← **Create new action**.
2. **Import from URL**: `https://wa-kosif.<subdomain>.workers.dev/openapi.json`
3. **Authentication**: API Key ← Auth Type: **Bearer** ← حط قيمة `API_KEY`.
4. في التعليمات اكتب مثلاً: "لما أطلب إرسال رسالة واتساب، استخدم sendWhatsAppMessage بالرقم الدولي والنص. أكّد معايا الرقم والنص قبل الإرسال."

## تنبيهات

- Baileys **مش API رسمي** من واتساب. لو بعتّ رسايل كتير أو لأرقام مش حافظاك، الرقم ممكن يتحظر.
- أي حد معاه `API_KEY` يقدر يبعت من رقمك. لو اتسربت، غيّرها فوراً، وممكن تفك الربط من الموبايل (الأجهزة المرتبطة).
- لو الموبايل الأساسي فضل أكتر من 14 يوم من غير ما يفتح واتساب، واتساب بيفك ربط الأجهزة المرتبطة، وساعتها افتح `/pair` تاني.
