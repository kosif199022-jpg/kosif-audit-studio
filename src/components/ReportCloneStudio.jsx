import { useMemo, useState } from "react";
import { Download, Eye, FileSpreadsheet, FileText, Palette, Sparkles, Upload } from "lucide-react";
import { downloadTextFile, timestampedFilename } from "../session-export.js";
import { createTemplateReportDocxBlob } from "../professional-docx.js";
import { buildTemplateData, cleanTemplateText, inferReportTemplate, readTemplateDataRows, REPORT_TEMPLATE_FIELDS } from "../report-template.js";
import "../report-clone.css";

const THEMES = { violet: "بنفسجي KOSIF", navy: "كحلي احترافي", forest: "أخضر تقريري" };

function textRows(rows) {
  return (rows || []).map((row) => (Array.isArray(row) ? row.map((value) => cleanTemplateText(value, 1000)).join(" · ") : cleanTemplateText(row, 1000))).filter(Boolean);
}

async function extractDocx(file) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("text");
  if (!xml || typeof DOMParser === "undefined") throw new TypeError("تعذر قراءة بنية DOCX في هذا المتصفح.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const paragraphs = [...document.getElementsByTagName("w:p")].map((paragraph) => [...paragraph.getElementsByTagName("w:t")].map((node) => node.textContent || "").join(" ").trim()).filter(Boolean);
  const headings = paragraphs.filter((value) => value.length < 160).slice(0, 40);
  return { paragraphs, headings, extraction: { method: "docx-xml", pagesRead: 0, pageCount: 0 } };
}

async function extractPdf(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({
    data: await file.arrayBuffer(),
    useWorkerFetch: true,
    // Supplying the bundled standard fonts keeps extraction deterministic for
    // annual reports that reference the PDF base-14 fonts.
    standardFontDataUrl: "/pdf-fonts/",
  }).promise;
  const pageNumbers = pdf.numPages <= 48
    ? Array.from({ length: pdf.numPages }, (_, index) => index + 1)
    : [...Array.from({ length: 36 }, (_, index) => index + 1), ...Array.from({ length: 8 }, (_, index) => pdf.numPages - 7 + index)];
  const paragraphs = [];
  for (const pageNumber of [...new Set(pageNumbers)]) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const line = content.items.map((item) => item.str || "").join(" ").replace(/\s+/g, " ").trim();
    if (line) paragraphs.push(line);
  }
  return { paragraphs, headings: paragraphs.filter((line) => line.length <= 150).slice(0, 48), extraction: { method: "pdf-text", pagesRead: pageNumbers.length, pageCount: pdf.numPages } };
}

async function extractFile(file) {
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, sheetRows: 100 });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: "" }).slice(0, 100);
    return { paragraphs: textRows(rows), headings: textRows(rows.slice(0, 14)), extraction: { method: "xlsx-header", pagesRead: 0, pageCount: workbook.SheetNames.length } };
  }
  if (/\.json$/i.test(file.name)) {
    const parsed = JSON.parse(await file.text());
    const rows = Array.isArray(parsed) ? parsed.slice(0, 30).map((item) => Object.keys(item || {})) : [Object.keys(parsed || {})];
    return { paragraphs: textRows(rows), headings: textRows(rows), extraction: { method: "json-schema", pagesRead: 0, pageCount: 0 } };
  }
  if (/\.docx$/i.test(file.name)) return extractDocx(file);
  if (/\.pdf$/i.test(file.name)) return extractPdf(file);
  throw new TypeError("استخدم PDF أو DOCX أو XLSX أو JSON للقالب.");
}

