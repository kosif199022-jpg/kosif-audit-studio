import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileText,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { createImportedAccount } from "../data.js";
import { createCsvTemplate, parseTrialBalanceText } from "../importer.js";
import { workbookArrayBufferToCsv } from "../xlsx-importer.js";
import "../governance.css";

const delimiterLabels = { "\t": "Tab", ",": "فاصلة", ";": "فاصلة منقوطة", "|": "شرطة عمودية" };

function downloadText(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob(["\uFEFF", content], { type });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
}

function IntakeMetric({ label, value, tone = "neutral" }) {
  return <article className={`gov-mini-metric tone-${tone}`}><small>{label}</small><strong dir="auto">{value}</strong></article>;
}

function formatMinor(value, formatter) {
  const amount = Number(BigInt(value || 0)) / 100;
  return typeof formatter === "function" ? formatter(amount) : amount.toFixed(2);
}

export function DataIntakeWorkspace({
  accounts,
  dataProfile,
  formatCurrency,
  formatNumber,
  onCommit,
  onStageSession,
  sessionRestorePreview,
  onConfirmSession,
  onCancelSession,
  onReset,
  onToast,
}) {
  const [rawText, setRawText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [staged, setStaged] = useState(null);
  const fileRef = useRef(null);
  const sessionFileRef = useRef(null);

  const notify = (message) => {
    if (typeof onToast === "function") onToast(message);
  };

  const stageData = () => {
    const result = parseTrialBalanceText(rawText);
    setStaged(result);
    notify(result.errors.length
      ? `اكتمل الفحص مع ${result.errors.length} أخطاء تحتاج معالجة.`
      : result.balanced
        ? "اكتمل فحص البيانات وأصبحت جاهزة للالتزام."
        : "اكتمل الفحص لكن الميزان غير متوازن.");
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "txt", "tsv", "xlsx", "xls"].includes(extension)) {
      notify("الصيغ المدعومة: XLSX وXLS وCSV وTSV وTXT.");
      event.target.value = "";
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      notify("حجم الملف يتجاوز 15 MB؛ قسّمه أو صدّره كملف أخف.");
      event.target.value = "";
      return;
    }
    try {
      if (["xlsx", "xls"].includes(extension)) {
        const result = await workbookArrayBufferToCsv(await file.arrayBuffer());
        setRawText(result.text);
        setSourceName(`${file.name} · ${result.sheetName}`);
        setStaged(null);
        notify(`قُرئت الورقة «${result.sheetName}» محليًا من ${file.name} دون تغيير الميزان الحالي.`);
        return;
      }
      const text = await file.text();
      setRawText(text);
      setSourceName(file.name);
      setStaged(null);
      notify(`تم تحميل ${file.name} إلى منطقة التحضير دون تغيير الميزان الحالي.`);
    } catch (error) {
      setRawText("");
      setSourceName("");
      setStaged(null);
      event.target.value = "";
      notify(`تعذرت قراءة الملف: ${error instanceof Error ? error.message : "تحقق من بنية المصنف."}`);
    }
  };

  const handleSessionFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) {
      notify("حجم لقطة الجلسة يتجاوز 32 MB.");
      event.target.value = "";
      return;
    }
    const stagedSession = await onStageSession?.(file);
    if (stagedSession !== false) {
      setRawText("");
      setSourceName("");
      setStaged(null);
      if (fileRef.current) fileRef.current.value = "";
    }
    event.target.value = "";
  };

  const confirmSessionRestore = async () => {
    const restored = await onConfirmSession?.();
    if (restored === false) return;
    setRawText("");
    setSourceName("");
    setStaged(null);
    if (fileRef.current) fileRef.current.value = "";
    if (sessionFileRef.current) sessionFileRef.current.value = "";
  };

  const commitData = async () => {
    if (!staged?.balanced || staged.errors.length) {
      notify("لا يمكن الالتزام قبل معالجة الأخطاء وتحقيق التوازن الدقيق.");
      return;
    }
    const imported = staged.rows.map(createImportedAccount);
    const committed = await onCommit(imported, {
      source: "import",
      label: sourceName || "بيانات ملصقة",
      rowCount: imported.length,
      importedAt: new Date().toISOString(),
      warnings: staged.warnings.length,
    });
    if (committed === false) return;
    notify(`تم اعتماد ${imported.length} حسابًا للجلسة الحالية بعد التحقق الدقيق.`);
  };

  const resetDemo = async () => {
    const reset = await onReset();
    if (reset === false) return;
    setRawText("");
    setSourceName("");
    setStaged(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="view-stack governance-view" dir="rtl">
      <section className="panel page-intro gov-intro">
        <div>
          <span className="eyebrow">Staging قبل الالتزام</span>
          <h2>استيراد وتحضير ميزان المراجعة</h2>
          <p>ارفع XLSX أو XLS أو CSV أو TSV، أو الصق البيانات؛ تُفحص الأعمدة والتكرارات والإشارات والتوازن بالوحدات الصغرى قبل استبدال بيانات العمل.</p>
        </div>
        <div className="gov-intro-mark"><Database size={24} /><span><strong>{formatNumber(accounts.length)}</strong><small>حساب نشط</small></span></div>
      </section>

      <section className="gov-flow" aria-label="مراحل إدخال البيانات">
        {[
          ["1", "إدخال", "ملف أو لصق"],
          ["2", "تحضير", "لا كتابة مباشرة"],
          ["3", "تحقق", "دقة وتوازن"],
          ["4", "التزام", "قرار صريح"],
        ].map(([number, title, detail]) => <div key={number}><b>{number}</b><span><strong>{title}</strong><small>{detail}</small></span></div>)}
      </section>

      <div className="gov-two-column gov-intake-grid">
        <section className="panel gov-upload-panel">
          <div className="gov-section-head">
            <div><span className="eyebrow">المصدر الحالي</span><h3>{dataProfile.label}</h3><p>{dataProfile.source === "demo" ? "بيانات عرض حتمية ومتوازنة." : "بيانات مستوردة لهذه الجلسة فقط؛ لا تُرفع إلى خدمة خارجية."}</p></div>
            <button type="button" className="button button-outline" onClick={resetDemo}><RotateCcw size={17} /> استعادة 5,000 حساب</button>
          </div>

          <label className="gov-dropzone">
            <Upload size={28} aria-hidden="true" />
            <strong>اختر ملف XLSX / XLS / CSV / TSV / TXT</strong>
            <span>حتى 15 MB — يُقرأ داخل المتصفح ولا يغيّر البيانات قبل الاعتماد</span>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/tab-separated-values,text/plain" onChange={handleFile} />
          </label>

          <label className="gov-session-restore">
            <ShieldCheck size={21} aria-hidden="true" />
            <span><strong>تحضير استعادة من لقطة KOSIF JSON</strong><small>حتى 32 MB؛ تُفحص وتُعرض للمراجعة أولًا ولا تغيّر بيانات العمل بمجرد اختيار الملف.</small></span>
            <b>اختيار JSON</b>
            <input ref={sessionFileRef} type="file" accept=".json,application/json" onChange={handleSessionFile} />
          </label>

          {sessionRestorePreview ? (
            <section className="gov-validation is-valid" aria-label="مراجعة عقد الاستعادة قبل التأكيد">
              <div className="gov-section-head">
                <div>
                  <span className="eyebrow">جاهز للتأكيد الصريح</span>
                  <h3>لم تتغير بيانات العمل بعد</h3>
                  <p>{sessionRestorePreview.fileName}</p>
                </div>
                <ShieldCheck className="gov-state-icon success" size={30} />
              </div>
              <div className="gov-mini-grid">
                <IntakeMetric label="المنشأة المعاد بناؤها" value={sessionRestorePreview.entityName} tone="neutral" />
                <IntakeMetric label="الفترة" value={sessionRestorePreview.period} tone="neutral" />
                <IntakeMetric label="عدد الحسابات" value={formatNumber(sessionRestorePreview.rowCount)} tone="green" />
                <IntakeMetric label="معرف البيانات" value={sessionRestorePreview.datasetId} tone="gold" />
              </div>
              <div className="gov-issue-list" role="alert">
                <div className="warning">
                  <AlertTriangle size={16} />
                  <span><b>استبدال مدمّر ومقصود</b>عند التأكيد ستُحذف بايتات الأدلة المحلية وتُفتح الموافقات والنتائج والأقفال وسياسة الأهمية لإعادة المراجعة. لا تُستعاد تصنيفات أو سلطات من ملف JSON.</span>
                </div>
              </div>
              <p><small>SHA-256</small> <bdi dir="ltr" title={sessionRestorePreview.digest}>{sessionRestorePreview.digest}</bdi></p>
              <div className="gov-actions">
                <button type="button" className="button button-dark" onClick={confirmSessionRestore}><Database size={18} /> تأكيد الاستبدال ومسح حالة المراجعة</button>
                <button type="button" className="button button-outline" onClick={onCancelSession}>إلغاء دون تغيير</button>
              </div>
            </section>
          ) : null}

          <label className="gov-paste-field">
            <span>أو الصق البيانات مع صف العناوين</span>
            <textarea rows="10" value={rawText} onChange={(event) => { setRawText(event.target.value); setStaged(null); }} placeholder={'رمز الحساب,اسم الحساب,مدين,دائن\n110001,النقد,125000.00,0\n410001,الإيرادات,0,125000.00'} />
          </label>

          <div className="gov-actions">
            <button type="button" className="button button-gold" onClick={stageData} disabled={!rawText.trim()}><ShieldCheck size={18} /> فحص وتحضير البيانات</button>
            <button type="button" className="button button-outline" onClick={() => downloadText("kosif-trial-balance-template.csv", createCsvTemplate(), "text/csv;charset=utf-8")}><Download size={17} /> تنزيل نموذج CSV</button>
          </div>
        </section>

        <section className={`panel gov-validation ${staged?.balanced ? "is-valid" : staged ? "has-issues" : ""}`}>
          <div className="gov-section-head">
            <div><span className="eyebrow">نتيجة الفحص</span><h3>{staged ? (staged.balanced ? "جاهز للالتزام" : "يتطلب معالجة") : "لم يبدأ الفحص بعد"}</h3><p>{staged ? `الفاصل المكتشف: ${delimiterLabels[staged.delimiter] || "—"}` : "لن يتغير الميزان الحالي حتى تضغط اعتماد البيانات."}</p></div>
            {staged ? (staged.balanced ? <CheckCircle2 className="gov-state-icon success" size={32} /> : <AlertTriangle className="gov-state-icon warning" size={32} />) : <FileText className="gov-state-icon" size={32} />}
          </div>

          <div className="gov-mini-grid">
            <IntakeMetric label="صفوف صالحة" value={formatNumber(staged?.rows.length || 0)} tone={staged?.rows.length ? "green" : "neutral"} />
            <IntakeMetric label="أخطاء مانعة" value={formatNumber(staged?.errors.length || 0)} tone={staged?.errors.length ? "red" : "green"} />
            <IntakeMetric label="تنبيهات" value={formatNumber(staged?.warnings.length || 0)} tone={staged?.warnings.length ? "gold" : "green"} />
            <IntakeMetric label="فرق الميزان" value={formatMinor(staged?.differenceMinor || 0n, formatCurrency)} tone={staged?.differenceMinor ? "red" : "green"} />
          </div>

          {staged?.errors.length || staged?.warnings.length ? (
            <div className="gov-issue-list" aria-label="ملاحظات التحقق">
              {[...staged.errors.map((item) => ({ ...item, type: "error" })), ...staged.warnings.map((item) => ({ ...item, type: "warning" }))].slice(0, 8).map((item, index) => (
                <div key={`${item.type}-${item.row}-${index}`} className={item.type}><AlertTriangle size={16} /><span><b>صف {item.row || "—"}</b>{item.message}</span></div>
              ))}
              {(staged.errors.length + staged.warnings.length) > 8 ? <small>توجد ملاحظات إضافية؛ عالج المصدر ثم أعد الفحص.</small> : null}
            </div>
          ) : null}

          <button type="button" className="button button-dark full-width" disabled={!staged?.balanced || staged.errors.length > 0} onClick={commitData}><Database size={18} /> اعتماد البيانات للجلسة</button>
        </section>
      </div>

      {staged?.rows.length ? (
        <section className="panel gov-preview-panel">
          <div className="gov-section-head"><div><span className="eyebrow">معاينة قبل الالتزام</span><h3>معاينة أول {Math.min(staged.rows.length, 12)} حسابًا</h3><p>الأرقام المعروضة مشتقة من الوحدات الصغرى نفسها المستخدمة في فحص التوازن.</p></div></div>
          <div className="table-scroll" tabIndex="0">
            <table>
              <thead><tr><th>صف المصدر</th><th>رمز الحساب</th><th>اسم الحساب</th><th className="numeric">مدين</th><th className="numeric">دائن</th></tr></thead>
              <tbody>{staged.rows.slice(0, 12).map((row) => <tr key={`${row.code}-${row.sourceRow}`}><td>{row.sourceRow}</td><td><bdi>{row.code}</bdi></td><td><strong>{row.name}</strong></td><td className="numeric">{formatMinor(row.debitMinor, formatCurrency)}</td><td className="numeric">{formatMinor(row.creditMinor, formatCurrency)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default DataIntakeWorkspace;
