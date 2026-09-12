import { onCleanup, onMount } from "solid-js";
import type { BlockViewProps } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { ChildBlocks, RelationBlocks } from "./block-outlet";

export function UnknownBlockView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  let disposeMount: (() => void) | undefined;

  onMount(() => {
    disposeMount = editor.mounts.register(props.nodeKey, {
      root,
      focusElement: root,
      inputPolicy: "container",
      focus: () => root.focus({ preventScroll: true }),
    });
  });
  onCleanup(() => disposeMount?.());

  return (
    <div
      ref={root}
      class="abstract-block reactive-unknown-block"
      tabIndex={-1}
      data-block-id={(node()?.payload.id as string | undefined) ?? ""}
      data-client-id={props.nodeKey}
      data-runtime-key={props.nodeKey}
      data-block-type={(node()?.payload.type as string | undefined) ?? node()?.viewType}
    >
      <div class="reactive-unknown-block__label">{node()?.viewType}</div>
      <RelationBlocks parentKey={props.nodeKey} />
      <ChildBlocks parentKey={props.nodeKey} />
    </div>
  );
}
