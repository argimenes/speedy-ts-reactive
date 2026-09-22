import { Dynamic } from "solid-js/web";
import { For, Show, onCleanup, onMount } from "solid-js";
import type { NodeKey } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { UnknownBlockView } from "./unknown-block-view";
import { BlockSelectionHandle } from "./block-selection";
import { marginSide, useDocumentMargins } from "./document-margins";

export function BlockOutlet(props: { nodeKey: NodeKey }) {
  const { editor, projection } = useReactiveView();
  const registration = () => {
    const type = projection.state.nodes[props.nodeKey]?.viewType ?? "unknown-block";
    return editor.registry.resolve(type);
  };
  return <><Dynamic component={registration()?.view ?? UnknownBlockView} nodeKey={props.nodeKey} /><BlockSelectionHandle editor={editor} nodeKey={props.nodeKey} /></>;
}

export function ChildBlocks(props: { parentKey: NodeKey }) {
  const { projection } = useReactiveView();
  const children = () => projection.state.nodes[props.parentKey]?.children ?? [];
  return <For each={children()}>{(key) => <BlockOutlet nodeKey={key} />}</For>;
}

export function RelationBlocks(props: { parentKey: NodeKey }) {
  const { projection } = useReactiveView();
  const relations = () =>
    Object.entries(projection.state.nodes[props.parentKey]?.ownedRelations ?? {})
      .filter(([name]) => !name.startsWith("superposition:"));
  return (
    <For each={relations()}>
      {([name, key]) => <RelationBlock ownerKey={props.parentKey} name={name} nodeKey={key} />}
    </For>
  );
}

function RelationBlock(props: { ownerKey: NodeKey; name: string; nodeKey: NodeKey }) {
  const margins = useDocumentMargins();
  const side = marginSide(props.name);
  let unregister: (() => void) | undefined;
  onMount(() => {
    if (margins && side) unregister = margins.register({ ownerKey: props.ownerKey, relationKey: props.nodeKey, side, name: props.name });
  });
  onCleanup(() => unregister?.());
  const movedToDrawer = () => Boolean(side && margins?.collapsed() && margins.drawerOpen());
  return <Show when={!movedToDrawer()}>
    <aside class={`reactive-relation reactive-relation--${props.name}`} data-relation-name={props.name}>
      <BlockOutlet nodeKey={props.nodeKey} />
    </aside>
  </Show>;
}
