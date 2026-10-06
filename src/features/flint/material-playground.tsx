import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { createLighting, type Lighting } from './lighting';
import { createMaterialInteraction, type MaterialInteractions } from './material-interaction';
import { DEFAULT_LIGHT, type Light, type StoneFinish } from './material-response';
import { FlintButton, FlintPanel, FlintSurface, registerDomMaterial } from './material-primitives';
import { createMaterialGraph, type DetailLevel, type MaterialGraph } from './graph/material-graph';
import type { GraphFactory, MaterialGraphAdapter } from './graph/three-material-graph';
import { REFERENCE_NODES, type FixtureNode } from './graph/material-fixture';
import { DEFAULT_TEXTURE_LAYERS, STONE_MACRO, STONE_MINERAL, STONE_GRAIN, type TextureLayers } from './material-textures';
import { registerLightField } from './light-field';
import { createMaterialScene, type MaterialScene } from './material/material-scene';
import { CYCLADIC_APERTURE, OPEN_ENVIRONMENT, type LightEnvironment } from './material/light-environment';
import './material/material-chrome.css';
import './material-tokens.css';
import './material-playground.css';

type PlaygroundPresentation = { lighting: Lighting; interactions: MaterialInteractions; graph: MaterialGraphAdapter; materialScene?: MaterialScene };
const presentations = new WeakMap<HTMLElement, PlaygroundPresentation>();
/** Instance-scoped playground inspection, also used by the browser qualification. */
export function materialPlaygroundPresentation(root: HTMLElement) { return presentations.get(root); }

