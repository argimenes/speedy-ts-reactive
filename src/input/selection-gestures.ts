import type { TextSelectionSnapshot } from "../runtime/selection-snapshot";
import type { NodeKey } from "../block-tree/types";
import type { CurrentTextOperations } from "../runtime/current-text-operation";

export interface SelectionGesturePolicy {
  owner: string;
  /** Stage 2 supports the existing Control-modified text-selection gesture. */
  modifier: "Control";
  complete(selection: TextSelectionSnapshot): void;
  error(error: unknown): void;
  removeAt(key: NodeKey, index: number): boolean;
}
export interface SelectionInputTarget { key?: NodeKey; excluded: boolean; composing?: boolean; toolbar?: boolean }
export interface SelectionInputPorts {
  target(event: Event): SelectionInputTarget;
  capture(): TextSelectionSnapshot | undefined;
  point(event: PointerEvent): number | undefined;
  focusedKey(): NodeKey | undefined;
  clearSelection(key: NodeKey): void;
  releasePointer(): void;
  operations: Pick<CurrentTextOperations, "active">;
}
const selectionKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/** One owned selection policy; geometry and normal editing remain with core input. */
export class SelectionGestures {
  private policy?: SelectionGesturePolicy;
  private mouse?: { policy: SelectionGesturePolicy; key: NodeKey; index?: number; x: number; y: number; pointerId: number; moved: boolean; eligible: boolean };
  private keyboard?: { policy?: SelectionGesturePolicy; eligible: boolean };
  private generation = 0;
  private suppressClick = false;
  private heldDelete?: string;
  private composing = false;
  private stopInput?: () => void;
  constructor(private readonly ports: SelectionInputPorts) {}

  register(policy: SelectionGesturePolicy): () => void {
    if (this.policy) throw new Error(`Selection gesture already belongs to ${this.policy.owner}`);
    const registered = this.policy = { ...policy };
    return () => { if (this.policy === registered) { this.reset(); this.policy = undefined; } };
  }
  owner(): string | undefined { return (this.mouse?.eligible ? this.mouse.policy.owner : undefined) ?? (this.keyboard?.eligible ? this.keyboard.policy?.owner : undefined); }
  selecting(kind: "pointer" | "keyboard"): boolean { return kind === "pointer" ? !!this.mouse?.eligible : !!this.keyboard?.eligible; }
  cancelGesture(): void {
    this.generation++;
    if (this.mouse) this.ports.releasePointer();
    this.mouse = undefined; this.keyboard = undefined;
  }
  private reset = () => { this.cancelGesture(); this.heldDelete = undefined; this.composing = false; this.suppressClick = false; };
  private consume(event: Event): void { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation(); }
  private complete(policy: SelectionGesturePolicy): "pass" | "handled" | "failed" {
    if (this.policy !== policy) return "pass";
    try {
      const selection = this.ports.capture();
      if (!selection) return "pass";
      policy.complete(selection); return "handled";
    } catch (error) { policy.error(error); return "failed"; }
  }

