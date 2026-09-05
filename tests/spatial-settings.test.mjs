import test from 'node:test';
import assert from 'node:assert/strict';
import { splineUrl, readSpatial } from '../src/spatial/settings.js';
test('Spline embedding accepts only HTTPS public scenes without credentials or ports',()=>{
 assert.equal(splineUrl('https://my.spline.design/a-scene/?tracking=1#x'),'https://my.spline.design/a-scene/');
 for(const value of ['javascript:alert(1)','https://my.spline.design.evil.test/a','https://user:pass@my.spline.design/a','https://my.spline.design:444/a','http://my.spline.design/a','https://prod.spline.design/a/scene.splinecode','<iframe src="https://my.spline.design/a"></iframe>']) assert.equal(splineUrl(value),'');
});
test('Spatial preferences tolerate unavailable or corrupt storage and preserve disabling effects',()=>{
 assert.deepEqual(readSpatial(null),{enabled:true,motion:true,url:''});
 assert.deepEqual(readSpatial({getItem:()=>'{broken'}),{enabled:true,motion:true,url:''});
 assert.deepEqual(readSpatial({getItem:()=>JSON.stringify({enabled:false,motion:false,url:'https://evil.test'})}),{enabled:false,motion:false,url:''});
});
