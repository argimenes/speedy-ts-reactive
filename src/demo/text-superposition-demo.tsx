import { createSignal, onCleanup, onMount } from "solid-js";
import type { ExistingBlockDto } from "../block-tree/types";
import { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import { registerCoreViews } from "../rendering/register-core-views";
import { DocumentStyleBar } from "../rendering/document-style-bar";
import type { Toolset } from "../rendering/compact-toolbar";
import "./text-superposition-demo.css";

const source = "We are afraid of this, although the sentence can continue normally after the projected reading.";
const start = source.indexOf("afraid");
const relation = "superposition:demo-afraid";

export const textSuperpositionDemoDocument: ExistingBlockDto = {
  id: "text-superposition-demo",
  type: "document-block",
  children: [
    {
      id: "superposition-source",
      type: "standoff-editor-block",
      text: source,
      standoffProperties: [{
        id: "demo-afraid", type: "text/superposition", start, end: start + "afraid".length - 1,
        alternatives: [relation], active: relation, visible: true,
      }],
      relation: {
        [relation]: {
          id: "superposition-alternative", type: "standoff-editor-block", text: "frightened beyond reason",
          standoffProperties: [{ id: "alternative-emphasis", type: "style/italics", start: 0, end: 9 }],
          children: [],
        },
      },
      children: [],
    },
    {
      id: "superposition-create-here", type: "standoff-editor-block",
      text: "Select a phrase in this paragraph, then use Add alternative in the Annotations toolset.",
      standoffProperties: [], children: [],
    },
  ],
};

export function TextSuperpositionDemo() {
  const editor = new ReactiveEditor(textSuperpositionDemoDocument, { features: { textSuperposition: true } });
  registerCoreViews(editor);
  const projection = editor.createView("text-superposition-demo");
  const [toolset, setToolset] = createSignal<Toolset>("Annotations");
  const [notice, setNotice] = createSignal("");
  let disposeGateway: (() => void) | undefined;
  onMount(() => { disposeGateway = editor.installGateway(document); });
  onCleanup(() => { disposeGateway?.(); editor.dispose(); });

  return <main class="text-superposition-demo">
    <header>
      <nav><a href={import.meta.env.BASE_URL}>Workspace</a> · <a href={`${import.meta.env.BASE_URL}effects`}>Visual effects</a></nav>
      <p class="text-superposition-demo__eyebrow">Experimental writing tool</p>
      <h1>Text superposition</h1>
      <p>The first sentence projects a styled alternative TextBlock while retaining <em>afraid</em> in canonical parent text. Edit the blue alternative panel directly, switch readings independently, or hide its annotation UI.</p>
      <p><kbd>Ctrl</kbd>+<kbd>;</kbd>, <kbd>A</kbd> switches the reading. <kbd>Ctrl</kbd>+<kbd>;</kbd>, <kbd>V</kbd> toggles the editor.</p>
    </header>
    <section class="text-superposition-demo__document">
      <DocumentStyleBar editor={editor} scopeKey={projection.state.rootKey} toolset={toolset()} onToolset={setToolset} onNotice={setNotice} />
      {notice() && <p class="text-superposition-demo__notice" role="status">{notice()}</p>}
      <ReactiveTreeView editor={editor} projection={projection} />
    </section>
  </main>;
}
