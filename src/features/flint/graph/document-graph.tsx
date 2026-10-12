import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { DocumentApplicationInstance } from '../../../feature-api/document-application';
import { createLighting } from '../lighting';
import { materialChromePresentation, MATERIAL_CHANGE_EVENT } from '../material/material-chrome';
import { createMaterialInteraction } from '../material-interaction';
import type { MaterialGraphAdapter } from './three-material-graph';
import { documentGraphNodes } from './document-graph-layout';
import './graph.css';

/** One view of the existing entity inventory. No indexing, persistence or second editor. */
export function DocumentGraph(props: { application: DocumentApplicationInstance; root: () => HTMLElement; showDocument: () => void }) {
  const app = props.application;
  let container!: HTMLDivElement, minimap!: HTMLDivElement, live = true;
  const [graph, setGraph] = createSignal<MaterialGraphAdapter>();
  const [selected, setSelected] = createSignal<string>(), [zoom, setZoom] = createSignal(1);
  const [status, setStatus] = createSignal('Preparing stone reliefs…');
  const [filter, setFilter] = createSignal(''), [page, setPage] = createSignal(0);
  const rows = createMemo(() => (app.entities?.rows() ?? []).filter(row => row.name.toLocaleLowerCase().includes(filter().toLocaleLowerCase())));
  const pageSize = 48;
  createEffect(() => { app.properties()?.id; filter(); setPage(0); });
  createEffect(() => { const last = Math.max(0, Math.ceil(rows().length / pageSize) - 1); if (page() > last) setPage(last); });
  const visibleRows = () => rows().slice(page() * pageSize, (page() + 1) * pageSize);
  const selectedRow = () => app.entities?.rows().find(row => row.id === selected());
  const nodes = createMemo(() => { const doc = app.properties(); return doc ? documentGraphNodes(doc, visibleRows()) : []; }, [], { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) });
  createEffect(() => { const adapter = graph(), data = nodes(); if (adapter) adapter.setNodes(data); });
  onMount(() => {
    const shared = materialChromePresentation(props.root())?.lighting;
    const lighting = shared ?? createLighting(container), interactions = createMaterialInteraction(lighting);
    let adapter: MaterialGraphAdapter | undefined;
    const motion = !shared ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
    const colours = !shared ? window.matchMedia?.('(forced-colors: active)') : undefined;
    const preferences = () => lighting.setEffects({reducedMotion:motion?.matches ?? false,reducedEffects:colours?.matches ?? false});
    if (!shared) preferences();
    motion?.addEventListener('change',preferences); colours?.addEventListener('change',preferences);
    const options = { container, minimap, lighting, interactions, onZoom: setZoom, onSelection: (node: {id: string} | undefined) => setSelected(node?.id) };
    const updateMaterials = () => {
      const presentation = materialChromePresentation(props.root());
      if (!presentation || !adapter) return;
      adapter.setEnvironment?.(presentation.environment);
      adapter.setFinish(presentation.material === 'marble' ? 'marble' : 'limestone');
    };
    props.root().addEventListener(MATERIAL_CHANGE_EVENT, updateMaterials);
    const start = async () => {
      try {
        if (!window.WebGLRenderingContext || lighting.effects.reducedEffects) throw Error('Use accessible reliefs');
        const { createThreeMaterialGraph } = await import('./three-material-graph');
        if (!live) return;
        adapter = createThreeMaterialGraph(options, props.root());
        setStatus('Drag reliefs to arrange. Drag the surface to pan. ⌘/Ctrl + wheel to zoom.');
      } catch {
        if (!live) return;
        container.replaceChildren(); delete container.dataset.renderer;
        try {
          if (typeof ResizeObserver === 'undefined') throw Error('Graphics unavailable');
          const { createMaterialGraph } = await import('./material-graph');
          if (!live) return;
          adapter = createMaterialGraph(options); adapter.setDetail('simple');
          setStatus('Simplified reliefs. All entity references remain available below.');
        } catch { setStatus('Graphics unavailable. Use the entity controls below.'); }
      }
      if (live && adapter) { setGraph(adapter); updateMaterials(); }
    };
    void start();
    onCleanup(() => { live = false; motion?.removeEventListener('change',preferences); colours?.removeEventListener('change',preferences); props.root().removeEventListener(MATERIAL_CHANGE_EVENT, updateMaterials); adapter?.dispose(); interactions.dispose(); if (!shared) lighting.dispose(); });
  });
  const focus = () => { const id = selectedRow()?.id, documentId = app.properties()?.id; props.showDocument(); if (id) requestAnimationFrame(() => { if (app.properties()?.id === documentId) app.entities?.focus(id); }); };
  return <section class="flint-document-graph" aria-label="Document entity graph">
    <div class="flint-graph-toolbar"><strong>{app.properties()?.title}</strong><span>Entity references</span><button type="button" onClick={() => graph()?.fit()}>Fit graph</button><button type="button" aria-label="Refresh graph entities" disabled={app.entities?.pending()} onClick={() => app.entities?.refresh()}>Refresh</button></div>
    <div class="flint-graph-stage">
      <div ref={container} class="flint-material-graph" tabIndex={0} role="group" aria-label="Entity reliefs. Drag to arrange. Arrow keys move the selected relief, or pan when none is selected." />
      <div ref={minimap} class="flint-graph-minimap" aria-hidden="true" />
      <div class="flint-graph-zoom"><button aria-label="Zoom graph out" onClick={() => graph()?.zoomBy(-.1)}>−</button><output>{Math.round(zoom() * 100)}%</output><button aria-label="Zoom graph in" onClick={() => graph()?.zoomBy(.1)}>+</button></div>
    </div>
    <div class="flint-graph-inspection" aria-live="polite"><strong>{selectedRow()?.name ?? app.properties()?.title}</strong><span>{selectedRow() ? `${selectedRow()!.documentMentions} mentions in this Document` : 'Select an entity to find its mentions.'}</span><button onClick={focus}>{selectedRow() ? 'Show occurrences in Document' : 'Edit Document'}</button></div>
    <details class="flint-graph-entities"><summary>Linked entities ({app.entities?.rows().length ?? 0})</summary>
      <label>Find an entity<input type="search" aria-label="Find graph entity" value={filter()} onInput={e => setFilter(e.currentTarget.value)} /></label>
      <div class="flint-graph-entity-buttons"><For each={visibleRows()}>{row => <button aria-pressed={selected() === row.id} onClick={() => { setSelected(row.id); graph()?.select(row.id); }}>{row.name}<small>{row.documentMentions}</small></button>}</For></div>
      <Show when={rows().length > pageSize}><div><button disabled={!page()} onClick={() => setPage(page() - 1)}>Previous entities</button><span> {page() + 1} / {Math.ceil(rows().length / pageSize)} </span><button disabled={(page() + 1) * pageSize >= rows().length} onClick={() => setPage(page() + 1)}>Next entities</button></div></Show>
    </details>
    <p class="flint-graph-help" role="status">{app.entities?.pending() ? 'Loading entity names…' : status()} <Show when={!app.entities?.rows().length}>This Document has no entity references yet. Link entities from the text editor to populate the graph.</Show></p>
  </section>;
}
