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
