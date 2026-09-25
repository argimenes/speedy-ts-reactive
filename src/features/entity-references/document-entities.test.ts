import { entityTestApi, entityTestList, registerEntityTestViews } from "./test-support";
import { afterEach, describe, expect, it } from "vitest";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { collectDocumentEntities } from "./document-entities";

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach(dispose => dispose()));

describe("document entity inventory", () => {
  it("counts linked segments once, ordinary properties separately and excludes nested Documents", () => {
    const editor = new ReactiveEditor({
      type: "document-block",
      linkedAnnotations: { shared: { id: "shared", type: "codex/entity-reference", value: "blake", metadata: { entityName: "Vernon Blake" } } },
      children: [
        { id: "a", type: "standoff-editor-block", text: "Vernon", standoffProperties: [
          { id: "a-linked", annotationId: "shared", type: "codex/entity-reference", start: 0, end: 5 },
          { id: "a-local", type: "codex/entity-reference", value: "blake", metadata: { entityName: "Vernon Blake" }, start: 0, end: 5 },
          { id: "deleted", type: "codex/entity-reference", value: "other", isDeleted: true, start: 0, end: 1 },
        ] },
        { id: "b", type: "standoff-editor-block", text: "Blake", standoffProperties: [{ id: "b-linked", annotationId: "shared", type: "codex/entity-reference", start: 0, end: 4 }] },
        { type: "document-block", children: [{ id: "nested", type: "standoff-editor-block", text: "Other", standoffProperties: [{ id: "nested-ref", type: "codex/entity-reference", value: "other", start: 0, end: 4 }] }] },
      ],
    });
    const view = editor.createView("entities"), node = (id: string) => Object.values(view.state.nodes).find(node => node.payload.id === id)!;
    cleanup.push(() => editor.dispose());
    const result = collectDocumentEntities(entityTestApi(editor), node("a").key);
    expect(result.rows).toEqual([expect.objectContaining({ id: "blake", fallbackName: "Vernon Blake", documentMentions: 2 })]);
    expect(result.rows[0].ranges).toHaveLength(3);
    expect(result.rows[0].ranges.map(range => range.nodeKey)).toEqual([node("a").key, node("a").key, node("b").key]);
  });

  it("does not inflate counts for transcluded occurrences but previews both", () => {
    const editor = new ReactiveEditor({ type: "document-block", children: [{ id: "page", type: "page-block", children: [{ id: "a", type: "standoff-editor-block", text: "Entity", standoffProperties: [{ id: "ref", type: "codex/entity-reference", value: "entity", start: 0, end: 5 }] }] }] });
    const view = editor.createView("entities-repeat"), node = (id: string) => Object.values(view.state.nodes).find(node => node.payload.id === id)!;
    editor.commands.transclude(node("a").key, { kind: "at", parentKey: node("page").key, index: 1 }); cleanup.push(() => editor.dispose());
    const result = collectDocumentEntities(entityTestApi(editor), node("a").key);
    expect(result.rows[0].documentMentions).toBe(1); expect(result.rows[0].ranges).toHaveLength(2);
    expect(new Set(result.rows[0].ranges.map(range => range.nodeKey)).size).toBe(2);
  });
});
