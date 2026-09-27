import { STUDY, paperSize, type SpatialPlacement } from "./model";
export interface PlacementChange {
  position?: { x: number; z: number };
  heading?: number;
  orientation?: "portrait" | "landscape";
  posture?: "lying" | "propped";
  toFront?: boolean;
}
export const PAGE_TILT = -.28;
export const surfaceHeight = (index: number) => .012 + index * .002;
export function footprintDepth(p: SpatialPlacement) { return paperSize(p).height * (p.posture === "lying" ? 1 : -Math.sin(PAGE_TILT)); }
/** A conservative bounding disc keeps the entire face footprint inside the
 * annular 150° desk, with 15mm edge clearance. Existing saved layouts are not
 * normalized on load; this constraint applies only to an explicit arrangement. */
export function arrangedPlacement(p: SpatialPlacement, change: PlacementChange): SpatialPlacement {
  const position = { ...p.position, ...change.position }, heading = change.heading ?? p.heading, posture = change.posture ?? p.posture;
  if (![position.x, position.z, heading].every(Number.isFinite) || !["lying", "propped"].includes(posture)) throw new Error("Invalid desk arrangement.");
  const rotation = heading >= -Math.PI && heading <= Math.PI ? heading : Math.atan2(Math.sin(heading), Math.cos(heading));
  if (change.orientation !== undefined && !["portrait", "landscape"].includes(change.orientation)) throw new Error("Invalid paper orientation.");
  const next = { ...p, position, heading: rotation, posture, ...(change.orientation ? { orientation: change.orientation } : {}) };
  const depth = footprintDepth(next), radius = Math.hypot(paperSize(next).width, depth) / 2;
  const offset = { x: -Math.sin(rotation) * depth / 2, z: -Math.cos(rotation) * depth / 2 };
  const center = { x: position.x + offset.x, z: position.z + offset.z };
  const distance = Math.hypot(center.x, center.z), min = STUDY.innerRadius + .015 + radius, max = STUDY.outerRadius - .015 - radius;
  if (min > max) throw new Error("This page is too large for the usable desk.");
  const r = Math.max(min, Math.min(max, distance));
  const angle = Math.atan2(center.x, -center.z), limit = STUDY.arc * Math.PI / 360 - Math.asin(radius / r);
  const a = Math.max(-limit, Math.min(limit, angle));
  if (distance !== r || angle !== a) {
    next.position.x = Math.sin(a) * r - offset.x;
    next.position.z = -Math.cos(a) * r - offset.z;
  }
  return next;
}
