// KOSIF Cinema 3D Audit Galaxy Foundation
// Three.js-ready scene configuration

export const AuditGalaxyScene = {
  name: 'KOSIF Audit Galaxy',
  mode: 'cinematic-3d',
  camera: {
    type: 'perspective',
    interactive: true,
    mouseTracking: true
  },
  objects: [
    {
      id: 'financial-core',
      type: 'sphere',
      label: 'Financial Intelligence Core'
    },
    {
      id: 'risk-radar',
      type: 'orbital-network',
      label: 'Risk Radar'
    },
    {
      id: 'evidence-galaxy',
      type: 'nodes',
      label: 'Evidence Explorer'
    }
  ],
  interactions: {
    hoverReveal: true,
    clickInspect: true,
    traceEvidencePath: true
  }
};

export function createAuditNode(id, label, category) {
  return {
    id,
    label,
    category,
    linked: true,
    auditTrace: []
  };
}
