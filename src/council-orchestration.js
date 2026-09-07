export function planCouncilCoverage(seats = [], selectedIds = [], scope = "selected") {
  if (!Array.isArray(seats) || !seats.length) throw new TypeError("council seats are required");
  const ids = seats.map((seat) => seat?.id);
  if (ids.some((id) => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) throw new TypeError("council seat IDs must be unique");
  const selectedSet = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const requested = scope === "all" ? seats : seats.filter((seat) => selectedSet.has(seat.id));
  const selected = requested.length ? requested : seats;
  const delegatedBy = selected.length === 1 ? selected[0].id : null;
  const effectiveSeats = delegatedBy
    ? seats.map((seat) => ({ ...seat, delegatedBy, coverageMode: "delegated-coverage" }))
    : selected.map((seat) => ({ ...seat, delegatedBy: null, coverageMode: "independent-seat" }));
  return {
    selectedIds: selected.map(({ id }) => id),
    delegatedBy,
    coverageMode: delegatedBy ? "delegated-coverage" : selected.length === seats.length ? "full-council" : "partial-council",
    effectiveSeats,
  };
}

const STANDARD_PATTERN = /\b(?:ISA|IAS|IFRS|ISQM)\s*\d{1,3}\b/gi;

const DOCUMENT_BLUEPRINTS = Object.freeze({
  "data-integrity": "دفتر الأستاذ الكامل وتقرير اتزان المصدر",
  technical: "مذكرة المعالجة المحاسبية وسياسة الاعتراف والإفصاح",
  "risk-evidence": "مستندات الإثبات المرتبطة بالحسابات والإجراءات والعينة",
  completion: "قائمة الإقفال وتسوية التحريفات ومسودة القوائم",
  engagement: "خطاب الارتباط وتأكيد النطاق والمسؤوليات",
  ifrs: "السياسة المحاسبية ومذكرة تطبيق المعيار للفترة",
  isa: "برنامج المراجعة وأوراق العمل ونتيجة الإجراء",
  fraud: "دفتر اليومية الكامل وسجل المستخدمين والصلاحيات",
  quality: "قائمة الإكمال ومراجعة الجودة ومسودة التقرير",
  controls: "مصفوفة الرقابة واختبارات التصميم والتنفيذ",
  tax: "الإقرارات الزكوية والضريبية والمطابقات ذات الصلة",
  "going-concern": "توقعات التدفق النقدي وخطط التمويل وتحليل الحساسية",
});

function standardIdsFrom(value) {
  return [...new Set(String(value || "").match(STANDARD_PATTERN) || [])].map((item) => item.replace(/\s+/g, " ").toUpperCase());
}

/**
 * Turns independent seat outputs into a compact, reviewable matrix.  This is
 * deliberately deterministic: the matrix only describes the supplied
 * outputs; it never invents agreement or changes a severity.
 */
export function buildCouncilMatrix(advisorResults = [], seatCatalog = []) {
  const definitions = new Map((seatCatalog || []).map((seat) => [seat.id, seat]));
  const rows = (Array.isArray(advisorResults) ? advisorResults : []).map((result, index) => {
    const definition = definitions.get(result?.id) || {};
    const refs = Array.isArray(result?.refs) ? result.refs.filter(Boolean).map(String) : [];
    const actions = Array.isArray(result?.actions) ? result.actions.filter(Boolean).map(String) : [];
    const standards = [...new Set([...standardIdsFrom(result?.standard), ...standardIdsFrom(definition.standard)])];
    return {
      id: String(result?.id || `seat-${index + 1}`),
      role: definition.role || definition.title || result?.role || String(result?.id || "عضو المجلس"),
      persona: definition.persona || "مراجعة مستقلة قابلة للتحدي",
      severity: ["high", "medium", "low"].includes(result?.severity) ? result.severity : "medium",
      verdict: String(result?.verdict || "لم يُسجل استنتاج"),
      standard: String(result?.standard || definition.standard || "—"),
      standards,
      refs,
      evidenceStatus: refs.length ? "linked" : "missing",
      actionCount: actions.length,
      nextAction: actions[0] || "لا يوجد إجراء مسجل",
      delegatedBy: result?.delegatedBy || null,
      coverageMode: result?.coverageMode || "independent-seat",
    };
  });
  const counts = rows.reduce((acc, row) => { acc[row.severity] += 1; return acc; }, { high: 0, medium: 0, low: 0 });
  const total = rows.length;
  const dominant = Math.max(counts.high, counts.medium, counts.low, 0);
  const agreementPercent = total ? Math.round((dominant / total) * 100) : 0;
  const conflicts = rows.length > 1 && counts.high > 0 && counts.low > 0;
  const evidenceGaps = rows.filter((row) => row.severity !== "low" && row.evidenceStatus === "missing");
  return {
    rows,
    counts,
    total,
    agreementPercent,
    conflicts,
    evidenceGaps,
    delegated: rows.filter((row) => row.coverageMode === "delegated-coverage"),
  };
}

/**
 * Produces document requests from council objections.  It returns a plan only;
 * the UI explicitly commits these requests to the PBC register so a human can
 * decide whether to send them.
 */
export function buildCouncilEvidenceRequests(advisorResults = [], { roundId = null, auditRound = null, now = new Date().toISOString() } = {}) {
  if (!roundId || !auditRound?.id) return [];
  const standards = Array.isArray(auditRound?.standards) ? auditRound.standards.filter(Boolean) : [];
  const createdAt = new Date(now).toISOString();
  const due = new Date(Date.parse(createdAt) + 7 * 86400000).toISOString().slice(0, 10);
  const seen = new Set();
  return (Array.isArray(advisorResults) ? advisorResults : [])
    .filter((result) => ["high", "medium"].includes(result?.severity))
    .map((result, index) => {
      const seatId = String(result?.id || `seat-${index + 1}`);
      const title = DOCUMENT_BLUEPRINTS[seatId] || `مستند إضافي لمعالجة ملاحظة ${seatId}`;
      const key = `${roundId}:${seatId}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: `PBC-COUNCIL-${roundId}-${String(index + 1).padStart(2, "0")}`,
        title,
        roundId: auditRound.id,
        councilRoundId: roundId,
        councilSeatId: seatId,
        area: "طلب صادر من مجلس المراجعين",
        owner: "مسؤول البيانات لدى العميل",
        due,
        status: "pending",
        priority: result.severity,
        standardIds: standards,
        rationale: String(result.verdict || result.detail || "فجوة أدلة تحتاج استكمالًا"),
        source: "council-evidence-plan",
        createdAt,
      };
    })
    .filter(Boolean);
}

/** Build short, human-readable prompts for an independent challenge pass. */
export function buildCouncilChallengeQuestions(matrix, previousRoundId = null) {
  const rows = matrix?.rows || [];
  return rows
    .filter((row) => row.severity !== "low" || row.evidenceStatus === "missing")
    .slice(0, 8)
    .map((row) => ({
      seatId: row.id,
      standard: row.standards[0] || row.standard,
      question: `ما الدليل المناقض أو البديل الذي قد يغيّر استنتاج «${row.verdict}»؟`,
      action: row.nextAction,
      previousRoundId,
    }));
}
