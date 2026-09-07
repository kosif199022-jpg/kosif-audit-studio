export const REPORT_TEMPLATE_FIELDS = Object.freeze([
  { id: "entity", label: "اسم المنشأة", patterns: [/company|entity|منشأة|شركة/i] },
  { id: "period", label: "الفترة المالية", patterns: [/period|fiscal year|financial year|فترة مالية|السنة المالية/i] },
  { id: "executiveSummary", label: "الملخص التنفيذي", patterns: [/executive summary|overview|ملخص تنفيذي|نظرة عامة/i] },
  { id: "auditOpinion", label: "الاستنتاج / الرأي", patterns: [/opinion|conclusion|الرأي|الاستنتاج/i] },
  { id: "basisOfOpinion", label: "أساس الاستنتاج", patterns: [/basis for|basis of|أساس الرأي|أساس الاستنتاج/i] },
  { id: "keyAuditMatters", label: "مسائل المراجعة الرئيسية", patterns: [/key audit|critical audit|مسائل المراجعة|أمور المراجعة/i] },
  { id: "riskAndControls", label: "المخاطر والرقابة", patterns: [/risk|internal control|مخاطر|رقابة داخلية/i] },
  { id: "financialStatements", label: "القوائم المالية", patterns: [/financial statements|balance sheet|قوائم مالية|القوائم المالية|المركز المالي/i] },
  { id: "notes", label: "الإيضاحات والسياسات", patterns: [/notes to|accounting policies|إيضاحات|الإيضاحات|سياسات محاسبية/i] },
  { id: "managementResponsibility", label: "مسؤوليات الإدارة", patterns: [/management.*responsib|responsib.*management|مسؤوليات الإدارة|مسئوليات الإدارة/i] },
  { id: "auditorResponsibility", label: "مسؤوليات المراجع", patterns: [/auditor.*responsib|responsib.*auditor|مسؤوليات المراجع|مسئوليات المراجع/i] },
  { id: "sources", label: "المعايير والمصادر", patterns: [/standards|references|sources|المعايير|المصادر|المراجع/i] },
]);

export function cleanTemplateText(value, max = 4000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
}

export function inferReportTemplate({ name, type, paragraphs = [], headings = [], fields = [], extraction = {} }) {
  const readable = [...headings, ...paragraphs].map((value) => cleanTemplateText(value, 1000)).filter(Boolean);
  const detected = REPORT_TEMPLATE_FIELDS.filter((field) => fields.includes(field.id) || readable.some((line) => field.patterns.some((pattern) => pattern.test(line))));
  const selected = detected.length > 2 ? detected : REPORT_TEMPLATE_FIELDS;
  const ids = [...new Set(["entity", "period", ...selected.map((field) => field.id)])];
  return {
    schemaVersion: 2,
    sourceName: cleanTemplateText(name, 160),
    sourceType: cleanTemplateText(type, 120),
    retention: "schema-only",
    fields: ids,
    sections: ids.filter((id) => !["entity", "period"].includes(id)).map((id, index) => ({
      id, order: index + 1, enabled: true, label: REPORT_TEMPLATE_FIELDS.find((field) => field.id === id)?.label || id,
    })),
    outline: headings.map((heading) => cleanTemplateText(heading, 140)).filter(Boolean).slice(0, 24),
    extraction: {
      method: cleanTemplateText(extraction.method || "structured-fields", 60),
      pagesRead: Number.isSafeInteger(extraction.pagesRead) ? extraction.pagesRead : 0,
      pageCount: Number.isSafeInteger(extraction.pageCount) ? extraction.pageCount : 0,
      detected: detected.length > 2,
    },
    theme: "violet",
    density: "professional",
    rtl: true,
  };
}

export function readTemplateDataRows(rows, template) {
  const allowed = new Set(template?.fields || []);
  const values = {};
  for (const row of rows || []) {
    const id = cleanTemplateText(row?.[0], 80);
    if (!allowed.has(id)) continue;
    const value = row.length > 2 ? row[2] : row[1];
    values[id] = cleanTemplateText(value, 12000);
  }
  if (!Object.keys(values).length) throw new TypeError("لم تُوجد حقول مطابقة للقالب. استخدم ملف XLSX الذي نُزّل من هذا الاستوديو.");
  return values;
}

export function buildTemplateData(template, engagement = {}) {
  const values = { entity: engagement.entity?.name || "", period: engagement.entity?.period || "", ...(template?.data || {}) };
  return Object.fromEntries((template?.fields || []).map((id) => [id, cleanTemplateText(values[id], 12000)]));
}
