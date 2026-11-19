import {answerSourceLabel,questionKind} from './original-quiz.js';
import { buildReviewData, paragraphSegments, reviewFilename } from './report-data.js';
import {evidenceColor} from './vocabulary.js';

const LETTERS = ['A','B','C','D','E','F','G','H'];
export function createReviewDocument(input, lib) {
  const report=buildReviewData(input);
  const {Document,Paragraph,TextRun,HeadingLevel,Footer,PageNumber,AlignmentType}=lib;
  const run=(text,options={})=>new TextRun({text:String(text),...options});
  const p=(text,options={})=>new Paragraph({children:[run(text)],spacing:{after:110,line:290},widowControl:true,...options});
  const heading=(text,level=HeadingLevel.HEADING_1,options={})=>p(text,{heading:level,keepNext:true,spacing:{before:240,after:120},...options});
  const children=[
    p('阅读练习复盘',{heading:HeadingLevel.TITLE,spacing:{after:160}}),
    p(report.title,{bold:true}),
    p(`导出时间 ${report.date}    本轮成绩 ${report.correct}/${report.gradedTotal}    错题 ${report.gradedTotal-report.correct} 道${report.pending?`    待核对 ${report.pending} 道`:''}`),
    p('本记录保留本轮原文、作答与解析。原文中每题证据使用不同颜色下划线，右上角数字对应题号。同一句对应多题时采用双下划线，并列出全部题号。红字表示错选，绿字表示正确答案。',{spacing:{after:170}}),
    heading('阅读原文')
  ];
  for (const segments of paragraphSegments(report.passage,report.items,report.vocabulary)) {
    const runs=[];
    for (const segment of segments) {
      const lines=segment.text.split('\n');
      lines.forEach((line,index)=>{if(index)runs.push(new TextRun({break:1}));runs.push(run(line,segment.highlight?{underline:{type:segment.questionNumbers.length>1?'double':'single',color:evidenceColor(segment.questionNumbers[0])}}:{}));});
      for(const meaning of segment.glosses) runs.push(run('（'+meaning+'）',{color:'176C65',size:21}));
      if(segment.references.length) runs.push(run(' ['+segment.references.join(' ')+']',{superScript:true,bold:true,size:20,color:evidenceColor(segment.references[0])}));
    }
    children.push(new Paragraph({children:runs,spacing:{after:180,line:320},widowControl:true}));
  }
  children.push(p('题号颜色对应',{keepNext:true}));
  children.push(new Paragraph({children:report.items.map(item=>run('第 '+item.number+' 题    ',{color:evidenceColor(item.number),underline:{type:'single',color:evidenceColor(item.number)}})),spacing:{after:130}}));
  const unmatched=report.items.filter(item=>!item.range).map(item=>item.number);
  if(unmatched.length) children.push(p(`第 ${unmatched.join('、')} 题的证据未能在原文中精确定位，未添加自动划线。请在该题的“原文依据”中核对。`));
  children.push(heading('作答与逐题解析'));
  const wrong=report.items.filter(item=>item.correct===false);
  children.push(p(wrong.length ? `本轮需要复习的题号：${wrong.map(item=>item.number).join('、')}。先比较所选项和正确项，再结合原文依据复盘。` : report.pending?'本轮有题目缺少答案，未纳入计分，请先核对答案。':'本轮全部答对。可以重点复习每题的原文定位与同义表达。'));
  for (const item of report.items) {
    const selected=item.selectedLabel;
    children.push(heading(`第 ${item.number} 题${item.originalNumber?' 原题 '+item.originalNumber:''} ${item.correct===null?'待核对答案':item.correct?'回答正确':'需要复习'}`,HeadingLevel.HEADING_2));
    if(item.instructions)children.push(p(item.instructions,{keepNext:true}));
    if(item.answerSource)children.push(p('答案来源：'+answerSourceLabel(item),{keepNext:true}));
    item.prompt.split('\n').filter(Boolean).forEach(line=>children.push(p(line,{keepNext:true})));
    item.options.forEach((option,index)=>{
      const tags=[];if(index===item.selected)tags.push('你的选择');if(item.hasAnswer&&index===item.answerIndex)tags.push('正确答案');
      const colour=item.hasAnswer&&index===item.answerIndex?'176C39':index===item.selected&&item.correct===false?'AE3028':'000000';
      children.push(new Paragraph({children:[run(`${LETTERS[index]}  ${option}${tags.length?'  （'+tags.join('，')+'）':''}`,{color:colour,bold:tags.length>0})],spacing:{after:70,line:280}}));
    });
    children.push(new Paragraph({children:[run('你的答案：'),run(selected,{color:item.correct===false?'AE3028':item.correct===true?'176C39':'000000'}),run('。正确答案：'),run(item.answerLabel,{color:item.hasAnswer?'176C39':'000000'}),run('。')],spacing:{after:110,line:290}}));
    children.push(p(item.correct===null?'答案待核对':item.correct?'本题解析':'错题分析',{keepNext:true,spacing:{before:110,after:60}}));
    if(item.correct===false) children.push(p(item.selected===null?'本题没有作答。请先回到高亮证据定位，再比较四个选项。':`本次作答 ${selected}，应答 ${item.answerLabel}。请比较所选项与以下原文依据。`));
    if(item.limitExceeded)children.push(p('本题答案超过字数限制，最多 '+item.maxWords+' 词。'));
    if(item.answerEvidence)children.push(p('答案页依据：'+item.answerEvidence));
    children.push(p(item.explanation || '本题未提供文字解析，请对照原文依据复习。'));
    children.push(p(`原文依据 对应原文标记 ${item.number}`,{keepNext:true,spacing:{before:90,after:60}}),new Paragraph({children:[run(item.evidence || '未提供原文依据。',{underline:{type:'single',color:evidenceColor(item.number)}})],keepLines:true,spacing:{after:130,line:290}}));
  }
  if(report.vocabulary.length)children.push(heading('本篇生词'));
  else children.push(p('本篇生词：本轮没有加入生词。原文选词翻译后会自动收录。',{spacing:{before:130,after:60}}));
  report.vocabulary.forEach((entry,index)=>{
    children.push(heading((index+1)+' '+entry.term,HeadingLevel.HEADING_2));
    children.push(p('词形与词性：'+entry.lemma+' '+entry.partOfSpeech),p('常见词义：'+entry.generalMeaning),p('语境词义：'+entry.contextualMeaning),p('原句：'+entry.context),p('原句翻译：'+entry.contextTranslation));
  });
  if(report.annotations.length) {
    const annotationSource=report.passage.split(/\n\s*\n/).filter(Boolean).join('');
    children.push(heading('我的阅读标注'));
    report.annotations.forEach(note=>children.push(p(`${note.type==='question'?'疑问标记':'个人高亮'}：${annotationSource.slice(note.start,note.end)}`)));
  }
  children.push(p('复盘说明：本记录使用本轮已有解析生成，不额外调用 AI。错题分析不代表已判断你的具体思考过程；AI 题目和解释仍需以原文核对。',{spacing:{before:200,after:100}}));
  return new Document({creator:'Reading Lab',title:'阅读练习复盘',description:'原文证据高亮和逐题复盘',
    styles:{default:{document:{run:{font:{name:'Calibri',eastAsia:'Microsoft YaHei'},size:23,color:'000000'},paragraph:{spacing:{line:290,after:110}}},
      title:{run:{font:{name:'Calibri',eastAsia:'Microsoft YaHei'},size:40,bold:true,color:'000000'}},
      heading1:{run:{font:{name:'Calibri',eastAsia:'Microsoft YaHei'},size:30,bold:true,color:'000000'}},
      heading2:{run:{font:{name:'Calibri',eastAsia:'Microsoft YaHei'},size:26,bold:true,color:'000000'}}}},
    sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1080,bottom:1080,left:1080,right:1080}}},
      footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[run('Reading Lab  ·  '),new TextRun({children:[PageNumber.CURRENT]})]})]})},children}]});
}

export async function downloadReviewWord(input) {
  const lib=await import('./vendor/docx/index.mjs?version=2');
  const blob=await lib.Packer.toBlob(createReviewDocument(input,lib));
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=reviewFilename(input);
  document.body.append(anchor);anchor.click();anchor.remove();
  return {url,filename:anchor.download};
}
