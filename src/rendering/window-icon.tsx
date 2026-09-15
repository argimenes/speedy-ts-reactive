import { Show, type JSX } from "solid-js";
import "./window-icon.css";

export type WindowState = "normal" | "minimized" | "maximized";
export type WindowIconKind = "document" | "window";

export function resolvedWindowState(value: unknown): WindowState {
  if (value === "minimized") return "minimized";
  if (value === "maximized" || value === "maximised") return "maximized";
  return "normal";
}

export function resolvedWindowIcon(viewType: string, value: unknown): WindowIconKind {
  const kind = value && typeof value === "object" && !Array.isArray(value) ? (value as { kind?: unknown }).kind : value;
  if (kind === "document" || kind === "window") return kind;
  return viewType === "document-window-block" ? "document" : "window";
}

export function WindowIcon(props: {
  title: string;
  kind: WindowIconKind;
  class?: string;
  onRestore: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  onPointerDown?: JSX.EventHandlerUnion<HTMLButtonElement, PointerEvent>;
  onPointerMove?: JSX.EventHandlerUnion<HTMLButtonElement, PointerEvent>;
  onPointerUp?: JSX.EventHandlerUnion<HTMLButtonElement, PointerEvent>;
  onPointerCancel?: JSX.EventHandlerUnion<HTMLButtonElement, PointerEvent>;
}) {
  return <button type="button" class={`window-icon${props.class ? ` ${props.class}` : ""}`} data-window-icon data-icon-kind={props.kind}
    aria-label={`Restore ${props.title}`} title={`Restore ${props.title}`} draggable={false}
    onDragStart={event => event.preventDefault()} onClick={props.onRestore}
    onPointerDown={props.onPointerDown} onPointerMove={props.onPointerMove} onPointerUp={props.onPointerUp} onPointerCancel={props.onPointerCancel}>
    <span class="window-icon__glyph" aria-hidden="true"><Show when={props.kind === "document"} fallback={
      <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18" /></svg>
    }><svg viewBox="0 0 24 24"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M9 13h6M9 17h6" /></svg></Show></span>
    <span class="window-icon__label">{props.title}</span>
  </button>;
}
