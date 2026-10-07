import { DEFAULT_LIGHT } from '../material-response';
import type { Lighting } from '../lighting';
import { probeTargets, type ProbeKind } from './targets';
import { createProbeRenderer, type ProbeRenderer } from './renderer';
import { clampProbeSize, PROBE_DEFAULT_HEIGHT } from './size';

export type ProbeState = { visibility:'visible'|'suppressed-while-typing'|'disabled'|'outside'; mode:'default'; proximity:ProbeKind|'none' };
export function createProbeController(root:HTMLElement,getLighting:()=>Lighting|undefined,changed:(state:ProbeState)=>void) {
  const registry=probeTargets(root),colours=window.matchMedia('(forced-colors: active)'),motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let enabled=true,inside=false,suppressed=false,disposed=false,failed=false,x=0,y=0,seen=false;
  let frame:number|undefined,renderer:ProbeRenderer|undefined,rotation=.12,targetRotation=.12,lastTime=0;
  let size=PROBE_DEFAULT_HEIGHT;
  let light:Lighting|undefined,stopLight:(()=>void)|undefined;
  let state:ProbeState={visibility:'outside',mode:'default',proximity:'none'};
  const metrics={frames:0};
  function publish(visibility:ProbeState['visibility'],proximity:ProbeState['proximity']) {
    if(state.visibility!==visibility||state.proximity!==proximity){state={visibility,mode:'default',proximity};changed(state);}
  }
  function nativeCursor(){delete root.dataset.probeCursor;}
  function fail(){failed=true;renderer?.dispose();renderer=undefined;nativeCursor();publish('disabled','none');}
  function request(){if(!disposed&&frame===undefined)frame=requestAnimationFrame(draw);}
  function draw(now:number) {
    frame=undefined;if(disposed)return;
    if(!enabled||failed||colours.matches){nativeCursor();if(renderer)renderer.canvas.hidden=true;publish('disabled','none');return;}
    if(!inside){nativeCursor();if(renderer)renderer.canvas.hidden=true;publish('outside','none');return;}
    try {
      renderer??=createProbeRenderer(fail,size);
      const current=getLighting();if(current!==light){stopLight?.();light=current;stopLight=light?.subscribe(request);}
      const rect=root.getBoundingClientRect(),proximity=registry.resolve(x,y);
      const dt=Math.min(50,lastTime?now-lastTime:16);lastTime=now;
      rotation=motion.matches||light?.effects.reducedMotion?targetRotation:rotation+(targetRotation-rotation)*(1-Math.exp(-dt/75));
      if(Math.abs(targetRotation-rotation)<.001)rotation=targetRotation;
      renderer.draw(rect,x,y,rotation,proximity.kind,proximity.intensity,light?.light??DEFAULT_LIGHT,!suppressed);
      root.dataset.probeCursor='hidden';publish(suppressed?'suppressed-while-typing':'visible',proximity.kind);metrics.frames++;
      if(rotation!==targetRotation&&!suppressed)request();
    } catch {fail();}
  }
  function pointer(event:PointerEvent) {
    if(event.pointerType==='touch'){inside=false;request();return;}
    const moved=!seen||x!==event.clientX||y!==event.clientY;
    x=event.clientX;y=event.clientY;seen=true;
    const hit=document.elementFromPoint(x,y);
    inside=!!hit&&root.contains(hit)&&hit.closest('.flint-application,.flint-material-playground')===root;
    if(moved)suppressed=false;
    request();
  }
  function leave(){inside=false;nativeCursor();if(renderer)renderer.canvas.hidden=true;request();}
  const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||target instanceof HTMLTextAreaElement||target instanceof HTMLInputElement&&!['checkbox','radio','button','range','submit','color','file'].includes(target.type));
  function typing(event:Event){if(enabled&&!failed&&event.target instanceof Node&&root.contains(event.target)&&editable(event.target)){suppressed=true;if(renderer)renderer.canvas.hidden=true;publish('suppressed-while-typing',state.proximity);request();}}
  function key(event:KeyboardEvent){
    if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.key.length===1||['Backspace','Delete','Enter'].includes(event.key)))typing(event);
    if(event.key!==' '||event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    if(!enabled||failed||!inside||suppressed||!renderer||colours.matches)return;
    const target=event.target;
    if(!(target instanceof Element)||(!root.contains(target)&&target!==document.body&&target!==document.documentElement))return;
    // Preserve spaces in editors and native Space activation on focused controls.
    if(editable(target)||target.closest('button,input,textarea,select,summary,a[href],[contenteditable],[role="button"],[role="checkbox"],[role="radio"],[role="switch"],[role="slider"],[role="menuitem"],[role="option"],[role="tab"],[role="treeitem"]'))return;
    event.preventDefault();event.stopPropagation();
    if(!event.repeat){targetRotation+=Math.PI;request();}
  }
  function wheel(event:WheelEvent){
    if(!enabled||failed||!inside||suppressed||!renderer||colours.matches||!event.altKey||event.ctrlKey||event.metaKey)return;
    event.preventDefault();event.stopPropagation();
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?root.clientHeight:1);
    targetRotation+=Math.max(-500,Math.min(500,delta))*.008;request();
  }
  function layout(){if(inside){const hit=document.elementFromPoint(x,y);inside=!!hit&&root.contains(hit);}request();}
  const stopTargets=registry.subscribe(request);
  const eikon=root.querySelector<HTMLElement>('[data-probe-eikon]');
  const stopEikon=eikon?registry.register({id:'flint-eikon',kind:'flint-eikon',bounds:()=>eikon.isConnected?eikon.getBoundingClientRect():undefined}):undefined;
  // Observe before the editor's document-level input gateway can consume the
  // event. Editor input stays native; only explicit Probe shortcuts are consumed.
  window.addEventListener('pointermove',pointer,{capture:true,passive:true});
  document.addEventListener('pointerout',out);window.addEventListener('blur',leave);
  window.addEventListener('keydown',key,true);window.addEventListener('beforeinput',typing,true);window.addEventListener('compositionstart',typing,true);
  root.addEventListener('wheel',wheel,{capture:true,passive:false});
  window.addEventListener('scroll',layout,true);window.addEventListener('resize',layout);
  colours.addEventListener('change',preferences);motion.addEventListener('change',request);
  function out(event:PointerEvent){if(!event.relatedTarget)leave();}
  function preferences(){if(colours.matches){nativeCursor();renderer?.dispose();renderer=undefined;}request();}
  return {
    get state(){return state;},get renderer(){return renderer;},get rotation(){return rotation;},get targetRotation(){return targetRotation;},get pending(){return frame!==undefined;},get disposed(){return disposed;},metrics,
    get size(){return size;},
    setSize(value:number){if(disposed)return;const next=clampProbeSize(value);if(next===size)return;size=next;renderer?.setSize(size);request();},
    setEnabled(value:boolean){enabled=value;if(!value){nativeCursor();renderer?.dispose();renderer=undefined;publish('disabled','none');}else failed=false;request();},
    dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);frame=undefined;
      window.removeEventListener('pointermove',pointer,true);document.removeEventListener('pointerout',out);window.removeEventListener('blur',leave);
      window.removeEventListener('keydown',key,true);window.removeEventListener('beforeinput',typing,true);window.removeEventListener('compositionstart',typing,true);root.removeEventListener('wheel',wheel,true);
      window.removeEventListener('scroll',layout,true);window.removeEventListener('resize',layout);colours.removeEventListener('change',preferences);motion.removeEventListener('change',request);
      stopTargets();stopEikon?.();stopLight?.();renderer?.dispose();renderer=undefined;nativeCursor();
    },
  };
}
export type ProbeController=ReturnType<typeof createProbeController>;
