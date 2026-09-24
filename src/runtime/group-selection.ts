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
  private pointerSelection = false;
  pointerSelecting(): boolean { return this.pointerSelection; }
  private keyboardSelection = false;
  keyboardSelecting(): boolean { return this.keyboardSelection; }
  private readonly unsubscribe: () => void;

  constructor(private editor: ReactiveEditor) {
    this.unsubscribe = editor.repository.subscribeBeforeChanges(() => {
      if (this.active() && !this.applying) this.cancel("Grouping cancelled because the document changed.");
    });
  }

  begin(scopeKey?: NodeKey): void {
    this.editor.crossText.clear();
    this.editor.showHide.clearSelections();
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
    this.messageSignal[1](`${this.ranges().length} grouped range${this.ranges().length === 1 ? "" : "s"}. Hold Control to add another range. Esc cancels. Delete removes grouped text.`);
    this.paint();
    return true;
  }

  captureCurrent(): boolean {
    // Snapshot before begin() clears the live cross-Block selection.
    const cross = this.editor.crossText.range();
    const selection = document.getSelection();
    const element = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const resolved = this.editor.mounts.resolveElement(element ?? null);
    const local = resolved?.handle.inputPolicy === "standoff" ? resolved.handle.captureInlineSelection?.() : undefined;
    const segments = cross ? this.editor.crossText.resolve(cross.anchor, cross.head) :
      resolved && local ? [{ nodeKey: resolved.nodeKey, start: Math.min(local.anchor, local.head), end: Math.max(local.anchor, local.head) }] : [];
    const nonempty = segments.filter(range => range.end > range.start);
    if (!nonempty.length) return false;
    if (!this.active()) this.begin(nearestDocumentScope(this.editor, nonempty[0].nodeKey));
    let captured = false;
    for (const range of nonempty) captured = this.add(range.nodeKey, range.start, range.end) || captured;
    if (captured) {
      this.editor.crossText.clear();
      selection?.removeAllRanges();
      for (const range of nonempty) this.editor.selections.removeOccurrence(range.nodeKey);
      // Keep a collapsed caret at the gesture's head for the next keyboard range.
      const headKey = cross?.head.occurrenceKey ?? resolved!.nodeKey;
      const head = cross?.head.boundary.index ?? local!.head;
      const node = this.editor.node(headKey)!;
      const mount = this.editor.mounts.get(headKey);
      mount?.focus(); mount?.restoreInlineSelection?.({ anchor: head, head });
      this.editor.selections.setPrimary(headKey, node.contentKey, node.viewId, head);
    }
    return captured;
  }

  /** Delete only manual grouping membership, never Find/entity session decorations. */
  deleteSelected(nodeKey: NodeKey): boolean {
    if (this.active() && !contains(this.editor, this.scopeKey, nodeKey)) return false;
    const ranges = this.active() ? this.ranges() : this.editor.showHide.selectedRanges(nodeKey);
    if (!ranges.length) return false;
    const byContent = new Map<string, SearchRange[]>();
    for (const range of ranges) {
      const node = this.editor.node(range.nodeKey), content = this.editor.repository.readState().contents[range.contentKey];
      if (!node || node.contentKey !== range.contentKey || node.placementKey !== range.placementKey ||
        content?.inlineRevision !== range.version || !Number.isInteger(range.start) || !Number.isInteger(range.end) ||
        range.start < 0 || range.end <= range.start || range.end > node.inlineContent.length) {
        this.cancel("Grouping cancelled because a text range changed. Select the ranges again.");
        return true;
      }
      const list = byContent.get(range.contentKey) ?? [];
      list.push({ ...range }); byContent.set(range.contentKey, list);
    }
    const merged: SearchRange[] = [];
    for (const list of byContent.values()) {
      const compact: SearchRange[] = [];
      for (const range of list.sort((a, b) => a.start - b.start)) {
        const previous = compact.at(-1);
        if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
        else compact.push(range);
      }
      merged.push(...compact);
    }
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
    if (!range) return this.editor.showHide.removeAt(nodeKey, index);
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
    let mouse: { nodeKey: NodeKey; index?: number; x: number; y: number; moved: boolean; eligible: boolean } | undefined;
    let keyboard: { eligible: boolean } | undefined;
    let suppressClick = false, heldDelete: string | undefined;
    const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const excluded = (event: Event) => event.target instanceof Element && !!event.target.closest(
      'input, textarea:not([data-cross-text-input]), select, [role="dialog"]:not(.compact-toolbar__panel), [role="menu"], [data-bindings-window], [data-block-selection-handle], [data-block-selection-inspector]');
    const textTarget = (event: Event) => {
      if (excluded(event)) return;
      if (event.target instanceof Element && event.target.matches('[data-cross-text-input]')) return this.editor.crossText.range()?.head.occurrenceKey;
      const resolved = this.editor.mounts.resolveEvent(event);
      return resolved?.handle.inputPolicy === "standoff" && !resolved.handle.composing ? resolved.nodeKey : undefined;
    };
    const reset = () => { mouse = undefined; keyboard = undefined; this.pointerSelection = false; this.keyboardSelection = false; heldDelete = undefined; suppressClick = false; };
    const pointerdown = (event: PointerEvent) => {
      reset();
      const nodeKey = textTarget(event);
      if (!nodeKey || !event.ctrlKey || event.button !== 0) return;
      const cell = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-inline-index]") : null;
      mouse = { nodeKey, index: cell ? Number(cell.dataset.inlineIndex) : undefined, x: event.clientX, y: event.clientY, moved: false, eligible: true };
      this.pointerSelection = true;
      suppressClick = true;
      // CrossBlockInput owns selection geometry; allow it to see this event.
    };
    const pointermove = (event: PointerEvent) => {
      if (!mouse) return;
      if (!event.ctrlKey) mouse.eligible = false;
      if (Math.hypot(event.clientX - mouse.x, event.clientY - mouse.y) > 3) mouse.moved = true;
    };
    const pointerup = (event: PointerEvent) => {
      const gesture = mouse;
      mouse = undefined; this.pointerSelection = false;
      if (!gesture || !gesture.eligible || !event.ctrlKey) return;
      // Let cross-Block input release pointer capture before collecting its range.
      queueMicrotask(() => {
        if (!gesture.moved && gesture.index !== undefined && this.removeAt(gesture.nodeKey, gesture.index)) {
          document.getSelection()?.removeAllRanges();
          this.editor.selections.removeOccurrence(gesture.nodeKey);
          this.editor.crossText.clear();
        } else this.captureCurrent();
      });
    };
    const suppressMenu = (event: MouseEvent) => {
      if (suppressClick && event.ctrlKey) stop(event);
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.key === heldDelete) heldDelete = undefined;
      if (event.key === "Control" && mouse) mouse.eligible = false;
      if (event.key !== "Control" && event.key !== "Shift") return;
      const gesture = keyboard; keyboard = undefined; this.keyboardSelection = false;
      if (gesture?.eligible && !excluded(event)) this.captureCurrent();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || excluded(event)) return;
      const nodeKey = textTarget(event);
      if (event.key === "Escape") {
        reset();
        if (this.active() || this.editor.showHide.selectionActive()) { stop(event); this.cancel(); }
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && (nodeKey || (event.target instanceof Element && event.target.closest('.document-style-bar')))) {
        if (event.key === heldDelete && event.repeat) { stop(event); return; }
        const target = nodeKey ?? this.editor.focus.state.focusedKey ?? this.editor.focus.state.lastFocusedKey;
        if (keyboard?.eligible) { keyboard = undefined; this.keyboardSelection = false; this.captureCurrent(); }
        if (target && (this.active() || this.editor.showHide.selectionActive(target))) {
          try {
            if (this.deleteSelected(target)) { stop(event); heldDelete = event.key; }
          } catch (error) {
            stop(event);
            this.messageSignal[1](error instanceof Error ? error.message : String(error));
          }
        }
        return;
      }
      if (nodeKey && event.shiftKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
        keyboard ??= { eligible: event.ctrlKey && !event.metaKey && !event.altKey };
        keyboard.eligible &&= event.ctrlKey;
        this.keyboardSelection = keyboard.eligible;
      }
    };
    const focusin = (event: Event) => {
      if (!textTarget(event)) { mouse = undefined; keyboard = undefined; this.pointerSelection = false; this.keyboardSelection = false; }
    };
    const listeners: [string, EventListener][] = [
      ["pointerdown", pointerdown as EventListener], ["pointermove", pointermove as EventListener], ["pointerup", pointerup as EventListener],
      ["pointercancel", reset], ["click", suppressMenu as EventListener], ["contextmenu", suppressMenu as EventListener],
      ["keyup", keyup as EventListener], ["keydown", keydown as EventListener], ["focusin", focusin],
    ];
    for (const [name, listener] of listeners) document.addEventListener(name, listener, true);
    document.defaultView?.addEventListener("blur", reset);
    const dispose = () => {
      reset();
      for (const [name, listener] of listeners) document.removeEventListener(name, listener, true);
      document.defaultView?.removeEventListener("blur", reset);
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
