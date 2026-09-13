/**
 * KOSIF V5 — Document Intelligence domain normalization.
 * Pure functions only. AI output is untrusted until normalized and reviewed.
 */

const INTEGER_STRING = /^-?\d+$/;
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);
const PRIORITIES = new Set(['critical', 'high', 'normal', 'low']);

export function classifyDocumentMetadata({ name = '', mimeType = '' } = {}) {
  const filename = String(name).toLowerCase();
  const mime = String(mimeType).toLowerCase();
  const extension = filename.includes('.') ? filename.split('.').pop() : '';
  const tests = [
    [/trial|balance|ميزان/, 'trial-balance'], [/chart|coa|دليل.*حساب/, 'chart-of-accounts'],
    [/general.*ledger|ledger|استاذ|أستاذ/, 'general-ledger'], [/journal|قيد|قيود/, 'journal'],
    [/bank|بنك/, 'bank-statement'], [/aging|اعمار|أعمار/, 'aging'], [/inventory|مخزون|جرد/, 'inventory'],
    [/lease|ايجار|إيجار/, 'lease'], [/legal|lawyer|قانون|محام/, 'legal'],
    [/financial|statement|قوائم|ميزاني/, 'financial-statements']
  ];
  for (const [pattern, type] of tests) if (pattern.test(filename)) return { type, basis: 'filename', confidence: 'medium' };
  if (mime.includes('pdf') || extension === 'pdf') return { type: 'pdf-document', basis: 'mime', confidence: 'low' };
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(extension)) return { type: 'image-document', basis: 'mime', confidence: 'low' };
  if (mime.includes('spreadsheet') || mime.includes('excel') || ['xlsx', 'xls', 'csv'].includes(extension)) return { type: 'spreadsheet', basis: 'mime', confidence: 'low' };
  if (mime.includes('word') || ['doc', 'docx'].includes(extension)) return { type: 'word-document', basis: 'mime', confidence: 'low' };
  return { type: extension ? `${extension}-document` : 'unknown', basis: 'metadata', confidence: 'low' };
}

const text = value => typeof value === 'string' ? value.trim() : '';
const nullableText = value => text(value) || null;
const integerString = value => {
  if (typeof value === 'bigint') return value.toString();
  const candidate = typeof value === 'number' && Number.isInteger(value) ? String(value) : text(value);
  return INTEGER_STRING.test(candidate) ? candidate : null;
};
const enumValue = (value, allowed, fallback) => allowed.has(value) ? value : fallback;
const pageValue = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

export function normalizeDocumentAnalysis(raw = {}, fallback = {}) {
  const claims = Array.isArray(raw.claims) ? raw.claims.slice(0, 250).map((claim, index) => ({
    id: text(claim?.id) || `CLM-${String(index + 1).padStart(4, '0')}`,
    kind: text(claim?.kind) || 'fact',
    label: text(claim?.label) || 'حقيقة مستخرجة',
    valueText: text(claim?.valueText),
    amountMinor: integerString(claim?.amountMinor),
    currency: nullableText(claim?.currency),
    page: pageValue(claim?.page),
    confidence: enumValue(claim?.confidence, CONFIDENCE, 'low'),
    assertion: nullableText(claim?.assertion),
    accountHint: nullableText(claim?.accountHint),
    sourceQuote: text(claim?.sourceQuote).slice(0, 500)
  })) : [];

  const risks = Array.isArray(raw.risks) ? raw.risks.slice(0, 80).map((risk, index) => ({
    id: text(risk?.id) || `DRSK-${String(index + 1).padStart(4, '0')}`,
    title: text(risk?.title) || 'إشارة تحتاج مراجعة',
    severity: enumValue(risk?.severity, SEVERITIES, 'medium'),
    rationale: text(risk?.rationale),
    assertions: Array.isArray(risk?.assertions) ? risk.assertions.map(text).filter(Boolean).slice(0, 10) : [],
    standards: Array.isArray(risk?.standards) ? risk.standards.map(text).filter(Boolean).slice(0, 10) : [],
    claimIds: Array.isArray(risk?.claimIds) ? risk.claimIds.map(text).filter(Boolean).slice(0, 30) : []
  })) : [];

  const requests = Array.isArray(raw.requests) ? raw.requests.slice(0, 50).map((request, index) => ({
    id: text(request?.id) || `DREQ-${String(index + 1).padStart(4, '0')}`,
    title: text(request?.title) || 'مستند إضافي',
    priority: enumValue(request?.priority, PRIORITIES, 'normal'),
    reason: text(request?.reason),
    acceptanceCriteria: Array.isArray(request?.acceptanceCriteria)
      ? request.acceptanceCriteria.map(text).filter(Boolean).slice(0, 12) : [],
    relatedRiskIds: Array.isArray(request?.relatedRiskIds) ? request.relatedRiskIds.map(text).filter(Boolean).slice(0, 20) : []
  })) : [];

  const adjustmentCandidates = Array.isArray(raw.adjustmentCandidates) ? raw.adjustmentCandidates.slice(0, 30).map((item, index) => ({
    id: text(item?.id) || `ACND-${String(index + 1).padStart(4, '0')}`,
    title: text(item?.title) || 'تسوية محتملة',
    rationale: text(item?.rationale),
    standards: Array.isArray(item?.standards) ? item.standards.map(text).filter(Boolean).slice(0, 10) : [],
    confidence: enumValue(item?.confidence, CONFIDENCE, 'low'),
    lines: Array.isArray(item?.lines) ? item.lines.slice(0, 20).map(line => ({
      side: line?.side === 'debit' || line?.side === 'credit' ? line.side : null,
      accountName: text(line?.accountName),
      amountMinor: integerString(line?.amountMinor)
    })).filter(line => line.side && line.accountName && line.amountMinor !== null) : []
  })) : [];

  return {
    documentType: text(raw.documentType) || fallback.documentType || 'unknown',
    entityName: nullableText(raw.entityName),
    periodStart: nullableText(raw.periodStart),
    periodEnd: nullableText(raw.periodEnd),
    currency: nullableText(raw.currency),
    unitScale: nullableText(raw.unitScale),
    summary: text(raw.summary),
    extractionConfidence: enumValue(raw.extractionConfidence, CONFIDENCE, 'low'),
    claims,
    risks,
    requests,
    adjustmentCandidates,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(text).filter(Boolean).slice(0, 30) : []
  };
}

