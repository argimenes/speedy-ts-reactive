import { beginDragSample, trackDragPlacement, dragStage } from "./drag-profile";
import { batch, createSignal } from "solid-js";
import { arrangedPlacement, type PlacementChange } from "./arrangement";
import type { SpatialPlacement } from "./model";
interface ArrangementPort {
  placement(id: string): SpatialPlacement | undefined;
  available(id: string): boolean;
  grabHeight?(x: number, y: number): number | undefined;
  point(x: number, y: number, height?: number): { x: number; z: number } | undefined;
  select(id: string): void;
  commit(id: string, change: PlacementChange, expected: SpatialPlacement): boolean;
}
/** Exactly one captured move and one settled sidecar commit. Preview publishes
 * immediately; only the scene coalesces rendering into RAF. Cancel writes nothing. */
export function createArrangementInput(port: ArrangementPort) {
  const [preview, setPreview] = createSignal<SpatialPlacement>();
  const [owned, setOwned] = createSignal(false);
  let pending: SpatialPlacement | undefined;
  let gesture: { pointer: number; element: HTMLElement; id: string; original: SpatialPlacement; height: number; start: { x: number; z: number }; x: number; y: number; moved: boolean } | undefined;
  const valid = () => !!gesture && port.available(gesture.id) && JSON.stringify(port.placement(gesture.id)) === JSON.stringify(gesture.original);
  const flush = () => { if (pending) { dragStage(pending, "published"); setPreview(pending); } };
  const release = () => {
    const g = gesture; gesture = undefined; pending = undefined;
    if (g) {
      g.element.removeEventListener("pointermove", move); g.element.removeEventListener("pointerup", up);
      g.element.removeEventListener("pointercancel", cancel); g.element.removeEventListener("lostpointercapture", cancel);
      if (g.element.hasPointerCapture(g.pointer)) g.element.releasePointerCapture(g.pointer);
    }
    batch(() => { setPreview(undefined); setOwned(false); });
  };
  const cancel = () => release();
  const finish = () => {
    const g = gesture;
    try {
      if (g && valid()) { flush(); const value = preview(); if (g.moved && value) port.commit(g.id, { position: value.position }, g.original); }
    } finally { release(); }
  };
  const move = (e: PointerEvent) => {
    const g = gesture; if (!g || e.pointerId !== g.pointer) return;
    if (!valid()) { cancel(); return; }
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return;
    const sample = beginDragSample();
    const point = port.point(e.clientX, e.clientY, g.height); if (sample) sample.intersection = performance.now(); if (!point) return;
    g.moved = true;
    pending = arrangedPlacement(g.original, { position: { x: g.original.position.x + point.x - g.start.x, z: g.original.position.z + point.z - g.start.z } });
    trackDragPlacement(pending, sample);
    flush(); e.preventDefault();
  };
  const up = (e: PointerEvent) => { if (e.pointerId === gesture?.pointer) { move(e); finish(); } };
  return {
    preview, owned, cancel, finish,
    validate() { if (gesture && !valid()) cancel(); },
    start(e: PointerEvent, id: string) {
      if (gesture || e.button !== 0 || !port.available(id)) return false;
      const height = port.grabHeight?.(e.clientX, e.clientY) ?? 0;
      const original = port.placement(id), start = port.point(e.clientX, e.clientY, height); if (!original || !start) return false;
      const element = e.currentTarget as HTMLElement;
      gesture = { pointer: e.pointerId, element, id, original, height, start, x: e.clientX, y: e.clientY, moved: false };
      element.addEventListener("pointermove", move); element.addEventListener("pointerup", up);
      element.addEventListener("pointercancel", cancel); element.addEventListener("lostpointercapture", cancel);
      element.setPointerCapture(e.pointerId); element.focus({ preventScroll: true });
      setOwned(true); port.select(id); return true;
    },
  };
}
