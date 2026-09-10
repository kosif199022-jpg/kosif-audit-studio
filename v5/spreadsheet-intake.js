import { normalizeText, parseMoneyMinor } from '../engine.js';

const FIELD_ALIASES=Object.freeze({
  code:['code','account code','accountcode','رقم الحساب','كود الحساب','كود','رقم','الحساب'],
  name:['name','account name','accountname','اسم الحساب','اسم','البيان','الوصف'],
  debit:['debit','debits','مدين','مدين حركه','رصيد مدين','debit balance'],
  credit:['credit','credits','دائن','دائن حركه','رصيد دائن','credit balance'],
  balance:['balance','net balance','الرصيد','صافي الرصيد','رصيد'],
  category:['category','classification','class','التصنيف','الفئه','الفئة','المجموعه','المجموعة']
});
const requiredPairs=[['debit','credit'],['balance']];
export const SPREADSHEET_FIELDS=Object.freeze(['code','name','debit','credit','balance','category']);
export function normalizeHeader(value=''){return normalizeText(value).replace(/[\s_\-\/\\().،,:]+/g,'')}
const aliasMap=new Map(Object.entries(FIELD_ALIASES).flatMap(([field,aliases])=>aliases.map(a=>[normalizeHeader(a),field])));
export function suggestColumnMapping(headers=[]){const mapping={};headers.forEach((header,index)=>{const field=aliasMap.get(normalizeHeader(header));if(field&&mapping[field]===undefined)mapping[field]=index});return mapping}
export function scoreHeaderRow(row=[]){const mapping=suggestColumnMapping(row),fields=Object.keys(mapping);let score=fields.length;for(const pair of requiredPairs)if(pair.every(f=>fields.includes(f)))score+=4;if(fields.includes('code'))score+=2;if(fields.includes('name'))score+=2;return{score,mapping,fields}}
export function detectHeaderRow(matrix=[],maxRows=12){let best={index:0,score:-1,mapping:{},fields:[]};for(let i=0;i<Math.min(matrix.length,maxRows);i++){const candidate=scoreHeaderRow(matrix[i]||[]);if(candidate.score>best.score)best={index:i,...candidate}}return best}
function nonBlank(v){return String(v??'').trim()!==''}
function strictMoney(value){const raw=String(value??'').trim();if(!raw)return 0n;if(!/\d/.test(normalizeText(raw)))throw new TypeError('القيمة المالية لا تحتوي رقمًا');return parseMoneyMinor(value)}
export function validateMapping(mapping={}){const hasIdentity=Number.isInteger(mapping.code)||Number.isInteger(mapping.name),hasDebitCredit=Number.isInteger(mapping.debit)&&Number.isInteger(mapping.credit),hasBalance=Number.isInteger(mapping.balance);const errors=[];if(!hasIdentity)errors.push('اربط كود الحساب أو اسم الحساب على الأقل.');if(!hasDebitCredit&&!hasBalance)errors.push('اربط عمودي المدين والدائن معًا، أو عمود الرصيد الصافي.');if(Number.isInteger(mapping.debit)!==Number.isInteger(mapping.credit))errors.push('لا يمكن ربط المدين دون الدائن أو العكس.');return{valid:errors.length===0,errors,mode:hasDebitCredit?'debit-credit':hasBalance?'balance':null}}
export function mapSpreadsheetRows(matrix=[],{headerRow=0,mapping={},balanceConvention='positive-debit'}={}){const check=validateMapping(mapping);if(!check.valid)throw new RangeError(check.errors.join(' '));const rows=[],rejected=[];for(let i=headerRow+1;i<matrix.length;i++){const raw=matrix[i]||[];if(!raw.some(nonBlank))continue;const code=Number.isInteger(mapping.code)?String(raw[mapping.code]??'').trim():'';const name=Number.isInteger(mapping.name)?String(raw[mapping.name]??'').trim():'';if(!code&&!name){rejected.push({row:i+1,reason:'لا يوجد كود أو اسم حساب'});continue}let debit=0n,credit=0n;try{if(check.mode==='debit-credit'){debit=strictMoney(raw[mapping.debit]);credit=strictMoney(raw[mapping.credit])}else{const value=strictMoney(raw[mapping.balance]),positiveDebit=balanceConvention!=='positive-credit';if(value>=0n){debit=positiveDebit?value:0n;credit=positiveDebit?0n:value}else{const a=-value;debit=positiveDebit?0n:a;credit=positiveDebit?a:0n}}}catch{rejected.push({row:i+1,reason:'قيمة مالية غير صالحة'});continue}const row={code:code||String(i-headerRow).padStart(4,'0'),name:name||`حساب ${code}`,debit,credit};if(Number.isInteger(mapping.category))row.category=String(raw[mapping.category]??'').trim();rows.push(row)}return{rows,rejected,mode:check.mode,totalRows:matrix.length-headerRow-1}}
function detectDelimiter(line=''){const counts=[',','\t',';'].map(d=>[d,(line.split(d).length-1)]).sort((a,b)=>b[1]-a[1]);return counts[0][1]?counts[0][0]:','}
function parseDelimitedLine(line,delimiter){const out=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++}else quoted=!quoted;continue}if(c===delimiter&&!quoted){out.push(value);value='';continue}value+=c}out.push(value);return out}
export function parseDelimitedMatrix(text=''){const source=String(text).replace(/^\uFEFF/,'');const lines=source.split(/\r?\n/).filter(line=>line.trim()!=='');if(!lines.length)return[];const delimiter=detectDelimiter(lines[0]);return lines.map(line=>parseDelimitedLine(line,delimiter))}
export function previewMatrix(matrix=[],limit=8){return matrix.slice(0,limit).map(row=>row.slice(0,12))}
