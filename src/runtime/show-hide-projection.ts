import { createStore } from "solid-js/store";
import type { NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";

/** Per-editor, per-Document projection state. Canonical text and annotations are unchanged. */
export class ShowHideProjection {
  readonly revealed: Record<string, boolean | undefined>;
  private readonly setRevealed: (...args: any[]) => void;
  private readonly selections: Record<string, string[] | undefined>;
  private readonly visibility: Record<string, boolean | undefined>;
  private readonly setVisibility: (...args: any[]) => void;
  private readonly setSelections: (...args: any[]) => void;

  constructor(private editor: ReactiveEditor) {
    [this.revealed, this.setRevealed] = createStore<Record<string, boolean | undefined>>({});
    [this.selections, this.setSelections] = createStore<Record<string, string[] | undefined>>({});
    [this.visibility, this.setVisibility] = createStore<Record<string, boolean | undefined>>({});
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

  private token(nodeKey: NodeKey, id: string | number): string {
    return JSON.stringify([this.editor.node(nodeKey)?.contentKey, id]);
  }

  shows(nodeKey: NodeKey, id?: string | number): boolean {
    if (id !== undefined) return !!this.visibility[this.token(nodeKey, id)];
    const key = this.documentKey(nodeKey);
    return !!(key && this.revealed[key]);
  }

  /** Replace transient membership when a new selection is annotated. */
  retainSelection(targets: readonly { nodeKey: NodeKey; id: string | number }[]): void {
    const documents = new Map<string, string[]>();
    for (const { nodeKey, id } of targets) {
      const key = this.documentKey(nodeKey);
      if (!key) continue;
      const tokens = documents.get(key) ?? [];
      tokens.push(this.token(nodeKey, id));
      documents.set(key, tokens);
    }
    for (const [key, tokens] of documents) {
      this.setSelections(key, [...new Set(tokens)]);
      for (const token of tokens) this.setVisibility(token, false);
      this.setRevealed(key, false);
    }
  }

  selectionActive(nodeKey?: NodeKey, id?: string | number): boolean {
    if (!nodeKey) return Object.values(this.selections).some(tokens => !!tokens?.length);
    const key = this.documentKey(nodeKey);
    const tokens = key ? this.selections[key] : undefined;
    return id === undefined ? !!tokens?.length : !!tokens?.includes(this.token(nodeKey, id));
  }

  removeAt(nodeKey: NodeKey, index: number): boolean {
    const key = this.documentKey(nodeKey);
    const tokens = key ? this.selections[key] : undefined;
    if (!key || !tokens?.length) return false;
    const properties = this.editor.node(nodeKey)?.payload.standoffProperties as
      { id?: string; type: string; start?: number; end?: number; isDeleted?: boolean }[] | undefined;
    const match = properties?.map((property, i) => ({ property, token: this.token(nodeKey, property.id ?? i) })).reverse()
      .find(({ property, token }) => property.type === "style/show-hide" && !property.isDeleted &&
        property.start !== undefined && property.end !== undefined && property.start <= index && index <= property.end &&
        tokens.includes(token) && this.visibility[token]);
    if (!match) return false;
    // Leave deselected text visible and exclude it from future group toggles.
    this.setVisibility(match.token, true);
    const remaining = tokens.filter(token => token !== match.token);
    this.setSelections(key, remaining.length ? remaining : undefined);
    return true;
  }

  clearSelections(): void {
    // Cancellation restores the active group's text and discards its membership.
    for (const key of Object.keys(this.selections)) {
      const tokens = this.selections[key];
      if (!tokens) continue;
      for (const token of tokens) this.setVisibility(token, true);
      this.setRevealed(key, true);
      this.setSelections(key, undefined);
    }
  }

  toggle(nodeKey: NodeKey): boolean {
    const key = this.documentKey(nodeKey);
    if (!key) throw new Error("Focus a Document before toggling hidden text.");
    const next = !this.revealed[key];
    let tokens = this.selections[key];
    if (!tokens) {
      // With no active group, the command explicitly targets the whole Document.
      tokens = [];
      const node = this.editor.node(nodeKey);
      const projection = node && this.editor.projections.get(node.viewId);
      for (const candidate of Object.values(projection?.state.nodes ?? {})) {
        if (candidate.viewType !== "standoff-editor-block" || this.documentKey(candidate.key) !== key) continue;
        const properties = candidate.payload.standoffProperties as { id?: string; type: string; isDeleted?: boolean }[] | undefined;
        properties?.forEach((property, index) => {
          if (property.type === "style/show-hide" && !property.isDeleted) tokens!.push(this.token(candidate.key, property.id ?? index));
        });
      }
      this.setSelections(key, [...new Set(tokens)]);
    }
    for (const token of tokens) this.setVisibility(token, next);
    this.setRevealed(key, next);
    return next;
  }
}
