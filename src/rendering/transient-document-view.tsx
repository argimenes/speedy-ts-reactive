import { createEffect, onCleanup, onMount } from "solid-js";
import type { PlacementKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveViewProvider, useReactiveView } from "../reactive-editor/context";
import { BlockOutlet } from "./block-outlet";
import { ReactiveViewLayers } from "./reactive-tree-view";
import { DocumentStyleBar } from "./document-style-bar";
import { DocumentTabContext } from "./document-tab-context";
import type { NativeTextSelection } from "../runtime/mounts";

export interface DocumentViewBookmark {
  placement: PlacementKey;
  version: number;
  inline?: { anchor: number; head: number };
  native?: NativeTextSelection;
  cross?: { anchor: { placement: PlacementKey; index: number; version: number }; head: { placement: PlacementKey; index: number; version: number } };
}
/** No authored edge or secondary repository. Caller unmounts on source invalidation. */
export function TransientDocumentView(props: {
  editor: ReactiveEditor; placement: PlacementKey;
  onProjection?(projection: import("../block-tree/projection").BlockTreeProjection): () => void;
  bookmark(): DocumentViewBookmark | undefined;
  remember(value: DocumentViewBookmark): void;
}) {
  const editor = props.editor, parent = useReactiveView();
  const projection = editor.createView(undefined, props.placement);
  const releaseProjection = props.onProjection?.(projection);
  let live = true;
  let lastTextKey: string | undefined;
  createEffect(() => {
    const key = editor.focus.state.focusedKey, node = key && projection.node(key);
    if (node && (editor.registry.hasCapability(node.viewType, "inline-editor") || editor.registry.hasCapability(node.viewType, "native-text"))) lastTextKey = node.key;
  });
  onMount(() => queueMicrotask(() => {
    if (!live) return;
    const saved = props.bookmark();
    const prior = saved && projection.nodeForPlacement(saved.placement);
    const target = prior && editor.mounts.get(prior.key) ? prior : Object.values(projection.state.nodes).find(n => {
      const policy = editor.mounts.get(n.key)?.inputPolicy;
      return policy === "standoff" || policy === "native-text";
    });
    if (!target) return;
    const content = editor.repository.state.contents[target.contentKey];
    const restore = prior === target && saved?.version === content.revision;
    editor.focus.request(target.key, { reason: "activate-document-view", caret: restore && saved?.native ? saved.native : "start" });
    if (restore && saved?.inline) {
      editor.mounts.get(target.key)?.restoreInlineSelection?.(saved.inline);
      editor.selections.setPrimary(target.key, target.contentKey, target.viewId, saved.inline.anchor, saved.inline.head);
    }
    if (saved?.cross) {
      const point = (saved: { placement: PlacementKey; index: number; version: number }) => {
        const node = projection.nodeForPlacement(saved.placement);
        return node && editor.repository.state.contents[node.contentKey]?.revision === saved.version && editor.mounts.get(node.key)
          ? editor.crossText.position(node.key, saved.index) : undefined;
      };
      const anchor = point(saved.cross.anchor), head = point(saved.cross.head);
      if (anchor && head) editor.crossText.set(anchor, head);
    }
  }));
  onCleanup(() => {
    live = false;
    const key = [lastTextKey, editor.focus.state.focusedKey, editor.focus.state.lastFocusedKey].find(k => k && projection.node(k));
    const node = key && projection.node(key), mount = key && editor.mounts.get(key);
    if (node) {
      const content = editor.repository.state.contents[node.contentKey];
      if (content) {
        const primarySet = editor.selections.sets[node.key];
        const primary = primarySet?.items.find(item => item.id === primarySet.primaryId);
        const inline = (mount && mount.captureInlineSelection?.()) || editor.mounts.inlineSelection(node.key) || (primary ? { anchor: primary.anchor.boundary.index, head: primary.head.boundary.index } : undefined);
        const range = editor.crossText.range();
        const point = (key: string, index: number) => {
          const n = projection.node(key), c = n && editor.repository.state.contents[n.contentKey];
          return n && c ? { placement: n.placementKey, index, version: c.revision } : undefined;
        };
        const anchor = range && point(range.anchor.occurrenceKey, range.anchor.boundary.index), head = range && point(range.head.occurrenceKey, range.head.boundary.index);
        props.remember({ placement: node.placementKey, version: content.revision, inline, native: (mount && mount.captureSelection?.()) || editor.mounts.selection(node.key), ...(anchor && head ? { cross: { anchor, head } } : {}) });
      }
    }
    releaseProjection?.();
    editor.disposeView(projection);
  });
  return <ReactiveViewProvider editor={editor} projection={projection} coordinates={parent.coordinates}>
    <section class="reactive-document-occurrence" data-document-view={projection.viewId}>
      <DocumentStyleBar editor={editor} scopeKey={projection.state.rootKey} />
      <div class="reactive-document-occurrence__content"><DocumentTabContext.Provider value={undefined}><BlockOutlet nodeKey={projection.state.rootKey} /></DocumentTabContext.Provider></div>
    </section>
    <ReactiveViewLayers editor={editor} projection={projection} />
  </ReactiveViewProvider>;
}