export function ReportCloneStudio({ engagement, setEngagement, onToast }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const template = engagement.reportTemplate || null;
  const data = useMemo(() => buildTemplateData(template, engagement), [template, engagement]);

  async function readTemplate(file) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const extracted = await extractFile(file);
      const next = {
        id: "TPL-" + crypto.randomUUID(),
        ...inferReportTemplate({ name: file.name, type: file.type || "application/octet-stream", paragraphs: extracted.paragraphs, headings: extracted.headings, extraction: extracted.extraction }),
        data: {},
        importedAt: new Date().toISOString(),
      };
      setEngagement((current) => ({ ...current, reportTemplate: next }));
      const pageNote = next.extraction.pageCount ? " · تمت قراءة " + (next.extraction.pagesRead || next.extraction.pageCount) + " من " + next.extraction.pageCount + " صفحات" : "";
      onToast?.("تم استخراج الهيكل والنمط الأساسي فقط" + pageNote + "؛ لم يُحفظ الملف الأصلي داخل التطبيق.");
    } catch (e) {
      setError(e?.message || "تعذر قراءة القالب");
    } finally {
      setBusy(false);
    }
  }

  async function readData(file) {
    if (!file || !template) return;
    setBusy(true); setError("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, sheetRows: 250 });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: "" }).slice(1);
      const values = readTemplateDataRows(rows, template);
      setEngagement((current) => ({ ...current, reportTemplate: { ...current.reportTemplate, data: { ...(current.reportTemplate?.data || {}), ...values }, dataSourceName: cleanTemplateText(file.name, 160) } }));
      onToast?.("تم ملء " + Object.keys(values).length + " حقول من ملف البيانات؛ يمكنك معاينة التقرير قبل تنزيله.");
    } catch (e) {
      setError(e?.message || "تعذر قراءة بيانات القالب");
    } finally {
      setBusy(false);
    }
  }

  function patch(next) {
    setEngagement((current) => ({ ...current, reportTemplate: { ...(current.reportTemplate || template), ...next } }));
  }

  async function downloadXlsx() {
    const XLSX = await import("xlsx");
    const rows = [["field_id", "label_ar", "value"], ...template.fields.map((id) => [id, REPORT_TEMPLATE_FIELDS.find((field) => field.id === id)?.label || id, data[id] || ""])];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "بيانات التقرير");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = "kosif-report-template.xlsx"; anchor.click(); URL.revokeObjectURL(href);
  }

  async function downloadDocx() {
    setBusy(true);
    try {
      const blob = await createTemplateReportDocxBlob({ template, data, entity: engagement.entity });
      const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = "kosif-cloned-report-draft.docx"; anchor.click(); URL.revokeObjectURL(href);
      onToast?.("تم تنزيل مسودة DOCX بالهيكل والنمط المستخرجين؛ راجعها قبل أي اعتماد.");
    } catch (e) {
      setError(e?.message || "تعذر إنشاء التقرير");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel report-clone" aria-labelledby="report-clone-title">
    <header className="report-clone-head"><div><span className="eyebrow"><Palette size={14} /> قالب التقرير</span><h2 id="report-clone-title">مستنسخ التقارير</h2><p>استخرج بنية التقرير ونمطه الأساسي، ثم املأ قالب XLSX لاحقًا لإنتاج مسودة بنفس الأقسام والهوية. يحفظ التطبيق المخطط فقط، لا الملف الأصلي.</p></div><label className="button button-gold"><Upload size={17} /> {busy ? "جارٍ استخراج الهيكل…" : "رفع تقرير / قالب"}<input hidden type="file" accept=".json,.xlsx,.xls,.pdf,.docx" disabled={busy} onChange={(event) => { readTemplate(event.target.files?.[0]); event.target.value = ""; }} /></label></header>
    {error ? <p className="report-clone-error" role="alert">{error}</p> : null}
    {!template ? <div className="report-clone-empty"><FileText size={28} /><strong>لا يوجد قالب محفوظ</strong><span>ابدأ بتقرير PDF أو DOCX أو جدول XLSX. سيبقى الناتج تعريفًا قابلًا لإعادة الاستخدام.</span></div> : <>
      <div className="report-clone-meta"><span><strong>{template.sourceName}</strong><small>{template.sourceType} · {template.retention} · {template.extraction?.method || "structured-fields"}</small></span><label>النمط<select value={template.theme || "violet"} onChange={(event) => patch({ theme: event.target.value })}>{Object.entries(THEMES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>الكثافة<select value={template.density || "professional"} onChange={(event) => patch({ density: event.target.value })}><option value="professional">احترافي</option><option value="compact">مضغوط</option><option value="executive">تنفيذي</option></select></label></div>
      <div className={"report-clone-preview theme-" + (template.theme || "violet")}><div><small><Sparkles size={13} /> معاينة قبل التنزيل</small><h3>{data.entity || engagement.entity?.name || "المنشأة الحالية"}</h3><p>{data.period || engagement.entity?.period || "الفترة المالية"} · مسودة قابلة للتتبع · {template.rtl ? "RTL" : "LTR"}</p><label className="report-clone-data-upload button button-outline"><Upload size={15} /> ملء بيانات XLSX<input hidden type="file" accept=".xlsx,.xls" disabled={busy} onChange={(event) => { readData(event.target.files?.[0]); event.target.value = ""; }} /></label></div><div className="report-clone-section-list">{template.sections.filter((section) => section.enabled !== false).slice(0, 8).map((section) => <span key={section.id}>{section.order}. {section.label || REPORT_TEMPLATE_FIELDS.find((field) => field.id === section.id)?.label || section.id}<small>{data[section.id] ? "معبأ" : "مسودة"}</small></span>)}</div></div>
      <div className="report-clone-actions"><button className="button button-dark" type="button" disabled={busy} onClick={downloadDocx}><FileText size={16} /> تنزيل مسودة DOCX</button><button className="button button-outline" type="button" onClick={() => downloadTextFile(JSON.stringify({ template, data }, null, 2), timestampedFilename("kosif-report-template", "json"), "application/json")}><Download size={16} /> تنزيل تعريف القالب</button><button className="button button-outline" type="button" onClick={downloadXlsx}><FileSpreadsheet size={16} /> تنزيل قالب XLSX</button><button className="button button-outline" type="button" onClick={() => document.querySelector(".report-clone-preview")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Eye size={16} /> معاينة</button></div>
      <small className="report-clone-note">الحقول {template.fields.length} · الأقسام {template.sections.length} · {template.extraction?.detected ? "عُثر على عناوين مناسبة" : "استُخدم هيكل KOSIF الاحتياطي"} · {template.dataSourceName ? "مصدر البيانات: " + template.dataSourceName : "لم تُملأ بيانات XLSX بعد"}.</small>
    </>}
  </section>;
}
