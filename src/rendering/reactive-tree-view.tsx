import type { BlockTreeProjection } from "../block-tree/projection";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveViewProvider } from "../reactive-editor/context";
import { BlockOutlet } from "./block-outlet";
import { BlockContextMenuLayer } from "./block-context-menu";

export function ReactiveTreeView(props: {
  editor: ReactiveEditor;
  projection: BlockTreeProjection;
}) {
  return (
    <ReactiveViewProvider editor={props.editor} projection={props.projection}>
      <BlockOutlet nodeKey={props.projection.state.rootKey} />
      <BlockContextMenuLayer editor={props.editor} viewId={props.projection.viewId} />
    </ReactiveViewProvider>
  );
}
