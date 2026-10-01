import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';

/** A Desktop Window's derived work-area rectangle. Stored normal geometry is
 * never changed by fitting, viewport resize, or scrolling. No presentation host
 * with its own geometry is opted into this Desktop policy. */
export function createWindowMaximize(element:()=>HTMLElement, active:()=>boolean) {
  const [bounds,setBounds]=createSignal({x:0,y:0,width:800,height:600});
  let observer:ResizeObserver|undefined;
  const measure=()=>{
    if(!active())return;
    const root=element(); if(!root?.isConnected)return;
    const parent=root.offsetParent as HTMLElement|null;
    const area=root.closest<HTMLElement>('[data-window-work-area]')??(parent===document.body||parent===document.documentElement?null:parent);
    const rect=area?.getBoundingClientRect();
    const inset=area?parseFloat(getComputedStyle(area).getPropertyValue('--window-work-area-top'))||0:0;
    const left=Math.max(0,rect?.left??0),top=Math.max(0,(rect?.top??0)+inset);
    const right=Math.min(window.innerWidth,rect?.right??window.innerWidth);
    const bottom=Math.min(window.innerHeight,rect?.bottom??window.innerHeight);
    const origin=parent?.getBoundingClientRect();
    setBounds({x:left-(origin?.left??0)-(parent?.clientLeft??0)+(parent?.scrollLeft??0)-root.offsetLeft,
      y:top-(origin?.top??0)-(parent?.clientTop??0)+(parent?.scrollTop??0)-root.offsetTop,
      width:Math.max(1,right-left),height:Math.max(1,bottom-top)});
  };
  onMount(()=>{
    if(typeof ResizeObserver!=='undefined'){
      observer=new ResizeObserver(measure);
      const root=element(),area=root.closest<HTMLElement>('[data-window-work-area]')??root.offsetParent;
      if(area)observer.observe(area);
      if(root.offsetParent&&root.offsetParent!==area)observer.observe(root.offsetParent);
    }
    window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);measure();
  });
  createEffect(()=>{if(active())queueMicrotask(measure);});
  onCleanup(()=>{observer?.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);});
  return bounds;
}
