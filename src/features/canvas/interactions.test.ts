// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { anchoredZoom, createCanvasInteractions } from "./interactions";
import type { CanvasLayout } from "../../reactive-editor/workspace-presentation";
let stop = () => {};
afterEach(() => { stop(); vi.useRealTimers(); document.body.replaceChildren(); });
function setup(scale = 1) {
  vi.useFakeTimers();
  let layout: CanvasLayout = { version: 1, camera: { x: 20, y: 30, zoom: scale }, placements: [{ id: "p", objectId: "o", bounds: { x: 10, y: 20, width: 840, height: 620 }, order: 0 }] };
  const camera = vi.fn(value => { layout = { ...layout, camera: value }; }), bounds = vi.fn((id, value) => { layout = { ...layout, placements: layout.placements.map(p => p.id === id ? { ...p, bounds: value } : p) }; });
  const input = createCanvasInteractions({ layout: () => layout, available: () => true, camera, bounds }); stop = input.cancel;
  const element = document.body.appendChild(document.createElement("button"));
  const event = (type: string, x: number, y: number) => { const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }); Object.defineProperty(e, "pointerId", { value: 7 }); return e as PointerEvent; };
  element.addEventListener('pointerdown', e => input.start(e, "move", "p"));
  return { input, element, event, camera, bounds, layout: () => layout };
}
describe("Canvas gesture ownership", () => {
  for (const scale of [.5, 1, 2]) it(`previews at ${scale}x and commits once`, () => {
    const q = setup(scale); q.element.dispatchEvent(q.event('pointerdown', 100, 100));
    q.element.dispatchEvent(q.event('pointermove', 140, 160)); vi.advanceTimersByTime(20);
    expect(q.bounds).not.toHaveBeenCalled(); expect(q.input.bounds('p')!.x).toBe(10 + 40 / scale);
    q.element.dispatchEvent(q.event('pointerup', 160, 180)); expect(q.bounds).toHaveBeenCalledTimes(1);
    expect(q.layout().placements[0].bounds.y).toBe(20 + 80 / scale); expect(q.input.owned()).toBe(false);
  });
  for (const reason of ['pointercancel', 'lostpointercapture', 'blur', 'Escape', 'dispose']) it(`cancels on ${reason}`, () => {
    const q = setup(); q.element.dispatchEvent(q.event('pointerdown', 0, 0)); q.element.dispatchEvent(q.event('pointermove', 40, 50)); vi.advanceTimersByTime(20);
    if (reason === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    else if (reason === 'blur') window.dispatchEvent(new Event('blur'));
    else if (reason === 'dispose') q.input.cancel(); else q.element.dispatchEvent(q.event(reason, 40, 50));
    expect(q.bounds).not.toHaveBeenCalled(); expect(q.input.bounds('p')!.x).toBe(10); expect(q.input.owned()).toBe(false);
  });
  it("settles latest pending movement for save and preserves zoom anchor", () => {
    const q = setup(2); q.element.dispatchEvent(q.event('pointerdown', 0, 0)); q.element.dispatchEvent(q.event('pointermove', 60, 20)); q.input.finish();
    expect(q.layout().placements[0].bounds.x).toBe(40); expect(q.input.owned()).toBe(false);
    const c = { x: -20, y: 35, zoom: .5 }, point = { x: 310, y: 200 }, next = anchoredZoom(c, 3, point);
    expect(next.x + point.x / next.zoom).toBeCloseTo(c.x + point.x / c.zoom); expect(next.y + point.y / next.zoom).toBeCloseTo(c.y + point.y / c.zoom);
  });
  it("leaves browser zoom alone, coalesces background wheel, and cancels wheel on blur", () => {
    const q = setup(); q.input.wheel(new WheelEvent('wheel', { deltaY: 20, ctrlKey: true }), { x: 40, y: 50 }); expect(q.input.owned()).toBe(false);
    for (let i = 0; i < 8; i++) q.input.wheel(new WheelEvent('wheel', { deltaY: 10 }), { x: 0, y: 0 });
    expect(q.camera).not.toHaveBeenCalled(); vi.advanceTimersByTime(170); expect(q.camera).toHaveBeenCalledTimes(1); expect(q.layout().camera.y).toBe(110);
    q.input.wheel(new WheelEvent('wheel', { deltaY: 40 }), { x: 0, y: 0 }); window.dispatchEvent(new Event('blur')); vi.advanceTimersByTime(170); expect(q.camera).toHaveBeenCalledTimes(1);
  });
});
