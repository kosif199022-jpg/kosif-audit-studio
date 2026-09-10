import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngagement } from '../v5/engagement-machine.js';
import { recordCashFlowVersion } from '../v5/cash-flow-workflow.js';
import { recordEquityVersion } from '../v5/equity-workflow.js';
import { buildEngagementTraceability, traceAncestors } from '../v5/traceability.js';
import { REPORT_RECIPES } from '../v5/report-recipes.js';

function engagement(){const e=createEngagement({id:'ENG-STMT',engagementType:'preparation'});e.documents.push({id:'DOC-OPEN',name:'opening.pdf'},{id:'DOC-CLOSE',name:'closing.pdf'},{id:'DOC-MOVE',name:'movements.xlsx'});return e}

test('cash flow lineage connects source -> movement -> approved CFV',()=>{let e=engagement();e=recordCashFlowVersion(e,{openingCashMinor:100n,closingCashMinor:130n,openingSourceIds:['DOC-OPEN'],closingSourceIds:['DOC-CLOSE'],movements:[{id:'CFM-1',label:'تحصيل',section:'operating',direction:'inflow',amountMinor:30n,sourceIds:['DOC-MOVE']}]},{actor:'Reviewer',actorType:'human',rationale:'matched'}).engagement;const graph=buildEngagementTraceability(e),paths=traceAncestors(graph,'CFV-001');assert.ok(graph.nodes.some(n=>n.id==='CFV-001'&&n.type==='cash-flow-version'));assert.ok(graph.nodes.some(n=>n.id==='CFV-001:CFM-1'&&n.type==='cash-flow-movement'));assert.ok(paths.some(path=>path.some(n=>n.id==='DOC-MOVE')&&path.some(n=>n.id==='CFV-001:CFM-1')))});

test('full statements recipe requires both cash flow and equity movement support',()=>{const ids=REPORT_RECIPES['full-financial-statements'].minimumInputs.map(x=>x.id);assert.ok(ids.includes('CFS'));assert.ok(ids.includes('EQS'))});
