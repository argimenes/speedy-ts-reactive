import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { BlockNode, BlockViewProps, NodeKey } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { BlockOutlet, ChildBlocks, RelationBlocks } from "./block-outlet";
import {
  highlightShapes,
  outlineShapes,
  rainbowShapes,
  spikyOutlineShapes,
  underlineShapes,
  type DecorationShape,
  type VisualFragment,
} from "./decorations";
import { blockAppearance } from "./appearance";
import { compileCellStyleRuns, cellStyleAt, hasActiveRange, standoffStyleSchema, standoffSvgStyles, type StandoffAnnotation } from "./standoff-styles";
import "./candidate-exclusions.css";
import { exclusionPosition } from "./candidate-exclusion-layout";
import { removeTextSuperposition, textSuperpositions, toggleSuperpositionReading, toggleSuperpositionVisibility, type TextSuperposition } from "../runtime/text-superposition";

function pointBoundary(root: HTMLElement, node: Node | null, offset: number): number {
  if (!node) return 0;
  if (node === root) {
    const childOffset = Math.max(0, Math.min(offset, root.childNodes.length));
    const previous = root.childNodes[childOffset - 1];
    if (previous instanceof HTMLElement) {
      const projectedEnd = Number(previous.dataset.superpositionEnd);
      if (Number.isInteger(projectedEnd)) return projectedEnd + 1;
      const inlineIndex = Number(previous.dataset.inlineIndex);
      if (Number.isInteger(inlineIndex)) return inlineIndex + 1;
    }
    return [...root.childNodes]
      .slice(0, childOffset)
      .reduce((boundary, child) => {
        if (!(child instanceof HTMLElement)) return boundary;
        if (child.classList.contains("reactive-inline-image")) return boundary + 1;
        return boundary + [...(child.textContent ?? "")].length;
      }, 0);
  }
  const element = node instanceof Element ? node : node.parentElement;
  const cell = element?.closest<HTMLElement>("[data-inline-index]");
  if (cell && root.contains(cell)) {
    const index = Number(cell.dataset.inlineIndex ?? 0);
    const projectedEnd = Number(cell.dataset.superpositionEnd);
    if (Number.isInteger(projectedEnd)) return offset > 0 ? projectedEnd + 1 : index;
    if (cell.classList.contains("reactive-inline-image")) return index + (offset > 0 ? 1 : 0);
    if (node.nodeType === Node.TEXT_NODE) {
      return index + [...(node.textContent ?? "").slice(0, offset)].length;
    }
    const range = document.createRange();
    try {
      range.setStart(cell, 0);
      range.setEnd(node, offset);
      return index + [...range.toString()].length;
    } catch {
      return index + (offset > 0 ? 1 : 0);
    }
  }
  return 0;
}

function restoreBoundary(root: HTMLElement, index: number): { node: Node; offset: number } {
  const bounded = Math.max(0, Math.min(index, root.childNodes.length));
  return { node: root, offset: bounded };
}

function rangeFragments(
  flow: HTMLElement,
  surface: HTMLElement,
  start: number,
  endInclusive: number,
): VisualFragment[] {
  const cells = flow.children;
  if (!cells.length) return [];
  const startCell = cells[Math.max(0, Math.min(start, cells.length - 1))];
  const endCell = cells[Math.max(0, Math.min(endInclusive, cells.length - 1))];
  const startNode = startCell.firstChild ?? startCell;
  const endNode = endCell.firstChild ?? endCell;
  const range = document.createRange();
  range.setStart(startNode, 0);
  range.setEnd(
    endNode,
    endNode.nodeType === Node.TEXT_NODE ? endNode.textContent?.length ?? 0 : endNode.childNodes.length,
  );
  const surfaceRect = surface.getBoundingClientRect();
  const rects = typeof range.getClientRects === "function" ? [...range.getClientRects()] : [];
  const fragments = rects
    .filter((rect) => rect.width > 0 || rect.height > 0)
    .map((rect) => ({
      x: rect.left - surfaceRect.left + surface.scrollLeft,
      y: rect.top - surfaceRect.top + surface.scrollTop,
      width: rect.width,
      height: rect.height,
    }));
  return fragments.reduce<VisualFragment[]>((merged, fragment) => {
    const previous = merged.at(-1);
    const sameLine = previous && Math.abs(previous.y - fragment.y) < 2 && Math.abs(previous.height - fragment.height) < 2;
    if (sameLine && fragment.x <= previous.x + previous.width + 2) {
      previous.width = Math.max(previous.x + previous.width, fragment.x + fragment.width) - previous.x;
    } else {
      merged.push({ ...fragment });
    }
    return merged;
  }, []);
}

