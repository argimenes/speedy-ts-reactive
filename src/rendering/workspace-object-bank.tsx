import { For, Show, createSignal } from "solid-js";
import type { BlockViewProps } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { BlockOutlet } from "./block-outlet";

/** Retained core access to owned content, including when a presentation is absent.
 * Bank children are not automatically laid out or cloned into Desktop. */
export function WorkspaceObjectBankView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const [open, setOpen] = createSignal<string>();
  const children = () => projection.state.nodes[props.nodeKey]?.children ?? [];
  return <aside class="workspace-object-bank" aria-label="Workspace object bank">
    <details><summary>Workspace object bank ({children().length})</summary>
      <p>Open stored content without adding a Desktop placement.</p>
      <For each={children()}>{key => <button onClick={() => setOpen(open() === key ? undefined : key)} aria-pressed={open() === key}>{String((projection.state.nodes[key]?.payload.metadata as any)?.title ?? projection.state.nodes[key]?.viewType)}</button>}</For>
      <Show when={open() && children().includes(open()!) ? open() : undefined} keyed>{key => <section class="workspace-object-bank__viewer"><button onClick={() => setOpen(undefined)}>Close stored object</button><BlockOutlet nodeKey={key} /></section>}</Show>
    </details>
  </aside>;
}
