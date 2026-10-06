import { For, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { createLighting, type Lighting } from '../lighting';
import { DEFAULT_LIGHT, type Light } from '../material-response';
import { CYCLADIC_APERTURE, OPEN_ENVIRONMENT } from './light-environment-config';
import type { MaterialScene } from './material-scene';
import type { SurfaceMaterial } from './material-registry';
import './material-chrome.css';

type Presentation = { lighting: Lighting; scene?: MaterialScene };
const presentations = new WeakMap<HTMLElement, Presentation>();
export const materialChromePresentation = (root: HTMLElement) => presentations.get(root);

/** Solid owns lifetime and opt-out. The editor slot lives outside this component. */
export function MaterialChrome(props: { root: () => HTMLElement; viewport: () => HTMLElement; layout: () => unknown; lighting?: Lighting }) {
  const [enabled, setEnabled] = createSignal(true), [occlusion, setOcclusion] = createSignal(true);
  const [light, setLight] = createSignal<Light>(DEFAULT_LIGHT), [material, setMaterial] = createSignal<SurfaceMaterial>('limestone');
  const [status, setStatus] = createSignal('Loading materials…');
  let presentation: Presentation | undefined, disposeScene: (() => void) | undefined, refresh: (() => void) | undefined;
  createEffect(() => { props.layout(); presentation?.scene?.invalidateLayout(); });
  onMount(() => {
    const root = props.root(), lighting = props.lighting ?? createLighting(root);
    presentation = { lighting }; presentations.set(root, presentation);
    const colours = window.matchMedia?.('(forced-colors: active)'), motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let generation = 0, disposed = false;
    const available = (value: boolean) => { root.dataset.materialReady = String(value); setStatus(value ? 'Materials active' : 'Simple surfaces'); };
    const start = async () => {
      const ticket = ++generation;
      disposeScene?.(); disposeScene = undefined;
      if (!enabled() || colours?.matches || !window.WebGLRenderingContext || typeof ResizeObserver === 'undefined') { available(false); return; }
      try {
        const { createMaterialScene } = await import('./material-scene');
        if (disposed || ticket !== generation) return;
        const scene = createMaterialScene(root, lighting, available); presentation!.scene = scene;
        const stopSurface = scene.registerSurface(props.viewport());
        scene.setMaterial(material()); scene.setEnvironment(occlusion() ? CYCLADIC_APERTURE : OPEN_ENVIRONMENT);
        disposeScene = () => { stopSurface(); scene.dispose(); if (presentation) presentation.scene = undefined; };
      } catch { if (!disposed && ticket === generation) available(false); }
    };
    refresh = () => {
      lighting.setEffects({ reducedMotion: motion?.matches ?? false, reducedEffects: !enabled() || (colours?.matches ?? false) });
      void start();
    };
    colours?.addEventListener('change', refresh); motion?.addEventListener('change', refresh); refresh();
    onCleanup(() => {
      disposed = true; generation++; colours?.removeEventListener('change', refresh!); motion?.removeEventListener('change', refresh!);
      disposeScene?.(); if (!props.lighting) lighting.dispose(); presentations.delete(root); delete root.dataset.materialReady; presentation = undefined;
    });
  });
  function changeLight(key: keyof Light, value: number) { const next = { ...light(), [key]: value }; setLight(next); presentation?.lighting.setLight(next); }
  return <details class="flint-light-controls" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
  }}>
    <summary>Light & material</summary>
    <div class="flint-light-controls__panel" role="group" aria-label="Light and material">
      <label><input type="checkbox" aria-label="Material effects" checked={enabled()} onChange={e => { setEnabled(e.currentTarget.checked); refresh?.(); }} /> Material effects</label>
      <label><input type="checkbox" aria-label="Environmental occlusion" checked={occlusion()} onChange={e => { setOcclusion(e.currentTarget.checked); presentation?.scene?.setEnvironment(occlusion() ? CYCLADIC_APERTURE : OPEN_ENVIRONMENT); }} /> Environmental occlusion</label>
      <label>Surface<select aria-label="Application material" value={material()} onChange={e => { setMaterial(e.currentTarget.value as SurfaceMaterial); presentation?.scene?.setMaterial(material()); }}><For each={['limestone', 'marble', 'chalk', 'paper', 'parchment'] as const}>{name => <option value={name}>{name}</option>}</For></select></label>
      <For each={[
        { key: 'azimuth', label: 'Direction', min: 0, max: 359, step: 1 },
        { key: 'elevation', label: 'Light elevation', min: 15, max: 80, step: 1 },
        { key: 'intensity', label: 'Intensity', min: .15, max: 1.3, step: .01 },
        { key: 'softness', label: 'Softness', min: 0, max: 1, step: .01 },
      ] as const}>{range => <label>{range.label}<output>{light()[range.key]}</output><input type="range" aria-label={range.label} min={range.min} max={range.max} step={range.step} value={light()[range.key]} onInput={e => changeLight(range.key, Number(e.currentTarget.value))} /></label>}</For>
      <button type="button" onClick={() => { setLight(DEFAULT_LIGHT); presentation?.lighting.reset(); }}>Reset light</button>
      <small role="status">{status()}</small>
    </div>
  </details>;
}
