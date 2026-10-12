import { STUDY, type SpatialLayout, type SpatialPlacement } from './model';
import type { PlacementChange } from './arrangement';

/** Preset objects belong to the environment, not the workspace content directory. */
export const DESK_PROPS = [
  { id: 'study:lamp', label: 'Desk lamp', radius: .225, x: -.81, z: -.9, heading: 0 },
  { id: 'study:cup', label: 'Coffee cup', radius: .085, x: .52, z: -.69, heading: 0 },
  { id: 'study:saucer', label: 'Saucer', radius: .07, x: .52, z: -.69, heading: 0 },
  ...[0, 1, 2].map(i => ({ id: `study:book-${i}`, label: `Desk book ${i + 1}`, radius: .163, x: 1.08, z: -.53, heading: .15 - i * .1 })),
  { id: 'study:inkpot', label: 'Inkpot', radius: .038, x: -.42, z: -.68, heading: 0 },
  { id: 'study:quill', label: 'Quill', radius: .075, x: -.43, z: -.68, heading: 0 },
] as const;
export const deskProp = (id: string) => DESK_PROPS.find(p => p.id === id);
export interface DeskPropPlacement {
  id: string; position: { x: number; z: number; [key: string]: unknown }; heading: number; [key: string]: unknown;
}
export function propPlacement(layout: SpatialLayout | undefined, id: string): SpatialPlacement | undefined {
  const definition = deskProp(id); if (!definition || !layout) return;
  const saved = layout.environment.deskProps?.find(p => p.id === id);
  return { ...saved, id, objectId: id, position: saved?.position ?? { x: definition.x, z: definition.z }, heading: saved?.heading ?? definition.heading,
    posture: 'lying', size: { width: definition.radius * 2, height: definition.radius * 2 } };
}
/** Fit a complete bounding disc inside the desktop, including both radial edges. */
export function constrainDeskCenter(position: { x: number; z: number }, radius: number) {
  if (![position.x, position.z, radius].every(Number.isFinite) || radius <= 0) throw new Error('Invalid desk arrangement.');
  const min = STUDY.innerRadius + .015 + radius, max = STUDY.outerRadius - .015 - radius;
  if (min > max) throw new Error('This object is too large for the usable desk.');
  const distance = Math.hypot(position.x, position.z), r = Math.max(min, Math.min(max, distance));
  const angle = Math.atan2(position.x, -position.z), limit = STUDY.arc * Math.PI / 360 - Math.asin((radius + .015) / r);
  const a = Math.max(-limit, Math.min(limit, angle));
  return distance === r && angle === a ? { ...position } : { ...position, x: Math.sin(a) * r, z: -Math.cos(a) * r };
}
export function arrangedProp(p: SpatialPlacement, change: PlacementChange): SpatialPlacement {
  const definition = deskProp(p.objectId); if (!definition) throw new Error('Unknown desk object.');
  const heading = change.heading ?? p.heading;
  if (!Number.isFinite(heading)) throw new Error('Invalid desk heading.');
  return { ...p, position: constrainDeskCenter({ ...p.position, ...change.position }, definition.radius),
    heading: heading >= -Math.PI && heading <= Math.PI ? heading : Math.atan2(Math.sin(heading), Math.cos(heading)) };
}
export function validateDeskProps(value: unknown): asserts value is DeskPropPlacement[] {
  if (!Array.isArray(value)) throw new Error('Expected desk object placements.');
  const ids = new Set<string>();
  for (const p of value) {
    const definition = p && deskProp(p.id);
    if (!definition || ids.has(p.id) || !p.position || !Number.isFinite(p.heading) || Math.abs(p.heading) > Math.PI || p.position.y !== undefined) throw new Error('Invalid desk object placement.');
    ids.add(p.id);
    const fitted = constrainDeskCenter(p.position, definition.radius);
    if (Math.hypot(fitted.x - p.position.x, fitted.z - p.position.z) > 1e-8) throw new Error('Desk object is outside the desktop.');
  }
}
