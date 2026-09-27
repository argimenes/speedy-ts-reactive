import type { ReactiveEditorConfiguration } from "../configuration";
import type { ContentKey, PlacementKey } from "../block-tree/types";
import { ReactiveEditor } from "../reactive-editor/editor";
import type { LoadedWorkspace } from "../reactive-editor/workspace-manifest";
import { WorkspacePresentationState, type WorkspaceObject } from "../reactive-editor/workspace-presentation";
import { registerApplicationViews } from "./features";

export interface WorkspaceObjectResolution {
  object: WorkspaceObject;
  status: "resolved" | "missing" | "ambiguous" | "replaced";
  contentKey?: ContentKey;
  placementKeys: PlacementKey[];
}

/** Application-owned canonical workspace lifetime. No presentation registry or
 * alternate content store. The split demo remains a separate, explicit host. */
export class WorkspaceSession {
  readonly editor: ReactiveEditor;
  readonly projection;
  readonly presentation: WorkspacePresentationState;
  private readonly pins = new Map<string, ContentKey>();
  private disposed = false;

  constructor(loaded: LoadedWorkspace, configuration: ReactiveEditorConfiguration = {}) {
    const root = loaded.state.contents[loaded.state.placements[loaded.state.rootPlacementKey].contentKey];
    if (root.viewType !== "workspace-block") throw new Error("A workspace session requires a workspace-block root.");
    this.editor = new ReactiveEditor(loaded, configuration);
    this.presentation = new WorkspacePresentationState(root.payload, this.editor.features.canvasWorkspace);
    this.editor.persistence.attachWorkspacePresentation(this.presentation);
    registerApplicationViews(this.editor);
    this.projection = this.editor.createView("loaded-workspace");
    this.resolveObjects();
  }

  dirty() {
    return this.presentation.dirty() || this.editor.repository.state.revision !== (this.editor.persistence.state.lastSavedRevision ?? 0);
  }

  /** Resolve on demand, not on every keystroke. Runtime keys never enter the
   * persisted directory; document internals are not workspace Block anchors. */
  resolveObjects(): WorkspaceObjectResolution[] {
    if (this.disposed) throw new Error("Workspace session is disposed.");
    const objects = this.presentation.read()?.objects ?? [];
    if (!objects.length) return [];
    const state = this.editor.repository.state;
    const blocks = new Map<string, PlacementKey[]>(), documents = new Map<string, PlacementKey[]>();
    const visited = new Set<PlacementKey>();
    const add = (index: Map<string, PlacementKey[]>, id: unknown, key: PlacementKey) => {
      if (typeof id === "string" && id.trim()) index.set(id, [...(index.get(id) ?? []), key]);
    };
    const walk = (key: PlacementKey) => {
      if (visited.has(key)) return;
      visited.add(key);
      const content = state.contents[state.placements[key]?.contentKey];
      if (!content) return;
      if (content.viewType === "document-block") {
        const metadata = content.payload.metadata as Record<string, unknown> | undefined;
        add(documents, metadata?.documentId ?? content.payload.id, key);
        return;
      }
      if (content.viewType !== "document-reference-block") add(blocks, content.payload.id, key);
      content.children.forEach(walk);
      Object.values(content.ownedRelations).forEach(walk);
    };
    walk(state.rootPlacementKey);
    return objects.map(object => {
      const placementKeys = (object.target.kind === "document" ? documents.get(object.target.documentId) : blocks.get(object.target.blockId)) ?? [];
      const contents = new Set(placementKeys.map(key => state.placements[key].contentKey));
      if (!contents.size) return { object, status: "missing", placementKeys: [] };
      if (contents.size > 1 || (object.target.kind === "block" && placementKeys.length > 1)) return { object, status: "ambiguous", placementKeys: [] };
      const contentKey = [...contents][0], pinned = this.pins.get(object.id);
      if (pinned && pinned !== contentKey) return { object, status: "replaced", placementKeys: [] };
      this.pins.set(object.id, contentKey);
      return { object, status: "resolved", contentKey, placementKeys };
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.presentation.dispose(); this.pins.clear(); this.editor.dispose();
  }
}
