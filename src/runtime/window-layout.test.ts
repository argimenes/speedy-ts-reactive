import { describe, expect, it } from 'vitest';
import { LayoutSolver, TAB_HEIGHT, entries, findGroup, insertEntry, mapEntries, removeEntry, snapAt, snapTree, updateNode, validateLayout, type LayoutNode } from './window-layout';
const ids=()=>{let n=0;return()=>`node-${++n}`;};
const constraints=new Map(['a','b','c','d'].map(k=>[k,{width:200,height:120}]));
const area={x:17,y:23,width:1001,height:701};
const solve=(tree:LayoutNode|undefined,rect=area,excluded=new Set<string>())=>new LayoutSolver().solve(tree,rect,constraints,excluded,0);
const pair=()=>insertEntry(undefined,'b','a','right',ids());
describe('C pure binary shell solver',()=>{
 it('allocates odd CSS pixels deterministically without gaps or negative bounds',()=>{
  const tree=pair(),first=solve(tree),again=solve(tree);expect(first).toEqual(again);
  expect(first.unsatisfiable).toEqual([]);expect(first.rectangles.a.width+first.rectangles.b.width+6).toBe(area.width);
  expect(first.rectangles.b.x).toBe(first.rectangles.a.x+first.rectangles.a.width+6);
  expect(first.rectangles.a.y).toBe(area.y);expect(first.rectangles.b.height).toBe(area.height);
 });
 it('propagates minima and clamps dividers, including vertical splits',()=>{
  const id=ids(),tree=insertEntry(insertEntry(undefined,'b','a','right',id),'c','b','bottom',id);
  const solution=solve(tree);expect(Object.keys(solution.rectangles).sort()).toEqual(['a','b','c']);
  const split=tree as Extract<LayoutNode,{kind:'split'}>,clamped=solve({...split,ratio:.001});
  expect(clamped.rectangles.a.width).toBe(200);expect(clamped.rectangles.c.height).toBeGreaterThanOrEqual(120);
 });
 it('respects maximum constraints when feasible and reports contradictions',()=>{
  const tree=pair(),solver=new LayoutSolver(),c=new Map([['a',{width:200,height:100,maxWidth:300}],['b',{width:200,height:100}]]);
  expect(solver.solve(tree,area,c,new Set(),0).rectangles.a.width).toBe(300);
  const impossible=new Map([['a',{width:400,height:100,maxWidth:300}],['b',{width:200,height:100}]]);
  expect(solver.solve(tree,area,impossible,new Set(),1).unsatisfiable.length).toBeGreaterThan(0);
 });
 it('uses temporary tabs on shrink without mutating the saved split',()=>{
  const tree=pair(),before=JSON.stringify(tree),small=solve(tree,{x:0,y:0,width:350,height:200});
  expect(small.unsatisfiable).toEqual([tree.id]);expect(small.tabs[0].temporary).toBe(true);
  expect(small.rectangles.a.height).toBe(200-TAB_HEIGHT);expect(small.rectangles.b).toBeUndefined();
  expect(JSON.stringify(tree)).toBe(before);expect(solve(tree).rectangles.b).toBeDefined();
 });
 it('excludes minimized entries from solving while retaining their original slots',()=>{
  const tree=pair(),result=solve(tree,area,new Set(['a']));expect(result.rectangles.b).toEqual(area);
  expect(entries(tree)).toEqual(['a','b']);expect(solve(tree).rectangles.a.width).toBeLessThan(area.width);
 });
 it('collapses closed leaves and selects the adjacent surviving shell tab',()=>{
  const id=ids(),tree=insertEntry(insertEntry(undefined,'b','a','right',id),'c','b','tab',id);const group=findGroup(tree,'c')!;
  expect(group.entries).toEqual(['b','c']);const closed=removeEntry(tree,'c');expect(findGroup(closed,'b')!.active).toBe('b');
  expect(removeEntry(closed,'a')?.kind).toBe('tabs');expect(entries(removeEntry(closed,'a'))).toEqual(['b']);
 });
 it('moves an entry between groups without duplicating it and preserves all other entries',()=>{
  let n=0;const id=()=>`n${++n}`,tree=insertEntry(insertEntry(undefined,'b','a','right',id),'c','a','bottom',id);
  const tabbed=insertEntry(tree,'b','c','tab',id);expect(entries(tabbed).sort()).toEqual(['a','b','c']);
  expect(findGroup(tabbed,'b')!.entries).toEqual(['c','b']);expect(()=>validateLayout(tabbed,new Set(['a','b','c']))).not.toThrow();
 });
 it('preserves snap vacancies in persistence and fills all four quarter slots',()=>{
  const id=ids();let tree:LayoutNode|undefined;
  for(const [key,zone] of [['a','top-left'],['b','bottom-left'],['c','top-right'],['d','bottom-right']] as const)tree=snapTree(tree,key,zone,id);
  expect(entries(tree).sort()).toEqual(['a','b','c','d']);const result=solve(tree);expect(result.unsatisfiable).toEqual([]);
  expect(result.rectangles.a.x).toBe(result.rectangles.b.x);expect(result.rectangles.c.y).toBe(result.rectangles.a.y);
  const half=snapTree(undefined,'a','left',id);expect(mapEntries(half,k=>k)).toEqual(half);
  expect(entries(mapEntries(tree,k=>k==='a'?undefined:k))).not.toContain('a');
 });
 it.each(['duplicate','cycle','ratio','selection','unknown'] as const)('rejects %s layouts',kind=>{
  const tree:any=pair();if(kind==='duplicate')tree.second.entries=['a'];if(kind==='cycle')tree.first=tree;if(kind==='ratio')tree.ratio=NaN;if(kind==='selection')tree.first.active='missing';if(kind==='unknown')tree.second.entries=['missing'];
  expect(()=>validateLayout(tree,new Set(['a','b']))).toThrow();
 });
 it('calculates the same edge zones for pointer and touch CSS coordinates',()=>{
  expect(snapAt({x:17,y:23},area)).toBe('top-left');expect(snapAt({x:1018,y:724},area)).toBe('bottom-right');expect(snapAt({x:500,y:400},area)).toBeUndefined();
 });
 it('checks a finite grid of work areas and ratios for valid allocation',()=>{
  const base=pair();for(const width of [1,200,406,700,1001])for(const height of [1,120,701])for(const ratio of [.01,.5,.99]){
   const result=solve({...base,ratio} as LayoutNode,{x:0,y:0,width,height});
   for(const rect of Object.values(result.rectangles)){expect(Object.values(rect).every(Number.isFinite)).toBe(true);expect(rect.width).toBeGreaterThan(0);expect(rect.height).toBeGreaterThan(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width);expect(rect.y+rect.height).toBeLessThanOrEqual(height);}
  }
 });
});
it('reuses valid subtree constraints on viewport-only changes',()=>{
 const tree=pair(),solver=new LayoutSolver();let reads=0;const c=new Map(constraints),get=c.get.bind(c);c.get=(key:string)=>{reads++;return get(key);};
 solver.minimum(tree,c,new Set(),1);expect(reads).toBe(2);solver.minimum(tree,c,new Set(),1);expect(reads).toBe(2);
 solver.minimum(tree,c,new Set(['a']),2);expect(reads).toBe(3);
});
