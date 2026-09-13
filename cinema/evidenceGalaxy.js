/* Evidence Galaxy
 * Connects audit evidence, accounts, standards and findings
 */

export const EvidenceGalaxy = {
 nodes: [
  {type:'account', label:'Financial Accounts'},
  {type:'evidence', label:'Audit Evidence'},
  {type:'standard', label:'IFRS / ISA'},
  {type:'finding', label:'Audit Findings'}
 ],
 links:[
  ['account','evidence'],
  ['evidence','standard'],
  ['standard','finding']
 ]
};

export function traceEvidence(id){
 return {
  evidenceId:id,
  traceable:true,
  chain:'Account → Evidence → Standard → Conclusion'
 };
}
