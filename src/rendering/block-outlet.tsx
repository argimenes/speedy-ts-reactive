import { Dynamic } from "solid-js/web";
import { For } from "solid-js";
import type { NodeKey } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { UnknownBlockView } from "./unknown-block-view";
import { BlockSelectionHandle } from "./block-selection";

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
    Object.entries(projection.state.nodes[props.parentKey]?.ownedRelations ?? {});
  return (
    <For each={relations()}>
      {([name, key]) => (
        <aside class={`reactive-relation reactive-relation--${name}`} data-relation-name={name}>
          <BlockOutlet nodeKey={key} />
        </aside>
      )}
    </For>
  );
}
