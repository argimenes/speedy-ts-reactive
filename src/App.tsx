import { createMemo, onCleanup, onMount } from "solid-js";
import type { ExistingBlockDto } from "./block-tree/types";
import { ReactiveEditor } from "./reactive-editor/editor";
import { ReactiveTreeView } from "./rendering/reactive-tree-view";
import { registerApplicationViews } from "./application/features";
import { OverlayLayer } from "./rendering/overlay-layer";
import { WorkspaceDemo } from "./demo/workspace-demo";
import { StandoffEffectsDemo } from "./demo/standoff-effects-demo";
import { TextSuperpositionDemo } from "./demo/text-superposition-demo";

const pilotDocument: ExistingBlockDto = {
  id: "reactive-pilot-document",
  type: "document-block",
  metadata: { name: "PlainText reactive pilot" },
  blockProperties: [],
  children: [
    {
      id: "plain-1",
      type: "plain-text-block",
      text: "Editable notes",
      metadata: { label: "Shared notes" },
      blockProperties: [],
      children: [],
      futureField: { preserved: true },
    },
    {
      id: "plain-2",
      type: "plain-text-block",
      text: "This second Block can be reordered or deleted.",
      metadata: {},
      blockProperties: [],
      children: [],
    },
    {
      id: "standoff-1",
      type: "standoff-editor-block",
      text: "Solid-rendered CellBlocks with overlapping annotations.",
      metadata: {},
      blockProperties: [],
      standoffProperties: [
        { id: "bold-1", type: "style/bold", start: 0, end: 13 },
        { id: "highlight-1", type: "style/highlighter", start: 6, end: 28 },
        { id: "underline-1", type: "style/rainbow", start: 18, end: 48 },
      ],
      children: [],
    },
  ],
};

function createPilotEditor() {
  const editor = new ReactiveEditor(pilotDocument);
  registerApplicationViews(editor);
  return editor;
}

export function PilotApp() {
  const editor = createPilotEditor();
  const primary = editor.createView();
  const linked = editor.createView();
  const encoded = createMemo(() => {
    editor.repository.state.revision;
    return JSON.stringify(editor.encodeDocument(), null, 2);
  });

  onMount(() => editor.installGateway(document));
  onCleanup(() => editor.dispose());

  const addBefore = () => {
    const anchor = primary.state.nodes[primary.state.rootKey].children[0];
    const placementKey = editor.commands.insert(
      {
        type: "plain-text-block",
        text: "A newly inserted PlainText Block",
        metadata: {},
        blockProperties: [],
        children: [],
      },
      { kind: "before", anchorKey: anchor },
    );
    const node = primary.nodeForPlacement(placementKey);
    if (node) editor.focus.request(node.key, { caret: "end", reason: "inserted" });
  };

  const moveFirstToEnd = () => {
    const children = primary.state.nodes[primary.state.rootKey].children;
    if (children.length < 2) return;
    editor.commands.move(children[0], { kind: "after", anchorKey: children.at(-1)! });
  };

  const removeFocused = () => {
    const key = editor.focus.state.focusedKey;
    if (!key || key === primary.state.rootKey || key === linked.state.rootKey) return;
    const fallback = editor.focusFallback(key);
    editor.focus.clearRemoved(key);
    editor.commands.remove(key);
    if (fallback) queueMicrotask(() => editor.focus.request(fallback, { caret: "start" }));
  };

  return (
    <main class="reactive-pilot">
      <header class="reactive-pilot__header">
        <a href={import.meta.env.BASE_URL}>Open workspace demo</a> · <a href={`${import.meta.env.BASE_URL}effects`}>Visual effects demo</a>
        <p class="reactive-pilot__eyebrow">speedy-ts reactive reconstruction</p>
        <h1>Solid-owned BlockTree reconstruction</h1>
        <p>
          Both panes project the same canonical PlainText and Standoff content. Their DOM
          mounts, focus, caret, selection, and annotation geometry remain view-local.
        </p>
      </header>

      <nav class="reactive-pilot__toolbar" aria-label="Tree commands">
        <button type="button" onClick={addBefore}>Insert before</button>
        <button type="button" onClick={moveFirstToEnd}>Move first to end</button>
        <button type="button" onClick={removeFocused}>Remove focused</button>
        <button type="button" onClick={() => editor.repository.undo()}>Undo</button>
        <button type="button" onClick={() => editor.repository.redo()}>Redo</button>
        <button type="button" onClick={() => editor.overlays.open({ ownerKey: editor.focus.state.focusedKey ?? primary.state.rootKey, viewType: "entity-search", anchor: { x: 80, y: 120 }, title: "Entity search" })}>Open overlay</button>
        <span>revision {editor.repository.state.revision}</span>
      </nav>

      <div class="reactive-pilot__views">
        <section class="reactive-pilot__pane" aria-labelledby="primary-view-heading">
          <h2 id="primary-view-heading">Primary view</h2>
          <ReactiveTreeView editor={editor} projection={primary} />
        </section>
        <section class="reactive-pilot__pane" aria-labelledby="linked-view-heading">
          <h2 id="linked-view-heading">Linked view</h2>
          <ReactiveTreeView editor={editor} projection={linked} />
        </section>
      </div>

      <details class="reactive-pilot__json">
        <summary>Legacy-compatible JSON projection</summary>
        <pre>{encoded()}</pre>
      </details>
      <OverlayLayer editor={editor} />
    </main>
  );
}

export default function App() {
  const route = window.location.pathname.replace(/\/+$/, "");
  if (route === `${import.meta.env.BASE_URL}effects`) return <StandoffEffectsDemo />;
  if (route === `${import.meta.env.BASE_URL}superposition`) return <TextSuperpositionDemo />;
  return route === `${import.meta.env.BASE_URL}pilot` ? <PilotApp /> : <WorkspaceDemo />;
}
