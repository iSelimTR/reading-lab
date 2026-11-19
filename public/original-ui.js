import {questionKind} from './original-quiz.js';
export function originalImportUI({getPDF,getSettings,setBusy,tell,onStart,onChange}) {
  const $=id=>document.getElementById(id),make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  let draft=null,selected=0,renderVersion=0;
  const panel=$('originalReview');
  function field(label,value,onInput,tag='textarea') {
    const wrapper=make('label',label),input=make(tag);
    input.value=value??'';input.addEventListener('input',()=>{onInput(input.value);onChange();});wrapper.append(input);return wrapper;
  }
  function render() {
    panel.hidden=!draft;
    if(!draft)return;
    $('originalArticleChoice').replaceChildren(...draft.articles.map((a,i)=>{const option=make('option',(i+1)+'. '+a.title+' · '+a.questions.length+' 题');option.value=i;return option;}));
    $('originalArticleChoice').value=selected;
    $('originalWarnings').textContent=draft.warnings.join('\n');
    const article=draft.articles[selected];
    $('originalTitle').value=article.title;$('originalPassage').value=article.passage;
    $('originalQuestionEditor').replaceChildren(...article.questions.map((q,index)=>{
      const card=make('details');card.className='original-question-editor';
      card.append(make('summary','原题 '+q.originalNumber+' · '+({mcq:'单选',fill:'填空',tfng:'判断'})[questionKind(q)]));
      card.append(field('原题号',q.originalNumber,v=>q.originalNumber=v,'input'),field('题干',q.prompt,v=>q.prompt=v),field('答题要求（如 ONE WORD ONLY）',q.instructions,v=>q.instructions=v));
      const kind=make('select');kind.setAttribute('aria-label','原题 '+q.originalNumber+' 题型');
      for(const [value,text] of [['mcq','单项选择'],['fill','填空'],['tfng','TRUE / FALSE / NOT GIVEN']]){const option=make('option',text);option.value=value;kind.append(option);}kind.value=questionKind(q);
      kind.addEventListener('change',()=>{q.kind=kind.value;q.type='原题 · '+({mcq:'单选',fill:'填空',tfng:'判断'})[q.kind];q.options=q.kind==='fill'?[]:q.kind==='tfng'?['TRUE','FALSE','NOT GIVEN']:['选项 A','选项 B'];q.answerIndex=null;q.acceptedAnswers=[];q.answerSource='missing';render();onChange();});card.append(kind);
      if(q.kind==='mcq')card.append(field('选项（每行一个，不含 A/B 等字母）',q.options.join('\n'),v=>{q.options=v.split('\n').map(s=>s.trim()).filter(Boolean);q.answerIndex=null;q.answerSource='missing';}));
      if(q.kind==='fill')card.append(field('最多填写几个词（不限制可留空）',q.maxWords||'',v=>q.maxWords=Number(v)||null,'input'));
      const key=make('details');key.append(make('summary','核对或修改答案（会显示答案）'));
      const value=q.kind==='fill'?q.acceptedAnswers.join(' / '):Number.isInteger(q.answerIndex)?String.fromCharCode(65+q.answerIndex):'';
      key.append(field(q.kind==='fill'?'可接受答案（多个用 / 分隔）':'答案字母（A、B、C…；判断题 A=TRUE，B=FALSE，C=NOT GIVEN）',value,v=>{if(q.kind==='fill')q.acceptedAnswers=v.split('/').map(s=>s.trim()).filter(Boolean);else{const n=v.trim().toUpperCase().charCodeAt(0)-65;q.answerIndex=Number.isInteger(n)&&n>=0&&n<q.options.length?n:null;}q.answerSource=(q.kind==='fill'?q.acceptedAnswers.length:Number.isInteger(q.answerIndex))?'manual':'missing';q.answerEvidence='';},'input'));
      key.append(field('解析',q.explanation,v=>q.explanation=v),field('对应原文关键句',q.evidence,v=>q.evidence=v));card.append(key);
      const remove=make('button','移除此题');remove.type='button';remove.className='text-button';remove.addEventListener('click',()=>{article.questions.splice(index,1);render();onChange();});card.append(remove);return card;
    }));
    $('originalSummary').textContent='已识别 '+draft.articles.length+' 篇文章。请核对原文、题型与题目数量；答案默认折叠。缺少答案的题目可作答，但暂不计分。';
  }
  $('originalArticleChoice').addEventListener('change',()=>{selected=Number($('originalArticleChoice').value);render();onChange();});
  $('originalTitle').addEventListener('input',()=>{if(draft)draft.articles[selected].title=$('originalTitle').value;onChange();});
  $('originalPassage').addEventListener('input',()=>{if(draft)draft.articles[selected].passage=$('originalPassage').value;onChange();});
  $('parseOriginal').addEventListener('click',async()=>{
    const text=$('passage').value.trim(),questionText=$('originalQuestionText').value.trim(),answerText=$('originalAnswerText').value.trim();
    if(text.length<80)return tell('请先读取文章和题目所在页，或粘贴完整内容。',true);
    const settings=getSettings();if(!settings.available||!settings.configured&&!settings.key)return tell('识别原题需要 DeepSeek，请先填写密钥。',true);
    setBusy(true,'正在识别原文和原题，保留原有题目…');
    try{
      const response=await fetch('./api/import-original',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,questionText,answerText,inferMissing:$('inferMissingAnswers').checked,deepseek:{model:settings.model,key:settings.key}})});
      if(!response.headers.get('content-type')?.includes('application/json'))throw Error('原题识别需要启动本地服务。');
      const data=await response.json();if(!response.ok)throw Error(response.status===404?'请在控制台停止并重新启动服务，启用原题识别接口。':data.error||'识别失败。');
      draft=data;selected=0;render();onChange();tell('识别完成，请在下方核对，再点击“按原题开始练习”。');panel.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){tell(error.message,true);}finally{setBusy(false);}
  });
  $('addOriginalQuestion').addEventListener('click',()=>{
    if(!draft)return;
    const article=draft.articles[selected];article.questions.push({id:'manual-'+Date.now(),originalNumber:String(article.questions.length+1),kind:'fill',type:'原题 · 填空',prompt:'',instructions:'',maxWords:null,options:[],answerIndex:null,acceptedAnswers:[],answerSource:'missing',evidence:'',explanation:'未提供答案，本题暂不计分。'});render();onChange();
  });
  $('startOriginal').addEventListener('click',()=>{
    if(!draft)return;
    const article=draft.articles[selected];
    if(article.passage.trim().length<80||!article.questions.length)return tell('需要完整文章和至少一道题。',true);
    const numbers=new Set();
    for(const q of article.questions) {
      if(!q.prompt.trim()||!q.originalNumber||numbers.has(q.originalNumber))return tell('请补全题干，并使用不重复的原题号。',true);numbers.add(q.originalNumber);
      if(q.kind==='mcq'&&(q.options.length<2||q.options.length>8||new Set(q.options).size!==q.options.length))return tell('每道单选题需要 2–8 个不重复的选项。',true);
      if(q.kind==='fill'&&q.maxWords!==null&&(!Number.isInteger(q.maxWords)||q.maxWords<1||q.maxWords>50))return tell('填空字数限制应为 1–50 的整数。',true);
    }
    // Clone before practice: later changes to the editor must not mutate a saved attempt.
    onStart(JSON.parse(JSON.stringify({...article,mode:'original'})));
  });
  async function showPage() {
    const pdf=getPDF();if(!pdf)return;
    const version=++renderVersion;
    try{
      const number=Math.max(1,Math.min(pdf.numPages,Number($('previewPage').value)||1));$('previewPage').value=number;
      const page=await pdf.getPage(number),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(1.5,740/base.width)});
      const canvas=make('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      if(version===renderVersion)$('pdfPreview').replaceChildren(canvas);
    }catch{tell('预览未能加载，请检查页码。',true);}
  }
  $('previewPage').addEventListener('input',showPage);$('previewPage').addEventListener('change',showPage);$('previewPDF').addEventListener('toggle',()=>{if($('previewPDF').open)showPage();});
  for(const id of ['originalQuestionText','originalAnswerText','inferMissingAnswers'])$(id).addEventListener('input',onChange);
  return {render,showPage,getDraft:()=>({draft,selected,questionText:$('originalQuestionText').value,answerText:$('originalAnswerText').value,inferMissing:$('inferMissingAnswers').checked}),restore(state){if(!state)return;draft=state.draft;selected=Math.min(state.selected||0,Math.max(0,(draft?.articles.length||1)-1));$('originalQuestionText').value=state.questionText||'';$('originalAnswerText').value=state.answerText||'';$('inferMissingAnswers').checked=Boolean(state.inferMissing);render();}};
}
