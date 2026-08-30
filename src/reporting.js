import { REQUIRED_AUDIT_ROUND_COUNT, auditRoundBlueprints } from "./audit-rounds.js";
import { sha256HexSync } from "./governance.js";
import { standardsById } from "./standards.js";
import { assessMisstatements, parseMinorUnits } from "./audit-core.js";

export const opinionLabels = Object.freeze({
  not_determined: "لم يُحدد",
  unmodified: "رأي غير معدل",
  qualified: "رأي متحفظ",
  adverse: "رأي معاكس",
  disclaimer: "الامتناع عن إبداء الرأي",
});

export function isAdjustmentPosted(adjustment) {
  if (
    adjustment?.status !== "accepted"
    || !hasText(adjustment?.journalReference)
    || !validIso(adjustment?.reviewedAt)
    || !validIso(adjustment?.postedAt)
    || Date.parse(adjustment.reviewedAt) > Date.parse(adjustment.postedAt)
    || !hasText(adjustment?.reviewedBy)
    || !hasText(adjustment?.currency)
  ) return false;
  if (!/^\d+$/.test(adjustment?.amountMinor || "") || !Array.isArray(adjustment.lines) || adjustment.lines.length < 2) return false;
  let debit = 0n;
  let credit = 0n;
  const debitAccountIds = new Set();
  const creditAccountIds = new Set();
  for (const line of adjustment.lines) {
    if (
      !hasText(line?.accountId)
      || !hasText(line?.code)
      || !hasText(line?.name)
      || !/^\d+$/.test(line?.debitMinor || "")
      || !/^\d+$/.test(line?.creditMinor || "")
    ) return false;
    const lineDebit = BigInt(line.debitMinor);
    const lineCredit = BigInt(line.creditMinor);
    if ((lineDebit > 0n) === (lineCredit > 0n)) return false;
    if (lineDebit > 0n) debitAccountIds.add(line.accountId);
    if (lineCredit > 0n) creditAccountIds.add(line.accountId);
    debit += lineDebit;
    credit += lineCredit;
  }
  if (debit <= 0n || debit !== credit || [...debitAccountIds].some((id) => creditAccountIds.has(id))) return false;
  return debit === BigInt(adjustment.amountMinor);
}

const minorValue = (value) => (/^-?\d+$/.test(String(value ?? "")) ? BigInt(value) : 0n);

/**
 * Applies only posted, balanced adjustments to a net trial balance. Each row is
 * re-netted to one side, while the bridge separately preserves gross journal
 * debits and credits for posting-control reconciliation.
 */
export function applyPostedAdjustmentsToAccounts(accounts = [], adjustments = []) {
  const creditNormalCategories = new Set([
    "payables", "contractLiabilities", "leaseLiabilities", "provisions", "debt",
    "employeeBenefits", "tax", "equity", "revenue", "otherIncome",
  ]);
  const byId = new Map(accounts.map((account) => [account.id, {
    ...account,
    _netMinor: minorValue(account.debitMinor) - minorValue(account.creditMinor),
    _appliedAdjustmentIds: [],
  }]));

  for (const adjustment of adjustments.filter(isAdjustmentPosted)) {
    for (const line of adjustment.lines) {
      const account = byId.get(line.accountId);
      if (!account) continue;
      account._netMinor += minorValue(line.debitMinor) - minorValue(line.creditMinor);
      account._appliedAdjustmentIds.push(adjustment.id);
    }
  }

  return accounts.map((source) => {
    const account = byId.get(source.id);
    const debitMinor = account._netMinor > 0n ? account._netMinor : 0n;
    const creditMinor = account._netMinor < 0n ? -account._netMinor : 0n;
    const amountMinor = creditNormalCategories.has(account.category)
      ? creditMinor - debitMinor
      : debitMinor - creditMinor;
    const { _netMinor, _appliedAdjustmentIds, ...cleanAccount } = account;
    return {
      ...cleanAccount,
      debitMinor: String(debitMinor),
      creditMinor: String(creditMinor),
      amountMinor: String(amountMinor),
      debit: Number(debitMinor) / 100,
      credit: Number(creditMinor) / 100,
      amount: Number(amountMinor) / 100,
      appliedAdjustmentIds: [..._appliedAdjustmentIds],
    };
  });
}

