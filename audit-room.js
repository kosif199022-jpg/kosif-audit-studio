// KOSIF Audit Studio - Audit Room
// مركز عمليات المراجعة: يربط المخاطر والأدلة والجولات في حالة واحدة.

export function createAuditRoom(state = {}) {
  return {
    id: state.id ?? `ROOM-${Date.now()}`,
    phase: state.phase ?? 'PLANNING',
    progress: state.progress ?? 0,
    findings: state.findings ?? [],
    evidence: state.evidence ?? [],
    rounds: state.rounds ?? [],
    humanDecisionRequired: true,
  };
}

export function updateAuditPhase(room, phase) {
  return { ...room, phase, updatedAt: new Date().toISOString() };
}

export function auditRoomSummary(room) {
  return {
    phase: room.phase,
    findings: room.findings.length,
    evidence: room.evidence.length,
    rounds: room.rounds.length,
    status: room.humanDecisionRequired ? 'WAITING_HUMAN_REVIEW' : 'READY'
  };
}
