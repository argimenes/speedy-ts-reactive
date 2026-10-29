import type { ListWrapChange } from "./list-wrap-plan";
import { createSignal } from 'solid-js';
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
  private readonly topology = createSignal(0);
  readonly structureVersion = this.topology[0];
  /** Reuse the existing occurrence route index for bounded ancestor navigation. */
  parentOf(key: NodeKey): BlockNode | undefined {
    this.structureVersion();
    const route = this.nodeRoutes.get(key);
    if (!route || !route.includes('/')) return;
    const parent = this.routeKeys.get(route.slice(0, route.lastIndexOf('/')));
    return parent ? this.state.nodes[parent] : undefined;
  }
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
    private readonly retainStructuralIdentity = false,
  ) {
    const initial = this.build();
    const [state, setState] = createStore(initial);
    this.state = state;
    this.setState = setState;
    this.register(initial);
    this.unsubscribe = repository.subscribeChanges((change) => {
      if (!repository.readState().placements[this.rootPlacementKey]) {
        this.unregister();
        this.setState(reconcile({ rootKey: this.state.rootKey, nodes: {}, revision: repository.state.revision }));
        return;
      }
      if (change.taskStateOwner) {
        const content = repository.readState().contents[change.taskStateOwner];
        for (const key of this.contentNodes.get(content.key) ?? [])
          this.setState("nodes", key, "payload", "checked", content.payload.checked);
        return;
      }
      if (change.listWrap) {
        this.updateListWrap(change.listWrap);
        return;
      }
      if (change.appendedChildrenOwner) {
        this.appendChildren(change.appendedChildrenOwner);
        return;
      }
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
        // The validated inline batch may also annotate other existing text
        // owners. Update those occurrences without rebuilding the projection.
        for(const [key,previous] of change.previousContents){
          if(key!==change.inlineOwner&&previous?.inlineKind==='standoff'&&repository.readState().contents[key]?.inlineKind==='standoff')this.updateInline(key);
        }
        return;
      }
      const next = this.build();
      this.unregister();
      this.setState(reconcile(next));
      this.register(next);
      this.topology[1](v => v + 1);
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

  private build(rootPlacementKey = this.rootPlacementKey, rootRoute = "root", ancestors = new Set<ContentKey>()): BlockTreeState {
    // Read only this occurrence subtree; copying the whole workspace makes
    // activating a small neighbouring tab depend on every loaded Document.
    const snapshot = this.repository.readState();
    const nodes: Record<NodeKey, BlockNode> = {};

    const project = (
      placementKey: PlacementKey,
      route: string,
      ancestors: Set<ContentKey>,
    ): NodeKey => {
      const placement = snapshot.placements[placementKey];
      if (!placement) throw new Error(`Missing projected placement ${placementKey}`);
      const content = snapshot.contents[placement.contentKey];
      if (placement.externalReference) {
        const key = this.nodeKey(route, placementKey);
        nodes[key] = { key, contentKey: placement.contentKey, placementKey, viewId: this.viewId,
          viewType: "external-reference", payload: { reference: clone(placement.externalReference) },
          children: [], inlineContent: [], ownedRelations: {} };
        return key;
      }
      if (!content) throw new Error(`Missing projected content ${placement.contentKey}`);
      const key = this.nodeKey(route, placementKey);
      if (ancestors.has(content.key)) {
        nodes[key] = {
          key,
          contentKey: content.key,
          placementKey,
          viewId: this.viewId,
          viewType: "cyclic-reference",
          payload: { ...clone(content.payload), cycleTargetType: content.viewType },
          children: [],
          inlineContent: [],
          ownedRelations: {},
        };
        return key;
      }

      // Ordinary character atoms are leaves. Avoid allocating an ancestor Set
      // and walking three empty edge collections for every character in every
      // view. Keep a private payload: projection reconciliation must never mutate
      // canonical content or another occurrence's payload.
      if (content.viewType === "text-cell" && !content.children.length && !content.inlineContent.length && !Object.keys(content.ownedRelations).length) {
        nodes[key] = {
          key, contentKey: content.key, placementKey, viewId: this.viewId,
          viewType: content.viewType,
          payload: typeof content.payload.text === "string" && Object.keys(content.payload).length === 1
            ? { text: content.payload.text } : clone(content.payload),
          children: [], inlineContent: [], ownedRelations: {},
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
        payload: clone(content.payload),
        children,
        inlineContent,
        ownedRelations,
      };
      return key;
    };

    let rootKey = project(rootPlacementKey, rootRoute, ancestors);
    // Structural edits may change the route of an existing, unique occurrence.
    // Reuse its identity only when BOTH projections contain exactly one instance
    // of that placement. Shared/reference occurrences must never be conflated.
    // This runs on structural rebuilds, never on the inline typing path.
    if (this.retainStructuralIdentity && rootRoute === "root" && this.registeredKeys.size) {
      const byPlacement = new Map<PlacementKey, NodeKey[]>();
      for (const node of Object.values(nodes)) {
        const keys = byPlacement.get(node.placementKey) ?? [];
        keys.push(node.key); byPlacement.set(node.placementKey, keys);
      }
      const moves = new Map<NodeKey, NodeKey>();
      for (const [placement, next] of byPlacement) {
        const previous = this.placementNodes.get(placement);
        if (next.length !== 1 || previous?.size !== 1) continue;
        const old = previous.values().next().value!;
        if (old !== next[0] && !nodes[old]) moves.set(next[0], old);
      }
      const keyFor = (key: NodeKey) => moves.get(key) ?? key;
      for (const [fresh, old] of moves) {
        const route = this.nodeRoutes.get(fresh)!, oldRoute = this.nodeRoutes.get(old);
        if (oldRoute && this.routeKeys.get(oldRoute) === old) this.routeKeys.delete(oldRoute);
        this.routeKeys.set(route, old); this.nodeRoutes.set(old, route); this.nodeRoutes.delete(fresh);
        nodes[old] = { ...nodes[fresh], key: old }; delete nodes[fresh];
      }
      if (moves.size) for (const node of Object.values(nodes)) {
        node.children = node.children.map(keyFor); node.inlineContent = node.inlineContent.map(keyFor);
        node.ownedRelations = Object.fromEntries(Object.entries(node.ownedRelations).map(([name, key]) => [name, keyFor(key)]));
      }
      rootKey = keyFor(rootKey);
    }
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

  /** Reparent existing occurrences; only routes in the moved subtree change. */
  private updateListWrap(change: ListWrapChange): void {
    if (change.inlineChanged) this.updateInline(change.child);
    const source = this.repository.readState(), nodes = unwrap(this.state.nodes);
    const reroute = (key: NodeKey, oldPrefix: string, newPrefix: string) => {
      const node = nodes[key], old = this.nodeRoutes.get(key)!;
      const route = newPrefix + old.slice(oldPrefix.length);
      if (this.routeKeys.get(old) === key) this.routeKeys.delete(old);
      this.routeKeys.set(route, key); this.nodeRoutes.set(key, route);
      for (const child of [...node.children, ...node.inlineContent, ...Object.values(node.ownedRelations)]) reroute(child, oldPrefix, newPrefix);
    };
    for (const key of this.contentNodes.get(change.parent) ?? []) {
      const parent = nodes[key];
      if (parent.viewType === "cyclic-reference") continue;
      const route = this.nodeRoutes.get(key)!;
      const index = parent.children.findIndex(k => nodes[k].placementKey === (change.wrapped ? change.item : change.wrapper));
      if (index < 0) continue;
      const children = [...parent.children];
      if (change.wrapped) {
        const child = children[index], wrapperRoute = `${route}/child:${change.wrapper}`;
        const wrapperKey = this.nodeKey(wrapperRoute, change.wrapper), list = source.contents[change.wrapperContent];
        reroute(child, this.nodeRoutes.get(child)!, `${wrapperRoute}/child:${change.item}`);
        const wrapper: BlockNode = { key: wrapperKey, placementKey: change.wrapper, contentKey: list.key, viewId: this.viewId,
          viewType: list.viewType, payload: clone(list.payload), children: [child], inlineContent: [], ownedRelations: {} };
        this.setState("nodes", wrapperKey, wrapper); this.registerNode(wrapper);
        children[index] = wrapperKey;
      } else {
        const wrapper = nodes[children[index]], child = wrapper.children[0];
        reroute(child, this.nodeRoutes.get(child)!, `${route}/child:${change.item}`);
        this.unregisterNode(wrapper); this.setState("nodes", wrapper.key, undefined);
        children[index] = child;
      }
      this.setState("nodes", key, "children", reconcile(children));
    }
    this.setState("revision", source.revision);
    this.topology[1](v => v + 1);
  }

  private updateSplit(change: SplitChange): void {
    this.updateInline(change.left);
    this.updateChildren(change.parent);
  }

  private appendChildren(parentContentKey: ContentKey): void {
    const source = this.repository.readState(), nodes = unwrap(this.state.nodes);
    for (const key of this.contentNodes.get(parentContentKey) ?? []) {
      const parent = nodes[key];
      if (parent.viewType === 'cyclic-reference') continue;
      const route = this.nodeRoutes.get(key)!, ancestors = new Set<ContentKey>();
      for (const [ancestorKey, ancestorRoute] of this.nodeRoutes) {
        if (nodes[ancestorKey] && (route === ancestorRoute || route.startsWith(ancestorRoute + '/'))) ancestors.add(nodes[ancestorKey].contentKey);
      }
      const children = [...parent.children];
      for (const placement of source.contents[parentContentKey].children.slice(children.length)) {
        const branch = this.build(placement, `${route}/child:${placement}`, ancestors);
        this.setState('nodes',branch.nodes);
        this.register(branch);
        children.push(branch.rootKey);
      }
      this.setState('nodes',key,'children',reconcile(children));
    }
    this.setState('revision',source.revision);
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

  occurrenceCount(placementKey: PlacementKey): number { return this.placementNodes.get(placementKey)?.size ?? 0; }

  nodeForPlacement(placementKey: PlacementKey): BlockNode | undefined {
    const key = this.placementNodes.get(placementKey)?.values().next().value;
    return key ? this.state.nodes[key] : undefined;
  }

  /** Includes removed nodes so a disposable host can release occurrence-local state. */
  occurrenceKeys(): readonly NodeKey[] { return [...this.routeKeys.values()]; }

  dispose(): void {
    this.unsubscribe();
    this.unregister();
  }
}
