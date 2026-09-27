import type { ContentRecord, RepositoryState } from "../block-tree/types";
import { validateWorkspacePresentation, type CanvasBounds, type CanvasLayout, type WorkspaceObject, type WorkspacePresentation } from "../reactive-editor/workspace-presentation";

const containers = new Set(["workspace-block", "workspace-object-bank-block", "image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"]);
const objectId = (target: WorkspaceObject["target"]) => `${target.kind}:${encodeURIComponent(target.kind === "block" ? target.blockId : target.documentId)}`;
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const dimension = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

/** Pure candidate construction. Only the caller commits validated identity additions.
 * Enumerate known workspace/background containers; never walk object interiors. */
export function deriveCanvas(state: RepositoryState, previous?: WorkspacePresentation, allocate: () => string = () => crypto.randomUUID()) {
  if (previous?.presentations.canvas) throw new Error("Canvas already exists.");
  const candidates: ContentRecord[] = [], identities: ContentRecord[] = [];
  let background: CanvasLayout["background"];
  const walk = (key: string) => {
    const content = state.contents[state.placements[key].contentKey];
    if (containers.has(content.viewType)) {
      if (!background && !["workspace-block", "workspace-object-bank-block"].includes(content.viewType)) background = { type: content.viewType, metadata: structuredClone(content.payload.metadata ?? {}) as Record<string, unknown> };
      content.children.forEach(walk);
    } else candidates.push(content);
  };
  walk(state.rootPlacementKey);
  if (new Set(candidates.map(content => content.key)).size !== candidates.length) throw new Error("Ambiguous repeated workspace object occurrence.");
  const blockAnchors = new Map<string, number>();
  const index = (key: string) => {
    const c = state.contents[state.placements[key].contentKey];
    if (["document-block", "document-reference-block"].includes(c.viewType)) return;
    if (typeof c.payload.id === "string") blockAnchors.set(c.payload.id, (blockAnchors.get(c.payload.id) ?? 0) + 1);
    [...c.children, ...Object.values(c.ownedRelations)].forEach(index);
  };
  index(state.rootPlacementKey);
  const objects = structuredClone(previous?.objects ?? []), targets = new Set<string>();
  const entries = candidates.map((content, sourceOrder) => {
    const meta = (content.payload.metadata ?? {}) as Record<string, any>;
    const document = content.viewType === "document-block" || content.viewType === "document-reference-block";
    let id = document ? meta.documentId ?? content.payload.id : content.payload.id;
    if (id === undefined) {
      id = allocate();
      if (blockAnchors.has(id)) throw new Error(`Allocated identity collides with an existing Block: ${id}.`);
      blockAnchors.set(id, 1);
      identities.push({ ...content, payload: document ? { ...content.payload, metadata: { ...meta, documentId: id } } : { ...content.payload, id } });
    }
    if (typeof id !== "string" || !id.trim()) throw new Error("A workspace object has an invalid authored identity.");
    if (!document && (blockAnchors.get(id) ?? 0) > 1) throw new Error(`Ambiguous workspace object anchor: ${id}.`);
    const target: WorkspaceObject["target"] = document ? { kind: "document", documentId: id } : { kind: "block", blockId: id };
    const anchor = objectId(target);
    if (targets.has(anchor)) throw new Error(`Ambiguous workspace object anchor: ${id}.`);
    targets.add(anchor);
    const hosted = objects.filter(object => object.desktopHostBlockId === id && objectId(object.target) !== anchor);
    if (hosted.length) {
      const inner = content.children.length === 1 ? state.contents[state.placements[content.children[0]].contentKey] : undefined;
      if (!inner || hosted.some(object => object.target.kind === "block" ? inner.payload.id !== object.target.blockId : ((inner.payload.metadata as any)?.documentId ?? inner.payload.id) !== object.target.documentId)) throw new Error(`Desktop host mapping does not match its owned object: ${id}.`);
    }
    const matches = objects.filter(object => objectId(object.target) === anchor || hosted.includes(object));
    if (matches.length > 1) throw new Error(`Multiple directory objects target ${id}.`);
    let object = matches[0];
    if (!object) {
      if (objects.some(item => item.id === anchor)) throw new Error(`Directory identity collision: ${anchor}.`);
      object = { id: anchor, target, label: String(meta.title ?? content.viewType) }; objects.push(object);
    }
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
