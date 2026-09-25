import type { BlockNode, NodeKey, ViewId } from "../block-tree/types";
export interface BlockQueryPorts {
  node(key: NodeKey): BlockNode | undefined;
  root(view: ViewId): NodeKey | undefined;
}
/** Structural occurrence queries; no feature/UI dependency and no per-cell scan. */
export class BlockQueries {
  constructor(private readonly ports: BlockQueryPorts) {}
  ancestorPath(key: NodeKey): BlockNode[] {
    const origin = this.ports.node(key); if (!origin) return [];
    const root = this.ports.root(origin.viewId); if (!root) return [];
    const parents = new Map<NodeKey, BlockNode>();
    const visit = (key: NodeKey, seen = new Set<string>()) => {
      const node = this.ports.node(key); if (!node || seen.has(node.contentKey)) return;
      const next = new Set(seen).add(node.contentKey);
      for (const child of [...node.children, ...Object.values(node.ownedRelations)]) { parents.set(child, node); visit(child, next); }
    };
    visit(root);
    const path = [origin]; let parent = parents.get(key);
    while (parent && !path.includes(parent)) { path.unshift(parent); parent = parents.get(parent.key); }
    return path;
  }
  ancestors(key: NodeKey): BlockNode[] { return this.ancestorPath(key).reverse(); }
  contains(scope: NodeKey | undefined, key: NodeKey): boolean {
    if (!scope) return true;
    const seen = new Set<NodeKey>();
    const visit = (current: NodeKey): boolean => {
      if (current === key) return true; if (seen.has(current)) return false; seen.add(current);
      const node = this.ports.node(current);
      return !!node && [...node.children, ...Object.values(node.ownedRelations)].some(visit);
    };
    return visit(scope);
  }
  documentScope(key: NodeKey): NodeKey | undefined {
    const path = this.ancestors(key);
    const window = path.find(node => node.viewType === "document-window-block");
    return window?.key ?? path.filter(node => node.viewType === "document-block").at(-1)?.key;
  }
}
