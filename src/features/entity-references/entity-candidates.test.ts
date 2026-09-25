import { entityTestApi, entityTestList, registerEntityTestViews } from "./test-support";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { EntityCandidates, bindEntityCandidates } from "./entity-candidates";
import { matchSources } from "../../runtime/search-matching";
import type { ExistingBlockDto } from "../../block-tree/types";
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); });
const entity = { id: "blake",name: "Vernon Blake" };
function setup(extra?: ExistingBlockDto[], original?: Array<{ id: string; start: number; end: number }>) {
  const editor = new ReactiveEditor({ type: "document-block", children: [{ id: "page", type: "page-block", children: extra ?? [
    { id: "a",type: "standoff-editor-block",text: "he the he",relation: { leftMargin: { type: "left-margin-block",children: [{ id: "margin",type: "standoff-editor-block",text: "he" }] } } },
    { id: "b",type: "standoff-editor-block",text: "he" },
    { type: "tab-row-block",children: [{ type: "tab-block",children: [] },{ type: "tab-block",children: [{ id: "hidden",type: "standoff-editor-block",text: "he" }] }] },
  ] }] });
  const view = editor.createView("candidate-test"), node = (id: string) => Object.values(view.state.nodes).find(n => n.payload.id === id)!;
  const ranges = (original ?? [{ id: "a",start: 0,end: 2 }]).map(r => ({ nodeKey: node(r.id).key,start: r.start,end: r.end }));
  const session = new EntityCandidates(entityTestApi(editor),{ close() {}, allowDocumentInput() {}, mountWidget() { return () => {}; }, focus() {}, key: "test-overlay",ownerKey: ranges[0].nodeKey,data: { entityRevision: editor.repository.state.revision,entityRanges: ranges,entityQuery: ranges.map(r => node(original?.find(o => node(o.id).key === r.nodeKey)?.id ?? "a").inlineContent.slice(r.start,r.end).map(k => String(editor.node(k)?.payload.text ?? "")).join("")).join(" ") } },async (sources,query,options) => matchSources(sources,query,options));
  cleanup.push(() => { session.dispose(); editor.dispose(); });
  return { editor,view,node,session };
}
describe("entity mention candidates", () => {
  it("includes margins and hidden tabs, merges original, and excludes/restores independently of Find", async () => {
    const { editor,node,session } = setup(); session.enable(); await session.flush(true);
    expect(session.state.rows).toHaveLength(5); expect(session.selected()).toHaveLength(5);
    editor.decorations.attachMatches("find",session.state.result!);
    const row = session.state.rows.find(r => r.match.ranges[0].nodeKey === node("b").key)!;
    editor.decorations.exclude(`entity-references:${session.owner}`,row.match.id);
    expect(session.selected()).toHaveLength(4); expect(session.state.rows).toHaveLength(5);
    expect(editor.decorations.nodes[node("b").key].every(d => d.owner === "find")).toBe(true);
    session.undoExclusion(); expect(session.selected()).toHaveLength(5);
    session.toggleHighlights(); expect(session.selected()).toHaveLength(5);
    expect(editor.decorations.nodes[node("b").key].every(d => d.owner === "find")).toBe(true);
    session.dispose(); expect(editor.repository.canUndo()).toBe(false);
  });
  it("requires nomination and explicit commit; binds separate IDs atomically and round-trips", async () => {
    const { editor,session,node } = setup(); const before = editor.encodeDocument();
    session.enable(); await session.flush(true); expect(session.canBind()).toBe(false);
    session.nominate(entity); expect(editor.repository.canUndo()).toBe(false);
    const snapshot = vi.spyOn(editor.repository,"snapshot"), commit = vi.spyOn(editor.repository,"commit");
    // Repository before/after copies, independent of how many matches are bound.
    expect(session.bind()).toBe(5); expect(snapshot).toHaveBeenCalledTimes(2); expect(commit).toHaveBeenCalledTimes(1); expect(commit.mock.calls[0][1]).toHaveLength(4);
    const properties = ["a","b","margin","hidden"].flatMap(id => node(id).payload.standoffProperties as any[]);
    expect(new Set(properties.map(p => p.id)).size).toBe(5); expect(properties.every(p => !p.annotationId && p.value === entity.id && p.metadata.entityName === entity.name)).toBe(true);
    const saved = editor.encodeDocument(), reopened = new ReactiveEditor(saved); expect(reopened.encodeDocument()).toEqual(saved); reopened.dispose();
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before); expect(editor.repository.canUndo()).toBe(false);
    editor.repository.redo(); expect(editor.encodeDocument()).toEqual(saved);
  });
  it("does not transfer exclusions to a new query generation and never falls back on zero checked", async () => {
    const { session,editor } = setup(); session.enable(); await session.flush(true);
    session.selectNone(); session.nominate(entity); expect(session.canBind()).toBe(false); expect(() => session.bind()).toThrow();
    session.configure({ query: "the" }); await session.flush();
    expect(session.selected()).toHaveLength(0); expect(session.state.rows.some(r => r.original)).toBe(true);
    session.selectAll(); expect(session.selected()).toHaveLength(2); expect(editor.repository.canUndo()).toBe(false);
  });
  it("skips identical references, excludes conflicting overlaps, and does not change styles", async () => {
    const { session,editor } = setup([
      { id: "a",type: "standoff-editor-block",text: "he he he",standoffProperties: [
        { id: "same",type: "codex/entity-reference",start: 0,end: 1,value: "blake" },
        { id: "other",type: "codex/entity-reference",start: 3,end: 4,value: "other" },
        { id: "bold",type: "style/bold",start: 6,end: 7 },
      ] },
    ]); session.enable(); await session.flush(true); session.nominate(entity);
    expect(session.state.rows.filter(r => r.reason)).toHaveLength(2); expect(session.selected()).toHaveLength(1);
    expect(session.bind()).toBe(1); expect((editor.encodeDocument().children![0].children![0].standoffProperties as any[]).map(p => p.id).slice(0,3)).toEqual(["same","other","bold"]);
  });
  it("keeps one cross-Block original linked and other mentions independent", async () => {
    const { session,editor,node } = setup([{ id: "a",type: "standoff-editor-block",text: "Vernon" },{ id: "b",type: "standoff-editor-block",text: "Blake" },{ id: "c",type: "standoff-editor-block",text: "Vernon Blake" }],[{ id: "a",start: 0,end: 6 },{ id: "b",start: 0,end: 5 }]);
    expect(session.state.query).toBe(""); session.enable(); session.configure({ query: "Vernon Blake" }); await session.flush(true); session.nominate(entity);
    expect(session.bind()).toBe(2);
    const a = (node("a").payload.standoffProperties as any[])[0],b = (node("b").payload.standoffProperties as any[])[0],c = (node("c").payload.standoffProperties as any[])[0];
    expect(a.annotationId).toBeTruthy(); expect(a.annotationId).toBe(b.annotationId); expect(c.annotationId).toBeUndefined();
    expect(editor.linkedAnnotations.resolve(a).value).toBe(entity.id);
    editor.repository.undo(); expect(node("c").payload.standoffProperties).toBeUndefined();
  });
  it("rejects stale, failed and cancelled sets before writing", async () => {
    const { session,editor,node } = setup(); session.enable(); await session.flush(true); session.nominate(entity);
    const set = session.state.result!, targets = session.selected().map(r => r.match);
    for (const status of ["error", "cancelled"] as const) expect(() => bindEntityCandidates(entityTestApi(editor),{ ...set,status,exact: false },targets,entity)).toThrow("successful search");
    expect(editor.repository.canUndo()).toBe(false);
    editor.commands.replaceInlineRange(node("a").key,0,0,"x");
    expect(() => session.bind()).toThrow("changed"); expect(node("b").payload.standoffProperties).toBeUndefined();
  });
  it("binds reviewed mentions despite unsupported code Blocks without enabling select-all", async () => {
    const { session,editor,node } = setup([{ id: "a",type: "standoff-editor-block",text: "he he" },{ id: "code",type: "code-mirror-block",text: "he" }]);
    session.enable(); await session.flush(true); session.nominate(entity);
    expect(session.state.result?.status).toBe("partial");
    expect(session.state.result?.diagnostics.join(" ")).toContain("code-mirror-block");
    session.selectNone(); session.selectAll(); expect(session.selected()).toHaveLength(0);
    const row = session.state.rows.find(r => !r.original)!;
    session.toggle(row.key,true); expect(session.canBind()).toBe(true);
    expect(session.bind()).toBe(1);
    expect(node("a").payload.standoffProperties).toEqual([expect.objectContaining({ start: 3,end: 4,value: entity.id })]);
    expect(node("code").payload.standoffProperties).toBeUndefined();
    editor.repository.undo(); expect(node("a").payload.standoffProperties).toBeUndefined();
  });
  it("synchronizes exclusions across transclusions and writes each canonical range once", async () => {
    const { editor,node,session } = setup(); editor.commands.transclude(node("b").key,{ kind: "at",parentKey: node("page").key,index: 2 });
    session.enable(); await session.flush(true); session.nominate(entity);
    const row = session.state.rows.find(r => r.match.ranges[0].contentKey === node("b").contentKey)!;
    expect(row.occurrences).toHaveLength(2); session.toggle(row.key,false);
    for (const occurrence of row.occurrences) expect(editor.decorations.nodes[occurrence.ranges[0].nodeKey]).toHaveLength(0);
    session.undoExclusion(); expect(session.bind()).toBe(5); expect(node("b").payload.standoffProperties).toHaveLength(1);
  });
  it("excludes any same-entity overlap, including larger, smaller and linked ranges", async () => {
    const { session,editor,node,view } = setup([{ id: "a",type: "standoff-editor-block",text: "Codex editor Codex Codex",standoffProperties: [
      { id: "larger",type: "codex/entity-reference",start: 0,end: 11,value: "codex" },
      { id: "smaller",type: "codex/entity-reference",start: 14,end: 15,value: "codex" },
      { id: "linked",type: "codex/entity-reference",start: 19,end: 21,annotationId: "linked-codex" },
    ] }],[{ id: "a",start: 0,end: 5 }]);
    editor.commands.setPayloadField(view.state.rootKey,"linkedAnnotations",{ "linked-codex": { id: "linked-codex",type: "codex/entity-reference",value: "codex" } });
    session.enable(); await session.flush(true); session.nominate({ id: "codex",name: "Codex" });
    expect(session.state.rows).toHaveLength(3); expect(session.state.rows.every(r => r.reason.includes("this entity"))).toBe(true);
    session.selectAll(); expect(session.selected()).toHaveLength(0); expect(session.canBind()).toBe(false);
    expect(() => bindEntityCandidates(entityTestApi(editor),session.state.result!,session.state.rows.map(r => r.match),{ id: "codex",name: "Codex" })).toThrow("existing reference");
    expect(node("a").payload.standoffProperties).toHaveLength(3);
  });
  it("batches many Blocks without per-match snapshots and preserves all-or-nothing undo", async () => {
    const { session,editor } = setup(Array.from({ length: 100 },(_,i) => ({ id: i === 0 ? "a" : `b${i}`,type: "standoff-editor-block",text: "he he he" })));
    session.enable(); await session.flush(true); session.nominate(entity);
    const snapshot = vi.spyOn(editor.repository,"snapshot"),commit = vi.spyOn(editor.repository,"commit");
    expect(session.bind()).toBe(300); expect(commit).toHaveBeenCalledTimes(1); expect(commit.mock.calls[0][1]).toHaveLength(100); expect(snapshot).toHaveBeenCalledTimes(2);
    editor.repository.undo(); expect(editor.repository.canUndo()).toBe(false);
    expect(editor.encodeDocument().children![0].children!.every(d => !d.standoffProperties)).toBe(true);
  });
  it("treats an exact already-linked batch as a no-op and disallows grapheme-splitting originals", async () => {
    const first = setup([{ id: "a",type: "standoff-editor-block",text: "he",standoffProperties: [{ id: "old",type: "codex/entity-reference",value: entity.id,start: 0,end: 1 }] }]);
    first.session.enable(); await first.session.flush(true); first.session.nominate(entity);
    expect(bindEntityCandidates(entityTestApi(first.editor),first.session.state.result!,first.session.state.rows.map(r => r.match),entity)).toBe(0); expect(first.editor.repository.canUndo()).toBe(false);
    const second = setup([{ id: "a",type: "standoff-editor-block",text: "e\u0301" }],[{ id: "a",start: 0,end: 1 }]);
    second.session.enable(); await second.session.flush(true); second.session.nominate(entity);
    expect(second.session.selected()).toHaveLength(0); expect(second.session.canBind()).toBe(false);
  });
});