function DecorationLayer(props: { class: string; shapes: DecorationShape[]; blendMode?: "color-dodge" }) {
  return (
    <svg class={props.class} aria-hidden="true" style={{ "mix-blend-mode": props.blendMode }}>
      <For each={props.shapes}>
        {(shape) => (
          <path
            data-property-type={shape.propertyType}
            data-decoration-key={shape.key}
            d={shape.path}
            stroke={shape.stroke ?? "none"}
            fill={shape.fill ?? "none"}
            stroke-width={shape.strokeWidth}
            opacity={shape.opacity}
            stroke-dasharray={shape.dashArray}
            stroke-linejoin="round"
            classList={{ "reactive-decoration--marching": shape.animated }}
          />
        )}
      </For>
    </svg>
  );
}

interface RegionEffect extends VisualFragment {
  key: string;
  type: string;
  filter: string;
  opacity: number;
  blendMode: string;
  limitation?: string;
}

function RegionEffectLayer(props: { regions: RegionEffect[] }) {
  return (
    <div class="reactive-standoff-effect-layer reactive-standoff-blur-layer" aria-hidden="true">
      <For each={props.regions}>
        {(region) => <span
          class="reactive-standoff-effect"
          classList={{ "reactive-standoff-blur": region.type === "style/blur" }}
          data-property-type={region.type}
          data-decoration-key={region.key}
          data-effect-limitation={region.limitation}
          style={{
            left: `${region.x}px`,
            top: `${region.y}px`,
            width: `${region.width}px`,
            height: `${region.height}px`,
            "--standoff-region-filter": region.filter,
            "--standoff-region-opacity": region.opacity,
            "--standoff-region-blend": region.blendMode,
          }}
        />}
      </For>
    </div>
  );
}

interface NoiseRegion extends VisualFragment {
  key: string;
  type: string;
  frequency: number;
  octaves: number;
  opacity: number;
  seed: number;
  blendMode: "multiply" | "soft-light";
  scanlineOpacity?: number;
}

const filterId = (key: string) => `standoff-noise-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
const scanlineId = (key: string) => `standoff-scanlines-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

function NoiseLayer(props: { regions: NoiseRegion[] }) {
  return <svg class="reactive-standoff-noise-layer" aria-hidden="true">
    <defs>
      <For each={props.regions}>{region => <filter id={filterId(region.key)} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency={region.frequency} numOctaves={region.octaves} seed={region.seed} />
        <feColorMatrix type="saturate" values="0" />
      </filter>}</For>
      <For each={props.regions.filter(region => !!region.scanlineOpacity)}>{region => <pattern id={scanlineId(region.key)} width="1" height="3" patternUnits="userSpaceOnUse">
        <line x1="0" y1="2.5" x2="1" y2="2.5" stroke="black" stroke-width="1" opacity={region.scanlineOpacity} />
      </pattern>}</For>
    </defs>
    <For each={props.regions}>{region => <rect
      data-property-type={region.type}
      data-decoration-key={region.key}
      x={region.x}
      y={region.y}
      width={region.width}
      height={region.height}
      filter={`url(#${filterId(region.key)})`}
      opacity={region.opacity}
      style={{ "mix-blend-mode": region.blendMode }}
    />}</For>
    <For each={props.regions.filter(region => !!region.scanlineOpacity)}>{region => <rect
      data-property-type={region.type}
      data-decoration-key={`${region.key}:scanlines`}
      x={region.x}
      y={region.y}
      width={region.width}
      height={region.height}
      fill={`url(#${scanlineId(region.key)})`}
      style={{ "mix-blend-mode": "multiply" }}
    />}</For>
  </svg>;
}

interface SuperpositionAnchor extends VisualFragment {
  key: string;
  property: TextSuperposition;
  alternativeKey: NodeKey;
}

