import { For, Show, createEffect, createSignal, onMount, untrack } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { DocumentSessionStore, RetainedDocumentSession } from './document-sessions';
import type { DocumentHostLease, TransferOptions } from './document-host-transfers';
import { nativeDocumentSession } from '../persistence/native-session';
import { identityCoordinates } from '../runtime/local-coordinates';
import { WindowView } from '../rendering/core-block-views';
import { ApplicationSurfaceBoundary } from '../rendering/window-manager';
import './document-detachment.css';

type Source = { select(): void; departed(): void; closed(): void; alive(): boolean };
export interface DetachedDocument {
  id: string; session: RetainedDocumentSession; source: DocumentHostLease; origin: Source;
  controller: AbortController; destination?: DocumentHostLease; ready: Promise<void>; connected(): void;
  state: { pending: boolean; error: string; saveAs: boolean; closePrompt: boolean; folder: string; filename: string; saving: boolean };
  set: ReturnType<typeof createStore<DetachedDocument['state']>>[1];
  node: NonNullable<ReturnType<ReactiveEditor['node']>>; patch(value: Record<string, unknown>): void;
  decide?(value: boolean): void; disposeGuard?: () => void;
}
/** Product adapter over E1.2. Shells are runtime-only managed Document windows. */
export class DocumentDetachment {
  private list = createSignal<DetachedDocument[]>([]);
  readonly windows = this.list[0];
  private notice = createSignal(''); readonly message = this.notice[0];
  get native() { return nativeDocumentSession(this.editor); }
  constructor(readonly store: DocumentSessionStore, readonly editor: ReactiveEditor) {}
  resource(s: RetainedDocumentSession) { const n=s.projection.node(s.rootKey); return String((n?.payload.metadata as any)?.documentId??n?.payload.id??''); }
  title(s: RetainedDocumentSession) { const n=s.projection.node(s.rootKey); return String((n?.payload.metadata as any)?.title??n?.payload.id??'Document'); }
  forSession(s?: RetainedDocumentSession) { return s && this.windows().find(w=>w.session===s); }
  forSlot(owner: string, slot: string) { this.store.transfers.observe(); return this.store.sessions().find(s=>this.store.transfers.atOrigin(s)&&s.host.ownerKey===owner&&s.host.slotKey===slot) ?? this.windows().find(w=>w.source.port.ownerKey===owner&&w.source.port.slotKey===slot)?.session; }
  detached(s?: RetainedDocumentSession) { return !!s && !this.store.transfers.atOrigin(s); }
  reason(s?: RetainedDocumentSession) { if(!this.editor.features.nativeDocumentPersistence)return 'Native Document persistence must be enabled for standalone Documents.'; return !s ? 'Select this Document to prepare its retained view.' : this.store.transfers.eligibility(s); }
  canReturn(w: DetachedDocument) { this.store.transfers.observe(); return w.origin.alive() && !!this.editor.windowManager!.registry.windows[w.source.port.windowId] && w.source.current() && w.source.port.container.isConnected; }
  reveal(s: RetainedDocumentSession) { this.editor.windowManager!.lifecycle.reveal(s.host.windowId); }
  async detach(s: RetainedDocumentSession, origin: Source, options: TransferOptions = {}) {
    if(this.forSession(s)) { this.reveal(s); return; }
    const reason=this.reason(s);if(reason){this.notice[1](reason);throw Error(reason);}
    const source=this.store.transfers.current(s)!, id=`document-host:${crypto.randomUUID()}`;
    const [state,set]=createStore({pending:true,error:'',saveAs:false,closePrompt:false,folder:'.',filename:'Document.mutable.json',saving:false});
    const [node,patchNode]=createStore({key:id,viewId:s.projection.viewId,contentKey:id,placementKey:id,viewType:'document-window-block',children:[],ownedRelations:{},payload:{id,type:'document-window-block',metadata:{title:this.title(s),position:{x:60,y:70},size:{w:840,h:620},state:'normal'}}} as unknown as DetachedDocument['node']);
    let connected!:()=>void;const ready=new Promise<void>(resolve=>connected=resolve);
    const w:DetachedDocument={id,session:s,source,origin,controller:new AbortController(),ready,connected,state,set,node,patch:value=>patchNode('payload','metadata',value as any)};
    this.editor.windowManager!.runtime.set(id,{sessionId:s.id,node:()=>node,patch:w.patch,close:()=>this.remove(w,true)});
    this.list[1](all=>[...all,w]); this.notice[1]('');
    const abort=()=>w.controller.abort(); s.signal.addEventListener('abort',abort,{once:true}); options.signal?.addEventListener('abort',abort,{once:true});
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      await Promise.race([ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('The Document window could not mount.')),5000);})]);
      if(w.controller.signal.aborted || !s.current())throw Error('Document detach cancelled');
      w.disposeGuard=this.editor.windowManager!.lifecycle.guard(id,signal=>this.guardClose(w,signal));
      await this.store.transfers.transfer(s,w.destination!,{...options,signal:w.controller.signal});
      w.set('pending',false); origin.departed();
      this.store.saveHandlers.set(s.id,()=>this.save(w));
      // Transfer restores eligible focus. Raising does not steal a newer focus.
      this.editor.windowManager!.raiseWindow(id);
      this.notice[1]('Detached Document layout is experimental. Return or close detached windows before saving the Workspace; Document Save remains available.');
      return w;
    } catch(error) {
      const message=String(error);w.set({pending:false,error:message});this.notice[1](message);
      if(!this.store.transfers.recoveryReason(s)) this.remove(w,false);
      throw error;
    } finally {clearTimeout(timer);s.signal.removeEventListener('abort',abort);options.signal?.removeEventListener('abort',abort);}
  }
  async returnToFlint(w: DetachedDocument, options: TransferOptions = {}) {
    if(w.state.pending)return;
    if(!this.canReturn(w)){w.set('error','The originating Flint tab is no longer available. This Document remains independent.');return;}
    w.set({pending:true,error:''});
    w.controller=new AbortController();
    const cancel=()=>w.controller.abort();
    options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)cancel();
    try {
      const focused=document.activeElement as HTMLElement|null, handle=this.editor.mounts.resolveElement(focused)?.handle;
      const inline=handle?.captureInlineSelection?.(), native=handle?.captureSelection?.(), cross=this.editor.crossText.range();
      w.origin.select(); this.editor.windowManager!.lifecycle.reveal(w.source.port.windowId);
      if(focused?.isConnected){focused.focus({preventScroll:true});if(inline)handle?.restoreInlineSelection?.(inline);if(native)handle?.restoreSelection?.(native);if(cross)this.editor.crossText.set(cross.anchor,cross.head);}
      const concealed=!this.editor.windowManager!.registry.windows[w.id]?.visible;
      const focusCurrent=this.editor.windowManager!.lifecycle.ticket();let restore=false;
      await this.store.transfers.transfer(w.session,w.source,{...options,signal:w.controller.signal,sourceMayBeHidden:true,checkpoint:stage=>{
        const result=options.checkpoint?.(stage);
        // Check before the coordinator invalidates old host focus leases at commit.
        if(stage==='commit')restore=focusCurrent();
        return result;
      }});
      if(concealed && restore && options.focus!==false){
        if(focused?.isConnected)focused.focus({preventScroll:true});
        if(inline)handle?.restoreInlineSelection?.(inline);if(native)handle?.restoreSelection?.(native);if(cross)this.editor.crossText.set(cross.anchor,cross.head);
      }
      this.remove(w,false);this.notice[1]('Document returned to Flint.');
    } catch(error) {w.set('error',String(error));this.notice[1](String(error));}
    finally {options.signal?.removeEventListener('abort',cancel);w.set('pending',false);}
  }
  async recover(w: DetachedDocument) {
    try {this.store.transfers.restoreSource(w.session);w.origin.select();this.editor.windowManager!.lifecycle.reveal(w.source.port.windowId);this.remove(w,false);this.notice[1]('The original Document host was restored.');}
    catch(error){w.set('error',`Original host is still unavailable. You can save the retained Document below. ${String(error)}`);}
  }
  async save(w: DetachedDocument, destination?: {folder:string;filename:string}) {
    if(w.state.saving)return;
    const id=this.resource(w.session), location=this.native.location(id);
    if(!location&&!destination){w.set('saveAs',true);return;}
    w.set({saving:true,error:''});
    try {
      // A bound resource always retains its admitted destination. Save As here
      // is the existing first-save workflow, never a hidden relocation/copy.
      const result=await this.native.save(id,location??destination);
      if(!w.session.current())return;
      if(result.phase==='saved')w.set('saveAs',false);
      else w.set('error',this.native.status(id));
    } catch(error){if(w.session.current())w.set('error',String(error));}
    finally {w.set('saving',false);}
  }
  private guardClose(w:DetachedDocument,signal:AbortSignal) {
    if(w.state.pending||w.state.saving||this.native.knowledgeEvidence(this.resource(w.session)).pending){w.set('error','Finish or recover the pending Document Save before closing.');return false;}
    if(!this.native.isDirty(this.resource(w.session)))return true;
    w.set('closePrompt',true);
    return new Promise<boolean>(resolve=>{
      const abort=()=>finish(false);
      const finish=(ok:boolean)=>{signal.removeEventListener('abort',abort);w.decide=undefined;w.set('closePrompt',false);resolve(ok);};
      w.decide=finish;signal.addEventListener('abort',abort,{once:true});if(signal.aborted)finish(false);
    });
  }
  close(s:RetainedDocumentSession) { const w=this.forSession(s);return w&&this.editor.closeView(w.id); }
  private remove(w:DetachedDocument,closed:boolean) {
    w.controller.abort();w.decide?.(false);w.disposeGuard?.();this.store.saveHandlers.delete(w.session.id);
    // Removing the shell releases its current occupant through the store once.
    this.list[1](all=>all.filter(x=>x!==w));
    this.editor.windowManager!.layout.close(w.id,w.id);this.editor.windowManager!.runtime.delete(w.id);
    if(closed&&this.store.transfers.recoveryReason(w.session))this.store.release(w.session);
    if(closed&&w.origin.alive())w.origin.closed();
    if(closed&&!this.windows().length)this.notice[1]("Detached Document window closed.");
  }
  dispose(){for(const w of [...this.windows()])this.remove(w,false);}
}

