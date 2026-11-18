
export const SESSION_KEY='reading-lab-session-v1';
const text=(value,max=30000)=>typeof value==='string'?value.slice(0,max):'';
const question=q=>q&&typeof q.id==='string'&&typeof q.prompt==='string'&&Array.isArray(q.options)&&q.options.length>=2&&q.options.length<=4&&q.options.every(x=>typeof x==='string')&&Number.isInteger(q.answerIndex)&&q.answerIndex>=0&&q.answerIndex<q.options.length;
export function sessionSnapshot(state) {
  const all=(Array.isArray(state.allQuestions)?state.allQuestions:[]).filter(question).slice(0,30).map(q=>({id:text(q.id,100),prompt:text(q.prompt,6000),options:q.options.map(x=>text(x,3000)),answerIndex:q.answerIndex,type:text(q.type,100),explanation:text(q.explanation,6000),evidence:text(q.evidence,6000)}));
  const ids=new Set(all.map(q=>q.id));
  const answers=Object.fromEntries(all.filter(q=>Number.isInteger(state.answers?.[q.id])&&state.answers[q.id]>=0&&state.answers[q.id]<q.options.length).map(q=>[q.id,state.answers[q.id]]));
  const vocabulary=(Array.isArray(state.vocabulary)?state.vocabulary:[]).slice(0,1000).filter(v=>v&&typeof v.term==='string'&&typeof v.context==='string').map(v=>Object.fromEntries([...['term','context','generalMeaning','contextualMeaning','contextTranslation','shortMeaning','lemma','partOfSpeech'].map(k=>[k,text(v[k],2000)]),...['passageStart','passageEnd'].filter(k=>Number.isInteger(v[k])).map(k=>[k,v[k]])]));
  const annotations=(Array.isArray(state.annotations)?state.annotations:[]).filter(n=>n&&Number.isInteger(n.id)&&Number.isInteger(n.start)&&Number.isInteger(n.end)&&n.start>=0&&n.end>n.start&&['highlight','question'].includes(n.type)).slice(0,2000).map(({id,start,end,type})=>({id,start,end,type}));
  return {version:1,savedAt:Date.now(),draft:text(state.draft),passage:text(state.passage),quiz:state.quiz&&all.length?{title:text(state.quiz.title,120),mode:state.quiz.mode==='ai'?'ai':'basic',model:text(state.quiz.model,100)}:null,allQuestions:all,questionIds:(Array.isArray(state.questionIds)?state.questionIds:[]).filter(id=>ids.has(id)),answers,submitted:state.submitted===true,attemptStarted:Number.isFinite(state.attemptStarted)?state.attemptStarted:null,attemptFinished:Number.isFinite(state.attemptFinished)?state.attemptFinished:null,annotations,vocabulary,view:state.view==='practice'?'practice':'setup',settings:{mode:state.settings?.mode==='ai'?'ai':'basic',count:['3','5','10','15'].includes(state.settings?.count)?state.settings.count:'5',difficulty:['accessible','standard','challenging'].includes(state.settings?.difficulty)?state.settings.difficulty:'standard'}};
}
export function readSession(storage) {
  try {const raw=storage.getItem(SESSION_KEY);if(!raw)return null;const state=JSON.parse(raw);if(!state||state.version!==1)return null;return sessionSnapshot(state);}catch{return null;}
}
export function writeSession(storage,state) {storage.setItem(SESSION_KEY,JSON.stringify(sessionSnapshot(state)));}
