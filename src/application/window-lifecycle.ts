import type { ReactiveEditor } from '../reactive-editor/editor';
import type { WorkspaceWindowManager } from './window-manager';
import type { MountHandle, NativeTextSelection } from '../runtime/mounts';

type Bookmark = { crossRevisions?:[string,number][]; key?:string; contentKey?:string; revision?:number; cross?: ReturnType<ReactiveEditor["crossText"]["range"]>; element: HTMLElement; handle?: MountHandle; native?: NativeTextSelection; inline?: {anchor:number;head:number}; range?: Range };
type Modal = { id: string; owner?: string; root: HTMLElement; previous?: HTMLElement };
export interface WindowLifecycleEvent { type:"activated"|"deactivated"|"closeRequested"|"closeCancelled"|"closed"|"minimized"|"restored"; windowId:string }
export type CloseGuard = (signal: AbortSignal) => boolean | Promise<boolean>;
const sessions = new WeakMap<Document, WorkspaceWindowManager>();
export const windowManagerForDocument = (document: Document) => sessions.get(document);

/** DOM policy lives outside the ordering registry. No repository subscription or
 * per-keystroke ownership search: native input remains with the existing gateway. */
export class WindowLifecycle {
  private epoch = 0;
  private listeners=new Set<(event:WindowLifecycleEvent)=>void>();
  subscribe(listener:(event:WindowLifecycleEvent)=>void) { this.listeners.add(listener);return ()=>this.listeners.delete(listener); }
  notify(type:WindowLifecycleEvent['type'],windowId:string) { for(const listener of this.listeners)listener({type,windowId}); }
  private readiness = new Map<string,number>();
  private actions = new Map<string,{minimize:()=>void;restore:()=>void}>();
  private commands: (()=>void)[] = [];
  private bookmarks = new Map<string, Bookmark>();
  private modals: Modal[] = [];
  private inert = new Map<HTMLElement,boolean>();
  private pending = new Map<string, AbortController>();
  private guards = new Map<string, Set<CloseGuard>>();
  private composing = false;
  private compositionSettling = false;
  private pointerActive = false;
  private transfers = new Map<symbol, { windows: readonly string[]; cancel: () => void }>();
  holdTransfer(windows: readonly string[], cancel: () => void) {
    const id = Symbol('document-transfer'); this.transfers.set(id, { windows, cancel });
    return () => { this.transfers.delete(id); };
  }
  canTransfer(id: string) { return !!this.manager.registry.windows[id]?.mounted && !this.composing && !this.compositionSettling && !this.pointerActive && !this.blocked(id) && !this.pending.has(id); }

