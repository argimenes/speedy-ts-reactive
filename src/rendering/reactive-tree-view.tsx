import type { BlockTreeProjection } from "../block-tree/projection";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { NodeKey } from "../block-tree/types";
import type { LocalCoordinates } from "../runtime/local-coordinates";
import type { WindowGeometryHost } from "./window-geometry";
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

/** Once per projection, outside any transformed content surface. */
export function ReactiveViewLayers(props: { editor: ReactiveEditor; projection: BlockTreeProjection }) {
  return <>
    <BlockContextMenuLayer editor={props.editor} viewId={props.projection.viewId} />
    <BlockHistoryLayer editor={props.editor} viewId={props.projection.viewId} />
    <AnnotationMonitorLayer editor={props.editor} viewId={props.projection.viewId} />
    <ContributedPanels editor={props.editor} viewId={props.projection.viewId} />
    <DocumentFindLayer editor={props.editor} viewId={props.projection.viewId} />
    <BindingChordHint editor={props.editor} viewId={props.projection.viewId} />
    <StickyDraftLayer editor={props.editor} viewId={props.projection.viewId} />
    <BlockSelectionInspector editor={props.editor} viewId={props.projection.viewId} />
  </>;
}

export function ReactiveTreeView(props: {
  editor: ReactiveEditor;
  projection: BlockTreeProjection;
  coordinates?: LocalCoordinates;
  windowGeometry?: (key: NodeKey) => WindowGeometryHost | undefined;
}) {
  return (
    <ReactiveViewProvider editor={props.editor} projection={props.projection} coordinates={props.coordinates} windowGeometry={props.windowGeometry}>
      <BlockOutlet nodeKey={props.projection.state.rootKey} />
      <ReactiveViewLayers editor={props.editor} projection={props.projection} />
    </ReactiveViewProvider>
  );
}
