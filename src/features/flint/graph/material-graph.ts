import { Graph, MiniMap, Selection, type Node, type NodeMetadata } from '@antv/x6';
import type { Lighting } from '../lighting';
import type { MaterialInteractions } from '../material-interaction';
import { fixtureNodes, type FixtureNode } from './material-fixture';
import { installReliefDefinitions, svgElement } from '../relief-defs';
import { LIMESTONE, materialForFinish, type MaterialResponse, type Position, type StoneFinish } from '../material-response';

export type DetailLevel = 'full' | 'simple' | 'flat';
export function createMaterialGraph(options: {
  container: HTMLElement; minimap: HTMLElement; lighting: Lighting; interactions: MaterialInteractions;
  onSelection: (node: FixtureNode | undefined) => void; onZoom: (zoom: number) => void;
}) {
  const { container, lighting, interactions } = options;
  const prefix = `flint-relief-${crypto.randomUUID()}`;
  let registrations: (() => void)[] = [], ownedLocalDefs: Element[] = [], nodes: readonly FixtureNode[] = [];
  let selectedId: string | undefined, detail: DetailLevel = 'full', disposed = false;
  let material = LIMESTONE;
  const graph = new Graph({
    container, width: container.clientWidth, height: container.clientHeight, async: false,
    grid: false, background: false,
    panning: { enabled: true, eventTypes: ['leftMouseDown', 'mouseWheel'] },
    mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'], minScale: .15, maxScale: 2.5 },
    interacting: { nodeMovable: true, edgeMovable: false, arrowheadMovable: false, vertexMovable: false },
    connecting: { allowBlank: false, allowNode: false, allowEdge: false },
    guard: e => e.target instanceof Element && !!e.target.closest('.flint-graph-label'),
  });
  graph.use(new Selection({ enabled: true, multiple: false, rubberband: false, showNodeSelectionBox: true, movable: true }));
  graph.use(new MiniMap({ container: options.minimap, width: 168, height: 112, padding: 8, scalable: false, graphOptions: { async: false } }));
  const definitions = installReliefDefinitions(graph.view.defs, prefix, lighting);
  const contextual = svgElement('g', { class: 'flint-contextual-outlines', 'pointer-events': 'none', 'aria-hidden': 'true' });
  graph.view.stage.prepend(contextual);

  function select(id?: string) {
    selectedId = id;
    const node = id ? graph.getCellById(id) : undefined;
    graph.resetSelection(node ? [node] : []);
    options.onSelection(nodes.find(n => n.id === id));
  }
  graph.on('node:click', ({ node }) => select(node.id));
  graph.on('blank:click', () => select());
  graph.on('scale', () => options.onZoom(graph.zoom()));
  const labelClick = (event: MouseEvent) => {
    const label = event.target instanceof Element ? event.target.closest('.flint-graph-label') : null;
    const id = label?.closest('[data-fixture-id]')?.getAttribute('data-fixture-id');
    if (id && (window.getSelection()?.isCollapsed ?? true)) select(id);
  };
  container.addEventListener('click', labelClick);

  function addNode(spec: FixtureNode) {
    const localId = `${prefix}-local-${spec.id}`;
    const glow = svgElement('radialGradient', { id: `${localId}-glow`, cx: '50%', cy: '50%', r: '70%' });
    glow.append(svgElement('stop', { offset: 0, 'stop-color': '#fffdf0', 'stop-opacity': 1 }), svgElement('stop', { offset: 1, 'stop-color': '#fffdf0', 'stop-opacity': 0 }));
    const filter = svgElement('filter', { id: `${localId}-shadow`, x: '-100%', y: '-100%', width: '300%', height: '300%', 'color-interpolation-filters': 'sRGB' });
    const shadow = svgElement('feDropShadow', { 'flood-color': '#504735' }); filter.append(shadow);
    // Only selected/local targets need private definitions; attach lazily on interaction.
    let localAttached = false;
    const markup: NodeMetadata['markup'] = [
      { tagName: 'rect', selector: 'hit', className: 'flint-graph-hit' },
      { tagName: 'g', selector: 'sculpture', className: 'flint-graph-sculpture', children: [
        { tagName: 'g', selector: 'relief', className: 'flint-graph-relief', children: [{ tagName: 'g', selector: 'form', children: [{ tagName: 'use', selector: 'art' }] }] },
        { tagName: 'g', selector: 'field', children: [{ tagName: 'rect', selector: 'contact' }, { tagName: 'ellipse', selector: 'wave' }] },
      ] },
      { tagName: 'text', selector: 'label', className: 'flint-graph-label' },
    ];
    const elevation = spec.form === 'mask' ? 'object' : 'relief';
    const node = graph.addNode({
      id: spec.id, x: spec.x, y: spec.y, width: spec.width, height: spec.height, markup,
      attrs: {
        root: { 'data-fixture-id': spec.id, 'aria-label': `${spec.label}, ${spec.relation}`, role: 'img' },
        hit: { width: spec.width, height: spec.height, rx: 10, fill: 'transparent', stroke: 'none' },
        sculpture: { 'pointer-events': 'none' },
        relief: { filter: `url(#${prefix}-${elevation})` },
        form: { transform: `scale(${spec.width / 100},${spec.height / 100})` },
        art: { href: `#${prefix}-${spec.form}`, width: 100, height: 100 },
        field: { transform: `scale(${spec.width / 100},${spec.height / 100})`, 'clip-path': `url(#${prefix}-clip)`, 'pointer-events': 'none' },
        contact: { width: 100, height: 100, fill: `url(#${localId}-glow)`, opacity: 0 },
        wave: { fill: 'none', stroke: '#fffdf0', strokeWidth: 2, opacity: 0 },
        label: { refX: 0, refY: 0, x: spec.width / 2, y: spec.height + 23, textAnchor: 'middle', text: spec.label, fontSize: spec.form === 'mask' ? 24 : 18, fontFamily: 'Georgia, serif', fill: 'var(--flint-ink)', 'pointer-events': 'auto' },
      },
    });
    const apply = (r: MaterialResponse, active: boolean) => {
      if (active && !localAttached) { graph.view.defs.append(glow, filter); ownedLocalDefs.push(glow, filter); localAttached = true; }
      if (active) {
        glow.setAttribute('cx', `${r.normalisedPosition.x * 100}%`); glow.setAttribute('cy', `${r.normalisedPosition.y * 100}%`);
        shadow.setAttribute('dx', String(r.shadow.x)); shadow.setAttribute('dy', String(r.shadow.y)); shadow.setAttribute('stdDeviation', String(r.shadow.blur / 2)); shadow.setAttribute('flood-opacity', String(r.shadow.opacity));
      }
      node.attr({
        relief: { filter: `url(#${active ? `${localId}-shadow` : `${prefix}-${elevation}`})`, transform: `translate(0,${-r.travel})` },
        contact: { opacity: r.glow }, wave: { cx: r.wave.x * 100 / spec.width, cy: r.wave.y * 100 / spec.height, rx: r.wave.radius * 100 / spec.width, ry: r.wave.radius * 100 / spec.height, opacity: r.wave.opacity },
        root: { 'data-local-active': String(active) },
      });
    };
    const localGeometry = { width: spec.width, height: spec.height };
    const clientToLocal = (p: Position) => {
      const local = graph.clientToLocal(p), position = node.position();
      return { x: local.x - position.x, y: local.y - position.y };
    };
    registrations.push(interactions.register({ id: spec.id, material, elevation, geometry: () => localGeometry, apply, clientToLocal,
      capabilities: [{ kind: 'drag', label: 'Move relief', available: true }, { kind: 'inspect', label: 'Inspect fixture node', available: true }],
    }));
    return node;
  }
  function setFixture(count = 13) {
    for (const stop of registrations.splice(0)) stop();
    for (const el of ownedLocalDefs.splice(0)) el.remove();
    graph.clearCells(); contextual.replaceChildren();
    nodes = fixtureNodes(count);
    graph.batchUpdate(() => {
      for (const spec of nodes) addNode(spec);
      for (let i = 1; i < nodes.length; i++) {
        const source = count === 13 ? nodes[0].id : nodes[i - 1].id;
        graph.addEdge({ source, target: nodes[i].id, zIndex: -1,
          attrs: { line: { stroke: '#79705f', strokeWidth: .8, targetMarker: null, sourceMarker: null, strokeDasharray: i % 3 === 0 ? '4 4' : '' } },
        });
      }
    });
    if (count === 13) {
      for (const [cx, cy, rx, ry] of [[348, 191, 94, 99], [774, 342, 91, 91], [551, 619, 118, 91]]) {
        contextual.append(svgElement('ellipse', { cx, cy, rx, ry, fill: 'none', stroke: '#817562', 'stroke-width': .8, 'stroke-dasharray': '4 5' }));
      }
      for (const [cx, cy] of [[257, 151], [242, 329], [267, 413], [434, 224], [534, 210], [687, 264], [697, 334], [523, 523], [397, 552], [355, 499], [474, 647]]) {
        contextual.append(svgElement('circle', { cx, cy, r: 6, fill: `url(#${prefix}-body)`, filter: `url(#${prefix}-relief)` }));
      }
    }
    select(nodes[0]?.id); fit();
  }
  function fit() { graph.zoomToFit({ padding: 60, maxScale: 1.15, minScale: .15 }); options.onZoom(graph.zoom()); }
  const resize = new ResizeObserver(() => { if (!disposed) { graph.resize(container.clientWidth, container.clientHeight); fit(); } });
  resize.observe(container);
  const cancelled = () => { if (selectedId) interactions.clear(selectedId); };
  container.addEventListener('pointercancel', cancelled); container.addEventListener('lostpointercapture', cancelled);
  const keydown = (e: KeyboardEvent) => {
    if (e.target !== container) return;
    if (e.key === 'Escape') { select(); e.preventDefault(); }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const distance = e.shiftKey ? 20 : 5;
      const dx = e.key === 'ArrowLeft' ? -distance : e.key === 'ArrowRight' ? distance : 0;
      const dy = e.key === 'ArrowUp' ? -distance : e.key === 'ArrowDown' ? distance : 0;
      const node = selectedId ? graph.getCellById(selectedId) as Node : undefined;
      if (node) node.translate(dx, dy); else { const p = graph.translate(); graph.translate(p.tx - dx, p.ty - dy); }
      e.preventDefault();
    }
  };
  container.addEventListener('keydown', keydown);
  container.dataset.detail = detail;
  container.dataset.finish = 'limestone';
  return {
    graph, prefix, setFixture, select, fit,
    get nodes() { return nodes; }, get selectedId() { return selectedId; }, get disposed() { return disposed; },
    setDetail(value: DetailLevel) { detail = value; container.dataset.detail = value; options.minimap.dataset.detail = 'flat'; definitions.setDetail(value); },
    setFinish(finish: StoneFinish) {
      material = materialForFinish(finish); container.dataset.finish = finish;
      definitions.setFinish(finish);
      for (const spec of nodes) { const target = interactions.target(spec.id); if (target) target.material = material; if (interactions.state(spec.id)) interactions.refresh(spec.id); }
    },
    zoomBy(delta: number) { graph.zoomTo(Math.max(.15, Math.min(2.5, graph.zoom() + delta))); },
    pan(dx: number, dy: number) { const p = graph.translate(); graph.translate(p.tx + dx, p.ty + dy); },
    move(dx: number, dy: number) { if (selectedId) (graph.getCellById(selectedId) as Node)?.translate(dx, dy); },
    dispose() { disposed = true; resize.disconnect(); definitions.dispose(); for (const stop of registrations.splice(0)) stop(); for (const el of ownedLocalDefs.splice(0)) el.remove(); container.removeEventListener('keydown', keydown); container.removeEventListener('click', labelClick); container.removeEventListener('pointercancel', cancelled); container.removeEventListener('lostpointercapture', cancelled); graph.dispose(); },
  };
}
export type MaterialGraph = ReturnType<typeof createMaterialGraph>;
