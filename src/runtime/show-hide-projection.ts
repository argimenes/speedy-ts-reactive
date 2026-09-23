import { createStore } from "solid-js/store";
import type { NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";

/** Per-editor, per-Document projection state. Canonical text and annotations are unchanged. */
export class ShowHideProjection {
  readonly revealed: Record<string, boolean | undefined>;
  private readonly setRevealed: (...args: any[]) => void;

  constructor(private editor: ReactiveEditor) {
    [this.revealed, this.setRevealed] = createStore<Record<string, boolean | undefined>>({});
  }

  documentKey(nodeKey: NodeKey): string | undefined {
    const node = this.editor.node(nodeKey), projection = node && this.editor.projections.get(node.viewId);
    if (!node || !projection) return;
    const descendantDocument = (key: NodeKey, seen = new Set<NodeKey>()): string | undefined => {
      if (seen.has(key)) return;
      seen.add(key);
      const candidate = projection.state.nodes[key];
      if (!candidate) return;
      if (candidate.viewType === "document-block") return candidate.contentKey;
      for (const child of [...candidate.children, ...Object.values(candidate.ownedRelations)]) {
        const found = descendantDocument(child, seen);
        if (found) return found;
      }
    };
    const nested = descendantDocument(nodeKey);
    if (nested) return nested;
    const parents = new Map<NodeKey, NodeKey>();
    for (const candidate of Object.values(projection.state.nodes)) {
      for (const child of [...candidate.children, ...Object.values(candidate.ownedRelations)]) parents.set(child, candidate.key);
    }
    let cursor: NodeKey | undefined = nodeKey;
    while (cursor) {
      const candidate = projection.state.nodes[cursor];
      if (candidate?.viewType === "document-block") return candidate.contentKey;
      cursor = parents.get(cursor);
    }
  }

  shows(nodeKey: NodeKey): boolean {
    const key = this.documentKey(nodeKey);
    return !!(key && this.revealed[key]);
  }

  toggle(nodeKey: NodeKey): boolean {
    const key = this.documentKey(nodeKey);
    if (!key) throw new Error("Focus a Document before toggling hidden text.");
    const next = !this.revealed[key];
    this.setRevealed(key, next);
    return next;
  }
}
