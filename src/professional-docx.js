const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const text = (value) => String(value ?? "—");

async function createRtlDocxBlob({ title, description, buildChildren }) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import("docx");

  const paragraph = (value, { bold = false, heading, color = "28134A", size = 22 } = {}) => new Paragraph({
    alignment: AlignmentType.RIGHT,
    bidirectional: true,
    heading,
    spacing: { after: 120, line: 320 },
    children: [new TextRun({ text: text(value), bold, color, size, rightToLeft: true, font: "Arial" })],
  });
  const cell = (value, options = {}) => new TableCell({
    margins: { top: 100, bottom: 100, left: 110, right: 110 },
    children: [paragraph(value, { ...options, size: 18 })],
  });
  const table = (headers, rows) => new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "C8B9E5" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "C8B9E5" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "C8B9E5" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "C8B9E5" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "DED5F0" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "DED5F0" },
    },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((header) => cell(header, { bold: true, color: "573B9D" })) }),
      ...rows.map((row) => new TableRow({ children: row.map((value) => cell(value)) })),
    ],
  });
  const heading = (value) => paragraph(value, {
    bold: true,
    heading: HeadingLevel.HEADING_1,
    color: "573B9D",
    size: 28,
  });
  const bulletList = (items = []) => items.map((item) => paragraph(`• ${text(item)}`));

  const document = new Document({
    creator: "KOSIF Audit Studio",
    title,
    description,
    sections: [{
      properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
      children: buildChildren({ paragraph, table, heading, bulletList, HeadingLevel }),
    }],
  });
  const blob = await Packer.toBlob(document);
  return new Blob([blob], { type: DOCX_MIME });
}

export async function createProfessionalDocxBlob({
  engagement = {},
  metrics = {},
  managementRows = [],
  complianceRows = [],
  unresolvedIssues = [],
  currency = (value) => text(value),
  generatedAt = new Date(),
} = {}) {
  const entity = engagement.entity || {};
  return createRtlDocxBlob({
    title: "حزمة المخرجات المهنية",
    description: "مسودة مهنية مساعدة مشتقة من جلسة KOSIF الحالية",
    buildChildren: ({ paragraph, table, heading, HeadingLevel }) => [
      paragraph("مسودة مهنية مساعدة — ليست تقرير تدقيق موقعًا", { bold: true, color: "8C4D18" }),
      paragraph("حزمة المخرجات المهنية", { bold: true, heading: HeadingLevel.TITLE, color: "573B9D", size: 36 }),
      paragraph(`${entity.name || "المنشأة"} · ${entity.period || "الفترة الحالية"} · ${entity.framework || "إطار التقرير المعتمد"}`),
      paragraph(`عدد الحسابات: ${metrics.accountCount ?? "—"} · الأهمية النسبية: ${currency(metrics.materiality || 0)}`),
      heading("خطاب الإدارة — نقاط قابلة للمتابعة"),
      table(
        ["الأولوية", "الحالة", "الموضوع", "التوصية", "المرجع"],
        managementRows.map((item) => [item.priority, item.status, item.title, item.recommendation, (item.references || []).join(" · ")]),
      ),
      heading("مصفوفة الالتزام"),
      table(
        ["المعيار", "الوصف", "الحسابات", "التعرض", "الحالة"],
        complianceRows.map((item) => [item.standardId, item.title, item.accountCount, currency(item.exposure), item.reviewRequiredAccountCount ? `يحتاج مراجعة (${item.reviewRequiredAccountCount})` : "مغطى"]),
      ),
      heading("المسائل غير المحسومة"),
      ...(unresolvedIssues.length
        ? unresolvedIssues.map((item) => paragraph(`${item.reference} — ${item.title}: ${item.detail}`))
        : [paragraph("لا توجد مسائل غير محسومة وفق حالة الجلسة الحالية.")]),
      paragraph(`أُنشئت هذه النسخة محليًا في ${generatedAt.toISOString()}. تعكس حالة الجلسة لحظة التنزيل وقد تتغير عند تحديث البيانات أو الأدلة أو قرارات المراجع.`, { color: "6D6680", size: 18 }),
    ],
  });
}