function stableSuffix(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36).toUpperCase();
}

export function analysisToEvidence(document, analysis, { createdAt = new Date().toISOString() } = {}) {
  return analysis.claims.map((claim, index) => ({
    id: `EVD-${stableSuffix(`${document.id}:${claim.id}:${index}`)}`,
    title: claim.label,
    documentIds: [document.id],
    requestIds: [],
    riskIds: analysis.risks.filter(risk => risk.claimIds.includes(claim.id)).map(risk => risk.id),
    reviewStatus: 'unreviewed',
    sourceType: 'document',
    criteriaSatisfied: [],
    documentDate: analysis.periodEnd || null,
    createdAt,
    claim: { ...claim },
    provenance: { documentId: document.id, sha256: document.sha256 || null, page: claim.page }
  }));
}

export function analysisToIssues(document, analysis, existingIssues = []) {
  const signatures = new Set(existingIssues.map(issue => `${String(issue.title).toLowerCase()}|${(issue.documentIds || []).join(',')}`));
  const added = [];
  for (const risk of analysis.risks) {
    const signature = `${risk.title.toLowerCase()}|${document.id}`;
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    added.push({
      id: `ISS-${stableSuffix(`${document.id}:${risk.id}`)}`,
      title: risk.title,
      severity: risk.severity,
      status: 'open',
      riskIds: [risk.id],
      evidenceIds: [],
      documentIds: [document.id],
      rationale: risk.rationale,
      assertions: [...risk.assertions],
      standards: [...risk.standards],
      source: 'document-intelligence'
    });
  }
  return added;
}

export function analysisRequestsAsCouncilAsks(analysis) {
  return analysis.requests.map(request => ({
    title: request.title,
    priority: request.priority,
    reason: request.reason,
    riskIds: [...request.relatedRiskIds],
    acceptanceCriteria: request.acceptanceCriteria.map((label, index) => ({ id: `criterion-${index + 1}`, label, required: true }))
  }));
}

export function documentRiskSignals(document, analysis) {
  return analysis.risks.map(risk => ({
    id: `${document.id}:${risk.id}`,
    title: risk.title,
    severity: risk.severity,
    status: 'open',
    standards: [...risk.standards],
    assertions: [...risk.assertions],
    accountName: analysis.claims.find(claim => risk.claimIds.includes(claim.id))?.accountHint || document.name,
    accountId: document.id,
    amount: analysis.claims.find(claim => risk.claimIds.includes(claim.id) && claim.amountMinor !== null)?.amountMinor || '0',
    sourceDocumentId: document.id,
    rationale: risk.rationale
  }));
}

export function documentAnalysisMetrics(analyses = []) {
  const list = analyses.filter(Boolean);
  return {
    documentsAnalyzed: list.length,
    claims: list.reduce((sum, item) => sum + item.claims.length, 0),
    risks: list.reduce((sum, item) => sum + item.risks.length, 0),
    requestedDocuments: list.reduce((sum, item) => sum + item.requests.length, 0),
    adjustmentCandidates: list.reduce((sum, item) => sum + item.adjustmentCandidates.length, 0),
    warnings: list.reduce((sum, item) => sum + item.warnings.length, 0)
  };
}

