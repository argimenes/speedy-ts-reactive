import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { MountHandle } from "../runtime/mounts";
import type { BlockSelectionMode } from "../runtime/block-selection";
import "./block-selection.css";

interface DragSession { source: string; targets: Set<string>; indicator?: HTMLElement; moved: boolean; dropped: boolean }
const drags = new WeakMap<ReactiveEditor, DragSession>();
function clearDrag(editor: ReactiveEditor) {
  const drag = drags.get(editor); if (drag?.indicator) delete drag.indicator.dataset.blockDrop;
  drags.delete(editor);
}

/** Decorate the registered root, without adding a wrapper to document layout. */
export function BlockSelectionHandle(props: { editor: ReactiveEditor; nodeKey: string }) {
  const editor = props.editor, selection = editor.blockSelection;
  const [mounted, setMounted] = createSignal<{ root: HTMLElement; button: HTMLButtonElement }>();
  let detach: (() => void) | undefined;
  let suppressClick = false;
  const focusHandle = (key: string) => editor.mounts.get(key)?.root.querySelector<HTMLButtonElement>(":scope > [data-block-selection-handle]")?.focus({ preventScroll: true });
  const run = (id: string, event?: Event): boolean | void => {
    if (editor.blockClipboard.run(id, event)) return;
    const action = id.replace("selection.", "");
    if (["single", "toggle", "range", "add-range"].includes(action)) {
      selection.select(props.nodeKey, action as BlockSelectionMode); focusHandle(props.nodeKey); return;
    }
    if (["previous", "next", "extend-previous", "extend-next"].includes(action)) {
      const key = selection.navigate(props.nodeKey, action.endsWith("previous") ? -1 : 1, action.startsWith("extend"));
      if (key) { focusHandle(key); editor.mounts.get(key)?.root.scrollIntoView?.({ block: "nearest" }); } return;
    }
    if (action === "clear" || action === "edit") {
      editor.blockClipboard.dismiss(); selection.clear(); editor.focus.request(props.nodeKey, { reason: "leave-block-selection" }); return;
    }
    return false;
  };
  const attach = (handle: MountHandle) => {
    detach?.();
    if (!(handle.root instanceof HTMLElement) || !selection.eligible(props.nodeKey)) return;
    const root = handle.root, button = document.createElement("button");
    button.type = "button"; button.className = "block-selection-handle";
    button.dataset.blockSelectionHandle = props.nodeKey;
    button.textContent = "⠿"; button.draggable = true; button.contentEditable = "false";
    const type = editor.node(props.nodeKey)?.viewType.replace(/-block$/, "").replaceAll("-", " ") ?? "";
    button.setAttribute("aria-label", `Select ${type} Block`);
    let clickHandled = false, contextHandled = false;
    const input = (event: KeyboardEvent | MouseEvent) => {
      event.stopPropagation();
      if (event.type === "click" && suppressClick) { suppressClick = false; event.preventDefault(); return; }
      if (event.type === "click" && contextHandled) { contextHandled = false; event.preventDefault(); return; }
      editor.bindings.dispatch(event, ["block-handle"], id => run(id, event));
      if (event.type === "click") clickHandled = true;
    };
    const pointer = (event: PointerEvent) => { event.stopPropagation(); clickHandled = false; contextHandled = false; }; // Do not prevent native drag initiation.
    const menu = (event: MouseEvent) => {
      if (event.ctrlKey) {
        event.preventDefault(); event.stopPropagation();
        // macOS may emit contextmenu instead of (or before/after) click.
        if (!clickHandled) {
          editor.bindings.dispatch(new MouseEvent("click", { button: 0, ctrlKey: true, shiftKey: event.shiftKey, metaKey: event.metaKey, altKey: event.altKey }), ["block-handle"], run);
          contextHandled = true;
        }
      }
    };
    const start = (event: DragEvent) => {
      event.stopPropagation();
      if (!selection.isSelected(props.nodeKey)) selection.select(props.nodeKey);
      const targets = new Set(selection.reorderTargets());
      if (!targets.size) { event.preventDefault(); selection.setMessage("To reorder together, select Blocks from the same parent list, with an unselected neighbour to drop beside."); return; }
      clearDrag(editor); drags.set(editor, { source: props.nodeKey, targets, moved: false, dropped: false });
      event.dataTransfer?.setData("application/x-speedy-block-selection", props.nodeKey);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      selection.setMessage(`Moving ${selection.actionTargets().length} Block(s). Drop above or below another Block in this list.`);
    };
    const side = (event: DragEvent) => event.clientY < root.getBoundingClientRect().top + root.getBoundingClientRect().height / 2 ? "before" : "after";
    const over = (event: DragEvent) => {
      const drag = drags.get(editor); if (!drag) return;
      // The deepest Block is the drop target; do not reinterpret its parent.
      event.stopPropagation();
      if (drag.indicator && drag.indicator !== root) delete drag.indicator.dataset.blockDrop;
      if (!drag.targets.has(props.nodeKey)) { if (event.dataTransfer) event.dataTransfer.dropEffect = "none"; return; }
      event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      root.dataset.blockDrop = side(event); drag.indicator = root;
    };
    const leave = (event: DragEvent) => { if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) delete root.dataset.blockDrop; };
    const drop = (event: DragEvent) => {
      const drag = drags.get(editor); if (!drag) return;
      drag.dropped = true;
      event.preventDefault(); event.stopPropagation();
      if (drag.targets.has(props.nodeKey)) {
        try {
          drag.moved = selection.moveTo(props.nodeKey, side(event));
          selection.setMessage(drag.moved ? "Blocks moved. Undo restores their previous positions." : "The selection is already at this position.");
          queueMicrotask(() => focusHandle(drag.source));
        } catch (error) { selection.setMessage(error instanceof Error ? error.message : String(error)); }
      }
      if (drag.indicator) delete drag.indicator.dataset.blockDrop;
    };
    const end = (event: DragEvent) => {
      event.stopPropagation();
      if (drags.get(editor) && !drags.get(editor)!.dropped) selection.setMessage("Move cancelled. No Blocks changed.");
      clearDrag(editor); suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    };
    button.addEventListener("pointerdown", pointer);
    for (const action of ["copy", "cut", "paste"]) button.addEventListener(action, event => {
      event.preventDefault(); event.stopPropagation(); editor.blockClipboard.run(`selection.${action}`, event);
    });
    button.addEventListener("click", input); button.addEventListener("keydown", input); button.addEventListener("contextmenu", menu);
    button.addEventListener("dragstart", start); button.addEventListener("dragend", end);
    root.addEventListener("dragover", over); root.addEventListener("drop", drop); root.addEventListener("dragleave", leave);
    root.classList.add("block-selectable"); root.appendChild(button); setMounted({ root, button });
    detach = () => {
      button.remove(); root.classList.remove("block-selectable", "block-is-selected"); delete root.dataset.blockDrop;
      root.removeEventListener("dragover", over); root.removeEventListener("drop", drop); root.removeEventListener("dragleave", leave);
      setMounted(undefined);
      if (selection.state.items.length) queueMicrotask(() => selection.prune());
    };
  };
  onMount(() => {
    const handle = editor.mounts.get(props.nodeKey); if (handle) attach(handle);
    const unsubscribe = editor.mounts.subscribe((key, handle) => { if (key === props.nodeKey) attach(handle); });
    onCleanup(() => { unsubscribe(); detach?.(); if (drags.get(editor)?.source === props.nodeKey) clearDrag(editor); });
  });
  createEffect(() => {
    const nodes = mounted(); if (!nodes) return;
    const selected = selection.isSelected(props.nodeKey);
    nodes.root.classList.toggle("block-is-selected", selected); nodes.button.setAttribute("aria-pressed", String(selected));
    nodes.button.title = `Select Block (${editor.bindings.label("selection.single")}); range: ${editor.bindings.label("selection.range")}; toggle: ${editor.bindings.label("selection.toggle")}. Drag to reorder.`;
  });
  return null;
}

