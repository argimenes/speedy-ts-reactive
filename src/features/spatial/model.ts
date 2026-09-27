/** Spatial v1 is a seated, desk-constrained presentation. Distances are metres. */
export interface SpatialCamera { kind: "perspective" | "orthographic"; yaw: number; approach: number; [key: string]: unknown }
export interface SpatialPlacement {
  id: string; objectId: string; position: { x: number; z: number; [key: string]: unknown };
  heading: number; posture: "lying" | "propped"; size: { width: number; height: number; [key: string]: unknown }; [key: string]: unknown;
}
export interface SpatialLayout {
  version: 1; environment: { preset: "night-study-v1"; [key: string]: unknown };
  camera: SpatialCamera; placements: SpatialPlacement[]; [key: string]: unknown;
}
export interface SpatialObject { id: string; label: string; kind: "document" | "image" | "placeholder"; reason?: string; imageUrl?: string }
export const STUDY = Object.freeze({ innerRadius: .55, outerRadius: 1.45, arc: 150, thickness: .065, eyeHeight: .6, yawLimit: Math.PI / 4, maxPlaced: 8 });
const record = (v: unknown): Record<string, any> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected Spatial object."); return v; };
const finite = (v: unknown, min: number, max: number) => { if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error("Invalid Spatial geometry."); };
const identity = (v: unknown) => { if (typeof v !== "string" || !v.trim()) throw new Error("Invalid Spatial identity."); };
export function decodeSpatial(value: unknown): SpatialLayout {
  const v = record(value);
  if (v.version !== 1 || record(v.environment).preset !== "night-study-v1") throw new Error("Unsupported Spatial version or study preset.");
  const c = record(v.camera);
  if (!["perspective", "orthographic"].includes(c.kind)) throw new Error("Unsupported Spatial camera.");
  finite(c.yaw, -STUDY.yawLimit, STUDY.yawLimit); finite(c.approach, 0, 1);
  if (!Array.isArray(v.placements)) throw new Error("Expected Spatial placements.");
  const ids = new Set(), objects = new Set();
  for (const entry of v.placements) {
    const p = record(entry); identity(p.id); identity(p.objectId);
    if (ids.has(p.id) || objects.has(p.objectId)) throw new Error("Duplicate Spatial placement or object.");
    ids.add(p.id); objects.add(p.objectId);
    const pos = record(p.position), size = record(p.size);
    finite(pos.x, -1.5, 1.5); finite(pos.z, -1.5, .1);
    const radius = Math.hypot(pos.x, pos.z);
    if (radius < STUDY.innerRadius || radius > STUDY.outerRadius || Math.abs(Math.atan2(pos.x, -pos.z)) > STUDY.arc / 2 * Math.PI / 180) throw new Error("Placement is outside the desk.");
    finite(p.heading, -Math.PI, Math.PI); finite(size.width, .03, .5); finite(size.height, .03, .6);
    if (!["lying", "propped"].includes(p.posture)) throw new Error("Unsupported page posture.");
  }
  return structuredClone(v) as SpatialLayout;
}
export function supportsSpatial(value: unknown) { try { decodeSpatial(value); return true; } catch { return false; } }
export function validateSpatialDirectory(layout: SpatialLayout, objects: readonly { id: string }[]) {
  const ids = new Set(objects.map(o => o.id));
  if (layout.placements.some(p => !ids.has(p.objectId))) throw new Error("Spatial placement references an unknown directory object.");
}
export function starterPlacement(object: SpatialObject, index: number): SpatialPlacement {
  // Stable slots, not converted Desktop/Canvas geometry. Keep room for real props.
  const angles = [0, -.33, .34, -.67, .68, -.94, .96, .16];
  const angle = angles[index % angles.length], radius = index === 7 ? .65 : .98;
  return { id: `spatial:${object.id}`, objectId: object.id, position: { x: Math.sin(angle) * radius, z: -Math.cos(angle) * radius }, heading: -angle || 0,
    posture: index === 7 || index % 3 === 1 ? "lying" : "propped", size: object.kind === "image" ? { width: .18, height: .12 } : { width: .21, height: .297 } };
}
export function starterLayout(objects: readonly SpatialObject[]): SpatialLayout {
  return { version: 1, environment: { preset: "night-study-v1" }, camera: { kind: "perspective", yaw: 0, approach: 0 }, placements: objects.slice(0, STUDY.maxPlaced).map(starterPlacement) };
}
export function clampCamera(camera: SpatialCamera): SpatialCamera {
  return { ...camera, yaw: Math.max(-STUDY.yawLimit, Math.min(STUDY.yawLimit, camera.yaw)), approach: Math.max(0, Math.min(1, camera.approach)) };
}
