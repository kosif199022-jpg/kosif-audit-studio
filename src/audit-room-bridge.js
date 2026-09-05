// KOSIF Audit Room Integration Bridge
// Safe integration layer for connecting the new audit engines with the existing App shell.

import { createAuditRoom } from "../audit-room.js";
import { createAuditCopilot } from "../audit-copilot.js";
import { createFraudEngine } from "../fraud-engine.js";
import { createEvidenceExplorer } from "../evidence-explorer.js";
import { createAICouncil } from "../ai-council.js";

export function createAuditPlatformBridge(initialState = {}) {
  const room = createAuditRoom(initialState);
  const copilot = createAuditCopilot(initialState);
  const fraud = createFraudEngine(initialState);
  const evidence = createEvidenceExplorer(initialState);
  const council = createAICouncil(initialState);

  return Object.freeze({
    room,
    copilot,
    fraud,
    evidence,
    council,
    runCycle(payload) {
      return {
        risk: copilot.analyze?.(payload) ?? null,
        fraud: fraud.scan?.(payload) ?? null,
        evidence: evidence.review?.(payload) ?? null,
        council: council.review?.(payload) ?? null,
      };
    },
  });
}