function SuperpositionLayer(props: { owner: () => BlockNode | undefined; anchors: SuperpositionAnchor[] }) {
  const { editor } = useReactiveView();
  return <div class="reactive-superposition-layer" aria-label="Alternative readings">
    <For each={props.anchors}>{anchor => <section
      class="reactive-superposition-editor"
      data-superposition-id={anchor.property.id}
      data-native-context-menu
      style={{ left: `${anchor.x}px`, top: `${anchor.y + anchor.height + 5}px` }}
    >
      <header>
        <strong>Alternative</strong>
        <button type="button" onClick={() => { const owner = props.owner(); if (owner) toggleSuperpositionReading(editor, owner, anchor.property.id); }}>
          {anchor.property.active === "source" ? "Use alternative" : "Use source"}
        </button>
        <button type="button" aria-label="Hide alternative editor" title="Hide alternative editor" onClick={() => { const owner = props.owner(); if (owner) toggleSuperpositionVisibility(editor, owner, anchor.property.id); }}>×</button>
        <button type="button" class="reactive-superposition-editor__remove" onClick={() => { const owner = props.owner(); if (owner) removeTextSuperposition(editor, owner, anchor.property.id); }}>Remove</button>
      </header>
      <div class="reactive-superposition-editor__reading"><BlockOutlet nodeKey={anchor.alternativeKey} /></div>
    </section>}</For>
  </div>;
}

function parameter(annotation: StandoffAnnotation, name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(annotation[name]);
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function regionAppearance(annotation: StandoffAnnotation): Pick<RegionEffect, "filter" | "opacity" | "blendMode" | "limitation"> | undefined {
  switch (annotation.type) {
    case "style/blur": return { filter: `blur(${parameter(annotation, "amount", 3, 0, 32)}px)`, opacity: 1, blendMode: "normal" };
    case "style/motion-blur": {
      const x = parameter(annotation, "x", 6, 0, 24), y = parameter(annotation, "y", 0, 0, 24);
      return { filter: `blur(${Math.max(x, y) * .6}px)`, opacity: 1, blendMode: "normal", limitation: "isotropic-backdrop-fallback" };
    }
    case "style/grayscale": return { filter: `grayscale(${parameter(annotation, "amount", .75, 0, 1)})`, opacity: 1, blendMode: "normal" };
    case "style/sepia": return { filter: `sepia(${parameter(annotation, "amount", .8, 0, 1)})`, opacity: 1, blendMode: "normal" };
    case "style/invert": return { filter: `invert(${parameter(annotation, "amount", 1, 0, 1)})`, opacity: 1, blendMode: "normal" };
    case "style/contrast-brightness": return {
      filter: `contrast(${parameter(annotation, "contrast", 1.4, 0, 3)}) brightness(${parameter(annotation, "brightness", 1.1, 0, 3)})`,
      opacity: 1,
      blendMode: "normal",
    };
  }
}

function noiseAppearance(annotation: StandoffAnnotation): Pick<NoiseRegion, "frequency" | "octaves" | "opacity" | "seed" | "blendMode" | "scanlineOpacity"> | undefined {
  switch (annotation.type) {
    case "style/grain": return {
      frequency: parameter(annotation, "frequency", .75, .01, 1),
      octaves: Math.round(parameter(annotation, "octaves", 2, 1, 4)),
      opacity: parameter(annotation, "opacity", .12, 0, .5),
      seed: Math.round(parameter(annotation, "seed", 2, 0, 1000)),
      blendMode: "multiply",
    };
    case "style/ink-bleed": return {
      frequency: .55,
      octaves: 2,
      opacity: parameter(annotation, "roughness", .35, 0, 1) * .16,
      seed: 7,
      blendMode: "multiply",
    };
    case "style/turbulence": return {
      frequency: parameter(annotation, "frequency", .025, .005, .25),
      octaves: Math.round(parameter(annotation, "octaves", 2, 1, 4)),
      opacity: parameter(annotation, "opacity", .14, 0, .4),
      seed: Math.round(parameter(annotation, "seed", 4, 0, 1000)),
      blendMode: "soft-light",
    };
    case "amber-crt": return {
      frequency: .8,
      octaves: 2,
      opacity: parameter(annotation, "noise", .02, 0, .12),
      seed: 2,
      blendMode: "soft-light",
      scanlineOpacity: parameter(annotation, "scanlines", .1, 0, .3),
    };
  }
}

function ProjectedAlternative(props: { nodeKey: NodeKey; sourceIndex: number; sourceEnd: number; propertyId: string }) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const runs = createMemo(() => compileCellStyleRuns(
    ((node()?.payload.standoffProperties as StandoffAnnotation[] | undefined) ?? [])
      .map(property => editor.linkedAnnotations.resolve(property) as StandoffAnnotation),
  ));
  return <span
    class="reactive-superposition-projection"
    data-inline-index={props.sourceIndex}
    data-superposition-end={props.sourceEnd}
    data-superposition-id={props.propertyId}
    contentEditable={false}
    aria-label="Active alternative reading"
  ><For each={node()?.inlineContent ?? []}>{(cellKey, index) => {
    const cell = () => projection.state.nodes[cellKey];
    return <span style={cellStyleAt(runs(), index())}>{String(cell()?.payload.text ?? "")}</span>;
  }}</For></span>;
}