export async function createTechnicalMemoDocxBlob({
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
  decisionHistory = [],
  professionalCase,
  caseAccountCount,
  caseExposure,
  conclusion,
  generatedAt,
} = {}) {
  const metadata = [
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
  return createRtlDocxBlob({
    title: `مذكرة فنية — ${standardId}`,
    description: "مذكرة بحث فني مساعدة من KOSIF",
    buildChildren: ({ paragraph, table, heading, bulletList, HeadingLevel }) => [
      paragraph("مذكرة بحث فني", { bold: true, heading: HeadingLevel.TITLE, color: "573B9D", size: 36 }),
      table(["الحقل", "القيمة"], metadata),
      heading("غرض المذكرة"),
      paragraph(standardSummary || "تقييم ارتباط المعيار بالحسابات والوقائع المتاحة."),
      heading("نتيجة شجرة القرار"),
      paragraph(decisionResult || "لم تكتمل شجرة القرار بعد؛ يلزم توثيق الوقائع والإجابات."),
      ...(decisionHistory.length ? [heading("مسار الإجابات"), ...bulletList(decisionHistory.map((item) => `${item.question} — ${item.answer}`))] : []),
      ...(professionalCase ? [
        heading("الحالة المهنية التطبيقية"),
        paragraph(professionalCase.summary),
        heading("بوابات الإطار والسريان"),
        ...bulletList([professionalCase.frameworkGate, professionalCase.effectiveDateGate]),
        heading("الوقائع والمدخلات المطلوبة"),
        ...bulletList(professionalCase.facts),
        heading("المخاطر"),
        ...bulletList(professionalCase.auditRisks),
        heading("استجابة المراجعة"),
        ...bulletList(professionalCase.procedures),
        heading("الأدلة والمخرجات"),
        ...bulletList([...(professionalCase.evidence || []), ...(professionalCase.expectedOutput || [])]),
      ] : []),
      heading("استنتاج المراجع"),
      paragraph(conclusion || "لم يُسجل استنتاج نهائي."),
      heading("إجراءات الإقفال المقترحة"),
      ...bulletList([
        "مطابقة الوقائع مع العقود والمستندات المؤيدة.",
        "التحقق من النسخة النافذة وتاريخ السريان من المصدر الرسمي.",
        "ربط الحكم بالأرقام والإفصاحات وأدلة المراجعة.",
        "توثيق المراجعة والاعتماد البشري داخل ملف الارتباط.",
      ]),
      paragraph("تنبيه مهني: هذه أداة بحث ومذكرة مساعدة، وليست بديلًا عن النص الرسمي النافذ أو الحكم المهني أو متطلبات التوثيق والاعتماد.", { bold: true, color: "8C4D18" }),
      paragraph("توقيع المراجع: ____________________    التاريخ: ____________________"),
    ],
  });
}

export async function createAppliedAccountingDocxBlob({
  entityName,
  period,
  summary = {},
  cycle = [],
  ifrs18 = {},
  standardId,
  modelTitle,
  formula,
  inputRows = [],
  resultRows = [],
  generatedAt,
} = {}) {
  return createRtlDocxBlob({
    title: "حزمة التطبيق المحاسبي والانتقال إلى IFRS 18",
    description: "حزمة إعادة أداء وتوجيه بحثي من KOSIF",
    buildChildren: ({ paragraph, table, heading, HeadingLevel }) => [
      paragraph("حزمة التطبيق المحاسبي والانتقال إلى IFRS 18", { bold: true, heading: HeadingLevel.TITLE, color: "573B9D", size: 34 }),
      paragraph(`${entityName} · ${period} · ${generatedAt}`),
      table(["المؤشر", "القيمة"], [
        ["دورة الإقفال", `${summary.cycleComplete}/${summary.cycleTotal}`],
        ["جاهزية IFRS 18", `${summary.ifrs18Passed}/${summary.ifrs18Total}`],
        ["خريطة المعرفة", `${summary.uniqueVideoSources} فيديو فريد`],
      ]),
      heading("دورة المحاسبة والإقفال"),
      table(["المحور", "المعايير", "الحالة", "التفصيل"], cycle.map((item) => [item.title, (item.standards || []).join(" · "), item.status === "complete" ? "مكتمل" : "يتطلب متابعة", item.detail])),
      heading("خريطة عرض IFRS 18 التوجيهية"),
      table(["الفئة", "الحسابات", "صافي الحركة"], (ifrs18.rows || []).map((item) => [item.label, item.accountCount, item.total])),
      heading(`${standardId} · ${modelTitle}`),
      paragraph(`الصيغة والافتراض: ${formula}`),
      heading("مدخلات السيناريو"),
      table(["المدخل", "القيمة"], inputRows),
      heading("نتيجة إعادة الأداء"),
      table(["المخرج", "القيمة"], resultRows),
      paragraph("النتائج أدوات سيناريو وتوجيه بحثي. يلزم التحقق من النص الرسمي النافذ والوقائع والمصادر والحكم والاعتماد البشري قبل الترحيل أو التقرير.", { bold: true, color: "8C4D18" }),
    ],
  });
}

export { DOCX_MIME };
