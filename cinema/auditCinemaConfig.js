export const AuditCinemaConfig = {
  version: '1.0.0',
  theme: 'deep-space-audit',
  modules: {
    commandCenter: true,
    auditGalaxy: true,
    evidenceExplorer: true,
    aiCouncilRoom: true,
    benchmarkEngine: true
  },
  scenes: [
    {
      id: 'command-center',
      title: 'KOSIF Audit Command Center',
      effects: ['3d-financial-network', 'data-particles', 'cinematic-transitions']
    },
    {
      id: 'audit-galaxy',
      title: 'Evidence Galaxy',
      nodes: ['accounts', 'risks', 'standards', 'evidence', 'conclusions']
    }
  ],
  aiRoles: [
    'Audit Partner AI',
    'IFRS Expert AI',
    'ISA Expert AI',
    'Fraud Analyst AI',
    'Data Analyst AI',
    'Quality Reviewer AI'
  ],
  benchmarks: ['Apple', 'Microsoft', 'Amazon', 'Saudi Listed Companies']
};
