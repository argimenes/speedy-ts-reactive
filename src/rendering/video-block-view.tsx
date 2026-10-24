import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { BlockViewProps } from '../block-tree/types';
import { useReactiveView } from '../reactive-editor/context';
import { passiveVideo, playerUrl } from '../interchange/uri';
/** Activation belongs to this mounted occurrence only. It is never saved/copied/undone. */
export function VideoBlockView(props:BlockViewProps & { loadOnMount?: boolean }) {
 const {editor,projection}=useReactiveView(),node=()=>projection.state.nodes[props.nodeKey];
 const video=createMemo(()=>passiveVideo(node()?.payload.video));
 const [active,setActive]=createSignal(false);let root!:HTMLDivElement;
 createEffect(()=>{video();setActive(props.loadOnMount ?? false);});
 onMount(()=>{const unregister=editor.mounts.register(props.nodeKey,{root,focusElement:root,inputPolicy:'opaque-widget',focus:()=>root.focus()});onCleanup(unregister);});
 createEffect(()=>{
  if(!active())return;
  const release=editor.interchange.registerVideo(projection.viewId,()=>setActive(false));onCleanup(release);
  // Observe only presentation changes on the finite ancestor chain, never text mutations.
  const ancestors:Element[]=[];for(let e:Element|null=root;e;e=e.parentElement)ancestors.push(e);
  const hide=()=>{if(ancestors.some(e=>e.hasAttribute('hidden')||e.getAttribute('aria-hidden')==='true'&&!e.hasAttribute('data-surface-face')||e.getAttribute('data-view')==='graph'))setActive(false);};
  const observer=new MutationObserver(hide);ancestors.forEach(e=>observer.observe(e,{attributes:true,attributeFilter:['hidden','aria-hidden','data-view']}));
  const visibility=()=>{if(document.hidden)setActive(false);};document.addEventListener('visibilitychange',visibility);hide();
  onCleanup(()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility);});
 });
 return <div ref={root} tabindex="0" class="abstract-block mutable-video-block" data-runtime-key={props.nodeKey} data-client-id={props.nodeKey} data-block-type={node()?.viewType ?? 'mutable/video-block'}>
  <Show when={video()} fallback={<p>Unsupported video descriptor. Original data retained; no player loaded.</p>}>{v=><>
   <button onClick={()=>setActive(!active())}>{active()?'Stop player':'Load player — connect to provider'}</button><Show when={active()}><iframe title={v().title??`${v().provider} video player`} src={playerUrl(v())} sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style={{display:'block',width:'100%','max-width':'960px','min-height':'200px','aspect-ratio':'16 / 9',border:'0'}}/></Show>
  </>}</Show>
 </div>;
}
