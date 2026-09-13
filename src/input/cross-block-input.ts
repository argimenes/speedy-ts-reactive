import type { ReactiveEditor } from "../reactive-editor/editor";
import type { ViewPosition } from "../block-tree/types";
import { graphemeBoundaries } from "./graphemes";
import { createEffect, createRoot } from "solid-js";

/** Model-owned selection across separate contenteditables. Installed before InputGateway. */
export class CrossBlockInput {
  private drag?: ViewPosition;
  private pointer?: { x: number; y: number };
  private frame = 0;
  private preferredX?: number;
  private capture?: { element: Element; pointerId: number };
  private observer: MutationObserver;
  private listeners: Array<[string, EventListener]> = [];
  private input?: HTMLTextAreaElement;
  private composing = false;
  private disposeEffect: () => void;
  constructor(private editor: ReactiveEditor, private document: Document) {
    const listen = (name: string, fn: (event: any) => void) => { document.addEventListener(name, fn, true); this.listeners.push([name, fn]); };
    listen("pointerdown", this.down); listen("pointermove", this.move); listen("pointerup", this.up); listen("pointercancel", this.cancel);
    listen("keydown", this.key); listen("selectionchange", event => { if (editor.crossText.range()) event.stopImmediatePropagation(); });
    for (const name of ["beforeinput", "input", "compositionstart", "compositionupdate", "compositionend", "copy", "cut", "paste", "contextmenu", "click", "drop", "dragstart"]) listen(name, this.guard);
    listen("focusin", event => {
      if (!editor.crossText.range()) return;
      const target = event.target as Element;
      if (target === this.input) return;
      if (target.closest?.('.document-style-bar, [data-cross-text-controls]')) return;
      const resolved = editor.mounts.resolveEvent(event);
      if (!resolved || !editor.crossText.segments[resolved.nodeKey]) editor.crossText.clear();
    });
    this.observer = new MutationObserver(() => { if (editor.crossText.range()) editor.crossText.validate(); });
    this.observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "aria-hidden"] });
    this.disposeEffect = createRoot(dispose => {
      createEffect(() => { if (!editor.crossText.range()) this.removeInput(); });
      return dispose;
    });
  }
  private removeInput() { this.input?.remove(); this.input = undefined; this.composing = false; }
  private prepareInput() {
    if (!this.editor.crossText.range()) return;
    if (!this.input) {
      this.input = this.document.createElement("textarea");
      this.input.setAttribute("aria-label", "Selected text across Blocks");
      this.input.dataset.crossTextInput = "true";
      this.input.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
      this.document.body.appendChild(this.input);
    }
    this.input.value = this.editor.crossText.selectedText();
    this.input.focus({ preventScroll: true }); this.input.setSelectionRange(0, this.input.value.length);
  }
  private replace(text: string) {
    try { this.editor.crossText.replace(text); }
    catch (error) { this.editor.crossText.notice(error instanceof Error ? error.message : String(error)); this.prepareInput(); }
  }
  private stop(event: Event) { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation(); }
  private point(node: Node | null, offset: number): ViewPosition | undefined {
    const element = node instanceof Element ? node : node?.parentElement;
    const resolved = this.editor.mounts.resolveElement(element ?? null);
    if (!resolved || !node) return;
    const index = resolved.handle.inlinePoint?.(node, offset);
    return index === undefined ? undefined : this.editor.crossText.position(resolved.nodeKey, index);
  }
  private at(x: number, y: number): ViewPosition | undefined {
    const doc = this.document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null; caretRangeFromPoint?(x: number, y: number): Range | null };
    const hit = this.editor.mounts.resolveElement(doc.elementFromPoint?.(x, y) ?? null);
    if (!hit?.handle.inlinePoint) return;
    const matchesHit = (point: ViewPosition | undefined) => point?.occurrenceKey === hit.nodeKey ? point : undefined;
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position) { const point = matchesHit(this.point(position.offsetNode, position.offset)); if (point) return point; }
    const range = doc.caretRangeFromPoint?.(x, y);
    if (range) { const point = matchesHit(this.point(range.startContainer, range.startOffset)); if (point) return point; }
    const index = hit.handle.inlinePointAt?.(x, y);
    return index === undefined ? undefined : this.editor.crossText.position(hit.nodeKey, index);
  }
  private native() {
    const selection = this.document.getSelection(); if (!selection) return;
    const anchor = this.point(selection.anchorNode, selection.anchorOffset), head = this.point(selection.focusNode, selection.focusOffset);
    return anchor && head ? { anchor, head } : undefined;
  }
  private select(anchor: ViewPosition, head: ViewPosition) {
    try {
      if (anchor.occurrenceKey === head.occurrenceKey) {
        this.editor.crossText.clear();
        const node = this.editor.node(anchor.occurrenceKey)!;
        const mount = this.editor.mounts.get(node.key);
        mount?.focus(); mount?.restoreInlineSelection?.({ anchor: anchor.boundary.index, head: head.boundary.index });
        this.editor.selections.setPrimary(node.key, node.contentKey, node.viewId, anchor.boundary.index, head.boundary.index);
        return;
      }
      this.editor.crossText.set(anchor, head);
      this.document.getSelection()?.removeAllRanges();
      this.prepareInput();
    } catch (error) { this.editor.crossText.notice(error instanceof Error ? error.message : String(error)); }
  }
  private down = (event: PointerEvent) => {
    if (!this.editor.crossText.enabled() || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : undefined;
    if (target?.closest('.document-style-bar, [data-cross-text-controls]')) return;
    const prior = this.editor.crossText.range();
    const resolved = this.editor.mounts.resolveEvent(event);
    if (!resolved || !resolved.handle.inlinePoint || target?.closest('[data-block-selection-handle]')) { this.editor.crossText.clear(); return; }
    // Restore editability before hit-testing a new ordinary caret.
    if (prior && !event.shiftKey) this.editor.crossText.clear();
    const point = this.at(event.clientX, event.clientY); if (!point) return;
    this.preferredX = undefined;
    // Own the gesture from its first event. Waiting until the pointer leaves
    // an editing host allows browser text selection/dragging to cancel or clamp
    // the gesture before a cross-Block endpoint can ever be observed.
    this.stop(event);
    const capturePointer = () => {
      const capture = resolved.handle.root;
      if (typeof event.pointerId === "number" && capture.setPointerCapture) {
        capture.setPointerCapture(event.pointerId);
        this.capture = { element: capture, pointerId: event.pointerId };
      }
    };
    if (event.shiftKey) {
      const anchor = prior?.anchor ?? this.native()?.anchor;
      if (anchor) { this.stop(event); this.select(anchor, point); this.drag = anchor; capturePointer(); return; }
    }
    this.editor.selections.clearExcept(point.occurrenceKey);
    this.editor.blockSelection.clear();
    this.select(point, point);
    this.drag = point;
    this.editor.crossText.siblings(point.occurrenceKey); // Cache the stream once per gesture.
    capturePointer();
  };
  private move = (event: PointerEvent) => {
    if (!this.drag || !(event.buttons & 1)) return;
    this.pointer = { x: event.clientX, y: event.clientY };
    const head = this.at(event.clientX, event.clientY);
    if (head) {
      this.stop(event); this.select(this.drag, head);
      if (!this.frame) this.frame = requestAnimationFrame(this.scroll);
    }
  };
  private scroll = () => {
    this.frame = 0;
    if (!this.drag || !this.pointer || !this.editor.crossText.range()) return;
    let root = this.editor.mounts.get(this.drag.occurrenceKey)?.root.parentElement;
    while (root && !(root.scrollHeight > root.clientHeight && /auto|scroll/.test(getComputedStyle(root).overflowY))) root = root.parentElement;
    if (!root) return;
    const rect = root.getBoundingClientRect(), y = this.pointer.y;
    const delta = y < rect.top + 32 ? -16 : y > rect.bottom - 32 ? 16 : 0;
    if (!delta) return;
    const previousScroll = root.scrollTop;
    root.scrollTop += delta;
    if (root.scrollTop === previousScroll) return;
    const head = this.at(this.pointer.x, Math.max(rect.top + 2, Math.min(rect.bottom - 2, y)));
    if (head) this.select(this.drag, head);
    this.frame = requestAnimationFrame(this.scroll);
  };
  private up = () => {
    const capture = this.capture; this.capture = undefined;
    if (capture?.element.hasPointerCapture?.(capture.pointerId)) capture.element.releasePointerCapture(capture.pointerId);
    this.drag = undefined; this.pointer = undefined; if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0;
  };
  private cancel = () => { this.up(); this.editor.crossText.clear(); };
  private collapse(point: ViewPosition) {
    this.editor.crossText.clear(); this.up();
    const mount = this.editor.mounts.get(point.occurrenceKey);
    mount?.focus(); mount?.restoreInlineSelection?.({ anchor: point.boundary.index, head: point.boundary.index });
    const node = this.editor.node(point.occurrenceKey);
    if (node) this.editor.selections.setPrimary(node.key, node.contentKey, node.viewId, point.boundary.index);
  }
  private rect(point: ViewPosition) {
    const mount = this.editor.mounts.get(point.occurrenceKey), dom = mount?.inlineBoundary?.(point.boundary.index);
    if (!dom) return;
    const range = this.document.createRange(); range.setStart(dom.node, dom.offset); range.collapse(true);
    return range.getClientRects()[0] ?? mount!.focusElement.getBoundingClientRect();
  }
  private extend(direction: string) {
    const range = this.editor.crossText.range() ?? this.native(); if (!range) return false;
    const { anchor, head } = range, node = this.editor.node(head.occurrenceKey)!;
    const backwards = direction === "Left" || direction === "Up";
    let next: ViewPosition | undefined;
    if (direction === "Left" || direction === "Right") {
      this.preferredX = undefined;
      const text = node.inlineContent.map(key => String(this.editor.node(key)?.payload.text ?? "\uFFFC")).join("");
      const boundaries = graphemeBoundaries(text), index = backwards ? boundaries.filter(i => i < head.boundary.index).at(-1) : boundaries.find(i => i > head.boundary.index);
      if (index !== undefined) next = this.editor.crossText.position(node.key, index);
    } else {
      const rect = this.rect(head);
      if (rect) {
        this.preferredX ??= rect.left;
        next = this.at(this.preferredX, backwards ? rect.top - rect.height / 2 : rect.bottom + rect.height / 2);
        // Hit testing in paragraph padding can return another boundary on the
        // same visual line. That is not an Up/Down move: use the sibling line.
        if (next?.occurrenceKey === head.occurrenceKey) {
          const nextRect = this.rect(next);
          if (next.boundary.index === head.boundary.index || (nextRect && Math.abs(nextRect.top - rect.top) < 2)) next = undefined;
        }
      }
    }
    if (!next) {
      const siblings = this.editor.crossText.siblings(node.key), key = siblings[siblings.indexOf(node.key) + (backwards ? -1 : 1)], sibling = key ? this.editor.node(key) : undefined;
      if (sibling?.viewType === "standoff-editor-block") {
        next = this.editor.crossText.position(sibling.key, backwards ? sibling.inlineContent.length : 0);
        if (this.preferredX !== undefined) {
          const rect = this.editor.mounts.get(sibling.key)?.focusElement.getBoundingClientRect();
          if (rect) { const hit = this.at(this.preferredX, backwards ? rect.bottom - 2 : rect.top + 2); if (hit?.occurrenceKey === sibling.key) next = hit; }
        }
      }
    }
    if (!next) return !!this.editor.crossText.range();
    // Own the complete horizontal Shift-arrow gesture, not only its final step
    // across a host boundary. Native extension can clamp before reporting that
    // boundary (particularly during key repeat). Ordinary caret editing remains
    // native; the DOM selection still represents the local part of this gesture.
    if (!this.editor.crossText.range() && next.occurrenceKey === anchor.occurrenceKey && direction !== "Left" && direction !== "Right") return false;
    this.select(anchor, next);
    this.editor.mounts.get(next.occurrenceKey)?.root.scrollIntoView?.({ block: "nearest" });
    return true;
  }
  private key = (event: KeyboardEvent) => {
    if (!this.editor.crossText.enabled()) return;
    const target = event.target instanceof Element ? event.target : undefined;
    if (target !== this.input && target?.closest('input, textarea, select, .document-style-bar, [data-block-selection-handle], [data-block-selection-inspector]')) return;
    const resolved = target === this.input && this.editor.crossText.range() ? { nodeKey: this.editor.crossText.range()!.anchor.occurrenceKey, handle: this.editor.mounts.get(this.editor.crossText.range()!.anchor.occurrenceKey)! } : this.editor.mounts.resolveEvent(event);
    if (!resolved || resolved.handle.inputPolicy !== "standoff") return;
    const active = this.editor.crossText.range();
    if (active && (this.composing || event.isComposing)) return;
    if (this.editor.bindings.dispatch(event, ["cross-text"], id => {
      if (id.startsWith("cross.extend")) return this.extend(id.slice("cross.extend".length));
      if (!active) return false;
      if (id === "cross.cancel") { this.collapse(active.head); return true; }
      if (id === "cross.undo" || id === "cross.redo") {
        this.collapse(active.head);
        if (id === "cross.undo") this.editor.repository.undo(); else this.editor.repository.redo();
        return true;
      }
      if (id.startsWith("cross.style.")) return this.editor.crossText.annotate(id.slice("cross.style.".length));
      return false;
    })) return;
    if (!active) return;
    if ((event.ctrlKey || event.metaKey) && ["c", "x", "v"].includes(event.key.toLowerCase())) {
      // The focused textarea supplies real browser clipboard events. Do not
      // prevent this keydown: guard() handles the subsequent clipboard event.
      if (target !== this.input) this.prepareInput();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete" || event.key === "Enter") {
      this.stop(event); this.replace(event.key === "Enter" ? "\n" : ""); return;
    }
    if (!event.ctrlKey && !event.metaKey && ([...event.key].length === 1 || ["Dead", "Process", "Unidentified"].includes(event.key))) {
      if (target !== this.input) this.prepareInput();
      return; // beforeinput/composition commits the actual text, not KeyboardEvent.key.
    }
    if (!event.shiftKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      this.stop(event);
      const segments = this.editor.crossText.resolve(active.anchor, active.head), first = segments[0], last = segments.at(-1)!;
      this.collapse(event.key === "ArrowLeft" || event.key === "ArrowUp" ? this.editor.crossText.position(first.nodeKey, first.start) : this.editor.crossText.position(last.nodeKey, last.end)); return;
    }
    if (event.key !== "Tab" && !["Shift", "Control", "Meta", "Alt"].includes(event.key)) {
      this.stop(event);
      this.editor.crossText.notice();
    }
  };
  private guard = (event: Event) => {
    if (event.type === "dragstart" && this.drag) { this.stop(event); return; }
    if (!this.editor.crossText.range()) return;
    const target = event.target instanceof Element ? event.target : undefined;
    if (target !== this.input && target?.closest('input, textarea, select, .document-style-bar, [data-block-selection-handle], [data-block-selection-inspector]')) return;
    const resolved = this.editor.mounts.resolveEvent(event);
    if (target !== this.input && (!resolved || !this.editor.crossText.segments[resolved.nodeKey])) return;
    if (event.type === "copy" || event.type === "cut") {
      this.stop(event);
      const data = (event as ClipboardEvent).clipboardData;
      if (!data) { this.editor.crossText.notice("The browser did not provide clipboard access; no text was removed."); return; }
      try { data.setData("text/plain", this.editor.crossText.selectedText()); if (event.type === "cut") this.replace(""); }
      catch { this.editor.crossText.notice("Could not write to the clipboard; no text was removed."); }
      return;
    }
    if (event.type === "paste") {
      this.stop(event);
      const data = (event as ClipboardEvent).clipboardData;
      if (!data?.types.includes("text/plain") || !data.getData("text/plain")) { this.editor.crossText.notice("Paste plain text; an empty or non-text clipboard does not replace the selection."); return; }
      this.replace(data.getData("text/plain")); return;
    }
    if (event.type === "compositionstart" && target === this.input) { this.composing = true; event.stopImmediatePropagation(); return; }
    if (event.type === "compositionend" && target === this.input) {
      event.stopImmediatePropagation(); this.composing = false;
      const text = (event as CompositionEvent).data;
      if (text) this.replace(text); else this.prepareInput(); return;
    }
    if (event.type === "beforeinput") {
      const input = event as InputEvent;
      if (target === this.input && (this.composing || input.isComposing || input.inputType === "insertCompositionText")) { event.stopImmediatePropagation(); return; }
      this.stop(event);
      if (["insertText", "insertReplacementText", "insertFromComposition"].includes(input.inputType) && input.data !== null) this.replace(input.data);
      else if (["insertParagraph", "insertLineBreak"].includes(input.inputType)) this.replace("\n");
      else if (input.inputType?.startsWith("delete")) this.replace("");
      return;
    }
    if (target === this.input && ["input", "compositionupdate"].includes(event.type)) { event.stopImmediatePropagation(); return; }
    this.stop(event); this.editor.crossText.notice();
  };
  dispose() { this.up(); this.removeInput(); this.disposeEffect(); this.observer.disconnect(); for (const [name, fn] of this.listeners) this.document.removeEventListener(name, fn, true); this.editor.crossText.clear(); }
}