export function BlockSelectionInspector(props: { editor: ReactiveEditor; viewId: string }) {
  const selection = props.editor.blockSelection;
  const clipboard = props.editor.blockClipboard;
  const clear = () => { clipboard.dismiss(); selection.clear(); };
  const nativeClipboard = (event: ClipboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault(); event.stopPropagation(); clipboard.run(`selection.${event.type}`, event);
  };
  return <Portal><Show when={(selection.state.viewId === props.viewId && selection.state.items.length) || (!selection.state.items.length && clipboard.viewId() === props.viewId)}>
    <section class="block-selection-inspector" data-block-selection-inspector={clipboard.owner} tabIndex={-1} role="region" aria-label="Selected Blocks" onCopy={nativeClipboard} onCut={nativeClipboard} onPaste={nativeClipboard} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); const key = selection.state.leadKey; clear(); if (key) props.editor.focus.request(key, { reason: "clear-block-selection" }); return; }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      props.editor.bindings.dispatch(event, ["block-handle"], id => clipboard.run(id, event));
    }}>
      <div><strong role="status">{selection.state.items.length} Block(s) selected</strong><button type="button" onClick={clear}>Clear selection</button></div>
      <div class="block-clipboard-actions"><For each={["copy", "cut", "paste", "delete"]}>{action => <button type="button" disabled={action === "paste" ? !clipboard.available() : !selection.state.items.length} title={props.editor.bindings.label(`selection.${action}`)} onClick={() => clipboard.run(`selection.${action}`)}>{action[0].toUpperCase() + action.slice(1)}</button>}</For></div>
      <small>Drag a selected handle to reorder the group. Shift-click: range · Ctrl/Cmd-click: toggle.</small>
      <Show when={selection.state.message}><p role="status">{selection.state.message}</p></Show>
      <details><summary>Selected Block IDs ({selection.actionTargets().length} independent action targets)</summary>
        <For each={selection.state.items}>{item => <label>{item.type}<input readOnly aria-label="Selected Block ID" value={item.blockId ?? item.placementKey} /></label>}</For>
      </details>
    </section>
  </Show></Portal>;
}
