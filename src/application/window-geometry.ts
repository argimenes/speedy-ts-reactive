import { createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import type { FloatingWindowSize } from '../rendering/floating-window-resize';

export type WindowRect = { x:number; y:number; width:number; height:number };
export interface GeometryPort {
  element(): HTMLElement | undefined;
  position(): {x:number;y:number};
  size(): FloatingWindowSize;
  minimum(): FloatingWindowSize;
  mode(): string;
  viewport?: boolean;
  allowed(): boolean;
  layout?(): WindowRect | undefined;
  cancelled?(): void;
  commit(patch: {position?:{x:number;y:number};size?:FloatingWindowSize}): void;
}
/** CSS-pixel geometry shared by desktop frames and owner-local tool adapters.
 * One viewport observer/listener set per session. No repository subscription.
 * Only the explicit end of a gesture crosses the legacy metadata/history bridge. */
export class WindowGeometry {
  private area = createSignal<WindowRect>({x:0,y:0,width:800,height:600},{equals:(a,b)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height});
  private origin = createSignal({x:0,y:0},{equals:(a,b)=>a.x===b.x&&a.y===b.y});
  private cancelGesture?:()=>void;
  private cleanup?:()=>void;
  readonly controllers = new Map<string, ReturnType<WindowGeometry['create']>>();
  bounds = (viewport=false):WindowRect => { const a=this.area[0](),o=viewport?{x:0,y:0}:this.origin[0]();return {...a,x:a.x-o.x,y:a.y-o.y}; };
  cancel(){this.cancelGesture?.();}
  install(plane:HTMLElement) {
    this.cleanup?.();let frame=0;
    const measure=()=>{
      frame=0;
      const viewport=window.visualViewport, rect=plane.getBoundingClientRect();
      const host=plane.closest<HTMLElement>('[data-window-work-area]'),hostRect=host?.getBoundingClientRect();
      const inset=host?parseFloat(getComputedStyle(host).getPropertyValue('--window-work-area-top'))||0:0;
      const x=Math.max(viewport?.offsetLeft??0,hostRect?.left??0), y=Math.max(viewport?.offsetTop??0,(hostRect?.top??0)+inset);
      const right=Math.min((viewport?.offsetLeft??0)+(viewport?.width??window.innerWidth),hostRect?.right||Infinity);
      const bottom=Math.min((viewport?.offsetTop??0)+(viewport?.height??window.innerHeight),hostRect?.bottom||Infinity);
      this.origin[1]({x:rect.left,y:rect.top});
      this.area[1]({x,y,width:Math.max(1,right-x),height:Math.max(1,bottom-y)});
    };
    const invalidate=()=>{this.cancelGesture?.();if(!frame)frame=requestAnimationFrame(measure);};
    const blur=()=>this.cancelGesture?.();
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&this.cancelGesture){event.preventDefault();event.stopImmediatePropagation();this.cancelGesture();}};
    const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(invalidate);observer?.observe(plane);
    window.addEventListener('resize',invalidate);window.addEventListener('scroll',invalidate,true);window.addEventListener('blur',blur);
    window.visualViewport?.addEventListener('resize',invalidate);window.visualViewport?.addEventListener('scroll',invalidate);
    document.addEventListener('keydown',key,true);measure();
    this.cleanup=()=>{if(frame)cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',invalidate);window.removeEventListener('scroll',invalidate,true);window.removeEventListener('blur',blur);window.visualViewport?.removeEventListener('resize',invalidate);window.visualViewport?.removeEventListener('scroll',invalidate);document.removeEventListener('keydown',key,true);};
  }
  create(id:string, port:GeometryPort) {
    const [preview,setPreview]=createSignal<WindowRect>();
    const [mode,setMode]=createSignal<'move'|'resize'>();
    let pointer:{id:number;x:number;y:number;rect:WindowRect;capture:HTMLElement}|undefined;
    let suppress=false;
    let suppressTimer:ReturnType<typeof setTimeout>|undefined;
    let restoreMode:"normal"|"maximized"="normal";
    const fit=(rect:WindowRect)=>{
      const area=this.bounds(port.viewport),minimum=port.mode()==='minimized'?{width:96,height:92}:port.minimum();
      const width=Math.min(area.width,Math.max(Math.min(minimum.width,area.width),rect.width));
      const height=Math.min(area.height,Math.max(Math.min(minimum.height,area.height),rect.height));
      return {x:Math.min(area.x+area.width-width,Math.max(area.x,rect.x)),y:Math.min(area.y+area.height-height,Math.max(area.y,rect.y)),width,height};
    };
    const rectangle=createMemo(()=> {
      if(port.mode()==='maximized')return this.bounds(port.viewport);
      if(port.mode()==='minimized') {const a=this.bounds(port.viewport),p=preview()??port.position();return {x:Math.max(a.x,Math.min(a.x+a.width-96,p.x)),y:Math.max(a.y,Math.min(a.y+a.height-92,p.y)),width:96,height:92};}
      const layout=port.layout?.();if(layout)return layout;
      return fit(preview()??{...port.position(),...port.size()});
    },undefined,{equals:(a,b)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height});
    const cancel=()=>{port.cancelled?.();const p=pointer;pointer=undefined;setPreview(undefined);setMode(undefined);if(this.cancelGesture===cancel)this.cancelGesture=undefined;if(p?.capture.hasPointerCapture?.(p.id))p.capture.releasePointerCapture(p.id);};
    createEffect(()=>{port.position();port.size();port.mode();untrack(cancel);});
    const commit=()=>{const value=preview(),kind=mode();if(value&&port.allowed()) {suppress=!!pointer&&port.mode()==='minimized';if(suppress){clearTimeout(suppressTimer);suppressTimer=setTimeout(()=>suppress=false,0);}if(kind==='move')port.commit({position:{x:Math.round(value.x),y:Math.round(value.y)}});else port.commit({size:{width:Math.round(value.width),height:Math.round(value.height)}});}cancel();};
    const begin=(kind:'move'|'resize')=>{if(!port.allowed()||port.mode()==='maximized'||kind==='resize'&&port.mode()==='minimized')return false;this.cancelGesture?.();this.cancelGesture=cancel;setMode(kind);return true;};
    const beginPointer=(event:PointerEvent&{currentTarget:HTMLElement},kind:'move'|'resize')=>{
      if(event.button!==0||event.ctrlKey||!begin(kind))return;
      pointer={id:event.pointerId,x:event.clientX,y:event.clientY,rect:rectangle(),capture:event.currentTarget};
      event.currentTarget.setPointerCapture?.(event.pointerId);event.preventDefault();event.stopPropagation();
    };
    const movePointer=(event:PointerEvent)=>{if(pointer?.id!==event.pointerId)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;if(Math.abs(dx)<2&&Math.abs(dy)<2)return;
      if(!port.allowed()){cancel();return;}const r=pointer.rect;
      setPreview(fit(mode()==='move'?{...r,x:r.x+dx,y:r.y+dy}:{...r,width:r.width+dx,height:r.height+dy}));event.preventDefault();};
    const endPointer=(event:PointerEvent)=>{if(pointer?.id===event.pointerId)commit();};
    const cancelPointer=(event:PointerEvent)=>{if(pointer?.id===event.pointerId)cancel();};
    const keyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){cancel();event.preventDefault();event.stopPropagation();return;}
      if(event.key==='Enter'&&mode()){commit();event.preventDefault();event.stopPropagation();return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||!mode())return;
      const r=rectangle(),step=event.shiftKey?1:10,dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
      setPreview(fit(mode()==='move'?{...r,x:r.x+dx,y:r.y+dy}:{...r,width:r.width+dx,height:r.height+dy}));event.preventDefault();event.stopPropagation();
    };
    const keyboard=(kind:'move'|'resize')=>{if(begin(kind))port.element()?.querySelector<HTMLElement>('.reactive-window__header,[data-window-move]')?.focus({preventScroll:true});};
    const result={rectangle,mode,cancel,commit,keyboard,viewport:!!port.viewport,rememberMode:()=>{restoreMode=port.mode()==="maximized"?"maximized":"normal";},restoreMode:()=>restoreMode,beginMove:(e:PointerEvent&{currentTarget:HTMLElement})=>beginPointer(e,'move'),movePointer,endPointer,cancelPointer,keyDown,
      consumeClick:()=>{const result=suppress;suppress=false;return result;},
      resize:{blur:cancel,dimensions:()=>rectangle(),active:()=>mode()==='resize',preview:()=>preview(),clamp:(width:number,height:number)=>fit({...rectangle(),width,height}),cancel,commit,beginPointer:(e:PointerEvent&{currentTarget:HTMLElement})=>beginPointer(e,'resize'),movePointer,endPointer,cancelPointer,lostPointerCapture:cancelPointer,keyDown:(e:KeyboardEvent)=>{if(!mode())begin('resize');keyDown(e);}}};
    this.controllers.set(id,result);onCleanup(()=>{cancel();clearTimeout(suppressTimer);this.controllers.delete(id);});return result;
  }
  dispose(){this.cancelGesture?.();this.cleanup?.();this.cleanup=undefined;this.controllers.clear();}
}
