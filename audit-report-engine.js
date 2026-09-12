/* KOSIF Audit Report Template Engine
 * Converts audit evidence into structured professional report outputs.
 * Design goal: keep source evidence, standards references and conclusions traceable.
 */

export const REPORT_TEMPLATES = {
  independentOpinion: {
    id: 'ISA700',
    title: 'تقرير المراجع المستقل',
    sections: ['opinion', 'basis', 'responsibilities', 'keyAuditMatters']
  },
  keyAuditMatters: {
    id: 'ISA701',
    title: 'أمور المراجعة الرئيسية',
    sections: ['risk', 'response', 'evidence', 'conclusion']
  },
  riskReport: {
    id: 'ISA315',
    title: 'تقرير مخاطر المراجعة',
    sections: ['riskAssessment', 'controls', 'procedures']
  },
  findingsReport: {
    id: 'ISA265',
    title: 'الملاحظات والرقابة الداخلية',
    sections: ['finding', 'impact', 'recommendation', 'managementResponse']
  }
};

export function buildAuditReport({ company, risks = [], findings = [], evidence = [] }) {
  return {
    metadata: {
      company,
      generatedAt: new Date().toISOString(),
      traceable: true
    },
    executiveSummary: {
      riskCount: risks.length,
      findingCount: findings.length,
      evidenceCount: evidence.length
    },
    sections: {
      opinion: null,
      keyAuditMatters: risks.map(r => ({
        matter: r.title,
        risk: r.level,
        response: r.procedure || null,
        evidence: r.evidence || []
      })),
      findings
    }
  };
}
