import {createEffect, createSignal, onCleanup, onMount} from 'solid-js';
import {materialChromePresentation} from './material/material-chrome';

export function FlintLogo(props: {enabled: boolean; root: () => HTMLElement; image: string}) {
  let host!: HTMLSpanElement;
  const [ready, setReady] = createSignal(false), [colours, setColours] = createSignal(false);
  onMount(() => {
    const preference = window.matchMedia?.('(forced-colors: active)');
    const update = () => setColours(preference?.matches ?? false);
    update(); preference?.addEventListener('change', update);
    onCleanup(() => preference?.removeEventListener('change', update));
  });
  createEffect(() => {
    if (!props.enabled || colours() || !window.WebGLRenderingContext || typeof ResizeObserver === 'undefined') return;
    let disposed = false, logo: {dispose(): void} | undefined;
    void import('./logo-renderer').then(module => {
      if (!disposed) logo = module.createFlintLogo(host, setReady, materialChromePresentation(props.root())?.lighting);
    }).catch(() => { if (!disposed) setReady(false); });
    onCleanup(() => { disposed = true; logo?.dispose(); });
  });
  return <span ref={host} class="flint-mark" data-probe-eikon data-logo-ready={ready()}><img src={props.image} alt="" style={{visibility:ready()?'hidden':undefined}}/></span>;
}
