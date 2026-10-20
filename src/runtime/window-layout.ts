/** Pure shell layout arithmetic and immutable membership operations. No DOM or resources. */
export type LayoutNode =
  | { id:string; kind:'empty'; [key:string]:unknown }
  | { id:string; kind:'tabs'; entries:string[]; active:string; [key:string]:unknown }
  | { id:string; kind:'split'; axis:'horizontal'|'vertical'; ratio:number; first:LayoutNode; second:LayoutNode; [key:string]:unknown };
export interface LayoutRect { x:number; y:number; width:number; height:number }
export interface LayoutConstraint { width:number; height:number; maxWidth?:number; maxHeight?:number }
export type SnapZone = 'left'|'right'|'top'|'bottom'|'top-left'|'top-right'|'bottom-left'|'bottom-right';
export type TileEdge = 'left'|'right'|'top'|'bottom'|'tab';
export const GUTTER=6, TAB_HEIGHT=30;
const invalid=(message:string):never=>{throw Error(message);};
export function entries(node?:LayoutNode):string[] { return !node||node.kind==='empty'?[]:node.kind==='tabs'?[...node.entries]:[...entries(node.first),...entries(node.second)]; }
export function validateLayout(tree:unknown, allowed:ReadonlySet<string>) {
  const seen=new Set<object>(),ids=new Set<string>(),members=new Set<string>();
  const visit=(value:any,depth:number)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||seen.has(value)||depth>64)invalid('Invalid or cyclic shell layout.');
    seen.add(value);
    if(typeof value.id!=='string'||!value.id.trim()||ids.has(value.id))invalid('Duplicate or missing layout node ID.');ids.add(value.id);
    if(value.kind==='empty')return;
    if(value.kind==='tabs'){
      if(!Array.isArray(value.entries)||!value.entries.length||!value.entries.includes(value.active))invalid('Invalid shell tab selection.');
      for(const key of value.entries){if(typeof key!=='string'||!allowed.has(key)||members.has(key))invalid('Duplicate or missing shell window membership.');members.add(key);}return;
    }
    if(value.kind!=='split'||!['horizontal','vertical'].includes(value.axis)||typeof value.ratio!=='number'||!Number.isFinite(value.ratio)||value.ratio<=0||value.ratio>=1)invalid('Invalid binary split.');
    visit(value.first,depth+1);visit(value.second,depth+1);
  };
  if(tree!==undefined)visit(tree,0);return members;
}
export function mapEntries(node:LayoutNode|undefined, map:(key:string)=>string|undefined):LayoutNode|undefined {
  if(!node||node.kind==='empty')return node;
  if(node.kind==='tabs'){
    const members=node.entries.map(map).filter((v):v is string=>!!v);if(!members.length)return;
    return {...node,entries:members,active:map(node.active)??members[Math.min(Math.max(0,node.entries.indexOf(node.active)),members.length-1)]};
  }
  const first=mapEntries(node.first,map),second=mapEntries(node.second,map);
  if(!first)return second?.kind==='empty'?undefined:second;
  if(!second)return first.kind==='empty'?undefined:first;
  return first===node.first&&second===node.second?node:{...node,first,second};
}
/** Preserve explicit snap vacancies when no member was removed. */
export function removeEntry(node:LayoutNode|undefined,key:string):LayoutNode|undefined {
  if(!node||!entries(node).includes(key))return node;
  if(node.kind==='tabs'){
    const members=node.entries.filter(k=>k!==key);if(!members.length)return;
    return {...node,entries:members,active:node.active===key?members[Math.min(node.entries.indexOf(key),members.length-1)]:node.active};
  }
  if(node.kind!=='split')return node;
  const first=removeEntry(node.first,key),second=removeEntry(node.second,key);
  if(!first||first.kind==='empty')return second?.kind==='empty'?undefined:second;
  if(!second||second.kind==='empty')return first;
  return {...node,first,second};
}
export function updateNode(node:LayoutNode|undefined,id:string,change:(node:LayoutNode)=>LayoutNode):LayoutNode|undefined {
  if(!node)return;if(node.id===id)return change(node);if(node.kind!=='split')return node;
  const first=updateNode(node.first,id,change)!,second=updateNode(node.second,id,change)!;
  return first===node.first&&second===node.second?node:{...node,first,second};
}
export function findGroup(node:LayoutNode|undefined,key:string):Extract<LayoutNode,{kind:'tabs'}>|undefined {
  return !node||node.kind==='empty'?undefined:node.kind==='tabs'?(node.entries.includes(key)?node:undefined):findGroup(node.first,key)??findGroup(node.second,key);
}
export function tab(entry:string,id:()=>string):LayoutNode {return {id:id(),kind:'tabs',entries:[entry],active:entry};}
export function insertEntry(tree:LayoutNode|undefined,entry:string,target:string,edge:TileEdge,id:()=>string):LayoutNode {
  if(entry===target)invalid('Choose another window as the layout target.');
  let root=removeEntry(tree,entry);
  let group=findGroup(root,target);
  if(!group){const targetNode=tab(target,id);root=root?{id:id(),kind:'split',axis:'horizontal',ratio:.5,first:root,second:targetNode}:targetNode;group=targetNode as Extract<LayoutNode,{kind:'tabs'}>;}
  return updateNode(root,group!.id,node=>{
    if(node.kind!=='tabs')return node;
    if(edge==='tab')return {...node,entries:[...node.entries,entry],active:entry};
    const incoming=tab(entry,id),before=edge==='left'||edge==='top';
    return {id:id(),kind:'split',axis:edge==='left'||edge==='right'?'horizontal':'vertical',ratio:.5,first:before?incoming:node,second:before?node:incoming};
  })!;
}
export function snapTree(tree:LayoutNode|undefined,entry:string,zone:SnapZone,id:()=>string):LayoutNode {
  // Presets may return displaced views to floating; they never delete a view.
  const quarter=zone.includes('-'),axis=zone==='top'||zone==='bottom'?'vertical':'horizontal';
  const strip=(n:LayoutNode|undefined):LayoutNode|undefined=>{
    if(!n)return;if(n.kind==='tabs'){const e=n.entries.filter(k=>k!==entry);return e.length?{...n,entries:e,active:e.includes(n.active)?n.active:e[0]}:{id:n.id,kind:'empty'};}
    return n.kind==='split'?{...n,first:strip(n.first)!,second:strip(n.second)!}:n;
  };
  const empty=():LayoutNode=>({id:id(),kind:'empty'});
  const pair=(a:'horizontal'|'vertical'):Extract<LayoutNode,{kind:'split'}>=>({id:id(),kind:'split',axis:a,ratio:.5,first:empty(),second:empty()});
  const old=strip(tree);
  let root=old?.kind==='split'&&old.axis===axis?old:pair(axis);
  const side=zone.includes('right')||zone==='bottom'?'second':'first';
  if(quarter){
    const child=root[side];const column=child.kind==='split'&&child.axis==='vertical'?child:pair('vertical');
    const row=zone.startsWith('bottom')?'second':'first';root={...root,[side]:{...column,[row]:tab(entry,id)}};
  }else root={...root,[side]:tab(entry,id)};
  return root;
}
export function snapAt(point:{x:number;y:number},area:LayoutRect):SnapZone|undefined {
  const edge=24,x=point.x-area.x,y=point.y-area.y;
  if(x<0||y<0||x>area.width||y>area.height)return;
  const left=x<=edge,right=x>=area.width-edge,top=y<=edge,bottom=y>=area.height-edge;
  if(top&&left)return 'top-left';if(top&&right)return 'top-right';if(bottom&&left)return 'bottom-left';if(bottom&&right)return 'bottom-right';
  return left?'left':right?'right':top?'top':bottom?'bottom':undefined;
}
export interface LayoutSolution {
  rectangles:Record<string,LayoutRect>;
  tabs:Array<{id:string;entries:string[];active:string;rect:LayoutRect;temporary:boolean}>;
  dividers:Array<{id:string;axis:'horizontal'|'vertical';rect:LayoutRect;area:LayoutRect;ratio:number;minimum:number;maximum:number}>;
  unsatisfiable:string[];
}
/** Constraints cache by immutable subtree identity + capability/exclusion revision.
 * Solving visits layout nodes only. It never walks an application's document. */
