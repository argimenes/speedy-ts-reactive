import { batch, createSignal } from "solid-js";
import { arrangedPlacement, type PlacementChange } from "./arrangement";
import type { SpatialPlacement } from "./model";
interface ArrangementPort {
  placement(id: string): SpatialPlacement | undefined;
  available(id: string): boolean;
  point(x: number, y: number): { x: number; z: number } | undefined;
  select(id: string): void;
  commit(id: string, change: PlacementChange, expected: SpatialPlacement): boolean;
}
/** Exactly one captured move, with one pending RAF preview and one settled
 * sidecar commit. Save flushes the latest pointer delta; cancel writes nothing. */
export function createArrangementInput(port: ArrangementPort) {
  const [preview, setPreview] = createSignal<SpatialPlacement>();
  const [owned, setOwned] = createSignal(false);
  let frame = 0, pending: SpatialPlacement | undefined;
  let gesture: { pointer: number; element: HTMLElement; id: string; original: SpatialPlacement; start: { x: number; z: number }; x: number; y: number; moved: boolean } | undefined;
  const valid = () => !!gesture && port.available(gesture.id) && JSON.stringify(port.placement(gesture.id)) === JSON.stringify(gesture.original);
  const flush = () => { cancelAnimationFrame(frame); frame = 0; if (pending) setPreview(pending); };
  const release = () => {
    const g = gesture; gesture = undefined; cancelAnimationFrame(frame); frame = 0; pending = undefined;
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
    const point = port.point(e.clientX, e.clientY); if (!point) return;
    g.moved = true;
    pending = arrangedPlacement(g.original, { position: { x: g.original.position.x + point.x - g.start.x, z: g.original.position.z + point.z - g.start.z } });
    if (!frame) frame = requestAnimationFrame(flush); e.preventDefault();
  };
  const up = (e: PointerEvent) => { if (e.pointerId === gesture?.pointer) { move(e); finish(); } };
  return {
    preview, owned, cancel, finish,
    validate() { if (gesture && !valid()) cancel(); },
    start(e: PointerEvent, id: string) {
      if (gesture || e.button !== 0 || !port.available(id)) return false;
      const original = port.placement(id), start = port.point(e.clientX, e.clientY); if (!original || !start) return false;
      const element = e.currentTarget as HTMLElement;
      gesture = { pointer: e.pointerId, element, id, original, start, x: e.clientX, y: e.clientY, moved: false };
      element.addEventListener("pointermove", move); element.addEventListener("pointerup", up);
      element.addEventListener("pointercancel", cancel); element.addEventListener("lostpointercapture", cancel);
      element.setPointerCapture(e.pointerId); element.focus({ preventScroll: true });
      setOwned(true); port.select(id); return true;
    },
  };
}
