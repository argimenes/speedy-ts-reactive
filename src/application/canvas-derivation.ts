import { discoverWorkspaceObjects } from "./workspace-objects";
import type { RepositoryState } from "../block-tree/types";
import { validateWorkspacePresentation, type CanvasBounds, type CanvasLayout, type WorkspacePresentation } from "../reactive-editor/workspace-presentation";

const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const dimension = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

/** Pure candidate construction. Only the caller commits validated identity additions.
 * Enumerate known workspace/background containers; never walk object interiors. */
export function deriveCanvas(state: RepositoryState, previous?: WorkspacePresentation, allocate: () => string = () => crypto.randomUUID()) {
  if (previous?.presentations.canvas) throw new Error("Canvas already exists.");
  const { objects, identities, background, entries: discovered } = discoverWorkspaceObjects(state, previous, allocate);
  const entries = discovered.map(({ object, content, sourceOrder }) => {
    const meta = (content.payload.metadata ?? {}) as Record<string, any>;
    const window = ["window-block", "document-window-block"].includes(content.viewType);
    const bounds: CanvasBounds = window
      ? { x: finite(meta.position?.x, 20), y: finite(meta.position?.y, 20), width: dimension(meta.size?.w, 840), height: dimension(meta.size?.h, 620) }
      : { x: 0, y: 0, width: dimension(meta.width ?? meta.size?.w, 320), height: dimension(meta.height ?? meta.size?.h, 240) };
    return { object, bounds, window, sourceOrder, z: finite(meta.zIndex, 0) };
  });
  // Non-window objects use a deterministic three-column grid to the right.
  const right = Math.max(0, ...entries.filter(e => e.window).map(e => e.bounds.x + e.bounds.width));
  const direct = entries.filter(e => !e.window);
  const cellWidth = Math.max(320, ...direct.map(e => e.bounds.width)) + 32;
  const cellHeight = Math.max(240, ...direct.map(e => e.bounds.height)) + 32;
  direct.forEach((entry, index) => { entry.bounds.x = right + 48 + index % 3 * cellWidth; entry.bounds.y = 32 + Math.floor(index / 3) * cellHeight; });
  entries.sort((a, b) => a.z - b.z || a.sourceOrder - b.sourceOrder || a.object.id.localeCompare(b.object.id));
  const placements = entries.map((e, order) => ({ id: `canvas:${e.object.id}`, objectId: e.object.id, bounds: e.bounds, order }));
  // Fit to a fixed 1200×800 reference viewport. No layout-dependent measurement.
  let camera = { x: 0, y: 0, zoom: 1 };
  if (placements.length) {
    const left = Math.min(...placements.map(p => p.bounds.x)), top = Math.min(...placements.map(p => p.bounds.y));
    const width = Math.max(...placements.map(p => p.bounds.x + p.bounds.width)) - left;
    const height = Math.max(...placements.map(p => p.bounds.y + p.bounds.height)) - top;
    const zoom = Math.max(.05, Math.min(1, 1136 / width, 736 / height));
    camera = { x: left - 32 / zoom, y: top - 32 / zoom, zoom };
  }
  const canvas: CanvasLayout = { version: 1, camera, placements, ...(background ? { background } : {}) };
  validateWorkspacePresentation({ ...previous, version: 1, active: "canvas", objects, presentations: { ...(previous?.presentations ?? { desktop: { version: 1, kind: "legacy-tree" } }), canvas } });
  return { objects, canvas, identities };
}