export function buildAdjustmentBridge(accounts = [], adjustments = []) {
  const posted = adjustments.filter(isAdjustmentPosted);
  const adjustedAccounts = applyPostedAdjustmentsToAccounts(accounts, posted);
  const sum = (rows, field) => rows.reduce((total, row) => total + minorValue(row[field]), 0n);
  const postedDebitMinor = posted.flatMap((item) => item.lines).reduce((total, line) => total + minorValue(line.debitMinor), 0n);
  const postedCreditMinor = posted.flatMap((item) => item.lines).reduce((total, line) => total + minorValue(line.creditMinor), 0n);
  const beforeDebitMinor = sum(accounts, "debitMinor");
  const beforeCreditMinor = sum(accounts, "creditMinor");
  const adjustedDebitMinor = sum(adjustedAccounts, "debitMinor");
  const adjustedCreditMinor = sum(adjustedAccounts, "creditMinor");
  const toNumber = (value) => Number(value) / 100;
  return {
    postedCount: posted.length,
    beforeDebitMinor: String(beforeDebitMinor),
    beforeCreditMinor: String(beforeCreditMinor),
    postedDebitMinor: String(postedDebitMinor),
    postedCreditMinor: String(postedCreditMinor),
    journalizedDebitMinor: String(beforeDebitMinor + postedDebitMinor),
    journalizedCreditMinor: String(beforeCreditMinor + postedCreditMinor),
    adjustedDebitMinor: String(adjustedDebitMinor),
    adjustedCreditMinor: String(adjustedCreditMinor),
    beforeDebit: toNumber(beforeDebitMinor),
    beforeCredit: toNumber(beforeCreditMinor),
    postedDebit: toNumber(postedDebitMinor),
    postedCredit: toNumber(postedCreditMinor),
    journalizedDebit: toNumber(beforeDebitMinor + postedDebitMinor),
    journalizedCredit: toNumber(beforeCreditMinor + postedCreditMinor),
    adjustedDebit: toNumber(adjustedDebitMinor),
    adjustedCredit: toNumber(adjustedCreditMinor),
    adjustedAccounts,
  };
}

function latestIsoTimestamp(values) {
  let latest = 0;
  for (const value of values) {
    const parsed = Date.parse(value || "");
    if (Number.isFinite(parsed)) latest = Math.max(latest, parsed);
  }
  return latest;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validIso(value) {
  return Number.isFinite(Date.parse(value || ""));
}

function hasUniqueIds(items) {
  const ids = (items || []).map((item) => item?.id).filter(Boolean);
  return ids.length === (items || []).length && new Set(ids).size === ids.length;
}

function validSha256(value) {
  return /^[a-f0-9]{64}$/i.test(value || "") && !/^(.)\1{63}$/.test(value);
}

function sameIds(first, second) {
  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) return false;
  const expected = new Set(first);
  return expected.size === first.length
    && new Set(second).size === second.length
    && second.every((id) => expected.has(id));
}

function validStandardIds(ids) {
  return Array.isArray(ids)
    && ids.length > 0
    && new Set(ids).size === ids.length
    && ids.every((id) => standardsById.has(id));
}

const manualPbcStatusOrder = Object.freeze(["pending", "received", "review", "approved"]);
const manualPbcTimestampFields = Object.freeze(["createdAt", "receivedAt", "reviewStartedAt", "approvedAt"]);

function evaluateManualPbcRequest(item, roundsById) {
  const statusIndex = manualPbcStatusOrder.indexOf(item?.status);
  const timestamps = manualPbcTimestampFields.map((field) => item?.[field]);
  const requiredTimestamps = timestamps.slice(0, statusIndex + 1);
  const prematureTimestamps = statusIndex >= 0 ? timestamps.slice(statusIndex + 1) : timestamps;
  const chronologyValid = statusIndex >= 0
    && requiredTimestamps.every(validIso)
    && prematureTimestamps.every((value) => value == null || value === "")
    && requiredTimestamps.every((value, index) => (
      index === 0 || Date.parse(requiredTimestamps[index - 1]) <= Date.parse(value)
    ));
  const completionValid = chronologyValid
    && item.status === "approved"
    && hasText(item.title)
    && hasText(item.roundId)
    && roundsById.has(item.roundId)
    && hasText(item.approvedBy)
    && hasText(item.responseReference)
    && hasText(item.conclusion);
  return { chronologyValid, completionValid, timestamps: timestamps.filter(Boolean) };
}

