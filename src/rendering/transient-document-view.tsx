import { createEffect, onCleanup, onMount, untrack } from "solid-js";
import type { PlacementKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveViewProvider, useReactiveView } from "../reactive-editor/context";
import { BlockOutlet } from "./block-outlet";
import { ReactiveViewLayers } from "./reactive-tree-view";
import { DocumentStyleBar } from "./document-style-bar";
import { DocumentTabContext } from "./document-tab-context";
import type { NativeTextSelection } from "../runtime/mounts";
import { useDocumentSession } from "./document-session-context";

export interface DocumentViewBookmark {
  placement: PlacementKey;
  version: number;
  selectionRevision?: number;
  inline?: { anchor: number; head: number };
  native?: NativeTextSelection;
  cross?: { anchor: { placement: PlacementKey; index: number; version: number }; head: { placement: PlacementKey; index: number; version: number } };
}
/** Resource-rooted Document renderer; borrows an E1.1 session when provided.
 * Legacy callers still own a transient projection. Neither path creates a resource. */
export function TransientDocumentView(props: {
  editor: ReactiveEditor; placement: PlacementKey;
  onProjection?(projection: import("../block-tree/projection").BlockTreeProjection): () => void;
  bookmark(): DocumentViewBookmark | undefined;
  remember(value: DocumentViewBookmark): void;
  selected?: boolean;
}) {
  const editor = props.editor, parent = useReactiveView();
  const session = useDocumentSession();
  const projection = session?.projection ?? editor.createView(undefined, props.placement);
  const releaseProjection = props.onProjection?.(projection);
  let live = true;
  let lastTextKey: string | undefined;
  createEffect(() => {
    const key = editor.focus.state.focusedKey, node = key && projection.node(key);
    if (node && (editor.registry.hasCapability(node.viewType, "inline-editor") || editor.registry.hasCapability(node.viewType, "native-text"))) lastTextKey = node.key;
  });
  let activation = 0;
  const activate = () => {
    const generation = ++activation, current = editor.windowManager?.lifecycle.ticket();
    queueMicrotask(() => {
      if (!live || generation !== activation || current?.() === false || session && (!session.current() || !session.host.activity().active)) return;
      const saved = props.bookmark();
      const prior = saved && projection.nodeForPlacement(saved.placement);
      const target = prior && editor.mounts.get(prior.key) ? prior : Object.values(projection.state.nodes).find(n => {
        const policy = editor.mounts.get(n.key)?.inputPolicy;
        return policy === "standoff" || policy === "native-text";
      });
      if (!target) return;
      const content = editor.repository.state.contents[target.contentKey];
      const restore = prior === target && saved?.version === content.revision;
      const selections = editor.selections.sets[target.key];
      const primary = selections?.items.find(item => item.id === selections.primaryId);
      // Only use a changed model selection after canonical content changes.
      // Unmapped external/structural edits retain the legacy stale-bookmark
      // fallback instead of restoring unverified offsets.
      const retainedSelection = session && prior === target && primary && selections.revision !== saved?.selectionRevision
        ? { anchor: primary.anchor.boundary.index, head: primary.head.boundary.index } : undefined;
      editor.focus.request(target.key, { reason: "activate-document-view", caret: restore && saved?.native ? saved.native : "start" });
      const inline = restore ? saved?.inline : retainedSelection ?? (session && prior === target ? { anchor: 0, head: 0 } : undefined);
      if (inline) {
        editor.mounts.get(target.key)?.restoreInlineSelection?.(inline);
        editor.selections.setPrimary(target.key, target.contentKey, target.viewId, inline.anchor, inline.head);
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
    });
  };
  const remember = () => {
    const key = [lastTextKey, editor.focus.state.focusedKey, editor.focus.state.lastFocusedKey].find(k => k && projection.node(k));
    const node = key && projection.node(key), mount = key && editor.mounts.get(key);
    if (node) {
      const content = editor.repository.state.contents[node.contentKey];
      if (content) {
        const primarySet = editor.selections.sets[node.key];
        const primary = primarySet?.items.find(item => item.id === primarySet.primaryId);
        const inline = (mount && mount.captureInlineSelection?.()) || editor.mounts.inlineSelection(node.key) || (primary ? { anchor: primary.anchor.boundary.index, head: primary.head.boundary.index } : undefined);
        if (session && inline) editor.selections.setPrimary(node.key, node.contentKey, node.viewId, inline.anchor, inline.head);
        const range = editor.crossText.range();
        const point = (key: string, index: number) => {
          const n = projection.node(key), c = n && editor.repository.state.contents[n.contentKey];
          return n && c ? { placement: n.placementKey, index, version: c.revision } : undefined;
        };
        const anchor = range && point(range.anchor.occurrenceKey, range.anchor.boundary.index), head = range && point(range.head.occurrenceKey, range.head.boundary.index);
        props.remember({ placement: node.placementKey, version: content.revision, selectionRevision: editor.selections.sets[node.key]?.revision,
          inline, native: (mount && mount.captureSelection?.()) || editor.mounts.selection(node.key), ...(anchor && head ? { cross: { anchor, head } } : {}) });
      }
    }
  };
  onMount(() => {
    if (!session) { activate(); return; }
    let selected = false;
    createEffect(() => {
      const next = props.selected !== false;
      untrack(() => {
        if (next && !selected) activate();
        else if (!next && selected) {
          ++activation; remember();
          const cross = editor.crossText.range();
          if (cross && projection.node(cross.anchor.occurrenceKey)) editor.crossText.clear();
        }
        selected = next;
      });
    });
  });
  onCleanup(() => {
    live = false; ++activation; remember();
    releaseProjection?.();
    if (!session) editor.disposeView(projection);
  });
  return <ReactiveViewProvider editor={editor} projection={projection} coordinates={parent.coordinates} activity={parent.activity}>
    <section class="reactive-document-occurrence" data-document-view={projection.viewId}>
      <DocumentStyleBar editor={editor} scopeKey={projection.state.rootKey} />
      <div class="reactive-document-occurrence__content" ref={host => onMount(() => onCleanup(editor.pointerSpotlight.mount(host, () => parent.coordinates?.scale() ?? 1)))}><DocumentTabContext.Provider value={undefined}><BlockOutlet nodeKey={projection.state.rootKey} /></DocumentTabContext.Provider></div>
    </section>
    <ReactiveViewLayers editor={editor} projection={projection} />
  </ReactiveViewProvider>;
}
