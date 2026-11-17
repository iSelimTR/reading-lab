import test from 'node:test';
import assert from 'node:assert/strict';
import {floatingPosition} from '../public/floating-position.js';

test('dictionary stays beside a selected word on wide screens',()=>{
 const anchor={left:100,right:150,top:200,bottom:220};
 const result=floatingPosition(anchor,{width:360,height:400},{width:1280,height:800});
 assert.equal(result.left,160);assert.equal(result.top,200);
});
test('dictionary flips to the left near the right screen edge',()=>{
 const result=floatingPosition({left:1100,right:1140,top:200,bottom:220},{width:360,height:400},{width:1280,height:800});
 assert.equal(result.left,730);assert.equal(result.top,200);
});
test('mobile dictionary fits in the viewport and can sit above a low selection',()=>{
 const result=floatingPosition({left:40,right:110,top:650,bottom:680},{width:360,height:380},{width:390,height:844});
 assert.equal(result.top,260);assert.ok(result.left>=12);assert.ok(result.left+result.width<=378);
});
test('long dictionary content is bounded on a short viewport',()=>{
 const result=floatingPosition({left:25,right:70,top:400,bottom:420},{width:360,height:900},{width:320,height:500});
 assert.equal(result.width,296);assert.equal(result.maxHeight,476);assert.equal(result.top,12);
});
