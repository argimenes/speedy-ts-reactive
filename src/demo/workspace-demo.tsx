import { ErrorBoundary, For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import { createWorkspaceDemoEditor, createWorkspaceEditor, demoSourceCounts } from "./workspace-demo-model";
import { workspaceBuilderTypes } from "./workspace-document";
import type { ExistingBlockDto } from "../block-tree/types";
import { PersistenceService, type DocumentLocation } from "../reactive-editor/persistence";
import { DocumentBrowser } from "./document-browser";
import { DocumentDialog } from "./document-dialog";
import { createWorkspaceDocuments } from "./workspace-documents";
import { ReactiveEditor as BackgroundEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "../rendering/register-core-views";
import "./workspace-demo.css";
import { DocumentStyleBar } from "../rendering/document-style-bar";
import { WindowIcon } from "../rendering/window-icon";
import { WorkspaceBrowser } from "./workspace-browser";
import type { LoadedWorkspace } from "../reactive-editor/workspace-manifest";
import { DocumentMarginContext, type DocumentMarginEntry } from "../rendering/document-margins";
import { DocumentMarginDrawer } from "../rendering/document-margin-drawer";
import { ReactiveViewProvider } from "../reactive-editor/context";
import { createFloatingWindowResize, FloatingWindowResizeHandle } from "../rendering/floating-window-resize";

type DemoWindowState = "normal" | "minimized" | "maximized" | "closed";
interface DemoWindowSnapshot { state: DemoWindowState; position: { x: number; y: number }; size: { w: number; h: number } }
interface DemoEditorBridge {
  editor: ReactiveEditor;
  location: () => DocumentLocation | undefined;
  window: () => DemoWindowSnapshot;
}
interface WorkspaceActionResult { success: boolean; error?: string; status?: number }


function DemoSession(props: { onEditor: (bridge: DemoEditorBridge) => () => void; stickyHost: ReactiveEditor; onBackground: (event: MouseEvent) => void; onReset: () => void; onWorkspaceOpen: () => void; onWorkspaceSave: () => void; workspaceBusy: boolean; document?: ExistingBlockDto; location?: DocumentLocation; closed?: boolean; window?: Partial<DemoWindowSnapshot>; onClose: (document?: ExistingBlockDto, location?: DocumentLocation) => void; onOpen: (document: ExistingBlockDto, location: DocumentLocation) => void }) {
  const editor = props.document ? createWorkspaceEditor(props.document) : createWorkspaceDemoEditor();
  editor.stickyNotes.setHost(props.stickyHost);
  const projection = editor.createView("workspace-demo");
  const documents = createWorkspaceDocuments(editor, props);
  const glass = () => ((projection.state.nodes[projection.state.rootKey].payload.blockProperties ?? []) as Array<{ type?: string }>).some(property => property.type === "block/theme/glass");
  const headerMenu = (event: MouseEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (!editor.overlays.overlays.some(overlay => overlay.viewType === "context-menu")) editor.overlays.open({ viewType: "context-menu", ownerKey: projection.state.rootKey, anchor: { x: event.clientX, y: event.clientY } });
  };
  const hasDocumentTabs = () => projection.state.nodes[projection.state.rootKey].children.some((key) => projection.state.nodes[key]?.viewType === "document-tab-row-block");
  const title = () => documents.location()?.filename ?? "Workspace sample document";
  const [loaded, setLoaded] = createSignal(false);
  const [showJson, setShowJson] = createSignal(false);
  const [windowState, setWindowState] = createSignal<DemoWindowState>(props.closed ? "closed" : props.window?.state ?? "normal");
  const [position, setPosition] = createSignal(props.window?.position ?? { x: 0, y: 0 });
  const [windowSize, setWindowSize] = createSignal<{ w: number; h: number } | undefined>(props.window?.size);
  const [marginEntries, setMarginEntries] = createSignal<DocumentMarginEntry[]>([]);
  const [marginsCollapsed, setMarginsCollapsed] = createSignal(false);
  const [marginDrawerOpen, setMarginDrawerOpen] = createSignal(false);
  let windowElement!: HTMLElement;
  let drag: { pointerId: number; x: number; y: number; originX: number; originY: number; moved: boolean } | undefined;
  let windowObserver: ResizeObserver | undefined;
  let suppressIconClick = false;
  let suppressTimer: ReturnType<typeof setTimeout> | undefined;
  const beginWindowDrag = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (event.ctrlKey || event.button !== 0 || !["normal", "minimized"].includes(windowState()) || (event.target as Element).closest("button") && windowState() !== "minimized") return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: position().x, originY: position().y, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveWindow = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.moved ||= Math.abs(event.clientX - drag.x) > 2 || Math.abs(event.clientY - drag.y) > 2;
    const next = { x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y };
    if (windowState() !== "minimized") { setPosition(next); return; }
    const current = position(), rect = windowElement.getBoundingClientRect(), width = 96, height = 92;
    setPosition({
      x: next.x + Math.max(0, 8 - (rect.left + next.x - current.x)) - Math.max(0, rect.left + next.x - current.x + width + 8 - window.innerWidth),
      y: next.y + Math.max(0, 8 - (rect.top + next.y - current.y)) - Math.max(0, rect.top + next.y - current.y + height + 8 - window.innerHeight),
    });
  };
  const finishWindowDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (windowState() === "minimized" && drag.moved) {
      suppressIconClick = true; clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => { suppressIconClick = false; suppressTimer = undefined; }, 0);
    }
    drag = undefined;
  };
  const restoreWindow = () => {
    if (suppressIconClick) { suppressIconClick = false; return; }
    setWindowState("normal");
    queueMicrotask(observeWindow);
  };
  const registerMargin = (entry: DocumentMarginEntry) => {
    setMarginEntries(current => current.some(candidate => candidate.ownerKey === entry.ownerKey && candidate.relationKey === entry.relationKey && candidate.name === entry.name) ? current : [...current, entry]);
    return () => setMarginEntries(current => current.filter(candidate => candidate.ownerKey !== entry.ownerKey || candidate.relationKey !== entry.relationKey || candidate.name !== entry.name));
  };
  const marginPresentation = { collapsed: marginsCollapsed, drawerOpen: marginDrawerOpen, register: registerMargin };
  const updateMarginState = (width: number) => {
    if (windowState() === "minimized" || width <= 0) return;
    const collapsed = width <= 730;
    if (collapsed && !marginsCollapsed()) {
      const active = document.activeElement as HTMLElement | null;
      const relation = active?.closest<HTMLElement>(".reactive-relation[data-relation-name$='Margin']");
      const focusedKey = relation && windowElement.contains(relation) ? editor.focus.state.focusedKey : undefined;
      const mount = focusedKey ? editor.mounts.get(focusedKey) : undefined;
      const native = mount?.captureSelection?.(), inline = mount?.captureInlineSelection?.();
      if (focusedKey) {
        setMarginDrawerOpen(true);
        queueMicrotask(() => {
          editor.focus.request(focusedKey, { reason: "show-collapsed-margin", ...(native ? { caret: native } : {}) });
          if (inline) queueMicrotask(() => editor.mounts.get(focusedKey)?.restoreInlineSelection?.(inline));
        });
      }
    }
    setMarginsCollapsed(collapsed);
    if (!collapsed) setMarginDrawerOpen(false);
  };
  const resizeMinimum = () => ({ w: windowElement?.querySelector(".reactive-page--minimap-left, .reactive-page--minimap-right") ? 602 : 560, h: 240 });
  const windowResize = createFloatingWindowResize({
    element: () => windowElement,
    size: () => {
      const stored = windowSize(), rect = windowElement?.getBoundingClientRect();
      return { width: stored?.w ?? rect?.width ?? props.window?.size?.w ?? 1200, height: stored?.h ?? rect?.height ?? props.window?.size?.h ?? 760 };
    },
    minimum: () => ({ width: resizeMinimum().w, height: resizeMinimum().h }),
    enabled: () => windowState() === "normal",
    onCommit: next => { setWindowSize({ w: next.width, h: next.height }); updateMarginState(next.width); },
  });
  const displayWindowSize = () => windowResize.preview() ?? (windowSize() ? { width: windowSize()!.w, height: windowSize()!.h } : undefined);
  const toggleMargins = () => {
    if (!marginsCollapsed()) return;
    const opening = !marginDrawerOpen(); setMarginDrawerOpen(opening);
    queueMicrotask(() => (opening ? windowElement.querySelector<HTMLElement>(".reactive-window__margin-drawer") : windowElement.querySelector<HTMLButtonElement>(".document-style-bar__margins"))?.focus({ preventScroll: true }));
  };
  const observeWindow = () => {
    if (!windowElement?.isConnected) return;
    if (typeof ResizeObserver !== "undefined") {
      windowObserver ??= new ResizeObserver(entries => updateMarginState(entries.at(-1)?.contentRect.width ?? windowElement.getBoundingClientRect().width));
      windowObserver.observe(windowElement);
    }
    updateMarginState(windowElement.getBoundingClientRect().width);
  };
  const releaseEditor = props.onEditor({
    editor,
    location: documents.location,
    window: () => ({ state: windowState(), position: position(), size: windowElement?.isConnected ? { w: windowElement.getBoundingClientRect().width, h: windowElement.getBoundingClientRect().height } : props.window?.size ?? { w: 1200, h: 760 } }),
  });
  for (const [id, execute] of [["workspace.open", props.onWorkspaceOpen], ["workspace.save", props.onWorkspaceSave]] as const) {
    editor.commandRegistry.register({ id, label: id, canExecute: () => !props.workspaceBusy, execute });
  }
  const encoded = createMemo(() => {
    editor.repository.state.revision;
    return showJson() ? JSON.stringify(editor.encodeDocument(), null, 2) : "";
  });
  const canUndo = () => { editor.repository.state.revision; return editor.repository.canUndo(); };
  const canRedo = () => { editor.repository.state.revision; return editor.repository.canRedo(); };
  onCleanup(() => { if (suppressTimer) clearTimeout(suppressTimer); windowObserver?.disconnect(); releaseEditor(); editor.dispose(); });
  onMount(() => {
    editor.installGateway(document);
    setLoaded(true);
    observeWindow();
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
        <button type="button" disabled={props.workspaceBusy} title={editor.bindings.label("workspace.open")} onClick={props.onWorkspaceOpen}>Open Workspace…</button>
        <button type="button" disabled={props.workspaceBusy} title={editor.bindings.label("workspace.save")} onClick={props.onWorkspaceSave}>Save Workspace…</button>
        <button type="button" title={editor.bindings.label("sticky.createFloating")} onClick={() => editor.stickyNotes.create()}>New Sticky Note</button>
        <For each={props.stickyHost.stickyNotes.closedWindows()}>{key => <button type="button" onClick={() => props.stickyHost.stickyNotes.reopen(key)}>Reopen sticky note</button>}</For>
        <button type="button" disabled={!canUndo()} onClick={() => editor.repository.undo()}>Undo</button>
        <button type="button" disabled={!canRedo()} onClick={() => editor.repository.redo()}>Redo</button>
        <button type="button" disabled={documents.busy()} onClick={() => documents.guard("reset to the sample document", props.onReset)}>Reset demo</button>
        <Show when={windowState() === "closed"}><button type="button" onClick={restoreWindow}>Reopen document</button></Show>
        <a href={`${import.meta.env.BASE_URL}pilot`}>Open two-pane pilot</a>
        <span>revision {editor.repository.state.revision}</span>
      </nav>

      <Show when={windowState() !== "closed"}>
        <section
          ref={windowElement}
          class="workspace-demo__window"
          classList={{
            "workspace-demo__window--minimized": windowState() === "minimized",
            "workspace-demo__window--maximized": windowState() === "maximized",
            "workspace-demo__window--glass": glass(),
            "workspace-demo__window--margins-collapsed": marginsCollapsed(),
          }}
          style={{ transform: windowState() !== "maximized" ? `translate(${position().x}px, ${position().y}px)` : undefined, ...(windowState() === "normal" && displayWindowSize() ? { width: `${displayWindowSize()!.width}px`, height: `${displayWindowSize()!.height}px` } : {}) }}
        >
          <Show when={windowState() === "minimized"} fallback={<>
            <header
              class="workspace-demo__windowbar"
              onContextMenu={headerMenu}
              onClick={event => { if (event.ctrlKey) headerMenu(event); }}
              onPointerDown={beginWindowDrag}
              onPointerMove={moveWindow}
              onPointerUp={finishWindowDrag}
              onPointerCancel={event => { if (drag?.pointerId === event.pointerId) drag = undefined; }}
            >
              <span class="workspace-demo__window-title" title={documents.location() ? `${documents.location()!.folder}/${title()}` : title()}>{title()}<span class="workspace-demo__save-state" role="status" data-save-state={documents.busy() ? "saving" : documents.dirty() ? "unsaved" : "saved"}> · {documents.busy() ? "Working…" : documents.dirty() ? "Unsaved changes" : documents.location() ? "Saved" : "Sample"}</span></span>
              <span class="workspace-demo__window-controls">
                <button type="button" aria-label="Minimize document window" onClick={() => setWindowState("minimized")}>−</button>
                <button type="button" aria-label="Maximize document window" onClick={() => setWindowState((value) => value === "maximized" ? "normal" : "maximized")}>□</button>
                <button type="button" aria-label="Close document window" disabled={documents.busy()} onClick={() => documents.guard("close the document window", () => props.onClose(editor.persistence.savedDocument ?? props.document, documents.location()))}>×</button>
              </span>
            </header>
            <DocumentMarginContext.Provider value={marginPresentation}>
              <DocumentStyleBar editor={editor} scopeKey={projection.state.rootKey} margins={{ collapsed: marginsCollapsed(), count: marginEntries().length, open: marginDrawerOpen(), controls: "demo-document-margin-drawer", toggle: toggleMargins }} />
              <Show when={documents.error() && !documents.browser() && !documents.pending()}><p class="workspace-demo__file-notice" role="alert">{documents.error()}</p></Show>
              <Show when={editor.persistence.state.warning}><p class="workspace-demo__file-notice" role="status">{editor.persistence.state.warning}</p></Show>
              <section class="workspace-demo__document" classList={{ "workspace-demo__document--tabbed": hasDocumentTabs(), "workspace-demo__document--flow": !hasDocumentTabs() }} aria-label={title()}>
                <ReactiveTreeView editor={editor} projection={projection} />
              </section>
              <Show when={marginsCollapsed() && marginDrawerOpen()}>
                <ReactiveViewProvider editor={editor} projection={projection}>
                  <DocumentMarginDrawer id="demo-document-margin-drawer" entries={marginEntries()} onClose={toggleMargins} onSource={key => editor.focus.request(key, { reason: "margin-source" })} />
                </ReactiveViewProvider>
              </Show>
            </DocumentMarginContext.Provider>
            <Show when={windowState() === "normal"}><FloatingWindowResizeHandle controller={windowResize} class="reactive-window__resize" label={`Resize ${title()} window`} /></Show>
          </>}>
            <WindowIcon class="workspace-demo__window-icon" title={title()} kind="document" onRestore={restoreWindow}
              onPointerDown={beginWindowDrag} onPointerMove={moveWindow} onPointerUp={finishWindowDrag}
              onPointerCancel={event => { if (drag?.pointerId === event.pointerId) drag = undefined; }} />
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

function CanonicalWorkspaceSession(props: { loaded: LoadedWorkspace; filename: string; onWorkspaceOpen: () => void; onWorkspaceSave: () => void; workspaceBusy: boolean; onEditor: (editor: ReactiveEditor) => () => void }) {
  const editor = new BackgroundEditor(props.loaded);
  registerCoreViews(editor);
  const projection = editor.createView("loaded-workspace");
  const release = props.onEditor(editor);
  for (const [id, execute] of [["workspace.open", props.onWorkspaceOpen], ["workspace.save", props.onWorkspaceSave]] as const) {
    editor.commandRegistry.register({ id, label: id, canExecute: () => !props.workspaceBusy, execute });
  }
  onMount(() => editor.installGateway(document));
  onCleanup(() => { release(); editor.dispose(); });
  const canUndo = () => { editor.repository.state.revision; return editor.repository.canUndo(); };
  const canRedo = () => { editor.repository.state.revision; return editor.repository.canRedo(); };
  return <main class="workspace-demo workspace-demo--canonical">
    <nav class="workspace-demo__toolbar" aria-label="Workspace controls">
      <button type="button" disabled={props.workspaceBusy} title={editor.bindings.label("workspace.open")} onClick={props.onWorkspaceOpen}>Open Workspace…</button>
      <button type="button" disabled={props.workspaceBusy} title={editor.bindings.label("workspace.save")} onClick={props.onWorkspaceSave}>Save Workspace</button>
      <button type="button" title={editor.bindings.label("sticky.createFloating")} onClick={() => editor.stickyNotes.create()}>New Sticky Note</button>
      <For each={editor.stickyNotes.closedWindows()}>{key => <button type="button" onClick={() => editor.stickyNotes.reopen(key)}>Reopen sticky note</button>}</For>
      <button type="button" disabled={!canUndo()} onClick={() => editor.repository.undo()}>Undo</button>
      <button type="button" disabled={!canRedo()} onClick={() => editor.repository.redo()}>Redo</button>
      <span>{props.filename} · revision {editor.repository.state.revision}</span>
    </nav>
    <Show when={editor.persistence.workspaceLoadIssues().length}><aside class="workspace-demo__workspace-notice" role="status">{editor.persistence.workspaceLoadIssues().map(issue => issue.message).join(" · ")}</aside></Show>
    <ReactiveTreeView editor={editor} projection={projection} />
  </main>;
}

export function WorkspaceDemo() {
  const [session, setSession] = createSignal<{ document?: ExistingBlockDto; location?: DocumentLocation; closed?: boolean; window?: Partial<DemoWindowSnapshot> }>({});
  const [loadedWorkspace, setLoadedWorkspace] = createSignal<LoadedWorkspace>();
  const [workspaceBrowser, setWorkspaceBrowser] = createSignal<"open" | "save">();
  const [workspaceFilename, setWorkspaceFilename] = createSignal<string>();
  const [workspaceBusy, setWorkspaceBusy] = createSignal(false);
  const [workspaceError, setWorkspaceError] = createSignal("");
  const [workspaceConflict, setWorkspaceConflict] = createSignal(false);
  const background = new BackgroundEditor({ id: "workspace-background", type: "image-background-block", metadata: { url: "/image-backgrounds/green-aurora.jpg" }, children: [] });
  registerCoreViews(background);
  const backgroundView = background.createView("workspace-background");
  let activeEditor: ReactiveEditor | undefined;
  let activeDemo: DemoEditorBridge | undefined;
  let activeWorkspaceEditor: ReactiveEditor | undefined;
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
  const openWorkspace = () => { if (!workspaceBusy()) { setWorkspaceError(""); setWorkspaceConflict(false); setWorkspaceBrowser("open"); } };
  const saveWorkspace = () => { if (!workspaceBusy()) { setWorkspaceError(""); setWorkspaceConflict(false); setWorkspaceBrowser("save"); } };
  const saveSplitWorkspace = async (filename: string, createOnly: boolean): Promise<WorkspaceActionResult> => {
    if (!activeDemo) return { success: false, error: "The current Workspace is not ready." };
    const location = activeDemo.location();
    if (!location) return { success: false, error: "Save the current Document with Save as… before saving its Workspace." };
    const document = activeDemo.editor.encodeDocument();
    const documentMetadata = (document.metadata as Record<string, unknown> | undefined) ?? {};
    const documentId = String(documentMetadata.documentId ?? document.id ?? globalThis.crypto.randomUUID());
    document.metadata = { ...documentMetadata, documentId, folder: location.folder, filename: location.filename };
    const backgroundDto = background.encodeDocument();
    const window = activeDemo.window();
    backgroundDto.children = [...(backgroundDto.children ?? []), {
      id: "workspace-document-window", type: "document-window-block",
      metadata: { title: location.filename, position: window.position, size: window.size, state: window.state, zIndex: 1 },
      children: [document],
    }];
    const temporary = new BackgroundEditor({ id: "workspace", type: "workspace-block", children: [backgroundDto] });
    try {
      const success = await temporary.persistence.saveWorkspace(filename, { createOnly });
      if (success) {
        activeDemo.editor.persistence.markCurrentRevisionSaved(document);
        background.persistence.markCurrentRevisionSaved();
      }
      return { success, error: temporary.persistence.state.error, status: temporary.persistence.state.status };
    } finally { temporary.dispose(); }
  };
  const chooseWorkspace = async (filename: string, overwrite: boolean) => {
    if (workspaceBusy()) return false;
    setWorkspaceBusy(true); setWorkspaceError(""); setWorkspaceConflict(false);
    try {
      if (workspaceBrowser() === "open") {
        const loaded = await PersistenceService.loadWorkspace(filename);
        setLoadedWorkspace(loaded); setWorkspaceFilename(filename); setWorkspaceBrowser(undefined);
        return true;
      }
      const result = activeWorkspaceEditor
        ? { success: await activeWorkspaceEditor.persistence.saveWorkspace(filename, { createOnly: !overwrite }), error: activeWorkspaceEditor.persistence.state.error, status: activeWorkspaceEditor.persistence.state.status }
        : await saveSplitWorkspace(filename, !overwrite);
      if (!result.success) {
        setWorkspaceError(result.error || "The Workspace could not be saved.");
        setWorkspaceConflict(result.status === 409);
        return false;
      }
      setWorkspaceFilename(filename); setWorkspaceBrowser(undefined); return true;
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error)); return false;
    } finally { setWorkspaceBusy(false); }
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
        <Show when={loadedWorkspace()} fallback={<>
          <div class="workspace-stage__background"><ReactiveTreeView editor={background} projection={backgroundView} /></div>
          <For each={[session()]}>
            {(initial) => <DemoSession {...initial} stickyHost={background} workspaceBusy={workspaceBusy()} onWorkspaceOpen={openWorkspace} onWorkspaceSave={saveWorkspace} onEditor={bridge => { activeDemo = bridge; activeEditor = bridge.editor; return () => { if (activeDemo === bridge) activeDemo = undefined; if (activeEditor === bridge.editor) activeEditor = undefined; }; }} onBackground={openBackground} onReset={() => setSession({})} onClose={(document, location) => setSession({ document, location, closed: true })} onOpen={(document, location) => setSession({ document, location })} />}
          </For>
        </>}>
          {loaded => <For each={[loaded()]}>{workspace => <CanonicalWorkspaceSession loaded={workspace} filename={workspaceFilename() ?? "Workspace"} workspaceBusy={workspaceBusy()} onWorkspaceOpen={openWorkspace} onWorkspaceSave={saveWorkspace} onEditor={editor => { activeWorkspaceEditor = editor; return () => { if (activeWorkspaceEditor === editor) activeWorkspaceEditor = undefined; }; }} />}</For>}
        </Show>
        <Show when={workspaceBrowser()}>{mode => <WorkspaceBrowser mode={mode()} initialFilename={workspaceFilename()} busy={workspaceBusy()} error={workspaceError()} conflict={workspaceConflict()} onChoose={chooseWorkspace} onClose={() => { if (!workspaceBusy()) { setWorkspaceBrowser(undefined); setWorkspaceError(""); } }} />}</Show>
      </div>
    </ErrorBoundary>
  );
}
