import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import { clone } from "./clone";
import { deriveLocations, validateRepository } from "./repository";
import { emptyParagraphParentFor, splitChangeFor } from "./split-plan";
import type { RepositoryOperation } from "./types";

function createSetup(capture: boolean, errors: unknown[]) {
  const editor = new ReactiveEditor({ type: "document-block", children: [
    { id: "long", type: "standoff-editor-block", text: "x".repeat(5600), standoffProperties: [
      { id: "cross", type: "style/bold", start: 2790, end: 2810 },
      { id: "left", type: "codex/entity-reference", start: 0, end: 4 },
      { id: "right", type: "style/italics", start: 2800, end: 2810 },
    ] },
    { id: "other", type: "standoff-editor-block", text: "y".repeat(100) },
  ] });
  const view = editor.createView("primary");
  if (capture) editor.repository.subscribeCommits(() => {}, error => { errors.push(error); });
  const key = view.node(view.state.rootKey)!.children[0];
  return { editor, view, key };
}

function checkLocations(editor: ReactiveEditor) {
  validateRepository(editor.repository.readState());
  for (const [key, location] of deriveLocations(editor.repository.readState())) expect(editor.repository.locationOf(key)).toEqual(location);
}

describe.each([false, true])("incremental paragraph splitting (capture=%s)", capture => {
  const errors: unknown[] = [];
  beforeEach(() => { errors.length = 0; });
  afterEach(() => { expect(errors).toEqual([]); });
  const setup = () => createSetup(capture, errors);
  it("inserts empty siblings across shared parent views without touching existing paragraphs", () => {
    const { editor, view, key } = setup();
    const second = editor.createView("secondary");
    const original = editor.encodeDocument();
    const paragraph = view.node(key)!;
    const originalCells = paragraph.inlineContent;
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    const before = editor.commands.insertEmptyStandoffSibling(key, "before");
    const after = editor.commands.insertEmptyStandoffSibling(key, "after");
    for (const projection of [view, second]) {
      expect(projection.node(projection.state.rootKey)!.children).toHaveLength(4);
      expect(projection.nodeForPlacement(before)!.inlineContent).toHaveLength(0);
      expect(projection.nodeForPlacement(after)!.payload.standoffProperties).toEqual([]);
    }
    expect(paragraph.inlineContent).toBe(originalCells);
    checkLocations(editor);
    editor.repository.undo(); editor.repository.redo(); editor.repository.undo(); editor.repository.undo();
    expect(snapshot).not.toHaveBeenCalled();
    expect(editor.encodeDocument()).toEqual(original);
    editor.dispose();
  });

  it("rejects a nonempty or detached paragraph from the empty insertion fast path", () => {
    const { editor, view, key } = setup();
    let operations: RepositoryOperation[] = [];
    const commit = vi.spyOn(editor.repository, "commit").mockImplementation((_label, ops) => { operations = clone(ops); });
    editor.commands.insertEmptyStandoffSibling(key, "after"); commit.mockRestore();
    const state = editor.repository.snapshot();
    const refs = new Map(Object.keys(state.contents).map(key => [key, editor.repository.contentReferenceCount(key)]));
    expect(emptyParagraphParentFor(state, operations, refs)).toBeDefined();
    const child = operations.find(op => op.kind === "put-content" && !state.contents[op.record.key]);
    if (child?.kind !== "put-content") throw new Error("Missing child");
    child.record.inlineContent = [state.contents[view.node(key)!.contentKey].inlineContent[0]];
    expect(emptyParagraphParentFor(state, operations, refs)).toBeUndefined();
    expect(() => editor.repository.commit("Invalid empty paragraph", operations)).toThrow();
    child.record.inlineContent = [];
    const parent = operations.find(op => op.kind === "put-content" && op.record.key === view.node(view.state.rootKey)!.contentKey);
    if (parent?.kind !== "put-content") throw new Error("Missing parent");
    parent.record.children = [...state.contents[parent.record.key].children];
    expect(emptyParagraphParentFor(state, operations, refs)).toBeUndefined();
    expect(() => editor.repository.commit("Detached empty paragraph", operations)).toThrow();
    expect(editor.repository.snapshot()).toEqual(state);
    expect(editor.repository.canUndo()).toBe(false);
    editor.dispose();
  });

  it("splits and restores annotations and Cell identities without snapshots, including redo and another split", () => {
    const { editor, view, key } = setup();
    const before = editor.encodeDocument();
    const left = view.node(key)!;
    const originalCells = [...left.inlineContent];
    const other = view.node(view.node(view.state.rootKey)!.children[1])!;
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    const rightPlacement = editor.commands.splitStandoff(key, 2800);
    const right = view.nodeForPlacement(rightPlacement)!;
    expect(left.inlineContent).toHaveLength(2800);
    expect(right.inlineContent).toHaveLength(2800);
    expect(left.inlineContent[0]).toBe(originalCells[0]);
    expect(left.payload.standoffProperties).toEqual([
      { id: "cross", type: "style/bold", start: 2790, end: 2799 },
      { id: "left", type: "codex/entity-reference", start: 0, end: 4 },
    ]);
    expect(right.payload.standoffProperties).toEqual([
      { id: expect.any(String), type: "style/bold", start: 0, end: 10 },
      { id: "right", type: "style/italics", start: 0, end: 10 },
    ]);
    checkLocations(editor);
    editor.repository.undo();
    expect(left.inlineContent).toEqual(originalCells);
    expect(view.nodeForPlacement(rightPlacement)).toBeUndefined();
    checkLocations(editor);
    editor.repository.redo();
    expect(view.nodeForPlacement(rightPlacement)!.key).toBe(right.key);
    editor.commands.replaceInlineRange(rightPlacement, 5, 5, "a");
    const third = editor.commands.splitStandoff(rightPlacement, 10);
    checkLocations(editor);
    expect(view.nodeForPlacement(third)!.inlineContent).toHaveLength(2791);
    editor.repository.undo(); editor.repository.undo(); editor.repository.undo();
    expect(snapshot).not.toHaveBeenCalled();
    expect(view.node(other.key)).toBe(other);
    expect(editor.encodeDocument()).toEqual(before);
    editor.dispose();
  });

  it("updates transcluded paragraphs in multiple views without rebuilding unrelated occurrences", () => {
    const { editor, view, key } = setup();
    editor.commands.transclude(key, { kind: "at", parentKey: view.state.rootKey, index: 2 });
    const second = editor.createView("second");
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    const right = editor.commands.splitStandoff(key, 2000);
    for (const projection of [view, second]) {
      const leftNodes = Object.values(projection.state.nodes).filter(n => n.contentKey === view.node(key)!.contentKey);
      expect(leftNodes).toHaveLength(2);
      expect(leftNodes.every(n => n.inlineContent.length === 2000)).toBe(true);
      expect(projection.nodeForPlacement(right)!.inlineContent).toHaveLength(3600);
    }
    editor.repository.undo(); editor.repository.redo();
    expect(snapshot).not.toHaveBeenCalled();
    checkLocations(editor);
    editor.dispose();
  });

  it("rejects Cell theft, duplicate ownership and detached new paragraphs from the fast path", () => {
    const { editor, view, key } = setup();
    let operations: RepositoryOperation[] = [];
    const commit = vi.spyOn(editor.repository, "commit").mockImplementation((_label, ops) => { operations = clone(ops); });
    editor.commands.splitStandoff(key, 2800);
    commit.mockRestore();
    const state = editor.repository.snapshot();
    const references = new Map(Object.keys(state.contents).map(key => [key, editor.repository.contentReferenceCount(key)]));
    expect(splitChangeFor(state, operations, references)).toBeDefined();
    const bad = clone(operations);
    const newRight = bad.find(op => op.kind === "put-content" && !state.contents[op.record.key]);
    if (newRight?.kind !== "put-content") throw new Error("Missing right paragraph");
    const other = view.node(view.node(view.state.rootKey)!.children[1])!;
    newRight.record.inlineContent[0] = state.contents[other.contentKey].inlineContent[0];
    expect(splitChangeFor(state, bad, references)).toBeUndefined();
    expect(() => editor.repository.commit("Invalid split", bad)).toThrow();
    const duplicate = clone(operations);
    const duplicateRight = duplicate.find(op => op.kind === "put-content" && !state.contents[op.record.key]);
    if (duplicateRight?.kind !== "put-content") throw new Error("Missing right paragraph");
    duplicateRight.record.inlineContent.push(duplicateRight.record.inlineContent[0]);
    expect(splitChangeFor(state, duplicate, references)).toBeUndefined();
    expect(() => editor.repository.commit("Duplicate Cell", duplicate)).toThrow();
    const detached = clone(operations);
    const parent = detached.find(op => op.kind === "put-content" && op.record.key === view.node(view.state.rootKey)!.contentKey);
    if (parent?.kind !== "put-content") throw new Error("Missing parent");
    parent.record.children = [...state.contents[parent.record.key].children];
    expect(splitChangeFor(state, detached, references)).toBeUndefined();
    expect(() => editor.repository.commit("Detached paragraph", detached)).toThrow();
    expect(editor.repository.snapshot()).toEqual(state);
    expect(editor.repository.canUndo()).toBe(false);
    expect(() => editor.commands.splitStandoff(key, 2.5)).toThrow();
    editor.dispose();
  });

  it("falls back safely for inline atoms and maintains indexes for the next plain-text split", () => {
    const { editor, view, key } = setup();
    editor.commands.insertInlineImage(key, 3000, { assetId: "image", src: "/image.png", alt: "Image" });
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    const right = editor.commands.splitStandoff(key, 2800);
    expect(snapshot).toHaveBeenCalled();
    expect(view.nodeForPlacement(right)!.inlineContent.some(k => view.node(k)!.viewType === "image-cell")).toBe(true);
    checkLocations(editor);
    snapshot.mockClear();
    editor.commands.splitStandoff(key, 1000);
    expect(snapshot).not.toHaveBeenCalled();
    checkLocations(editor);
    editor.dispose();
  });
});
