import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import type { NodeKey } from "../block-tree/types";
import type { MinimapMarker } from "../runtime/minimap";
import { useReactiveView } from "../reactive-editor/context";
import "./page-minimap.css";

const MIN_RAIL_HEIGHT = 120;
const MANICULE_LANE = 32;
const HIT_TOLERANCE = 4;

interface DrawnMarker {
  owner: string;
  priority: number;
  marker: MinimapMarker;
  y: number;
  height: number;
  active: boolean;
}

interface Layout {
  visible: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  total: number;
  omitted: number;
  viewportTop: number;
  viewportHeight: number;
}

const hidden = (element: Element) => !!element.closest('[hidden], [aria-hidden="true"]');

function scrollport(page: HTMLElement): HTMLElement | undefined {
  let candidate: HTMLElement | null = page.closest<HTMLElement>(".workspace-demo__document--flow") ?? page;
  while (candidate) {
    const style = getComputedStyle(candidate);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return candidate;
    candidate = candidate.parentElement;
  }
}

function viewportRect(owner?: HTMLElement) {
  if (!owner || owner === document.body || owner === document.documentElement) return { top: 0, right: window.innerWidth, bottom: window.innerHeight, left: 0 };
  const rect = owner.getBoundingClientRect();
  return { top: Math.max(0, rect.top), right: Math.min(window.innerWidth, rect.right), bottom: Math.min(window.innerHeight, rect.bottom), left: Math.max(0, rect.left) };
}

function textRangeRect(marker: MinimapMarker, page: HTMLElement, handle: { root: Element; inlineBoundary?: (index: number) => { node: Node; offset: number } }) {
  if (marker.anchor.kind !== "text-range") return;
  const { range } = marker.anchor;
  if (!handle || hidden(handle.root) || !page.contains(handle.root)) return;
  if (range.coordinate !== "cell" || !handle.inlineBoundary) return handle.root.getBoundingClientRect();
  const start = handle.inlineBoundary(range.start), end = handle.inlineBoundary(range.end);
  if (!start || !end) return;
  const domRange = document.createRange();
  try {
    domRange.setStart(start.node, start.offset);
    domRange.setEnd(end.node, end.offset);
    const rects = typeof domRange.getClientRects === "function" ? [...domRange.getClientRects()].filter(rect => rect.width > 0 || rect.height > 0) : [];
    if (!rects.length) return handle.root.getBoundingClientRect();
    const top = Math.min(...rects.map(rect => rect.top)), bottom = Math.max(...rects.map(rect => rect.bottom));
    const left = Math.min(...rects.map(rect => rect.left)), right = Math.max(...rects.map(rect => rect.right));
    return { top, bottom, left, right, width: right - left, height: bottom - top } as DOMRect;
  } catch { return; }
}

