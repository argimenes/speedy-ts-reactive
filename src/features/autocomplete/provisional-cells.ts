import { createSignal, type Accessor, type Setter } from 'solid-js';
import type { CharacterCellPresentation } from '../../rendering/direct-character-cells';

export interface DraftEdit { start:number; end:number; text:string }
export interface DraftCell { key:string; text:string; canonicalIndex?:number; plain?:boolean; role?:'open-bracket'|'close-bracket'|'draft-text' }

/** One occurrence's presentation. No repository or DOM ownership. Coordinates
 * in edits/start/end exclude markers; presented coordinates include them. */
export class ProvisionalCells {
 readonly id=crypto.randomUUID();
 readonly revision:Accessor<number>; private changed:Setter<number>;
 readonly original:readonly DraftCell[];
 cells:DraftCell[]; edits:DraftEdit[]=[];
 generation=0;
 start:number; end:number;
 private serial=0;
 private presented:DraftCell[]=[];
 private positions:number[]=[];
 private logical:number[]=[];
 private byKey=new Map<string,DraftCell>();
 constructor(cells:readonly DraftCell[],start:number,end:number,readonly mode:'mention'|'autocomplete',public pending=false){
  [this.revision,this.changed]=createSignal(0);
  this.original=cells;this.cells=[...cells];this.start=start;this.end=end;this.rebuild();
 }
 private marker(role:'open-bracket'|'close-bracket',i:number):DraftCell{return {key:`scry:${this.id}:${role}:${i}`,text:role==='open-bracket'?(this.mode==='mention'?'(':'['):(this.mode==='mention'?')':']'),role};}
 private rebuild(){
  this.presented=[];this.positions=[];this.logical=[];
  for(let i=0;i<=this.cells.length;i++){
   if(i===this.start){this.presented.push(this.marker('open-bracket',0));this.logical.push(i);if(!this.pending){this.presented.push(this.marker('open-bracket',1));this.logical.push(i);}}
   this.positions[i]=this.presented.length;
   if(i===this.end&&!this.pending){this.presented.push(this.marker('close-bracket',0),this.marker('close-bracket',1));this.logical.push(i,i);}
   if(i<this.cells.length){this.presented.push(this.cells[i]);this.logical.push(i);}
  }
  this.logical.push(this.cells.length);this.byKey=new Map(this.presented.map(c=>[c.key,c]));this.changed(n=>n+1);
 }
 sequence(){this.revision();return this.presented;}
 cell(key:string){this.revision();return this.byKey.get(key);}
 text(start=0,end=this.cells.length){return this.cells.slice(start,end).map(c=>c.text).join('');}
 boundaries(start:number,end:number){if(start<0||end<start||end>this.cells.length)throw Error('Invalid Scry boundary');this.start=start;this.end=end;this.rebuild();}
 activate(end:number){this.pending=false;this.end=end;this.rebuild();}
 replace(start:number,end:number,text:string){
  if(start<0||end<start||end>this.cells.length)throw Error('Invalid Scry edit');
  const inserted=[...text].map(text=>({key:`scry:${this.id}:text:${++this.serial}`,text,role:'draft-text' as const}));
  this.cells.splice(start,end-start,...inserted);this.edits.push({start,end,text});this.generation++;
  this.end+=inserted.length-(end-start);this.rebuild();
 }
 /** Retain equal prefix/suffix, including their canonical Cell IDs. */
 replacePhrase(text:string){
  const before=[...this.text(this.start,this.end)],after=[...text];let a=0,b=0;
  while(a<before.length&&a<after.length&&before[a]===after[a])a++;
  while(b<before.length-a&&b<after.length-a&&before[before.length-1-b]===after[after.length-1-b])b++;
  if(a+b<before.length||a+b<after.length)this.replace(this.start+a,this.end-b,after.slice(a,after.length-b).join(''));
 }
 toPresentation(index:number){this.revision();return this.positions[Math.max(0,Math.min(index,this.cells.length))];}
 fromPresentation(index:number){this.revision();return this.logical[Math.max(0,Math.min(index,this.presented.length))];}
 canonicalToDraft(index:number,after=false){for(const e of this.edits){const count=[...e.text].length;index=index<e.start?index:index>e.end||index===e.end&&e.end>e.start?index+count-(e.end-e.start):e.start+(after?count:0);}return index;}
 present(cells:readonly CharacterCellPresentation[]):CharacterCellPresentation[]{
  const canonical=new Map(cells.map(c=>[c.key,c]));
  return this.sequence().map((c,index)=>({...canonical.get(c.key),key:c.key,index,text:c.text,...(c.role?{provisional:true,classes:c.role==='draft-text'?undefined:'scry-bracket-cell'}:{})}));
 }
}
