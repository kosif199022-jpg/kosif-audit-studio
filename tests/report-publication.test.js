import test from 'node:test';
import assert from 'node:assert/strict';
import { reportPublicationStatus, reportSectionsForMode, renderStandaloneReportHtml, serializeReportPackage } from '../v5/report-publication.js';
import { parseState } from '../v5/state-codec.js';

function report(status='draft'){return{id:'RPT-001',version:3,status,title:'تقرير <script>alert(1)</script>',sections:[{id:'cover',title:'الغلاف',status:'ready',paragraphs:[],facts:[],tables:[],sourceIds:[]},{id:'materiality',title:'الأهمية النسبية',status:'human-required',humanReviewRequired:true,paragraphs:['<img src=x onerror=alert(1)>'],facts:[{label:'Overall',value:12345678901234567890n}],tables:[{headers:['البند','القيمة'],rows:[['Overall materiality',12345678901234567890n]]}],sourceIds:['DOC-1']},{id:'traceability-appendix',title:'التتبع',status:'ready',paragraphs:['تفاصيل'],facts:[],tables:[],sourceIds:['DOC-1']} ]}}

test('publication status never labels a draft as issued',()=>{assert.deepEqual(reportPublicationStatus(report('draft')),{issued:false,draft:true,label:'DRAFT — NOT FOR ISSUE',formal:false});assert.equal(reportPublicationStatus(report('issued')).formal,true)});

test('executive mode is a projection and professional/evidence views do not mutate report sections',()=>{const r=report(),original=r.sections.length;const executive=reportSectionsForMode(r,'executive'),professional=reportSectionsForMode(r,'professional'),evidence=reportSectionsForMode(r,'evidence-book');assert.ok(executive.length<original);assert.equal(professional.length,original);assert.equal(evidence.length,original);assert.equal(r.sections.length,original)});

test('standalone draft HTML carries draft warning and escapes untrusted report text',()=>{const html=renderStandaloneReportHtml(report('draft'),{entity:'شركة <b>اختبار</b>',period:'2026',currency:'SAR',mode:'professional',exportedAt:'2026-09-10T00:00:00Z'});assert.match(html,/DRAFT — NOT FOR ISSUE/);assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);assert.doesNotMatch(html,/<img src=x onerror/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/)});

test('standalone renderer preserves A4 print contract and print-safe table headers',()=>{const html=renderStandaloneReportHtml(report('draft'),{mode:'professional'});assert.match(html,/@page\{size:A4/);assert.match(html,/break-inside:avoid/);assert.match(html,/<thead>/);assert.match(html,/<th>البند<\/th>/)});

test('non-professional views are marked as presentation extracts even for an issued report',()=>{const html=renderStandaloneReportHtml(report('issued'),{mode:'executive'});assert.match(html,/PRESENTATION EXTRACT — NOT THE FORMAL ISSUED REPORT/);const professional=renderStandaloneReportHtml(report('issued'),{mode:'professional'});assert.match(professional,/>ISSUED</);assert.doesNotMatch(professional,/DRAFT — NOT FOR ISSUE/)});

test('JSON report package preserves BigInt and publication metadata through the KOSIF codec',()=>{const text=serializeReportPackage(report('draft'),{engagement:{id:'ENG-1',entity:'شركة',period:'2026-12-31',currency:'SAR',framework:'IFRS',engagementType:'audit'},mode:'evidence-book',exportedAt:'2026-09-10T00:00:00Z'}),decoded=parseState(text);assert.equal(decoded.type,'KOSIF_REPORT_PACKAGE');assert.equal(decoded.viewMode,'evidence-book');assert.equal(decoded.publication.draft,true);assert.equal(decoded.report.sections[1].facts[0].value,12345678901234567890n)});

test('unknown presentation mode fails safe to professional mode',()=>{const r=report(),sections=reportSectionsForMode(r,'not-a-mode');assert.equal(sections.length,r.sections.length);const decoded=parseState(serializeReportPackage(r,{mode:'not-a-mode'}));assert.equal(decoded.viewMode,'professional')});
