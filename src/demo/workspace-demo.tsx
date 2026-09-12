import { ErrorBoundary, For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import { createWorkspaceDemoEditor, createWorkspaceEditor, demoSourceCounts } from "./workspace-demo-model";
import { workspaceBuilderTypes } from "./workspace-document";
import type { ExistingBlockDto } from "../block-tree/types";
import type { DocumentLocation } from "../reactive-editor/persistence";
import { DocumentBrowser } from "./document-browser";
import { DocumentDialog } from "./document-dialog";
import { createWorkspaceDocuments } from "./workspace-documents";
import { ReactiveEditor as BackgroundEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "../rendering/register-core-views";
import "./workspace-demo.css";
import { DocumentStyleBar } from "../rendering/document-style-bar";


function DemoSession(props: { onEditor: (editor: ReactiveEditor) => () => void; onBackground: (event: MouseEvent) => void; onReset: () => void; document?: ExistingBlockDto; location?: DocumentLocation; closed?: boolean; onClose: (document?: ExistingBlockDto, location?: DocumentLocation) => void; onOpen: (document: ExistingBlockDto, location: DocumentLocation) => void }) {
  const editor = props.document ? createWorkspaceEditor(props.document) : createWorkspaceDemoEditor();
  const projection = editor.createView("workspace-demo");
  const documents = createWorkspaceDocuments(editor, props);
  const releaseEditor = props.onEditor(editor);
  const glass = () => ((projection.state.nodes[projection.state.rootKey].payload.blockProperties ?? []) as Array<{ type?: string }>).some(property => property.type === "block/theme/glass");
  const headerMenu = (event: MouseEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (!editor.overlays.overlays.some(overlay => overlay.viewType === "context-menu")) editor.overlays.open({ viewType: "context-menu", ownerKey: projection.state.rootKey, anchor: { x: event.clientX, y: event.clientY } });
  };
  const hasDocumentTabs = () => projection.state.nodes[projection.state.rootKey].children.some((key) => projection.state.nodes[key]?.viewType === "document-tab-row-block");
  const title = () => documents.location()?.filename ?? "Workspace sample document";
  const [loaded, setLoaded] = createSignal(false);
  const [showJson, setShowJson] = createSignal(false);
  const [windowState, setWindowState] = createSignal<"normal" | "minimized" | "maximized" | "closed">(props.closed ? "closed" : "normal");
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  let drag: { pointerId: number; x: number; y: number; originX: number; originY: number } | undefined;
  const encoded = createMemo(() => {
    editor.repository.state.revision;
    return showJson() ? JSON.stringify(editor.encodeDocument(), null, 2) : "";
  });
  const canUndo = () => { editor.repository.state.revision; return editor.repository.canUndo(); };
  const canRedo = () => { editor.repository.state.revision; return editor.repository.canRedo(); };
  onCleanup(() => { releaseEditor(); editor.dispose(); });
  onMount(() => {
    editor.installGateway(document);
    setLoaded(true);
    if (props.document && !props.closed) queueMicrotask(() => {
      const bookmark = (props.document?.metadata as { focus?: { blockId?: string; caret?: number } } | undefined)?.focus;
      const editable = Object.values(projection.state.nodes).filter((node) => {
        const mount = editor.mounts.get(node.key);
        return mount && ["native-text", "standoff"].includes(mount.inputPolicy) && !mount.root.closest('[aria-hidden="true"]');
      });
      const target = editable.find((node) => node.payload.id === bookmark?.blockId) ?? editable[0];
      if (!target) return;
      const caret = target.payload.id === bookmark?.blockId && typeof bookmark?.caret === "number" && Number.isFinite(bookmark.caret) ? Math.max(0, bookmark.caret) : 0;
      editor.focus.request(target.key, { reason: "open-document", caret: { start: caret, end: caret, direction: "none" } });
      editor.mounts.get(target.key)?.root.scrollIntoView?.({ block: "nearest" });
    });
  });

  return (
    <main class="workspace-demo" data-demo-state={loaded() ? "loaded" : "loading"}>
      <nav class="workspace-demo__toolbar" aria-label="Demo controls">
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={props.onBackground}>Background…</button>
        <button type="button" disabled={documents.busy()} onClick={() => documents.run("document.open")}>Open…</button>
        <button type="button" disabled={documents.busy()} onClick={() => documents.run("document.save")}>Save</button>
        <button type="button" disabled={documents.busy()} onClick={() => documents.run("document.saveAs")}>Save as…</button>
        <button type="button" disabled={!canUndo()} onClick={() => editor.repository.undo()}>Undo</button>
        <button type="button" disabled={!canRedo()} onClick={() => editor.repository.redo()}>Redo</button>
        <button type="button" disabled={documents.busy()} onClick={() => documents.guard("reset to the sample document", props.onReset)}>Reset demo</button>
        <Show when={windowState() === "closed"}><button type="button" onClick={() => setWindowState("normal")}>Reopen document</button></Show>
        <a href={`${import.meta.env.BASE_URL}pilot`}>Open two-pane pilot</a>
        <span>revision {editor.repository.state.revision}</span>
      </nav>

      <Show when={windowState() !== "closed"}>
        <section
          class="workspace-demo__window"
          classList={{
            "workspace-demo__window--minimized": windowState() === "minimized",
            "workspace-demo__window--maximized": windowState() === "maximized",
            "workspace-demo__window--glass": glass(),
          }}
          style={{ transform: windowState() === "normal" ? `translate(${position().x}px, ${position().y}px)` : undefined }}
        >
          <header
            class="workspace-demo__windowbar"
            onContextMenu={headerMenu}
            onClick={event => { if (event.ctrlKey) headerMenu(event); }}
            onPointerDown={(event) => {
              if (event.ctrlKey || event.button !== 0 || windowState() !== "normal" || (event.target as Element).closest("button")) return;
              drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: position().x, originY: position().y };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag || drag.pointerId !== event.pointerId) return;
              setPosition({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y });
            }}
            onPointerUp={(event) => { if (drag?.pointerId === event.pointerId) drag = undefined; }}
          >
            <span class="workspace-demo__window-title" title={documents.location() ? `${documents.location()!.folder}/${title()}` : title()}>{title()}<span class="workspace-demo__save-state" role="status" data-save-state={documents.busy() ? "saving" : documents.dirty() ? "unsaved" : "saved"}> · {documents.busy() ? "Working…" : documents.dirty() ? "Unsaved changes" : documents.location() ? "Saved" : "Sample"}</span></span>
            <span class="workspace-demo__window-controls">
              <button type="button" aria-label="Minimize document window" onClick={() => setWindowState((value) => value === "minimized" ? "normal" : "minimized")}>−</button>
              <button type="button" aria-label="Maximize document window" onClick={() => setWindowState((value) => value === "maximized" ? "normal" : "maximized")}>□</button>
              <button type="button" aria-label="Close document window" disabled={documents.busy()} onClick={() => documents.guard("close the document window", () => props.onClose(editor.persistence.savedDocument ?? props.document, documents.location()))}>×</button>
            </span>
          </header>
          <Show when={windowState() !== "minimized"}>
            <DocumentStyleBar editor={editor} scopeKey={projection.state.rootKey} />
            <Show when={documents.error() && !documents.browser() && !documents.pending()}><p class="workspace-demo__file-notice" role="alert">{documents.error()}</p></Show>
            <Show when={editor.persistence.state.warning}><p class="workspace-demo__file-notice" role="status">{editor.persistence.state.warning}</p></Show>
            <section class="workspace-demo__document" classList={{ "workspace-demo__document--tabbed": hasDocumentTabs(), "workspace-demo__document--flow": !hasDocumentTabs() }} aria-label={title()}>
              <ReactiveTreeView editor={editor} projection={projection} />
            </section>
          </Show>
        </section>
      </Show>

      <details class="workspace-demo__guide">
        <summary>Demo help</summary>
        <p><strong>Try it:</strong> edit a paragraph, use Enter and boundary arrows, switch
          Page 1 / Page 2, open a sticky tab, drag a canvas box, or open tab C and turn
          the image card over. Open browses the document store; Save writes changes
          to the current file, and Save as creates a copy. Ctrl/Cmd+O opens,
          Ctrl/Cmd+S saves, and Ctrl/Cmd+Shift+S opens Save as. Control-click or
          right-click a Block for its menu; Shift+F10 works from a focused Block.
          Control-click the desktop or choose Background… to switch backgrounds.</p>
        <Show when={!props.document}><p>{loaded() ? "Document loaded" : "Loading document…"} · {demoSourceCounts.blocks} Blocks · {demoSourceCounts.types} document types</p></Show>
      </details>
      <details class="workspace-demo__coverage">
        <summary>Block coverage: {workspaceBuilderTypes.length} / {workspaceBuilderTypes.length} source builders registered</summary>
        <p>All builders referenced by the original workspace resolve to a view. Some use
          structural previews; registration does not mean their complete handler catalog
          is implemented. The Universe context is registered separately.</p>
        <ul><For each={workspaceBuilderTypes}>{(type) => <li>{type}</li>}</For></ul>
      </details>
      <details class="workspace-demo__json" onToggle={(event) => setShowJson(event.currentTarget.open)}>
        <summary>Inspect the current document JSON</summary>
        <Show when={showJson()}><pre>{encoded()}</pre></Show>
      </details>
      <Show when={documents.browser()}>{(mode) => <DocumentBrowser mode={mode()} initialLocation={documents.location()} busy={documents.busy()} error={documents.error()} conflict={documents.conflict()} onChoose={documents.choose} onClose={documents.closeBrowser} />}</Show>
      <Show when={documents.pending()}>{(next) => <DocumentDialog title="Save your changes?" compact busy={documents.busy()} onClose={documents.cancelPending}>
        <p class="document-dialog__body">Save changes to “{title()}” before you {next().label}?</p>
        <Show when={documents.error()}><p class="document-dialog__error" role="alert">{documents.error()}</p></Show>
        <div class="document-dialog__footer">
          <button type="button" disabled={documents.busy()} onClick={documents.cancelPending}>Cancel</button>
          <button type="button" disabled={documents.busy()} onClick={documents.discardPending}>Discard changes</button>
          <button type="button" class="document-dialog__primary" disabled={documents.busy()} onClick={documents.savePending}>Save changes</button>
        </div>
      </DocumentDialog>}</Show>
    </main>
  );
}

