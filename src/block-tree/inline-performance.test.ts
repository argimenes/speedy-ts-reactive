import { describe, expect, it, vi } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import { clone } from "./clone";
import { inlineOwnerFor } from "./inline-plan";
import { validateRepository } from "./repository";
import type { RepositoryOperation } from "./types";

function setup(paragraphs = 2) {
  const editor = new ReactiveEditor({ type: "document-block", children: Array.from({ length: paragraphs }, (_, i) => ({
    id: `p${i}`, type: "standoff-editor-block", text: "x".repeat(100),
    standoffProperties: [{ type: "style/bold", start: 40, end: 60 }],
  })) });
  const view = editor.createView("primary");
  const key = view.node(view.state.rootKey)!.children[0];
  const contentKey = view.node(key)!.contentKey;
  const text = () => view.node(key)!.inlineContent.map(cell => view.node(cell)!.payload.text).join("");
  return { editor, view, key, contentKey, text };
}

describe("incremental inline editing", () => {
  it("matches fully planned edits and annotation mapping over a deterministic Unicode edit sequence", () => {
    const fast = setup(), planned = setup();
    let seed = 7129;
    const random = (limit: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % limit; };
    for (let step = 0; step < 40; step++) {
      const length = fast.view.node(fast.key)!.inlineContent.length;
      const start = random(length + 1);
      const end = Math.min(length, start + random(5));
      const text = ["", "a", "😀", "é", "漢字"][random(5)];
      fast.editor.commands.replaceInlineRange(fast.key, start, end, text);
      planned.editor.commands.transaction("Fully planned edit", () => planned.editor.commands.replaceInlineRange(planned.key, start, end, text));
      expect(fast.editor.encodeDocument()).toEqual(planned.editor.encodeDocument());
      validateRepository(fast.editor.repository.readState());
    }
    for (let step = 0; step < 40; step++) {
      fast.editor.repository.undo(); planned.editor.repository.undo();
      expect(fast.editor.encodeDocument()).toEqual(planned.editor.encodeDocument());
    }
    for (let step = 0; step < 40; step++) {
      fast.editor.repository.redo(); planned.editor.repository.redo();
      expect(fast.editor.encodeDocument()).toEqual(planned.editor.encodeDocument());
    }
    fast.editor.dispose(); planned.editor.dispose();
  });

  it("does no whole-document snapshots or occurrence rebuilds in a 25k document, including undo/redo", () => {
    const { editor, view, key, contentKey, text } = setup(250);
    const other = view.node(view.node(view.state.rootKey)!.children[1])!;
    const original = editor.repository.readState().contents[other.contentKey];
    const retainedCell = view.node(key)!.inlineContent[51];
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    const unregister = vi.spyOn(editor.occurrences, "unregister");
    editor.commands.replaceInlineRange(key, 50, 50, "😀");
    expect(text()).toBe("x".repeat(50) + "😀" + "x".repeat(50));
    expect(view.node(key)!.payload.standoffProperties).toEqual([{ type: "style/bold", start: 40, end: 61 }]);
    expect(unregister).not.toHaveBeenCalled();
    expect(view.node(key)!.inlineContent[52]).toBe(retainedCell);
    editor.commands.replaceInlineRange(key, 50, 51, "");
    editor.repository.undo();
    editor.repository.undo();
    editor.repository.redo();
    editor.repository.redo();
    expect(text()).toBe("x".repeat(100));
    expect(view.node(key)!.payload.standoffProperties).toEqual([{ type: "style/bold", start: 40, end: 60 }]);
    expect(snapshot).not.toHaveBeenCalled();
    expect(unregister).toHaveBeenCalledTimes(3);
    expect(editor.repository.readState().contents[other.contentKey]).toBe(original);
    expect(view.node(other.key)).toBe(other);
    expect(editor.repository.state.contents[contentKey].revision).toBe(6);
    validateRepository(editor.repository.readState());
    editor.dispose();
  });

  it("updates every shared occurrence across views and rebuilds indexes after structural edits", () => {
    const { editor, view, key, contentKey } = setup();
    const reference = editor.commands.transclude(key, { kind: "at", parentKey: view.state.rootKey, index: 2 });
    const second = editor.createView("second");
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    editor.commands.replaceInlineRange(key, 0, 1, "AB");
    for (const projection of [view, second]) {
      const nodes = Object.values(projection.state.nodes).filter(node => node.contentKey === contentKey);
      expect(nodes).toHaveLength(2);
      for (const node of nodes) {
        expect(node.inlineContent.map(k => projection.node(k)!.payload.text).join("")).toBe("AB" + "x".repeat(99));
      }
    }
    expect(snapshot).not.toHaveBeenCalled();
    editor.commands.unlink(reference);
    snapshot.mockClear();
    editor.commands.replaceInlineRange(key, 0, 2, "x");
    editor.repository.undo();
    expect(snapshot).not.toHaveBeenCalled();
    validateRepository(editor.repository.readState());
    editor.dispose();
  });

  it("preserves shared leaf content when one of its placements is removed", () => {
    const { editor, view, key, contentKey } = setup();
    const state = editor.repository.readState();
    const owner = state.contents[contentKey];
    const cellPlacement = state.placements[owner.inlineContent[0]];
    editor.repository.commit("Share Cell", [
      { kind: "put-placement", record: { ...cellPlacement, key: "shared-cell" } },
      { kind: "put-content", record: { ...clone(owner), inlineContent: [...owner.inlineContent, "shared-cell"] } },
    ]);
    expect(editor.repository.contentReferenceCount(cellPlacement.contentKey)).toBe(2);
    editor.commands.replaceInlineRange(key, 0, 1, "");
    expect(editor.repository.state.contents[cellPlacement.contentKey]).toBeDefined();
    expect(editor.repository.contentReferenceCount(cellPlacement.contentKey)).toBe(1);
    editor.repository.undo();
    expect(editor.repository.contentReferenceCount(cellPlacement.contentKey)).toBe(2);
    expect(view.node(key)!.inlineContent).toHaveLength(101);
    validateRepository(editor.repository.readState());
    editor.dispose();
  });

  it("keeps snapshot events opt-in and stable, and emits text changes only for the edited owner", () => {
    const { editor, key, contentKey } = setup();
    const before = vi.fn(), after = vi.fn(), changed = vi.fn(), legacy = vi.fn();
    const stopBefore = editor.events.subscribe("beforeChange", before);
    const stopAfter = editor.events.subscribe("afterChange", after);
    editor.events.subscribe("textChanged", changed);
    const stopLegacy = editor.repository.subscribe(legacy);
    editor.commands.replaceInlineRange(key, 0, 0, "a");
    const oldState = before.mock.calls[0][0].state;
    const newState = after.mock.calls[0][0].state;
    expect(oldState.contents[contentKey].inlineContent).toHaveLength(100);
    expect(newState.contents[contentKey].inlineContent).toHaveLength(101);
    expect(legacy).toHaveBeenCalledOnce();
    stopBefore(); stopAfter(); stopLegacy();
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    editor.commands.replaceInlineRange(key, 0, 1, "");
    expect(snapshot).not.toHaveBeenCalled();
    expect(changed.mock.calls.map(call => call[0].contentKey)).toEqual([contentKey, contentKey]);
    expect(oldState.contents[contentKey].inlineContent).toHaveLength(100);
    expect(newState.contents[contentKey].inlineContent).toHaveLength(101);
    editor.dispose();
  });

  it("rejects malformed fast batches without altering state or history", () => {
    const { editor, contentKey, key } = setup();
    const state = editor.repository.snapshot();
    const owner = state.contents[contentKey];
    const references = new Map(Object.keys(state.contents).map(key => [key, editor.repository.contentReferenceCount(key)]));
    const duplicate: RepositoryOperation[] = [{ kind: "put-content", record: { ...clone(owner), inlineContent: [...owner.inlineContent, owner.inlineContent[0]] } }];
    expect(inlineOwnerFor(state, duplicate, references)).toBeUndefined();
    expect(() => editor.repository.commit("Invalid", duplicate)).toThrow();
    expect(editor.repository.snapshot()).toEqual(state);
    expect(editor.repository.canUndo()).toBe(false);
    expect(() => editor.commands.replaceInlineRange(key, 0.5, 1, "x")).toThrow();
    const foreign = Object.values(state.contents).find(c => c.key !== contentKey && c.inlineKind === "standoff")!;
    const stolen: RepositoryOperation[] = [{ kind: "put-content", record: { ...clone(owner), inlineContent: [...owner.inlineContent, foreign.inlineContent[0]] } }];
    expect(inlineOwnerFor(state, stolen, references)).toBeUndefined();
    expect(() => editor.repository.commit("Invalid", stolen)).toThrow();
    editor.dispose();
  });

  it("retains atomic multi-paragraph transactions and subsequent fast undo/redo", () => {
    const { editor, view, key } = setup();
    const second = view.node(view.state.rootKey)!.children[1];
    const changed = vi.fn();
    editor.repository.subscribeChanges(changed);
    editor.commands.transaction("Two paragraphs", () => {
      editor.commands.replaceInlineRange(key, 10, 20, "ab");
      editor.commands.replaceInlineRange(second, 0, 1, "cd");
    });
    expect(changed).toHaveBeenCalledOnce();
    editor.repository.undo();
    expect(view.node(key)!.inlineContent).toHaveLength(100);
    expect(view.node(second)!.inlineContent).toHaveLength(100);
    editor.repository.redo();
    expect(view.node(key)!.inlineContent).toHaveLength(92);
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    editor.commands.replaceInlineRange(key, 0, 1, "z");
    editor.repository.undo();
    expect(snapshot).not.toHaveBeenCalled();
    validateRepository(editor.repository.readState());
    editor.dispose();
  });
});
