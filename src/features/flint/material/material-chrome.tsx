import { For, createSignal, onCleanup, onMount } from 'solid-js';
import { createLighting, type Lighting } from '../lighting';
import { DEFAULT_LIGHT, type Light } from '../material-response';
import { CYCLADIC_APERTURE, OPEN_ENVIRONMENT } from './light-environment-config';
import type { LightEnvironment } from './light-environment-config';
import type { SurfaceMaterial } from './material-registry';
import './material-chrome.css';

type Presentation = { lighting: Lighting; readonly material: SurfaceMaterial; readonly environment: LightEnvironment };
export const MATERIAL_CHANGE_EVENT = "flint-material-change";
const presentations = new WeakMap<HTMLElement, Presentation>();
export const materialChromePresentation = (root: HTMLElement) => presentations.get(root);

/** Lighting preferences only. HTML owns every application control and surface. */
export function MaterialChrome(props: { root: () => HTMLElement; lighting?: Lighting }) {
  const [enabled, setEnabled] = createSignal(true), [occlusion, setOcclusion] = createSignal(true);
  const [light, setLight] = createSignal<Light>(DEFAULT_LIGHT), [material, setMaterial] = createSignal<SurfaceMaterial>('limestone');
  const [status, setStatus] = createSignal('Graph and logo lighting');
  let presentation: Presentation | undefined, refresh: (() => void) | undefined;
  onMount(() => {
    const root = props.root(), lighting = props.lighting ?? createLighting(root);
    presentation = { lighting, get material() { return material(); }, get environment() { return occlusion() ? CYCLADIC_APERTURE : OPEN_ENVIRONMENT; } }; presentations.set(root, presentation);
    const colours = window.matchMedia?.('(forced-colors: active)'), motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    refresh = () => {
      lighting.setEffects({ reducedMotion: motion?.matches ?? false, reducedEffects: !enabled() || (colours?.matches ?? false) });
      setStatus(enabled() && !colours?.matches ? 'Graph and logo lighting' : 'Reduced effects');
    };
    colours?.addEventListener('change', refresh); motion?.addEventListener('change', refresh); refresh();
    onCleanup(() => {
      colours?.removeEventListener('change', refresh!); motion?.removeEventListener('change', refresh!);
      if (!props.lighting) lighting.dispose(); presentations.delete(root); presentation = undefined;
    });
  });
  function announceMaterial() { props.root().dispatchEvent(new Event(MATERIAL_CHANGE_EVENT)); }
  function changeLight(key: keyof Light, value: number) { const next = { ...light(), [key]: value }; setLight(next); presentation?.lighting.setLight(next); }
  return <details class="flint-light-controls" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
  }}>
    <summary>Light & material</summary>
    <div class="flint-light-controls__panel" role="group" aria-label="Light and material">
      <label><input type="checkbox" aria-label="Material effects" checked={enabled()} onChange={e => { setEnabled(e.currentTarget.checked); refresh?.(); }} /> Material effects</label>
      <label><input type="checkbox" aria-label="Environmental occlusion" checked={occlusion()} onChange={e => { setOcclusion(e.currentTarget.checked); announceMaterial(); }} /> Environmental occlusion</label>
      <label>Surface<select aria-label="Application material" value={material()} onChange={e => { setMaterial(e.currentTarget.value as SurfaceMaterial); announceMaterial(); }}><For each={['limestone', 'marble', 'chalk', 'paper', 'parchment'] as const}>{name => <option value={name}>{name}</option>}</For></select></label>
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
