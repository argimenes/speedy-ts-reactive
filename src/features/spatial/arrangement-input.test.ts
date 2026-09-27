// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { PlacementChange } from "./arrangement";
import type { SpatialPlacement } from "./model";
import { createArrangementInput } from "./arrangement-input";
import { starterLayout } from "./model";
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const frames = new Map<number, FrameRequestCallback>(); let sequence = 0, available = true;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  let placement = starterLayout([{ id: "one", label: "One", kind: "document" }]).placements[0];
  const element = document.createElement("canvas"); let captured = false;
  element.setPointerCapture = () => { captured = true; }; element.hasPointerCapture = () => captured; element.releasePointerCapture = () => { captured = false; };
  const commit = vi.fn((_id: string, _change: PlacementChange, _expected: SpatialPlacement) => true), input = createArrangementInput({ placement: () => placement, available: () => available, point: (x, y) => ({ x: x / 1000, z: -1 + y / 1000 }), select() {}, commit });
  const event = (type: string, x = 0, id = 1) => { const e = new MouseEvent(type, { clientX: x, clientY: 0, button: 0 }); Object.defineProperty(e, "pointerId", { value: id }); return e as PointerEvent; };
  element.addEventListener("pointerdown", e => input.start(e, "one"));
  return { input, element, frames, commit, event, captured: () => captured, stale: () => { placement = { ...placement, heading: .5 }; }, unavailable: () => { available = false; } };
}
it("save flushes the latest pending delta once, even before the preview frame", () => {
  const q = setup(); q.element.dispatchEvent(q.event("pointerdown")); q.element.dispatchEvent(q.event("pointermove", 30)); q.element.dispatchEvent(q.event("pointermove", 70));
  expect(q.commit).not.toHaveBeenCalled(); expect(q.frames.size).toBe(1); expect(q.input.preview()).toBeUndefined();
  q.input.finish(); expect(q.commit).toHaveBeenCalledTimes(1); expect(q.commit.mock.calls[0][1].position!.x).toBeCloseTo(.07);
  expect(q.frames.size).toBe(0); expect(q.captured()).toBe(false); expect(q.input.owned()).toBe(false); q.input.finish(); expect(q.commit).toHaveBeenCalledTimes(1);
});
it.each(["pointercancel", "lostpointercapture", "explicit", "stale", "unavailable"])("%s reverts without committing", cause => {
  const q = setup(); q.element.dispatchEvent(q.event("pointerdown")); q.element.dispatchEvent(q.event("pointermove", 30));
  for (const cb of [...q.frames.values()]) cb(0); expect(q.input.preview()).toBeDefined();
  if (cause === "explicit") q.input.cancel(); else if (cause === "stale") { q.stale(); q.input.validate(); } else if (cause === "unavailable") { q.unavailable(); q.input.validate(); } else q.element.dispatchEvent(q.event(cause));
  expect(q.commit).not.toHaveBeenCalled(); expect(q.input.preview()).toBeUndefined(); expect(q.captured()).toBe(false);
});
it("clicks do not author movement and another pointer cannot complete the gesture", () => {
  const q = setup(); q.element.dispatchEvent(q.event("pointerdown")); q.element.dispatchEvent(q.event("pointerup", 0, 2)); expect(q.input.owned()).toBe(true);
  q.element.dispatchEvent(q.event("pointerup", 2)); expect(q.input.owned()).toBe(false); expect(q.commit).not.toHaveBeenCalled();
});
