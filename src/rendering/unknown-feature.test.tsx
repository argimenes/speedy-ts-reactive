// @vitest-environment jsdom
import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import { unknownFeatureDocument } from "../block-tree/test-support/unknown-feature-document";
import { decodeDocument, encodeDocument } from "../block-tree/codecs";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";

describe("documents without optional feature implementations", () => {
  it("preserves unknown authored data, renders fallback children, and edits ordinary text", () => {
    const wire = structuredClone(unknownFeatureDocument);
    expect(encodeDocument(decodeDocument(wire).state)).toEqual(wire);
    const editor = new ReactiveEditor(wire);
    registerCoreViews(editor);
    const projection = editor.createView("without-features"), host = document.body.appendChild(document.createElement("div"));
    const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
    try {
      expect(editor.featureHost.list()).toEqual([]);
      expect(editor.registry.resolve("timer-block")).toBeUndefined();
      expect(editor.bindings.get("timer.create")).toBeUndefined();
      expect(host.querySelector(".reactive-unknown-block__label")?.textContent).toBe("timer-block");
      expect(host.querySelector<HTMLTextAreaElement>(".reactive-unknown-block textarea")?.value).toBe("Preserve nested data");
      const text = Object.values(projection.state.nodes).find(node => node.payload.id === "ordinary-text")!;
      editor.commands.replaceInlineRange(text.key, 0, 0, "Edited ");
      expect(editor.encodeDocument().children?.[0].text).toBe("Edited Ordinary text");
      expect(editor.encodeDocument().children?.[1]).toEqual(wire.children![1]);
      editor.repository.undo();
      // Focus bookmarks may be added on export, so compare canonical wire data.
      expect(encodeDocument(editor.repository.readState())).toEqual(wire);
      expect(editor.featureActions.list("document-actions")).toEqual([]);
    } finally { dispose(); editor.dispose(); host.remove(); }
  });
});