export function buildReportState(engagement, metrics) {
  const rounds = engagement?.rounds || [];
  const evidence = engagement?.evidence || [];
  const findings = engagement?.findings || [];
  const manualPbcRequests = engagement?.manualPbcRequests || [];
  const roundsById = new Map(rounds.map((item) => [item.id, item]));
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const findingsById = new Map(findings.map((item) => [item.id, item]));
  const manualPbcEvaluations = manualPbcRequests.map((item) => evaluateManualPbcRequest(item, roundsById));
  const manualPbcChronologyValid = manualPbcEvaluations.every((item) => item.chronologyValid);
  const requiredRoundIdsPresent = auditRoundBlueprints.every((blueprint) => roundsById.has(blueprint.id));
  const validEvidenceIds = new Set(evidence.filter((item) => (
    item.status === "approved"
    && hasText(item.fileName)
    && Number.isInteger(item.fileSize)
    && item.fileSize > 0
    && hasText(item.mediaType)
    && item.hashAlgorithm === "sha256"
    && validSha256(item.hash)
    && validIso(item.attachedAt)
    && validIso(item.reviewedAt)
    && Date.parse(item.attachedAt) <= Date.parse(item.reviewedAt)
    && hasText(item.reviewedBy)
    && hasText(item.conclusion)
    && validStandardIds(item.standardIds)
    && hasText(item.roundId)
    && roundsById.has(item.roundId)
    && Number.isInteger(Number(item.version))
    && Number(item.version) > 0
    && ["indexeddb-local", "synthetic-fixture-metadata"].includes(item.attachmentStorage)
    && validIso(item.verifiedAt)
    && Date.parse(item.verifiedAt) >= Date.parse(item.attachedAt)
    && Date.parse(item.verifiedAt) <= Date.parse(item.reviewedAt)
    && (item.attachmentStorage === "synthetic-fixture-metadata"
      ? item.verificationMethod === "synthetic-fixture-digest" && hasText(item.hashInput) && sha256HexSync(item.hashInput) === item.hash
      : item.verificationMethod === "sha256-recomputed-from-indexeddb" && hasText(item.storageKey) && item.contentRetained === true)
    && Array.isArray(item.findingIds)
    && item.findingIds.length > 0
    && item.findingIds.every((id) => (
      findingsById.get(id)?.roundId === item.roundId
      && findingsById.get(id)?.evidenceIds?.includes(item.id)
    ))
    && roundsById.get(item.roundId)?.evidenceIds?.includes(item.id)
    && item.findingIds.every((id) => roundsById.get(item.roundId)?.findingIds?.includes(id))
  )).map((item) => item.id));
  const invalidEvidence = evidence.length - validEvidenceIds.size;
  const missingEvidence = Math.max(0, REQUIRED_AUDIT_ROUND_COUNT - evidence.length);
  const pendingManualPbc = manualPbcEvaluations.filter((item) => !item.completionValid).length;
  const pendingEvidence = invalidEvidence + missingEvidence + pendingManualPbc;
  const validFindingIds = new Set(findings.filter((item) => (
    item.status === "closed"
    && validIso(item.closedAt)
    && hasText(item.closedBy)
    && hasText(item.resolution)
    && validStandardIds(item.standardIds?.length ? item.standardIds : [item.standard])
    && hasText(item.roundId)
    && roundsById.has(item.roundId)
    && Array.isArray(item.evidenceIds)
    && item.evidenceIds.length > 0
    && item.evidenceIds.every((id) => validEvidenceIds.has(id))
    && item.evidenceIds.every((id) => Date.parse(evidenceById.get(id)?.reviewedAt || "") <= Date.parse(item.closedAt))
    && roundsById.get(item.roundId)?.findingIds?.includes(item.id)
  )).map((item) => item.id));
  const openFindingItems = findings.filter((item) => !validFindingIds.has(item.id));
  const missingFindings = Math.max(0, REQUIRED_AUDIT_ROUND_COUNT - findings.length);
  const openFindings = openFindingItems.length + missingFindings;
  const openHigh = openFindingItems.filter((item) => item.severity === "high").length;
  const adjustments = engagement?.adjustments || [];
  const journalReferences = adjustments.map((item) => item?.journalReference).filter(Boolean);
  const adjustmentIdentityValid = hasUniqueIds(adjustments)
    && journalReferences.length === adjustments.length
    && new Set(journalReferences).size === journalReferences.length;
  const pendingAdjustmentItems = adjustments.filter((item) => !isAdjustmentPosted(item));
  const pendingAdjustments = pendingAdjustmentItems.length + (adjustmentIdentityValid ? 0 : 1);
  const materialityComplete = Boolean(
    hasText(engagement?.materialityPolicy?.id)
    && hasText(engagement?.materialityPolicy?.basis)
    && Number.isInteger(engagement?.materialityPolicy?.omRateBp)
    && engagement.materialityPolicy.omRateBp > 0
    && engagement.materialityPolicy.omRateBp <= 10_000
    && Number.isInteger(engagement?.materialityPolicy?.pmRateBp)
    && engagement.materialityPolicy.pmRateBp > 0
    && engagement.materialityPolicy.pmRateBp <= 10_000
    && Number.isInteger(engagement?.materialityPolicy?.cttRateBp)
    && engagement.materialityPolicy.cttRateBp > 0
    && engagement.materialityPolicy.cttRateBp <= 10_000
    && hasText(engagement?.materialityPolicy?.rationaleAr)
    && hasText(engagement?.materialityPolicy?.version)
    && hasText(engagement?.materialityPolicy?.approvedBy)
    && validIso(engagement?.materialityPolicy?.approvedAt)
  );
  const acceptanceComplete = ["independence", "conflicts", "integrity", "terms"].every((key) => engagement?.acceptance?.[key] === true)
    && validIso(engagement?.acceptance?.approvedAt)
    && materialityComplete;
  const roundsComplete = rounds.length >= REQUIRED_AUDIT_ROUND_COUNT
    && requiredRoundIdsPresent
    && hasUniqueIds(rounds)
    && hasUniqueIds(evidence)
    && hasUniqueIds(findings)
    && rounds.every((round) => (
      round.status === "complete"
      && validIso(round.startedAt)
      && validIso(round.completedAt)
      && Date.parse(round.startedAt) <= Date.parse(round.completedAt)
      && hasText(round.conclusion)
      && validStandardIds(round.standards)
      && Array.isArray(round.findingIds)
      && round.findingIds.length === Number(round.findings || 0)
      && round.findingIds.length > 0
      && round.findingIds.every((id) => validFindingIds.has(id) && findingsById.get(id)?.roundId === round.id)
      && Array.isArray(round.evidenceIds)
      && round.evidenceIds.length > 0
      && round.evidenceIds.every((id) => validEvidenceIds.has(id) && evidenceById.get(id)?.roundId === round.id)
      && round.findingIds.every((findingId) => {
        const finding = findingsById.get(findingId);
        return finding?.evidenceIds?.every((evidenceId) => round.evidenceIds.includes(evidenceId));
      })
      && ["evidence-sufficient", "human-reviewed"].includes(round.result?.disposition)
      && sameIds(round.findingIds, round.result.findingIds)
      && sameIds(round.evidenceIds, round.result.evidenceIds)
      && sameIds(round.standards || [], round.result.standards || [])
      && validStandardIds(round.result?.standards)
    ));
  const standardsValid = rounds.every((round) => validStandardIds(round.standards) && validStandardIds(round.result?.standards))
    && evidence.every((item) => validStandardIds(item.standardIds))
    && findings.every((item) => validStandardIds(item.standardIds?.length ? item.standardIds : [item.standard]));
  const reviewedSignalIds = new Set(engagement?.analyticsReview?.reviewedSignals || []);
  const requiredAnalyticalSignals = [
    ...((engagement?.analyticsReview?.snapshot?.benfordFlagDigits || []).map((digit) => `BENFORD-${digit}`)),
    ...(Number(engagement?.analyticsReview?.snapshot?.ratios?.operatingMarginPct) < 0 ? ["OPERATING-MARGIN-NEGATIVE"] : []),
  ];
  const analyticsReviewed = Boolean(
    engagement?.analyticsReview?.acknowledged === true
    && validIso(engagement.analyticsReview.acknowledgedAt)
    && hasText(engagement.analyticsReview.reviewer)
    && hasText(engagement.analyticsReview.conclusion)
    && hasText(engagement.analyticsReview.engine)
    && engagement.analyticsReview.snapshot
    && Number(engagement.analyticsReview.snapshot.accountCount) === Number(metrics?.accountCount)
    && engagement.analyticsReview.snapshot.ratios
    && typeof engagement.analyticsReview.snapshot.ratios === "object"
    && ["currentRatio", "quickRatio", "debtToEquity", "grossMarginPct", "operatingMarginPct", "netMarginBeforeTaxPct"]
      .every((key) => Number.isFinite(engagement.analyticsReview.snapshot.ratios[key]))
    && Number.isFinite(engagement.analyticsReview.snapshot.totalExposure)
    && engagement.analyticsReview.snapshot.totalExposure > 0
    && Array.isArray(engagement.analyticsReview.snapshot.benfordFlagDigits)
    && Array.isArray(engagement.analyticsReview.reviewedSignals)
    && requiredAnalyticalSignals.every((signal) => reviewedSignalIds.has(signal))
  );
  const latestAdjustmentAt = latestIsoTimestamp((engagement?.adjustments || []).map((item) => item.postedAt));
  const periodLocked = Boolean(engagement?.periodLocks?.some((period) => (
    period.id === "2025-12"
    && period.status === "locked"
    && hasText(period.preparedBy)
    && hasText(period.approvedBy)
    && period.preparedBy.trim() !== period.approvedBy.trim()
    && hasText(period.reason)
    && validIso(period.lockedAt)
    && Date.parse(period.lockedAt) >= latestAdjustmentAt
  )));
  const councilRounds = engagement?.council?.rounds || [];
  const councilRoundsValid = councilRounds.length > 0
    && hasUniqueIds(councilRounds)
    && councilRounds.every((round) => (
      hasText(round.id)
      && validIso(round.generatedAt)
      && hasText(round.engineVersion)
      && round.status === "complete"
      && hasText(round.consensus?.status)
      && hasText(round.consensus?.recommendation)
      && Array.isArray(round.advisorResults)
      && round.advisorResults.length === 4
      && new Set(round.advisorResults.map((result) => result?.id)).size === 4
      && Number(round.population) === Number(metrics?.accountCount)
      && Number.isInteger(Number(round.sampleSize))
      && Number(round.sampleSize) > 0
      && Number(round.sampleSize) <= Number(round.population)
      && round.advisorResults.every((result) => (
        hasText(result.id)
        && ["low", "medium", "high"].includes(result.severity)
        && hasText(result.verdict)
        && Array.isArray(result.refs)
        && result.refs.length > 0
      ))
    ));
  const councilDecision = engagement?.council?.humanDecision;
  const councilPrerequisiteAt = latestIsoTimestamp([
    ...rounds.map((item) => item.completedAt),
    ...evidence.map((item) => item.reviewedAt),
    ...findings.map((item) => item.closedAt),
    ...(engagement?.adjustments || []).map((item) => item.postedAt),
    engagement?.analyticsReview?.acknowledgedAt,
    ...(engagement?.periodLocks || []).map((item) => item.lockedAt),
    ...councilRounds.map((item) => item.generatedAt),
    ...manualPbcEvaluations.flatMap((item) => item.timestamps),
  ]);
  const councilApproved = Boolean(
    councilDecision?.status === "approved"
    && hasText(councilDecision.reviewer)
    && hasText(councilDecision.rationale)
    && validIso(councilDecision.decidedAt)
    && councilRoundsValid
    && Date.parse(councilDecision.decidedAt) >= councilPrerequisiteAt
  );
  const mappingApproved = Boolean(
    Number.isInteger(metrics?.unmapped)
    && metrics.unmapped === 0
    && engagement?.mappingConfirmed === true
    && engagement?.standardMappings?.review?.confirmedAt
    && validIso(engagement.standardMappings.review.confirmedAt)
    && hasText(engagement.standardMappings.review.reviewer)
    && hasText(engagement.standardMappings.review.rationale)
  );
  let opinionAssessment;
  try {
    opinionAssessment = assessMisstatements(
      adjustments.map((item) => ({
        amountMinor: /^-?\d+$/.test(String(item?.amountMinor || ""))
          ? String(item.amountMinor)
          : parseMinorUnits(String(item?.amount ?? "0")).toString(),
        corrected: isAdjustmentPosted(item),
        qualitative: item?.qualitative === true,
        qualitativeRationaleAr: item?.qualitativeRationaleAr,
      })),
      /^\d+$/.test(String(metrics?.materialityMinor || ""))
        ? String(metrics.materialityMinor)
        : parseMinorUnits(String(metrics?.materiality || "0")).toString(),
      {
        basis: engagement?.opinionAssessment?.basis || "misstatement",
        scopeLimitationIsMaterial: engagement?.opinionAssessment?.scopeLimitationIsMaterial === true,
        scopeLimitationRationaleAr: engagement?.opinionAssessment?.scopeLimitationRationaleAr || "",
        isPervasive: engagement?.opinionAssessment?.isPervasive === true,
        pervasivenessRationaleAr: engagement?.opinionAssessment?.pervasivenessRationaleAr || "",
      },
    );
  } catch {
    opinionAssessment = { opinionType: "not_determined", isMaterial: false, isPervasive: false, basis: "none" };
  }
  const selectedOpinion = opinionAssessment.opinionType;
  const opinionSelected = Object.prototype.hasOwnProperty.call(opinionLabels, selectedOpinion)
    && selectedOpinion !== "not_determined";
  const humanApproval = engagement?.humanApproval === true;
  const accountCount = metrics?.accountCount;
  const datasetDescriptor = engagement?.sourceDataset || engagement?.demo?.commitment;
  const descriptorCount = engagement?.sourceDataset
    ? Number(engagement.sourceDataset.rowCount)
    : Number(engagement?.demo?.accountCount);
  const populationConsistent = typeof accountCount === "number"
    && Number.isInteger(accountCount)
    && accountCount > 0
    && Number.isInteger(descriptorCount)
    && descriptorCount === accountCount
    && hasText(datasetDescriptor?.datasetId)
    && validSha256(datasetDescriptor?.sha256)
    && metrics?.datasetId === datasetDescriptor.datasetId
    && metrics?.datasetDigest === datasetDescriptor.sha256
    && metrics?.datasetPeriod === datasetDescriptor.period
    && metrics?.datasetCurrency === datasetDescriptor.currency
    && metrics?.datasetCommittedAt === datasetDescriptor.committedAt
    && hasText(datasetDescriptor?.period)
    && hasText(datasetDescriptor?.currency)
    && (engagement?.sourceDataset
      ? validIso(engagement.sourceDataset.importedAt)
        && validIso(engagement.sourceDataset.committedAt)
        && engagement.sourceDataset.importedAt === engagement.sourceDataset.committedAt
        && engagement.sourceDataset.source === "import"
        && engagement.sourceDataset.sessionOnly === true
      : engagement?.demo?.synthetic === true && validIso(datasetDescriptor.committedAt))
    && metrics?.isBalanced === true
    && typeof metrics?.balanceDifference === "number"
    && Number.isFinite(metrics.balanceDifference)
    && metrics.balanceDifference === 0;
  const datasetCommittedAt = engagement?.sourceDataset
    ? Date.parse(engagement.sourceDataset.committedAt || "")
    : Number.NaN;
  const derivedWorkflowDates = [
    engagement?.standardMappings?.review?.confirmedAt,
    ...rounds.flatMap((item) => [item.startedAt, item.completedAt]),
    ...evidence.flatMap((item) => [item.attachedAt, item.reviewedAt]),
    ...findings.map((item) => item.closedAt),
    ...(engagement?.adjustments || []).flatMap((item) => [item.reviewedAt, item.postedAt]),
    engagement?.analyticsReview?.acknowledgedAt,
    ...(engagement?.periodLocks || []).map((item) => item.lockedAt),
    ...(engagement?.council?.rounds || []).map((item) => item.generatedAt),
    engagement?.council?.humanDecision?.decidedAt,
    ...manualPbcEvaluations.flatMap((item) => item.timestamps),
    engagement?.humanApprovedAt,
  ].filter(Boolean).map((value) => Date.parse(value));
  const datasetChronologyValid = !engagement?.sourceDataset || (
    Number.isFinite(datasetCommittedAt)
    && derivedWorkflowDates.every((value) => Number.isFinite(value) && value >= datasetCommittedAt)
  );
  const roundChronologyValid = rounds.every((round) => {
    if (round.status !== "complete") return true;
    const startedAt = Date.parse(round.startedAt || "");
    const completedAt = Date.parse(round.completedAt || "");
    const linkedDates = [
      ...(round.evidenceIds || []).map((id) => evidenceById.get(id)?.attachedAt),
      ...(round.evidenceIds || []).map((id) => evidenceById.get(id)?.reviewedAt),
      ...(round.findingIds || []).map((id) => findingsById.get(id)?.closedAt),
    ].filter(Boolean).map((value) => Date.parse(value));
    return Number.isFinite(startedAt)
      && Number.isFinite(completedAt)
      && startedAt <= completedAt
      && linkedDates.every((value) => Number.isFinite(value) && value >= startedAt && value <= completedAt);
  });
  const latestPrerequisiteAt = latestIsoTimestamp([
    engagement?.acceptance?.approvedAt,
    engagement?.standardMappings?.review?.confirmedAt,
    engagement?.materialityPolicy?.approvedAt,
    ...rounds.flatMap((item) => [item.startedAt, item.completedAt]),
    ...evidence.flatMap((item) => [item.attachedAt, item.reviewedAt]),
    ...findings.map((item) => item.closedAt),
    ...(engagement?.adjustments || []).map((item) => item.postedAt),
    engagement?.analyticsReview?.acknowledgedAt,
    ...(engagement?.periodLocks || []).map((item) => item.lockedAt),
    engagement?.council?.humanDecision?.decidedAt,
    ...manualPbcEvaluations.flatMap((item) => item.timestamps),
  ]);
  const humanApprovedAt = Date.parse(engagement?.humanApprovedAt || "");
  const auditTrail = engagement?.auditTrail || [];
  const auditTrailValid = auditTrail.length > 0
    && hasUniqueIds(auditTrail)
    && auditTrail.every((item) => validIso(item?.at) && hasText(item?.action) && hasText(item?.actor) && hasText(item?.detail))
    && (!humanApproval || auditTrail.some((item) => item.at === engagement.humanApprovedAt && item.action === "اعتماد التقرير"));
  const chronologyValid = datasetChronologyValid
    && roundChronologyValid
    && manualPbcChronologyValid
    && auditTrailValid
    && (!humanApproval || (Number.isFinite(humanApprovedAt) && humanApprovedAt >= latestPrerequisiteAt));
  const readyForHumanApproval = Boolean(
    populationConsistent
    && mappingApproved
    && acceptanceComplete
    && roundsComplete
    && analyticsReviewed
    && periodLocked
    && councilApproved
    && pendingEvidence === 0
    && openFindings === 0
    && pendingAdjustments === 0
    && opinionSelected
    && standardsValid
  );
  const reportReady = readyForHumanApproval
    && humanApproval
    && chronologyValid
    && engagement?.report?.status === "ready";
  const reportOpinion = `${opinionLabels[selectedOpinion] || opinionLabels.not_determined} — ${reportReady ? "جاهز للإصدار" : "مسودة محكومة"}`;

  const gates = [
    { id: "acceptance", label: "القبول والأهمية النسبية معتمدان", pass: acceptanceComplete, detail: acceptanceComplete ? "موثق" : "يتطلب قبولًا وسياسة معتمدة" },
    { id: "balance", label: "مجموعة البيانات متوازنة ومتسقة", pass: populationConsistent, detail: populationConsistent ? `${accountCount.toLocaleString("ar-SA-u-nu-latn")} حسابًا` : "العدد أو المصدر أو الاتزان غير متسق" },
    { id: "mapping", label: "خريطة الحسابات معتمدة", pass: mappingApproved, detail: metrics?.unmapped ? `${metrics.unmapped} غير مربوطة` : mappingApproved ? "قرار اعتماد موثق" : "الربط مكتمل ويحتاج اعتمادًا" },
    { id: "analytics", label: "التحليلات راجعها مراجع بشري", pass: analyticsReviewed, detail: analyticsReviewed ? "إقرار موثق" : "بانتظار الإقرار" },
    { id: "period-lock", label: "الفترة المالية مقفلة", pass: periodLocked, detail: periodLocked ? "قفل بقاعدة الشخصين" : "الإقفال الأولي فقط" },
    { id: "council", label: "خطة مجلس المراجعين معتمدة", pass: councilApproved, detail: councilApproved ? "اعتماد بشري للخطة" : "بانتظار قرار بشري" },
    { id: "rounds", label: "جولات المراجعة مكتملة", pass: roundsComplete && standardsValid, detail: !standardsValid ? "يوجد مرجع معياري غير معروف أو غير مكتمل" : roundsComplete ? `${REQUIRED_AUDIT_ROUND_COUNT} جولة موثقة` : `يلزم ${REQUIRED_AUDIT_ROUND_COUNT} جولة مكتملة بروابط نتائج وأدلة` },
    { id: "evidence", label: "طلبات الأدلة وPBC مكتملة", pass: pendingEvidence === 0, detail: pendingEvidence ? `${pendingEvidence} معلقة${pendingManualPbc ? `، منها ${pendingManualPbc} طلب PBC يدوي` : ""}` : "مكتمل" },
    { id: "findings", label: "كل النتائج حُسمت", pass: openFindings === 0, detail: openFindings ? `${openFindings} غير مكتملة، منها ${openHigh} مرتفعة` : "مكتمل" },
    { id: "adjustments", label: "قيود التسوية مرحّلة ومتوازنة", pass: pendingAdjustments === 0, detail: pendingAdjustments ? `${pendingAdjustments} غير مكتملة أو غير متوازنة` : "مكتمل" },
    { id: "opinion", label: "نوع الرأي مشتق وفق ISA 705", pass: opinionSelected, detail: opinionLabels[selectedOpinion] || opinionLabels.not_determined },
    { id: "human-approval", label: "اعتماد المراجع البشري بعد الإكمال", pass: humanApproval && chronologyValid, detail: !humanApproval ? "لم يسجل" : chronologyValid ? "مسجل بعد آخر إجراء" : "تاريخ الاعتماد يسبق إجراءً لازمًا" },
  ];

  return {
    selectedOpinion,
    opinionAssessment,
    opinionSelected,
    reportOpinion,
    reportReady,
    readyForHumanApproval,
    pendingEvidence,
    pendingManualPbc,
    manualPbcChronologyValid,
    invalidEvidence,
    missingEvidence,
    openHigh,
    openFindings,
    pendingAdjustmentItems,
    pendingAdjustments,
    acceptanceComplete,
    materialityComplete,
    populationConsistent,
    roundsComplete,
    analyticsReviewed,
    mappingApproved,
    periodLocked,
    councilApproved,
    humanApproval,
    chronologyValid,
    standardsValid,
    latestPrerequisiteAt: latestPrerequisiteAt ? new Date(latestPrerequisiteAt).toISOString() : null,
    gates,
    passedGates: gates.filter((gate) => gate.pass).length,
  };
}
