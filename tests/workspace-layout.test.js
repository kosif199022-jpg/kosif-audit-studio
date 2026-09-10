import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKSPACE_VIEWS, normalizeWorkspaceView, workspaceViewFromHash, workspaceMetrics, badgeForWorkspace } from '../v5/workspace-layout.js';

test('workspace information architecture stays intentionally limited to six primary areas',()=>{assert.deepEqual(WORKSPACE_VIEWS.map(v=>v.id),['overview','documents','issues','council','financials','report'])});

test('unknown or malformed workspace routes fail safe to overview',()=>{assert.equal(normalizeWorkspaceView('random'),'overview');assert.equal(workspaceViewFromHash('#/documents'),'documents');assert.equal(workspaceViewFromHash('#financials'),'financials');assert.equal(workspaceViewFromHash('#unknown'),'overview')});

test('workspace metrics count only active requests, open issues and pending adjustments',()=>{const engagement={documents:[{id:'D1'},{id:'D2'}],evidence:[{id:'E1'}],requests:[{status:'requested'},{status:'satisfied'},{status:'partial'}],issues:[{status:'open',severity:'high'},{status:'resolved',severity:'critical'},{status:'investigating',severity:'low'}],councilRounds:[{number:1},{number:4}],adjustments:[{status:'proposed'},{status:'accepted'},{status:'rejected'}],reports:[{status:'draft'}]};const m=workspaceMetrics(engagement);assert.equal(m.documents,2);assert.equal(m.openRequests,2);assert.equal(m.openIssues,2);assert.equal(m.highIssues,1);assert.equal(m.latestRound,4);assert.equal(m.pendingAdjustments,1);assert.equal(m.acceptedAdjustments,1);assert.equal(m.latestReportStatus,'draft')});

test('workspace badges prioritize action-required counts and latest council/report state',()=>{const m={documents:8,openRequests:3,openIssues:5,highIssues:2,latestRound:7,pendingAdjustments:0,acceptedAdjustments:4,reports:2,latestReportStatus:'issued'};assert.equal(badgeForWorkspace('documents',m),3);assert.equal(badgeForWorkspace('issues',m),2);assert.equal(badgeForWorkspace('council',m),'R7');assert.equal(badgeForWorkspace('financials',m),4);assert.equal(badgeForWorkspace('report',m),'✓');assert.equal(badgeForWorkspace('overview',m),null)});
