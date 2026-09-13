import { decodeBlockTree, encodeDocument, encodeWorkspace } from "../block-tree/codecs";
import { TreeCommands } from "../block-tree/commands";
import { createViewId } from "../block-tree/ids";
import { OccurrenceIndex } from "../block-tree/occurrences";
import { BlockTreeProjection } from "../block-tree/projection";
import { BlockRegistry, CommandRegistry } from "../block-tree/registry";
import { CanonicalRepository } from "../block-tree/repository";
import type { ExistingBlockDto, NodeKey, PlacementKey, ViewId } from "../block-tree/types";
import { InputGateway } from "../input/gateway";
import { FocusService } from "../runtime/focus";
import { MountRegistry } from "../runtime/mounts";
import { SelectionService } from "../runtime/selections";
import { PersistenceService } from "./persistence";
import { MultiSelectionEditor } from "../input/multi-selection-editor";
import { OverlayService } from "../runtime/overlays";
import { ModelEventBus } from "../runtime/model-events";
import { MeasurementService } from "../runtime/measurements";
import { BindingRegistry } from "../input/bindings";
import { registerInputActions } from "../input/binding-catalog";
import { createTextTab } from "../runtime/text-tabs";
import { BlockSelectionService } from "../runtime/block-selection";

export class ReactiveEditor {
  readonly bindings = new BindingRegistry();
  readonly repository: CanonicalRepository;
  readonly occurrences = new OccurrenceIndex();
  readonly commands: TreeCommands;
  readonly registry = new BlockRegistry();
  readonly commandRegistry = new CommandRegistry();
  readonly events = new ModelEventBus();
  readonly mounts = new MountRegistry();
  readonly measurements = new MeasurementService(this.mounts);
  readonly focus = new FocusService(this.mounts);
  readonly selections = new SelectionService();
  readonly blockSelection = new BlockSelectionService(this);
  readonly overlays = new OverlayService(this.mounts, this.focus);
  readonly persistence = new PersistenceService(this);
  readonly multiSelections: MultiSelectionEditor;
  readonly projections = new Map<ViewId, BlockTreeProjection>();
  private gateway?: InputGateway;

  constructor(dto: ExistingBlockDto) {
    registerInputActions(this.bindings);
    const decoded = decodeBlockTree(dto);
    this.repository = new CanonicalRepository(decoded.state);
    this.commands = new TreeCommands(this.repository, (key) => this.occurrences.resolve(key));
    this.multiSelections = new MultiSelectionEditor(
      this.commands,
      this.selections,
      (nodeKey) => this.node(nodeKey),
    );
    this.repository.subscribeBeforeChanges((label) => {
      if (this.events.hasSubscribers("beforeChange")) {
        this.events.publish("beforeChange", { label, state: this.repository.snapshot() });
      }
    });
    this.repository.subscribeChanges(({ label, previousContents }) => {
      if (this.events.hasSubscribers("afterChange")) {
        this.events.publish("afterChange", { label, state: this.repository.snapshot() });
      }
      for (const [contentKey, previous] of previousContents) {
        const content = this.repository.state.contents[contentKey];
        if (
          previous && content &&
          (previous.inlineRevision !== content.inlineRevision ||
            previous.payload.text !== content.payload.text)
        ) {
          this.events.publish("textChanged", {
            label,
            contentKey,
            revision: content.revision,
          });
        }
      }
    });
    this.repository.subscribeChanges(() => {
      queueMicrotask(() => this.overlays.closeMissingOwners((nodeKey) => !!this.node(nodeKey)));
      if (this.blockSelection.state.items.length) queueMicrotask(() => this.blockSelection.prune());
    });
  }

  createView(
    viewId: ViewId = createViewId(),
    rootPlacementKey: PlacementKey = this.repository.state.rootPlacementKey,
  ): BlockTreeProjection {
    const projection = new BlockTreeProjection(
      this.repository,
      viewId,
      this.occurrences,
      rootPlacementKey,
    );
    this.projections.set(viewId, projection);
    return projection;
  }

  installGateway(document: Document): () => void {
    this.gateway?.dispose();
    this.gateway = new InputGateway(
      document,
      this.mounts,
      this.focus,
      this.commands,
      this.multiSelections,
      this.selections,
      this.overlays,
      (nodeKey) => this.node(nodeKey),
      (placementKey, viewId) => this.nodeForPlacementInView(placementKey, viewId),
      (nodeKey, direction) => this.adjacentSibling(nodeKey, direction),
      (nodeKey, direction) => this.adjacentEditable(nodeKey, direction),
      (nodeKey) => this.focusFallback(nodeKey),
      this.bindings,
      key => createTextTab(this, key),
      this.blockSelection,
    );
    return this.gateway.install();
  }

