import { batch } from "solid-js";
import { createStore } from "solid-js/store";
import type { BlockNode, NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";

export interface SelectedBlock {
  nodeKey: NodeKey;
  placementKey: string;
  contentKey: string;
  viewId: string;
  blockId?: string;
  type: string;
}
export type BlockSelectionMode = "single" | "toggle" | "range" | "add-range";
const shells = new Set(["document-block", "main-list-block", "membrane-block", "root-block", "workspace-block", "universe-block", "page-block", "fixed-size-page-block", "window-block", "document-window-block", "tab-block", "document-tab-block", "sticky-tab-block", "document-tab-row-block", "sticky-tab-row-block", "table-row-block", "grid-row-block", "table-cell-block", "grid-cell-block", "left-margin-block", "right-margin-block"]);

/** Occurrence-local UI state. No canonical repository writes or document snapshots. */
export class BlockSelectionService {
  readonly state;
  private readonly update;
  private readonly flags;
  private readonly setFlags;
  constructor(private readonly editor: ReactiveEditor) {
    [this.state, this.update] = createStore<{ items: SelectedBlock[]; anchorKey?: NodeKey; leadKey?: NodeKey; viewId?: string; scopeKey?: NodeKey; message: string }>({ items: [], message: "" });
    [this.flags, this.setFlags] = createStore<Record<NodeKey, boolean>>({});
  }
  eligible(key: NodeKey): boolean {
    const node = this.editor.node(key);
    return !!node && !shells.has(node.viewType) && !["text-cell", "inline-image", "cyclic-reference"].includes(node.viewType) &&
      this.editor.projections.get(node.viewId)?.state.rootKey !== key && !node.viewType.endsWith("-background-block");
  }
  isSelected(key: NodeKey) { return !!this.flags[key]; }
  /** IDs as requested by callers; missing legacy IDs use session placement keys. */
  get ids(): string[] { return this.state.items.map(item => item.blockId ?? item.placementKey); }
  get nodeKeys(): NodeKey[] { return this.state.items.map(item => item.nodeKey); }
  snapshot(): SelectedBlock[] { return this.state.items.map(item => ({ ...item })); }
  private visible(key: NodeKey): boolean {
    const root = this.editor.mounts.get(key)?.root;
    return !!root?.isConnected && !root.closest('[hidden], [aria-hidden="true"]');
  }
  private parents(viewId: string) {
    const parents = new Map<NodeKey, NodeKey>();
    for (const node of Object.values(this.editor.projections.get(viewId)?.state.nodes ?? {})) {
      for (const key of [...node.children, ...Object.values(node.ownedRelations)]) parents.set(key, node.key);
    }
    return parents;
  }
  private scope(key: NodeKey, parents: Map<NodeKey, NodeKey>): NodeKey {
    let cursor: NodeKey | undefined = key;
    while (cursor) {
      const node = this.editor.node(cursor);
      if (node && ["document-block", "main-list-block", "membrane-block", "left-margin-block", "right-margin-block"].includes(node.viewType)) return cursor;
      const parent = parents.get(cursor); if (!parent) return cursor;
      cursor = parent;
    }
    return key;
  }
  private ordered(scopeKey: NodeKey): NodeKey[] {
    const keys: NodeKey[] = [];
    const visit = (key: NodeKey) => {
      const node = this.editor.node(key); if (!node || !this.visible(key)) return;
      if (key !== scopeKey && ["document-block", "left-margin-block", "right-margin-block"].includes(node.viewType)) return;
      if (this.eligible(key)) keys.push(key);
      node.children.forEach(visit);
      // Margins are independent editing scopes, not interleaved with main text.
    };
    visit(scopeKey); return keys;
  }
  private entry(node: BlockNode): SelectedBlock {
    return { nodeKey: node.key, placementKey: node.placementKey, contentKey: node.contentKey, viewId: node.viewId,
      ...(typeof node.payload.id === "string" ? { blockId: node.payload.id } : {}), type: node.viewType };
  }
  select(key: NodeKey, mode: BlockSelectionMode = "single"): boolean {
    this.editor.crossText.clear();
    const node = this.editor.node(key);
    if (!node || !this.eligible(key) || !this.visible(key)) return false;
    const scopeKey = this.scope(key, this.parents(node.viewId));
    const sameScope = this.state.viewId === node.viewId && this.state.scopeKey === scopeKey;
    const previous = sameScope ? this.nodeKeys : [];
    const anchor = sameScope && this.state.anchorKey && this.visible(this.state.anchorKey) ? this.state.anchorKey : key;
    const ordered = this.ordered(scopeKey);
    let keys = [key];
    if (mode === "toggle") keys = previous.includes(key) ? previous.filter(k => k !== key) : [...previous, key];
    if (mode === "range" || mode === "add-range") {
      const from = ordered.indexOf(anchor), to = ordered.indexOf(key);
      const range = from < 0 || to < 0 ? [key] : ordered.slice(Math.min(from, to), Math.max(from, to) + 1);
      keys = mode === "add-range" ? [...new Set([...previous, ...range])] : range;
    }
    const selected = new Set(keys);
    this.commit(ordered.filter(k => selected.has(k)).map(k => this.entry(this.editor.node(k)!)), {
      scopeKey, viewId: node.viewId, anchorKey: mode === "range" || mode === "add-range" ? anchor : key, leadKey: key,
    });
    return true;
  }
  navigate(key: NodeKey, direction: -1 | 1, extend: boolean): NodeKey | undefined {
    const node = this.editor.node(key); if (!node) return;
    const scopeKey = this.scope(key, this.parents(node.viewId));
    const ordered = this.ordered(scopeKey), index = ordered.indexOf(key);
    if (index < 0) return;
    const target = ordered[index + direction]; if (!target) return;
    if (extend && !this.state.anchorKey) this.select(key);
    this.select(target, extend ? "range" : "single"); return target;
  }
  /** Future structural commands should consume these, avoiding parent/child duplication. */
  actionTargets(): SelectedBlock[] {
    const items = this.snapshot(); if (!items.length) return [];
    const selected = new Set(items.map(item => item.nodeKey)), parents = this.parents(items[0].viewId);
    const placements = new Set<string>();
    return items.filter(item => {
      let parent = parents.get(item.nodeKey);
      while (parent) { if (selected.has(parent)) return false; parent = parents.get(parent); }
      if (!this.editor.node(item.nodeKey) || placements.has(item.placementKey)) return false;
      placements.add(item.placementKey); return true;
    });
  }
  prune() {
    const remaining = this.state.items.filter(item => {
      const node = this.editor.node(item.nodeKey);
      return node?.placementKey === item.placementKey && node.contentKey === item.contentKey && this.visible(item.nodeKey);
    });
    if (remaining.length !== this.state.items.length) this.commit(remaining.map(item => ({ ...item })), {
      anchorKey: remaining.some(item => item.nodeKey === this.state.anchorKey) ? this.state.anchorKey : remaining[0]?.nodeKey,
      leadKey: remaining.some(item => item.nodeKey === this.state.leadKey) ? this.state.leadKey : remaining.at(-1)?.nodeKey,
    });
  }
  replaceKeys(keys: NodeKey[]) {
    const nodes = keys.map(key => this.editor.node(key)).filter((node): node is BlockNode => !!node);
    if (!nodes.length) { this.clear(); return; }
    const viewId = nodes[0].viewId;
    this.commit(nodes.map(node => this.entry(node)), { viewId, scopeKey: this.scope(nodes[0].key, this.parents(viewId)), anchorKey: nodes[0].key, leadKey: nodes.at(-1)!.key });
  }
  clear() { this.commit([], {}); }
  setMessage(message: string) { this.update("message", message); }
  reorderTargets(): NodeKey[] {
    const items = this.actionTargets(); if (!items.length) return [];
    const parents = this.parents(items[0].viewId), parentKey = parents.get(items[0].nodeKey);
    const parent = parentKey && this.editor.node(parentKey);
    if (!parent || items.some(item => parents.get(item.nodeKey) !== parentKey || !parent.children.includes(item.nodeKey))) return [];
    const keys = new Set(items.map(item => item.nodeKey));
    return parent.children.filter(key => !keys.has(key) && this.visible(key));
  }
  /** Reorder only: nesting and cross-parent transfers are intentionally separate. */
  moveTo(targetKey: NodeKey, side: "before" | "after"): boolean {
    const items = this.actionTargets(), target = this.editor.node(targetKey);
    if (!target || !items.length || items.some(item => item.nodeKey === targetKey) || target.viewId !== this.state.viewId) return false;
    const parents = this.parents(target.viewId), parentKey = parents.get(targetKey);
    const parent = parentKey && this.editor.node(parentKey);
    if (!parent || !parent.children.includes(targetKey) || items.some(item => parents.get(item.nodeKey) !== parentKey || !parent.children.includes(item.nodeKey))) return false;
    const ordered = parent.children.filter(key => items.some(item => item.nodeKey === key));
    const moving = new Set(ordered), remaining = parent.children.filter(key => !moving.has(key));
    remaining.splice(remaining.indexOf(targetKey) + (side === "after" ? 1 : 0), 0, ...ordered);
    if (remaining.every((key, i) => key === parent.children[i])) return false;
    this.editor.commands.transaction("Move selected Blocks", () => {
      for (const key of side === "before" ? ordered : [...ordered].reverse()) this.editor.commands.move(key, { kind: side, anchorKey: targetKey });
    });
    // Refresh document order without selecting additional blocks.
    const keys = new Set(this.nodeKeys);
    this.commit(this.ordered(this.state.scopeKey!).filter(key => keys.has(key)).map(key => this.entry(this.editor.node(key)!)), {});
    return true;
  }
  private commit(items: SelectedBlock[], context: Partial<Omit<typeof this.state, "items">>) {
    const next = new Set(items.map(item => item.nodeKey));
    batch(() => {
      for (const item of this.state.items) if (!next.has(item.nodeKey)) this.setFlags(item.nodeKey, false);
      for (const item of items) if (!this.flags[item.nodeKey]) this.setFlags(item.nodeKey, true);
      this.update({ message: "", ...context, items, ...(!items.length ? { anchorKey: undefined, leadKey: undefined, viewId: undefined, scopeKey: undefined } : {}) });
    });
  }
}
