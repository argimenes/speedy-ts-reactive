import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import { DocumentCounts } from "./document-counts";
import { countText } from "./text-counts";
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); });
function setup(size = 2) {
  const editor = new ReactiveEditor({ type: "document-block", children: [
    { id: "page", type: "page-block", children: Array.from({ length: size }, (_, i) => ({ id: `p${i}`, type: "standoff-editor-block", text: "Hello world", ...(i === 0 ? { relation: { leftMargin: { id: "margin", type: "left-margin-block", children: [{ id: "note", type: "standoff-editor-block", text: "Excluded note" }] } } } : {}) })) },
    { type: "sticky-tab-block", children: [{ type: "standoff-editor-block", text: "Excluded sticky" }] },
    { id: "inactive", type: "page-block", children: [{ type: "standoff-editor-block", text: "Included page" }] },
  ] });
  const view = editor.createView("counts-test");
  const node = (id: string) => Object.values(view.state.nodes).find(n => n.payload.id === id)!;
  const count = vi.fn(async (text: string) => countText(text));
  const counts = new DocumentCounts(editor.repository, editor.repository.readState().rootPlacementKey, count);
  cleanup.push(() => { counts.dispose(); editor.dispose(); });
  return { editor, counts, count, node, root: editor.repository.readState().rootPlacementKey };
}
describe("cached text counts", () => {
  it("counts graphemes and Unicode words separately from annotation offsets", () => {
    expect(countText("Hello e\u0301 👨‍👩‍👧‍👦!")).toEqual({ words: 2, characters: 10, withoutWhitespace: 8 });
    expect(countText("你好 世界").words).toBe(2);
    expect(countText(" \n\t")).toEqual({ words: 0, characters: 3, withoutWhitespace: 0 });
  });
  it("excludes notes from totals, includes inactive pages, and counts notes individually", async () => {
    const { counts, node, root } = setup(); await counts.flush();
    expect(counts.state.totals[root].words).toBe(6);
    expect(counts.state.totals[node("page").placementKey].words).toBe(4);
    expect(counts.state.blocks[node("note").contentKey].words).toBe(2);
    expect(counts.state.pages[node("p0").placementKey]).toBe(node("page").placementKey);
  });
  it("does no counting or snapshots on keystrokes and recounts only the edited Block in a large document", async () => {
    const { editor, counts, count, node, root } = setup(300); await counts.flush(); count.mockClear();
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    editor.commands.replaceInlineRange(node("p0").key, 0, 0, "New ");
    editor.commands.replaceInlineRange(node("p0").key, 0, 0, "Another ");
    expect(count).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
    await counts.flush(); expect(count).toHaveBeenCalledTimes(1); expect(snapshot).not.toHaveBeenCalled();
    expect(counts.state.totals[root].words).toBe(604);
    editor.repository.undo(); await counts.flush(); expect(counts.state.totals[root].words).toBe(603);
    editor.repository.redo(); await counts.flush(); expect(counts.state.totals[root].words).toBe(604);
  });
  it("updates structural replacement and undo without recounting unchanged Blocks", async () => {
    const { editor, counts, count, node, root } = setup(); await counts.flush(); count.mockClear();
    editor.commands.replaceAcrossBlocks([{ placementKey: node("p0").placementKey, start: 5, end: 11 }, { placementKey: node("p1").placementKey, start: 0, end: 6 }], " ");
    await counts.flush(); expect(counts.state.totals[root].words).toBe(4); expect(count).toHaveBeenCalledTimes(1);
    editor.repository.undo(); await counts.flush(); expect(counts.state.totals[root].words).toBe(6);
  });
  it("ignores stale worker results after another edit", async () => {
    const { editor, counts, count, node, root } = setup(); await counts.flush();
    let finish!: (value: ReturnType<typeof countText>) => void;
    count.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    editor.commands.replaceInlineRange(node("p0").key, 0, 0, "Old ");
    const pending = counts.flush(); editor.commands.replaceInlineRange(node("p0").key, 0, 0, "New ");
    finish(countText("Old Hello world")); await pending; await counts.flush();
    expect(counts.state.totals[root].words).toBe(8);
  });
});
