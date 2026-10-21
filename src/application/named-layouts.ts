import { batch, createSignal, createEffect } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { WorkspaceWindowManager } from './window-manager';
import { desktopOf, type ManagedDesktop, type NamedArrangement, type RestoreView, type RestoreWindow } from '../persistence/managed-desktop';
import { entries, mapEntries } from '../runtime/window-layout';

/** Arrangement snapshots use placement keys only inside this session. Conversion to
 * durable keys occurs on explicit Workspace Save. No application state is copied. */
export class NamedLayouts {
  private list = createSignal<NamedArrangement[]>([]);
  readonly arrangements = this.list[0];
  private selected = createSignal<string>();
  readonly active = this.selected[0];
  private changed = createSignal(0); private saved = createSignal(0);
  readonly revision = this.changed[0];
  private concealed = createSignal<ReadonlySet<string>>(new Set());
  private adopted = false;
  private descriptors = new Map<string, () => Partial<RestoreView> | undefined>();
  private initial = new Map<string, RestoreView>();
  private initialActive?: string;
  private disposed = false;
  private noticeSignal = createSignal(''); readonly notice = this.noticeSignal[0];
  constructor(private manager: WorkspaceWindowManager, private editor: ReactiveEditor) {
    const state=editor.repository.readState(), root=state.contents[state.placements[state.rootPlacementKey].contentKey];
    const d=desktopOf(root.payload);
    const anchors=new Map(Object.values(state.placements).map(p=>[state.contents[p.contentKey].payload.id,p.key]));
    for(const v of d?.views??[]){const key=anchors.get(v.anchorBlockId);if(key)this.initial.set(key,v);}
    if(d?.version!==4)return;
    this.adopted=true;
    const keys=new Map(d.windows.map(w=>[w.restoreKey,anchors.get(d.views.find(v=>v.restoreKey===w.view)!.anchorBlockId)!]));
    const convert=(a:NamedArrangement):NamedArrangement=>({...a,windows:a.windows.map(w=>({...w,restoreKey:keys.get(w.restoreKey)!,view:keys.get(w.restoreKey)!})),layout:this.remapLayout(a.layout,k=>keys.get(k)),...(a.lastActive?{lastActive:keys.get(a.lastActive)}:{})});
    this.list[1]((d.layouts??[]).map(convert));this.selected[1](d.activeLayout);this.initialActive=d.lastActive&&keys.get(d.lastActive);
  }
  enabled(){return this.adopted || [...this.descriptors.values()].some(read=>read()?.resources?.some(r=>r.kind==='proposition'));}
  dirty=()=>this.revision()!==this.saved[0]();
  markSaved(revision:number){if(revision===this.revision())this.saved[1](revision);}
  private touch(){this.adopted=true;this.changed[1](n=>n+1);}
  descriptor(id:string){const key=this.manager.registry.windows[id]?.placementKey;return key?this.initial.get(key):undefined;}
  registerDescriptor(id:string,read:()=>Partial<RestoreView>|undefined){this.descriptors.set(id,read);let previous:string|undefined;
    createEffect(()=>{const value=JSON.stringify(read());if(previous!==undefined&&previous!==value)this.touch();previous=value;});
    return ()=>this.descriptors.delete(id);}
  hidden(key:string){return this.concealed[0]().has(key);}
  reveal(key:string){if(this.hidden(key)){this.concealed[1](old=>{const next=new Set(old);next.delete(key);return next;});this.touch();}}
  private remapLayout(layout:ManagedDesktop['layout'],key:(s:string)=>string|undefined):ManagedDesktop['layout'] {
    const tree=mapEntries(layout.tree,key), map=(items:string[])=>items.map(key).filter((s):s is string=>!!s);
    const result={...layout,kind:'split-tree' as const,version:1 as const,normalOrder:map(layout.normalOrder),pinnedOrder:map(layout.pinnedOrder),floating:map(layout.floating??[])};
    delete result.tree;if(tree)result.tree=tree;return result;
  }
  private capture():Omit<NamedArrangement,'id'|'name'|'revision'> & {windows:RestoreWindow[];layout:ManagedDesktop['layout'];lastActive?:string} {
    this.editor.documentSessions?.transfers.assertPersistable();
    if(this.manager.layout.dividerActive())throw Error('Finish or cancel the divider before saving an arrangement.');
    const windows=Object.values(this.manager.registry.windows).filter(w=>!this.hidden(w.placementKey)).sort((a,b)=>a.rank-b.rank).map(w=>{
      const m=unwrap(this.editor.node(w.id)?.payload.metadata??{}) as any;
      return {restoreKey:w.placementKey,view:w.placementKey,layer:w.pinned?'pinned' as const:'normal' as const,state:m.state==='minimized'||m.state==='maximized'?m.state:'normal',bounds:{x:m.position?.x??20,y:m.position?.y??20,width:m.size?.w??840,height:m.size?.h??620}};
    });
    const tree=this.manager.layout.tree(),tiled=new Set(entries(tree));
    const lastActive=this.manager.registry.windows[this.manager.registry.activeWindowId??this.manager.registry.mru.find(id=>this.manager.registry.windows[id]?.visible)??'']?.placementKey;
    return {windows,layout:{kind:'split-tree',version:1,...(tree?{tree:structuredClone(tree)}:{}),floating:windows.filter(w=>!tiled.has(w.restoreKey)).map(w=>w.restoreKey),normalOrder:windows.filter(w=>w.layer==='normal').map(w=>w.restoreKey),pinnedOrder:windows.filter(w=>w.layer==='pinned').map(w=>w.restoreKey)},...(lastActive?{lastActive}:{})};
  }
  save(name:string,id?:string){
    name=name.trim();if(!name||name.length>512)throw Error('Enter an arrangement name (1–512 characters).');
    if(this.arrangements().some(a=>a.id!==id&&a.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('An arrangement already has that name.');
    const old=id?this.arrangements().find(a=>a.id===id):undefined;if(id&&!old)throw Error('Arrangement no longer exists.');
    const next={...old,...this.capture(),id:old?.id??`arrangement-${crypto.randomUUID()}`,name,revision:(old?.revision??0)+1} as NamedArrangement;
    batch(()=>{this.list[1](all=>[...all.filter(a=>a.id!==next.id),next]);this.selected[1](next.id);this.touch();});return next.id;
  }
  rename(id:string,name:string){name=name.trim();if(!name||name.length>512||this.arrangements().some(a=>a.id!==id&&a.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Enter a unique arrangement name.');if(!this.arrangements().some(a=>a.id===id))return;this.list[1](all=>all.map(a=>a.id===id?{...a,name,revision:a.revision+1}:a));this.touch();}
  delete(id:string){if(!this.arrangements().some(a=>a.id===id))return;batch(()=>{this.list[1](all=>all.filter(a=>a.id!==id));if(this.active()===id)this.selected[1](undefined);this.touch();});}
  select(id:string){
    if(this.manager.runtime.size){this.noticeSignal[1]('Return or close detached Documents before selecting a named arrangement.');return false;}
    const a=this.arrangements().find(a=>a.id===id);if(!a)return false;
    const records=Object.values(this.manager.registry.windows);
    if(!this.manager.layout.active()||this.manager.lifecycle.workspaceBlocked||records.some(w=>!this.manager.lifecycle.canMinimize(w.id))){this.noticeSignal[1]('Finish composition, dialogs or pending close requests before switching arrangements.');return false;}
    // Validate references before changing geometry. A removed anchor is never recreated.
    const available=new Set(Object.keys(this.editor.repository.state.placements));
    if(a.windows.some(w=>!available.has(w.restoreKey))){this.noticeSignal[1]('This arrangement contains a removed window. Save a new arrangement or remove the unavailable entry.');return false;}
    const members=new Map(a.windows.map(w=>[w.restoreKey,w]));
    this.manager.lifecycle.remember();this.manager.geometry.cancel();this.manager.layout.cancel();
    batch(()=>{
      this.editor.commands.transaction('Select named window arrangement',()=>{
        for(const w of a.windows){const p=this.editor.repository.state.placements[w.restoreKey],c=this.editor.repository.state.contents[p.contentKey],m=unwrap(c.payload.metadata??{}) as any;
          this.editor.commands.setPayloadField(w.restoreKey,'metadata',{...m,position:{x:w.bounds.x,y:w.bounds.y},size:{w:w.bounds.width,h:w.bounds.height},pinned:w.layer==='pinned',state:w.state==='closed'?'normal':w.state},'Select window arrangement');
          this.editor.viewVisibility.set(w.restoreKey,false);
        }
      });
      this.concealed[1](new Set(records.filter(w=>!members.has(w.placementKey)||members.get(w.placementKey)?.state==='closed').map(w=>w.placementKey)));
      this.manager.layout.restore(a.layout.tree);this.selected[1](id);this.touch();this.noticeSignal[1]('Arrangement selected. Existing application sessions remain open. Save Workspace to write these changes.');
    });
    const valid=this.manager.lifecycle.ticket();queueMicrotask(()=>{if(this.disposed||!valid())return;this.order(a.layout);this.focus(a.lastActive);});return true;
  }
  private order(layout:ManagedDesktop['layout']){for(const key of [...layout.normalOrder,...layout.pinnedOrder]){const w=Object.values(this.manager.registry.windows).find(w=>w.placementKey===key);if(w){this.manager.registry.setPinned(w.id,layout.pinnedOrder.includes(key));this.manager.raiseWindow(w.id);}}}
  private focus(key?:string){const records=Object.values(this.manager.registry.windows),target=records.find(w=>w.placementKey===key&&w.visible)??records.filter(w=>w.visible).sort((a,b)=>b.rank-a.rank)[0];if(target)this.manager.lifecycle.activate(target.id);}
  remove(id:string){
    const key=this.manager.registry.windows[id]?.placementKey;if(!key)return;
    if(!this.manager.lifecycle.canMinimize(id))return;
    // Remove presentation entries only; canonical resources are never deleted by
    // a restore placeholder. Shell anchor removal is the existing workspace edit.
    this.editor.commands.remove(id);
    this.list[1](all=>all.map(a=>{const next={...a,revision:a.revision+1,windows:a.windows.filter(w=>w.restoreKey!==key),layout:this.remapLayout(a.layout,k=>k===key?undefined:k)};if(next.lastActive===key)delete next.lastActive;return next;}));this.touch();
  }
  finishRestoration(){if(!this.adopted)return;const valid=this.manager.lifecycle.ticket();queueMicrotask(()=>{if(!this.disposed&&valid())this.focus(this.initialActive);});}
  captureInto(desktop:ManagedDesktop,mapping:Map<string,string>){
    const views=new Map(desktop.windows.map(w=>[w.restoreKey,w.view]));
    for(const [id,read] of this.descriptors){const key=this.manager.registry.windows[id]?.placementKey,wire=key&&mapping.get(key),view=desktop.views.find(v=>v.restoreKey===views.get(wire!));const descriptor=read();if(view&&descriptor)Object.assign(view,descriptor);}
    const allowed=new Set([...mapping.keys()].filter(key=>{const id=Object.values(this.manager.registry.windows).find(w=>w.placementKey===key)?.id;return !id||this.manager.layout.canPersist(id);}));
    const convert=(a:NamedArrangement):NamedArrangement=>{
      const key=(k:string)=>allowed.has(k)?mapping.get(k):undefined;
      const windows=a.windows.filter(w=>key(w.restoreKey)).map(w=>({...w,restoreKey:key(w.restoreKey)!,view:views.get(key(w.restoreKey)!)!}));
      const next={...a,windows,layout:this.remapLayout(a.layout,key)};delete next.lastActive;if(a.lastActive&&key(a.lastActive))next.lastActive=key(a.lastActive);return next;
    };
    const current=this.capture();
    desktop={...desktop,windows:desktop.windows.map(w=>{const key=[...mapping].find(([,wire])=>wire===w.restoreKey)?.[0];return key&&this.hidden(key)?{...w,state:'closed'}:w;})};
    return {...desktop,version:4 as const,layouts:this.arrangements().map(convert),...(this.active()?{activeLayout:this.active()}:{}),...(current.lastActive&&mapping.get(current.lastActive)?{lastActive:mapping.get(current.lastActive)}:{})};
  }
  dispose(){this.disposed=true;this.descriptors.clear();this.initial.clear();}
}
