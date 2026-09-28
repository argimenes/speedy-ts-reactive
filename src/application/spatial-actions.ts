import { createComputed, createMemo, createRoot, createSignal, untrack } from "solid-js";
import { spatialDocumentPreview } from "./spatial-document-preview";
import type { DocumentPreview } from "../features/spatial/document-preview";
import type { WorkspaceSession } from "./workspace-session";
import type { WorkspaceObject } from "../reactive-editor/workspace-presentation";
import type { ContentRecord, RepositoryState } from "../block-tree/types";
import { arrangedPlacement, type PlacementChange } from "../features/spatial/arrangement";
import type { SpatialPlacement } from "../features/spatial/model";
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
  return createRoot(dispose => {
  const { editor, presentation } = session;
  const [selected, select] = createSignal<string>();
  const layout = () => { const value = presentation.read()?.presentations.spatial; return value === undefined ? undefined : decodeSpatial(value); };
  // Application authorization owns the one eligible occurrence. The feature sees
  // only its object identity, never node keys or the editor.
  type Active = { objectId: string; label: string; nodeKey: string; contentKey: string };
  const [active, setActive] = createSignal<Active>();
  let disposed = false;
  const previews = new Map<string, { revision: number; value: DocumentPreview }>();
  const objects = createMemo(() => {
    if (disposed) return [];
    const spatial = presentation.active() === "spatial", editing = !!active();
    const resolved = session.resolveObjects();
    // Authored reads deliberately do not subscribe this memo to text/annotations.
    // Entry/return and directory changes are sufficient preview boundaries.
    return untrack(() => {
      const state = editor.repository.state, placed = new Set(spatial ? layout()?.placements.map(p => p.objectId) : []), retained = new Set<string>();
      const result = resolved.map(r => {
        let content = r.contentKey ? state.contents[r.contentKey] : undefined;
        const object = describe(state, content, r.object.id, r.object.label ?? r.object.id, r.status === "resolved" ? undefined : r.status);
        if (spatial && placed.has(object.id) && object.kind === "document" && content) {
          if (["document-window-block", "window-block"].includes(content.viewType)) content = state.contents[state.placements[content.children[0]]?.contentKey];
          if (content) {
            retained.add(content.key); let cached = previews.get(content.key);
            if (!cached || !editing && cached.revision !== state.revision) {
              cached = { revision: state.revision, value: spatialDocumentPreview(state, content, object.label, type => editor.registry.hasCapability(type, "spatial-document-compatible")) }; previews.set(content.key, cached);
            }
            object.preview = cached.value;
          }
        }
        return object;
      });
      for (const key of previews.keys()) if (!retained.has(key)) previews.delete(key);
      return result;
    });
  });
  const [editorSize, setEditorSize] = createSignal({ width: 900, height: 700 });
  const [notice, setNotice] = createSignal("");
  const bookmarks = new Map<string, { key: string; native?: import("../runtime/mounts").NativeTextSelection; inline?: { anchor: number; head: number } }>();
  const resolveDocument = (id: string) => {
    const r = session.resolveObjects().find(r => r.object.id === id);
    if (!r || r.status !== "resolved" || r.placementKeys.length !== 1) return;
    let node = session.projection.nodeForPlacement(r.placementKeys[0]);
    if (r.object.desktopHostBlockId && node) node = editor.blockQueries.ancestors(node.key).find(n => n.payload.id === r.object.desktopHostBlockId);
    if (!node || !["document-window-block", "window-block"].includes(node.viewType) || (node.payload.metadata as any)?.stickyNote || node.children.length !== 1) return;
    const document = editor.node(node.children[0]);
    if (!document || document.viewType !== "document-block") return;
    const keys = new Set<string>();
    const visit = (key: string): boolean => {
      if (keys.has(key)) return false; keys.add(key); const n = editor.node(key); if (!n) return false;
      if (key !== node!.key && ["document-window-block", "window-block", "portal-block"].includes(n.viewType)) return false;
      if (editor.registry.hasCapability(n.viewType, "opaque-widget") && !editor.registry.hasCapability(n.viewType, "spatial-document-compatible")) return false;
      return [...n.children, ...Object.values(n.ownedRelations)].every(visit);
    };
    if (!visit(node.key)) return;
    return { objectId: id, label: r.object.label ?? id, nodeKey: node.key, contentKey: node.contentKey };
  };
  const activeRoot = createMemo(() => {
    const target = active(); if (!target || presentation.active() !== "spatial") return;
    const resolved = resolveDocument(target.objectId);
    // A removed, replaced or newly ambiguous root cannot silently rebind.
    if (!resolved || resolved.nodeKey !== target.nodeKey || resolved.contentKey !== target.contentKey) return;
    return target;
  });
  const remember = () => {
    const target = active(), key = editor.focus.state.focusedKey ?? editor.focus.state.lastFocusedKey;
    if (!target || !key || !editor.blockQueries.ancestors(key).some(n => n.key === target.nodeKey)) return;
    const mount = editor.mounts.get(key);
    bookmarks.set(target.objectId, { key, native: mount?.captureSelection?.(), inline: mount?.captureInlineSelection?.() });
  };
  const releaseDocument = () => { remember(); editor.selectionGestures.cancelGesture(); editor.crossText.clear(); setActive(undefined); };
  createComputed(() => { if (active() && !activeRoot()) releaseDocument(); });
  const document = {
    active: () => { const t = activeRoot(); return t && { objectId: t.objectId, label: t.label }; }, notice,
    eligible: (id: string) => !!layout()?.placements.some(p => p.objectId === id) && !!resolveDocument(id),
    activate(id: string) {
      if (!session.inputAvailable() || activeRoot() || presentation.active() !== "spatial") return false;
      const target = layout()?.placements.some(p => p.objectId === id) ? resolveDocument(id) : undefined;
      if (!target || editor.mounts.get(target.nodeKey)) { setNotice("This object does not have a qualified, unambiguous Document Window."); return false; }
      editor.selectionGestures.cancelGesture(); editor.crossText.clear(); setNotice(""); select(id); setActive(target); return true;
    },
    requestReturn(complete: () => void) {
      const target = active(); if (!target) return false;
      const run = () => { if (active() !== target) return; if (!session.inputAvailable()) { setNotice("Finish or close the open panel before returning to the desk."); return; } remember(); setNotice(""); complete(); };
      if (session.deferHostedCompletion(run)) { setNotice("Return to desk will wait until composition finishes."); return false; }
      if (!session.inputAvailable()) { setNotice("Finish or close the open panel before returning to the desk."); return false; }
      run(); return true;
    },
    release: releaseDocument,
    size: editorSize,
    resize(size: { width: number; height: number }) {
      if (Number.isFinite(size.width) && Number.isFinite(size.height)) setEditorSize(previous => previous.width === size.width && previous.height === size.height ? previous : { width: Math.max(560, size.width), height: Math.max(240, size.height) });
    },
  };
  const documentReady = () => {
    const target = activeRoot(); if (!target) return;
    queueMicrotask(() => {
      if (activeRoot() !== target || !session.inputAvailable()) return;
      const bookmark = bookmarks.get(target.objectId);
      const key = bookmark && editor.mounts.get(bookmark.key) && editor.blockQueries.ancestors(bookmark.key).some(n => n.key === target.nodeKey) ? bookmark.key : undefined;
      const first = (root: string): string | undefined => {
        if (["native-text", "standoff"].includes(editor.mounts.get(root)?.inputPolicy ?? "")) return root;
        for (const child of editor.node(root)?.children ?? []) { const found = first(child); if (found) return found; }
      };
      const focus = key ?? first(target.nodeKey) ?? target.nodeKey;
      editor.focus.request(focus, { reason: "spatial-document-activation", caret: key ? bookmark?.native : "start", raiseWindow: false });
      if (key && bookmark?.inline) editor.mounts.get(key)?.restoreInlineSelection?.(bookmark.inline);
    });
  };
  return {
    layout, objects, selected, select, document, activeRoot, documentReady,
    dispose: () => { disposed = true; releaseDocument(); bookmarks.clear(); previews.clear(); dispose(); },
    arrange(id: string, change: PlacementChange, expected: SpatialPlacement) {
      if (!session.inputAvailable() || presentation.active() !== "spatial" || activeRoot()) return false;
      const current = layout(), object = objects().find(o => o.id === id);
      const placement = current?.placements.find(p => p.objectId === id);
      if (!current || !placement || !object || object.reason || object.kind === "placeholder" || JSON.stringify(placement) !== JSON.stringify(expected)) return false;
      const replacement = change.position || change.heading !== undefined || change.posture || change.orientation ? arrangedPlacement(placement, change) : placement;
      const placements = current.placements.map(p => p === placement ? replacement : p);
      if (change.toFront) { placements.splice(placements.indexOf(replacement), 1); placements.push(replacement); }
      const next = decodeSpatial({ ...current, placements }); validateSpatialDirectory(next, presentation.read()!.objects);
      if (JSON.stringify(next) !== JSON.stringify(current)) presentation.updateSpatial(next);
      return true;
    },
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
  });
}
