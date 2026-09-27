import { deriveLocations } from "../block-tree/repository";
import type { ExistingBlockDto, PlacementKey, RepositoryState } from "../block-tree/types";
import { validateWorkspacePresentation, type WorkspacePresentation } from "../reactive-editor/workspace-presentation";
import type { WorkspaceObjectResolution } from "./workspace-session";

const containers = new Set(["workspace-block", "workspace-object-bank-block", "image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"]);
const windows = new Set(["window-block", "document-window-block"]);
const direct = new Set(["document-block", "image-block", "canvas-counter-block", "youtube-video-block", "iframe-block", "pdf-block", "html-block", "html-editor-block"]);
export interface DesktopDerivationEntry {
  objectId: string;
  placementKey: PlacementKey;
  destination: PlacementKey;
  /** Absent when the object already is a Window. */
  wrapper?: ExistingBlockDto;
  metadata: Record<string, unknown>;
  move: boolean;
}

/** A one-time, pure Canvas→Desktop policy. Runtime keys are instructions only;
 * durable host mappings use authored IDs. No camera or content conversion. */
export function deriveDesktop(state: RepositoryState, value: WorkspacePresentation, resolutions: WorkspaceObjectResolution[], viewport = { width: 1200, height: 800 }) {
  validateWorkspacePresentation(value);
  if (value.presentations.desktop !== undefined) throw new Error("Desktop already exists; it will not be replaced.");
  if (!value.presentations.canvas) throw new Error("Create Desktop requires a Canvas layout.");
  if (![viewport.width, viewport.height].every(n => Number.isFinite(n) && n > 0)) throw new Error("Invalid Desktop viewport.");
  const locations = deriveLocations(state);
  const eligible = new Map<PlacementKey, PlacementKey>();
  const visit = (parent: PlacementKey) => {
    const content = state.contents[state.placements[parent].contentKey];
    for (const key of content.children) {
      const child = state.contents[state.placements[key].contentKey];
      if (containers.has(child.viewType)) visit(key);
      else eligible.set(key, parent);
    }
  };
  visit(state.rootPlacementKey);
  const authoredIds = new Set(Object.values(state.contents).map(c => c.payload.id).filter((id): id is string => typeof id === "string"));
  const resolved = new Map(resolutions.map(r => [r.object.id, r]));
  const skipped: Array<{ objectId: string; label: string; reason: string }> = [];
  const seen = new Set<string>();
  const placed = [...value.presentations.canvas.placements].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const candidates = placed.flatMap(placement => {
    const resolution = resolved.get(placement.objectId), object = value.objects.find(o => o.id === placement.objectId)!;
    const key = resolution?.placementKeys.length === 1 ? resolution.placementKeys[0] : undefined;
    const content = key ? state.contents[state.placements[key].contentKey] : undefined;
    const parent = key ? eligible.get(key) : undefined;
    let reason: string | undefined;
    if (!resolution || resolution.status !== "resolved") reason = resolution?.status ?? "missing";
    else if (!key) reason = "ambiguous occurrence";
    else if (!parent || locations.get(key)?.slot.kind !== "children") reason = "not a workspace-owned root";
    else if (state.placements[key].kind !== "owned") reason = "not an owned object";
    else if (!content || (!windows.has(content.viewType) && !direct.has(content.viewType))) reason = "unsupported Desktop representation";
    else if ((content.payload.metadata as any)?.stickyNote) reason = "Portal Window";
    else if (seen.has(content.key)) reason = "overlapping content target";
    if (reason) { skipped.push({ objectId: object.id, label: object.label ?? object.id, reason }); return []; }
    seen.add(content!.key);
    return [{ placement, object, key: key!, parent: parent!, content: content! }];
  });
  const left = candidates.length ? Math.min(...candidates.map(c => c.placement.bounds.x)) : 0;
  const top = candidates.length ? Math.min(...candidates.map(c => c.placement.bounds.y)) : 0;
  const objects = structuredClone(value.objects);
  const entries: DesktopDerivationEntry[] = candidates.map((candidate, index) => {
    const { content, placement, object, key, parent } = candidate;
    const window = windows.has(content.viewType), document = ["document-block", "document-window-block"].includes(content.viewType);
    // Conservative document minimum also accommodates the existing minimap.
    const width = Math.max(document ? 602 : 240, Math.min(placement.bounds.width, viewport.width - 48));
    const height = Math.max(document ? 240 : 160, Math.min(placement.bounds.height, viewport.height - 80));
    let x = placement.bounds.x - left + 24, y = placement.bounds.y - top + 56;
    if (x + width > viewport.width - 24 || y + height > viewport.height - 24) {
      x = Math.min(24 + index % 8 * 24, Math.max(24, viewport.width - width - 24));
      y = Math.min(56 + index % 8 * 24, Math.max(56, viewport.height - height - 24));
    }
    const original = (content.payload.metadata ?? {}) as Record<string, unknown>;
    const metadata = { ...(window ? original : { title: object.label ?? content.viewType }), position: { x, y }, size: { w: width, h: height }, state: "normal", zIndex: index + 1 };
    const hostId = window ? String(content.payload.id ?? "") : `desktop:${encodeURIComponent(object.id)}`;
    if (!hostId.trim()) throw new Error(`Window ${object.id} has no authored identity.`);
    if (!window && authoredIds.has(hostId)) throw new Error(`Desktop host identity collision: ${hostId}.`);
    authoredIds.add(hostId);
    objects.find(o => o.id === object.id)!.desktopHostBlockId = hostId;
    const bank = state.contents[state.placements[parent].contentKey].viewType === "workspace-object-bank-block";
    return { objectId: object.id, placementKey: key, destination: bank ? state.rootPlacementKey : parent, metadata, move: bank,
      ...(window ? {} : { wrapper: { id: hostId, type: document ? "document-window-block" : "window-block", metadata, children: [] } }),
    };
  });
  const presentation = validateWorkspacePresentation({ ...value, objects, active: "desktop", presentations: { ...value.presentations, desktop: { version: 1, kind: "legacy-tree" } } });
  return { entries, objects: presentation.objects, skipped };
}
