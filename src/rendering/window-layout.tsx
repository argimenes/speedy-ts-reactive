import { For, Show, createMemo, createEffect, untrack, onCleanup, onMount } from 'solid-js';
import type { WorkspaceWindowManager } from '../application/window-manager';
import type { SnapZone, TileEdge } from '../runtime/window-layout';
import { SystemSubmenu } from '../demo/codex-system-bar';
const presets:Array<[SnapZone,string]>=[['left','Left half'],['right','Right half'],['top','Top half'],['bottom','Bottom half'],['top-left','Top left quarter'],['top-right','Top right quarter'],['bottom-left','Bottom left quarter'],['bottom-right','Bottom right quarter']];
export function WindowLayoutActions(props:{manager:WorkspaceWindowManager;id:string}){
  const layout=props.manager.layout;
  return <SystemSubmenu label="Arrange window">
    <For each={presets}>{([zone,label])=><button role="menuitem" onClick={()=>layout.snap(props.id,zone)}>{label}</button>}</For>
    <button role="menuitem" disabled={!layout.isTiled(props.id)} onClick={()=>layout.float(props.id)}>Return to floating</button>
    <For each={Object.keys(props.manager.registry.windows).filter(id=>id!==props.id)}>{target=><SystemSubmenu label={`With ${props.manager.title(target)}`}>
      <For each={['left','right','top','bottom','tab'] as TileEdge[]}>{edge=><button role="menuitem" onClick={()=>layout.tile(props.id,target,edge)}>{edge==='tab'?'Join shell tabs':`Tile ${edge}`}</button>}</For>
    </SystemSubmenu>}</For>
  </SystemSubmenu>;
}
/** Shell chrome is a sibling of stable application frames, never their parent. */
export function WindowLayoutChrome(props:{manager:WorkspaceWindowManager}){
  const manager=props.manager,layout=manager.layout;
  const dividerIds=createMemo(()=>layout.solution().dividers.map(d=>d.id));
  const groupIds=createMemo(()=>layout.solution().tabs.map(g=>g.id));
  let pointer:{id:number;node:string;x:number;y:number;ratio:number;length:number;axis:string;capture:HTMLElement}|undefined;
  const cancel=()=>{const p=pointer;pointer=undefined;layout.cancel();if(p?.capture.hasPointerCapture?.(p.id))p.capture.releasePointerCapture(p.id);};
  createEffect(()=>{manager.geometry.bounds();untrack(cancel);});
  onMount(()=>{
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){cancel();}};
    document.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);window.visualViewport?.addEventListener('resize',cancel);
    onCleanup(()=>{cancel();document.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);window.visualViewport?.removeEventListener('resize',cancel);});
  });
  const style=(r:{x:number;y:number;width:number;height:number})=>({left:`${r.x}px`,top:`${r.y}px`,width:`${r.width}px`,height:`${r.height}px`});
  const layer=()=>layout.chromeRank();
  return <div class="mwm-layout-chrome" hidden={!layout.active()}>
    <Show when={layout.notice()||layout.solution().unsatisfiable.length}><div class="mwm-layout-notice" style={{'z-index':manager.count()*2+2}} role="status" aria-live="polite">{layout.notice()||'The work area is too small for this split. Temporary shell tabs are shown; expanding the viewport restores the split.'}</div></Show>
    <Show when={!layout.covered()}>
      <For each={dividerIds()}>{id=>{
        const divider=()=>layout.solution().dividers.find(d=>d.id===id)!;
        return <div class="mwm-layout-divider" role="separator" tabIndex={0} aria-label="Resize shell split" aria-orientation={divider().axis==='horizontal'?'vertical':'horizontal'} aria-valuemin={Math.round(divider().minimum*100)} aria-valuemax={Math.round(divider().maximum*100)} aria-valuenow={Math.round(divider().ratio*100)} style={{...style(divider().rect),'z-index':layer()}}
          onPointerDown={e=>{if(e.button!==0||!layout.beginDivider(id))return;const d=divider();pointer={id:e.pointerId,node:id,x:e.clientX,y:e.clientY,ratio:d.ratio,length:(d.axis==='horizontal'?d.area.width:d.area.height)-6,axis:d.axis,capture:e.currentTarget};e.currentTarget.setPointerCapture?.(e.pointerId);e.currentTarget.focus();e.preventDefault();}}
          onPointerMove={e=>{const p=pointer;if(p?.id!==e.pointerId)return;layout.divider(id,p.ratio+(p.axis==='horizontal'?e.clientX-p.x:e.clientY-p.y)/p.length);e.preventDefault();}}
          onPointerUp={e=>{if(pointer?.id!==e.pointerId)return;pointer=undefined;layout.commitDivider();if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
          onPointerCancel={cancel} onLostPointerCapture={()=>{if(pointer)cancel();}}
          onBlur={()=>{if(!pointer)layout.cancel();}}
          onKeyDown={e=>{
            if(e.key==='Escape'){cancel();e.preventDefault();return;}
            if(e.key==='Enter'){layout.commitDivider();e.preventDefault();return;}
            const axis=divider().axis,keys=axis==='horizontal'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];if(!keys.includes(e.key))return;
            if(!layout.dividerActive())layout.beginDivider(id);
            layout.divider(id,divider().ratio+(keys.indexOf(e.key)===0?-1:1)*(e.shiftKey ? .01 : .05));e.preventDefault();e.stopPropagation();
          }}/>;
      }}</For>
      <For each={groupIds()}>{id=>{
        const group=()=>layout.solution().tabs.find(g=>g.id===id)!;
        return <div class="mwm-shell-tabs" role="tablist" aria-label={group().temporary?'Temporary shell tabs':'Shell window tabs'} style={{...style(group().rect),'z-index':layer()}}>
          <For each={group().entries}>{key=><button role="tab" id={`mwm-tab-${key}`} aria-controls={layout.panelId(key)} aria-selected={group().active===key} tabIndex={group().active===key?0:-1} onClick={()=>layout.select(id,key)} onKeyDown={e=>{
            const keys=group().entries,index=keys.indexOf(key),next=e.key==='Home'?0:e.key==='End'?keys.length-1:e.key==='ArrowRight'?(index+1)%keys.length:e.key==='ArrowLeft'?(index+keys.length-1)%keys.length:-1;
            if(next<0)return;e.preventDefault();layout.select(id,keys[next]);document.getElementById(`mwm-tab-${keys[next]}`)?.focus();
          }}>{layout.title(key)}</button>}</For>
        </div>;
      }}</For>
    </Show>
    <Show when={layout.snapPreview()}>{preview=><div class="mwm-snap-preview" aria-hidden="true" style={{...style(preview().rect),'z-index':Math.max(0,...Object.values(manager.registry.windows).filter(w=>!w.pinned).map(w=>w.rank))*2+1}}/>}</Show>
  </div>;
}
