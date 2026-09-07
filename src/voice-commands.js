const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeVoiceText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/\s+/g, " ")
    .trim();
}

const VIEW_COMMANDS = [
  { view: "overview", terms: ["لوحه القياده", "اللوحه الرئيسيه", "الرئيسيه", "نظره عامه"] },
  { view: "data-intake", terms: ["رفع البيانات", "استيراد البيانات", "البيانات"] },
  { view: "trial-balance", terms: ["الميزان", "ميزان المراجعه", "الحسابات"] },
  { view: "standards", terms: ["المعايير", "المعيار", "ifrs", "isa"] },
  { view: "evidence", terms: ["الادله", "الادله", "المستندات"] },
  { view: "rounds", terms: ["الجولات", "جولات المراجعه", "اجراءات المراجعه"] },
  { view: "council", terms: ["المجلس", "مجلس المراجعين", "الذكاء"] },
  { view: "risk", terms: ["المخاطر", "النتائج", "الملاحظات"] },
  { view: "reports", terms: ["التقرير", "التقارير", "مخرجات", "خطاب الاداره"] },
  { view: "settings", terms: ["الاعدادات", "اعداد الارتباط"] },
];

export function parseVoiceCommand(value = "") {
  const text = normalizeVoiceText(value);
  if (!text) return { type: "unknown", text, reply: "لم أسمع أمرًا واضحًا." };
  if (/(توقف|اسكت|ايقاف|اوقف)/.test(text)) return { type: "stop", text, reply: "أوقفت القراءة الصوتية." };
  if (/(تقرير ?صوتي|تقريراً ?صوتياً|تقريرا ?صوتيا|اقرا التقرير|اقرأ التقرير|قراءة التقرير|اقرا المخرجات)/.test(text)) {
    return { type: "speak-report", text, reply: "سأقرأ ملخص التقرير بصوت الجهاز." };
  }
  if (/(فضاء|سينمائي|المشهد ثلاثي|ثري دي|3d)/.test(text)) {
    return { type: "toggle-space", text, reply: "سأبدّل وضع المشهد الفضائي السينمائي." };
  }
  if (/(استمع|اقرا|اقرأ|قراءة|صوت)/.test(text) && /(الملخص|الحاله|الارتباط)/.test(text)) {
    return { type: "speak-summary", text, reply: "سأقرأ ملخص الارتباط بصوت الجهاز." };
  }
  const match = VIEW_COMMANDS.find(({ terms }) => terms.some((term) => text.includes(normalizeVoiceText(term))));
  if (match) return { type: "view", view: match.view, text, reply: `فتحت مساحة ${match.view}.` };
  return { type: "unknown", text, reply: "جرّب: افتح التقرير، افتح الأدلة، فعّل الفضاء، أو اقرأ التقرير." };
}

export function canUseVoiceCommands(target = globalThis) {
  return Boolean(target && (target.SpeechRecognition || target.webkitSpeechRecognition));
}
