import { batch, createMemo, createRoot, createSignal, type Accessor } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { WorkspaceWindowManager } from './window-manager';
import { desktopOf } from '../persistence/managed-desktop';
import { entries, findGroup, insertEntry, LayoutSolver, mapEntries, removeEntry, snapAt, snapTree, updateNode, validateLayout, type LayoutConstraint, type LayoutNode, type LayoutRect, type SnapZone, type TileEdge, type LayoutSolution } from '../runtime/window-layout';

interface LayoutPort { minimum():LayoutConstraint; mode():string; pinned():boolean; viewport:boolean }
interface LayoutHistory { tree:LayoutNode|undefined; modes:Map<string,string> }
/** Session-only membership/history. Mutations never move canonical Document edges
 * or application DOM. Persistence maps placement keys to durable restore keys. */
export class WindowLayout {
  private value=createSignal<LayoutNode>();
  private preview=createSignal<LayoutNode>();
  private change=createSignal(0);
  private saved=createSignal(0);
  private historyChanged=createSignal(0);
  private capabilities=createSignal(0);
  private enabled=createSignal(true);
  private selection=createSignal<ReadonlyMap<string,string>>(new Map());
  private message=createSignal('');
  private drop=createSignal<{zone:SnapZone;rect:LayoutRect}>();
  readonly notice=this.message[0]; readonly snapPreview=this.drop[0];
  readonly revision=this.change[0];
  private past:LayoutHistory[]=[];private future:LayoutHistory[]=[];
  private ports=new Map<string,{port:LayoutPort;minimum:LayoutConstraint;mode:string;pinned:boolean}>();
  private returnSlots=new Map<string,{target:string;edge:TileEdge}>();
  private persistent=new Map<string,()=>boolean>();
  private solver=new LayoutSolver();
  private minimumFrame=0;
  private minimumInvalid=new Set<string>();

