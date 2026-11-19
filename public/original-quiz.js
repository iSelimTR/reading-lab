const norm=value=>String(value??'').normalize('NFKC').replace(/[‘’]/g,"'").trim().replace(/\s+/g,' ').toLowerCase();
export const questionKind=q=>q.kind||'mcq';
export function answerLabel(q) {
  if(questionKind(q)==='fill')return q.acceptedAnswers?.length?q.acceptedAnswers.join(' / '):'未提供答案';
  return Number.isInteger(q.answerIndex)?(questionKind(q)==='tfng'?'':String.fromCharCode(65+q.answerIndex)+'  ')+q.options[q.answerIndex]:'未提供答案';
}
export function answerSourceLabel(q) {return ({provided:'提供的答案页',manual:'手动确认答案',ai:'AI 参考答案',missing:'未提供答案'})[q.answerSource]||'本轮题目答案';}
export function evaluateAnswer(q,selected) {
  const fill=questionKind(q)==='fill';
  const answered=fill?typeof selected==='string'&&selected.trim().length>0:Number.isInteger(selected)&&selected>=0&&selected<q.options.length;
  const hasAnswer=fill?Array.isArray(q.acceptedAnswers)&&q.acceptedAnswers.length>0:Number.isInteger(q.answerIndex)&&q.answerIndex>=0&&q.answerIndex<q.options.length;
  const words=fill&&answered?selected.trim().split(/\s+/).length:0;
  const limitExceeded=fill&&Number.isInteger(q.maxWords)&&q.maxWords>0&&words>q.maxWords;
  return {answered,hasAnswer,limitExceeded,correct:hasAnswer?(answered&&!limitExceeded&&(fill?q.acceptedAnswers.some(a=>norm(a)===norm(selected)):selected===q.answerIndex)):null,
    selected:answered?selected:null,selectedLabel:!answered?'未作答':fill?selected:(questionKind(q)==='tfng'?'':String.fromCharCode(65+selected)+'  ')+q.options[selected],answerLabel:answerLabel(q)};
}
export function gradeReading(questions,answers) {
  const results=questions.map(q=>({id:q.id,...evaluateAnswer(q,answers[q.id])}));
  const gradedTotal=results.filter(r=>r.hasAnswer).length,correct=results.filter(r=>r.correct===true).length;
  return {results,correct,total:questions.length,gradedTotal,pending:questions.length-gradedTotal,percent:gradedTotal?Math.round(correct/gradedTotal*100):0};
}
const excerpt=(source,value)=>value&&norm(source).includes(norm(value));
const escape=value=>Array.from(String(value),char=>[46,42,43,63,94,36,123,125,40,41,124,91,93,92].includes(char.charCodeAt(0))?String.fromCharCode(92)+char:char).join('');
function keyMatches(quote,number,expected){return new RegExp('(?:^|\\s|[;；])'+escape(number)+'[.)：:\\s-]+'+escape(expected).replace(/\\ /g,'\\s+')+'(?=$|[\\s.,;；/])','i').test(quote);}
export function validateOriginalImport(data,{source='',answerText='',inferMissing=false}={}) {
  if(!data||!Array.isArray(data.articles)||!data.articles.length||data.articles.length>10)throw Error('没有识别到文章，请确认所选页面包含文章与题目。');
  const articles=data.articles.map((article,ai)=>{
    if(typeof article.passage!=='string'||article.passage.trim().length<80||!Array.isArray(article.questions)||!article.questions.length||article.questions.length>60)throw Error('文章或题目不完整，请缩小到一篇文章及对应题目后重试。');
    if(source&&article.passage.split(/\n\s*\n/).filter(Boolean).some(p=>!excerpt(source,p)))throw Error('识别后的文章与原始文字不一致，请检查 OCR 或分开读取文章、题目页。');
    const numbers=new Set();
    const questions=article.questions.map((raw,index)=>{
      if(!raw||!['mcq','fill','tfng'].includes(raw.kind)||typeof raw.prompt!=='string'||!raw.prompt.trim()||raw.prompt.length>6000)throw Error('题型或题干不完整。暂支持单选、填空和判断题。');
      if(source&&!excerpt(source,raw.prompt))throw Error('检测到题干被改写，请重新识别或手动整理后导入。');
      const originalNumber=String(raw.originalNumber??index+1).slice(0,30);
      if(numbers.has(originalNumber))throw Error('同一篇文章出现重复题号，请分开识别题目。');numbers.add(originalNumber);
      const options=raw.kind==='tfng'?['TRUE','FALSE','NOT GIVEN']:raw.kind==='fill'?[]:raw.options;
      if(raw.kind==='mcq'&&(!Array.isArray(options)||options.length<2||options.length>8||options.some(o=>typeof o!=='string'||!o.trim()||o.length>3000)||new Set(options.map(norm)).size!==options.length))throw Error('选择题选项不完整，请核对 PDF。');
      if(source&&raw.kind==='mcq'&&options.some(o=>!excerpt(source,o)))throw Error('检测到原题选项被改写，请检查识别内容。');
      let acceptedAnswers=raw.kind==='fill'&&Array.isArray(raw.acceptedAnswers)?raw.acceptedAnswers.filter(a=>typeof a==='string'&&a.trim()&&a.length<=200).map(a=>a.trim()).slice(0,10):[];
      let answerIndex=raw.kind!=='fill'&&Number.isInteger(raw.answerIndex)&&raw.answerIndex>=0&&raw.answerIndex<options.length?raw.answerIndex:null;
      let answerSource=raw.answerSource;
      const answerEvidence=typeof raw.answerEvidence==='string'?raw.answerEvidence.trim().slice(0,2000):'';
      const suppliedKey=answerText||source;
      if(answerSource==='provided'&&(!answerEvidence||!excerpt(suppliedKey,answerEvidence)||(raw.kind==='fill'?!acceptedAnswers.length||!acceptedAnswers.every(a=>keyMatches(answerEvidence,originalNumber,a)):answerIndex===null||!keyMatches(answerEvidence,originalNumber,raw.kind==='tfng'?options[answerIndex]:String.fromCharCode(65+answerIndex)))))answerSource='missing';
      if(answerSource==='ai'&&!inferMissing)answerSource='missing';
      if(!['provided','ai'].includes(answerSource))answerSource='missing';
      if(answerSource==='missing'){acceptedAnswers=[];answerIndex=null;}
      if(raw.kind==='fill'?!acceptedAnswers.length:answerIndex===null)answerSource='missing';
      const evidence=typeof raw.evidence==='string'&&excerpt(article.passage,raw.evidence)?raw.evidence.trim():'';
      return {id:'original-'+(ai+1)+'-'+(index+1),originalNumber,kind:raw.kind,type:({mcq:'原题 · 单项选择',fill:'原题 · 填空',tfng:'原题 · 判断'})[raw.kind],prompt:raw.prompt.trim(),instructions:String(raw.instructions||'').slice(0,2000),maxWords:Number.isInteger(raw.maxWords)&&raw.maxWords>0&&raw.maxWords<=50?raw.maxWords:null,options,answerIndex,acceptedAnswers,answerSource,answerEvidence:answerSource==='provided'?answerEvidence:'',evidence,explanation:answerSource==='missing'?'没有提供可核对的答案，本题暂不计分。':String(raw.explanation||'请结合原文核对答案。').slice(0,6000)};
    });
    return {title:String(article.title||'导入的阅读练习').slice(0,120),passage:article.passage.trim(),questions};
  });
  return {articles,warnings:Array.isArray(data.warnings)?data.warnings.filter(w=>typeof w==='string').slice(0,20).map(w=>w.slice(0,500)):[]};
}
