import test from 'node:test';
import assert from 'node:assert/strict';
import {readSession,writeSession,SESSION_KEY} from '../public/session.js';
const q={id:'q1',prompt:'Which?',options:['A','B'],answerIndex:1,evidence:'Trees help.',explanation:'解释',type:'detail'};
const state={draft:'Trees help.',passage:'Trees help.',quiz:{title:'Trees',mode:'ai',apiKey:'never-save'},allQuestions:[q],questionIds:['q1'],answers:{q1:0},submitted:true,attemptStarted:123,attemptFinished:456,view:'practice',annotations:[{id:1,start:0,end:5,type:'highlight'}],vocabulary:[{term:'Trees',context:'Trees help.',shortMeaning:'树木',contextualMeaning:'树木',apiKey:'never-save'}],settings:{mode:'ai',count:'5',difficulty:'standard'},apiKey:'never-save'};
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}
test('closed-page snapshot round-trips answers, grading, vocabulary and annotations without credentials',()=>{
 const store=storage();writeSession(store,state);const restored=readSession(store);
 assert.equal(restored.answers.q1,0);assert.equal(restored.submitted,true);assert.equal(restored.attemptFinished,456);
 assert.deepEqual(restored.annotations,state.annotations);assert.equal(restored.vocabulary[0].shortMeaning,'树木');
 assert.equal(restored.view,'practice');assert.equal(restored.allQuestions[0].answerIndex,1);
 assert.ok(!store.getItem(SESSION_KEY).includes('never-save'));
});
test('unfinished attempt and draft overwrite older state while malformed storage fails safely',()=>{
 const store=storage();writeSession(store,state);writeSession(store,{...state,submitted:false,answers:{},view:'setup',draft:'New draft'});
 assert.equal(readSession(store).draft,'New draft');assert.equal(readSession(store).submitted,false);
 store.setItem(SESSION_KEY,'broken json');assert.equal(readSession(store),null);
 store.setItem(SESSION_KEY,JSON.stringify({version:99}));assert.equal(readSession(store),null);
 assert.equal(readSession({getItem(){throw Error('blocked');}}),null);
 assert.throws(()=>writeSession({setItem(){throw Error('full');}},state),/full/);
});
