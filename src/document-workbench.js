import { storeEvidenceBytes, readEvidenceBytes, deleteEvidenceBytes } from './evidence-store.js';
import { sha256BytesHex } from './governance.js';

const clean = value => String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim();

export function indexDocumentParts(parts, documentId) {
  const snippets = [];
  for (const part of parts) {
    const text = clean(part.text);
    for (let offset = 0; offset < text.length; offset += 1500) {
      if (snippets.length === 2500) return snippets;
      snippets.push({ documentId, page: part.page, locator: part.locator, text: text.slice(offset, offset + 1500), selected: false });
    }
  }
  return snippets;
}

async function extractPdf(file, maxPages, startPage) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), standardFontDataUrl: '/pdf-fonts/' }).promise;
  try {
    if (startPage > pdf.numPages) throw new Error('صفحة البداية أكبر من عدد صفحات المستند.');
    const last = Math.min(pdf.numPages, startPage + maxPages - 1);
    const parts = [];
    for (let number = startPage; number <= last; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      parts.push({ page: number, locator: 'PDF ص' + number, text: content.items.map(item => item.str || '').join(' ') });
      page.cleanup();
    }
    return { parts, pages: pdf.numPages, pagesRead: last - startPage + 1, method: 'pdf-text', startPage, endPage: last };
  } finally {
    await pdf.destroy();
  }
}

export async function extractAuditDocument(file, { maxPages = 48, startPage = 1, store = storeEvidenceBytes } = {}) {
  if (!file || !file.size || file.size > 80 * 1024 * 1024) throw new Error('اختر مستندًا غير فارغ لا يتجاوز 80MB.');
  maxPages = Math.max(1, Math.min(160, Number(maxPages) || 48));
  startPage = Math.max(1, Math.floor(Number(startPage) || 1));
  let extracted;

  if (/\.pdf$/i.test(file.name)) {
    extracted = await extractPdf(file, maxPages, startPage);
  } else if (/\.docx$/i.test(file.name)) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file('word/document.xml')?.async('text');
    if (!xml || xml.length > 20_000_000) throw new Error('تعذر قراءة DOCX أو تجاوز النص الحجم المسموح.');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('بنية DOCX غير سليمة.');
    const parts = [...doc.getElementsByTagName('w:p')].map((p, i) => ({
      page: i + 1,
      locator: 'DOCX فقرة ' + (i + 1),
      text: [...p.getElementsByTagName('w:t')].map(t => t.textContent || '').join(' '),
    }));
    extracted = { parts, pages: 0, pagesRead: 0, method: 'docx-paragraphs' };
  } else if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, sheetRows: 1001 });
    const parts = workbook.SheetNames.slice(0, 12).flatMap(name => XLSX.utils.sheet_to_json(
      workbook.Sheets[name],
      { header: 1, raw: false, defval: '' },
    ).slice(0, 1000).map((row, i) => ({ page: i + 1, locator: name + ' · صف ' + (i + 1), text: row.map(clean).join(' | ') })));
    extracted = { parts, pages: 0, pagesRead: 0, method: 'xlsx-rows', limit: 'أول 1000 صف من أول 12 ورقة' };
  } else if (/\.(csv|tsv|txt|md|xml|json)$/i.test(file.name)) {
    const text = await file.text();
    if (/\.json$/i.test(file.name)) JSON.parse(text);
    extracted = {
      parts: text.split(/\r?\n/).slice(0, 20000).map((line, i) => ({ page: i + 1, locator: 'سطر ' + (i + 1), text: line })),
      pages: 0,
      pagesRead: 0,
      method: 'text-lines',
      limit: 'أول 20000 سطر',
    };
  } else {
    throw new Error('استخدم PDF نصيًا أو DOCX أو XLSX أو CSV أو TXT أو MD أو XML أو JSON.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const documentId = await sha256BytesHex(bytes);
  const snippets = indexDocumentParts(extracted.parts, documentId);
  if (!snippets.length) throw new Error('لم يُستخرج نص قابل للقراءة. المستند المصوّر يحتاج OCR؛ لا تعتبر صفحاته مقروءة.');
  const id = documentId + ':' + (extracted.startPage || 1) + ':' + (extracted.endPage || 0);
  await store('document:' + documentId, bytes, { fileName: file.name, fileSize: file.size, hash: documentId, kind: 'document-workbench' });
  await store('doc-index:' + id, new TextEncoder().encode(JSON.stringify(snippets)));
  return {
    id,
    documentId,
    name: file.name,
    size: file.size,
    method: extracted.method,
    pages: extracted.pages,
    pagesRead: extracted.pagesRead,
    startPage: extracted.startPage,
    endPage: extracted.endPage,
    limit: extracted.limit,
    snippetCount: snippets.length,
    snippets,
    selected: [],
    createdAt: new Date().toISOString(),
  };
}

export function documentDescriptor(document) {
  const { snippets, ...descriptor } = document;
  return descriptor;
}

export async function readDocumentIndex(descriptor) {
  const bytes = await readEvidenceBytes('doc-index:' + descriptor.id);
  if (!bytes) throw new Error('الفهرس المحلي غير متاح؛ أعد رفع ' + descriptor.name);
  return { ...descriptor, snippets: JSON.parse(new TextDecoder().decode(bytes)) };
}

export function selectedDocumentExcerpts(documents = []) {
  return documents.flatMap(doc => (doc.selected || [])
    .map(index => doc.snippets?.[index])
    .filter(Boolean)
    .map(item => ({ documentId: item.documentId, page: item.page, locator: item.locator, text: item.text })))
    .slice(0, 8);
}

export async function retainDocumentRound(round) {
  await storeEvidenceBytes('doc-round:' + round.id, new TextEncoder().encode(JSON.stringify(round)));
  const { results, excerpts, ...descriptor } = round;
  return { ...descriptor, resultsCount: results.length };
}

export async function readDocumentRound(descriptor) {
  const bytes = await readEvidenceBytes('doc-round:' + descriptor.id);
  return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : { ...descriptor, results: [], unavailable: true };
}

export async function deleteDocumentIndex(descriptor, keepOriginal = false) {
  await deleteEvidenceBytes('doc-index:' + descriptor.id);
  if (!keepOriginal) await deleteEvidenceBytes('document:' + descriptor.documentId);
}
