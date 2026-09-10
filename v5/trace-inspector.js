/** KOSIF V5 — resolves any traceable object and its upstream/downstream lineage. */
import { buildEngagementTraceability, traceAncestors, downstreamImpacts } from './traceability.js';

const collections=Object.freeze([
  ['document','documents'],['evidence','evidence'],['issue','issues'],['request','requests'],['council-round','councilRounds'],['adjustment','adjustments'],['cash-flow-version','cashFlowVersions'],['equity-version','equityVersions'],['report','reports']
]);
const clone=value=>value==null?value:structuredClone(value);
function recordFromEngagement(engagement,id){for(const [type,key] of collections){const record=(engagement?.[key]||[]).find(item=>item?.id===id);if(record)return{type,record}}return null}
function graphLabel(node={}){return node.label||node.id||'عنصر تتبع'}
export function inspectTraceObject(engagement={},id,{maxDepth=12}={}){
  if(!id||!String(id).trim())throw new TypeError('trace object id is required');
  const objectId=String(id).trim(),graph=buildEngagementTraceability(engagement),node=graph.nodes.find(n=>n.id===objectId)||null,direct=recordFromEngagement(engagement,objectId);
  if(!node&&!direct)return{found:false,id:objectId,type:'unknown',label:objectId,record:null,ancestors:[],downstream:[],incoming:[],outgoing:[]};
  const type=direct?.type||node?.type||'unknown',record=direct?.record||node?.meta||null;
  const ancestors=traceAncestors(graph,objectId,{maxDepth}).map(path=>path.map(item=>({id:item.id,type:item.type||graph.nodes.find(n=>n.id===item.id)?.type||'unknown',label:item.label||graphLabel(graph.nodes.find(n=>n.id===item.id)),relationToNext:item.relationToNext||null})));
  const downstream=downstreamImpacts(graph,[objectId]).map(item=>({id:item.id,type:item.type||'unknown',label:item.label||item.id,meta:clone(item.meta||{})}));
  const incoming=graph.edges.filter(e=>e.to===objectId).map(e=>({from:e.from,relation:e.relation,node:clone(graph.nodes.find(n=>n.id===e.from)||null)}));
  const outgoing=graph.edges.filter(e=>e.from===objectId).map(e=>({to:e.to,relation:e.relation,node:clone(graph.nodes.find(n=>n.id===e.to)||null)}));
  return{found:true,id:objectId,type,label:direct?.record?.title||direct?.record?.name||direct?.record?.label||node?.label||objectId,record:clone(record),meta:clone(node?.meta||{}),ancestors,downstream,incoming,outgoing};
}
export function traceObjectSummary(result={}){if(!result.found)return{found:false,id:result.id||'',upstreamPaths:0,downstreamCount:0};return{found:true,id:result.id,type:result.type,label:result.label,upstreamPaths:result.ancestors?.length||0,downstreamCount:result.downstream?.length||0,incomingCount:result.incoming?.length||0,outgoingCount:result.outgoing?.length||0}}
