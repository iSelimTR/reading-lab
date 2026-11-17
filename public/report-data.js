import { vocabularyMarkers } from './vocabulary.js';
// Normalize for evidence matching while retaining UTF-16 offsets into the original PDF text.
export function normalizedIndex(source) {
  const omitted = new Set();
  for (const match of source.matchAll(/([a-z])-\s*\n\s*([a-z])/gi)) {
    for (let i = match.index + 1; i < match.index + match[0].length - 1; i++) omitted.add(i);
  }
  let text = '';
  const starts = [], ends = [];
  for (const match of source.matchAll(/.\p{M}*|\n/gu)) {
    if (omitted.has(match.index)) continue;
    const value = match[0].normalize('NFKC').replace(/[\u00ad\u200b]/g, '')
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').toLowerCase();
    for (const char of value) {
      if (/\s/.test(char)) {
        if (!text || text.endsWith(' ')) { if (text) ends[ends.length - 1] = match.index + match[0].length; continue; }
        text += ' '; starts.push(match.index); ends.push(match.index + match[0].length);
      } else {
        text += char;
        for (let i = 0; i < char.length; i++) { starts.push(match.index); ends.push(match.index + match[0].length); }
      }
    }
  }
  if (text.endsWith(' ')) { text = text.slice(0,-1); starts.pop(); ends.pop(); }
  return {text, starts, ends};
}

export function buildReviewData({title, passage, questions, answers, annotations = [], date = new Date(), vocabulary = []}) {
  if (typeof passage !== 'string' || !Array.isArray(questions) || !questions.length) throw new Error('没有可导出的练习。');
  const source = normalizedIndex(passage);
  const items = questions.map((question,index) => {
    const selected = answers?.[question.id];
    const answered = Number.isInteger(selected) && selected >= 0 && selected < question.options.length;
    const evidence = normalizedIndex(String(question.evidence || '')).text;
    const position = evidence ? source.text.indexOf(evidence) : -1;
    return { ...question, number:index+1, selected:answered ? selected : null,
      correct:answered && selected === question.answerIndex,
      range:position < 0 ? null : {start:source.starts[position],end:source.ends[position+evidence.length-1]} };
  });
  const correct = items.filter(item=>item.correct).length;
  return {title:String(title || '阅读练习'), passage, items, correct, total:items.length,
    date:new Date(date).toLocaleString('zh-CN'), vocabulary:Array.isArray(vocabulary)?vocabulary.filter(entry=>entry&&['term','context','generalMeaning','contextualMeaning','contextTranslation'].every(field=>typeof entry[field]==='string'&&entry[field].length<=2000)).map(entry=>({term:entry.term,shortMeaning:typeof entry.shortMeaning==='string'?entry.shortMeaning.slice(0,200):'',passageStart:entry.passageStart,passageEnd:entry.passageEnd,context:entry.context,generalMeaning:entry.generalMeaning,contextualMeaning:entry.contextualMeaning,contextTranslation:entry.contextTranslation,lemma:String(entry.lemma||''),partOfSpeech:String(entry.partOfSpeech||'')})):[], annotations:annotations.filter(note=>Number.isInteger(note.start)&&Number.isInteger(note.end)&&note.start>=0&&note.end>note.start) };
}

export function paragraphSegments(passage, items, vocabulary = []) {
  let cursor=0, flatOffset=0;
  const markers=vocabularyMarkers(passage.split(/\n\s*\n/).filter(Boolean).join(''),vocabulary);
  return passage.split(/\n\s*\n/).filter(Boolean).map(text=>{
    const start=passage.indexOf(text,cursor), end=start+text.length;
    cursor=end;
    const glosses=markers.filter(marker=>marker.end>flatOffset&&marker.end<=flatOffset+text.length).map(marker=>({...marker,end:start+marker.end-flatOffset}));
    flatOffset+=text.length;
    const relevant=items.filter(item=>item.range && item.range.start<end && item.range.end>start);
    const breaks=[...new Set([start,end,...glosses.map(marker=>marker.end),...relevant.flatMap(item=>[Math.max(start,item.range.start),Math.min(end,item.range.end)])])].sort((a,b)=>a-b);
    return breaks.slice(0,-1).map((from,index)=>{
      const to=breaks[index+1];
      return {text:passage.slice(from,to),glosses:glosses.filter(marker=>marker.end===to).map(marker=>marker.meaning),questionNumbers:relevant.filter(item=>item.range.start<to&&item.range.end>from).map(item=>item.number),highlight:relevant.some(item=>item.range.start<to&&item.range.end>from),
        references:relevant.filter(item=>item.range.end===to).map(item=>item.number)};
    });
  });
}
