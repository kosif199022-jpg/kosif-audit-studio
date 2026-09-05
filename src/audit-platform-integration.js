// KOSIF Audit Platform Integration Layer
// Connects Audit Room, Copilot, Fraud Engine, Evidence Explorer and AI Council.

import { createAuditRoom } from "./audit-room.js";
import { createAuditCopilot } from "./audit-copilot.js";
import { createFraudEngine } from "./fraud-engine.js";
import { createEvidenceExplorer } from "./evidence-explorer.js";
import { createAICouncil } from "./ai-council.js";

export function createAuditPlatform(initial = {}) {
  const room = createAuditRoom(initial);
  const copilot = createAuditCopilot();
  const fraud = createFraudEngine();
  const evidence = createEvidenceExplorer();
  const council = createAICouncil();

  return {
    room,
    copilot,
    fraud,
    evidence,
    council,
    runAuditCycle({ accounts = [], findings = [], documents = [] } = {}) {
      const risks = copilot.analyze(accounts);
      const fraudSignals = fraud.scan(accounts);
      const evidenceState = evidence.index(documents);
      const opinions = council.review({ risks, fraudSignals, evidenceState });

      return {
        risks,
        fraudSignals,
        evidenceState,
        opinions,
        humanApprovalRequired: true,
      };
    },
  };
}
