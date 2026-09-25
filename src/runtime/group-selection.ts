import { createSignal } from "solid-js";
import type { NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { exactTextRangeKey as exactRangeKey, mergeTextRanges, type TextRangeSnapshot } from "./text-ranges";
import type { TextSelectionSnapshot } from "./selection-snapshot";
import type { SelectionVisibility } from "./range-annotations";

export const GROUP_SELECTION_OWNER = "manual-group-selection";

/** A short-lived manual range collection rendered by the existing session decoration layer. */
export class GroupSelection {
  readonly owner = GROUP_SELECTION_OWNER;
  private readonly activeSignal = createSignal(false);
  readonly active = this.activeSignal[0];
  private readonly rangesSignal = createSignal<readonly TextRangeSnapshot[]>([]);
  readonly ranges = this.rangesSignal[0];
  private readonly messageSignal = createSignal("");
  readonly message = this.messageSignal[0];
  private scopeKey?: NodeKey;
  private viewId?: string;
  private applying = false;
  private readonly disposeBoundaries: () => void;
  private readonly unsubscribe: () => void;

  constructor(private editor: ReactiveEditor, private visibility: SelectionVisibility) {
    const releaseGesture = editor.selectionGestures.register({ owner: this.owner, modifier: "Control", complete: selection => { this.captureCurrent(selection); }, error: error => this.messageSignal[1](error instanceof Error ? error.message : String(error)), removeAt: (key, index) => this.removeAt(key, index) });
    const releaseOperation = editor.currentTextOperation.register(this.owner, {
      active: () => this.active() || visibility.active(),
      owns: key => this.active() ? editor.blockQueries.contains(this.scopeKey, key) : visibility.active(key),
      annotationTargets: () => this.active() ? this.ranges() : undefined,
      apply: (type, value, attributes) => this.apply(type, value, attributes),
      delete: key => this.deleteSelected(key), cancel: () => this.cancel(),
      error: error => this.messageSignal[1](error instanceof Error ? error.message : String(error)),
    });
    this.disposeBoundaries = () => { releaseGesture(); releaseOperation(); };
    this.unsubscribe = editor.repository.subscribeBeforeChanges(() => {
      if (this.active() && !this.applying) this.cancel("Grouping cancelled because the document changed.");
    });
  }

  begin(scopeKey?: NodeKey): void {
    this.editor.crossText.clear();
    this.visibility.clear();
    this.scopeKey = scopeKey;
    this.viewId = scopeKey ? this.editor.node(scopeKey)?.viewId : undefined;
    this.rangesSignal[1]([]);
    this.activeSignal[1](true);
    this.messageSignal[1]("Hold Control while selecting to group. Control-click removes a range. Esc cancels. Delete removes grouped text.");
    this.paint();
  }

  add(nodeKey: NodeKey, start: number, end: number): boolean {
    if (!this.active()) return false;
    const node = this.editor.node(nodeKey), content = node && this.editor.repository.readState().contents[node.contentKey];
    const first = Math.min(start, end), last = Math.max(start, end);
    if (!node || node.viewType !== "standoff-editor-block" || !content || !this.editor.blockQueries.contains(this.scopeKey, nodeKey) ||
      (this.viewId && node.viewId !== this.viewId) || !Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last <= first || last > node.inlineContent.length) return false;
    this.viewId ??= node.viewId;
    const range = this.editor.textRanges.snapshot(node.key, first, last);
    if (this.ranges().some(existing => exactRangeKey(existing) === exactRangeKey(range))) return false;
    this.rangesSignal[1]([...this.ranges(), range]);
    this.messageSignal[1](`${this.ranges().length} grouped range${this.ranges().length === 1 ? "" : "s"}. Hold Control to add another range. Esc cancels. Delete removes grouped text.`);
    this.paint();
    return true;
  }

  captureCurrent(snapshot: TextSelectionSnapshot): boolean {
    const nonempty = snapshot.ranges;
    this.editor.textRanges.validate(nonempty, "cell");
    if (!nonempty.length) return false;
    if (!this.active()) this.begin(this.editor.blockQueries.documentScope(nonempty[0].nodeKey));
    let captured = false;
    for (const range of nonempty) captured = this.add(range.nodeKey, range.start, range.end) || captured;
    if (captured) {
      this.editor.crossText.clear();
      document.getSelection()?.removeAllRanges();
      for (const range of nonempty) this.editor.selections.removeOccurrence(range.nodeKey);
      // Keep a collapsed caret at the gesture's head for the next keyboard range.
      const headKey = snapshot.head.nodeKey;
      const head = snapshot.head.index;
      const node = this.editor.node(headKey)!;
      const mount = this.editor.mounts.get(headKey);
      mount?.focus(); mount?.restoreInlineSelection?.({ anchor: head, head });
      this.editor.selections.setPrimary(headKey, node.contentKey, node.viewId, head);
    }
    return captured;
  }

  /** Delete only manual grouping membership, never Find/entity session decorations. */
  deleteSelected(nodeKey: NodeKey): boolean {
    if (this.active() && !this.editor.blockQueries.contains(this.scopeKey, nodeKey)) return false;
    const ranges = this.active() ? this.ranges() : this.visibility.ranges(nodeKey);
    if (!ranges.length) return false;
    try { this.editor.textRanges.validate(ranges, "cell"); }
    catch {
      this.cancel("Grouping cancelled because a text range changed. Select the ranges again."); return true;
    }
    const merged = mergeTextRanges(ranges);
    const projection = this.editor.projections.get(this.editor.node(nodeKey)!.viewId)!;
    const order = new Map<NodeKey, number>();
    const visit = (key: NodeKey) => {
      if (order.has(key)) return;
      order.set(key, order.size);
      const node = projection.state.nodes[key];
      if (node) for (const child of [...node.children, ...Object.values(node.ownedRelations)]) visit(child);
    };
    visit(projection.state.rootKey);
    merged.sort((a, b) => (order.get(a.nodeKey) ?? 0) - (order.get(b.nodeKey) ?? 0) || a.start - b.start);
    const first = merged[0];
    this.applying = true;
    try {
      this.editor.commands.transaction("Delete grouped text", () => {
        for (const range of [...merged].reverse()) this.editor.commands.replaceInlineRange(range.nodeKey, range.start, range.end, "");
      });
      this.cancel("Grouped text deleted.");
      this.editor.crossText.clear();
      const node = this.editor.node(first.nodeKey)!;
      const mount = this.editor.mounts.get(first.nodeKey);
      document.getSelection()?.removeAllRanges();
      mount?.focus(); mount?.restoreInlineSelection?.({ anchor: first.start, head: first.start });
      this.editor.selections.clearExcept(first.nodeKey);
      this.editor.selections.setPrimary(first.nodeKey, node.contentKey, node.viewId, first.start);
      return true;
    } finally { this.applying = false; }
  }

  removeAt(nodeKey: NodeKey, index: number): boolean {
    const ranges = this.ranges();
    // When ranges overlap, remove the most recently added matching range.
    const range = [...ranges].reverse().find(range => range.nodeKey === nodeKey && range.start <= index && index < range.end);
    if (!range) return this.visibility.removeAt(nodeKey, index);
    this.rangesSignal[1](ranges.filter(candidate => candidate !== range));
    if (!this.ranges().length) { this.finish("Grouping cleared."); return true; }
    this.messageSignal[1](`${this.ranges().length} grouped ranges. Control-click a range to remove it. Escape cancels.`);
    this.paint();
    return true;
  }

  apply(type: string, value?: string, attributes: Readonly<Record<string, number | string>> = {}): number {
    if (!this.active() || !this.ranges().length) throw new Error("Select at least one text range for this group.");
    this.applying = true;
    try {
      const count = this.editor.rangeAnnotations.apply(this.ranges(), type, value, attributes).added;
      this.finish();
      return count;
    } finally { this.applying = false; }
  }

  cancel(message = "Grouping cancelled."): void {
    this.editor.selectionGestures.cancelGesture();
    this.finish(message);
    this.visibility.clear();
  }

  private finish(message = ""): void {
    this.editor.decorations.clearHighlights(this.owner);
    this.rangesSignal[1]([]);
    this.activeSignal[1](false);
    this.scopeKey = undefined;
    this.viewId = undefined;
    this.messageSignal[1](message);
  }

  private paint(): void {
    this.editor.decorations.attachRanges(this.owner, [...this.ranges()], {
      type: "editor/group-selection",
      fill: "#8bd7c4",
      priority: 30,
    });
  }

  dispose(): void {
    this.disposeBoundaries();
    this.finish();
    this.unsubscribe();
  }
}
