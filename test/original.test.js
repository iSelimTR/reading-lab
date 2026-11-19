import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.js';
import {validateOriginalImport,evaluateAnswer,gradeReading} from '../public/original-quiz.js';
import {sessionSnapshot} from '../public/session.js';
import {buildReviewData} from '../public/report-data.js';
import {createReviewDocument} from '../public/export-word.js';
import * as docx from 'docx';
const passage='Urban trees provide shade during hot weather. Young trees need regular watering. Without care, many young trees die before they can cool the street.';
const base={instructions:'',maxWords:null,acceptedAnswers:[],evidence:'Young trees need regular watering.',answerEvidence:'',explanation:'对照原文。'};
const raw={articles:[{title:'Urban Trees',passage,questions:[
 {...base,originalNumber:'1',kind:'mcq',prompt:'What do urban trees provide?',options:['Shade','Snow'],answerIndex:0,answerSource:'provided',answerEvidence:'1 A'},
 {...base,originalNumber:'2',kind:'fill',prompt:'Young trees need regular ________.',options:[],answerIndex:null,acceptedAnswers:['watering'],maxWords:1,answerSource:'provided',answerEvidence:'2 watering'},
 {...base,originalNumber:'3',kind:'tfng',prompt:'Young trees need water.',options:[],answerIndex:0,answerSource:'ai'},
 {...base,originalNumber:'4',kind:'fill',prompt:'The cost is ________.',options:[],answerIndex:null,answerSource:'missing'}
]}],warnings:['匹配题暂不支持。']};
const text=passage+'\nWhat do urban trees provide?\nA Shade\nB Snow\nYoung trees need regular ________.\nYoung trees need water.\nThe cost is ________.';
const answerText='1 A\n2 watering';
const clone=()=>JSON.parse(JSON.stringify(raw));
test('original import preserves question text, numbers and supported kinds; inference requires explicit opt-in',()=>{
 const result=validateOriginalImport(clone(),{source:text,answerText});
 assert.deepEqual(result.articles[0].questions.map(q=>q.originalNumber),['1','2','3','4']);
 assert.equal(result.articles[0].questions[1].kind,'fill');assert.equal(result.articles[0].questions[1].maxWords,1);
 assert.equal(result.articles[0].questions[2].answerSource,'missing');assert.equal(result.articles[0].questions[2].answerIndex,null);
 assert.equal(validateOriginalImport(clone(),{source:text,answerText,inferMissing:true}).articles[0].questions[2].answerSource,'ai');
});
test('fabricated provided keys or evidence cannot be labeled as supplied answers',()=>{
 const input=clone();input.articles[0].questions[0].answerEvidence='fabricated';
 input.articles[0].questions[1].evidence='Invented quote';
 const qs=validateOriginalImport(input,{source:text,answerText}).articles[0].questions;
 assert.equal(qs[0].answerSource,'missing');assert.equal(qs[0].answerIndex,null);assert.equal(qs[1].evidence,'');
 const rewritten=clone();rewritten.articles[0].questions[0].prompt='A completely new question';
 assert.throws(()=>validateOriginalImport(rewritten,{source:text,answerText}),/改写/);
});
test('fill answers ignore case and harmless spacing, enforce word limit, and unknown keys are not wrong',()=>{
 const questions=validateOriginalImport(clone(),{source:text,answerText,inferMissing:true}).articles[0].questions;
 assert.equal(evaluateAnswer(questions[1],' WATERING ').correct,true);
 assert.equal(evaluateAnswer(questions[1],'regular watering').limitExceeded,true);
 assert.equal(evaluateAnswer(questions[1],'regular watering').correct,false);
 assert.equal(evaluateAnswer(questions[3],'unknown').correct,null);
 const score=gradeReading(questions,{[questions[0].id]:1,[questions[1].id]:'watering',[questions[2].id]:0,[questions[3].id]:'test'});
 assert.equal(score.correct,2);assert.equal(score.gradedTotal,3);assert.equal(score.pending,1);
});
test('original draft and mixed-type answers survive autosave without API keys; reports exclude unknown keys from errors',async()=>{
 const imported=validateOriginalImport(clone(),{source:text,answerText,inferMissing:true}),article=imported.articles[0];
 const answers={[article.questions[0].id]:0,[article.questions[1].id]:'watering',[article.questions[2].id]:0,[article.questions[3].id]:'test'};
 const state=sessionSnapshot({quiz:{title:article.title,mode:'original'},allQuestions:article.questions,questionIds:article.questions.map(q=>q.id),answers,settings:{mode:'original'},originalImport:{draft:imported,questionText:text,answerText,apiKey:'secret'}});
 assert.equal(state.quiz.mode,'original');assert.equal(state.answers[article.questions[1].id],'watering');assert.equal(state.originalImport.draft.articles[0].questions.length,4);assert.ok(!JSON.stringify(state).includes('secret'));
 const report=buildReviewData({...article,answers});
 assert.equal(report.pending,1);assert.equal(report.items[3].correct,null);
 const bytes=await docx.Packer.toBuffer(createReviewDocument({...article,answers},docx));assert.equal(bytes.subarray(0,2).toString(),'PK');
});
test('original endpoint uses only DeepSeek and validates input, origin and key before provider calls',async()=>{
 let sent,calls=0;
 const server=createApp({env:{},fetcher:async(url,options)=>{calls++;sent={url,...options,body:JSON.parse(options.body)};return Response.json({choices:[{message:{content:JSON.stringify(raw)}}]});}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/api/import-original';
 const post=(value,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
 try{
  assert.equal((await post({text,deepseek:{model:'bad'}})).status,400);
  assert.equal((await post({text})).status,503);
  assert.equal((await post({text},{Origin:'https://other.example'})).status,403);assert.equal(calls,0);
  const response=await post({text,answerText,inferMissing:true,deepseek:{model:'deepseek-flash',key:'test-key'}});
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.articles[0].questions.length,4);assert.equal(sent.url,'https://api.deepseek.com/chat/completions');assert.equal(sent.headers.Authorization,'Bearer test-key');
  assert.ok(!JSON.stringify(data).includes('test-key'));
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('provided key must match the question number and answer; article paragraphs tolerate page headers',()=>{
 const input=clone();input.articles[0].questions[0].answerIndex=1;
 assert.equal(validateOriginalImport(input,{source:text,answerText}).articles[0].questions[0].answerSource,'missing');
 const paras=clone();paras.articles[0].passage=passage.replace('Young trees','\n\nYoung trees');
 assert.equal(validateOriginalImport(paras,{source:text.replace('Young trees','\nPage 2\nYoung trees'),answerText}).articles.length,1);
});
test('provided answer key matching treats punctuation in accepted answers literally',()=>{
 const input=clone();input.articles[0].questions[1].acceptedAnswers=['water(ing)'];input.articles[0].questions[1].answerEvidence='2 water(ing)';
 assert.equal(validateOriginalImport(input,{source:text,answerText:'1 A\n2 water(ing)'}).articles[0].questions[1].answerSource,'provided');
 input.articles[0].questions[1].answerEvidence='2 watering';
 assert.equal(validateOriginalImport(input,{source:text,answerText:'1 A\n2 watering'}).articles[0].questions[1].answerSource,'missing');
});