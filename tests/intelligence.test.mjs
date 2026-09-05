import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateTrialBalance, initialEngagement } from '../src/data.js';
import { buildActionPlan, answerAgent, contextStamp, transitionTask, updateTaskDetails, draftMemo } from '../src/intelligence/agent.js';
import { createAgentContext, specialistReview, VIEW_MAP } from '../src/intelligence/context.js';
import { REFERENCES, referenceStatus } from '../src/intelligence/reference-registry.js';

const accounts = generateTrialBalance();
const engagement = structuredClone(initialEngagement);
const metrics = { isBalanced: true, materialityMinor:'100000', performanceMaterialityMinor:'75000', datasetDigest:'baseline' };
const report = { gates:[{id:'evidence',label:'الأدلة',pass:false}], selectedOpinion:'not_determined' };
const context = createAgentContext(accounts,engagement,metrics,report);
test('planning does not mutate the original engagement, themes or approval state',()=>{
 const before=JSON.stringify(engagement);const plan=buildActionPlan(context,{now:'2026-09-05T00:00:00Z'});
 assert.ok(plan.tasks.length);assert.equal(JSON.stringify(engagement),before);
 assert.ok(plan.tasks.some(t=>t.id==='journal'));
 assert.equal(new Set(specialistReview(context).seats.map(s=>s.id)).size,9);
});
test('source freshness follows evidence and amounts, not plan and conversation edits',()=>{
 const stamp=contextStamp(context);
 const edited={...engagement,intelligence:{messages:[{text:'test'}],plans:[{}]}};
 assert.equal(contextStamp(createAgentContext(accounts,edited,metrics,report)),stamp);
 assert.notEqual(contextStamp(createAgentContext(accounts,{...edited,evidence:[]},metrics,report)),stamp);
 assert.notEqual(contextStamp(createAgentContext([{...accounts[0],debitMinor:'1'}],edited,metrics,report)),stamp);
});
test('task completion requires an accountable reviewer and rationale',()=>{
 const task=buildActionPlan(context).tasks[0];
 assert.throws(()=>transitionTask(task,'done',{actor:'',note:'reviewed'}));
 assert.throws(()=>transitionTask(task,'blocked',{actor:'مراجع',note:''}));
 assert.throws(()=>updateTaskDetails(task,{dueDate:'2026-02-30'}));
 const done=transitionTask(task,'done',{actor:'مراجع',note:'تم تنفيذ الإجراء'});
 assert.equal(done.history.length,1);assert.equal(task.status,'queued');
});
test('agent keeps human authority and dated reference applicability',()=>{
 assert.equal(answerAgent('اعتمد التقرير',context).intent,'authority');
 assert.equal(answerAgent('متى يطبق IFRS 18؟',context).intent,'references');
 const ref=REFERENCES.find(r=>r.id==='ifrs18');
 assert.equal(referenceStatus(ref,'2026-01-01').code,'upcoming');
 assert.equal(referenceStatus(ref,'2027-01-01').code,'effective');
 assert.ok(draftMemo(context).includes(contextStamp(context)));
});
test('every suggested navigation target exists and original themes remain',()=>{
 const source=readFileSync(new URL('../src/data.js',import.meta.url),'utf8');
 for(const task of buildActionPlan(context).tasks) assert.ok(source.includes(`id: "${VIEW_MAP[task.view] || task.view}"`));
 const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
 assert.ok(css.includes('[data-theme="heritage"]'));assert.ok(css.includes('[data-theme="violet-dark"]'));
 const addedCss=readFileSync(new URL('../src/intelligence/studio.css',import.meta.url),'utf8');
 assert.ok(!addedCss.includes(':root'));assert.ok(!addedCss.includes('[data-theme'));
});
