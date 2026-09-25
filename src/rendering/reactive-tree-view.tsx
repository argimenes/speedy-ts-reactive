import type { BlockTreeProjection } from "../block-tree/projection";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveViewProvider } from "../reactive-editor/context";
import { BlockOutlet } from "./block-outlet";
import { BlockContextMenuLayer } from "./block-context-menu";
import { AnnotationMonitorLayer } from "./annotation-monitor";
import { ContributedPanels } from "./contributed-panels";
import { BlockSelectionInspector } from "./block-selection";
import { DocumentFindLayer } from "./document-find";
import { BindingChordHint } from "./binding-chord-hint";
import { StickyDraftLayer } from "./sticky-note";
import { BlockHistoryLayer } from "./block-history";
import "./concertina.css";

export function ReactiveTreeView(props: {
  editor: ReactiveEditor;
  projection: BlockTreeProjection;
}) {
  return (
    <ReactiveViewProvider editor={props.editor} projection={props.projection}>
      <BlockOutlet nodeKey={props.projection.state.rootKey} />
      <BlockContextMenuLayer editor={props.editor} viewId={props.projection.viewId} />
      <BlockHistoryLayer editor={props.editor} viewId={props.projection.viewId} />
      <AnnotationMonitorLayer editor={props.editor} viewId={props.projection.viewId} />
      <ContributedPanels editor={props.editor} viewId={props.projection.viewId} />
      <DocumentFindLayer editor={props.editor} viewId={props.projection.viewId} />
      <BindingChordHint editor={props.editor} viewId={props.projection.viewId} />
      <StickyDraftLayer editor={props.editor} viewId={props.projection.viewId} />
      <BlockSelectionInspector editor={props.editor} viewId={props.projection.viewId} />
    </ReactiveViewProvider>
  );
}
