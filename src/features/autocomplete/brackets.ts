import {graphemeBoundaries} from '../../input/graphemes';
/** Explicit boundary gestures may inspect their Block; ordinary input never does. */
export function moveBoundary(text:string,position:number,direction:-1|1,word:boolean):number {
 const length=[...text].length;
 const boundaries=word?wordEdges(text,direction):graphemeBoundaries(text);
 return direction<0?boundaries.filter(n=>n<position).at(-1)??0:boundaries.find(n=>n>position)??length;
}
function wordEdges(text:string,direction:number):number[] {
 const edges=[0];let offset=0;
 for(const part of new Intl.Segmenter(undefined,{granularity:'word'}).segment(text)){
  const start=offset;offset+=[...part.segment].length;
  if(part.isWordLike||!/^\s+$/u.test(part.segment))edges.push(direction<0?start:offset);
 }
 edges.push([...text].length);return [...new Set(edges)].sort((a,b)=>a-b);
}
export function nextWordLength(text:string):number {
 const first=new Intl.Segmenter(undefined,{granularity:'word'}).segment(text)[Symbol.iterator]().next().value;
 return first?.isWordLike?[...first.segment].length:0;
}

/** Cached per occurrence inline revision: selection moves reuse segmentation. */
export function boundaryNavigator(text:string) {
 const graphemes=graphemeBoundaries(text),back=wordEdges(text,-1),forward=wordEdges(text,1);
 return (position:number,direction:-1|1,word:boolean,edge?:'start'|'end')=>{
  // Opening markers track word starts; closing markers track word ends,
  // independently of travel direction. Do not strand a marker before whitespace.
  const values=word?((edge?edge==='start':direction<0)?back:forward):graphemes;
  let lo=0,hi=values.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(values[mid]<position||(direction>0&&values[mid]===position))lo=mid+1;else hi=mid;}
  return direction<0?values[Math.max(0,lo-1)]:values[Math.min(values.length-1,lo)];
 };
}