export function DetachedDocumentWindows(props:{controller:DocumentDetachment}) {
  const c=props.controller;
  return <><Show when={c.windows().length || c.message()}><aside class="document-detachment-notice" role="status">
    {c.windows().length ? 'Experimental detached Documents: return or close them before saving a Workspace or named arrangement. Document Save remains available.' : c.message()}
  </aside></Show><For each={c.windows()}>{w=>{
    createEffect(()=>{const title=c.title(w.session),dirty=c.native.isDirty(c.resource(w.session));untrack(()=>w.patch({title:`${title}${dirty?' •':''}`}));});
    const content=()=>{
      let slot!:HTMLDivElement;
      onMount(()=>{w.destination=c.store.transfers.register({kind:'managed-document',ownerKey:w.id,slotKey:w.id,windowId:w.id,container:slot,scrollport:slot.closest<HTMLElement>('.reactive-window__content')!,coordinates:identityCoordinates,selected:()=>true});w.connected();});
      const Modal=(p:{children:import('solid-js').JSX.Element})=>{
        let root!:HTMLDivElement;onMount(()=>queueMicrotask(()=>{if(root.isConnected)root.querySelector<HTMLElement>('input,button')?.focus();}));
        return <ApplicationSurfaceBoundary><div ref={root} class="detached-document-dialog" role="dialog" aria-label={w.state.closePrompt?'Close unsaved Document':'Save Document As'} onKeyDown={e=>{if(e.key==='Escape'&&!w.state.saving){e.preventDefault();e.stopPropagation();if(w.state.closePrompt)w.decide?.(false);else w.set('saveAs',false);}}}>{p.children}</div></ApplicationSurfaceBoundary>;
      };
      return <><nav class="detached-document-toolbar" data-cross-text-controls>
        <button onPointerDown={e=>e.preventDefault()} disabled={w.state.saving||w.state.pending} onClick={()=>void c.save(w)}>Save Document</button>
        <button disabled={w.state.saving||!!c.native.location(c.resource(w.session))} title="Choose a destination for a Document without a native file. Existing bindings are not relocated." onClick={()=>w.set('saveAs',true)}>Save As…</button>
        <button onPointerDown={e=>e.preventDefault()} disabled={w.state.pending||!c.canReturn(w)} title={c.canReturn(w)?'Move this editing session back to its original tab':'The original Flint tab is no longer available'} onClick={()=>void c.returnToFlint(w)}>Return to Flint</button>
        <Show when={w.state.pending}><button onClick={()=>w.controller.abort()}>Cancel transfer</button></Show>
      </nav><Show when={w.state.error}><p class="detached-document-error" role="alert">{w.state.error}</p></Show>
      <Show when={c.store.transfers.recoveryReason(w.session)}><section role="alert"><strong>Document retained for recovery</strong><p>The original host disappeared. Your editing session is retained. Restore the original host and retry, or use Save to preserve the Document. No replacement editor will be created.</p><button onClick={()=>void c.recover(w)}>Retry original host</button></section></Show>
      <div ref={slot} data-detached-document={w.session.id}/>
      <p role="status">{c.native.status(c.resource(w.session))}</p>
      <Show when={w.state.saveAs}><Modal><h2>Save Document As</h2><label>Folder<input aria-label="Document folder" value={w.state.folder} onInput={e=>w.set('folder',e.currentTarget.value)}/></label><label>Filename<input aria-label="Document filename" value={w.state.filename} onInput={e=>w.set('filename',e.currentTarget.value)}/></label><button disabled={w.state.saving} onClick={()=>void c.save(w,{folder:w.state.folder,filename:w.state.filename})}>Save to destination</button><button disabled={w.state.saving} onClick={()=>w.set('saveAs',false)}>Cancel Save As</button></Modal></Show>
      <Show when={w.state.closePrompt}><Modal><h2>Close unsaved Document?</h2><p>Closing ends this editing session. It does not save or delete the canonical Document. Unsaved changes remain in this workspace until it is closed.</p><button onClick={()=>w.decide?.(false)}>Keep editing</button><button onClick={()=>w.decide?.(true)}>Close window</button></Modal></Show></>;
    };
    return <WindowView nodeKey={w.id} content={content}/>;
  }}</For></>;
}
