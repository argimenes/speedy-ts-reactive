import type { SpatialPlacement } from "./model";
/** Opt-in, bounded diagnostic for the Spatial drag only. No timers or observers.
 * rendered measures render submission, not GPU/compositor presentation latency. */
export interface DragSample { input: number; intersection?: number; constrained?: number; published?: number; queued?: number; transformed?: number; rendered?: number }
let samples: DragSample[] | undefined;
let placements = new WeakMap<SpatialPlacement, DragSample>();
export function startDragProfile() { samples = []; placements = new WeakMap(); }
export function stopDragProfile() { const result = samples ?? []; samples = undefined; placements = new WeakMap(); return result; }
export function beginDragSample(): DragSample | undefined {
  if (!samples || samples.length >= 600) return;
  const sample = { input: performance.now() }; samples.push(sample); return sample;
}
export function trackDragPlacement(p: SpatialPlacement, sample?: DragSample) { if (sample) { sample.constrained = performance.now(); placements.set(p, sample); } }
export function dragStage(p: SpatialPlacement | undefined, stage: Exclude<keyof DragSample, "input">) {
  if (!samples || !p) return; const sample = placements.get(p); if (sample && sample[stage] === undefined) sample[stage] = performance.now();
}
