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

export const VIEW_LABELS = Object.freeze({
  overview: "النظرة العامة",
  "data-intake": "استيراد وتحضير البيانات",
  "document-lab": "مختبر المستندات",
  "trial-balance": "ميزان المراجعة",
  traceability: "التتبع والإسناد",
  standards: "مركز المعايير",
  applied: "المختبر المحاسبي التطبيقي",
  analytics: "التحليلات",
  integrity: "سلامة الدفتر",
  council: "مجلس المراجعين الذكي",
  risk: "المخاطر والنتائج",
  rounds: "جولات المراجعة",
  evidence: "الأدلة وطلبات PBC",
  "reviewer-workspace": "مساحة عمل المراجع",
  results: "مركز النتائج",
  "report-clone": "استنساخ قالب التقرير",
  reports: "المخرجات والتقارير",
  intelligence: "استوديو الذكاء",
  "ai-connections": "اتصالات الذكاء الاصطناعي",
  "benchmark-lab": "مختبر التقارير المرجعية",
  demo500: "تجربة 500 حساب",
  settings: "إعداد الارتباط",
});

export function viewLabel(view) {
  return VIEW_LABELS[view] || view;
}

const VIEW_COMMANDS = [
  { view: "reviewer-workspace", terms: ["مساحه عمل المراجع", "شاشه المراجع", "ملاحظات المراجع"] },
  { view: "benchmark-lab", terms: ["مختبر التقارير المرجعيه", "التقارير المرجعيه", "مقارنه التقارير"] },
  { view: "ai-connections", terms: ["اتصالات الذكاء", "مزودي الذكاء", "مفاتيح الذكاء", "اتصال openai"] },
  { view: "document-lab", terms: ["مختبر المستندات", "تحليل المستندات", "فحص المستندات"] },
  { view: "report-clone", terms: ["استنساخ التقرير", "قالب التقرير", "مستنسخ التقرير"] },
  { view: "trial-balance", terms: ["ميزان المراجعه", "دليل الحسابات", "شاشه الحسابات", "الميزان"] },
  { view: "traceability", terms: ["التتبع", "الاسناد", "سلسله التتبع", "مصدر الرقم"] },
  { view: "standards", terms: ["مركز المعايير", "المعايير", "المعيار", "ifrs", "isa"] },
  { view: "analytics", terms: ["التحليلات", "التحليل المالي", "التحليل التحليلي", "بن فورد", "benford"] },
  { view: "integrity", terms: ["سلامه الدفتر", "قفل الدفتر", "البصمه", "تكامل البيانات"] },
  { view: "council", terms: ["مجلس المراجعين", "المجلس الذكي", "المجلس"] },
  { view: "rounds", terms: ["جولات المراجعه", "الجولات", "اجراءات المراجعه"] },
  { view: "evidence", terms: ["طلبات pbc", "طلبات الادله", "الادله", "المستندات المطلوبه"] },
  { view: "results", terms: ["مركز النتائج", "كل النتائج", "نتائج التطبيق"] },
  { view: "risk", terms: ["المخاطر والنتائج", "المخاطر", "الملاحظات", "النتائج المفتوحه"] },
  { view: "intelligence", terms: ["استوديو الذكاء", "الايجنت", "الوكيل الذكي", "الذكاء التحليلي"] },
  { view: "applied", terms: ["المختبر المحاسبي", "المحاسبه التطبيقيه", "الحاسبات المحاسبيه"] },
  { view: "data-intake", terms: ["استيراد البيانات", "رفع الميزان", "رفع البيانات", "تحضير البيانات"] },
  { view: "reports", terms: ["المخرجات", "التقارير", "التقرير", "خطاب الاداره"] },
  { view: "demo500", terms: ["تجربه 500", "500 حساب", "العرض 500"] },
  { view: "settings", terms: ["اعداد الارتباط", "الاعدادات", "بيانات المنشاه"] },
  { view: "overview", terms: ["لوحه القياده", "اللوحه الرئيسيه", "الرئيسيه", "نظره عامه"] },
];

const NAVIGATION_INTENT = /(^|\s)(افتح|اعرض|اذهب|روح|انتقل|وديني|وريني|ارني)(\s|$)/;

function findViewCommand(text) {
  return VIEW_COMMANDS.find(({ terms }) => terms.some((term) => {
    const normalizedTerm = normalizeVoiceText(term);
    return text === normalizedTerm || (NAVIGATION_INTENT.test(text) && text.includes(normalizedTerm));
  }));
}

export function parseVoiceCommand(value = "") {
  const text = normalizeVoiceText(value);
  if (!text) return { type: "unknown", text, reply: "لم يصل أمر واضح." };
  if (/(توقف|اسكت|ايقاف|اوقف)/.test(text)) return { type: "stop", text, reply: "أوقفت القراءة الصوتية." };
  if (/(تقرير ?صوتي|تقريراً ?صوتياً|تقريرا ?صوتيا|اقرا التقرير|اقرأ التقرير|قراءه التقرير|اقرا المخرجات)/.test(text)) {
    return { type: "speak-report", text, reply: "سأقرأ ملخص التقرير بصوت الجهاز." };
  }
  if (/(فضاء|سينمائي|المشهد ثلاثي|ثري دي|3d)/.test(text)) {
    return { type: "toggle-space", text, reply: "سأبدّل وضع المشهد الفضائي السينمائي." };
  }
  if (/(استمع|اقرا|اقرأ|قراءه|صوت)/.test(text) && /(الملخص|الحاله|الارتباط)/.test(text)) {
    return { type: "speak-summary", text, reply: "سأقرأ ملخص الارتباط بصوت الجهاز." };
  }
  const match = findViewCommand(text);
  if (match) return { type: "view", view: match.view, text, reply: `تم فتح ${viewLabel(match.view)}.` };
  return { type: "unknown", text, reply: "يمكنني فتح أي مساحة في KOSIF أو إرسال السؤال إلى الشات الذكي للتحليل." };
}

export function canUseVoiceCommands(target = globalThis) {
  return Boolean(target && (target.SpeechRecognition || target.webkitSpeechRecognition));
}
