import { createStore, reconcile, unwrap } from "solid-js/store";
import { clone } from "./clone";
import { createNodeKey } from "./ids";
import type { CanonicalRepository } from "./repository";
import type { SplitChange } from "./split-plan";
import type { OccurrenceIndex } from "./occurrences";
import type {
  BlockNode,
  BlockTreeState,
  ContentKey,
  NodeKey,
  PlacementKey,
  ViewId,
} from "./types";

export class BlockTreeProjection {
  readonly state: BlockTreeState;
  private readonly setState: (...args: any[]) => void;
  private readonly routeKeys = new Map<string, NodeKey>();
  private readonly nodeRoutes = new Map<NodeKey, string>();
  private readonly contentNodes = new Map<ContentKey, Set<NodeKey>>();
  private readonly placementNodes = new Map<PlacementKey, Set<NodeKey>>();
  private registeredKeys = new Set<NodeKey>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly repository: CanonicalRepository,
    readonly viewId: ViewId,
    private readonly occurrences: OccurrenceIndex,
    readonly rootPlacementKey: PlacementKey = repository.state.rootPlacementKey,
  ) {
    const initial = this.build();
    const [state, setState] = createStore(initial);
    this.state = state;
    this.setState = setState;
    this.register(initial);
    this.unsubscribe = repository.subscribeChanges((change) => {
      if (change.childrenOwner) {
        this.updateChildren(change.childrenOwner);
        return;
      }
      if (change.split) {
        this.updateSplit(change.split);
        return;
      }
      if (change.inlineOwner) {
        this.updateInline(change.inlineOwner);
        return;
      }
      const next = this.build();
      this.unregister();
      this.setState(reconcile(next));
      this.register(next);
    });
  }

  private nodeKey(route: string, placementKey: PlacementKey): NodeKey {
    const existing = this.routeKeys.get(route);
    if (existing) return existing;
    const key = createNodeKey(this.viewId, placementKey);
    this.routeKeys.set(route, key);
    this.nodeRoutes.set(key, route);
    return key;
  }

  private build(): BlockTreeState {
    const snapshot = this.repository.snapshot();
    const nodes: Record<NodeKey, BlockNode> = {};

    const project = (
      placementKey: PlacementKey,
      route: string,
      ancestors: Set<ContentKey>,
    ): NodeKey => {
      const placement = snapshot.placements[placementKey];
      if (!placement) throw new Error(`Missing projected placement ${placementKey}`);
      const content = snapshot.contents[placement.contentKey];
      if (!content) throw new Error(`Missing projected content ${placement.contentKey}`);
      const key = this.nodeKey(route, placementKey);
      if (ancestors.has(content.key)) {
        nodes[key] = {
          key,
          contentKey: content.key,
          placementKey,
          viewId: this.viewId,
          viewType: "cyclic-reference",
          payload: { ...content.payload, cycleTargetType: content.viewType },
          children: [],
          inlineContent: [],
          ownedRelations: {},
        };
        return key;
      }

      const nextAncestors = new Set(ancestors).add(content.key);
      const children = content.children.map((childKey) =>
        project(childKey, `${route}/child:${childKey}`, nextAncestors),
      );
      const inlineContent = content.inlineContent.map((inlineKey) =>
        project(inlineKey, `${route}/inline:${inlineKey}`, nextAncestors),
      );
      const ownedRelations = Object.fromEntries(
        Object.entries(content.ownedRelations).map(([name, relationKey]) => [
          name,
          project(relationKey, `${route}/relation:${name}:${relationKey}`, nextAncestors),
        ]),
      );
      nodes[key] = {
        key,
        contentKey: content.key,
        placementKey,
        viewId: this.viewId,
        viewType: content.viewType,
        payload: content.payload,
        children,
        inlineContent,
        ownedRelations,
      };
      return key;
    };

    const rootKey = project(this.rootPlacementKey, "root", new Set());
    return { rootKey, nodes, revision: snapshot.revision };
  }

  private register(state: BlockTreeState): void {
    for (const node of Object.values(state.nodes)) {
      this.registerNode(node);
    }
  }

  private registerNode(node: BlockNode): void {
    this.registeredKeys.add(node.key);
    this.occurrences.register(node.key, node.placementKey);
    for (const [index, key] of [[this.contentNodes, node.contentKey], [this.placementNodes, node.placementKey]] as const) {
      const keys = index.get(key) ?? new Set<NodeKey>();
      keys.add(node.key);
      index.set(key, keys);
    }
  }

  private unregisterNode(node: BlockNode): void {
    this.registeredKeys.delete(node.key);
    this.occurrences.unregister(node.key);
    for (const [index, key] of [[this.contentNodes, node.contentKey], [this.placementNodes, node.placementKey]] as const) {
      const keys = index.get(key);
      keys?.delete(node.key);
      if (!keys?.size) index.delete(key);
    }
  }

  private updateInline(contentKey: ContentKey): void {
    const source = this.repository.readState();
    const content = source.contents[contentKey];
    const nodes = unwrap(this.state.nodes);
    for (const key of this.contentNodes.get(contentKey) ?? []) {
      const owner = nodes[key];
      if (owner.viewType === "cyclic-reference") {
        this.setState("nodes", key, "payload", reconcile({ ...clone(content.payload), cycleTargetType: content.viewType }));
        continue;
      }
      const route = this.nodeRoutes.get(key)!;
      const inlineContent = content.inlineContent.map((placementKey) => {
        const cellKey = this.nodeKey(`${route}/inline:${placementKey}`, placementKey);
        if (!nodes[cellKey]) {
          const placement = source.placements[placementKey];
          const cell = source.contents[placement.contentKey];
          const node: BlockNode = {
            key: cellKey, contentKey: cell.key, placementKey, viewId: this.viewId,
            viewType: cell.viewType, payload: clone(cell.payload), children: [], inlineContent: [], ownedRelations: {},
          };
          this.setState("nodes", cellKey, node);
          this.registerNode(node);
        }
        return cellKey;
      });
      const retained = new Set(inlineContent);
      for (const oldKey of owner.inlineContent) {
        if (retained.has(oldKey)) continue;
        this.unregisterNode(nodes[oldKey]);
        this.setState("nodes", oldKey, undefined);
      }
      this.setState("nodes", key, "payload", reconcile(clone(content.payload)));
      this.setState("nodes", key, "inlineContent", reconcile(inlineContent));
    }
    this.setState("revision", source.revision);
  }

  private updateSplit(change: SplitChange): void {
    this.updateInline(change.left);
    this.updateChildren(change.parent);
  }

  private updateChildren(parentContentKey: ContentKey): void {
    const source = this.repository.readState();
    const nodes = unwrap(this.state.nodes);
    const addBranch = (placementKey: PlacementKey, route: string): NodeKey => {
      const key = this.nodeKey(route, placementKey);
      if (nodes[key]) return key;
      const content = source.contents[source.placements[placementKey].contentKey];
      // The split validator only permits a new paragraph containing leaf Cells.
      const inlineContent = content.inlineContent.map(cell => addBranch(cell, `${route}/inline:${cell}`));
      const node: BlockNode = {
        key, placementKey, contentKey: content.key, viewId: this.viewId,
        viewType: content.viewType, payload: clone(content.payload), children: [], inlineContent, ownedRelations: {},
      };
      this.setState("nodes", key, node);
      this.registerNode(node);
      return key;
    };
    const removeBranch = (key: NodeKey) => {
      const node = nodes[key];
      for (const cell of node.inlineContent) removeBranch(cell);
      this.unregisterNode(node);
      this.setState("nodes", key, undefined);
    };
    for (const key of this.contentNodes.get(parentContentKey) ?? []) {
      const parent = nodes[key];
      if (parent.viewType === "cyclic-reference") continue;
      const route = this.nodeRoutes.get(key)!;
      const children = source.contents[parentContentKey].children.map(placement => addBranch(placement, `${route}/child:${placement}`));
      const retained = new Set(children);
      for (const oldKey of parent.children) if (!retained.has(oldKey)) removeBranch(oldKey);
      this.setState("nodes", key, "children", reconcile(children));
    }
    this.setState("revision", source.revision);
  }

  private unregister(): void {
    for (const key of this.registeredKeys) this.occurrences.unregister(key);
    this.registeredKeys.clear();
    this.contentNodes.clear();
    this.placementNodes.clear();
  }

  node(key: NodeKey): BlockNode | undefined {
    return this.state.nodes[key];
  }

  nodeForPlacement(placementKey: PlacementKey): BlockNode | undefined {
    const key = this.placementNodes.get(placementKey)?.values().next().value;
    return key ? this.state.nodes[key] : undefined;
  }

  dispose(): void {
    this.unsubscribe();
    this.unregister();
  }
}
