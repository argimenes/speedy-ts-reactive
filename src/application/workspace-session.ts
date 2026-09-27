import type { ReactiveEditorConfiguration } from "../configuration";
import type { ContentKey, PlacementKey } from "../block-tree/types";
import { ReactiveEditor } from "../reactive-editor/editor";
import type { LoadedWorkspace } from "../reactive-editor/workspace-manifest";
import { WorkspacePresentationState, type WorkspaceObject } from "../reactive-editor/workspace-presentation";
import { registerApplicationViews } from "./features";
import { batch, createSignal } from "solid-js";
import { deriveCanvas } from "./canvas-derivation";

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
  private readonly noticeSignal = createSignal("");
  readonly notice = this.noticeSignal[0];
  private readonly resolutionSignal = createSignal(0);
  private readonly cleanup: Array<() => void> = [];
  private composing = false;
  private pending?: "desktop" | "canvas";
  private compositionCompletion?: ReturnType<typeof setTimeout>;

  constructor(loaded: LoadedWorkspace, configuration: ReactiveEditorConfiguration = {}) {
    const root = loaded.state.contents[loaded.state.placements[loaded.state.rootPlacementKey].contentKey];
    if (root.viewType !== "workspace-block") throw new Error("A workspace session requires a workspace-block root.");
    this.editor = new ReactiveEditor(loaded, configuration);
    this.presentation = new WorkspacePresentationState(root.payload, this.editor.features.canvasWorkspace);
    this.editor.persistence.attachWorkspacePresentation(this.presentation);
    registerApplicationViews(this.editor);
    this.projection = this.editor.createView("loaded-workspace");
    this.resolveObjects();
    if (this.presentation.enabled) {
      for (const name of ["desktop", "canvas"] as const) this.cleanup.push(this.editor.commandRegistry.register({
        id: `workspace.presentation.${name}`, label: name === "desktop" ? "Desktop" : "Canvas",
        canExecute: () => this.presentation.editable(), execute: () => { this.selectPresentation(name); },
      }, "workspace-session"));
      this.cleanup.push(this.editor.repository.subscribeChanges(change => {
        if (change.inlineOwner) return;
        // Structural/identity changes invalidate root resolution. Plain typing,
        // annotations and Window geometry do not enumerate the workspace.
        for (const [key, before] of change.previousContents) {
          const after = this.editor.repository.state.contents[key];
          const identity = (c: typeof before) => c && JSON.stringify([c.viewType, c.payload.id, (c.payload.metadata as any)?.documentId, c.children, c.ownedRelations]);
          if (identity(before) !== identity(after)) { this.resolutionSignal[1](n => n + 1); break; }
        }
      }));
    }
  }

  /** Observe composition completion only; ordinary input never dispatches here. */
  installPresentationInput(window: Window): () => void {
    if (!this.presentation.enabled) return () => {};
    const start = (event: Event) => {
      const target = event.target;
      if (this.editor.mounts.resolveEvent(event) || (target instanceof Element && target.matches("[data-cross-text-input]") && this.editor.crossText.range())) this.composing = true;
    };
    const end = () => {
      if (!this.composing) return;
      this.composing = false;
      // Browser microtask checkpoints can occur between Window and Document
      // listeners. Wait for core's compositionend reconciliation and final input.
      clearTimeout(this.compositionCompletion);
      this.compositionCompletion = setTimeout(() => {
        this.compositionCompletion = undefined;
        const pending = this.pending; this.pending = undefined;
        if (!this.disposed && pending) this.selectPresentation(pending);
      }, 0);
    };
    window.addEventListener("compositionstart", start, true);
    window.addEventListener("compositionend", end, true);
    const stop = () => { window.removeEventListener("compositionstart", start, true); window.removeEventListener("compositionend", end, true); clearTimeout(this.compositionCompletion); this.pending = undefined; this.composing = false; };
    this.cleanup.push(stop); return stop;
  }

  selectPresentation(name: "desktop" | "canvas"): boolean {
    if (!this.presentation.editable()) return false;
    const editor = this.editor;
    if (this.composing || Object.keys(this.projection.state.nodes).some(key => editor.mounts.get(key)?.composing)) {
      this.pending = name; this.noticeSignal[1]("Presentation will switch after composition finishes."); return false;
    }
    if (editor.overlays.overlays.length || editor.stickyNotes.state.drafts.length ||
        (typeof document !== "undefined" && document.querySelector('[role="dialog"]')) ||
        Object.values(this.projection.state.nodes).some(node => editor.mounts.get(node.key) &&
          (editor.mounts.get(node.key)?.inputPolicy === "opaque-widget" || editor.registry.hasCapability(node.viewType, "opaque-widget")))) {
      this.noticeSignal[1]("Finish or close the open panel, draft or embedded application before switching presentations."); return false;
    }
    const key = editor.focus.state.focusedKey ?? editor.focus.state.lastFocusedKey;
    const mount = key ? editor.mounts.get(key) : undefined;
    const logical = key ? editor.selections.sets[key] : undefined;
    const primary = logical?.items.find(item => item.id === logical.primaryId);
    const native = mount?.captureSelection?.(), inline = mount?.captureInlineSelection?.() ??
      (primary ? { anchor: primary.anchor.boundary.index, head: primary.head.boundary.index } : undefined);
    try {
      batch(() => {
        if (name === "canvas" && !this.presentation.read()?.presentations.canvas) {
          const candidate = deriveCanvas(editor.repository.snapshot(), this.presentation.read());
          // Validation precedes both writes. No document content is reconstructed.
          if (candidate.identities.length) editor.repository.commit("Identify workspace objects", candidate.identities.map(record => ({ kind: "put-content", record })));
          this.presentation.initializeCanvas(candidate.objects, candidate.canvas);
        }
        editor.selectionGestures.cancelGesture();
        editor.crossText.clear();
        this.presentation.select(name);
        this.noticeSignal[1]("");
      });
      queueMicrotask(() => {
        if (this.disposed || !key) return;
        if (!editor.mounts.get(key)) {
          const visible = editor.blockQueries.ancestors(key).find(node => editor.mounts.get(node.key));
          if (visible) editor.focus.request(visible.key, { reason: "presentation-switch-hidden-target" });
          return;
        }
        editor.focus.request(key, { reason: "presentation-switch", caret: native });
        if (inline) editor.mounts.get(key)?.restoreInlineSelection?.(inline);
      });
      return true;
    } catch (error) { this.noticeSignal[1](error instanceof Error ? error.message : String(error)); return false; }
  }

  /** Resolve roots before mounting. Ambiguous occurrences and overlapping
   * ancestor/descendant roots retain placeholders instead of duplicate mounts. */
  canvasRoots() {
    this.resolutionSignal[0]();
    const resolutions = new Map(this.resolveObjects().map(item => [item.object.id, item]));
    const placed = [...(this.presentation.read()?.presentations.canvas?.placements ?? [])].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const mounted = new Set<string>();
    return placed.map(placement => {
      const resolved = resolutions.get(placement.objectId);
      let reason: string | undefined = !resolved || resolved.status !== "resolved" ? resolved?.status ?? "missing" : undefined;
      const node = resolved?.placementKeys.length === 1 ? this.projection.nodeForPlacement(resolved.placementKeys[0]) : undefined;
      if (!reason && !node) reason = "ambiguous occurrence";
      if (node && !["document-window-block", "window-block", "image-block"].includes(node.viewType)) reason ??= "unsupported in this presentation";
      if (node && (node.payload.metadata as any)?.stickyNote) reason ??= "Portal window is not supported";
      const descendants = new Set<string>();
      const visit = (key: string) => {
        if (descendants.has(key)) return; descendants.add(key);
        const child = this.projection.state.nodes[key];
        if (child) [...child.children, ...Object.values(child.ownedRelations)].forEach(visit);
      };
      if (node) visit(node.key);
      if (!reason && [...descendants].some(key => this.editor.registry.hasCapability(this.projection.state.nodes[key]?.viewType ?? "", "opaque-widget"))) reason = "embedded application awaits qualification";
      if (!reason && [...descendants].some(key => mounted.has(key))) reason = "overlapping render root";
      if (!reason) descendants.forEach(key => mounted.add(key));
      return { placement, label: resolved?.object.label ?? placement.objectId, nodeKey: reason ? undefined : node?.key, reason };
    });
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
    this.pending = undefined;
    this.cleanup.splice(0).reverse().forEach(stop => stop());
    this.presentation.dispose(); this.pins.clear(); this.editor.dispose();
  }
}
