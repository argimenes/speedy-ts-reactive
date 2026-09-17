import { describe, expect, it } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import { BlockClipboardService } from "./block-clipboard";
import type { DeepReadonly, RepositoryCommitResult } from "../block-tree/commit-capture";
import { applyCapturedCommitForTest } from "../block-tree/test-support/captured-replay";

function setup(id: string | undefined = "source") {
  const editor = new ReactiveEditor({ id: "doc", type: "document-block", children: [
    { id, type: "standoff-editor-block", text: "copy me" },
    { id: "target", type: "standoff-editor-block", text: "target" },
  ] });
  const view = editor.createView("clipboard-test");
  const children = () => view.node(view.state.rootKey)!.children.map(key => view.node(key)!);
  const source = children()[0], target = children()[1];
  const baseline = editor.repository.snapshot();
  const events: DeepReadonly<RepositoryCommitResult>[] = [], errors: unknown[] = [];
  editor.repository.subscribeCommits(event => events.push(event), error => errors.push(error));
  const clipboard = new BlockClipboardService(editor);
  const select = (key: string) => editor.blockSelection.replaceKeys([key]);
  return { editor, view, source, target, baseline, children, events, errors, clipboard, select };
}

describe("Block clipboard capture and identity", () => {
  it("correlates cut/paste, preserves eligible IDs with new keys, and makes repeated paste a copy", async () => {
    const s = setup(); s.select(s.source.key); s.clipboard.remove(true);
    const cut = s.events[0].commands[0];
    expect(cut.clipboard).toMatchObject({ action: "cut", token: expect.any(String) });
    s.clipboard.paste();
    const pasted = s.children()[0], paste = s.events[1].commands[0];
    expect(pasted.payload.id).toBe("source");
    expect(pasted.contentKey).not.toBe(s.source.contentKey);
    expect(pasted.placementKey).not.toBe(s.source.placementKey);
    expect(paste.clipboard).toEqual({ token: cut.clipboard!.token, action: "paste", preservedIds: true });
    expect(paste.relation).toBeUndefined();
    s.clipboard.paste();
    const again = s.children()[1], copy = s.events[2].commands[0];
    expect(again.payload.id).toBeTruthy(); expect(again.payload.id).not.toBe("source");
    expect(copy.clipboard).toEqual({ token: cut.clipboard!.token, action: "paste", preservedIds: false });
    expect(copy.relation).toMatchObject({ kind: "copy", pairs: [{ source: { blockId: "source" }, copy: { blockId: again.payload.id } }] });
    s.editor.repository.undo(); expect(s.children()).toHaveLength(2);
    s.editor.repository.undo(); expect(s.children()).toHaveLength(1);
    s.editor.repository.undo(); expect(s.children()[0].contentKey).toBe(s.source.contentKey);
    expect(s.events.reduce(applyCapturedCommitForTest, s.baseline)).toEqual(s.editor.repository.snapshot());
    expect(s.errors).toEqual([]);
    await Promise.resolve(); s.editor.dispose();
  });

  it("copies after cut was undone rather than colliding with the restored original", async () => {
    const s = setup(); s.select(s.source.key); s.clipboard.remove(true);
    s.editor.repository.undo(); s.select(s.target.key); s.clipboard.paste();
    expect(s.children()[0].payload.id).toBe("source");
    expect(s.children()[2].payload.id).not.toBe("source");
    expect(s.events.at(-1)!.commands[0].clipboard?.preservedIds).toBe(false);
    expect(s.events.at(-1)!.commands[0].relation?.kind).toBe("copy");
    expect(s.events.reduce(applyCapturedCommitForTest, s.baseline)).toEqual(s.editor.repository.snapshot());
    await Promise.resolve(); s.editor.dispose();
  });

  it("assigns a fresh ID when the cut legacy source had none, and ordinary copy never preserves IDs", async () => {
    const s = setup(""); s.select(s.source.key); s.clipboard.remove(true); s.clipboard.paste();
    const pasted = s.children()[0];
    expect(pasted.payload.id).toBeTruthy();
    expect(s.events.at(-1)!.commands[0].clipboard?.preservedIds).toBe(false);
    s.select(pasted.key); s.clipboard.copy(); s.select(s.target.key); s.clipboard.paste();
    expect(s.children()[2].payload.id).not.toBe(pasted.payload.id);
    expect(s.events.at(-1)!.commands[0].relation?.kind).toBe("copy");
    expect(s.errors).toEqual([]);
    await Promise.resolve(); s.editor.dispose();
  });
});
