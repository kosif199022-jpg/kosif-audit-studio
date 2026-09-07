import test from 'node:test';
import assert from 'node:assert/strict';
import {executeVoiceTool,VOICE_WORKSPACES} from '../src/realtime-client.js';

test('realtime navigation only opens allow-listed workspaces',()=>{
 const opened=[];assert.deepEqual(executeVoiceTool({type:'function_call',name:'open_workspace',arguments:JSON.stringify({view:'reports'})},view=>opened.push(view)),{ok:true,opened:'reports'});assert.deepEqual(opened,['reports']);
 assert.equal(executeVoiceTool({type:'function_call',name:'open_workspace',arguments:JSON.stringify({view:'delete-all'})}).ok,false);assert.equal(executeVoiceTool({type:'function_call',name:'other',arguments:'{}'}).error,'tool_not_allowed');assert.equal(VOICE_WORKSPACES.includes('council'),true);
});
