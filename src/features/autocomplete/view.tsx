import { For, Show, createEffect, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import type { ReactiveEditor } from '../../reactive-editor/editor';
import type { PanelSession } from '../../feature-api';
import { useManagedViewActivity, useManagedWindowOwner } from '../../rendering/window-manager';
import type { CompletionSession } from './session';
import type { CompletionScope } from './model';

export function CompletionPopup(props:{editor:ReactiveEditor;panel:PanelSession;cancelled():void}) {
 const data=props.panel.data as {session:CompletionSession;advanced(s:CompletionSession,review?:boolean,authority?:boolean):void},s=data.session;
 const activity=useManagedViewActivity(),owner=useManagedWindowOwner(),[position,setPosition]=createSignal({x:8,y:8}),[external,setExternal]=createSignal(false);
 let root!:HTMLDivElement,input!:HTMLInputElement,frame=0;
 const id=`autocomplete-options-${props.panel.key.replaceAll(':','-')}`;
 const anchor=()=>{
  frame=0;if(!s.alive)return;
  const mount=props.editor.mounts.get(s.source.nodeKey),boundary=mount?.inlineBoundary?.(s.source.end);
  if(!mount?.root.isConnected||mount.root.closest('[hidden],[inert]')){s.close();return;}
  // One caret range per invalidated frame, never a cell sweep or Document measurement.
  let rect:DOMRect|undefined;
  if(boundary){const range=document.createRange();range.setStart(boundary.node,boundary.offset);range.collapse(true);rect=[...range.getClientRects()].find(r=>r.height>0);}
  rect??=mount.root.getBoundingClientRect();const viewport=window.visualViewport,left=viewport?.offsetLeft??0,top=viewport?.offsetTop??0,w=viewport?.width??innerWidth,h=viewport?.height??innerHeight;
  const width=Math.min(460,w-16),height=Math.min(root?.offsetHeight??300,h-16);
  setPosition({x:Math.max(left+8,Math.min(rect.left,left+w-width-8)),y:Math.max(top+8,Math.min(rect.bottom+5,top+h-height-8))});
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(anchor);};
 const eligible=()=>{const a=activity(),active=owner?owner.manager.registry.windows[owner.windowId]?.active:a?.active;return !a||a.mounted&&a.visible&&active;};
 createEffect(()=>{if(!eligible())queueMicrotask(()=>{if(s.alive&&!eligible())s.close();});});
 createEffect(()=>{s.state.revision;s.state.rows.length;s.state.expanded;external();schedule();});
 const expand=()=>{s.expand();queueMicrotask(()=>{input?.focus();input?.setSelectionRange(input.value.length,input.value.length);});};
 const selection=()=>{
  if(!s.alive||s.state.expanded||root?.contains(document.activeElement))return;
  const h=props.editor.mounts.get(s.source.nodeKey),range=h?.captureInlineSelection?.();
  if(document.activeElement!==h?.focusElement||!range||range.anchor!==range.head||range.head!==s.source.end)s.close();else schedule();
 };
 const outside=(event:Event)=>{const target=event.target as Node;if(root?.contains(target))return;const h=props.editor.mounts.get(s.source.nodeKey);if(!h?.root.contains(target))s.close();};
 onMount(()=>{
  onCleanup(props.panel.mountWidget(root,()=>input?.focus()));
  document.addEventListener('selectionchange',selection);document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside,true);window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);schedule();
  if(s.state.expanded)input?.focus();
 });
 onCleanup(()=>{cancelAnimationFrame(frame);document.removeEventListener('selectionchange',selection);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside,true);window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);props.cancelled();});
 const chosen=()=>s.state.rows.find(r=>r.id===s.state.selected);
 return <div ref={root} class="autocomplete-workstation" role="region" aria-label="Autocomplete workstation" style={{left:`${position().x}px`,top:`${position().y}px`}}>
  <header><strong>Autocomplete · {s.state.kind}</strong><button aria-label="Close Autocomplete" onClick={()=>s.close()}>×</button></header>
  <Show when={s.state.expanded} fallback={<button class="autocomplete-query" onPointerDown={e=>e.preventDefault()} onClick={expand}>Query: {s.parsed.query||'Show local candidates'} · Edit independently</button>}>
   <label>Phrase : query<input ref={input} role="combobox" aria-expanded="true" aria-controls={id} aria-activedescendant={s.state.selected?`${id}-${s.state.rows.findIndex(r=>r.id===s.state.selected)}`:undefined} aria-autocomplete="list" value={s.state.input} disabled={s.state.pending} onInput={e=>{if(!e.isComposing)s.input(e.currentTarget.value);}} onCompositionEnd={e=>s.input(e.currentTarget.value)} /></label>
  </Show>
  <Show when={s.state.kind==='entity'}><label>Scope <select aria-label="Entity scope" value={s.state.scope} onChange={e=>s.scope(e.currentTarget.value as CompletionScope)}><option value="blend">Local blend</option><option value="document">Current Document frequency</option><option value="session">This session</option><option value="day">Last 24 hours</option><option value="week">Last 7 days</option><option value="cavern">Cavern</option></select></label></Show>
  <div role="status" aria-live="polite">{s.state.busy?'Searching…':`${s.state.rows.length} candidates`}</div>
  <div id={id} role="listbox" aria-label="Completion candidates" class="autocomplete-results"><For each={s.state.rows}>{(row,i)=><button id={`${id}-${i()}`} role="option" aria-selected={s.state.selected===row.id} aria-disabled={row.disabled} disabled={s.state.pending||row.disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>{s.select(row.id);void s.choose();}} onMouseMove={()=>s.select(row.id)}><strong>{row.name}</strong><small>{row.reason} · {row.id}</small></button>}</For></div>
  <Show when={s.state.error}><p role="alert">{s.state.error}</p></Show>
  <Show when={s.state.kind==='entity'}><div class="autocomplete-actions">
   <button disabled={!chosen()||s.state.pending} onClick={()=>void s.choose(true)}>Replace with name</button>
   <button onClick={()=>data.advanced(s)}>Create / aliases…</button>
   <button onClick={()=>data.advanced(s,true)}>Review occurrences · Ctrl+A</button>
   <button onClick={()=>data.advanced(s,false,true)}>External authorities…</button>
   <button onClick={()=>s.clearHistory()}>Clear usage history</button>
  </div></Show>
  <footer>↑ ↓ select · Enter link · Escape keeps text. Ctrl+A reviews only inside this workstation. Tab, Copy, Undo and Save retain their normal meanings.</footer>
 </div>;
}
