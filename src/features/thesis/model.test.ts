import {describe,it,expect} from 'vitest';
import {transferSelection,serializeAnnotations} from './model';
import {mapStandoffPropertiesForReplacement} from '../../interchange/ranges';
const cells=(text:string)=>[...text].map(text=>({type:'text-cell',text}));
describe('Thesis selection transfer',()=>{
 it('preserves exact Unicode, overlaps, repeated targets and points with explicit SQL boundaries',()=>{
  const result=transferSelection(cells('x😀éz'),[{id:'a',type:'codex/entity-reference',value:'same',start:1,end:2},{id:'b',type:'codex/entity-reference',value:'same',start:2,end:3},{id:'p',type:'point',start:4,end:3,isZeroWidth:true,affinity:'before'}],1,4);
  expect(result.text).toBe('😀é');expect(new Set(result.properties.map(p=>p.id)).size).toBe(3);
  expect(serializeAnnotations(result.text,result.properties).map(p=>[p.start,p.end])).toEqual([[0,3],[2,4],[4,4]]);
  const mapped=mapStandoffPropertiesForReplacement(result.properties,0,0,1,[],3) as any[];
  expect(serializeAnnotations('q'+result.text,mapped).map(p=>[p.start,p.end])).toEqual([[1,4],[3,5],[5,5]]);
 });
 it('clips only known formatting and discloses omissions, without mutating source',()=>{
  const source=[{id:'bold',type:'style/bold',start:0,end:4},{id:'entity',type:'codex/entity-reference',value:'x',start:0,end:4}];
  const snapshot=JSON.stringify(source),result=transferSelection(cells('abcde'),source,1,4);
  expect(result.properties).toHaveLength(1);expect(result.properties[0]).toMatchObject({start:0,end:2,thesisOrigin:{annotationId:'bold'}});expect(result.warnings).toHaveLength(2);expect(JSON.stringify(source)).toBe(snapshot);
 });
 it('materializes resolved definitions and refuses unsupported objects and final links',()=>{
  const draft=transferSelection(cells('abc'),[{id:'link',annotationId:'def',start:0,end:2}],0,3,p=>({...p,type:'style/bold',value:'effective'}));
  expect(draft.properties[0].annotationId).toBeUndefined();expect(draft.properties[0].value).toBe('effective');
  expect(transferSelection(cells('abc'),[{id:'link',annotationId:'missing',start:0,end:2}],0,3,()=>undefined).warnings).toHaveLength(1);
  expect(()=>transferSelection([{type:'image-cell'}],[],0,1)).toThrow(/embedded/);
  expect(()=>serializeAnnotations('abc',[{id:'x',annotationId:'shared',start:0,end:1}])).toThrow(/direct/);
 });
});
