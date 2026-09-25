// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerApplicationViews } from "../application/features";
import { ReactiveTreeView } from "./reactive-tree-view";
import { DocumentStyleBar } from "./document-style-bar";
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.reverse().forEach(fn => fn()); cleanup.length = 0; document.body.replaceChildren(); });
it("preserves unknown and linked authored properties without Entity References while local editing and shared annotations work", () => {
  const editor = new ReactiveEditor({ type: "document-block", linkedAnnotations: { shared: { id: "shared", type: "codex/entity-reference", value: "blake", metadata: { entityName: "Blake", future: true } } }, children: [
    { type: "standoff-editor-block", text: "Blake", standoffProperties: [{ id: "entity", annotationId: "shared", type: "codex/entity-reference", start: 0, end: 4, future: { retain: [1, 2] } }, { id: "unknown", type: "future/effect", start: 1, end: 3, opaque: "keep" }] },
  ] }, { features: { entityReferences: false } });
  registerApplicationViews(editor); const view = editor.createView("without-entities"), key = view.node(view.state.rootKey)!.children[0];
  const before = editor.encodeDocument(); const host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <><DocumentStyleBar editor={editor} /><ReactiveTreeView editor={editor} projection={view} /></>, host);
  cleanup.push(() => { dispose(); editor.dispose(); });
  expect(editor.featureHost.list()).not.toContain("entity-references"); expect(editor.effects.get("codex/entity-reference")).toBeUndefined();
  expect(editor.annotationUI.get("codex/entity-reference")).toBeUndefined(); expect(host.querySelector('[aria-label="Entity reference"]')).toBeNull();
  expect(editor.commandRegistry.owner("entity.open")).toBeUndefined(); expect(editor.bindings.list().some(b => b.id === "entity.open")).toBe(false);
  expect(editor.linkedAnnotations.resolve((view.node(key)!.payload.standoffProperties as Record<string, any>[])[0]).value).toBe("blake");
  editor.commands.replaceInlineRange(key, 5, 5, "!"); expect(editor.encodeDocument().children![0].text).toBe("Blake!"); editor.repository.undo();
  expect(editor.encodeDocument()).toEqual(before);
  const restored = new ReactiveEditor(before, { features: { entityReferences: false } }); expect(restored.encodeDocument()).toEqual(before); restored.dispose();
  editor.linkedAnnotations.createBatch([[editor.textRanges.snapshot(key, 0, 2)]], "future/reference", "future-id", {}, editor.repository.state.revision, "Annotate");
  expect(editor.encodeDocument().children![0].standoffProperties).toHaveLength(3); editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
});
