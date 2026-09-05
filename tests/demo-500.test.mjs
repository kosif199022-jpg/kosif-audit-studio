import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo500, demo500ReportText } from '../src/demo-500.js';
import { generateTrialBalance } from '../src/data.js';
import { buildTemporarySessionSnapshot } from '../src/session-export.js';
import { createSessionWorkbookBytes } from '../src/session-workbook.js';
const d=createDemo500();
test('500-account training population is deterministic, balanced and covers 20 areas',()=>{
 assert.equal(d.accounts.length,500);assert.equal(new Set(d.accounts.map(a=>a.id)).size,500);
 assert.equal(new Set(d.accounts.map(a=>a.category)).size,20);
 assert.equal(d.accounts.reduce((s,a)=>s+BigInt(a.debitMinor)-BigInt(a.creditMinor),0n),0n);
 assert.deepEqual(d.accounts,generateTrialBalance(500));assert.equal(generateTrialBalance().length,5000);
});
test('all twenty rounds derive their population, sample and linked evidence from the 500 accounts',()=>{
 assert.equal(d.rounds.length,20);
 for(const r of d.rounds){const population=d.accounts.filter(a=>r.categoryKeys.includes(a.category));assert.equal(r.population,population.length);assert.ok(r.population>0);assert.equal(r.debitMinor,String(population.reduce((s,a)=>s+BigInt(a.debitMinor),0n)));assert.ok(r.sampleIds.length>0);assert.ok(r.sampleIds.every(id=>population.some(a=>a.id===id)));assert.equal(r.evidence.roundId,r.id);assert.ok(r.finding.evidenceIds.includes(r.evidence.id));}
 assert.equal(d.report.gates.length,12);assert.equal(d.report.passedGates,12);assert.equal(d.engagement.demo.synthetic,true);
 assert.ok(demo500ReportText(d).includes('محاكاة تدريبية'));assert.ok(demo500ReportText(d).includes('R-020'));
});
test('500-account report and workbook export the live dataset and do not label 5000 fixtures as current',async()=>{
 const s=await buildTemporarySessionSnapshot({accounts:d.accounts,engagement:d.engagement,metrics:d.metrics,dataProfile:d.dataProfile,stages:[]});
 assert.equal(s.engagement.demo.accountCount,500);const text=JSON.stringify(s);assert.ok(text.includes('KOSIF-DEMO-500-v7'));
 const {bytes}=await createSessionWorkbookBytes(s);assert.ok(bytes.byteLength>10000);
 const XLSX=await import("xlsx");const workbook=XLSX.read(bytes,{type:"array"});assert.ok(workbook.SheetNames.length>=12);
});
