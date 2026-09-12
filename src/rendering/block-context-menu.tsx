import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { OverlayDescriptor } from "../runtime/overlays";
import { blockMenuItems, type BlockMenuItem } from "../runtime/block-menu-actions";
import "./block-context-menu.css";

function Menu(props: { editor: ReactiveEditor; overlay: OverlayDescriptor }) {
  let root!: HTMLDivElement;
  let dispose: (() => void) | undefined;
  const [path, setPath] = createSignal<BlockMenuItem[]>([]);
  const [form, setForm] = createSignal<BlockMenuItem>();
  const [value, setValue] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [position, setPosition] = createSignal(props.overlay.anchor);
  const items = () => path().at(-1)?.children ?? blockMenuItems(props.editor, props.overlay.ownerKey);
  const focusFirst = () => queueMicrotask(() => (root.querySelector<HTMLElement>("input") ?? root.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)"))?.focus());
  const clamp = () => {
    const rect = root.getBoundingClientRect();
    setPosition({ x: Math.max(8, Math.min(props.overlay.anchor.x, window.innerWidth - rect.width - 8)), y: Math.max(8, Math.min(props.overlay.anchor.y, window.innerHeight - rect.height - 8)) });
  };
  onMount(() => {
    const custom = (event: Event) => { if (event instanceof CustomEvent && props.editor.bindings.dispatchCustom(event.detail?.name, ["menu"], id => runBinding(id, event.target), event.detail?.payload)) { event.preventDefault(); event.stopPropagation(); } };
    root.addEventListener("speedy-input", custom); onCleanup(() => root.removeEventListener("speedy-input", custom));
    dispose = props.editor.mounts.register(props.overlay.key, { root, focusElement: root, inputPolicy: "opaque-widget", focus: focusFirst });
    clamp(); focusFirst();
    const outside = (event: PointerEvent) => { if (!root.contains(event.target as Node)) props.editor.overlays.close(props.overlay.key, false); };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", clamp);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(clamp) : undefined;
    observer?.observe(root);
    onCleanup(() => { observer?.disconnect(); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", clamp); });
  });
  onCleanup(() => dispose?.());
  createEffect(() => { path(); form(); queueMicrotask(() => { if (root?.isConnected) clamp(); }); });
  const back = () => { if (form()) setForm(undefined); else setPath(path().slice(0, -1)); setError(""); focusFirst(); };
  const activate = async (item: BlockMenuItem) => {
    if (item.disabled || busy()) return;
    setError("");
    if (item.children) { setPath([...path(), item]); focusFirst(); return; }
    if (item.input) { setForm(item); setValue(item.input.value ?? ""); focusFirst(); return; }
    setBusy(true);
    try {
      // Close before a successful action transfers focus or opens a file dialog.
      // Synchronous commands can fail without losing the menu/error state.
      const previousFocus = props.editor.focus.state.requestToken;
      const result = item.run?.();
      props.editor.overlays.close(props.overlay.key, !result && props.editor.focus.state.requestToken === previousFocus);
      await result;
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const submit = () => {
    try {
      if (!value().trim()) throw new Error("Enter a value first.");
      const previousFocus = props.editor.focus.state.requestToken;
      form()?.input?.submit(value().trim());
      props.editor.overlays.close(props.overlay.key, props.editor.focus.state.requestToken === previousFocus);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  };
  const runBinding = (id: string, target: EventTarget | null): boolean | void => {
    if (id === "menu.close" || id === "menu.tab") { props.editor.overlays.close(props.overlay.key); return; }
    if (target instanceof HTMLInputElement) return false;
    if (id === "menu.back" && (path().length || form())) { back(); return; }
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (["menu.next", "menu.previous", "menu.first", "menu.last"].includes(id)) {
      const index = id === "menu.first" ? 0 : id === "menu.last" ? buttons.length - 1 : (current + (id === "menu.next" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index]?.focus(); return;
    }
    if (id === "menu.enter" && buttons[current]?.hasAttribute("aria-haspopup")) { buttons[current].click(); return; }
    return false;
  };
  const keys = (event: KeyboardEvent | MouseEvent) => {
    event.stopPropagation();
    props.editor.bindings.dispatch(event, ["menu"], id => runBinding(id, event.target));
  };
  return <div ref={root} class="reactive-block-menu" role={form() ? "dialog" : "menu"} aria-label="Block menu" tabIndex={-1}
    data-session-overlay={props.overlay.key} data-native-context-menu style={{ left: `${position().x}px`, top: `${position().y}px` }} onKeyDown={keys} onClick={keys} onDblClick={keys} onContextMenu={keys}>
    <header><span>{form()?.label ?? path().at(-1)?.label ?? "Block menu"}</span><button type="button" aria-label="Close block menu" onClick={() => props.editor.overlays.close(props.overlay.key)}>×</button></header>
    <Show when={path().length || form()}><button role="menuitem" type="button" onClick={back}>‹ Back</button></Show>
    <Show when={form()} fallback={<For each={items()}>{item => <button type="button" role="menuitem" aria-haspopup={item.children ? "menu" : item.input ? "dialog" : undefined} disabled={item.disabled || busy()} title={item.reason} onClick={() => void activate(item)}><span>{item.label}</span><Show when={item.children || item.input}><span aria-hidden="true">›</span></Show></button>}</For>}>
      <form onSubmit={event => { event.preventDefault(); submit(); }}>
        <label>{form()!.input!.label}<input autofocus value={value()} onInput={event => setValue(event.currentTarget.value)} /></label>
        <button type="submit">Apply</button>
      </form>
    </Show>
    <Show when={error()}><p role="alert">{error()}</p></Show>
  </div>;
}

export function BlockContextMenuLayer(props: { editor: ReactiveEditor; viewId: string }) {
  return <Portal><For each={props.editor.overlays.overlays.filter(overlay => overlay.viewType === "context-menu" && props.editor.node(overlay.ownerKey)?.viewId === props.viewId)}>{overlay => <Menu editor={props.editor} overlay={overlay} />}</For></Portal>;
}