  private pendingDivider?:{id:string;generation:number};
  private adopted=false;
  private disposeSolution!:()=>void;
  readonly tree=this.value[0];
  readonly solution: Accessor<LayoutSolution>;
  constructor(private manager:WorkspaceWindowManager,private editor:ReactiveEditor){
    this.solution=createRoot(dispose=>{
      this.disposeSolution=dispose;
      return createMemo(()=>{this.capabilities[0]();return this.solve(this.preview[0]()??this.value[0]());});
    });
    const state=editor.repository.readState(),root=state.contents[state.placements[state.rootPlacementKey].contentKey];
    const desktop=desktopOf(root.payload) as any;
    if(desktop?.version===3){
      const anchors=new Map(Object.values(state.placements).map(p=>[state.contents[p.contentKey].payload.id,p.key]));
      const views=new Map(desktop.views.map((v:any)=>[v.restoreKey,v.anchorBlockId]));
      const keys=new Map(desktop.windows.map((w:any)=>[w.restoreKey,anchors.get(views.get(w.view))]));
      this.value[1](mapEntries(desktop.layout.tree,(key:string)=>keys.get(key) as string|undefined));this.adopted=true;
    }
  }
  private id=()=>`layout-${crypto.randomUUID()}`;
  dividerActive(){return !!this.pendingDivider;}
  minimized(id:string){this.capabilities[0]();return this.ports.get(this.key(id)!)?.mode==='minimized';}
  covered(){
    this.capabilities[0]();
    const front=Object.values(this.manager.registry.windows).filter(w=>w.visible&&!w.pinned).sort((a,b)=>b.rank-a.rank)[0];
    return !!front&&this.ports.get(front.placementKey)?.mode==='maximized';
  }
  chromeRank(){
    const members=new Set(entries(this.tree()));
    return Math.max(0,...Object.values(this.manager.registry.windows).filter(w=>w.visible&&!w.pinned&&members.has(w.placementKey)).map(w=>w.rank))*2;
  }
  panelId(key:string){return `mwm-panel-${this.runtime(key)??key}`;}
  private key(id:string){return this.manager.registry.windows[id]?.placementKey;}
  private runtime(key:string){return Object.values(this.manager.registry.windows).find(w=>w.placementKey===key)?.id;}
  setEnabled(value:boolean){this.enabled[1](value);if(!value)this.cancel();}
  active=()=>this.enabled[0]();
  dirty=()=>this.change[0]()!==this.saved[0]();
  markSaved(revision:number){if(revision===this.change[0]())this.saved[1](revision);}
  hasLayout(){return this.adopted||!!this.value[0]();}
  isTiled(id:string){const key=this.key(id);return !!key&&entries(this.value[0]()).includes(key);}
  rectangle(id:string):LayoutRect|undefined {const key=this.key(id);return this.active()&&key?this.solution().rectangles[key]:undefined;}
  hidden(id:string){
    this.capabilities[0]();
    const key=this.key(id),port=key?this.ports.get(key):undefined;
    return this.active()&&!!key&&port?.mode!=='minimized'&&port?.mode!=='maximized'&&entries(this.value[0]()).includes(key)&&!this.solution().rectangles[key];
  }
  private input(){
    const constraints=new Map<string,LayoutConstraint>(),excluded=new Set<string>();
    for(const [key,p] of this.ports){constraints.set(key,p.minimum);if(p.mode==='minimized'||p.mode==='closed')excluded.add(key);}
    return {constraints,excluded};
  }
  private solve(tree:LayoutNode|undefined,normal:string[]=[]){
    const {constraints,excluded}=this.input();
    for(const id of normal)excluded.delete(this.key(id)!);
    // Candidate normalizations require a separate cache generation from the
    // live minimized exclusions, without publishing intermediate geometry.
    return (normal.length?new LayoutSolver():this.solver).solve(tree,this.manager.geometry.bounds(),constraints,excluded,this.capabilities[0](),this.selection[0]());
  }
  register(id:string,port:LayoutPort){
    const key=this.key(id);if(!key)return ()=>{};
    const entry={port,minimum:port.minimum(),mode:port.mode(),pinned:port.pinned()};
    this.ports.set(key,entry);this.capabilities[1](n=>n+1);
    return ()=>{
      if(this.ports.get(key)!==entry)return;
      this.ports.delete(key);this.capabilities[1](n=>n+1);this.cancel();
      // Structural deletion is also a close, but a different presentation
      // unmounting this frame must retain its desktop membership.
      if(!this.editor.repository.state.placements[key])this.close(id,key);
    };
  }
  invalidateMinimum(id:string){
    this.minimumInvalid.add(id);
    if(!this.minimumFrame)this.minimumFrame=requestAnimationFrame(()=>{
      this.minimumFrame=0;
      const ids=[...this.minimumInvalid];this.minimumInvalid.clear();
      for(const key of ids)this.update(key);
    });
  }
  update(id:string){
    const key=this.key(id),p=key&&this.ports.get(key);if(!key||!p)return;
    const minimum=p.port.minimum(),mode=p.port.mode(),pinned=p.port.pinned();
    if(mode===p.mode&&pinned===p.pinned&&minimum.width===p.minimum.width&&minimum.height===p.minimum.height&&minimum.maxWidth===p.minimum.maxWidth&&minimum.maxHeight===p.minimum.maxHeight)return;
    const before=p.pinned;p.minimum=minimum;p.mode=mode;p.pinned=pinned;
    this.cancel();this.capabilities[1](n=>n+1);
    if(pinned!==before){
      this.manager.registry.setPinned(id,pinned);
      if(pinned&&this.isTiled(id)){
        const group=findGroup(this.tree(),key),other=group?.entries.find(k=>k!==key)??entries(this.tree()).find(k=>k!==key);
        if(other)this.returnSlots.set(key,{target:other,edge:group&&group.entries.length>1?'tab':'right'});
        this.commit(removeEntry(this.tree(),key),false);
      }else if(!pinned){const slot=this.returnSlots.get(key);this.returnSlots.delete(key);if(slot&&entries(this.tree()).includes(slot.target))this.transact(()=>insertEntry(this.tree(),key,slot.target,slot.edge,this.id));}
    }
  }
  private participants(){return entries(this.tree()).map(key=>this.runtime(key)).filter((id):id is string=>!!id);}
  private allowed(ids:string[]){
    if(!this.active()||this.manager.lifecycle.workspaceBlocked)return false;
    return ids.every(id=>this.manager.lifecycle.canMinimize(id)&&!this.ports.get(this.key(id)!)?.port.viewport&&!this.manager.registry.windows[id]?.pinned);
  }
  private checkpoint(ids:string[]=[]):LayoutHistory {
    return {tree:this.tree(),modes:new Map(ids.map(id=>[id,this.ports.get(this.key(id)!)?.mode??'normal']))};
  }
  private commit(next:LayoutNode|undefined,history=true,modes=new Map<string,string>()){
    if(next===this.value[0]()){this.cancel();return;}
    if(history){this.past.push(this.checkpoint([...modes.keys()]));this.future=[];}
    this.historyChanged[1](n=>n+1);
    const previous=this.manager.registry.activeWindowId;
    this.manager.lifecycle.remember();this.manager.geometry.cancel();this.cancel();
    batch(()=>{
      this.value[1](next);this.change[1](n=>n+1);this.selection[1](new Map());this.message[1]('');
      for(const [id,state] of modes)this.setMode(id,state);
    });
    this.adopted=true;
    // Let visibility effects settle, then repair focus only if no newer user
    // action has acquired a focus lease in the meantime.
    const valid=this.manager.lifecycle.ticket();
    queueMicrotask(()=>{
      if(!valid()||!previous||this.manager.registry.windows[previous]?.visible)return;
      const next=entries(this.tree()).map(key=>this.runtime(key)).find(id=>id&&this.manager.registry.windows[id]?.visible);
      if(next)this.manager.lifecycle.activate(next);
    });
  }
  private transact(build:()=>LayoutNode|undefined,normal:string[]=[]){
    try{
      const next=build();
      const affected=[...new Set([...entries(this.tree()),...entries(next)])].map(key=>this.runtime(key)).filter((id):id is string=>!!id);
      if(!this.allowed(affected))throw Error("Finish composition, dialogs or pending close requests before changing this layout.");
      const allowed=new Set(Object.values(this.manager.registry.windows).map(w=>w.placementKey));validateLayout(next,allowed);
      const result=this.solve(next,normal);if(result.unsatisfiable.length)throw Error('This split cannot fit the window minimum sizes. Add the window as a shell tab instead.');
      this.commit(next,true,new Map(normal.map(id=>[id,'normal'])));return true;
    }catch(error){this.cancel();this.message[1](error instanceof Error?error.message:String(error));return false;}
  }
  private setMode(id:string,state:string){
    const node=this.editor.node(id),metadata=node?.payload.metadata as any;
    if(node&&(metadata?.state??'normal')!==state)this.editor.commands.setPayloadField(id,'metadata',{...unwrap(metadata??{}),state},'Arrange Window');
  }
  snap(id:string,zone:SnapZone){if(!this.allowed([id]))return false;const key=this.key(id)!;const ok=this.transact(()=>snapTree(this.tree(),key,zone,this.id),[id]);if(ok)this.activate(id);return ok;}
  tile(id:string,target:string,edge:TileEdge){if(!this.allowed([id,target]))return false;const ok=this.transact(()=>insertEntry(this.tree(),this.key(id)!,this.key(target)!,edge,this.id),[id,target]);if(ok)this.activate(id);return ok;}
  float(id:string){if(!this.allowed([...this.participants(),id]))return false;this.commit(removeEntry(this.tree(),this.key(id)!));this.activate(id);return true;}
  close(id:string,placement?:string){const key=placement??this.key(id);if(key){this.commit(removeEntry(this.tree(),key));this.past=[];this.future=[];this.historyChanged[1](n=>n+1);this.returnSlots.delete(key);}}
  private activate(id:string){this.selectWindow(id);this.manager.lifecycle.activate(id);}
  selectWindow(id:string){
    const key=this.key(id);if(!key||!this.active())return;
    const hidden=this.hidden(id);if(!hidden||!this.allowed(this.participants()))return;
    const temporary=this.solution().tabs.find(g=>g.temporary&&g.entries.includes(key));
    if(temporary){this.manager.lifecycle.remember();this.selection[1](old=>new Map(old).set(temporary.id,key));return;}
    const group=findGroup(this.tree(),key);if(group&&group.active!==key)this.commit(updateNode(this.tree(),group.id,n=>n.kind==='tabs'?{...n,active:key}:n));
  }
  select(group:string,key:string){const id=this.runtime(key);if(!id||!this.allowed(this.participants()))return;this.manager.lifecycle.remember();
    const current=this.solution().tabs.find(g=>g.id===group);if(!current)return;
    if(current.active===key){this.manager.lifecycle.activate(id);return;}
    if(current.temporary)this.selection[1](old=>new Map(old).set(group,key));
    else this.commit(updateNode(this.tree(),group,n=>n.kind==='tabs'?{...n,active:key}:n));
    this.manager.lifecycle.activate(id);
  }
  title(key:string){const id=this.runtime(key);return id?this.manager.title(id):'Window';}
  canUndo=()=>{this.historyChanged[0]();return !!this.past.length;};canRedo=()=>{this.historyChanged[0]();return !!this.future.length;};
  undo(){return this.travel(this.past,this.future);}redo(){return this.travel(this.future,this.past);}
  private travel(from:LayoutHistory[],to:LayoutHistory[]){
    if(!from.length)return false;
    const target=from[from.length-1],next=target.tree;
    const affected=[...new Set([...entries(this.tree()),...entries(next)])].map(key=>this.runtime(key)).filter((id):id is string=>!!id);
    affected.push(...target.modes.keys());
    if(!this.allowed(affected))return false;
    try{validateLayout(next,new Set(Object.values(this.manager.registry.windows).map(w=>w.placementKey)));}catch{this.message[1]('Layout history refers to a closed window.');return false;}
    from.pop();to.push(this.checkpoint([...target.modes.keys()]));this.commit(next,false,target.modes);return true;
  }
  beginDivider(id:string){if(!this.allowed(this.participants())||!this.solution().dividers.some(d=>d.id===id))return false;this.manager.geometry.cancel();this.cancel();this.pendingDivider={id,generation:this.change[0]()};this.preview[1](this.tree());return true;}
  divider(id:string,ratio:number){const pending=this.pendingDivider;if(!pending||pending.id!==id||pending.generation!==this.change[0]())return;
    const divider=this.solution().dividers.find(d=>d.id===id);if(!divider)return;
    const next=Math.min(divider.maximum,Math.max(divider.minimum,ratio));
    this.preview[1](tree=>updateNode(tree,id,n=>n.kind==='split'?{...n,ratio:Math.min(.999999,Math.max(.000001,next))}:n));
  }
  commitDivider(){const tree=this.preview[0](),pending=this.pendingDivider;if(pending&&pending.generation===this.change[0]()&&this.allowed(this.participants()))this.transact(()=>tree);else this.cancel();}
  cancel(){this.pendingDivider=undefined;this.preview[1](undefined);this.drop[1](undefined);}
  cancelSnap(){this.drop[1](undefined);}
  previewSnap(id:string,x:number,y:number){
    if(!this.allowed([id])||this.isTiled(id))return;
    const zone=snapAt({x,y},this.manager.geometry.bounds(true));if(!zone){this.drop[1](undefined);return;}
    const key=this.key(id)!,candidate=snapTree(this.tree(),key,zone,this.id),solved=this.solve(candidate),rect=solved.rectangles[key];
    this.drop[1](!solved.unsatisfiable.length&&rect?{zone,rect}:undefined);
  }
  finishSnap(id:string){const drop=this.drop[0]();this.drop[1](undefined);return drop?this.snap(id,drop.zone):false;}
  persistable(id:string,read:()=>boolean){this.persistent.set(id,read);return ()=>this.persistent.delete(id);}
  capture(mapping:Map<string,string>){
    if(this.pendingDivider)throw Error('Finish or cancel the divider interaction before saving the Workspace.');
    const excluded=new Set<string>();for(const [id,read] of this.persistent)if(!read()){const key=this.key(id);if(key)excluded.add(key);}
    for(const key of entries(this.tree()))if(!excluded.has(key)&&!mapping.has(key))throw Error('A shell layout window has no durable descriptor. Resolve the layout before saving.');
    if(entries(this.tree()).some(key=>excluded.has(key)))this.message[1]('Application drafts remain open, but their shell layout slots will not return after reopening.');
    return {revision:this.change[0](),tree:mapEntries(this.tree(),key=>excluded.has(key)?undefined:mapping.get(key))};
  }
  dispose(){this.cancel();if(this.minimumFrame)cancelAnimationFrame(this.minimumFrame);this.minimumInvalid.clear();this.disposeSolution();this.ports.clear();this.persistent.clear();this.past=[];this.future=[];}
}
