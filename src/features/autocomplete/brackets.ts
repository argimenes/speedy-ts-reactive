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