export function WorkspaceDemo() {
  const [session, setSession] = createSignal<{ document?: ExistingBlockDto; location?: DocumentLocation; closed?: boolean }>({});
  const background = new BackgroundEditor({ id: "workspace-background", type: "image-background-block", metadata: { url: "/image-backgrounds/green-aurora.jpg" }, children: [] });
  registerCoreViews(background);
  const backgroundView = background.createView("workspace-background");
  let activeEditor: ReactiveEditor | undefined;
  for (const id of ["document.open", "document.save", "document.saveAs"]) background.commandRegistry.register({ id, label: id,
    canExecute: () => !!activeEditor?.commandRegistry.canExecute(id, { targetKey: activeEditor.projections.values().next().value!.state.rootKey, args: undefined }),
    execute: () => activeEditor?.commandRegistry.execute(id, { targetKey: activeEditor.projections.values().next().value!.state.rootKey, args: undefined }),
  });
  onMount(() => background.installGateway(document));
  onCleanup(() => background.dispose());
  const openBackground = (event: MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!background.overlays.overlays.some(overlay => overlay.viewType === "context-menu")) background.overlays.open({ viewType: "context-menu", ownerKey: backgroundView.state.rootKey, anchor: { x: rect.left, y: rect.bottom + 4 } });
  };
  return (
    <ErrorBoundary fallback={(error, reset) => (
      <main class="workspace-demo" data-demo-state="error">
        <h1>The demo could not load.</h1>
        <p role="alert">{error instanceof Error ? error.message : String(error)}</p>
        <button type="button" onClick={reset}>Try again</button>
      </main>
    )}>
      <div class="workspace-stage">
        <div class="workspace-stage__background"><ReactiveTreeView editor={background} projection={backgroundView} /></div>
        <For each={[session()]}>
          {(initial) => <DemoSession {...initial} onEditor={editor => { activeEditor = editor; return () => { if (activeEditor === editor) activeEditor = undefined; }; }} onBackground={openBackground} onReset={() => setSession({})} onClose={(document, location) => setSession({ document, location, closed: true })} onOpen={(document, location) => setSession({ document, location })} />}
        </For>
      </div>
    </ErrorBoundary>
  );
}
