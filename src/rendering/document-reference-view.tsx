import { createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { BlockViewProps } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";

export function DocumentReferenceView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const documentId = () => String((node()?.payload.metadata as Record<string, unknown> | undefined)?.documentId ?? "");
  const reference = createMemo(() => editor.persistence.workspaceReference(documentId()));
  const issue = createMemo(() => editor.persistence.workspaceLoadIssues().find(item => item.documentId === documentId()));
  const [busy, setBusy] = createSignal(false);
  let root!: HTMLDivElement;
  let disposeMount: (() => void) | undefined;
  onMount(() => {
    disposeMount = editor.mounts.register(props.nodeKey, { root, focusElement: root, inputPolicy: "container", focus: () => root.focus({ preventScroll: true }) });
  });
  onCleanup(() => disposeMount?.());
  const resolve = async (replacement?: { kind: "document-store"; folder: string; filename: string }) => {
    if (busy()) return;
    setBusy(true);
    await editor.persistence.resolveWorkspaceDocument(documentId(), replacement);
    setBusy(false);
  };
  const relink = () => {
    const current = reference()?.source;
    const folder = window.prompt("Document folder", current?.folder ?? ".");
    if (folder === null) return;
    const filename = window.prompt("Document filename", current?.filename ?? "");
    if (!filename) return;
    void resolve({ kind: "document-store", folder, filename });
  };
  const removeWindow = () => {
    const parent = Object.values(projection.state.nodes).find(candidate => candidate.children.includes(props.nodeKey));
    editor.commands.remove(parent?.viewType === "document-window-block" ? parent.key : props.nodeKey);
  };
  return (
    <div ref={root} class="abstract-block workspace-document-reference" role="alert" tabIndex={-1} data-block-type="document-reference-block" data-client-id={props.nodeKey}>
      <strong>Document unavailable</strong>
      <span>{reference()?.title ?? reference()?.source.filename ?? documentId()}</span>
      <small>{issue()?.message ?? "The referenced Document has not been loaded."}</small>
      <div class="workspace-document-reference__actions">
        <button type="button" disabled={busy() || !reference()} onClick={() => void resolve()}>{busy() ? "Loading…" : "Retry"}</button>
        <button type="button" disabled={busy()} onClick={relink}>Relink…</button>
        <button type="button" disabled={busy()} onClick={removeWindow}>Remove window</button>
      </div>
    </div>
  );
}
