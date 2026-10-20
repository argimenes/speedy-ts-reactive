import { createEffect, onCleanup, untrack, type JSX } from "solid-js";
import { insert } from "solid-js/web";
import { ReactiveViewProvider, useReactiveView } from "../reactive-editor/context";
import { useManagedWindowOwner } from "./window-manager";
import type { RetainedDocumentSession } from "../application/document-sessions";
import { BlockOutlet } from "./block-outlet";
import { DocumentSessionContext } from "./document-session-context";

/** A slot mounts once. Its workspace store owns the independent render root.
 * No DOM adoption or host transfer is implemented here.
 */
export function RetainedDocumentHost(props: {
  ownerKey: string; slotKey: string; placement: string; selected: boolean;
  sharedRoot?: string; render(session: RetainedDocumentSession): JSX.Element;
}) {
  const context = useReactiveView(), owner = useManagedWindowOwner(), store = context.editor.documentSessions!;
  const session = store.mount({
    ownerKey: props.ownerKey, slotKey: props.slotKey, placement: props.placement,
    windowId: owner?.windowId ?? props.ownerKey, coordinates: context.coordinates!,
    ...(props.sharedRoot ? { shared: { projection: context.projection, rootKey: props.sharedRoot } } : {}),
  }, session => {
    insert(session.element, () => <DocumentSessionContext.Provider value={session}>
      <ReactiveViewProvider editor={context.editor} projection={session.projection}
        coordinates={session.host.coordinates} windowGeometry={context.windowGeometry} activity={session.host.activity}>
        {props.render(session)}
      </ReactiveViewProvider>
    </DocumentSessionContext.Provider>);
  });
  createEffect(() => {
    const window = owner?.manager.registry.windows[owner.windowId];
    const selected = props.selected;
    const visible = selected && (!owner || !!window?.visible);
    const active = visible && (!owner || !!window?.active);
    untrack(() => session.host.update(visible, active));
  });
  onCleanup(() => store.release(session));
  return session.element;
}

/** First-mount shared-projection island; does not adopt existing live editors. */
export function RetainedInkDocument(props: { nodeKey: string; windowKey: string }) {
  const { projection } = useReactiveView();
  return <RetainedDocumentHost ownerKey={props.windowKey} slotKey={props.nodeKey}
    placement={projection.state.nodes[props.nodeKey].placementKey} sharedRoot={props.nodeKey} selected={true}
    render={() => <BlockOutlet nodeKey={props.nodeKey} />} />;
}
