import { createSignal, onCleanup, type Accessor } from "solid-js";
import "./floating-window-resize.css";

export type FloatingWindowSize = { width: number; height: number };

type SizeSource = FloatingWindowSize | Accessor<FloatingWindowSize>;
type MaximumSource = Partial<FloatingWindowSize> | Accessor<Partial<FloatingWindowSize>>;

export interface FloatingWindowResizeOptions {
  element: Accessor<HTMLElement | undefined>;
  size: Accessor<FloatingWindowSize>;
  minimum: SizeSource;
  maximum?: MaximumSource;
  enabled?: Accessor<boolean>;
  normalizeStartToMinimum?: boolean;
  viewportInset?: number;
  onCommit: (size: FloatingWindowSize) => void;
}

const resolve = <T,>(source: T | Accessor<T>): T => typeof source === "function" ? (source as Accessor<T>)() : source;
const sameSize = (left: FloatingWindowSize, right: FloatingWindowSize) => Math.round(left.width) === Math.round(right.width) && Math.round(left.height) === Math.round(right.height);

/**
 * Shared resize mechanics for floating windows. Pointer and keyboard changes are
 * kept local while the gesture is active and committed exactly once at its end.
 */
export function createFloatingWindowResize(options: FloatingWindowResizeOptions) {
  const [preview, setPreview] = createSignal<FloatingWindowSize>();
  const [active, setActive] = createSignal(false);
  let pointer: { id: number; x: number; y: number; width: number; height: number; moved: boolean } | undefined;
  let keyboardTimer: ReturnType<typeof setTimeout> | undefined;

  const isEnabled = () => options.enabled?.() ?? true;
  const dimensions = () => preview() ?? options.size();
  const clamp = (width: number, height: number) => {
    const minimum = resolve(options.minimum);
    const maximum = options.maximum ? resolve(options.maximum) : {};
    const root = options.element();
    const rect = root?.getBoundingClientRect();
    const inset = options.viewportInset ?? 8;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const availableWidth = Math.max(1, rect ? viewportWidth - rect.left - inset : viewportWidth - inset * 2);
    const availableHeight = Math.max(1, rect ? viewportHeight - rect.top - inset : viewportHeight - inset * 2);
    const effectiveMinimumWidth = Math.min(minimum.width, availableWidth);
    const effectiveMinimumHeight = Math.min(minimum.height, availableHeight);
    const maxWidth = Math.max(effectiveMinimumWidth, Math.min(maximum.width ?? Number.POSITIVE_INFINITY, availableWidth));
    const maxHeight = Math.max(effectiveMinimumHeight, Math.min(maximum.height ?? Number.POSITIVE_INFINITY, availableHeight));
    return {
      width: Math.max(effectiveMinimumWidth, Math.min(maxWidth, width)),
      height: Math.max(effectiveMinimumHeight, Math.min(maxHeight, height)),
    };
  };
  const clearKeyboardTimer = () => {
    if (!keyboardTimer) return;
    clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
  };
  const cancel = () => {
    clearKeyboardTimer();
    pointer = undefined;
    setPreview(undefined);
    setActive(false);
  };
  const commit = () => {
    clearKeyboardTimer();
    const final = preview();
    pointer = undefined;
    setPreview(undefined);
    setActive(false);
    if (!final) return;
    const rounded = { width: Math.round(final.width), height: Math.round(final.height) };
    if (!sameSize(rounded, options.size())) options.onCommit(rounded);
  };
  const beginPointer = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (!isEnabled() || event.button !== 0) return;
    clearKeyboardTimer();
    const rect = options.element()?.getBoundingClientRect();
    const current = dimensions();
    const rendered = { width: rect?.width || current.width, height: rect?.height || current.height };
    const start = options.normalizeStartToMinimum ? clamp(rendered.width, rendered.height) : rendered;
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: start.width,
      height: start.height,
      moved: false,
    };
    setActive(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  const movePointer = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    pointer.moved ||= Math.abs(dx) > 1 || Math.abs(dy) > 1;
    setPreview(clamp(pointer.width + dx, pointer.height + dy));
    event.preventDefault();
    event.stopPropagation();
  };
  const endPointer = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const moved = pointer.moved;
    pointer = undefined;
    if (moved) commit(); else cancel();
    event.stopPropagation();
  };
  const cancelPointer = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    cancel();
    event.stopPropagation();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && preview()) {
      cancel(); event.preventDefault(); event.stopPropagation(); return;
    }
    if (event.key === "Enter" && preview()) {
      commit(); event.preventDefault(); event.stopPropagation(); return;
    }
    if (!isEnabled() || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const current = dimensions(), step = event.shiftKey ? 1 : 10;
    setPreview(clamp(
      current.width + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
      current.height + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0),
    ));
    setActive(true);
    clearKeyboardTimer();
    keyboardTimer = setTimeout(commit, 300);
    event.preventDefault();
    event.stopPropagation();
  };

  onCleanup(clearKeyboardTimer);
  return { dimensions, active, preview, clamp, cancel, commit, beginPointer, movePointer, endPointer, cancelPointer, keyDown };
}

export type FloatingWindowResizeController = ReturnType<typeof createFloatingWindowResize>;

export function FloatingWindowResizeHandle(props: { controller: FloatingWindowResizeController; label: string; class?: string }) {
  return <div
    class={`floating-window-resize-handle${props.class ? ` ${props.class}` : ""}`}
    classList={{ "floating-window-resize-handle--active": props.controller.active() }}
    role="button"
    tabIndex={0}
    aria-label={props.label}
    title="Drag or use arrow keys to resize"
    onPointerDown={props.controller.beginPointer}
    onPointerMove={props.controller.movePointer}
    onPointerUp={props.controller.endPointer}
    onLostPointerCapture={props.controller.endPointer}
    onPointerCancel={props.controller.cancelPointer}
    onKeyDown={props.controller.keyDown}
    onBlur={props.controller.commit}
  />;
}