const neutralLocal = { x: 50, y: 50, proximity: 0, contact: 0, press: 0, lift: 0 };
export default function MaterialPlayground(props: { lightFieldEnabled?: boolean; graphFactory?: GraphFactory; threeSpike?: boolean; materialChrome?: boolean } = {}) {
  let root!: HTMLElement, container!: HTMLDivElement, minimap!: HTMLDivElement, panel!: HTMLDivElement, button!: HTMLButtonElement;
  let presentation: PlaygroundPresentation | undefined;
  let field!: HTMLDivElement;
  const [light, setLight] = createSignal<Light>(DEFAULT_LIGHT);
  const [finish, setFinish] = createSignal<StoneFinish>('limestone');
  const [textureLayers, setTextureLayers] = createSignal<TextureLayers>(DEFAULT_TEXTURE_LAYERS);
  const [selected, setSelected] = createSignal<FixtureNode | undefined>(REFERENCE_NODES[0]);
  const [zoom, setZoom] = createSignal(1), [count, setCount] = createSignal(13), [detail, setDetail] = createSignal<DetailLevel>('full');
  const [target, setTarget] = createSignal<'panel' | 'relief'>('relief');
  const [local, setLocal] = createSignal({ ...neutralLocal });
  const [reduced, setReduced] = createSignal(false), [motion, setMotion] = createSignal(false);
  const [systemMotion, setSystemMotion] = createSignal(false), [systemEffects, setSystemEffects] = createSignal(false);
  const [search, setSearch] = createSignal(''), [ready, setReady] = createSignal(false);
  const [occlusion, setOcclusion] = createSignal(true);
  function changeEnvironment(enabled: boolean) {
    setOcclusion(enabled);
    const environment = enabled ? CYCLADIC_APERTURE : OPEN_ENVIRONMENT;
    presentation?.materialScene?.setEnvironment(environment);
    (presentation?.graph as MaterialGraphAdapter & { setEnvironment?: (environment: LightEnvironment) => void })?.setEnvironment?.(environment);
  }
  const targetId = () => target() === 'panel' ? 'sample-panel' : selected()?.id;
  function clearLocal(id = targetId()) { if (id) presentation?.interactions.clear(id); setLocal({ ...neutralLocal }); }
  function updateLocal(key: keyof typeof neutralLocal, value: number) {
    const next = { ...local(), [key]: value }; setLocal(next);
    const id = targetId(), entry = id ? presentation?.interactions.target(id) : undefined;
    if (!entry || !id) return;
    const geometry = entry.geometry();
    presentation!.interactions.set(id, { position: { x: next.x / 100 * geometry.width, y: next.y / 100 * geometry.height }, proximity: next.proximity, contact: next.contact, press: next.press, lift: next.lift });
  }
  function updateLight(key: keyof Light, value: number) { const next = { ...light(), [key]: value }; setLight(next); presentation?.lighting.setLight(next); }
  function updateEffects() { presentation?.lighting.setEffects({ reducedEffects: reduced() || systemEffects(), reducedMotion: motion() || systemMotion() }); }
  function changeFixture(value: number) { clearLocal(); presentation?.graph.setFixture(value); setCount(value); setSearch(''); }
  function changeFinish(value: StoneFinish) { setFinish(value); presentation?.graph.setFinish(value); }
  function changeTexture(layer: keyof TextureLayers, value: number) { const next = { ...textureLayers(), [layer]: value }; setTextureLayers(next); presentation?.graph.setTextureLayers(next); }
  function reset() { presentation?.interactions.reset(); presentation?.lighting.reset(); changeFinish('limestone'); setTextureLayers(DEFAULT_TEXTURE_LAYERS); presentation?.graph.setTextureLayers(DEFAULT_TEXTURE_LAYERS); setLocal({ ...neutralLocal }); setLight(DEFAULT_LIGHT); }

  onMount(() => {
    const lighting = createLighting(root), interactions = createMaterialInteraction(lighting);
    const stopField = !props.materialChrome && props.lightFieldEnabled !== false ? registerLightField(field, lighting) : undefined;
    const graph = (props.graphFactory ?? createMaterialGraph)({ container, minimap, lighting, interactions, onZoom: setZoom, onSelection: node => {
      if (target() === 'relief') clearLocal(); setSelected(node);
    } });
    presentation = { lighting, interactions, graph }; presentations.set(root, presentation);
    if (props.materialChrome) {
      try { presentation.materialScene = createMaterialScene(root, lighting, available => { root.dataset.materialReady = String(available); }); }
      catch { root.dataset.materialReady = 'false'; }
    }
    const stopPanel = registerDomMaterial(panel, 'sample-panel', 'relief', lighting, interactions);
    const stopButton = registerDomMaterial(button, 'sample-button', 'raised', lighting, interactions);
    const down = () => interactions.set('sample-button', { press: 1, contact: .5 });
    const up = () => interactions.clear('sample-button');
    button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up); button.addEventListener('lostpointercapture', up); button.addEventListener('blur', up);
    const keyDown = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') down(); };
    button.addEventListener('keydown', keyDown); button.addEventListener('keyup', up);
    const windowUp = () => up(); window.addEventListener('pointerup', windowUp); window.addEventListener('blur', windowUp);
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)'), colours = window.matchMedia('(forced-colors: active)');
    const preferences = () => { setSystemMotion(motionQuery.matches); setSystemEffects(colours.matches); updateEffects(); };
    motionQuery.addEventListener('change', preferences); colours.addEventListener('change', preferences); preferences();
    graph.setFixture(); setReady(true);
    onCleanup(() => {
      presentations.delete(root); setReady(false);
      button.removeEventListener('pointerdown', down); button.removeEventListener('pointerup', up); button.removeEventListener('pointercancel', up); button.removeEventListener('lostpointercapture', up); button.removeEventListener('blur', up); button.removeEventListener('keydown', keyDown); button.removeEventListener('keyup', up);
      window.removeEventListener('pointerup', windowUp); window.removeEventListener('blur', windowUp);
      motionQuery.removeEventListener('change', preferences); colours.removeEventListener('change', preferences);
      stopField?.(); stopPanel(); stopButton(); graph.dispose(); presentation?.materialScene?.dispose(); interactions.dispose(); lighting.dispose(); presentation = undefined;
    });
  });

  const Range = (props: { label: string; value: () => number; min?: number; max: number; step?: number; unit?: string; change: (v: number) => void }) =>
    <label class="flint-material-range"><span>{props.label}<output>{props.value().toFixed(props.step && props.step < 1 ? 2 : 0)}{props.unit ?? ''}</output></span><input type="range" aria-label={props.label} min={props.min ?? 0} max={props.max} step={props.step ?? 1} value={props.value()} onInput={e => props.change(Number(e.currentTarget.value))} /></label>;

  return <main ref={root} class="flint-material-playground" data-ready={ready()} data-material-chrome={props.materialChrome ?? false}>
    <div class="flint-material-picture" aria-hidden="true" style={{ '--flint-macro-image': `url("${STONE_MACRO}")`, '--flint-mineral-image': `url("${STONE_MINERAL}")`, '--flint-micro-image': `url("${STONE_GRAIN}")`, '--flint-macro-amount': textureLayers().macro, '--flint-mineral-amount': textureLayers().mineral, '--flint-grain-amount': textureLayers().grain }}><span class="flint-material-cloud" /><span class="flint-material-minerals" /><span class="flint-material-pores" /></div>
    <Show when={!props.materialChrome && props.lightFieldEnabled !== false}><div class="flint-light-field" aria-hidden="true"><div ref={field} class="flint-light-field-plane" /></div></Show>
    <aside class="flint-material-library" aria-label="Reference library">
      <div class="flint-material-identity"><svg viewBox="0 0 72 100" aria-hidden="true"><path d="M36 4C8 4 7 27 11 52c4 23 14 38 26 43 14-8 23-27 25-50C65 15 52 4 36 4Z" fill="var(--flint-facet-front)"/><path d="M36 4C8 4 7 27 11 52c4 23 14 38 26 43Z" fill="var(--flint-facet-left)"/><path d="m37 24-4 37 9 0-2-37Z" fill="var(--flint-facet-top)"/><path d="m31 70 12 0-7 3Z" fill="#8c806a"/></svg><span>FLINT<small>—</small></span></div>
      <nav aria-label="Playground navigation"><a href={import.meta.env.BASE_URL}>⌂ <span>Mutable</span></a><span>▤ <span>Notes</span></span><FlintSurface class="flint-material-nav-current" elevation="relief">♧ <span>Graph</span></FlintSurface><span>▧ <span>Canvas</span></span><span>▢ <span>Templates</span></span><span>♙ <span>Archive</span></span></nav>
      <div class="flint-material-library-tree"><h2>Library</h2><p>⌄　▤　Poetry</p><p class="flint-material-indent">⌄　Eliot</p><FlintSurface elevation="etched">▤　The Waste Land</FlintSurface><p class="flint-material-indent">▤　The Hollow Men</p><p class="flint-material-indent">▤　Four Quartets</p><p>▸　▤　Greek</p><p>▤　Journal</p><p>▤　Research</p></div>
      <blockquote>“We shape our tools<br />and thereafter<br />they shape us.”<cite>— McLuhan</cite></blockquote>
    </aside>
    <div class="flint-material-workspace">
      <header class="flint-material-header"><div><span class="flint-material-kicker">MATERIAL STUDY · {props.materialChrome ? '2.5D MATERIAL ENVIRONMENT' : props.threeSpike ? 'PHASE A.5 · THREE.JS GRAPH' : 'PHASE A'}</span><h1>A space for ideas, carved in light.</h1></div><a href={`${import.meta.env.BASE_URL}${props.threeSpike ? 'flint-material' : 'flint-material-three'}`}>{props.threeSpike ? 'Compare SVG baseline ↗' : 'Compare Three.js spike ↗'}</a></header>
      <div class="flint-material-tabs" aria-label="Reference composition"><FlintSurface elevation="raised">▤　The Waste Land</FlintSurface><FlintSurface elevation="relief">♧　Graph</FlintSurface><span aria-hidden="true">＋</span></div>
      <div class="flint-material-stage">
        <section class="flint-material-graph-panel" aria-label="Material graph study">
          <div class="flint-material-graph-toolbar"><FlintButton aria-label="Fit graph" onClick={() => presentation?.graph.fit()}>⛶</FlintButton><FlintButton aria-label="Pan graph left" onClick={() => presentation?.graph.pan(40, 0)}>←</FlintButton><FlintButton aria-label="Pan graph right" onClick={() => presentation?.graph.pan(-40, 0)}>→</FlintButton><span>Reference composition</span></div>
          <div ref={container} class="flint-material-graph" tabindex="0" role="group" aria-label="Sculptural graph. Drag reliefs to move; drag empty space to pan. Arrow keys move the selected relief, or pan when none is selected. Control or Command with wheel zooms." />
          <FlintSurface elevation="relief" class="flint-material-minimap" aria-label="Graph minimap"><div ref={minimap} /></FlintSurface>
          <div class="flint-material-zoom"><FlintButton aria-label="Zoom out" onClick={() => presentation?.graph.zoomBy(-.1)}>−</FlintButton><output aria-label="Graph zoom">{Math.round(zoom() * 100)}%</output><FlintButton aria-label="Zoom in" onClick={() => presentation?.graph.zoomBy(.1)}>＋</FlintButton></div>
        </section>
        <aside class="flint-material-inspector" aria-label="Material controls">
          <FlintPanel elevation="flush" class="flint-material-description"><span class="flint-material-kicker">NODE · FIXTURE</span><h2>{selected()?.label ?? 'Select a relief'}</h2><p>{selected()?.relation ?? 'Use the graph or connections list.'}</p><Show when={count() === 13 && selected()?.id === "waste-land"}><p class="flint-material-description-text">A landmark modernist poem by T. S. Eliot (1922). Fragments, loss, spiritual desolation, and the search for renewal.</p><div class="flint-material-tags"><span>#poetry</span><span>#modernism</span><span>#rebirth</span></div></Show></FlintPanel>
          <FlintPanel elevation="flush" class="flint-material-controls"><h2>Light</h2>
            <Show when={props.materialChrome}><label><input type="checkbox" aria-label="Environmental occlusion" checked={occlusion()} onChange={e => changeEnvironment(e.currentTarget.checked)} /> Environmental occlusion</label></Show>
            <label class="flint-material-select">Stone finish<select aria-label="Stone finish" value={finish()} onChange={e => changeFinish(e.currentTarget.value as StoneFinish)}><option value="limestone">Limestone · fine grain</option><option value="marble">Pale marble · veined</option><option value="untextured">Limestone · shading only</option></select></label>
            <p class="flint-material-hint">Object textures appear in Full relief. Light and local response work with either stone.</p>
            <Range label="Direction" value={() => light().azimuth} max={359} unit="°" change={v => updateLight('azimuth', v)} />
            <Range label="Light elevation" value={() => light().elevation} min={15} max={80} unit="°" change={v => updateLight('elevation', v)} />
            <Range label="Intensity" value={() => light().intensity} min={.15} max={1.3} step={.01} change={v => updateLight('intensity', v)} />
            <Range label="Softness" value={() => light().softness} max={1} step={.01} change={v => updateLight('softness', v)} />
            <FlintButton class="flint-material-reset" onClick={reset}>Reset to Flint Default</FlintButton>
          </FlintPanel>
          <FlintPanel elevation="flush" class="flint-material-controls"><h2>Local response</h2><label class="flint-material-select">Surface<select aria-label="Local response surface" value={target()} onChange={e => { clearLocal(); setTarget(e.currentTarget.value as 'panel' | 'relief'); }}><option value="panel">DOM limestone panel</option><option value="relief" disabled={!selected()}>Selected {props.threeSpike ? 'stone' : 'SVG relief'}</option></select></label>
            <Range label="Contact X" value={() => local().x} max={100} unit="%" change={v => updateLocal('x', v)} />
            <Range label="Contact Y" value={() => local().y} max={100} unit="%" change={v => updateLocal('y', v)} />
            <Range label="Proximity" value={() => local().proximity} max={1} step={.01} change={v => updateLocal('proximity', v)} />
            <Range label="Contact" value={() => local().contact} max={1} step={.01} change={v => updateLocal('contact', v)} />
            <div class="flint-material-range-pair"><Range label="Press" value={() => local().press} max={1} step={.01} change={v => updateLocal('press', v)} /><Range label="Lift" value={() => local().lift} max={1} step={.01} change={v => updateLocal('lift', v)} /></div>
            <div class="flint-material-actions"><FlintButton disabled={!targetId() || motion() || systemMotion() || reduced() || systemEffects()} onClick={() => { const id = targetId(); if (id) presentation?.interactions.wave(id); }}>Send wave</FlintButton><FlintButton onClick={() => clearLocal()}>Clear local</FlintButton></div>
            <p class="flint-material-hint">{target() === "panel" ? "DOM sample below the graph. " : ""}Native pointer. Shared surface response.</p>
          </FlintPanel>
          <details class="flint-material-settings"><summary>Effects and graph detail</summary><Range label="Cloud variation" value={() => textureLayers().macro} max={1} step={.01} change={v => changeTexture('macro', v)} /><Range label="Mineral marks" value={() => textureLayers().mineral} max={1} step={.01} change={v => changeTexture('mineral', v)} /><Range label="Fine grain" value={() => textureLayers().grain} max={1} step={.01} change={v => changeTexture('grain', v)} /><label><input type="checkbox" checked={reduced()} onChange={e => { setReduced(e.currentTarget.checked); updateEffects(); }} /> Reduced effects</label><label><input type="checkbox" checked={motion()} onChange={e => { setMotion(e.currentTarget.checked); updateEffects(); }} /> Reduced motion</label><Show when={systemMotion() || systemEffects()}><p class="flint-material-hint">System accessibility preferences also apply.</p></Show><label class="flint-material-select">Detail<select aria-label="Graph detail" value={detail()} onChange={e => { const v = e.currentTarget.value as DetailLevel; setDetail(v); presentation?.graph.setDetail(v); }}><option value="full">Full relief</option><option value="simple">Simplified relief</option><option value="flat">Flat vector</option></select></label><label class="flint-material-select">Fixture<select aria-label="Graph fixture size" value={count()} onChange={e => changeFixture(Number(e.currentTarget.value))}><option value={13}>Reference · 13 reliefs</option><option value={50}>50 reliefs</option><option value={250}>250 reliefs</option><option value={1000}>1,000 reliefs</option></select></label></details>
          <details class="flint-material-connections" open><summary>Connections ({count() - 1})</summary><label>Find a relief<input type="search" aria-label="Find a relief" value={search()} onInput={e => setSearch(e.currentTarget.value)} /></label><ul><For each={(count() === 13 ? REFERENCE_NODES : presentation?.graph.nodes ?? []).filter(n => n.label.toLowerCase().includes(search().toLowerCase())).slice(0, 30)}>{n => <li><button type="button" aria-pressed={selected()?.id === n.id} onClick={() => presentation?.graph.select(n.id)}><span>{n.label}</span><small>{n.relation}</small></button></li>}</For></ul><Show when={count() > 30}><p class="flint-material-hint">Search to select a relief beyond the first 30.</p></Show><div class="flint-material-actions"><FlintButton aria-label="Move selected relief left" disabled={!selected()} onClick={() => presentation?.graph.move(-10, 0)}>←</FlintButton><FlintButton aria-label="Move selected relief up" disabled={!selected()} onClick={() => presentation?.graph.move(0, -10)}>↑</FlintButton><FlintButton aria-label="Move selected relief down" disabled={!selected()} onClick={() => presentation?.graph.move(0, 10)}>↓</FlintButton><FlintButton aria-label="Move selected relief right" disabled={!selected()} onClick={() => presentation?.graph.move(10, 0)}>→</FlintButton></div></details>
        </aside>
      </div>
      <section class="flint-material-samples" aria-label="Material samples">
        <FlintPanel ref={panel} class="flint-material-sample-panel"><div class="flint-material-content"><span class="flint-material-kicker">LIMESTONE · RELIEF</span><h2>These fragments I have shored against my ruins.</h2><p>A quiet surface for words. Contact, press and lift use the same material as the graph.</p></div></FlintPanel>
        <div class="flint-material-sample-buttons"><FlintButton ref={button} elevation="raised"><span class="flint-material-content">Raised · press to feel</span></FlintButton><FlintButton elevation="carved" onClick={reset}>Carved · reset light</FlintButton><div class="flint-material-swatches" aria-label="Cycladic palette"><For each={['chalk', 'ivory', 'limestone', 'marble', 'parchment']}>{name => <span style={{ 'background-color': `var(--flint-${name})` }}>{name}</span>}</For></div></div>
      </section>
      <footer class="flint-material-footer"><span>Same thing. Many forms.</span><span role="status">{selected() ? `${selected()!.label} selected` : 'No relief selected'}</span></footer>
    </div>
  </main>;
}
