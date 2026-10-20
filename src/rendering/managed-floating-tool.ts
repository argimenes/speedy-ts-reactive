import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { useManagedWindowOwner } from './window-manager';
import type { WindowRect } from '../application/window-geometry';

/** An anchor declares validity explicitly. Clients invalidate after source layout
 * changes; scroll/resize are coalesced here. No document polling or cell sweep. */
export function createToolAnchor(element:()=>Element|undefined, visible:()=>boolean) {
  const owner=useManagedWindowOwner();
  const [rect,setRect]=createSignal<WindowRect>();let frame=0,observer:ResizeObserver|undefined;
  const measure=()=>{frame=0;const node=element();if(!visible()||!node?.isConnected){setRect(undefined);return;}const r=node.getBoundingClientRect();setRect({x:r.left,y:r.top,width:r.width,height:r.height});};
  const invalidate=()=>{setRect(undefined);if(!frame)frame=requestAnimationFrame(measure);};
  createEffect(()=>{const node=element();visible();if(owner)owner.manager.geometry.controllers.get(owner.windowId)?.rectangle();observer?.disconnect();if(node)observer?.observe(node);invalidate();});
  onMount(()=>{observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(invalidate);const node=element();if(node)observer?.observe(node);window.addEventListener('scroll',invalidate,true);window.addEventListener('resize',invalidate);window.visualViewport?.addEventListener('resize',invalidate);window.visualViewport?.addEventListener('scroll',invalidate);});
  onCleanup(()=>{if(frame)cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('scroll',invalidate,true);window.removeEventListener('resize',invalidate);window.visualViewport?.removeEventListener('resize',invalidate);window.visualViewport?.removeEventListener('scroll',invalidate);});
  return {rect,invalidate};
}
export function placeTool(anchor:WindowRect,size:{width:number;height:number},area:WindowRect):WindowRect {
  const width=Math.min(size.width,area.width),height=Math.min(size.height,area.height),gap=8;
  const candidates=[{x:anchor.x+anchor.width+gap,y:anchor.y},{x:anchor.x-width-gap,y:anchor.y},{x:anchor.x,y:anchor.y+anchor.height+gap},{x:anchor.x,y:anchor.y-height-gap}];
  const overflow=(p:{x:number;y:number})=>Math.max(0,area.x-p.x)+Math.max(0,area.y-p.y)+Math.max(0,p.x+width-area.x-area.width)+Math.max(0,p.y+height-area.y-area.height);
  const best=candidates.reduce((a,b)=>overflow(b)<overflow(a)?b:a);
  return {x:Math.max(area.x,Math.min(area.x+area.width-width,best.x)),y:Math.max(area.y,Math.min(area.y+area.height-height,best.y)),width,height};
}
/** Retained tool coordinates are relative to the application frame. CSS remains
 * viewport-fixed inside its owner's stacking group; no docking or new shell host. */
export function createManagedFloatingTool(options:{element:()=>HTMLElement|undefined;initial:WindowRect;minimum:{width:number;height:number}}) {
  const owner=useManagedWindowOwner();if(!owner)return;
  const origin=()=>{const controller=owner.manager.geometry.controllers.get(owner.windowId),rect=controller?.rectangle();const local=owner.manager.geometry.bounds(),viewport=owner.manager.geometry.bounds(true);return controller?.viewport?{x:rect!.x,y:rect!.y}:{x:(rect?.x??0)+viewport.x-local.x,y:(rect?.y??0)+viewport.y-local.y};};
  const initial=origin();
  const [offset,setOffset]=createSignal({x:options.initial.x-initial.x,y:options.initial.y-initial.y});
  const [size,setSize]=createSignal({width:options.initial.width,height:options.initial.height});
  return owner.manager.geometry.create(owner.manager.nextSurfaceId(),{element:options.element,viewport:true,position:()=>({x:origin().x+offset().x,y:origin().y+offset().y}),size,minimum:()=>options.minimum,mode:()=> 'normal',allowed:()=>!!owner.manager.registry.windows[owner.windowId]?.visible&&owner.manager.lifecycle.permits(options.element()!),commit:patch=>{if(patch.size)setSize(patch.size);if(patch.position)setOffset({x:patch.position.x-origin().x,y:patch.position.y-origin().y});}});
}