  private deferred?: () => void;
  private cleanup?: () => void;
  constructor(private manager: WorkspaceWindowManager, private editor: ReactiveEditor) {
    for (const action of ['next','previous','minimize','restore','close','move','resize','maximize']) this.commands.push(editor.commandRegistry.register({id:`window.${action}`,label:`${action[0].toUpperCase()+action.slice(1)} window`,canExecute:({targetKey})=>{
      const id=action==='restore' ? manager.ownerForNode(targetKey) ?? manager.registry.activeWindowId : manager.registry.activeWindowId;
      return !!id && (action==='next'||action==='previous' ? !this.workspaceBlocked : !this.blocked(id));
    },execute:({targetKey})=>{
      const id=(action==='restore' ? manager.ownerForNode(targetKey) ?? manager.registry.activeWindowId : manager.registry.activeWindowId)!;
      if(action==='close')return editor.closeView(id);
      if(action==='maximize'){manager.maximize(id);return;}
      if(action==='move'||action==='resize'){manager.geometry.controllers.get(id)?.keyboard(action);return;}
      if(action==='minimize'||action==='restore'){this.actions.get(id)?.[action]();return;}
      const ids=Object.values(manager.registry.windows).filter(w=>w.visible).sort((a,b)=>a.generation-b.generation).map(w=>w.id),index=ids.indexOf(id);
      this.activate(ids[(index+(action==='next'?1:ids.length-1))%ids.length]);
    }},'window-manager'));
  }
  reveal(id:string) {
    if(this.workspaceBlocked)return;
    this.manager.layout.selectWindow(id);
    // A tab switch rejected by a modal/composition/close guard is not a
    // minimized-window restore and must not write a new window mode.
    if(this.manager.layout.hidden(id))return;
    if(!this.manager.registry.windows[id]?.visible)this.actions.get(id)?.restore();else this.activate(id);
  }
  minimize(id:string) { if(this.manager.registry.windows[id]?.visible&&this.canMinimize(id))this.actions.get(id)?.minimize(); }
  cycle(direction=1) { if(this.workspaceBlocked)return; const ids=Object.values(this.manager.registry.windows).filter(w=>w.visible).sort((a,b)=>a.generation-b.generation).map(w=>w.id);if(ids.length)this.activate(ids[(ids.indexOf(this.manager.registry.activeWindowId??this.manager.registry.mru[0])+direction+ids.length)%ids.length]); }
  bindActions(id:string, actions:{minimize:()=>void;restore:()=>void}) { this.actions.set(id,actions); return ()=>this.actions.delete(id); }
  readyTicket(id:string) { const version=this.readiness.get(id)??0,generation=this.manager.registry.windows[id]?.generation; return ()=>!!generation && this.manager.registry.windows[id]?.generation===generation && (this.readiness.get(id)??0)===version; }
  private cancelReadiness(except?:string) { for(const id of Object.keys(this.manager.registry.windows))if(id!==except)this.readiness.set(id,(this.readiness.get(id)??0)+1); }
  canCommand(key:string,commandId?:string) {
    if(commandId==='window.next'||commandId==='window.previous')return !this.workspaceBlocked;
    if (!this.modals.length) return true;
    const mount=this.editor.mounts.get(key), owner=mount ? this.owner(mount.root) : this.manager.ownerForNode(key);
    return !this.blocked(owner,mount?.root);
  }
  get generation() { return this.epoch; }
  get workspaceBlocked() { return this.modals.some(modal=>!modal.owner); }
  ticket() { const epoch = this.epoch; return () => epoch === this.epoch; }
  owner(element: Element | null) { return element?.closest<HTMLElement>('[data-mwm-window]')?.dataset.mwmWindow; }
  private blocked(owner?: string, target?: Element | null) {
    if (!this.modals.length) return;
    return [...this.modals].reverse().find(m => (!m.owner || m.owner === owner) && !this.belongs(m,target));
  }
  private belongs(modal: Modal, target?: Element | null) { return !!target && (modal.root.contains(target) || target.closest<HTMLElement>('[data-mwm-modal]')?.dataset.mwmModal === modal.id); }
  refreshInert() {
    for(const [element,was] of this.inert)element.inert=was;this.inert.clear();
    const seen=new Set<string>();
    for(const modal of [...this.modals].reverse()) {
      const scope=modal.owner??'workspace';if(seen.has(scope))continue;seen.add(scope);
      const root=modal.owner?this.manager.groups.get(modal.owner):document.body;if(!root)continue;
      const allowed=[modal.root,...Array.from(root.querySelectorAll<HTMLElement>('[data-mwm-modal]')).filter(e=>e.dataset.mwmModal===modal.id)];
      const visit=(element:HTMLElement)=>{
        if(allowed.some(a=>a===element||a.contains(element)))return;
        if(allowed.some(a=>element.contains(a))) { for(const child of element.children)if(child instanceof HTMLElement)visit(child); }
        else {if(!this.inert.has(element))this.inert.set(element,element.inert);element.inert=true;}
      };visit(root);
      if(!modal.owner)break;
    }
  }
  permits(element: Element) { return !this.blocked(this.owner(element), element); }
  focusAllowed(key: string) {
    const handle = this.editor.mounts.get(key);
    if(!handle)return true;
    const owner=this.owner(handle.root);
    const icon=owner===key && !!handle.root.querySelector('[data-window-icon]');
    return !handle.focusElement.closest("[hidden], [inert]") && this.permits(handle.focusElement) && (!owner || !!this.manager.registry.windows[owner]?.visible || icon);
  }
  uninstall() { this.cleanup?.(); this.cleanup=undefined; }
  install(document: Document) {
    this.uninstall();
    sessions.set(document, this.manager);
    this.editor.commandRegistry.permit = (key,id) => this.canCommand(key,id);
    this.editor.focus.permit = key => this.focusAllowed(key);
    this.editor.overlays.focusLease = () => this.ticket();
    const pointer = (event: Event) => {
      this.pointerActive = true;
      const target = event.target instanceof Element ? event.target : null;
      const owner = this.owner(target), modal = this.blocked(owner, target);
      if (modal) { event.preventDefault(); event.stopImmediatePropagation(); this.focusModal(modal); return; }
      // Capture BEFORE the browser relocates the caret. Never restore over a click.
      this.remember(); this.invalidate(); this.cancelReadiness();
      if (owner) {
        this.manager.raiseWindow(owner);
        if(owner!==this.manager.registry.activeWindowId && !target?.closest('input,textarea,select,button,a[href],[contenteditable="true"],iframe,[tabindex="0"]:not(.reactive-window__header):not([data-window-move])'))this.activate(owner);
      }
    };
    const focus = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const owner = this.owner(target), modal = this.blocked(owner, target);
      if (modal) { event.stopImmediatePropagation(); this.focusModal(modal); return; }
      if (owner !== this.manager.registry.activeWindowId) { this.cancelReadiness(owner); this.invalidate(); if (owner) this.manager.raiseWindow(owner); }
      const previous=this.manager.registry.activeWindowId;
      const eligible=owner && this.manager.registry.windows[owner]?.visible ? owner : undefined;
      this.manager.registry.observeFocus(eligible);
      if(previous!==eligible) { if(previous)this.notify('deactivated',previous);if(eligible)this.notify('activated',eligible); }
    };
    const blur = (event: FocusEvent) => this.remember(event.target instanceof HTMLElement ? event.target : undefined);
    const key = (event: Event) => {
      if(event.type==='beforeinput' && this.pending.size && event.target instanceof Element) {const owner=this.owner(event.target);if(owner)this.cancel(owner);}
      if (event instanceof KeyboardEvent && event.key === 'Escape' && !event.defaultPrevented && !this.composing && !this.modals.length) {
        const owner = this.owner(event.target instanceof Element ? event.target : null) ?? this.manager.registry.activeWindowId;
        const transfers = [...this.transfers.values()].filter(t => owner && t.windows.includes(owner));
        if (transfers.length) { event.preventDefault(); event.stopImmediatePropagation(); for (const transfer of transfers) transfer.cancel(); return; }
      }
      if (!this.modals.length) return;
      const target = event.target instanceof Element ? event.target : null;
      const modal = this.blocked(this.owner(target), target);
      if (modal) { event.preventDefault(); event.stopImmediatePropagation(); this.focusModal(modal); return; }
      if(event instanceof KeyboardEvent && event.key==='Tab') {
        const current=[...this.modals].reverse().find(m=>this.belongs(m,target));if(!current)return;
        const controls=Array.from(current.root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')).filter(e=>!e.closest('[inert],[hidden]'));
        const first=controls[0],last=controls.at(-1);
        if(!first || event.shiftKey&&(target===first||target===current.root) || !event.shiftKey&&target===last) {event.preventDefault();event.stopImmediatePropagation();(event.shiftKey?last:first)?.focus();}
      }
    };
    const frameFocus=()=>queueMicrotask(()=>{const element=document.activeElement;if(element instanceof HTMLIFrameElement){const owner=this.owner(element);if(owner&&this.permits(element)){this.cancelReadiness(owner);this.manager.registry.observeFocus(owner);}}});
    window.addEventListener('blur',frameFocus);
    const start = () => { this.composing = true; this.compositionSettling = false; };
    const end = () => { this.composing = false; this.compositionSettling = true; queueMicrotask(() => { this.compositionSettling = false; }); const next = this.deferred; this.deferred = undefined; queueMicrotask(() => next?.()); };
    const pointerEnd = () => { this.pointerActive = false; };
    document.addEventListener('pointerup', pointerEnd, true); document.addEventListener('pointercancel', pointerEnd, true);
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('focusin', focus, true); document.addEventListener('focusout', blur, true);
    document.addEventListener('keydown', key, true); document.addEventListener('beforeinput', key, true);
    document.addEventListener('compositionstart', start, true); document.addEventListener('compositionend', end, true);
    this.cleanup = () => {
      window.removeEventListener('blur',frameFocus);
      document.removeEventListener('pointerup', pointerEnd, true); document.removeEventListener('pointercancel', pointerEnd, true); this.pointerActive = false;
      document.removeEventListener('pointerdown', pointer, true); document.removeEventListener('focusin', focus, true); document.removeEventListener('focusout', blur, true);
      document.removeEventListener('keydown', key, true); document.removeEventListener('beforeinput', key, true); document.removeEventListener('compositionstart', start, true); document.removeEventListener('compositionend', end, true);
      if (sessions.get(document) === this.manager) sessions.delete(document);
      this.editor.commandRegistry.permit = undefined; this.editor.focus.permit = undefined; this.editor.overlays.focusLease = undefined;
    };
  }
  invalidateHostFocus() { this.invalidate(); this.cancelReadiness(); }
  private invalidate() { this.epoch++; this.editor.focus.cancelPending(); this.deferred = undefined; }
  remember(element: Element | null = document.activeElement) {
    if (!(element instanceof HTMLElement)) return;
    const id = this.owner(element); if (!id || !this.manager.registry.windows[id]?.visible) return;
    const resolved = this.editor.mounts.resolveElement(element), handle = resolved?.handle;
    // Chrome buttons must not replace the last editor/tool bookmark.
    if (element.closest('.reactive-window__header')) return;
    const selection = document.getSelection(), node=resolved && this.editor.node(resolved.nodeKey);
    const cross=this.editor.crossText.range();
    const crossRevisions=cross ? [cross.anchor.contentKey,cross.head.contentKey].map(key=>[key,this.editor.repository.state.contents[key]?.revision] as [string,number]) : undefined;
    this.bookmarks.set(id, { crossRevisions, element, handle, key:resolved?.nodeKey,contentKey:node?.contentKey,revision:node ? this.editor.repository.state.contents[node.contentKey]?.revision : undefined, cross: this.editor.crossText.range(), native: handle?.captureSelection?.() ?? ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.selectionStart !== null ? {start:element.selectionStart,end:element.selectionEnd!,direction:element.selectionDirection ?? "none"} : undefined), inline: handle?.captureInlineSelection?.(),
      range: selection?.rangeCount && element.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : undefined });
  }
  activate(id: string, restore = true) {
    if (!this.composing && !this.blocked(id)) this.manager.layout.selectWindow(id);
    const record = this.manager.registry.windows[id]; if (!record?.visible) return false;
    const modal = this.blocked(id);
    if (modal && !modal.owner) { this.focusModal(modal); return false; }
    if (this.composing) { this.deferred = () => this.activate(id, restore); return false; }
    this.remember(); this.cancelReadiness(id); this.invalidate(); this.manager.raiseWindow(id);
    if (!restore) return true;
    if (modal) { this.focusModal(modal); return true; }
    const bookmark = this.bookmarks.get(id);
    const mount=bookmark?.key ? this.editor.mounts.get(bookmark.key) : undefined;
    const element=bookmark?.element.isConnected ? bookmark.element : mount?.focusElement;
    if (bookmark && element?.isConnected && !element.closest("[hidden], [inert]") && this.groupsContains(id,element)) {
      element.focus({preventScroll:true});
      const current=bookmark.contentKey ? this.editor.repository.state.contents[bookmark.contentKey]?.revision===bookmark.revision : bookmark.element===element;
      if (current) {
        const handle=mount ?? bookmark.handle;
        if (bookmark.native) {
          if (handle?.restoreSelection) handle.restoreSelection(bookmark.native);
          else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.setSelectionRange(bookmark.native.start,bookmark.native.end,bookmark.native.direction);
        }
        if (bookmark.inline) handle?.restoreInlineSelection?.(bookmark.inline);
        else if (bookmark.range?.startContainer.isConnected && bookmark.range.endContainer.isConnected) {
          const selection=document.getSelection(); selection?.removeAllRanges();selection?.addRange(bookmark.range);
        }
        if (bookmark.cross && bookmark.crossRevisions?.every(([key,revision])=>this.editor.repository.state.contents[key]?.revision===revision)) { try { this.editor.crossText.set(bookmark.cross.anchor,bookmark.cross.head); } catch { this.editor.crossText.clear(); } }
      }
    } else this.editor.focus.request(id, {reason:'activate-window'});
    return true;
  }
  private groupsContains(id: string, element: Element) { return this.manager.groups.get(id)?.contains(element) || element.matches('[data-cross-text-input]') && this.editor.documentSessions?.forElement(element)?.host.windowId === id; }
  private focusModal(modal: Modal) { (modal.root.querySelector<HTMLElement>('input:not(:disabled),button:not(:disabled),[tabindex="0"]') ?? modal.root).focus({preventScroll:true}); }
  modal(root: HTMLElement, owner?: string, parentSurfaceId?: string, existingId?: string) {
    const id = existingId ?? this.manager.nextSurfaceId(), previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const release = existingId ? () => {} : this.manager.registry.registerSurface({id,ownerWindowId:owner,sourceViewId:owner ? this.manager.registry.windows[owner].sourceViewId : 'workspace-shell',parentSurfaceId,kind:'dialog',modality:owner?'window':'workspace'});
    const modal = {id,owner,root,previous}; this.modals.push(modal); this.invalidate(); this.refreshInert();
    return () => {
      const wasTop = this.modals.at(-1) === modal;
      this.modals = this.modals.filter(m => m !== modal); release(); this.refreshInert();
      const valid = this.ticket();
      queueMicrotask(() => { if (wasTop && valid() && previous?.isConnected && this.permits(previous)) previous.focus({preventScroll:true}); });
    };
  }
  guard(id: string, guard: CloseGuard) {
    this.cancel(id);
    const set = this.guards.get(id) ?? new Set(); set.add(guard); this.guards.set(id,set);
    return () => { set.delete(guard); if (!set.size) this.guards.delete(id); };
  }
  cancel(id: string) { const pending=this.pending.get(id);if(!pending)return;pending.abort();this.pending.delete(id);this.notify('closeCancelled',id); }
  close(id: string, commit: () => void): void | Promise<void> {
    for (const transfer of this.transfers.values()) if (transfer.windows.includes(id)) transfer.cancel();
    if (this.pending.has(id) || this.blocked(id) || this.composing) return;
    const generation = this.manager.registry.windows[id]?.generation; if (!generation) return;
    const controller = new AbortController(); this.pending.set(id,controller);this.notify('closeRequested',id);
    const cancel=()=>{if(this.pending.get(id)===controller)this.cancel(id);};
    const guards = [...(this.guards.get(id) ?? [])];
    const appGuard = this.editor.viewCloseGuards.get(id); if (appGuard) guards.push(appGuard);
    const current = () => !controller.signal.aborted && this.manager.registry.windows[id]?.generation === generation;
    const finish = () => { if (!current()) return; this.remember(); const active = this.manager.registry.activeWindowId === id; this.pending.delete(id);
      this.editor.focus.cancelPending();
      for(const overlay of [...this.editor.overlays.overlays])if(this.manager.ownerForNode(overlay.ownerKey)===id)this.editor.overlays.close(overlay.key,false,true);
      const placement=this.manager.registry.windows[id]?.placementKey;
      commit(); this.manager.layout.close(id,placement); this.notify('closed',id); if (active) this.successor(id); };
    const run = (index: number): void | Promise<void> => {
      if (!current()) return;
      if (index === guards.length) { finish(); return; }
      try {
        const result = guards[index](controller.signal);
        if (typeof result !== "boolean") return Promise.resolve(result).then(ok => { if (ok) return run(index+1); cancel(); }, () => { cancel(); });
        if (result) return run(index+1); cancel();
      } catch { cancel(); }
    };
    return run(0);
  }
  canMinimize(id: string) {
    return !!this.manager.registry.windows[id]?.mounted && !this.composing && !this.blocked(id) && !this.pending.has(id) && ![...this.transfers.values()].some(t => t.windows.includes(id));
  }
  successor(exclude: string) { const next = this.manager.registry.successor(exclude); if (next) this.activate(next); else { this.invalidate(); this.manager.registry.observeFocus(); (document.activeElement as HTMLElement)?.blur?.(); } }
  release(id: string) { this.cancel(id); this.bookmarks.delete(id); this.guards.delete(id); this.readiness.delete(id); this.actions.delete(id); this.modals = this.modals.filter(m => m.owner !== id); this.refreshInert(); }
  dispose() { for (const transfer of this.transfers.values()) transfer.cancel(); this.transfers.clear(); this.commands.splice(0).forEach(stop=>stop()); this.uninstall(); this.invalidate(); for (const id of this.pending.keys()) this.cancel(id); this.bookmarks.clear(); this.modals = []; this.refreshInert(); this.guards.clear(); this.listeners.clear(); }
}