export function buildDocumentCouncilPositions(analyses = [], { documentCount = 0, evidenceCount = 0 } = {}) {
  const list = analyses.filter(Boolean);
  const risks = list.flatMap(item => item.risks || []);
  const asks = list.flatMap(analysisRequestsAsCouncilAsks);
  const warnings = list.flatMap(item => item.warnings || []);
  const byStandard = pattern => risks.filter(risk => (risk.standards || []).some(item => pattern.test(item)));
  const byText = pattern => risks.filter(risk => pattern.test(`${risk.title} ${risk.rationale} ${(risk.standards || []).join(' ')}`));
  const stanceFor = rows => rows.some(r => r.severity === 'critical') ? 'objection' : rows.some(r => r.severity === 'high') ? 'caution' : 'clear';
  const rows = [
    { seatId: 'engagement', title: 'مدير الارتباط', domain: 'التخطيط وتنسيق العمل', related: risks, asks, statement: list.length ? `تم تحليل ${list.length} مستند آليًا واستخراج ${risks.length} إشارة خطر. لا تُغلق أي مسألة قبل مراجعة الأدلة والطلبات.` : 'لا يوجد تحليل مستندات متاح بعد.' },
    { seatId: 'ifrs', title: 'خبير IFRS', domain: 'الاعتراف والقياس والعرض والإفصاح', related: byStandard(/^(IFRS|IAS)/i), asks: [], statement: 'يراجع الإشارات المحاسبية والتصنيف والتقديرات المستخرجة من المستندات.' },
    { seatId: 'isa', title: 'خبير ISA', domain: 'المخاطر والإجراءات والأدلة', related: risks, asks, statement: asks.length ? `يوجد ${asks.length} طلب دليل مقترح يحتاج تحويله إلى طلبات محكومة داخل الجولة.` : 'لا توجد طلبات إضافية مستخرجة من المستندات في هذه اللحظة.' },
    { seatId: 'fraud', title: 'محلل الاحتيال', domain: 'ISA 240 والشذوذ', related: byText(/fraud|احتيال|تلاعب|override|manual|revenue|ايراد|إيراد/i), asks: [], statement: 'يفحص إشارات التلاعب أو تجاوز الإدارة دون اعتبار الإشارة إثباتًا للاحتيال.' },
    { seatId: 'data', title: 'محلل البيانات', domain: 'الاتزان والتصنيف والتحليلات', related: risks, asks: [], statement: `المستندات المسجلة ${documentCount}، والأدلة/Claims ${evidenceCount}. أي رقم آلي يظل بحاجة إلى تحقق من المصدر.` },
    { seatId: 'quality', title: 'مراجع الجودة', domain: 'ISQM / ISA 220 والتحدي', related: warnings.length ? [{ severity: 'high' }] : [], asks: [], statement: warnings.length ? `يوجد ${warnings.length} تحذير استخراج أو عدم يقين؛ يمنع اعتبار التحليل الآلي دليلًا نهائيًا.` : 'لم تظهر تحذيرات استخراج، مع بقاء الاعتماد البشري إلزاميًا.' },
    { seatId: 'controls', title: 'خبير الرقابة الداخلية', domain: 'ISA 315 والضوابط', related: byText(/control|رقاب|صلاحيات|ITGC|system/i), asks: [], statement: 'يفحص الإشارات المتعلقة بالضوابط ونقاط الضعف دون الاعتماد على ضابط غير مختبر.' },
    { seatId: 'tax', title: 'خبير الزكاة والضريبة', domain: 'ZATCA — الزكاة وضريبة القيمة المضافة', related: byText(/tax|vat|zakat|ضريب|زكاة/i), asks: [], statement: 'يفحص المستندات والادعاءات الضريبية عند ظهورها.' },
    { seatId: 'going-concern', title: 'خبير الاستمرارية والتقييم', domain: 'ISA 570 / ISA 540', related: byText(/going concern|استمرار|impair|انخفاض|valuation|تقييم|estimate|تقدير/i), asks: [], statement: 'يفحص مؤشرات الاستمرارية والتقديرات والافتراضات متى ظهرت في الأدلة.' }
  ];
  return rows.map(row => ({
    seatId: row.seatId, title: row.title, domain: row.domain,
    stance: row.seatId === 'engagement' ? (list.length ? 'caution' : 'blocked') : stanceFor(row.related || []),
    statement: row.related?.length && !['engagement','isa','data','quality'].includes(row.seatId) ? `${row.statement} ظهرت ${row.related.length} إشارة مرتبطة بهذا الاختصاص.` : row.statement,
    basis: row.related?.slice(0, 4).map(item => item.title || item.rationale || 'إشارة مستند') || [],
    asks: row.asks || []
  }));
}