export function PageMinimap(props: { pageKey: NodeKey; page: () => HTMLElement; main: () => HTMLElement }) {
  const { editor } = useReactiveView();
  const [layout, setLayout] = createSignal<Layout>({ visible: false, left: 0, top: 0, width: 20, height: 0, total: 0, omitted: 0, viewportTop: 0, viewportHeight: 0 });
  let canvas!: HTMLCanvasElement;
  let frame = 0;
  let drawn: DrawnMarker[] = [];
  let thumbDrag: { pointerId: number; offset: number; startY: number; moved: boolean } | undefined;
  let suppressClick = false;
  let observer: ResizeObserver | undefined;
  let mutation: MutationObserver | undefined;
  let observed = new WeakSet<Element>();

  const observe = (element?: Element) => {
    if (!element || observed.has(element)) return;
    observed.add(element); observer?.observe(element);
  };

  const measureMarker = (marker: MinimapMarker, page: HTMLElement, pageTop: number, extent: number) => {
    if (marker.anchor.kind === "ratio") return { y: Math.max(0, Math.min(1, marker.anchor.top)) * extent, height: Math.max(0, Math.min(1, marker.anchor.height ?? 0)) * extent };
    const handle = marker.anchor.kind === "block" ? editor.mounts.get(marker.anchor.nodeKey) : editor.mounts.get(marker.anchor.range.nodeKey);
    if (!handle || hidden(handle.root) || !page.contains(handle.root)) return;
    observe(handle.root);
    const rect = marker.anchor.kind === "block" ? handle.root.getBoundingClientRect() : textRangeRect(marker, page, handle);
    if (!rect) return;
    return { y: rect.top - pageTop + page.scrollTop, height: Math.max(0, rect.height) };
  };

  const redraw = () => {
    frame = 0;
    const page = props.page(), main = props.main(), options = editor.minimap.state.options;
    const layers = editor.minimap.layersFor(props.pageKey);
    const visible = layers.filter(layer => layer.visible);
    const total = visible.reduce((count, layer) => count + layer.markers.filter(marker => !marker.group || !layer.hiddenGroups.has(marker.group)).length, 0);
    if (!page?.isConnected || !main?.isConnected || !total) { drawn = []; setLayout({ visible: false, left: 0, top: 0, width: options.width, height: 0, total, omitted: total, viewportTop: 0, viewportHeight: 0 }); return; }

    const owner = scrollport(page), available = viewportRect(owner), mainRect = main.getBoundingClientRect();
    observe(page); observe(main); observe(owner);
    if (mainRect.width <= 0) { drawn = []; setLayout({ visible: false, left: 0, top: 0, width: options.width, height: 0, total, omitted: total, viewportTop: 0, viewportHeight: 0 }); return; }
    const availableHeight = Math.max(0, available.bottom - available.top);
    const requestedHeight = options.height === "available" ? (availableHeight || options.fallbackHeight) : Math.min(options.height, availableHeight || options.height);
    const height = Math.max(0, requestedHeight);
    const left = options.side === "right" ? mainRect.right + MANICULE_LANE : mainRect.left - MANICULE_LANE - options.width;
    const fitsSide = options.side === "right" ? left + options.width <= available.right : left >= available.left;
    if (height < MIN_RAIL_HEIGHT || !fitsSide) { drawn = []; setLayout({ visible: false, left, top: available.top, width: options.width, height, total, omitted: total, viewportTop: 0, viewportHeight: 0 }); return; }

    const pageRect = page.getBoundingClientRect();
    const extent = Math.max(1, page.scrollHeight, pageRect.height);
    const resolved: DrawnMarker[] = [];
    for (const layer of visible) for (const marker of layer.markers) {
      if (marker.group && layer.hiddenGroups.has(marker.group)) continue;
      const source = measureMarker(marker, page, pageRect.top, extent);
      if (!source || !Number.isFinite(source.y) || !Number.isFinite(source.height)) continue;
      const y = Math.max(0, Math.min(height, source.y / extent * height));
      const markerHeight = Math.max(marker.minimumThickness ?? options.minimumMarkerThickness, source.height / extent * height);
      resolved.push({ owner: layer.owner, priority: layer.priority, marker, y: Math.min(height - Math.min(markerHeight, height), y), height: Math.min(markerHeight, height), active: layer.active === marker.id || layer.active === marker.group });
    }
    drawn = resolved;
    const pageVisibleTop = Math.max(pageRect.top, available.top), pageVisibleBottom = Math.min(pageRect.bottom, available.bottom);
    const rawViewportTop = pageVisibleBottom > pageVisibleTop ? (pageVisibleTop - pageRect.top + page.scrollTop) / extent * height : 0;
    const viewportHeight = pageVisibleBottom > pageVisibleTop ? Math.min(height, Math.max(2, (pageVisibleBottom - pageVisibleTop) / extent * height)) : 0;
    const viewportTop = Math.max(0, Math.min(Math.max(0, height - viewportHeight), rawViewportTop));
    const next = { visible: true, left, top: available.top, width: options.width, height, total, omitted: total - resolved.length, viewportTop, viewportHeight };
    setLayout(next);

    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(options.width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext("2d"); if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, options.width, height);
    if (viewportHeight) {
      context.globalCompositeOperation = "source-over"; context.globalAlpha = 1; context.fillStyle = "rgba(35,58,52,.09)"; context.fillRect(0, viewportTop, options.width, viewportHeight);
      context.strokeStyle = "rgba(35,58,52,.45)"; context.lineWidth = 1; context.strokeRect(.5, viewportTop + .5, options.width - 1, Math.max(1, viewportHeight - 1));
    }
    for (const item of resolved) {
      context.globalCompositeOperation = options.blendMode; context.globalAlpha = item.marker.opacity;
      context.fillStyle = "#ffd34d"; context.fillStyle = item.marker.colour; context.fillRect(0, item.y, options.width, item.height);
      if (item.active) { context.globalCompositeOperation = "source-over"; context.globalAlpha = 1; context.strokeStyle = "#7a4900"; context.lineWidth = 2; context.strokeRect(1, item.y, options.width - 2, Math.max(2, item.height)); }
    }
    context.globalAlpha = 1; context.globalCompositeOperation = "source-over";
  };

  const schedule = () => {
    if (frame) return;
    frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(redraw) : (setTimeout(redraw, 0) as unknown as number);
  };

  const candidates = (event: { clientY: number }) => {
    const y = pointerY(event);
    return drawn.filter(item => y >= item.y - HIT_TOLERANCE && y <= item.y + item.height + HIT_TOLERANCE)
      .sort((a, b) => Math.abs(y - (a.y + a.height / 2)) - Math.abs(y - (b.y + b.height / 2)) || b.priority - a.priority || a.marker.id.localeCompare(b.marker.id));
  };

  const pointerY = (event: { clientY: number }) => {
    const rect = canvas.getBoundingClientRect();
    return (event.clientY - rect.top) * (layout().height / Math.max(1, rect.height));
  };

  const overThumb = (y: number) => {
    const current = layout();
    return current.viewportHeight > 0 && y >= current.viewportTop && y <= current.viewportTop + current.viewportHeight;
  };

  const scrollToThumb = (requestedTop: number) => {
    const current = layout(), page = props.page(), owner = scrollport(page);
    if (!owner || current.height <= 0 || current.viewportHeight <= 0) return;
    const top = Math.max(0, Math.min(current.height - current.viewportHeight, requestedTop));
    const extent = Math.max(1, page.scrollHeight, page.getBoundingClientRect().height);
    const desiredPageY = top / current.height * extent;
    if (owner === page) {
      const visibleHeight = page.clientHeight || page.getBoundingClientRect().height;
      owner.scrollTop = Math.max(0, Math.min(Math.max(0, page.scrollHeight - visibleHeight), desiredPageY));
    } else {
      const ownerRect = owner.getBoundingClientRect(), pageRect = page.getBoundingClientRect();
      const pageTopInOwner = pageRect.top - ownerRect.top + owner.scrollTop;
      const visibleTopInOwner = viewportRect(owner).top - ownerRect.top;
      const maximum = Math.max(0, owner.scrollHeight - (owner.clientHeight || ownerRect.height));
      owner.scrollTop = Math.max(0, Math.min(maximum, pageTopInOwner + desiredPageY - visibleTopInOwner));
    }
    schedule();
  };

  createEffect(() => { editor.minimap.state.revision; schedule(); });
  onMount(() => {
    observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    mutation = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(schedule);
    mutation?.observe(props.page(), { childList: true, subtree: true, characterData: true });
    const unsubscribe = editor.mounts.subscribe(schedule);
    document.addEventListener("scroll", schedule, true); window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule); window.visualViewport?.addEventListener("scroll", schedule);
    props.page().addEventListener("load", schedule, true);
    document.fonts?.addEventListener?.("loadingdone", schedule);
    schedule();
    onCleanup(() => {
      unsubscribe(); observer?.disconnect(); mutation?.disconnect();
      document.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("scroll", schedule);
      props.page()?.removeEventListener("load", schedule, true); document.fonts?.removeEventListener?.("loadingdone", schedule);
      if (frame) typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(frame) : clearTimeout(frame);
      observed = new WeakSet(); drawn = [];
    });
  });

  const summary = () => {
    const visible = layout().total - layout().omitted;
    return `${visible} minimap ${visible === 1 ? "marker" : "markers"}${layout().omitted ? `; ${layout().omitted} hidden` : ""}`;
  };
  return <Portal><Show when={layout().visible}>
    <aside class="page-minimap" data-page-minimap={props.pageKey} data-side={editor.minimap.state.options.side} role="complementary" aria-label={`Page minimap: ${summary()}`}
      style={{ left: `${layout().left}px`, top: `${layout().top}px`, width: `${layout().width}px`, height: `${layout().height}px` }}>
      <canvas ref={canvas} aria-hidden="true" style={{ width: `${layout().width}px`, height: `${layout().height}px` }}
        onPointerDown={event => {
          const y = pointerY(event);
          if (event.button !== 0 || !overThumb(y)) return;
          thumbDrag = { pointerId: event.pointerId, offset: y - layout().viewportTop, startY: y, moved: false };
          event.currentTarget.setPointerCapture?.(event.pointerId); event.currentTarget.style.cursor = "grabbing"; event.preventDefault();
        }}
        onPointerMove={event => {
          const y = pointerY(event);
          if (thumbDrag?.pointerId === event.pointerId) {
            thumbDrag.moved ||= Math.abs(y - thumbDrag.startY) > 2;
            scrollToThumb(y - thumbDrag.offset); event.currentTarget.style.cursor = "grabbing"; return;
          }
          const hits = candidates(event);
          event.currentTarget.style.cursor = overThumb(y) ? "grab" : "pointer";
          event.currentTarget.title = hits.length ? `${hits[0].marker.label ?? "Marker"}${hits.length > 1 ? ` (+${hits.length - 1} overlapping)` : ""}` : overThumb(y) ? "Drag to scroll this Page" : `${summary()}; click to scroll`;
        }}
        onPointerUp={event => {
          if (thumbDrag?.pointerId !== event.pointerId) return;
          suppressClick = thumbDrag.moved; thumbDrag = undefined; event.currentTarget.releasePointerCapture?.(event.pointerId);
          event.currentTarget.style.cursor = overThumb(pointerY(event)) ? "grab" : "pointer";
        }}
        onPointerCancel={event => { if (thumbDrag?.pointerId === event.pointerId) { thumbDrag = undefined; suppressClick = true; event.currentTarget.style.cursor = "pointer"; } }}
        onPointerLeave={event => { if (!thumbDrag) { event.currentTarget.title = summary(); event.currentTarget.style.cursor = "pointer"; } }}
        onWheel={event => {
          const owner = scrollport(props.page()); if (!owner) return;
          const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? (owner.clientHeight || owner.getBoundingClientRect().height) : 1;
          owner.scrollTop += event.deltaY * scale; event.preventDefault(); schedule();
        }}
        onClick={event => {
          if (suppressClick) { suppressClick = false; event.preventDefault(); return; }
          const hit = candidates(event)[0];
          if (hit) { event.preventDefault(); editor.minimap.activate(hit.owner, hit.marker.id); return; }
          const y = pointerY(event); if (overThumb(y)) return;
          event.preventDefault(); scrollToThumb(y - layout().viewportHeight / 2);
        }} />
    </aside>
  </Show></Portal>;
}
