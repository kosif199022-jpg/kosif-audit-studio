import { normalizeText } from './engine.js';

// Links and effective dates checked against publisher pages on 2026-09-05.
// These are original summaries and navigation metadata, not standard texts.
export const REFERENCES = Object.freeze([
 { id: 'socpa-audit', code: 'SOCPA · ISA', title: 'معايير المراجعة المعتمدة في السعودية', publisher: 'الهيئة السعودية للمراجعين والمحاسبين', family: 'ISA', edition: 'بوابة المعايير المحلية', url: 'https://socpa.org.sa/audit', verifiedAt: '2026-09-05', effectiveFrom: null, summary: 'ابدأ بالنص المعتمد محليًا عند تحديد إجراءات المخاطر والأدلة والتقرير.', action: 'ثبّت إصدار المعيار المحلي المستخدم في ورقة العمل.', topics: ['الأدلة', 'ISA 500', 'ISA 315', 'ISA 330', 'ISA 450', 'الجودة'] },
 { id: 'isa240', code: 'ISA 240 · Revised', title: 'مسؤوليات المراجع المتعلقة بالغش', publisher: 'IAASB', family: 'ISA', edition: 'الإصدار المعدل 2025', url: 'https://www.iaasb.org/focus-areas/fraud-going-concern-revised-standards-enhance-public-trust', verifiedAt: '2026-09-05', effectiveFrom: '2026-12-15', summary: 'تحديث يركز على تقييم مخاطر الغش والاستجابة لها والشك المهني.', action: 'راجع أثر الإصدار على برنامج فحص القيود والتواصل والتوثيق.', topics: ['الاحتيال', 'الغش', 'القيود', 'الشك المهني'] },
 { id: 'isa570', code: 'ISA 570 · Revised 2024', title: 'الاستمرارية', publisher: 'IAASB', family: 'ISA', edition: 'المحدث في 2024، صدر في 2025', url: 'https://www.iaasb.org/publications/isa-570-revised-2024-going-concern', verifiedAt: '2026-09-05', effectiveFrom: '2026-12-15', summary: 'تحديث لمراجعة تقييم الإدارة للاستمرارية والعمل والتقرير المرتبطين به.', action: 'خطط لفحص توقعات التدفقات والتمويل والافتراضات والأدلة المناقضة.', topics: ['الاستمرارية', 'السيولة', 'التقييم', 'تدفقات'] },
 { id: 'ifrs18', code: 'IFRS 18', title: 'العرض والإفصاح في القوائم المالية', publisher: 'IFRS Foundation', family: 'IFRS', edition: 'صدر في أبريل 2024', url: 'https://www.ifrs.org/issued-standards/list-of-standards/ifrs-18-presentation-and-disclosure-in-financial-statements/', verifiedAt: '2026-09-05', effectiveFrom: '2027-01-01', summary: 'معيار يحل محل IAS 1؛ يتناول متطلبات العرض والإفصاح في القوائم المالية.', action: 'أعد خريطة الانتقال والعرض المقارن ومقاييس الأداء المحددة من الإدارة.', topics: ['العرض', 'الإفصاح', 'القوائم', 'IAS 1', 'الأداء'] },
 { id: 'smes2025', code: 'IFRS for SMEs', title: 'المعيار للمنشآت الصغيرة والمتوسطة', publisher: 'IFRS Foundation', family: 'IFRS', edition: 'الإصدار الثالث، فبراير 2025', url: 'https://www.ifrs.org/issued-standards/ifrs-for-smes/', verifiedAt: '2026-09-05', effectiveFrom: '2027-01-01', summary: 'الإصدار الثالث يتيح التطبيق المبكر؛ يمكن مواصلة إصدار 2015 حتى تاريخ السريان.', action: 'تحقق من أهلية المنشأة والإصدار المختار واعتماده محليًا قبل تغيير السياسات.', topics: ['المنشآت الصغيرة', 'SMEs', 'الإطار', 'السياسات'] },
 { id: 'socpa-updates', code: 'SOCPA · Updates', title: 'التحديثات المحلية المعتمدة', publisher: 'الهيئة السعودية للمراجعين والمحاسبين', family: 'محلي', edition: 'سجل تحديثات الاعتماد', url: 'https://socpa.org.sa/aud_updates', verifiedAt: '2026-09-05', effectiveFrom: null, summary: 'سجل رسمي لمستجدات المعايير التي يعتمدها مجلس معايير المراجعة.', action: 'قابل الإصدار الدولي بتحديث الاعتماد السعودي وسجّل نتيجة المطابقة.', topics: ['التحديثات', 'اعتماد', 'إصدارات', 'السعودية'] }
]);

export function validDate(value) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
 const date = new Date(`${value}T00:00:00Z`);
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function referenceStatus(reference, periodStart) {
 if (!reference.effectiveFrom) return { code: 'reference', label: 'مرجع محلي · تحقق من الإصدار' };
 if (!validDate(periodStart)) return { code: 'unknown', label: 'حدد بداية الفترة المالية' };
 return periodStart >= reference.effectiveFrom
  ? { code: 'effective', label: 'بلغ تاريخ السريان الدولي لهذه الفترة' }
  : { code: 'upcoming', label: 'لاحق لبداية الفترة · راجع التطبيق المبكر' };
}

export function searchReferences(query = '') {
 const terms = normalizeText(query).split(/\s+/).filter(Boolean);
 return REFERENCES.filter(r => terms.every(t => normalizeText(`${r.code} ${r.title} ${r.publisher} ${r.topics.join(' ')}`).includes(t)));
}

export function referencesForSeat(seatId) {
 const mapping = { ifrs: ['ifrs18', 'smes2025'], fraud: ['isa240'], 'going-concern': ['isa570'], tax: ['socpa-updates'], quality: ['socpa-audit', 'socpa-updates'] };
 return (mapping[seatId] ?? ['socpa-audit']).map(id => REFERENCES.find(r => r.id === id));
}
