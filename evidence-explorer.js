// KOSIF Audit Studio - Evidence Explorer
// Evidence metadata and traceability helper.

export function createEvidenceRecord(input = {}) {
  return {
    id: input.id ?? `EV-${Date.now()}`,
    account: input.account ?? null,
    standard: input.standard ?? null,
    procedure: input.procedure ?? null,
    hash: input.hash ?? null,
    reviewer: input.reviewer ?? null,
    createdAt: new Date().toISOString(),
    status: 'pending-review'
  };
}

export function linkEvidenceToFinding(evidence, findingId) {
  return {
    ...evidence,
    findingId,
    linked: true
  };
}
