export function selectionContext(text,start,end) {
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>text.length)throw Error('请选择原文中的单词或短语。');
  const term=text.slice(start,end).trim();
  if(!term||term.length>200)throw Error('一次请选择 200 字符以内的单词或短语。');
  const before=text.slice(Math.max(0,start-600),start);
  const boundary=Math.max(before.lastIndexOf('. '),before.lastIndexOf('! '),before.lastIndexOf('? '),before.lastIndexOf('。'),before.lastIndexOf('\n'));
  const left=boundary<0?Math.max(0,start-600):start-before.length+boundary+1;
  const after=text.slice(end,Math.min(text.length,end+600));
  const next=after.search(/[.!?](?:\s|$)|。|\n/);
  const right=next<0?Math.min(text.length,end+600):end+next+1;
  return {term,context:text.slice(left,right).trim()};
}
export function vocabularyIdentity(entry) {return entry.term.trim().toLowerCase()+'\u0000'+entry.context.trim();}
export const EVIDENCE_COLORS=['205FA6','A33A2B','267349','7942A1','9B660E','087B88','B33875','596E1A','4C4EAD','A04B11','176E66','8F3C65','516D8C','71552A','644488'];
export function evidenceColor(number){return EVIDENCE_COLORS[(number-1)%EVIDENCE_COLORS.length];}

// Offsets always refer to the original passage with paragraph separators removed.
export function vocabularyMarkers(text, entries = []) {
  const markers=[];
  for(const entry of entries) {
    let start=entry.passageStart,end=entry.passageEnd;
    const term=entry.term?.trim(), meaning=entry.contextualMeaning?.trim();
    if(!term||!meaning)continue;
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||text.slice(start,end).toLowerCase()!==term.toLowerCase()) {
      // Earlier records have no offsets. Only use an unambiguous matching context.
      const context=entry.context?.trim();
      const contextStart=context?text.indexOf(context):-1;
      if(contextStart<0||text.indexOf(context,contextStart+1)>=0)continue;
      const position=context.toLowerCase().indexOf(term.toLowerCase());
      if(position<0||context.toLowerCase().indexOf(term.toLowerCase(),position+1)>=0)continue;
      start=contextStart+position;end=start+term.length;
    }
    if(!markers.some(marker=>marker.start===start&&marker.end===end))markers.push({start,end,meaning});
  }
  return markers.sort((a,b)=>a.end-b.end);
}
