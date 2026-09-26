import { describe, expect, it } from "vitest";
import { encodeWorkspace } from "../block-tree/codecs";
import { validateRepository } from "../block-tree/repository";
import type { ExistingBlockDto, RepositoryState } from "../block-tree/types";
import { ReactiveEditor } from "./editor";
import { materializeLocalWorkspace } from "./workspace-manifest";

const document: ExistingBlockDto = { id: "doc-block", type: "document-block", metadata: { documentId: "doc-one", future: 1 }, children: [
  { id: "paragraph", type: "standoff-editor-block", text: "Shared text", standoffProperties: [{ id: "unknown", type: "future/annotation", start: 7, end: 10 }], relation: {
    leftMargin: { id: "margin", type: "left-margin-block", children: [{ type: "plain-text-block", text: "Shared margin" }] },
  } },
] };
const workspace = (a = document, b = document): ExistingBlockDto => ({ id: "workspace", type: "workspace-block", metadata: { future: { retain: true } }, children: [
  { id: "one", type: "document-window-block", metadata: { position: { x: 12, y: 24 }, state: "minimized" }, children: [structuredClone(a)] },
  { id: "two", type: "document-window-block", metadata: { position: { x: 42, y: 54 } }, children: [structuredClone(b)] },
] });
const documents = (state: RepositoryState) => Object.values(state.placements).filter(p => state.contents[p.contentKey].viewType === "document-block");

describe("local workspace Document identity", () => {
  it("round-trips repeated Documents as distinct occurrences of one editable content tree", () => {
    const dto = workspace(), before = JSON.stringify(dto);
    const loaded = materializeLocalWorkspace(dto);
    expect(JSON.stringify(dto)).toBe(before);
    expect(documents(loaded.state).map(p => p.kind).sort()).toEqual(["owned", "reference"]);
    expect(new Set(documents(loaded.state).map(p => p.contentKey)).size).toBe(1);
    const editor = new ReactiveEditor(loaded);
    const view = editor.createView("local-test");
    const occurrences = Object.values(view.state.nodes).filter(n => n.payload.id === "paragraph");
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].key).not.toBe(occurrences[1].key);
    editor.commands.replaceInlineRange(occurrences[0].key, 0, 6, "Edited");
    expect(Object.values(view.state.nodes).filter(n => n.payload.id === "paragraph").map(n => n.inlineContent.map(key => view.state.nodes[key].payload.text).join(""))).toEqual(["Edited text", "Edited text"]);
    const encoded = editor.encodeWorkspace();
    expect(encoded.metadata).toEqual(dto.metadata);
    expect(encoded.children?.map(w => w.metadata)).toEqual(dto.children?.map(w => w.metadata));
    expect(encoded.children?.[0].children).toEqual(encoded.children?.[1].children);
    const reopened = materializeLocalWorkspace(JSON.parse(JSON.stringify(encoded)));
    expect(new Set(documents(reopened.state).map(p => p.contentKey)).size).toBe(1);
    expect(() => validateRepository(reopened.state)).not.toThrow();
    expect(encodeWorkspace(reopened.state)).toEqual(encoded);
    expect(Object.values(reopened.state.contents).filter(c => c.payload.id === "margin")).toHaveLength(1);
    expect(JSON.stringify(encoded)).toContain("future/annotation");
    editor.dispose();
  });

  it("rejects conflicting copies before returning a new workspace, including unknown fields", () => {
    for (const change of [
      (d: ExistingBlockDto) => { d.children![0].text = "Different text"; },
      (d: ExistingBlockDto) => { d.future = { conflict: true }; },
      (d: ExistingBlockDto) => { d.id = "different-authored-root"; },
    ]) {
      const other = structuredClone(document); change(other);
      const dto = workspace(document, other), before = JSON.stringify(dto);
      expect(() => materializeLocalWorkspace(dto)).toThrow("Conflicting copies of Document doc-one");
      expect(JSON.stringify(dto)).toBe(before);
    }
  });

  it("accepts object key reordering but never infers identity from equal text", () => {
    const reordered = { children: document.children, metadata: { future: 1, documentId: "doc-one" }, type: document.type, id: document.id };
    expect(new Set(documents(materializeLocalWorkspace(workspace(document, reordered)).state).map(p => p.contentKey)).size).toBe(1);
    const anonymous = { type: "document-block", children: document.children };
    expect(new Set(documents(materializeLocalWorkspace(workspace(anonymous, anonymous)).state).map(p => p.contentKey)).size).toBe(2);
    const distinct = { ...document, metadata: { documentId: "other" } };
    expect(new Set(documents(materializeLocalWorkspace(workspace(document, distinct)).state).map(p => p.contentKey)).size).toBe(2);
  });

  it("uses legacy authored Document IDs and rejects malformed identity without guessing", () => {
    const legacy = { ...document, metadata: {} };
    expect(new Set(documents(materializeLocalWorkspace(workspace(legacy, legacy)).state).map(p => p.contentKey)).size).toBe(1);
    expect(() => materializeLocalWorkspace(workspace({ ...document, metadata: { documentId: " " } }))).toThrow("nonempty string");
    expect(() => materializeLocalWorkspace({ kind: "speedy-workspace" })).toThrow("separate Document files");
    expect(() => materializeLocalWorkspace(document)).toThrow("not a self-contained");
  });
});
