import { For, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { createLighting } from '../lighting';
import { MATERIAL_CHANGE_EVENT, materialChromePresentation } from '../material/material-chrome';
import { chromeHit, chromeLayout } from './layout';
import type { ChromeControl, ChromeRenderer } from './renderer';
import './scene-chrome.css';

export interface SceneControl extends ChromeControl {
  ariaLabel?: string;
  expanded?: boolean;
  action: (button: HTMLButtonElement) => void;
  ref?: (button: HTMLButtonElement) => void;
}
const renderers = new WeakMap<HTMLElement, ChromeRenderer>();
export const sceneChromeRenderer = (element: HTMLElement) => renderers.get(element);

/** The host is a normal layout box. Its canvas owns all visible control geometry
 * and text; semantic buttons are not positioned over scene objects. HTML content
 * is a sibling, never sampled by this component. */
export function SceneChrome(props: { root: () => HTMLElement; title: string; controls: readonly SceneControl[]; brand?: boolean; enabled?: boolean }) {
  let host!: HTMLDivElement, canvas!: HTMLCanvasElement;
  const buttons = new Map<string, HTMLButtonElement>();
  const [width, setWidth] = createSignal(1), [ready, setReady] = createSignal(false);
  const [renderer, setRenderer] = createSignal<ChromeRenderer>();
  let focused: string | undefined, hovered: string | undefined, pressed: string | undefined, pointer: number | undefined;
  const layout = () => chromeLayout(width(), props.controls.length);
  const item = (id: string) => props.controls.find(control => control.id === id)!;
  const paintState = () => renderer()?.state(focused, hovered, pressed);
  createEffect(() => renderer()?.update({ title: props.title, width: width(), brand: props.brand, controls: props.controls.map(({ id, label, disabled, active }) => ({ id, label, disabled, active })) }));
  const hit = (event: PointerEvent) => {
    // Only pointer hit testing reads the canvas position, allowing native window
    // movement/zoom without any renderer updates or global geometry tracking.
    const bounds = canvas.getBoundingClientRect(), local = layout();
    const index = chromeHit(local.controls, (event.clientX - bounds.left) * local.width / bounds.width, (event.clientY - bounds.top) * local.height / bounds.height);
    const control = props.controls[index]; return control && !control.disabled ? control.id : undefined;
  };
  const release = () => {
    const captured = pointer; pointer = undefined; pressed = undefined;
    if (captured !== undefined && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
    paintState();
  };
  onMount(() => {
    if (typeof ResizeObserver === 'undefined') return; // Native controls remain usable.
    let live = true, cleanup: (() => void) | undefined;
    const resize = new ResizeObserver(entries => { const entry = entries[0]; if (entry) setWidth(Math.max(1, Math.round(entry.contentRect.width))); });
    resize.observe(host);
    const start = async () => {
      if (props.enabled === false || !window.WebGLRenderingContext) return;
      try {
        const { createChromeRenderer } = await import('./renderer');
        if (!live) return;
        const root = props.root(), presentation = materialChromePresentation(root);
        const lighting = presentation?.lighting ?? createLighting(host);
        const colours = matchMedia('(forced-colors: active)'), motion = matchMedia('(prefers-reduced-motion: reduce)');
        const preferences = () => { if (!presentation) lighting.setEffects({ reducedEffects: colours.matches, reducedMotion: motion.matches }); };
        preferences(); colours.addEventListener('change', preferences); motion.addEventListener('change', preferences);
        let scene: ChromeRenderer;
        try { scene = createChromeRenderer(canvas, lighting, value => { if (live) setReady(value); }); }
        catch (error) { colours.removeEventListener('change', preferences); motion.removeEventListener('change', preferences); if (!presentation) lighting.dispose(); throw error; }
        const material = () => scene.setMaterial(presentation?.material ?? 'limestone');
        root.addEventListener(MATERIAL_CHANGE_EVENT, material); material();
        renderers.set(host, scene); setRenderer(scene);
        cleanup = () => { release(); root.removeEventListener(MATERIAL_CHANGE_EVENT, material); colours.removeEventListener('change', preferences); motion.removeEventListener('change', preferences); scene.dispose(); renderers.delete(host); if (!presentation) lighting.dispose(); };
      } catch { if (live) setReady(false); }
    };
    void start(); window.addEventListener('blur', release);
    onCleanup(() => { live = false; resize.disconnect(); window.removeEventListener('blur', release); cleanup?.(); });
  });
  return <div ref={host} class="flint-scene-chrome" data-cross-text-controls data-scene-ready={ready()} style={{ height: ready() ? `${layout().height}px` : undefined }} role="group" aria-label={props.title}>
    <canvas ref={canvas} class="flint-scene-chrome__canvas" hidden={!ready()} aria-hidden="true"
      onPointerDown={event => {
        if (event.button !== 0 || pointer !== undefined) return;
        const id = hit(event); if (!id) return;
        event.preventDefault(); event.stopPropagation(); pointer = event.pointerId; pressed = id;
        canvas.setPointerCapture(pointer); paintState();
      }}
      onPointerMove={event => { const id = hit(event); if (hovered !== id) { hovered = id; canvas.style.cursor = id ? 'pointer' : 'default'; paintState(); } }}
      onPointerLeave={() => { hovered = undefined; paintState(); }}
      onPointerUp={event => {
        if (event.pointerId !== pointer) return;
        const id = pressed, target = hit(event); release();
        if (id && target === id) buttons.get(id)?.click();
      }} onPointerCancel={release} onLostPointerCapture={release} />
    <div class="flint-scene-chrome__semantics">
      <strong>{props.title}</strong>
      <For each={props.controls.map(control => control.id)}>{id => <button type="button" data-scene-control={id}
        ref={button => { buttons.set(id, button); item(id).ref?.(button); onCleanup(() => buttons.delete(id)); }}
        disabled={item(id).disabled} aria-label={item(id).ariaLabel ?? item(id).label} aria-pressed={item(id).active} aria-expanded={item(id).expanded}
        onPointerDown={event => event.preventDefault()}
        onFocus={() => { focused = id; paintState(); }} onBlur={() => { focused = undefined; pressed = undefined; paintState(); }}
        onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { pressed = id; paintState(); } }}
        onKeyUp={() => { pressed = undefined; paintState(); }}
        onClick={event => { const control = item(id); if (!control.disabled) control.action(event.currentTarget); }}
      >{item(id).label}</button>}</For>
    </div>
  </div>;
}
