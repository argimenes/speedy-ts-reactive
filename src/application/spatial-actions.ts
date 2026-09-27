import { createSignal } from "solid-js";
import type { WorkspaceSession } from "./workspace-session";
import type { WorkspaceObject } from "../reactive-editor/workspace-presentation";
import type { ContentRecord, RepositoryState } from "../block-tree/types";
import { discoverWorkspaceObjects } from "./workspace-objects";
import { decodeSpatial, starterLayout, starterPlacement, STUDY, validateSpatialDirectory, type SpatialCamera, type SpatialObject } from "../features/spatial/model";
export { supportsSpatial } from "../features/spatial/model";

function describe(state: RepositoryState, content: ContentRecord | undefined, id: string, label: string, reason?: string): SpatialObject {
  let c = content;
  if (c && ["window-block", "document-window-block"].includes(c.viewType) && c.children.length === 1) c = state.contents[state.placements[c.children[0]].contentKey];
  const kind = !reason && c?.viewType === "image-block" ? "image" : !reason && c && ["document-block", "main-list-block", "membrane-block"].includes(c.viewType) ? "document" : "placeholder";
  const url = (c?.payload.metadata as any)?.url;
  return { id, label, kind, ...(reason || kind === "placeholder" ? { reason: reason ?? "Representation awaits qualification" } : {}),
    ...(kind === "image" && typeof url === "string" && /^(https?:\/\/|data:image\/|\/(?!\/))/i.test(url) ? { imageUrl: url } : {}) };
}
/** Application adapter: only semantic summaries and validated sidecar changes escape. */
export function createSpatialActions(session: WorkspaceSession) {
  const { editor, presentation } = session;
  const [selected, select] = createSignal<string>();
  const layout = () => { const value = presentation.read()?.presentations.spatial; return value === undefined ? undefined : decodeSpatial(value); };
  const objects = () => session.resolveObjects().map(r => describe(editor.repository.state, r.contentKey ? editor.repository.state.contents[r.contentKey] : undefined, r.object.id, r.object.label ?? r.object.id, r.status === "resolved" ? undefined : r.status));
  return {
    layout, objects, selected, select,
    create() {
      if (presentation.read()?.presentations.spatial !== undefined) throw new Error("Spatial already exists; select the retained layout.");
      const candidate = discoverWorkspaceObjects(editor.repository.snapshot(), presentation.read());
      const summaries = candidate.entries.map(e => describe(editor.repository.state, e.content, e.object.id, e.object.label ?? e.object.id));
      const spatial = starterLayout(summaries); validateSpatialDirectory(spatial, candidate.objects);
      if (candidate.identities.length) editor.repository.commit("Identify workspace objects", candidate.identities.map(record => ({ kind: "put-content" as const, record })));
      presentation.initializeSpatial(candidate.objects, spatial);
    },
    camera(camera: SpatialCamera) {
      const current = layout(); if (!current) return;
      const next = decodeSpatial({ ...current, camera: { ...current.camera, ...camera } });
      validateSpatialDirectory(next, presentation.read()!.objects); presentation.updateSpatial(next);
    },
    /** Preflight before authored insertion; returned closure commits only validated layout. */
    prepareObject(object: WorkspaceObject, kind: "document" | "image") {
      const current = layout(), value = presentation.read();
      if (!current || !value) throw new Error("Spatial is unavailable.");
      const existing = value.objects.find(o => o.id === object.id);
      if (existing && JSON.stringify(existing.target) !== JSON.stringify(object.target)) throw new Error("Conflicting directory identity.");
      const directory = existing ? value.objects : [...value.objects, object];
      const already = current.placements.some(p => p.objectId === object.id);
      const next = decodeSpatial({ ...current, placements: already || current.placements.length >= STUDY.maxPlaced ? current.placements : [...current.placements, starterPlacement({ id: object.id, label: object.label ?? object.id, kind }, current.placements.length)] });
      validateSpatialDirectory(next, directory);
      return () => { presentation.updateSpatial(next, directory); select(object.id); };
    },
    available: () => session.inputAvailable(),
    ownInteraction: (value: { cancel(): void; finish(): void }) => session.ownPresentationInteraction(value),
    returnDesktop: () => session.selectPresentation("desktop"),
  };
}
