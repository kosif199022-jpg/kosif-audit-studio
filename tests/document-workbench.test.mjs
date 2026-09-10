import test from 'node:test';
import assert from 'node:assert/strict';
import {extractAuditDocument,indexDocumentParts,selectedDocumentExcerpts,documentDescriptor} from '../src/document-workbench.js';

test('document indexing chunks text with stable locators and a hard bound',()=>{
  const snippets=indexDocumentParts([{page:4,locator:'PDF ص4',text:'أ'.repeat(3101)}],'a'.repeat(64));
  assert.equal(snippets.length,3);
  assert.equal(snippets[0].page,4);
  assert.equal(snippets[0].locator,'PDF ص4');
  assert.equal(snippets.every(item=>item.selected===false),true);
  const bounded=indexDocumentParts([{page:1,text:'x'.repeat(1500*2501)}],'b'.repeat(64));
  assert.equal(bounded.length,2500);
});

test('selected excerpts contain only the user selected snippets and no raw index',()=>{
  const document={id:'doc',documentId:'c'.repeat(64),selected:[1],snippets:[
    {documentId:'c'.repeat(64),page:1,locator:'سطر 1',text:'غير مختار'},
    {documentId:'c'.repeat(64),page:2,locator:'سطر 2',text:'مختار'},
  ]};
  assert.deepEqual(selectedDocumentExcerpts([document]),[{documentId:'c'.repeat(64),page:2,locator:'سطر 2',text:'مختار'}]);
  assert.deepEqual(documentDescriptor(document),{id:'doc',documentId:'c'.repeat(64),selected:[1]});
});

test('markdown and XML are accepted as bounded text evidence', async()=>{
  const stored=[];
  const store=async(key,bytes)=>stored.push([key,bytes.byteLength]);
  const markdown=new File(['# سياسة الإيراد\n- تحقق من القطع الزمني'], 'memo.md', {type:'text/markdown'});
  const xml=new File(['<root>\n<item>فاتورة 10</item>\n</root>'], 'evidence.xml', {type:'application/xml'});
  const mdResult=await extractAuditDocument(markdown,{store});
  const xmlResult=await extractAuditDocument(xml,{store});
  assert.equal(mdResult.method,'text-lines');
  assert.equal(xmlResult.method,'text-lines');
  assert.match(mdResult.snippets.map(item=>item.text).join(' '),/سياسة الإيراد/);
  assert.match(xmlResult.snippets.map(item=>item.text).join(' '),/فاتورة 10/);
  assert.equal(stored.length,4);
});
