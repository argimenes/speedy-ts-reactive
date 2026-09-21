import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { BlockViewProps, NodeKey } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { ChildBlocks, RelationBlocks } from "./block-outlet";
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

function pointBoundary(root: HTMLElement, node: Node | null, offset: number): number {
  if (!node) return 0;
  if (node === root) {
    const childOffset = Math.max(0, Math.min(offset, root.childNodes.length));
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

interface BlurRegion extends VisualFragment {
  key: string;
  amount: number;
}

function BlurLayer(props: { regions: BlurRegion[] }) {
  return (
    <div class="reactive-standoff-blur-layer" aria-hidden="true">
      <For each={props.regions}>
        {(region) => {
          const filter = `blur(${region.amount}px)`;
          return <span
            class="reactive-standoff-blur"
            data-property-type="style/blur"
            data-decoration-key={region.key}
            style={{
              left: `${region.x}px`,
              top: `${region.y}px`,
              width: `${region.width}px`,
              height: `${region.height}px`,
              "--standoff-blur": filter,
            }}
          />;
        }}
      </For>
    </div>
  );
}

function blurAmount(annotation: StandoffAnnotation): number {
  const amount = Number(annotation.amount ?? 3);
  return Number.isFinite(amount) && amount >= 0 ? Math.min(amount, 32) : 3;
}

export function StandoffEditorView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const annotations = createMemo(
    () => ((node()?.payload.standoffProperties as StandoffAnnotation[] | undefined) ?? []).map(property => editor.linkedAnnotations.resolve(property) as StandoffAnnotation),
  );
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
  const [blurRegions, setBlurRegions] = createSignal<BlurRegion[]>([]);
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
    standoffSvgStyles(annotations(), node()?.inlineContent.length ?? 0).forEach(({ annotation, svg, offset, index }) => {
      const key = `${props.nodeKey}:${annotation.id ?? annotation.type ?? "property"}:${index}`;
      const fragments = rangeFragments(flow, surface, annotation.start, annotation.end);
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
    const blurs: BlurRegion[] = [];
    annotations().forEach((annotation, annotationIndex) => {
      if (!hasActiveRange(annotation) || !standoffStyleSchema(annotation.type)?.blur || annotation.start >= (node()?.inlineContent.length ?? 0)) return;
      const key = `${props.nodeKey}:${annotation.id ?? annotation.type ?? "blur"}:${annotationIndex}`;
      rangeFragments(flow, surface, annotation.start, annotation.end).forEach((fragment, fragmentIndex) => {
        blurs.push({ ...fragment, key: `${key}:${fragmentIndex}`, amount: blurAmount(annotation) });
      });
    });
    const selectionSet = editor.selections.sets[props.nodeKey];
    const selected: DecorationShape[] = [];
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
    setBlurRegions(blurs);
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
      captureText: () => flow.textContent ?? "",
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
    JSON.stringify(annotations());
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
              return (
                <Show
                  when={cell()?.viewType === "image-cell"}
                  fallback={
                    <span
                      data-inline-key={cellKey}
                      data-inline-index={index()}
                      style={cellStyleAt(cellStyles(), index())}
                    >
                      {(cell()?.payload.text as string | undefined) ?? ""}
                    </span>
                  }
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
                </Show>
              );
            }}
          </For>
        </div>
        <BlurLayer regions={blurRegions()} />
        <DecorationLayer class="reactive-annotation-layer reactive-annotation-layer--foreground" shapes={foregroundShapes()} />
      </div>
      <RelationBlocks parentKey={props.nodeKey} />
      <ChildBlocks parentKey={props.nodeKey} />
    </div>
  );
}
