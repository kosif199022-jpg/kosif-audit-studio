import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  FileCheck2,
  RotateCcw,
  Scale,
} from "lucide-react";
import { getStandard } from "../standards.js";

const riskLabels = { high: "مرتفع", medium: "متوسط", low: "منخفض" };
const statusLabels = {
  closed: "مغلق",
  review: "قيد المراجعة",
  open: "مفتوح",
};

function buildCategoryStats(accounts) {
  const stats = new Map();
  for (const account of accounts) {
    const key = account.category;
    if (!key) continue;
    const amount = Number(account.amount || 0);
    const current = stats.get(key) || { exposure: 0, representative: null };
    current.exposure += amount;
    if (
      !current.representative ||
      amount > Number(current.representative.amount || 0)
    ) {
      current.representative = account;
    }
    stats.set(key, current);
  }
  return stats;
}

function findingContext(finding, categoryStats) {
  let exposure = 0;
  let representative = null;
  for (const categoryKey of new Set(finding.categoryKeys || [])) {
    const category = categoryStats.get(categoryKey);
    if (!category) continue;
    exposure += category.exposure;
    if (
      category.representative &&
      (!representative ||
        Number(category.representative.amount || 0) >
          Number(representative.amount || 0))
    ) {
      representative = category.representative;
    }
  }
  return { exposure, representative };
}

function StandardButtons({ ids, account, onOpenStandard }) {
  const standards = [...new Set(ids.filter(Boolean))]
    .map((id) => ({ id, standard: getStandard(id) }))
    .filter(({ standard }) => standard);

  if (!standards.length) return null;

  return (
    <div className="audit-insight-standards" aria-label="المعايير المرتبطة بالنتيجة">
      {standards.map(({ id, standard }) => (
        <button
          key={id}
          type="button"
          className={standard.type === "audit" ? "audit" : "accounting"}
          onClick={() =>
            onOpenStandard?.(id, account?.id || null, "finding-card")
          }
          title={`فتح ${id} ووصف علاقته بالحساب`}
        >
          <BookOpenCheck size={15} aria-hidden="true" />
          <bdi dir="ltr">{id}</bdi>
          <span>{standard.type === "audit" ? "مراجعة" : "محاسبة"}</span>
        </button>
      ))}
    </div>
  );
}

export function AuditInsightCards({
  findings = [],
  accounts = [],
  evidence = [],
  limit,
  formatCurrency,
  onOpenStandard,
  onOpenRound,
  onOpenEvidence,
}) {
  const categoryStats = useMemo(() => buildCategoryStats(accounts), [accounts]);
  const evidenceById = useMemo(
    () => new Map(evidence.map((item) => [item.id, item])),
    [evidence],
  );
  const visibleFindings = Number.isFinite(limit)
    ? findings.slice(0, Math.max(0, limit))
    : findings;
  const currency = (value) =>
    typeof formatCurrency === "function"
      ? formatCurrency(value)
      : new Intl.NumberFormat("ar-SA-u-nu-latn", {
          style: "currency",
          currency: "SAR",
          maximumFractionDigits: 2,
        }).format(value);

  return (
    <div className="audit-insight-list">
      {visibleFindings.map((finding) => {
        const { exposure, representative } = findingContext(
          finding,
          categoryStats,
        );
        const quantifiedAmount = Number(finding.quantifiedAmount || 0);
        const linkedEvidence = (finding.evidenceIds || [])
          .map((id) => evidenceById.get(id))
          .filter(Boolean);
        const approvedEvidence = linkedEvidence.filter(
          ({ status }) => status === "approved",
        ).length;
        const evidenceLabel = linkedEvidence.length
          ? `${approvedEvidence}/${linkedEvidence.length} دليل معتمد`
          : "لا يوجد دليل مرتبط";

        return (
          <article
            key={finding.id}
            className={`audit-insight-card severity-${finding.severity || "medium"}`}
          >
            <header>
              <span className={`audit-insight-risk risk-${finding.severity || "medium"}`}>
                <AlertTriangle size={16} aria-hidden="true" />
                الخطر: {riskLabels[finding.severity] || "غير محدد"}
              </span>
              <span className={`audit-insight-status status-${finding.status || "open"}`}>
                <CheckCircle2 size={15} aria-hidden="true" />
                {statusLabels[finding.status] || finding.status || "مفتوح"}
              </span>
            </header>

            <div className="audit-insight-heading">
              <div>
                <bdi dir="ltr">{finding.id}</bdi>
                <h3>{finding.title}</h3>
                <small>{finding.area}</small>
              </div>
              <span className="audit-insight-exposure">
                <Scale size={17} aria-hidden="true" />
                <small>{quantifiedAmount > 0 ? "المبلغ المحدد" : "تعرض مجال الميزان"}</small>
                <strong dir="ltr">
                  {quantifiedAmount > 0
                    ? currency(quantifiedAmount)
                    : exposure > 0
                      ? currency(exposure)
                      : "غير مرتبط"}
                </strong>
                {quantifiedAmount > 0 && finding.quantifiedBasis ? (
                  <em>{finding.quantifiedBasis}</em>
                ) : null}
              </span>
            </div>

            <StandardButtons
              ids={finding.standardIds?.length ? finding.standardIds : [finding.standard]}
              account={representative}
              onOpenStandard={onOpenStandard}
            />

            {representative ? (
              <div className="audit-insight-account">
                <span>حساب مرجعي</span>
                <strong>
                  <bdi dir="ltr">{representative.code}</bdi> — {representative.name}
                </strong>
              </div>
            ) : null}

            <p className="audit-insight-summary">{finding.summary || "لا يوجد ملخص وصفي."}</p>

            <div className="audit-insight-next-action">
              <ArrowLeft size={17} aria-hidden="true" />
              <span>
                <small>الإجراء التالي</small>
                <strong>{finding.recommendation || finding.resolution || "توثيق استنتاج المراجع وربطه بالدليل."}</strong>
              </span>
            </div>

            <details className="audit-insight-links">
              <summary>عرض روابط الجولة والدليل</summary>
              <div>
                {finding.roundId ? (
                  <button type="button" onClick={() => onOpenRound?.(finding.roundId)}>
                    <RotateCcw size={16} aria-hidden="true" />
                    الجولة <bdi dir="ltr">{finding.roundId}</bdi>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onOpenEvidence?.(finding.evidenceIds || [])}
                  disabled={!linkedEvidence.length}
                >
                  <FileCheck2 size={16} aria-hidden="true" />
                  {evidenceLabel}
                </button>
              </div>
            </details>
          </article>
        );
      })}
    </div>
  );
}
