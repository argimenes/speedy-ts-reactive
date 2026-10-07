import { createSignal, onCleanup, onMount } from 'solid-js';
import type { Lighting } from '../lighting';
import type { ProbeController, ProbeState } from './controller';
import './probe.css';
const presentations=new WeakMap<HTMLElement,ProbeController>();
export const probePresentation=(root:HTMLElement)=>presentations.get(root);
export function FlintProbe(props:{root:()=>HTMLElement;lighting:()=>Lighting|undefined}) {
  const [enabled,setEnabled]=createSignal(true),[state,setState]=createSignal<ProbeState>({visibility:'outside',mode:'default',proximity:'none'});
  let controller:ProbeController|undefined,disposed=false;
  onMount(()=>{
    const root=props.root();
    void import('./controller').then(module=>{if(disposed)return;controller=module.createProbeController(root,props.lighting,setState);controller.setEnabled(enabled());presentations.set(root,controller);}).catch(()=>{if(!disposed)setState({visibility:'disabled',mode:'default',proximity:'none'});});
    onCleanup(()=>{disposed=true;controller?.dispose();presentations.delete(root);});
  });
  return <details class="flint-probe-controls"><summary>Probe experiment</summary><div>
    <label><input type="checkbox" aria-label="Flint Probe" checked={enabled()} onChange={event=>{setEnabled(event.currentTarget.checked);controller?.setEnabled(enabled());}}/> Stone pointer</label>
    <small>Alt + wheel rotates the Probe. Ordinary scrolling and zoom remain available.</small>
    <small>{state().visibility==='disabled'?'Native pointer active.': 'Typing hides the Probe; pointer movement restores it.'}</small>
  </div></details>;
}