  install(document: Document): () => void {
    this.stopInput?.();
    const down = (event: PointerEvent) => {
      this.cancelGesture(); this.heldDelete = undefined; this.suppressClick = false;
      if (!this.policy || !event.ctrlKey || event.button !== 0 || event.metaKey || event.altKey) return;
      const target = this.ports.target(event);
      if (!target.key || target.excluded || target.composing || this.composing) return;
      this.mouse = { policy: this.policy, key: target.key, index: this.ports.point(event), x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false, eligible: true };
      this.suppressClick = true;
      // Claim policy, not the DOM event: core still performs selection geometry.
    };
    const move = (event: PointerEvent) => {
      if (!this.mouse || this.mouse.pointerId !== event.pointerId) return;
      if (!event.ctrlKey) this.mouse.eligible = false;
      if (Math.hypot(event.clientX - this.mouse.x, event.clientY - this.mouse.y) > 3) this.mouse.moved = true;
    };
    const up = (event: PointerEvent) => {
      const gesture = this.mouse;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      this.mouse = undefined;
      if (!gesture.eligible || !event.ctrlKey) return;
      const generation = this.generation;
      // Preserve core pointer-capture release before observing the final selection.
      queueMicrotask(() => {
        if (generation !== this.generation || gesture.policy !== this.policy) return;
        try {
          if (!gesture.moved && gesture.index !== undefined && gesture.policy.removeAt(gesture.key, gesture.index)) this.ports.clearSelection(gesture.key);
          else this.complete(gesture.policy);
        } catch (error) { gesture.policy.error(error); }
      });
    };
    const menu = (event: MouseEvent) => {
      if (!this.suppressClick || !event.ctrlKey) return;
      const target = this.ports.target(event);
      if (!target.excluded && (target.key || target.toolbar)) this.consume(event);
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.key === this.heldDelete) this.heldDelete = undefined;
      if (event.key === "Control" && this.mouse) this.mouse.eligible = false;
      if (event.key !== "Control" && event.key !== "Shift") return;
      const gesture = this.keyboard; this.keyboard = undefined;
      if (!gesture?.eligible || !gesture.policy) return;
      const target = this.ports.target(event);
      if (target.key && !target.excluded && !target.composing && !this.composing && !event.isComposing) this.complete(gesture.policy);
    };
    const keydown = (event: KeyboardEvent) => {
      const deletion = event.key === "Delete" || event.key === "Backspace";
      const extending = event.shiftKey && selectionKeys.has(event.key);
      // Ordinary typing neither classifies feature targets nor calls an operation.
      if (!deletion && event.key !== "Escape" && !extending) return;
      if (event.isComposing || this.composing) { this.cancelGesture(); return; }
      const target = this.ports.target(event);
      if (target.excluded || target.composing) { this.cancelGesture(); return; }
      if (event.key === "Escape") {
        this.reset();
        const operation = this.ports.operations.active();
        if (operation && (target.key || target.toolbar)) { this.consume(event); operation.cancel(); }
        return;
      }
      if (deletion && (target.key || target.toolbar)) {
        if (event.key === this.heldDelete && event.repeat) { this.consume(event); return; }
        const key = target.key ?? this.ports.focusedKey();
        const gesture = this.keyboard;
        if (gesture?.eligible && gesture.policy) {
          this.keyboard = undefined;
          if (this.complete(gesture.policy) === "failed") { this.consume(event); this.heldDelete = event.key; return; }
        }
        const operation = this.ports.operations.active();
        if (!key || !operation?.owns(key)) return;
        try {
          if (operation.delete(key)) { this.consume(event); this.heldDelete = event.key; }
        } catch (error) { this.consume(event); this.heldDelete = event.key; operation.error(error); }
        return;
      }
      if (target.key && extending) {
        this.keyboard ??= { policy: this.policy, eligible: !!this.policy && event.ctrlKey && !event.metaKey && !event.altKey };
        this.keyboard.eligible &&= event.ctrlKey;
      }
    };
    const focus = (event: Event) => {
      const target = this.ports.target(event);
      if (!target.key || target.excluded || target.composing) this.cancelGesture();
    };
    const composition = (event: Event) => {
      const target = this.ports.target(event);
      if (target.key && !target.excluded) { this.composing = true; this.cancelGesture(); }
    };
    const compositionEnd = () => { this.composing = false; };
    const listeners: [string, EventListener][] = [
      ["pointerdown", down as EventListener], ["pointermove", move as EventListener], ["pointerup", up as EventListener], ["pointercancel", this.reset],
      ["click", menu as EventListener], ["contextmenu", menu as EventListener], ["keyup", keyup as EventListener], ["keydown", keydown as EventListener],
      ["focusin", focus], ["compositionstart", composition], ["compositionend", compositionEnd],
    ];
    for (const [name, listener] of listeners) document.addEventListener(name, listener, true);
    document.defaultView?.addEventListener("blur", this.reset);
    let installed = true;
    const dispose = () => {
      if (!installed) return;
      installed = false;
      this.reset();
      for (const [name, listener] of listeners) document.removeEventListener(name, listener, true);
      document.defaultView?.removeEventListener("blur", this.reset);
      if (this.stopInput === dispose) this.stopInput = undefined;
    };
    this.stopInput = dispose; return dispose;
  }
  dispose(): void { this.stopInput?.(); this.reset(); this.policy = undefined; }
}
