import {describe,it,expect} from 'vitest';
import {ProvisionalCells} from './provisional-cells';
describe('Scry presentation coordinates',()=>{
 const source=()=>[...'the pianist'].map((text,i)=>({key:'canonical-'+i,text,canonicalIndex:i}));
 it('represents markers without changing canonical cells, including empty ranges and block ends',()=>{
  const original=source();for(const [a,b] of [[0,0],[0,11],[4,11],[11,11]]){
   const draft=new ProvisionalCells(original,a,b,'mention');
   expect(draft.sequence().map(c=>c.text).join('')).toBe('the pianist'.slice(0,a)+'(('+ 'the pianist'.slice(a,b)+'))'+'the pianist'.slice(b));
   for(let i=0;i<=11;i++)expect(draft.fromPresentation(draft.toPresentation(i))).toBe(i);
   expect(draft.cells.every((c,i)=>c===original[i])).toBe(true);
  }
 });
 it('types at an empty end and retains edits when boundaries move',()=>{
  const draft=new ProvisionalCells(source(),11,11,'autocomplete');draft.replace(11,11,'Flo');
  expect(draft.text()).toBe('the pianistFlo');expect(draft.end).toBe(14);
  draft.boundaries(12,14);expect(draft.text()).toBe('the pianistFlo');
  expect(draft.edits).toEqual([{start:11,end:11,text:'Flo'}]);
 });
 it('retains unchanged cell identity during canonical-name replacement',()=>{
  const cells=[...'Flor'].map((text,i)=>({key:String(i),text,canonicalIndex:i}));
  const draft=new ProvisionalCells(cells,0,4,'autocomplete');draft.replacePhrase('Florence');
  expect(draft.cells.slice(0,4)).toEqual(cells);expect(draft.edits).toEqual([{start:4,end:4,text:'ence'}]);
 });
 it('uses codepoint coordinates for provisional text and maps canonical ranges through edits',()=>{
  const draft=new ProvisionalCells(source(),0,11,'mention');draft.replace(4,4,'😀 ');
  expect(draft.end).toBe(13);expect(draft.canonicalToDraft(11)).toBe(13);expect(draft.canonicalToDraft(4,true)).toBe(6);
  for(let i=0;i<=13;i++)expect(draft.fromPresentation(draft.toPresentation(i))).toBe(i);
 });
});
