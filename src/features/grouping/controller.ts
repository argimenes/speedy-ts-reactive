import { createSignal } from "solid-js";
import { exactTextRangeKey as exactRangeKey, type NodeKey, type TextRangeSnapshot, type TextSelectionSnapshot, type TextOperationCapabilities } from "../../feature-api";

export const GROUP_SELECTION_OWNER = "grouping";

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
  private live = true;

  constructor(private ports: TextOperationCapabilities) {}

  attach(): void {
    const { register } = this.ports;
    register.gesture({ modifier: "Control", complete: selection => { this.captureCurrent(selection); }, error: error => this.noticeError(error), removeAt: (key, index) => this.removeAt(key, index) });
    register.operation({
      active: () => this.live && (this.active() || this.ports.visibility.active()),
      owns: key => this.owns(key), annotationTargets: () => this.active() ? this.ranges() : undefined,
      apply: (type, value, attributes) => this.apply(type, value, attributes),
      delete: key => this.deleteSelected(key), cancel: () => this.cancel(), error: error => this.noticeError(error),
    });
    register.beforeChange(() => {
      if (this.active() && !this.applying) this.cancel("Grouping cancelled because the document changed.");
    });
  }

  owns(key: NodeKey): boolean { return this.live && (this.active() ? this.ports.queries.contains(this.scopeKey, key) : this.ports.visibility.active(key)); }
  noticeError(error: unknown): void { if (this.live) this.messageSignal[1](error instanceof Error ? error.message : String(error)); }

  begin(scopeKey?: NodeKey): void {
    if (!this.live) return;
    this.ports.selection.clearLive();
    this.ports.visibility.clear();
    this.scopeKey = scopeKey;
    this.viewId = scopeKey ? this.ports.queries.view(scopeKey) : undefined;
    this.rangesSignal[1]([]);
    this.activeSignal[1](true);
    this.messageSignal[1]("Hold Control while selecting to group. Control-click removes a range. Esc cancels. Delete removes grouped text.");
    this.paint();
  }

  add(nodeKey: NodeKey, start: number, end: number): boolean {
    if (!this.live || !this.active()) return false;
    const node = this.ports.queries.text(nodeKey);
    const first = Math.min(start, end), last = Math.max(start, end);
    if (!node || !this.ports.queries.contains(this.scopeKey, nodeKey) ||
      (this.viewId && node.viewId !== this.viewId) || !Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last <= first || last > node.length) return false;
    this.viewId ??= node.viewId;
    const range = this.ports.ranges.snapshot(node.key, first, last);
    if (this.ranges().some(existing => exactRangeKey(existing) === exactRangeKey(range))) return false;
    this.rangesSignal[1]([...this.ranges(), range]);
    this.messageSignal[1](`${this.ranges().length} grouped range${this.ranges().length === 1 ? "" : "s"}. Hold Control to add another range. Esc cancels. Delete removes grouped text.`);
    this.paint();
    return true;
  }

  captureCurrent(snapshot: TextSelectionSnapshot): boolean {
    if (!this.live) return false;
    const nonempty = snapshot.ranges;
    this.ports.ranges.validate(nonempty, "cell");
    if (!nonempty.length) return false;
    if (!this.active()) this.begin(this.ports.queries.documentScope(nonempty[0].nodeKey));
    let captured = false;
    for (const range of nonempty) captured = this.add(range.nodeKey, range.start, range.end) || captured;
    if (captured) this.ports.selection.finish(snapshot);
    return captured;
  }

  /** Delete only manual grouping membership, never Find/entity session decorations. */
  deleteSelected(nodeKey: NodeKey): boolean {
    if (!this.live) return false;
    if (this.active() && !this.ports.queries.contains(this.scopeKey, nodeKey)) return false;
    const ranges = this.active() ? this.ranges() : this.ports.visibility.ranges(nodeKey);
    if (!ranges.length) return false;
    try { this.ports.ranges.validate(ranges, "cell"); }
    catch {
      this.cancel("Grouping cancelled because a text range changed. Select the ranges again."); return true;
    }
    this.applying = true;
    try {
      const caret = this.ports.edits.delete(ranges, "Delete grouped text");
      this.cancel("Grouped text deleted.");
      this.ports.selection.restoreCaret(caret);
      return true;
    } finally { this.applying = false; }
  }

  removeAt(nodeKey: NodeKey, index: number): boolean {
    if (!this.live) return false;
    const ranges = this.ranges();
    // When ranges overlap, remove the most recently added matching range.
    const range = [...ranges].reverse().find(range => range.nodeKey === nodeKey && range.start <= index && index < range.end);
    if (!range) return this.ports.visibility.removeAt(nodeKey, index);
    this.rangesSignal[1](ranges.filter(candidate => candidate !== range));
    if (!this.ranges().length) { this.finish("Grouping cleared."); return true; }
    this.messageSignal[1](`${this.ranges().length} grouped ranges. Control-click a range to remove it. Escape cancels.`);
    this.paint();
    return true;
  }

  apply(type: string, value?: string, attributes: Readonly<Record<string, number | string>> = {}): number {
    if (!this.live || !this.active() || !this.ranges().length) throw new Error("Select at least one text range for this group.");
    if (type === "codex/entity-reference") throw new Error("Entity Reference does not consume a manual group. Choose an ordinary annotation.");
    this.applying = true;
    try {
      const count = this.ports.annotations.apply(this.ranges(), type, value, attributes).added;
      this.finish(count ? `Applied ${type} to ${count} grouped ranges.` : "Those grouped ranges already have this annotation.");
      return count;
    } finally { this.applying = false; }
  }

  cancel(message = "Grouping cancelled."): void {
    if (!this.live) return;
    this.ports.selection.cancelGesture();
    this.finish(message);
    this.ports.visibility.clear();
  }

  private finish(message = ""): void {
    this.ports.decorations.clear();
    this.rangesSignal[1]([]);
    this.activeSignal[1](false);
    this.scopeKey = undefined;
    this.viewId = undefined;
    this.messageSignal[1](message);
  }

  private paint(): void {
    this.ports.decorations.set(this.ranges(), {
      type: "editor/group-selection",
      fill: "#8bd7c4",
      priority: 30,
    });
  }

  dispose(): void {
    if (!this.live) return;
    this.cancel("");
    this.live = false;
  }
}