export function StandoffEditorView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const annotations = createMemo(
    () => ((node()?.payload.standoffProperties as StandoffAnnotation[] | undefined) ?? []).map(property => editor.linkedAnnotations.resolve(property) as StandoffAnnotation),
  );
  const superpositions = createMemo(() => editor.features.textSuperposition ? textSuperpositions(node()) : []);
  const showHideRanges = createMemo(() => annotations().map((annotation, index) => ({ annotation, id: annotation.id ?? index }))
    .filter(({ annotation }) => annotation.type === "style/show-hide" && hasActiveRange(annotation)));
  const concealedRanges = createMemo(() => showHideRanges().filter(({ id }) => !editor.showHide.shows(props.nodeKey, id)));
  const selectedShowHideRanges = createMemo(() => showHideRanges().filter(({ id }) => editor.showHide.shows(props.nodeKey, id) && editor.showHide.selectionActive(props.nodeKey, id)));
  const cellStyles = createMemo(() => compileCellStyleRuns(annotations()), undefined, {
    equals: (previous, next) => JSON.stringify(previous) === JSON.stringify(next),
  });
  const appearance = createMemo(() => blockAppearance(node()));
  let root!: HTMLDivElement;
  let surface!: HTMLDivElement;
  let flow!: HTMLDivElement;
  let disposeMount: (() => void) | undefined;
  let observer: ResizeObserver | undefined;
  let visibilityObserver: IntersectionObserver | undefined;
  let searchVisible = true;
  let frame = 0;
  const [highlighterShapes, setHighlighterShapes] = createSignal<DecorationShape[]>([]);
  const [foregroundShapes, setForegroundShapes] = createSignal<DecorationShape[]>([]);
  const [regionEffects, setRegionEffects] = createSignal<RegionEffect[]>([]);
  const [noiseRegions, setNoiseRegions] = createSignal<NoiseRegion[]>([]);
  const [superpositionAnchors, setSuperpositionAnchors] = createSignal<SuperpositionAnchor[]>([]);
  const [selectionShapes, setSelectionShapes] = createSignal<DecorationShape[]>([]);
  const [searchShapes, setSearchShapes] = createSignal<DecorationShape[]>([]);
  const [exclusions,setExclusions] = createSignal<Array<{ owner: string; id: string; x: number; y: number; active: boolean; fragments: VisualFragment[] }>>([]);
  const [hovered,setHovered] = createSignal<string>();
  let measuredOrigin = { x: 0,y: 0 };
  const hoverCandidate = (event: PointerEvent) => {
    if (!exclusions().length) return;
    const x = event.clientX - measuredOrigin.x, y = event.clientY - measuredOrigin.y;
    const control = exclusions().find(c => (x >= c.x - 5 && x <= c.x + 25 && y >= c.y - 5 && y <= c.y + 25) || c.fragments.some(f => x >= f.x - 6 && x <= f.x + f.width + 10 && y >= f.y - 12 && y <= f.y + f.height + 6));
    setHovered(control ? `${control.owner}:${control.id}` : undefined);
  };

  const captureSelection = () => {
    const selection = document.getSelection();
    if (!selection || !selection.rangeCount || !flow.contains(selection.anchorNode) || !flow.contains(selection.focusNode)) return undefined;
    return {
      anchor: pointBoundary(flow, selection.anchorNode, selection.anchorOffset),
      head: pointBoundary(flow, selection.focusNode, selection.focusOffset),
    };
  };

  const restoreSelection = (selection: { anchor: number; head: number }) => {
    const nativeSelection = document.getSelection();
    if (!nativeSelection) return;
    const anchor = restoreBoundary(flow, selection.anchor);
    const head = restoreBoundary(flow, selection.head);
    nativeSelection.removeAllRanges();
    const range = document.createRange();
    range.setStart(anchor.node, anchor.offset);
    range.collapse(true);
    nativeSelection.addRange(range);
    if (selection.anchor !== selection.head && typeof nativeSelection.extend === "function") {
      nativeSelection.extend(head.node, head.offset);
    }
  };

  const measure = () => {
    frame = 0;
    const foreground: DecorationShape[] = [];
    const highlighters: DecorationShape[] = [];
    const fragmentCache = new Map<string, VisualFragment[]>();
    const fragmentsFor = (start: number, end: number) => {
      const key = `${start}:${end}`;
      let fragments = fragmentCache.get(key);
      if (!fragments) fragmentCache.set(key, fragments = rangeFragments(flow, surface, start, end));
      return fragments;
    };
    standoffSvgStyles(annotations(), node()?.inlineContent.length ?? 0).forEach(({ annotation, svg, offset, index }) => {
      const key = `${props.nodeKey}:${annotation.id ?? annotation.type ?? "property"}:${index}`;
      const fragments = fragmentsFor(annotation.start, annotation.end);
      let shapes: DecorationShape[] = [];
      switch (svg.kind) {
        case "rainbow": shapes = rainbowShapes(key, fragments, offset); break;
        case "underline": shapes = underlineShapes(key, fragments, svg.colour, offset); break;
        case "highlighter":
          highlighters.push(...highlightShapes(key, fragments, "yellow").map((shape) => ({ ...shape, opacity: 1, propertyType: annotation.type })));
          return;
        case "rectangle": shapes = outlineShapes(key, fragments, "red"); break;
        case "spiky": shapes = spikyOutlineShapes(key, fragments, "red"); break;
      }
      foreground.push(...shapes.map((shape) => ({ ...shape, propertyType: annotation.type })));
    });
    const regions: RegionEffect[] = [];
    const noises: NoiseRegion[] = [];
    annotations().forEach((annotation, annotationIndex) => {
      if (!hasActiveRange(annotation) || annotation.start >= (node()?.inlineContent.length ?? 0)) return;
      const schema = standoffStyleSchema(annotation.type);
      if (!schema?.regionEffect && !schema?.noiseEffect) return;
      const key = `${props.nodeKey}:${annotation.id ?? annotation.type ?? "effect"}:${annotationIndex}`;
      fragmentsFor(annotation.start, annotation.end).forEach((fragment, fragmentIndex) => {
        const region = schema.regionEffect ? regionAppearance(annotation) : undefined;
        if (region) regions.push({ ...fragment, ...region, key: `${key}:region:${fragmentIndex}`, type: String(annotation.type) });
        const noise = schema.noiseEffect ? noiseAppearance(annotation) : undefined;
        if (noise) noises.push({ ...fragment, ...noise, key: `${key}:noise:${fragmentIndex}`, type: String(annotation.type) });
      });
    });
    const superpositionRegions: SuperpositionAnchor[] = [];
    const surfaceRect = surface.getBoundingClientRect();
    for (const property of superpositions()) {
      if (property.visible === false) continue;
      const alternativeKey = node()?.ownedRelations[property.alternatives[0]];
      if (!alternativeKey) continue;
      let fragment: VisualFragment | undefined;
      if (property.active === "source") fragment = fragmentsFor(property.start, property.end)[0];
      else {
        const element = [...flow.querySelectorAll<HTMLElement>("[data-superposition-id]")]
          .find(candidate => candidate.dataset.superpositionId === property.id);
        const rect = element?.getBoundingClientRect();
        if (rect) fragment = {
          x: rect.left - surfaceRect.left + surface.scrollLeft,
          y: rect.top - surfaceRect.top + surface.scrollTop,
          width: rect.width,
          height: rect.height,
        };
      }
      if (fragment) superpositionRegions.push({ ...fragment, key: `${props.nodeKey}:${property.id}`, property, alternativeKey });
    }
    const selectionSet = editor.selections.sets[props.nodeKey];
    const selected: DecorationShape[] = [];
    selectedShowHideRanges().forEach(({ annotation, id }) => {
      if (annotation.type !== "style/show-hide" || !hasActiveRange(annotation) || annotation.start >= (node()?.inlineContent.length ?? 0)) return;
      const key = `${props.nodeKey}:show-hide:${id}`;
      const fragments = fragmentsFor(annotation.start, annotation.end);
      selected.push(...[
        ...highlightShapes(key, fragments, "#8bd7c4"),
      ].map(shape => ({ ...shape, propertyType: "editor/show-hide-selection" })));
    });
    for (const overlay of editor.overlays.overlays) if (overlay.viewType === "entity-search" && !overlay.entityCandidates) {
      for (const range of overlay.entityRanges ?? []) if (range.nodeKey === props.nodeKey && range.end > range.start) selected.push(...highlightShapes(`${props.nodeKey}:entity-search`, rangeFragments(flow, surface, range.start, range.end - 1), "#f2c767"));
    }
    const cross = editor.crossText.segments[props.nodeKey];
    if (cross && cross.end > cross.start) selected.push(...highlightShapes(`${props.nodeKey}:cross-text`, rangeFragments(flow, surface, cross.start, cross.end - 1), "#75a9e8"));
    const preview = editor.overlays.overlays.find(overlay => overlay.ownerKey === props.nodeKey && overlay.viewType === "annotation-panel")?.annotationPreview;
    if (preview) selected.push(...highlightShapes(`${props.nodeKey}:annotation-preview`, rangeFragments(flow, surface, preview.start, preview.end), "#f2c767"));
    selectionSet?.items.forEach((item) => {
      const start = Math.min(item.anchor.boundary.index, item.head.boundary.index);
      const end = Math.max(item.anchor.boundary.index, item.head.boundary.index);
      if (start === end) return;
      selected.push(
        ...highlightShapes(
          `${props.nodeKey}:${item.id}`,
          rangeFragments(flow, surface, start, Math.max(start, end - 1)),
          item.id === selectionSet.primaryId ? "#75a99a" : "#b692d1",
        ),
      );
    });
    setHighlighterShapes(highlighters);
    setForegroundShapes(foreground);
    setRegionEffects(regions);
    setNoiseRegions(noises);
    setSuperpositionAnchors(superpositionRegions);
    setSelectionShapes(selected);
    const search: DecorationShape[] = [];
    const controls: ReturnType<typeof exclusions> = [];
    const origin = searchVisible && (editor.decorations.nodes[props.nodeKey] ?? []).some(d => d.excludable) ? surface.getBoundingClientRect() : undefined;
    if (origin) measuredOrigin = { x: origin.left,y: origin.top };
    for (const decoration of searchVisible ? editor.decorations.nodes[props.nodeKey] ?? [] : []) {
      const fragments = rangeFragments(flow, surface, decoration.range.start, decoration.range.end - 1);
      search.push(...highlightShapes(decoration.id, fragments, decoration.fill).map(shape => ({ ...shape, propertyType: decoration.type })));
      if (decoration.active) search.push(...outlineShapes(`${decoration.id}:active`, fragments, "#8a5100"));
      const position = decoration.excludable && origin ? exclusionPosition(fragments,origin,{ width: window.innerWidth,height: window.innerHeight }) : undefined;
      if (position) controls.push({ owner: decoration.owner,id: decoration.id,...position,active: decoration.active,fragments });
    }
    setSearchShapes(search);
    setExclusions(controls);
  };

  const scheduleMeasure = () => {
    if (frame) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      else clearTimeout(frame);
    }
    frame = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(measure)
      : (setTimeout(measure, 0) as unknown as number);
  };
  const onCandidateScroll = () => { if (searchVisible && (editor.decorations.nodes[props.nodeKey] ?? []).some(d => d.excludable)) scheduleMeasure(); };

  onMount(() => {
    document.addEventListener("scroll",onCandidateScroll,true);
    disposeMount = editor.mounts.register(props.nodeKey, {
      root,
      focusElement: flow,
      inputPolicy: "standoff",
      focus: () => flow.focus({ preventScroll: true }),
      captureInlineSelection: captureSelection,
      restoreInlineSelection: restoreSelection,
      inlinePoint: (node, offset) => flow.contains(node) ? pointBoundary(flow, node, offset) : undefined,
      inlinePointAt: (x, y) => {
        // Browser caret hit tests can remain pinned to the active editing host
        // while dragging. Resolve against the actual paragraph under the pointer.
        let closest = 0, distance = Infinity;
        Array.from(flow.children).forEach((cell, index) => {
          for (const rect of Array.from(cell.getClientRects())) {
            const dy = Math.max(rect.top - y, 0, y - rect.bottom);
            const dx = Math.max(rect.left - x, 0, x - rect.right);
            const score = dy * dy * 10000 + dx * dx;
            if (score < distance) { distance = score; closest = index + (x >= (rect.left + rect.right) / 2 ? 1 : 0); }
          }
        });
        return closest;
      },
      inlineBoundary: index => {
        const cell = flow.children[Math.min(index, flow.children.length - 1)];
        if (cell?.firstChild?.nodeType === Node.TEXT_NODE) return { node: cell.firstChild, offset: index < flow.children.length ? 0 : cell.firstChild.textContent!.length };
        return restoreBoundary(flow, index);
      },
      captureText: () => (node()?.inlineContent ?? []).map((cellKey, index) => {
        const projected = superpositions().some(property => property.active !== "source" && property.start <= index && property.end >= index);
        return projected
          ? String(projection.state.nodes[cellKey]?.payload.text ?? "")
          : String(flow.children[index]?.textContent ?? projection.state.nodes[cellKey]?.payload.text ?? "");
      }).join(""),
    });
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleMeasure);
      observer.observe(surface);
    }
    if (typeof IntersectionObserver !== "undefined") {
      visibilityObserver = new IntersectionObserver(entries => { const visible = entries[0]?.isIntersecting ?? false; if (visible !== searchVisible) { searchVisible = visible; scheduleMeasure(); } });
      visibilityObserver.observe(surface);
    }
    scheduleMeasure();
  });

  createEffect(() => {
    node()?.inlineContent.length;
    concealedRanges();
    selectedShowHideRanges();
    JSON.stringify(annotations());
    for (const property of superpositions()) {
      const alternative = projection.state.nodes[node()?.ownedRelations[property.alternatives[0]] ?? ""];
      alternative?.inlineContent.length;
      JSON.stringify(alternative?.payload.standoffProperties);
    }
    editor.selections.sets[props.nodeKey]?.revision;
    JSON.stringify(editor.decorations.nodes[props.nodeKey]);
    editor.overlays.overlays.find(overlay => overlay.viewType === "entity-search")?.entityCandidates;
    editor.crossText.segments[props.nodeKey]?.start;
    editor.crossText.segments[props.nodeKey]?.end;
    const preview = editor.overlays.overlays.find(overlay => overlay.ownerKey === props.nodeKey && overlay.viewType === "annotation-panel")?.annotationPreview;
    preview?.start; preview?.end;
    scheduleMeasure();
  });

  onCleanup(() => {
    document.removeEventListener("scroll",onCandidateScroll,true);
    if (editor.crossText.segments[props.nodeKey]) queueMicrotask(() => editor.crossText.validate());
    disposeMount?.();
    observer?.disconnect();
    visibilityObserver?.disconnect();
    if (frame) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      else clearTimeout(frame);
    }
  });

  return (
    <div
      ref={root}
      class={`abstract-block reactive-standoff-block ${appearance().classes.join(" ")}`}
      style={appearance().style}
      classList={{ "reactive-block--focused": editor.focus.state.focusedKey === props.nodeKey }}
      data-block-id={(node()?.payload.id as string | undefined) ?? ""}
      data-client-id={props.nodeKey}
      data-runtime-key={props.nodeKey}
      data-block-type="standoff-editor-block"
    >
      <div ref={surface} class="reactive-standoff-surface" onPointerMove={hoverCandidate} onPointerLeave={() => setHovered(undefined)}>
        <DecorationLayer class="reactive-annotation-layer reactive-annotation-layer--foreground" shapes={highlighterShapes()} blendMode="color-dodge" />
        <DecorationLayer class="reactive-selection-layer" shapes={selectionShapes()} />
        <DecorationLayer class="reactive-selection-layer reactive-search-layer" shapes={searchShapes()} />
        <For each={exclusions()}>{control => <button type="button" class="candidate-exclusion" data-candidate-exclusion data-native-context-menu aria-label="Exclude this mention" title="Exclude this mention from entity binding" classList={{ "candidate-exclusion--visible": control.active || hovered() === `${control.owner}:${control.id}` }} style={{ left: `${control.x}px`,top: `${control.y}px` }}
          onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}
          onClick={event => { event.preventDefault(); event.stopPropagation(); editor.decorations.exclude(control.owner,control.id); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter" || event.key === " ") { event.preventDefault(); editor.decorations.exclude(control.owner,control.id); } }}
        >×</button>}</For>
        <div
          ref={flow}
          class="reactive-standoff-flow"
          contentEditable={!editor.crossText.segments[props.nodeKey]}
          tabIndex={0}
          aria-readonly={!!editor.crossText.segments[props.nodeKey]}
          role="textbox"
          aria-multiline="true"
          spellcheck={true}
        >
          <For each={node()?.inlineContent ?? []}>
            {(cellKey, index) => {
              const cell = () => projection.state.nodes[cellKey];
              const projected = () => superpositions().find(property =>
                property.active !== "source" && index() >= property.start && index() <= property.end &&
                !!node()?.ownedRelations[property.active]);
              return (
                <Show when={!projected() || index() === projected()!.start} fallback={<span
                  class="reactive-superposition-source-cell"
                  data-inline-key={cellKey}
                  data-inline-index={index()}
                  aria-hidden="true"
                >{String(cell()?.payload.text ?? "")}</span>}>
                  <Show when={projected()} fallback={<Show
                    when={cell()?.viewType === "image-cell"}
                    fallback={<span
                      data-inline-key={cellKey}
                      data-inline-index={index()}
                      style={cellStyleAt(cellStyles(), index())}
                      classList={{ "reactive-standoff-cell--concealed": concealedRanges().some(({ annotation }) => hasActiveRange(annotation) && annotation.start <= index() && annotation.end >= index()) }}
                    >{(cell()?.payload.text as string | undefined) ?? ""}</span>}
                  >
                    <span
                      class="reactive-inline-image"
                      data-inline-key={cellKey}
                      data-inline-index={index()}
                      contentEditable={false}
                      role="img"
                      aria-label={String(cell()?.payload.alt ?? "Inline image")}
                    >
                      <img
                        src={String(cell()?.payload.src ?? "")}
                        alt={String(cell()?.payload.alt ?? "")}
                        width={cell()?.payload.width as number | undefined}
                        height={cell()?.payload.height as number | undefined}
                        onLoad={() => {
                          editor.commands.updateInlineImage(cellKey, { status: "ready" });
                          scheduleMeasure();
                        }}
                        onError={() => editor.commands.updateInlineImage(cellKey, { status: "failed" })}
                      />
                    </span>
                  </Show>}>{property => <ProjectedAlternative
                    nodeKey={node()!.ownedRelations[property().active]}
                    sourceIndex={index()}
                    sourceEnd={property().end}
                    propertyId={property().id}
                  />}</Show>
                </Show>
              );
            }}
          </For>
        </div>
        <SuperpositionLayer owner={node} anchors={superpositionAnchors()} />
        <RegionEffectLayer regions={regionEffects()} />
        <NoiseLayer regions={noiseRegions()} />
        <DecorationLayer class="reactive-annotation-layer reactive-annotation-layer--foreground" shapes={foregroundShapes()} />
      </div>
      <RelationBlocks parentKey={props.nodeKey} />
      <ChildBlocks parentKey={props.nodeKey} />
    </div>
  );
}
