import test from 'node:test';
import assert from 'node:assert/strict';
import { detectHeaderRow, suggestColumnMapping, validateMapping, mapSpreadsheetRows, parseDelimitedMatrix } from '../v5/spreadsheet-intake.js';

test('spreadsheet header detection understands Arabic trial-balance headings',()=>{const matrix=[['تقرير ميزان المراجعة'],['كود الحساب','اسم الحساب','مدين','دائن','التصنيف'],['1001','البنك','1,000.00','0','نقدية وبنوك']];const d=detectHeaderRow(matrix);assert.equal(d.index,1);assert.deepEqual(d.mapping,{code:0,name:1,debit:2,credit:3,category:4})});

test('mapping requires identity plus debit-credit or explicit balance',()=>{assert.equal(validateMapping({code:0,debit:1}).valid,false);assert.equal(validateMapping({name:0,balance:1}).valid,true);assert.equal(validateMapping({code:0,debit:1,credit:2}).valid,true)});

test('net balance convention maps signs deterministically to debit and credit',()=>{const matrix=[['الحساب','الرصيد'],['أصل','100.00'],['التزام','-40.00']];const result=mapSpreadsheetRows(matrix,{headerRow:0,mapping:{name:0,balance:1},balanceConvention:'positive-debit'});assert.equal(result.rows[0].debit,10000n);assert.equal(result.rows[0].credit,0n);assert.equal(result.rows[1].debit,0n);assert.equal(result.rows[1].credit,4000n)});

test('CSV/TSV parser preserves quoted delimiters and detects tab-separated sheets',()=>{const csv=parseDelimitedMatrix('كود,اسم,مدين,دائن\n1,"بنك, رئيسي",100,0');assert.equal(csv[1][1],'بنك, رئيسي');const tsv=parseDelimitedMatrix('كود\tاسم\tمدين\tدائن\n1\tالبنك\t100\t0');assert.equal(tsv[1][1],'البنك')});

test('invalid money rows are rejected without partially fabricating values',()=>{const matrix=[['كود','اسم','مدين','دائن'],['1','البنك','100','0'],['2','المورد','abc','50']];const mapping=suggestColumnMapping(matrix[0]),result=mapSpreadsheetRows(matrix,{mapping,headerRow:0});assert.equal(result.rows.length,1);assert.equal(result.rejected.length,1);assert.equal(result.rejected[0].row,3)});
