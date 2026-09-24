import { createSignal } from "solid-js";
import { unwrap } from "solid-js/store";
import type { NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { SearchRange } from "./text-search";

export const GROUP_SELECTION_OWNER = "manual-group-selection";

function exactRangeKey(range: Pick<SearchRange, "contentKey" | "start" | "end">): string {
  return `${range.contentKey}:${range.start}:${range.end}`;
}

function contains(editor: ReactiveEditor, scopeKey: NodeKey | undefined, targetKey: NodeKey): boolean {
  if (!scopeKey) return true;
  const visit = (key: NodeKey, seen = new Set<NodeKey>()): boolean => {
    if (key === targetKey) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    const node = editor.node(key);
    return !!node && [...node.children, ...Object.values(node.ownedRelations)].some(child => visit(child, seen));
  };
  return visit(scopeKey);
}

function nearestDocumentScope(editor: ReactiveEditor, nodeKey: NodeKey): NodeKey | undefined {
  const node = editor.node(nodeKey), projection = node && editor.projections.get(node.viewId);
  if (!node || !projection) return;
  const parents = new Map<NodeKey, NodeKey>();
  for (const candidate of Object.values(projection.state.nodes)) {
    for (const child of [...candidate.children, ...Object.values(candidate.ownedRelations)]) parents.set(child, candidate.key);
  }
  let cursor: NodeKey | undefined = nodeKey, documentKey: NodeKey | undefined;
  while (cursor) {
    const candidate = projection.state.nodes[cursor];
    if (candidate?.viewType === "document-block") documentKey = cursor;
    if (candidate?.viewType === "document-window-block") return cursor;
    cursor = parents.get(cursor);
  }
  return documentKey;
}

/** Apply ordinary, independent standoff annotations in one undoable transaction. */
export function applyAnnotationsToRanges(
  editor: ReactiveEditor,
  ranges: readonly SearchRange[],
  type: string,
  value?: string,
  attributes: Readonly<Record<string, number | string>> = {},
): number {
  const state = editor.repository.readState();
  const updates = new Map<string, { key: NodeKey; properties: Record<string, unknown>[] }>();
  const seen = new Set<string>();
  const showHideTargets: { nodeKey: NodeKey; id: string | number }[] = [];
  let added = 0;
  for (const range of ranges) {
    const node = editor.node(range.nodeKey), content = state.contents[range.contentKey];
    if (!node || node.viewType !== "standoff-editor-block" || node.contentKey !== range.contentKey ||
      node.placementKey !== range.placementKey || range.coordinate !== "cell" ||
      !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 ||
      range.end <= range.start || range.end > node.inlineContent.length || content?.inlineRevision !== range.version) {
      throw new Error("A grouped text range is stale or invalid. Select the ranges again.");
    }
    const token = exactRangeKey(range);
    if (seen.has(token)) continue;
    seen.add(token);
    let update = updates.get(range.contentKey);
    if (!update) {
      update = { key: node.key, properties: [...(unwrap(node.payload.standoffProperties as Record<string, unknown>[] | undefined) ?? [])] };
      updates.set(range.contentKey, update);
    }
    const end = range.end - 1;
    const existingIndex = update.properties.findIndex(property => !property.isDeleted && property.type === type && property.start === range.start && property.end === end && property.value === value);
    const property = existingIndex >= 0 ? update.properties[existingIndex] : { id: crypto.randomUUID(), type, start: range.start, end, ...attributes, ...(value === undefined ? {} : { value }) };
    if (existingIndex < 0) { update.properties.push(property); added++; }
    if (type === "style/show-hide") showHideTargets.push({ nodeKey: node.key, id: typeof property.id === "string" ? property.id : existingIndex });
  }
  if (added) editor.commands.transaction("Annotate grouped selection", () => {
    for (const update of updates.values()) editor.commands.setPayloadField(update.key, "standoffProperties", update.properties);
  });
  if (showHideTargets.length) editor.showHide.retainSelection(showHideTargets);
  return added;
}

/** A short-lived manual range collection rendered by the existing session decoration layer. */
export class GroupSelection {
  readonly owner = GROUP_SELECTION_OWNER;
  private readonly activeSignal = createSignal(false);
  readonly active = this.activeSignal[0];
  private readonly rangesSignal = createSignal<readonly SearchRange[]>([]);
  readonly ranges = this.rangesSignal[0];
  private readonly messageSignal = createSignal("");
  readonly message = this.messageSignal[0];
  private scopeKey?: NodeKey;
  private viewId?: string;
  private applying = false;
  private disposeInput?: () => void;
  private readonly unsubscribe: () => void;

  constructor(private editor: ReactiveEditor) {
    this.unsubscribe = editor.repository.subscribeBeforeChanges(() => {
      if (this.active() && !this.applying) this.cancel("Grouping cancelled because the document changed.");
    });
  }

  begin(scopeKey?: NodeKey): void {
    this.editor.crossText.clear();
    this.scopeKey = scopeKey;
    this.viewId = scopeKey ? this.editor.node(scopeKey)?.viewId : undefined;
    this.rangesSignal[1]([]);
    this.activeSignal[1](true);
    this.messageSignal[1]("Grouping: select text ranges, then choose an annotation. Control-click a range to remove it. Escape cancels.");
    this.paint();
  }

  toggleAt(nodeKey: NodeKey): void {
    if (this.active()) { this.cancel(); return; }
    this.begin(nearestDocumentScope(this.editor, nodeKey));
    this.captureCurrent();
  }

  add(nodeKey: NodeKey, start: number, end: number): boolean {
    if (!this.active()) return false;
    const node = this.editor.node(nodeKey), content = node && this.editor.repository.readState().contents[node.contentKey];
    const first = Math.min(start, end), last = Math.max(start, end);
    if (!node || node.viewType !== "standoff-editor-block" || !content || !contains(this.editor, this.scopeKey, nodeKey) ||
      (this.viewId && node.viewId !== this.viewId) || first < 0 || last <= first || last > node.inlineContent.length) return false;
    this.viewId ??= node.viewId;
    const range: SearchRange = {
      nodeKey: node.key,
      contentKey: node.contentKey,
      placementKey: node.placementKey,
      version: content.inlineRevision,
      start: first,
      end: last,
      coordinate: "cell",
    };
    if (this.ranges().some(existing => exactRangeKey(existing) === exactRangeKey(range))) return false;
    this.rangesSignal[1]([...this.ranges(), range]);
    this.messageSignal[1](`${this.ranges().length} grouped range${this.ranges().length === 1 ? "" : "s"}. Select another range or choose an annotation.`);
    this.paint();
    return true;
  }

  captureCurrent(): boolean {
    if (!this.active()) return false;
    const cross = this.editor.crossText.range();
    if (cross) {
      const segments = this.editor.crossText.resolve(cross.anchor, cross.head);
      let captured = false;
      for (const segment of segments) captured = this.add(segment.nodeKey, segment.start, segment.end) || captured;
      if (captured) this.editor.crossText.clear();
      return captured;
    }
    const selection = document.getSelection();
    const element = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const resolved = this.editor.mounts.resolveElement(element ?? null);
    if (!resolved || resolved.handle.inputPolicy !== "standoff") return false;
    const range = resolved.handle.captureInlineSelection?.();
    if (!range || !this.add(resolved.nodeKey, range.anchor, range.head)) return false;
    selection?.removeAllRanges();
    this.editor.selections.removeOccurrence(resolved.nodeKey);
    return true;
  }

  removeAt(nodeKey: NodeKey, index: number): boolean {
    const ranges = this.ranges();
    // When ranges overlap, remove the most recently added matching range.
    const range = [...ranges].reverse().find(range => range.nodeKey === nodeKey && range.start <= index && index < range.end);
    if (!range) return this.editor.showHide.removeAt(nodeKey, index);
    this.rangesSignal[1](ranges.filter(candidate => candidate !== range));
    this.messageSignal[1](`${this.ranges().length} grouped ranges. Control-click a range to remove it. Escape cancels.`);
    this.paint();
    return true;
  }

  apply(type: string, value?: string, attributes: Readonly<Record<string, number | string>> = {}): number {
    if (!this.active() || !this.ranges().length) throw new Error("Select at least one text range for this group.");
    this.applying = true;
    try {
      const count = applyAnnotationsToRanges(this.editor, this.ranges(), type, value, attributes);
      this.finish();
      return count;
    } finally { this.applying = false; }
  }

  cancel(message = "Grouping cancelled."): void {
    this.finish(message);
    this.editor.showHide.clearSelections();
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

  install(document: Document): () => void {
    this.disposeInput?.();
    let removing = false;
    const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const pointerdown = (event: PointerEvent) => {
      removing = false;
      if (!event.ctrlKey || event.button !== 0) return;
      const resolved = this.editor.mounts.resolveEvent(event);
      const cell = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-inline-index]") : null;
      if (!cell || resolved?.handle.inputPolicy !== "standoff") return;
      const index = Number(cell.dataset.inlineIndex);
      if (!Number.isInteger(index) || !this.removeAt(resolved.nodeKey, index)) return;
      removing = true;
      document.getSelection()?.removeAllRanges();
      this.editor.selections.removeOccurrence(resolved.nodeKey);
      // Own this gesture before cross-Block selection or the Control-click menu.
      stop(event);
    };
    const suppressRemovalGesture = (event: MouseEvent) => { if (removing && event.ctrlKey) stop(event); };
    const capture = (event?: PointerEvent) => queueMicrotask(() => {
      if (!this.active() && event?.ctrlKey) {
        const resolved = this.editor.mounts.resolveEvent(event);
        if (resolved?.handle.inputPolicy === "standoff") this.begin(nearestDocumentScope(this.editor, resolved.nodeKey));
      }
      this.captureCurrent();
    });
    const pointerup = (event: PointerEvent) => {
      if (removing) { stop(event); return; }
      if (this.active() || event.ctrlKey) capture(event);
    };
    const keyup = (event: KeyboardEvent) => { if (this.active() && event.shiftKey) capture(); };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (!this.active() && !this.editor.showHide.selectionActive())) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancel();
    };
    document.addEventListener("pointerdown", pointerdown, true);
    document.addEventListener("pointerup", pointerup, true);
    document.addEventListener("click", suppressRemovalGesture, true);
    document.addEventListener("contextmenu", suppressRemovalGesture, true);
    document.addEventListener("keyup", keyup, true);
    document.addEventListener("keydown", keydown, true);
    const dispose = () => {
      document.removeEventListener("pointerdown", pointerdown, true);
      document.removeEventListener("pointerup", pointerup, true);
      document.removeEventListener("click", suppressRemovalGesture, true);
      document.removeEventListener("contextmenu", suppressRemovalGesture, true);
      document.removeEventListener("keyup", keyup, true);
      document.removeEventListener("keydown", keydown, true);
      if (this.disposeInput === dispose) this.disposeInput = undefined;
    };
    this.disposeInput = dispose;
    return dispose;
  }

  dispose(): void {
    this.disposeInput?.();
    this.finish();
    this.unsubscribe();
  }
}
