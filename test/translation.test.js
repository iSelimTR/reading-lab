import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.js';
import {selectionContext,vocabularyIdentity,EVIDENCE_COLORS} from '../public/vocabulary.js';
import {buildReviewData,paragraphSegments} from '../public/report-data.js';

const meaning={shortMeaning:'光',lemma:'light',partOfSpeech:'名词',generalMeaning:'光；灯；光线',contextualMeaning:'此处指路灯发出的光，句子讨论照明。',contextTranslation:'这种多余的光可能打扰居民。'};
const request={term:'light',context:'This unwanted light can disturb residents.',deepseek:{model:'deepseek-flash',key:'test-page-key'}};
async function appRun(options,run){const server=createApp(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await run('http://127.0.0.1:'+server.address().port);}finally{await new Promise(resolve=>server.close(resolve));}}
function post(base,data,headers={}){return fetch(base+'/api/translate',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});}

test('selected word gets a bounded sentence context and stable vocabulary identity',()=>{
 const text='Earlier sentence. This unwanted light can disturb residents. Next sentence.';
 const start=text.indexOf('light');
 assert.deepEqual(selectionContext(text,start,start+5),{term:'light',context:'This unwanted light can disturb residents.'});
 assert.equal(vocabularyIdentity({term:'LIGHT',context:'A sentence.'}),vocabularyIdentity({term:'light',context:'A sentence.'}));
 assert.throws(()=>selectionContext(text,4,4));
 assert.equal(new Set(EVIDENCE_COLORS).size,15);
});

test('translation uses only the official DeepSeek endpoint and returns common/contextual meanings without credentials',async()=>{
 let sent;
 await appRun({env:{},fetcher:async(url,options)=>{sent={url,...options,body:JSON.parse(options.body)};return Response.json({choices:[{message:{content:JSON.stringify(meaning)}}]});}},async base=>{
  const response=await post(base,request);assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.shortMeaning,'光');assert.equal(data.generalMeaning,meaning.generalMeaning);assert.equal(data.contextualMeaning,meaning.contextualMeaning);assert.equal(data.term,'light');assert.equal(data.context,request.context);
  assert.equal(sent.url,'https://api.deepseek.com/chat/completions');assert.equal(sent.headers.Authorization,'Bearer test-page-key');assert.equal(sent.redirect,'error');assert.equal(sent.body.max_tokens,1200);assert.equal(sent.body.thinking.type,'disabled');
  assert.ok(!JSON.stringify(data).includes('test-page-key'));
 });
});

test('translation rejects out-of-context selection, invalid model, absent key and cross-origin calls before charging',async()=>{
 for(const [payload,headers,status] of [
  [{...request,term:'unmentioned'},{},400],
  [{...request,deepseek:{model:'unknown',key:'secret'}},{},400],
  [{...request,deepseek:{model:'deepseek-flash'}},{},503],
  [request,{Origin:'https://other.example'},403]
 ]){let calls=0;await appRun({env:{},fetcher:async()=>{calls++;throw Error('must not call');}},async base=>{assert.equal((await post(base,payload,headers)).status,status);assert.equal(calls,0);});}
});

test('translation handles malformed model output and authentication failure without leaking provider text',async()=>{
 for(const reply of [()=>Response.json({choices:[{message:{content:'{}'}}]}),()=>new Response('private-provider-error',{status:401})]){
  await appRun({env:{},fetcher:async()=>reply()},async base=>{const response=await post(base,request);assert.equal(response.status,400);assert.ok(!(await response.text()).includes('private-provider-error'));});
 }
});

test('review data keeps a vocabulary allowlist and evidence question identities for coloured underlines',()=>{
 const item={id:'q1',prompt:'What does light mean?',options:['a','b','c','d'],answerIndex:0,evidence:request.context};
 const report=buildReviewData({passage:request.context,questions:[item],answers:{q1:0},vocabulary:[{...meaning,...request,apiKey:'should-not-export'}]});
 assert.equal(report.vocabulary[0].shortMeaning,'光');assert.equal(report.vocabulary.length,1);assert.ok(!JSON.stringify(report).includes('should-not-export'));assert.ok(!JSON.stringify(report).includes('test-page-key'));
 assert.deepEqual(paragraphSegments(report.passage,report.items).flat().find(segment=>segment.highlight).questionNumbers,[1]);
});