export class LayoutSolver {
  private cache=new WeakMap<LayoutNode,{revision:number;value:LayoutConstraint}>();
  minimum(node:LayoutNode, constraints:ReadonlyMap<string,LayoutConstraint>,excluded:ReadonlySet<string>,revision:number):LayoutConstraint {
    const cached=this.cache.get(node);if(cached?.revision===revision)return cached.value;
    let value:LayoutConstraint;
    if(node.kind==='empty')value={width:0,height:0};
    else if(node.kind==='tabs'){
      const members=node.entries.filter(k=>!excluded.has(k)).map(k=>constraints.get(k)??{width:240,height:160});
      value={width:Math.max(0,...members.map(m=>m.width)),height:Math.max(0,...members.map(m=>m.height))+(members.length>1?TAB_HEIGHT:0)};
      if(members.length&&members.every(m=>m.maxWidth!==undefined))value.maxWidth=Math.min(...members.map(m=>m.maxWidth!));
      if(members.length&&members.every(m=>m.maxHeight!==undefined))value.maxHeight=Math.min(...members.map(m=>m.maxHeight!))+(members.length>1?TAB_HEIGHT:0);
    }else{
      const a=this.minimum(node.first,constraints,excluded,revision),b=this.minimum(node.second,constraints,excluded,revision);
      const hasA=entries(node.first).some(k=>!excluded.has(k)),hasB=entries(node.second).some(k=>!excluded.has(k));
      // Reserved snap slots consume space; minimized branches do not.
      const vacantA=node.first.kind==='empty',vacantB=node.second.kind==='empty';
      if(!hasA&&!vacantA)value=b;else if(!hasB&&!vacantB)value=a;
      else if(node.axis==='horizontal')value={width:a.width+b.width+GUTTER,height:Math.max(a.height,b.height),maxWidth:a.maxWidth!==undefined&&b.maxWidth!==undefined?a.maxWidth+b.maxWidth+GUTTER:undefined,maxHeight:a.maxHeight===undefined?b.maxHeight:b.maxHeight===undefined?a.maxHeight:Math.min(a.maxHeight,b.maxHeight)};
      else value={width:Math.max(a.width,b.width),height:a.height+b.height+GUTTER,maxHeight:a.maxHeight!==undefined&&b.maxHeight!==undefined?a.maxHeight+b.maxHeight+GUTTER:undefined,maxWidth:a.maxWidth===undefined?b.maxWidth:b.maxWidth===undefined?a.maxWidth:Math.min(a.maxWidth,b.maxWidth)};
    }
    this.cache.set(node,{revision,value});return value;
  }
  solve(tree:LayoutNode|undefined,area:LayoutRect,constraints:ReadonlyMap<string,LayoutConstraint>,excluded:ReadonlySet<string>,revision:number,selected:ReadonlyMap<string,string>=new Map()):LayoutSolution {
    if(![area.x,area.y,area.width,area.height].every(Number.isFinite)||area.width<1||area.height<1)invalid('Invalid work area.');
    const out:LayoutSolution={rectangles:{},tabs:[],dividers:[],unsatisfiable:[]};
    const group=(n:LayoutNode,rect:LayoutRect,temporary:boolean)=>{
      const members=entries(n).filter(k=>!excluded.has(k));if(!members.length)return;
      const preferred=selected.get(n.id)??(n.kind==='tabs'?n.active:undefined),active=members.includes(preferred!)?preferred!:members[0];
      const chrome=members.length>1?Math.min(TAB_HEIGHT,Math.max(0,rect.height-1)):0;
      if(chrome)out.tabs.push({id:n.id,entries:members,active,rect:{...rect,height:chrome},temporary});
      const c=constraints.get(active),width=Math.min(rect.width,c?.maxWidth??Infinity),height=Math.min(rect.height-chrome,c?.maxHeight??Infinity);
      out.rectangles[active]={x:rect.x,y:rect.y+chrome,width:Math.max(1,width),height:Math.max(1,height)};
    };
    const visit=(n:LayoutNode,rect:LayoutRect)=>{
      if(n.kind==='empty')return;
      const min=this.minimum(n,constraints,excluded,revision);
      if(rect.width<min.width||rect.height<min.height||(min.maxWidth??Infinity)<min.width||(min.maxHeight??Infinity)<min.height){out.unsatisfiable.push(n.id);group(n,rect,true);return;}
      if(n.kind==='tabs'){group(n,rect,false);return;}
      const hasA=entries(n.first).some(k=>!excluded.has(k)),hasB=entries(n.second).some(k=>!excluded.has(k));
      if(!hasA&&n.first.kind!=='empty'){visit(n.second,rect);return;}if(!hasB&&n.second.kind!=='empty'){visit(n.first,rect);return;}
      const a=this.minimum(n.first,constraints,excluded,revision),b=this.minimum(n.second,constraints,excluded,revision),horizontal=n.axis==='horizontal',length=(horizontal?rect.width:rect.height)-GUTTER;
      const lower=Math.max(horizontal?a.width:a.height,length-((horizontal?b.maxWidth:b.maxHeight)??Infinity));
      const upper=Math.min(length-(horizontal?b.width:b.height),horizontal?a.maxWidth??Infinity:a.maxHeight??Infinity);
      if(length<=0||lower>upper){out.unsatisfiable.push(n.id);group(n,rect,true);return;}
      const first=Math.min(upper,Math.max(lower,Math.round(length*n.ratio))),second=length-first;
      const firstRect={...rect,...(horizontal?{width:first}:{height:first})},secondRect={...rect,...(horizontal?{x:rect.x+first+GUTTER,width:second}:{y:rect.y+first+GUTTER,height:second})};
      out.dividers.push({id:n.id,axis:n.axis,area:rect,rect:horizontal?{x:rect.x+first,y:rect.y,width:GUTTER,height:rect.height}:{x:rect.x,y:rect.y+first,width:rect.width,height:GUTTER},ratio:first/length,minimum:lower/length,maximum:upper/length});
      if(first>=1)visit(n.first,firstRect);if(second>=1)visit(n.second,secondRect);
    };
    if(tree)visit(tree,area);return out;
  }
}
