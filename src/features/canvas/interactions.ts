import { batch, createSignal } from "solid-js";
import type { CanvasBounds, CanvasCamera, CanvasLayout } from "../../reactive-editor/workspace-presentation";

export interface CanvasInteractionPort {
  layout(): CanvasLayout | undefined;
  available(): boolean;
  camera(value: CanvasCamera): void;
  bounds(id: string, value: CanvasBounds): void;
}
export interface CanvasResize {
  size: { width: number; height: number };
  minimum: { width: number; height: number };
  expanded(size: { width: number; height: number }): { width: number; height: number };
}
export function anchoredZoom(camera: CanvasCamera, factor: number, point: { x: number; y: number }): CanvasCamera {
  const zoom = Math.max(.1, Math.min(4, camera.zoom * factor));
  return { ...camera, zoom, x: camera.x + point.x / camera.zoom - point.x / zoom, y: camera.y + point.y / camera.zoom - point.y / zoom };
}
/** Canvas owns capture and transient previews. No editor, document lookup or input middleware. */
export function createCanvasInteractions(port: CanvasInteractionPort) {
  const [previewCamera, setCamera] = createSignal<CanvasCamera>();
  const [previewBounds, setBounds] = createSignal<{ id: string; bounds: CanvasBounds }>();
  const [owned, setOwned] = createSignal(false);
  let frame = 0, wheelTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingCamera: CanvasCamera | undefined, pendingBounds: { id: string; bounds: CanvasBounds } | undefined;
  let gesture: { id: number; element: HTMLElement; x: number; y: number; camera: CanvasCamera; mode: "pan" | "move" | "resize"; placement?: string; bounds?: CanvasBounds; resize?: CanvasResize } | undefined;
  const camera = () => previewCamera() ?? port.layout()?.camera ?? { x: 0, y: 0, zoom: 1 };
  const bounds = (id: string) => previewBounds()?.id === id ? previewBounds()!.bounds : port.layout()?.placements.find(p => p.id === id)?.bounds;
  const flush = () => { if (frame) cancelAnimationFrame(frame); frame = 0; batch(() => { if (pendingCamera) setCamera(pendingCamera); if (pendingBounds) setBounds(pendingBounds); }); };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(flush); };
  const key = (e: KeyboardEvent) => { if (e.key === "Escape" && owned()) { e.preventDefault(); e.stopImmediatePropagation(); cancel(); } };
  const blur = () => cancel();
  const release = () => {
    const old = gesture; gesture = undefined;
    clearTimeout(wheelTimer); wheelTimer = undefined;
    if (frame) cancelAnimationFrame(frame); frame = 0;
    window.removeEventListener("keydown", key, true); window.removeEventListener("blur", blur);
    if (old) {
      old.element.removeEventListener("pointermove", move); old.element.removeEventListener("pointerup", up);
      old.element.removeEventListener("pointercancel", cancel); old.element.removeEventListener("lostpointercapture", cancel);
      if (old.element.hasPointerCapture?.(old.id)) old.element.releasePointerCapture(old.id);
    }
    pendingCamera = undefined; pendingBounds = undefined;
    batch(() => { setCamera(undefined); setBounds(undefined); setOwned(false); });
  };
  const cancel = () => release();
  const finish = () => {
    flush();
    const c = previewCamera(), b = previewBounds();
    try { batch(() => { if (c) port.camera(c); if (b) port.bounds(b.id, b.bounds); }); } finally { release(); }
  };
  const acquire = () => { setOwned(true); window.addEventListener("keydown", key, true); window.addEventListener("blur", blur); };
  const move = (e: PointerEvent) => {
    const g = gesture; if (!g || g.id !== e.pointerId) return;
    if (!port.available()) { cancel(); return; }
    const dx = (e.clientX - g.x) / g.camera.zoom, dy = (e.clientY - g.y) / g.camera.zoom;
    if (g.mode === "pan") pendingCamera = { ...g.camera, x: g.camera.x - dx, y: g.camera.y - dy };
    else {
      const b = g.bounds!;
      const size = g.resize;
      pendingBounds = { id: g.placement!, bounds: g.mode === "move" ? { ...b, x: b.x + dx, y: b.y + dy }
        : { ...b, ...(size ? size.expanded({ width: Math.max(size.minimum.width, size.size.width + dx), height: Math.max(size.minimum.height, size.size.height + dy) }) : { width: Math.max(100, b.width + dx), height: Math.max(80, b.height + dy) }) } };
    }
    schedule(); e.preventDefault();
  };
  const up = (e: PointerEvent) => { if (e.pointerId === gesture?.id) { move(e); finish(); } };
  const start = (e: PointerEvent, mode: "pan" | "move" | "resize", placement?: string, resize?: CanvasResize) => {
    if (!port.available() || (e.button !== 0 && e.button !== 1)) return;
    finish();
    const element = e.currentTarget as HTMLElement;
    gesture = { id: e.pointerId, element, x: e.clientX, y: e.clientY, camera: camera(), mode, placement, bounds: placement ? bounds(placement) : undefined, resize };
    if (mode !== "pan" && !gesture.bounds) { gesture = undefined; return; }
    element.setPointerCapture?.(e.pointerId);
    element.addEventListener("pointermove", move); element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", cancel); element.addEventListener("lostpointercapture", cancel);
    acquire(); element.focus({ preventScroll: true }); e.preventDefault(); e.stopPropagation();
  };
  const wheel = (e: WheelEvent, point: { x: number; y: number }) => {
    if (!port.available() || gesture || e.ctrlKey || e.metaKey) return;
    const c = pendingCamera ?? camera(), unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 600 : 1;
    pendingCamera = e.altKey ? anchoredZoom(c, Math.exp(-e.deltaY * unit * .002), point) : { ...c, x: c.x + e.deltaX * unit / c.zoom, y: c.y + e.deltaY * unit / c.zoom };
    acquire(); schedule(); clearTimeout(wheelTimer); wheelTimer = setTimeout(finish, 160); e.preventDefault();
  };
  const zoom = (factor: number, point: { x: number; y: number }) => { if (!port.available()) return; finish(); port.camera(anchoredZoom(camera(), factor, point)); };
  return { camera, bounds, owned, start, wheel, zoom, cancel, finish };
}