  node(nodeKey: NodeKey) {
    for (const projection of this.projections.values()) {
      const node = projection.state.nodes[nodeKey];
      if (node) return node;
    }
    return undefined;
  }

  nodeForPlacementInView(placementKey: PlacementKey, viewId: ViewId) {
    return this.projections.get(viewId)?.nodeForPlacement(placementKey);
  }

  adjacentSibling(nodeKey: NodeKey, direction: -1 | 1) {
    for (const projection of this.projections.values()) {
      if (!projection.state.nodes[nodeKey]) continue;
      for (const parent of Object.values(projection.state.nodes)) {
        const index = parent.children.indexOf(nodeKey);
        if (index >= 0) return projection.state.nodes[parent.children[index + direction]];
      }
    }
    return undefined;
  }

  adjacentEditable(nodeKey: NodeKey, direction: -1 | 1) {
    for (const projection of this.projections.values()) {
      const origin = projection.state.nodes[nodeKey];
      if (!origin) continue;
      const parent = new Map<NodeKey, NodeKey>();
      for (const candidate of Object.values(projection.state.nodes)) {
        candidate.children.forEach((child) => parent.set(child, candidate.key));
        Object.values(candidate.ownedRelations).forEach((child) => parent.set(child, candidate.key));
      }
      let scope = origin;
      let cursor: NodeKey | undefined = origin.key;
      while (cursor) {
        const candidate = projection.state.nodes[cursor];
        if (candidate && ["document-block", "left-margin-block", "right-margin-block"].includes(candidate.viewType)) {
          scope = candidate;
          break;
        }
        cursor = parent.get(cursor);
      }
      const ordered: typeof origin[] = [];
      const visit = (key: NodeKey) => {
        const candidate = projection.state.nodes[key];
        if (!candidate) return;
        const registration = this.registry.resolve(candidate.viewType);
        const mount = this.mounts.get(candidate.key);
        const hidden = mount?.root.closest('[aria-hidden="true"]');
        if (
          mount &&
          !hidden &&
          (registration?.capabilities.includes("inline-editor") ||
            registration?.capabilities.includes("native-text"))
        ) {
          ordered.push(candidate);
        }
        candidate.children.forEach(visit);
      };
      visit(scope.key);
      const index = ordered.findIndex((candidate) => candidate.key === nodeKey);
      if (index >= 0) return ordered[index + direction];
    }
    return undefined;
  }

  focusFallback(nodeKey: NodeKey): NodeKey | undefined {
    for (const projection of this.projections.values()) {
      const node = projection.state.nodes[nodeKey];
      if (!node) continue;
      for (const parent of Object.values(projection.state.nodes)) {
        const index = parent.children.indexOf(nodeKey);
        if (index >= 0) {
          return parent.children[index + 1] ?? parent.children[index - 1] ?? parent.key;
        }
        if (Object.values(parent.ownedRelations).includes(nodeKey)) return parent.key;
      }
    }
    return undefined;
  }

  encodeDocument(): ExistingBlockDto {
    return encodeDocument(this.repository.snapshot(), undefined, this.focusBookmarks());
  }

  encodeWorkspace(): ExistingBlockDto {
    return encodeWorkspace(this.repository.snapshot(), undefined, this.focusBookmarks());
  }

  private focusBookmarks() {
    const bookmarks: Record<string, { blockId: string; caret?: number }> = {};
    const focusKey = this.node(this.focus.state.focusedKey ?? "")
      ? this.focus.state.focusedKey
      : this.focus.state.lastFocusedKey;
    if (!focusKey) return bookmarks;
    for (const projection of this.projections.values()) {
      const target = projection.state.nodes[focusKey];
      if (!target) continue;
      let current = target;
      while (current && current.viewType !== "document-block") {
        current = Object.values(projection.state.nodes).find(
          (candidate) =>
            candidate.children.includes(current.key) ||
            Object.values(candidate.ownedRelations).includes(current.key),
        )!;
      }
      if (!current || current.viewType !== "document-block") continue;
      const blockId = target.payload.id;
      if (typeof blockId !== "string") continue;
      const selectionSet = this.selections.sets[target.key];
      const primary = selectionSet?.items.find((item) => item.id === selectionSet.primaryId);
      const nativeSelection = this.mounts.selection(target.key);
      const caret = primary?.head.boundary.index ?? nativeSelection?.end;
      bookmarks[current.contentKey] = {
        blockId,
        ...(typeof caret === "number" ? { caret } : {}),
      };
      break;
    }
    return bookmarks;
  }

  dispose(): void {
    this.blockSelection.clear();
    this.bindings.dispose();
    this.gateway?.dispose();
    this.focus.dispose();
    for (const projection of this.projections.values()) projection.dispose();
    this.projections.clear();
  }
}
