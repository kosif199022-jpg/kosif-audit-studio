import { useEffect, useId, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Download,
  FileDiff,
  FileText,
  GitBranch,
  Printer,
  Radar,
  RotateCcw,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { getAccountStandardIds, getStandard, resolveAccountMapping } from "../standards.js";
import {
  casesForStandard,
  getProfessionalCase,
  professionalCases,
} from "../professional-cases.js";
import { createTechnicalMemoDocxBlob } from "../professional-docx.js";
import "../professional-tools.css";

const SOCPA_RADAR = Object.freeze({
  accounting: {
    label: "المحاسبة",
    title: "رادار الاعتماد المحاسبي",
    summary:
      "يربط موضوع الحساب بالمعيار الدولي المعتمد محليًا، ثم يفصل متطلبات الاعتراف والقياس عن العرض والإفصاح.",
    checks: [
      "تثبيت النسخة وتاريخ السريان قبل الاستنتاج.",
      "توثيق أي إضافة أو تعديل محلي في ورقة العمل.",
      "ربط الحكم برصيد فعلي ودليل قابل للمراجعة.",
    ],
    status: "تحقق مهني مطلوب",
  },
  assurance: {
    label: "المراجعة",
    title: "رادار أدلة المراجعة",
    summary:
      "يحوّل الخطر والتأكيدات إلى إجراء ودليل واستنتاج، مع إبقاء كفاية الدليل وملاءمته قرارًا للمراجع.",
    checks: [
      "ربط الإجراء بالخطر والتأكيد المتأثر.",
      "تحديد مصدر الدليل وموثوقيته وتوقيته.",
      "تسجيل المراجع والنتيجة والاستثناءات غير المغلقة.",
    ],
    status: "حكم بشري إلزامي",
  },
  transition: {
    label: "الانتقال",
    title: "رادار التغير والإصدارات",
    summary:
      "يفصل المرجع التاريخي عن المرجع الأحدث، ويمنع اعتبار سنة الملف وحدها دليلًا على السريان أو التطبيق المبكر.",
    checks: [
      "مقارنة سياسة المنشأة بين الفترات.",
      "تحديد تاريخ التطبيق وأحكام الانتقال من المصدر الرسمي.",
      "توثيق أثر التغير على الأرقام والإفصاح والمقارنات.",
    ],
    status: "تاريخ السريان غير مفترض",
  },
  saudi: {
    label: "السياق السعودي",
    title: "رادار المتطلبات المحلية",
    summary:
      "يجمع أثر اعتماد SOCPA والمتطلبات النظامية ذات الصلة دون دمج الزكاة أو الضريبة أو الحوكمة داخل حكم IFRS غير ملائم.",
    checks: [
      "تحديد الجهة المصدرة لكل متطلب.",
      "فصل المتطلب المحاسبي عن النظامي والضريبي.",
      "إثبات تاريخ التحقق ومصدره داخل ملف الارتباط.",
    ],
    status: "مصدر رسمي لكل متطلب",
  },
});

const EDITION_COMPARISON = Object.freeze([
  {
    dimension: "وظيفة المرجع",
    edition2018: "خط أساس تاريخي لتتبع السياسة والأرقام المقارنة.",
    edition2025: "مرجع محدث للبحث التشغيلي وتحديد نقاط التحقق الحالية.",
  },
  {
    dimension: "إثبات السريان",
    edition2018: "لا يثبت وحده أن المعالجة ما زالت نافذة.",
    edition2025: "لا يثبت وحده تاريخ التطبيق؛ يلزم الرجوع إلى المصدر الرسمي.",
  },
  {
    dimension: "استخدامه في الملف",
    edition2018: "شرح أساس المقارنة وأسباب تغير السياسة أو العرض.",
    edition2025: "توجيه البحث، وتوثيق موضع المتطلب، وتحديث إجراءات المراجعة.",
  },
  {
    dimension: "ضبط الاستنتاج",
    edition2018: "يُوسم بوضوح كمرجع تاريخي ولا يُقدّم كنص حالي.",
    edition2025: "يُوثق معه تاريخ التحقق والحكم المهني وأثره على الحساب.",
  },
]);

const DECISION_TREES = Object.freeze({
  "IFRS 15": {
    title: "إيراد العقود مع العملاء",
    start: "contract",
    nodes: {
      contract: {
        question: "هل يوجد اتفاق قابل للإنفاذ يحدد حقوق الأطراف وشروط السداد؟",
        yes: "customer",
        no: "result:hold",
      },
      customer: {
        question: "هل الطرف المقابل عميل يحصل على مخرجات الأنشطة العادية للمنشأة؟",
        yes: "obligations",
        no: "result:outside",
      },
      obligations: {
        question: "هل حُددت السلع أو الخدمات المتميزة والتزامات الأداء؟",
        yes: "timing",
        no: "result:separate",
      },
      timing: {
        question: "هل تتحقق شروط الاعتراف بالإيراد على مدى الزمن؟",
        yes: "result:overtime",
        no: "result:point",
      },
    },
    outcomes: {
      hold: "أوقف الاعتراف مؤقتًا ووثّق قابلية الإنفاذ والتحصيل قبل متابعة النموذج.",
      outside: "اختبر المعيار الآخر المنطبق؛ العلاقة لا تظهر كعقد عميل ضمن هذا المسار.",
      separate: "حلّل الوعود في العقد وحدد التزامات الأداء قبل تخصيص سعر المعاملة.",
      overtime: "وجّه الاختبار إلى قياس التقدم، والمدخلات، والقطع الزمني على مدى الزمن.",
      point: "وجّه الاختبار إلى انتقال السيطرة ومؤشرات توقيت الاعتراف عند نقطة زمنية.",
    },
  },
  "IFRS 16": {
    title: "عقود الإيجار",
    start: "asset",
    nodes: {
      asset: {
        question: "هل يحدد العقد أصلًا معينًا بصورة صريحة أو ضمنية؟",
        yes: "control",
        no: "result:service",
      },
      control: {
        question: "هل للمنشأة حق الحصول على المنافع وتوجيه استخدام الأصل؟",
        yes: "exemption",
        no: "result:service",
      },
      exemption: {
        question: "هل تم اختيار إعفاء موثق لعقد قصير الأجل أو أصل منخفض القيمة؟",
        yes: "result:expense",
        no: "result:recognize",
      },
    },
    outcomes: {
      service: "عامل الترتيب مبدئيًا كخدمة، واحتفظ بتقييم وجود أصل محدد وحق السيطرة.",
      expense: "اختبر ثبات اختيار الإعفاء وصحة مصروف الدفعات والإفصاح المرتبط.",
      recognize: "اختبر التزام الإيجار وأصل حق الاستخدام ومعدل الخصم وإعادة القياس.",
    },
  },
  "IFRS 19": {
    title: "الإفصاحات المخفضة للمنشآت التابعة",
    start: "subsidiary",
    nodes: {
      subsidiary: {
        question: "هل المنشأة شركة تابعة في نهاية فترة التقرير؟",
        yes: "parent",
        no: "result:ineligible",
      },
      parent: {
        question: "هل تصدر المنشأة الأم النهائية أو الوسيطة قوائم موحدة متاحة للاستخدام العام ومتوافقة مع IFRS؟",
        yes: "accountability",
        no: "result:ineligible",
      },
      accountability: {
        question: "هل المنشأة التابعة غير خاضعة للمساءلة العامة وفق تقييم موثق لطبيعة أعمالها؟",
        yes: "election",
        no: "result:full",
      },
      election: {
        question: "هل اختارت المنشأة تطبيق متطلبات الإفصاح المخفضة وأفصحت عن أساس إعدادها؟",
        yes: "result:reduced",
        no: "result:full",
      },
    },
    outcomes: {
      ineligible: "لا تظهر شروط الأهلية مكتملة؛ طبّق متطلبات الإفصاح الكاملة للمعايير الأخرى.",
      full: "استمر بمتطلبات الإفصاح الكاملة، ووثّق سبب عدم الأهلية أو عدم اختيار الإعفاء.",
      reduced: "استخدم متطلبات الإفصاح المخفضة فقط؛ تبقى أحكام الاعتراف والقياس في المعايير الأخرى دون استبدال.",
    },
  },
  "IFRS 9": {
    title: "الأدوات المالية",
    start: "instrument",
    nodes: {
      instrument: {
        question: "هل ينشئ العقد أصلًا ماليًا لطرف والتزامًا ماليًا أو أداة حقوق ملكية لطرف آخر؟",
        yes: "asset",
        no: "result:outside",
      },
      asset: {
        question: "هل البند أصل مالي وليس التزامًا أو أداة حقوق ملكية مصدرة؟",
        yes: "model",
        no: "result:liability",
      },
      model: {
        question: "هل نموذج الأعمال هو الاحتفاظ لتحصيل التدفقات التعاقدية؟",
        yes: "sppi",
        no: "collectsell",
      },
      collectsell: {
        question: "هل يتحقق هدف نموذج الأعمال من تحصيل التدفقات التعاقدية وبيع الأصول المالية معًا؟",
        yes: "sppifvoci",
        no: "result:fairvalue",
      },
      sppi: {
        question: "هل التدفقات التعاقدية تمثل أصل الدين والعائد المرتبط به فقط؟",
        yes: "result:amortized",
        no: "result:fairvalue",
      },
      sppifvoci: {
        question: "هل التدفقات التعاقدية تمثل أصل الدين والعائد المرتبط به فقط؟",
        yes: "result:fvoci",
        no: "result:fairvalue",
      },
    },
    outcomes: {
      outside: "حدّد المعيار الآخر المنطبق قبل تصنيف الرصيد أو قياسه.",
      liability: "اختبر شروط الالتزام، والقياس اللاحق، وأي تعديل أو إلغاء اعتراف.",
      fvoci: "اختبر القياس بالقيمة العادلة من خلال الدخل الشامل الآخر، وإعادة التدوير عند إلغاء الاعتراف، وECL والفائدة الفعلية.",
      fairvalue: "اختبر فئة القيمة العادلة، ومصدر التقييم، وعرض التغيرات والإفصاح.",
      amortized: "اختبر التكلفة المطفأة، ومعدل الفائدة الفعلي، وخسائر الائتمان المتوقعة.",
    },
  },
  "IAS 19": {
    title: "منافع الموظفين",
    start: "benefit",
    nodes: {
      benefit: {
        question: "هل ينشأ الالتزام مقابل خدمة قدمها موظف؟",
        yes: "settlement",
        no: "result:outside",
      },
      settlement: {
        question: "هل يُتوقع تسوية المنفعة بالكامل خلال اثني عشر شهرًا بعد الفترة؟",
        yes: "result:short",
        no: "post",
      },
      post: {
        question: "هل المنفعة مستحقة بعد انتهاء الخدمة؟",
        yes: "contribution",
        no: "result:other",
      },
      contribution: {
        question: "هل يقتصر التزام المنشأة على مساهمات محددة دون مخاطر اكتوارية إضافية؟",
        yes: "result:definedcontribution",
        no: "result:definedbenefit",
      },
    },
    outcomes: {
      outside: "تحقق من طبيعة المقابل والمعيار الآخر قبل تطبيق مسار منافع الموظفين.",
      short: "اختبر اكتمال الاستحقاق والقياس غير المخصوم والقطع الزمني.",
      other: "صنّف المنفعة طويلة الأجل أو إنهاء الخدمة، ثم اختبر شروط الاعتراف والقياس.",
      definedcontribution: "طابق المساهمات المستحقة والمدفوعة وافحص أي مبالغ مقدمة أو متأخرة.",
      definedbenefit: "اختبر بيانات السكان والافتراضات الاكتوارية والخصم والعرض والإفصاح.",
    },
  },
  "IAS 8": {
    title: "السياسات والتقديرات والأخطاء",
    start: "prior",
    nodes: {
      prior: {
        question: "هل تكشف المعلومات الحالية أن معالجة فترة سابقة كانت خاطئة بمعلومات موثوقة متاحة وقتها؟",
        yes: "result:error",
        no: "principle",
      },
      principle: {
        question: "هل تغير مبدأ أو أساس أو قاعدة الاعتراف أو القياس، وليس مجرد مدخل قياس غير يقيني؟",
        yes: "practicable",
        no: "result:estimate",
      },
      practicable: {
        question: "هل يمكن تحديد أثر الفترات السابقة وإعادة العرض بصورة عملية؟",
        yes: "result:policy",
        no: "result:impracticable",
      },
    },
    outcomes: {
      error: "عامل البند كتصحيح خطأ سابق بأثر رجعي، واختبر إعادة العرض والإفصاح وحدود الأهمية النسبية.",
      estimate: "عامل التغيير كتقدير محاسبي بأثر مستقبلي، ووثّق المعلومات الجديدة والحكم ومجال عدم التأكد.",
      policy: "طبّق تغيير السياسة بأثر رجعي ما لم تحدد أحكام انتقالية أخرى، وأعد جسر المقارنات والإفصاح.",
      impracticable: "وثّق سبب تعذر التطبيق بأثر رجعي وحدد أول تاريخ عملي للتطبيق وفق المتطلبات النافذة.",
    },
  },
  "IFRS 10": {
    title: "نطاق التوحيد والسيطرة",
    start: "power",
    nodes: {
      power: {
        question: "هل لدى المستثمر حقوق حالية تمنحه القدرة على توجيه الأنشطة ذات الصلة؟",
        yes: "returns",
        no: "result:outside",
      },
      returns: {
        question: "هل يتعرض المستثمر لعوائد متغيرة أو يملك حقوقًا فيها نتيجة ارتباطه بالمنشأة المستثمر فيها؟",
        yes: "link",
        no: "result:outside",
      },
      link: {
        question: "هل يستطيع المستثمر استخدام سلطته للتأثير في مقدار عوائده؟",
        yes: "result:consolidate",
        no: "result:reassess",
      },
    },
    outcomes: {
      outside: "لا تكتمل عناصر السيطرة الثلاثة؛ قيّم النفوذ أو الترتيب المشترك أو الأداة المالية والمعيار الآخر المنطبق.",
      consolidate: "أدخل المنشأة في نطاق التوحيد، ووحّد السياسات والفترة واستبعد الأرصدة والمعاملات والأرباح البينية.",
      reassess: "أعد تقييم الحقوق الفعلية والوكيل مقابل الأصيل والوقائع الخاصة؛ لا تعتمد نسبة الملكية وحدها.",
    },
  },
  "IFRS 18": {
    title: "العرض ومقاييس الأداء",
    start: "effective",
    nodes: {
      effective: {
        question: "هل الفترة تبدأ في 1 يناير 2027 أو بعده، أو اختارت المنشأة التطبيق المبكر؟",
        yes: "activities",
        no: "result:transition",
      },
      activities: {
        question: "هل حُددت الأنشطة التجارية الرئيسية قبل تصنيف دخل ومصروف الاستثمار والتمويل؟",
        yes: "mpm",
        no: "result:activities",
      },
      mpm: {
        question: "هل تستخدم المنشأة في اتصالاتها العامة مجموعًا فرعيًا يمثل رؤية الإدارة للأداء؟",
        yes: "result:mpm",
        no: "result:presentation",
      },
    },
    outcomes: {
      transition: "أعد خطة انتقال ومقارنات وخريطة فئات، مع إبقاء تاريخ التطبيق والسماح بالتبني المبكر موثقين.",
      activities: "ثبّت تحليل الأنشطة الرئيسية أولًا؛ فهو يؤثر في تصنيف بعض بنود الاستثمار والتمويل.",
      mpm: "اختبر اكتمال سجل MPM، وطريقة الحساب، والمصالحة إلى أقرب مجموع IFRS، والأثر الضريبي وحقوق غير المسيطرين.",
      presentation: "اختبر فئات التشغيل والاستثمار والتمويل والمجاميع الإلزامية والتجميع والتفصيل والمقارنات.",
    },
  },
});

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const accountAmount = (account) => {
  if (Number.isFinite(Number(account?.amount))) return Math.abs(Number(account.amount));
  return Math.abs(Number(account?.debit || 0) - Number(account?.credit || 0));
};

const accountLinksTo = (account, standardId) =>
  [
    ...(account?.standards || []),
    ...(account?.accountingStandards || []),
    ...(account?.auditStandards || []),
    ...(account?.suggestedStandardIds || []),
  ].includes(standardId);

function memoDocument({
  standardId,
  standardTitle,
  standardSummary,
  entityName,
  period,
  reviewer,
  accountCount,
  exposure,
  decisionResult,
  decisionTreeId,
  decisionTreeTitle,
  decisionHistory,
  professionalCase,
  caseAccountCount,
  caseExposure,
  conclusion,
  generatedAt,
}) {
  const rows = [
    ["المنشأة", entityName],
    ["الفترة", period],
    ["المعيار محل البحث", `${standardId} — ${standardTitle}`],
    ["الحسابات المرتبطة", `${accountCount} حساب`],
    ["التعرض الإجمالي", exposure],
    ["المعد", reviewer || "غير محدد"],
    ["تاريخ الإنشاء", generatedAt],
    ["شجرة القرار المستخدمة", `${decisionTreeId} — ${decisionTreeTitle}`],
    ["الحالة المهنية", professionalCase ? `${professionalCase.id} — ${professionalCase.title}` : "غير محددة"],
    ["حسابات الحالة المرتبطة", `${caseAccountCount || 0} حساب`],
    ["تعرض الحالة", caseExposure || "غير مرتبط"],
  ];
  const list = (items) => (items || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  return `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="ProgId" content="Word.Document">
<title>مذكرة فنية — ${escapeHtml(standardId)}</title>
<style>body{font-family:Arial,sans-serif;direction:rtl;color:#24163d;line-height:1.8;margin:42px}h1{color:#6544c6;border-bottom:3px solid #d8ae4c;padding-bottom:12px}h2{color:#3e2870;margin-top:28px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d8d1e8;padding:9px;text-align:right}th{width:28%;background:#f3efff}.notice{background:#fff8df;border-right:4px solid #d8ae4c;padding:12px}.sign{margin-top:48px;border-top:1px solid #aaa;padding-top:12px}</style>
</head><body>
<h1>مذكرة بحث فني</h1>
<table>${rows
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>
<h2>غرض المذكرة</h2><p>${escapeHtml(standardSummary || "تقييم ارتباط المعيار بالحسابات والوقائع المتاحة.")}</p>
<h2>نتيجة شجرة القرار</h2><p>${escapeHtml(decisionResult || "لم تكتمل شجرة القرار بعد؛ يلزم توثيق الوقائع والإجابات.")}</p>
${decisionHistory?.length ? `<h2>مسار الإجابات</h2><ol>${decisionHistory.map((item) => `<li>${escapeHtml(item.question)} — <strong>${escapeHtml(item.answer)}</strong></li>`).join("")}</ol>` : ""}
${professionalCase ? `<h2>الحالة المهنية التطبيقية</h2><p>${escapeHtml(professionalCase.summary)}</p>
<h3>بوابات الإطار والسريان</h3><ul><li>${escapeHtml(professionalCase.frameworkGate)}</li><li>${escapeHtml(professionalCase.effectiveDateGate)}</li></ul>
<h3>الوقائع والمدخلات المطلوبة</h3><ul>${list(professionalCase.facts)}</ul>
<h3>المخاطر</h3><ul>${list(professionalCase.auditRisks)}</ul>
<h3>استجابة المراجعة</h3><ol>${list(professionalCase.procedures)}</ol>
<h3>الأدلة والمخرجات</h3><ul>${list([...professionalCase.evidence, ...professionalCase.expectedOutput])}</ul>` : ""}
<h2>استنتاج المراجع</h2><p>${escapeHtml(conclusion || "لم يُسجل استنتاج نهائي.")}</p>
<h2>إجراءات الإقفال المقترحة</h2><ol><li>مطابقة الوقائع مع العقود والمستندات المؤيدة.</li><li>التحقق من النسخة النافذة وتاريخ السريان من المصدر الرسمي.</li><li>ربط الحكم بالأرقام والإفصاحات وأدلة المراجعة.</li><li>توثيق المراجعة والاعتماد البشري داخل ملف الارتباط.</li></ol>
<p class="notice"><strong>تنبيه مهني:</strong> هذه أداة بحث ومذكرة مساعدة، وليست بديلًا عن النص الرسمي النافذ أو الحكم المهني أو متطلبات التوثيق والاعتماد.</p>
<p class="sign">توقيع المراجع: ____________________ &nbsp;&nbsp; التاريخ: ____________________</p>
</body></html>`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ar-SA-u-nu-latn", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function ProfessionalStandardsTools({
  selectedStandard,
  accounts = [],
  mappingState,
  formatCurrency,
  context = {},
  onToast,
}) {
  const componentId = useId();
  const selectedId = selectedStandard?.id || "IFRS 15";
  const selectedTitle = selectedStandard?.title || "المعيار المختار";
  const [radarTab, setRadarTab] = useState("accounting");
  const [treeId, setTreeId] = useState(
    Object.hasOwn(DECISION_TREES, selectedId) ? selectedId : "IFRS 15",
  );
  const [nodeId, setNodeId] = useState(DECISION_TREES[treeId].start);
  const [history, setHistory] = useState([]);
  const [resultKey, setResultKey] = useState("");
  const [caseId, setCaseId] = useState(
    () => casesForStandard(selectedId)[0]?.id || "",
  );
  const [reviewer, setReviewer] = useState(context.reviewer || "مدير المراجعة");
  const [conclusion, setConclusion] = useState("");

  useEffect(() => {
    const nextTreeId = Object.hasOwn(DECISION_TREES, selectedId) ? selectedId : "IFRS 15";
    setTreeId(nextTreeId);
    setNodeId(DECISION_TREES[nextTreeId].start);
    setHistory([]);
    setResultKey("");
    setCaseId(casesForStandard(selectedId)[0]?.id || "");
    setConclusion("");
  }, [selectedId]);

  const accountContext = useMemo(() => {
    const linked = accounts.filter((account) => (
      getAccountStandardIds(account, mappingState).includes(selectedId)
    ));
    return {
      count: linked.length,
      exposure: linked.reduce((total, account) => total + accountAmount(account), 0),
      sample: linked.slice(0, 3),
      reviewed: linked.filter((account) => resolveAccountMapping(account, mappingState).status === "reviewed").length,
      suggested: linked.filter((account) => resolveAccountMapping(account, mappingState).status === "suggested").length,
    };
  }, [accounts, mappingState, selectedId]);

  const activeRadar = SOCPA_RADAR[radarTab];
  const activeTree = DECISION_TREES[treeId];
  const activeCase = getProfessionalCase(caseId);
  const recommendedCases = useMemo(
    () => casesForStandard(selectedId),
    [selectedId],
  );
  const activeCaseAccountingIds = useMemo(() => (
    activeCase
      ? activeCase.standards.filter((standardId) => getStandard(standardId)?.type === "accounting")
      : []
  ), [activeCase]);
  const caseAccountContext = useMemo(() => {
    if (!activeCase) return { count: 0, exposure: 0, sample: [], reviewed: 0, suggested: 0 };
    const standardIds = new Set(activeCaseAccountingIds);
    const linked = accounts.filter((account) => (
      getAccountStandardIds(account, mappingState)
        .some((standardId) => standardIds.has(standardId))
    ));
    return {
      count: linked.length,
      exposure: linked.reduce((total, account) => total + accountAmount(account), 0),
      sample: linked.slice(0, 3),
      reviewed: linked.filter((account) => resolveAccountMapping(account, mappingState).status === "reviewed").length,
      suggested: linked.filter((account) => resolveAccountMapping(account, mappingState).status === "suggested").length,
    };
  }, [accounts, activeCase, activeCaseAccountingIds, mappingState]);
  const activeNode = activeTree.nodes[nodeId];
  const decisionResult = resultKey ? activeTree.outcomes[resultKey] : "";
  const entityName =
    context.entityName || context.entity || context.clientName || "المنشأة محل المراجعة";
  const period = context.periodEnd || context.period || context.reportingPeriod || "الفترة الحالية";
  const exposureLabel = typeof formatCurrency === "function"
    ? formatCurrency(accountContext.exposure)
    : new Intl.NumberFormat("ar-SA-u-nu-latn", {
        style: "currency",
        currency: "SAR",
        maximumFractionDigits: 2,
      }).format(accountContext.exposure);
  const caseExposureLabel = typeof formatCurrency === "function"
    ? formatCurrency(caseAccountContext.exposure)
    : new Intl.NumberFormat("ar-SA-u-nu-latn", {
        style: "currency",
        currency: "SAR",
        maximumFractionDigits: 2,
      }).format(caseAccountContext.exposure);

  const notify = (message) => {
    if (typeof onToast === "function") onToast(message);
  };

  const handleRadarTabKeyDown = (event, currentTab) => {
    const tabIds = Object.keys(SOCPA_RADAR);
    const currentIndex = tabIds.indexOf(currentTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabIds.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabIds.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabIds[nextIndex];
    setRadarTab(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(`${componentId}-radar-tab-${nextTab}`)?.focus();
    });
  };

  const resetTree = (nextTreeId = treeId) => {
    const nextTree = DECISION_TREES[nextTreeId];
    setTreeId(nextTreeId);
    setNodeId(nextTree.start);
    setHistory([]);
    setResultKey("");
  };

  const answerQuestion = (answer) => {
    if (!activeNode) return;
    const next = activeNode[answer];
    setHistory((current) => [
      ...current,
      { question: activeNode.question, answer: answer === "yes" ? "نعم" : "لا" },
    ]);
    if (next.startsWith("result:")) {
      setResultKey(next.slice("result:".length));
      setNodeId("");
      return;
    }
    setNodeId(next);
  };

  const buildMemoData = () => ({
      standardId: selectedId,
      standardTitle: selectedTitle,
      standardSummary: selectedStandard?.summary,
      entityName,
      period,
      reviewer: reviewer.trim(),
      accountCount: accountContext.count,
      exposure: exposureLabel,
      decisionResult,
      decisionTreeId: treeId,
      decisionTreeTitle: activeTree.title,
      decisionHistory: history,
      professionalCase: activeCase,
      caseAccountCount: caseAccountContext.count,
      caseExposure: caseExposureLabel,
      conclusion: conclusion.trim(),
      generatedAt: new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date()),
    });

  const buildMemo = () => memoDocument(buildMemoData());

  const downloadMemo = async () => {
    try {
      const blob = await createTechnicalMemoDocxBlob(buildMemoData());
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kosif-technical-memo-${selectedId.replaceAll(" ", "-")}.docx`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notify("تم تنزيل المذكرة الفنية بصيغة DOCX حقيقية.");
    } catch {
      notify("تعذر إنشاء ملف DOCX. أعد المحاولة أو استخدم نسخة الطباعة.");
    }
  };

  const printMemo = () => {
    const frame = document.createElement("iframe");
    frame.className = "professional-print-frame";
    frame.title = "نسخة طباعة المذكرة الفنية";
    frame.srcdoc = buildMemo();
    frame.addEventListener(
      "load",
      () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => frame.remove(), 800);
      },
      { once: true },
    );
    document.body.append(frame);
    notify("تم تجهيز نسخة الطباعة للمذكرة الفنية.");
  };

  return (
    <section className="professional-tools" dir="rtl" aria-labelledby={`${componentId}-title`}>
      <header className="professional-tools__hero">
        <div className="professional-tools__hero-icon" aria-hidden="true">
          <BookOpenCheck size={26} />
        </div>
        <div>
          <span>أدوات البحث والتطبيق المهني</span>
          <h2 id={`${componentId}-title`}>مختبر المعايير المهنية</h2>
          <p>
            رادار SOCPA، مقارنة إصدارات وصفية، أشجار قرار ومذكرة فنية مرتبطة
            بالسياق الفعلي للحسابات.
          </p>
        </div>
        <span className="professional-tools__standard-badge">
          <Scale size={16} aria-hidden="true" />
          <bdi dir="ltr">{selectedId}</bdi>
        </span>
      </header>

      <div className="professional-tools__notice" role="note">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>
          هذه الأدوات مساعدة للبحث والتوثيق وليست بديلًا عن النص الرسمي النافذ،
          أو الحكم المهني، أو مراجعة واعتماد الاستنتاج بشريًا.
        </p>
      </div>

      <section className="professional-tools__panel" aria-labelledby={`${componentId}-radar-title`}>
        <div className="professional-tools__section-heading">
          <Radar size={22} aria-hidden="true" />
          <div>
            <span>مراقبة النطاق والسريان</span>
            <h3 id={`${componentId}-radar-title`}>رادار SOCPA</h3>
          </div>
        </div>
        <div className="professional-tools__tabs" role="tablist" aria-label="مجالات رادار SOCPA">
          {Object.entries(SOCPA_RADAR).map(([id, tab]) => (
            <button
              key={id}
              id={`${componentId}-radar-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={radarTab === id}
              aria-controls={`${componentId}-radar-panel`}
              tabIndex={radarTab === id ? 0 : -1}
              onClick={() => setRadarTab(id)}
              onKeyDown={(event) => handleRadarTabKeyDown(event, id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <article
          id={`${componentId}-radar-panel`}
          className="professional-tools__radar-card"
          role="tabpanel"
          aria-live="polite"
          aria-labelledby={`${componentId}-radar-tab-${radarTab}`}
        >
          <header>
            <div>
              <h4>{activeRadar.title}</h4>
              <p>{activeRadar.summary}</p>
            </div>
            <span><CheckCircle2 size={16} aria-hidden="true" />{activeRadar.status}</span>
          </header>
          <ol>
            {activeRadar.checks.map((check) => <li key={check}>{check}</li>)}
          </ol>
        </article>
      </section>

      <section className="professional-tools__panel" aria-labelledby={`${componentId}-compare-title`}>
        <div className="professional-tools__section-heading">
          <FileDiff size={22} aria-hidden="true" />
          <div>
            <span>بيانات وصفية وليست نصوصًا معيارية</span>
            <h3 id={`${componentId}-compare-title`}>مقارنة مرجعي 2018 و2025</h3>
          </div>
        </div>
        <div className="professional-tools__comparison" role="table" tabIndex="0" aria-label="مقارنة وصفية بين مرجعي 2018 و2025">
          <div className="professional-tools__comparison-head" role="row">
            <span role="columnheader">البعد</span>
            <span role="columnheader">2018 · تاريخي</span>
            <span role="columnheader">2025 · محدث</span>
          </div>
          {EDITION_COMPARISON.map((row) => (
            <div className="professional-tools__comparison-row" role="row" key={row.dimension}>
              <strong role="rowheader">{row.dimension}</strong>
              <p role="cell">{row.edition2018}</p>
              <p role="cell">{row.edition2025}</p>
            </div>
          ))}
        </div>
        <p className="professional-tools__comparison-footnote">
          لا تستنتج الأداة فروق الفقرات تلقائيًا؛ يسجل المراجع موضع التغير وتاريخ
          السريان من المصدر الرسمي قبل اعتماد المعالجة.
        </p>
      </section>

      <section className="professional-tools__panel" aria-labelledby={`${componentId}-tree-title`}>
        <div className="professional-tools__section-heading">
          <GitBranch size={22} aria-hidden="true" />
          <div>
            <span>توجيه السؤال التالي بحسب الوقائع</span>
            <h3 id={`${componentId}-tree-title`}>شجرة القرار التفاعلية</h3>
          </div>
        </div>
        <div className="professional-tools__tree-picker" role="group" aria-label="اختيار شجرة المعيار">
          {Object.entries(DECISION_TREES).map(([id, tree]) => (
            <button
              key={id}
              type="button"
              className={treeId === id ? "is-active" : ""}
              aria-pressed={treeId === id}
              onClick={() => resetTree(id)}
            >
              <bdi dir="ltr">{id}</bdi>
              <span>{tree.title}</span>
            </button>
          ))}
        </div>
        <div className="professional-tools__tree-card" aria-live="polite">
          <header>
            <span>المسار الحالي</span>
            <strong><bdi dir="ltr">{treeId}</bdi> · {activeTree.title}</strong>
            <small>{history.length} إجابة موثقة</small>
          </header>
          {activeNode ? (
            <div className="professional-tools__question">
              <ClipboardCheck size={26} aria-hidden="true" />
              <p>{activeNode.question}</p>
              <div>
                <button type="button" className="is-yes" onClick={() => answerQuestion("yes")}>
                  <CheckCircle2 size={18} aria-hidden="true" /> نعم
                </button>
                <button type="button" className="is-no" onClick={() => answerQuestion("no")}>
                  <ChevronLeft size={18} aria-hidden="true" /> لا
                </button>
              </div>
            </div>
          ) : (
            <div className="professional-tools__outcome" role="status">
              <CheckCircle2 size={28} aria-hidden="true" />
              <div><span>نتيجة توجيهية</span><strong>{decisionResult}</strong></div>
            </div>
          )}
          {history.length ? (
            <details className="professional-tools__history">
              <summary>عرض مسار الإجابات</summary>
              <ol>
                {history.map((item, index) => (
                  <li key={`${item.question}-${index}`}><span>{item.question}</span><strong>{item.answer}</strong></li>
                ))}
              </ol>
            </details>
          ) : null}
          <button type="button" className="professional-tools__reset" onClick={() => resetTree()}>
            <RotateCcw size={16} aria-hidden="true" /> إعادة الشجرة
          </button>
        </div>
      </section>

      <section className="professional-tools__panel" aria-labelledby={`${componentId}-cases-title`}>
        <div className="professional-tools__section-heading">
          <ClipboardCheck size={22} aria-hidden="true" />
          <div>
            <span>من الواقعة إلى المعالجة والخطر والدليل</span>
            <h3 id={`${componentId}-cases-title`}>محرك الحالات المهنية التطبيقية</h3>
          </div>
        </div>

        <div className="professional-tools__case-toolbar">
          <label>
            <span>اختر الحالة</span>
            <select value={caseId} onChange={(event) => setCaseId(event.target.value)}>
              {!recommendedCases.length ? <option value="">لا توجد حالة مرتبطة تلقائيًا</option> : null}
              {professionalCases.map((item) => (
                <option key={item.id} value={item.id}>{item.id} · {item.title}</option>
              ))}
            </select>
          </label>
          <div className="professional-tools__case-recommendations" aria-label={`حالات مرتبطة بالمعيار ${selectedId}`}>
            <span>
              {recommendedCases.length ? <>مرتبطة بـ <bdi dir="ltr">{selectedId}</bdi></> : <>لا توجد حالة مرتبطة مباشرة بـ <bdi dir="ltr">{selectedId}</bdi></>}
            </span>
            <div>
              {recommendedCases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === caseId ? "is-active" : ""}
                  aria-pressed={item.id === caseId}
                  onClick={() => setCaseId(item.id)}
                >
                  {item.id}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeCase ? <article className="professional-tools__case-card">
          <header>
            <div>
              <span>{activeCase.area}</span>
              <h4>{activeCase.title}</h4>
              <p>{activeCase.summary}</p>
            </div>
            <div className="professional-tools__case-exposure">
              <small>حسابات مرتبطة بمعايير الحالة المحاسبية</small>
              <strong>{formatNumber(caseAccountContext.count)}</strong>
              <bdi dir="ltr">{caseExposureLabel}</bdi>
              <small>{caseAccountContext.reviewed} مراجعة بشرية · {caseAccountContext.suggested} اقتراح</small>
            </div>
          </header>

          <div className="professional-tools__case-tags" aria-label="المعايير والتأكيدات">
            {activeCase.standards.map((standardId) => <bdi key={standardId} dir="ltr">{standardId}</bdi>)}
            {activeCase.assertions.map((assertion) => <span key={assertion}>{assertion}</span>)}
          </div>

          <div className="professional-tools__case-grid">
            <section>
              <h5>الوقائع والمدخلات</h5>
              <ul>{activeCase.facts.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section>
              <h5>أسئلة المعالجة</h5>
              <ol>{activeCase.accountingQuestions.map((item) => <li key={item}>{item}</li>)}</ol>
            </section>
            <section className="is-risk">
              <h5>مخاطر التحريف</h5>
              <ul>{activeCase.auditRisks.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section className="is-response">
              <h5>إجراءات المراجعة</h5>
              <ol>{activeCase.procedures.map((item) => <li key={item}>{item}</li>)}</ol>
            </section>
            <section>
              <h5>الدليل المتوقع</h5>
              <ul>{activeCase.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section>
              <h5>مخرجات ورقة العمل</h5>
              <ul>{activeCase.expectedOutput.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section>
              <h5>بوابات الإطار والسريان</h5>
              <ul>
                <li>{activeCase.frameworkGate}</li>
                <li>{activeCase.effectiveDateGate}</li>
              </ul>
            </section>
          </div>

          {caseAccountContext.sample.length ? (
            <footer>
              <span>عينة من الحسابات المتأثرة</span>
              <div>
                {caseAccountContext.sample.map((account) => (
                  <b key={account.id || account.code}><bdi dir="ltr">{account.code}</bdi> — {account.name}</b>
                ))}
              </div>
            </footer>
          ) : null}
        </article> : (
          <p className="professional-tools__empty">
            اختر حالة من المكتبة يدويًا إن كانت الوقائع تبررها؛ لن يربط النظام حالة غير متطابقة بالمعيار تلقائيًا.
          </p>
        )}
      </section>

      <section className="professional-tools__panel professional-tools__memo" aria-labelledby={`${componentId}-memo-title`}>
        <div className="professional-tools__section-heading">
          <FileText size={22} aria-hidden="true" />
          <div>
            <span>ينشأ من المعيار والحسابات والقرار الحالي</span>
            <h3 id={`${componentId}-memo-title`}>المذكرة الفنية</h3>
          </div>
        </div>
        <div className="professional-tools__memo-grid">
          <article className="professional-tools__memo-preview">
            <header>
              <span>مسودة قابلة للمراجعة</span>
              <h4>{selectedId} — {selectedTitle}</h4>
              {activeCase ? <small>{activeCase.id} · {activeCase.title}</small> : null}
            </header>
            <dl>
              <div><dt>المنشأة</dt><dd>{entityName}</dd></div>
              <div><dt>الفترة</dt><dd>{period}</dd></div>
              <div><dt>الحسابات المرتبطة</dt><dd>{formatNumber(accountContext.count)}</dd></div>
              <div><dt>حالة الربط</dt><dd>{accountContext.reviewed} مراجعة بشرية · {accountContext.suggested} اقتراح</dd></div>
              <div><dt>التعرض المرتبط</dt><dd dir="ltr">{exposureLabel}</dd></div>
            </dl>
            {accountContext.sample.length ? (
              <ul aria-label="عينة الحسابات المرتبطة">
                {accountContext.sample.map((account) => (
                  <li key={account.id || account.code}>
                    <bdi dir="ltr">{account.code}</bdi> — {account.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="professional-tools__empty">لا توجد حسابات مرتبطة بهذا المعيار في السياق الحالي.</p>
            )}
          </article>
          <div className="professional-tools__memo-fields">
            <label>
              اسم معد المذكرة
              <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} />
            </label>
            <label>
              استنتاج المراجع
              <textarea
                rows="5"
                value={conclusion}
                onChange={(event) => setConclusion(event.target.value)}
                placeholder="اكتب الاستنتاج، وأساسه، وأثره على الرصيد والإفصاح وإجراء المراجعة."
              />
            </label>
            <div className="professional-tools__memo-actions">
              <button type="button" onClick={downloadMemo}>
                <Download size={18} aria-hidden="true" /> تنزيل Word (.docx)
              </button>
              <button type="button" className="is-secondary" onClick={printMemo}>
                <Printer size={18} aria-hidden="true" /> طباعة المذكرة
              </button>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
