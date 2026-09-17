import { describe, expect, it, vi } from "vitest";
import { clone } from "../block-tree/clone";
import { decodeDocument } from "../block-tree/codecs";
import { TreeCommands } from "../block-tree/commands";
import { applyBlockIdentityNormalization, planBlockIdentityNormalization } from "../block-tree/identity";
import type { ExistingBlockDto, RepositoryState } from "../block-tree/types";
import { MemoryHistoryStore, type StoreOptions, type HistorySource } from "./memory-store";
import { HistoryQueries } from "./query";
import { groupTimeline, sentenceEnds } from "./grouping";

function setup(dto: ExistingBlockDto = { id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "Hello" }] }, options: StoreOptions = {}) {
  const decoded = decodeDocument(dto).state;
  const baseline = applyBlockIdentityNormalization(decoded, planBlockIdentityNormalization(decoded));
  const store = new MemoryHistoryStore(baseline, { schedule: () => () => {}, ...options });
  const repository = store.producer.repository;
  const commands = new TreeCommands(repository, key => key);
  const placement = (id: string) => Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey].payload.id === id)!.key;
  const request = (blockId: string, revisionId = store.producer.headRevisionId) => ({ segmentId: store.segmentId, revisionId, blockId });
  return { store, repository, commands, placement, request, baseline, queries: new HistoryQueries(store) };
}

describe("finite isolated history", () => {
  it("keeps interleaved producer ancestry distinct from chronological append and sibling checkpoints", async () => {
    const s = setup(undefined, { checkpointEvery: 1 }); const a = s.store.baselineRevisionId;
    s.commands.replaceInlineRange(s.placement("p"), 5, 5, " B"); const b = s.store.producer.headRevisionId;
    const bState = s.repository.snapshot();
    const fork = await s.store.forkFrom(a), forkCommands = new TreeCommands(fork.repository, key => key);
    forkCommands.replaceInlineRange(s.placement("p"), 5, 5, " C"); const c = fork.headRevisionId;
    const cState = fork.repository.snapshot();
    s.commands.replaceInlineRange(s.placement("p"), 7, 7, " D"); const d = s.store.producer.headRevisionId;
    const dState = s.repository.snapshot();
    forkCommands.replaceInlineRange(s.placement("p"), 7, 7, " E"); const e = fork.headRevisionId;
    await s.store.flush();
    expect((await s.store.getRevision(d))?.stateParentRevisionId).toBe(b);
    expect((await s.store.getRevision(d))?.previousJournalRevisionId).toBe(c);
    expect(await s.store.ancestry(e)).toEqual([a, c, e]);
    expect(await s.store.ancestry(d)).toEqual([a, b, d]);
    for (const [id, state] of [[b, bState], [c, cState], [d, dState], [e, fork.repository.snapshot()]] as const) expect(await s.store.getStateAt(s.store.segmentId, id)).toEqual(state);
    expect(s.store.diagnostics().checkpoints).toBe(5); s.store.dispose();
  });

  it("reports queue and retained capacity gaps, retaining earlier verified states while editing continues", async () => {
    for (const options of [{ maxPending: 1 }, { maxEvents: 1 }, { maxEventBytes: 1 }]) {
      const s = setup(undefined, options);
      s.commands.replaceInlineRange(s.placement("p"), 5, 5, "a"); const first = s.store.producer.headRevisionId;
      s.commands.replaceInlineRange(s.placement("p"), 6, 6, "b"); const failed = s.store.producer.headRevisionId;
      await s.store.flush();
      expect(s.store.diagnostics().producers[0].gap).toBeDefined();
      expect((await s.queries.getSubtreeAt(s.request("p", failed))).status).toBe("incomplete");
      if (!("maxEventBytes" in options)) expect((await s.queries.getSubtreeAt(s.request("p", first))).status).toBe("available");
      const revision = s.repository.state.revision;
      s.commands.replaceInlineRange(s.placement("p"), 7, 7, "c"); expect(s.repository.state.revision).toBe(revision + 1);
      expect(await s.store.getStateAt(s.store.segmentId, s.store.baselineRevisionId)).toEqual(s.baseline);
      s.store.dispose();
      await expect(s.store.flush()).rejects.toThrow("disposed");
    }
  });

  it("rejects Workspace/multiple Document enrollment and reports a later mixed-resource commit", async () => {
    expect(() => setup({ type: "workspace-block", children: [{ type: "document-block", children: [] }] })).toThrow("one Document");
    expect(() => setup({ type: "document-block", children: [{ type: "document-block", children: [] }] })).toThrow("one Document");
    const s = setup();
    const content = clone(s.repository.readState().contents[s.repository.readState().placements[s.placement("p")].contentKey]);
    content.viewType = "document-block";
    s.repository.commit("mixed resource", [{ kind: "put-content", record: content }]);
    await s.store.flush(); expect(s.store.diagnostics().producers[0].gap?.message).toContain("one Document"); s.store.dispose();
  });

  it("distinguishes absent routes, shared content, unplaced content and branch-specific future creation", async () => {
    const s = setup({ id: "doc", type: "document-block", children: [
      { id: "A", type: "container-block" }, { id: "B", type: "container-block", children: [{ id: "p", type: "standoff-editor-block", text: "text" }] },
    ] });
    const initial = s.store.baselineRevisionId;
    const old = await s.queries.getSubtreeAt(s.request("p", initial));
    s.commands.move(s.placement("p"), { kind: "at", parentKey: s.placement("A"), index: 0 });
    const moved = s.store.producer.headRevisionId;
    expect((await s.queries.getLocationAt({ ...s.request("p"), route: old.occurrence!.route })).status).toBe("absent-occurrence");
    const reference = s.commands.transclude(s.placement("A"), { kind: "at", parentKey: s.placement("B"), index: 0 });
    const ambiguous = await s.queries.getSubtreeAt(s.request("p"));
    expect(ambiguous.status).toBe("ambiguous-occurrence");
    expect(ambiguous.candidates).toHaveLength(2);
    expect(new Set(ambiguous.candidates!.map(c => c.placementKey)).size).toBe(1);
    expect((await s.queries.getSubtreeAt({ ...s.request("p"), route: ambiguous.candidates![1].route })).status).toBe("available");
    s.commands.unlink(reference);
    expect((await s.queries.getSubtreeAt(s.request("p"))).status).toBe("available");
    const content = clone(s.repository.readState().contents[s.repository.readState().placements[s.placement("p")].contentKey]);
    const orphan = { ...content, key: "orphan", payload: { id: "orphan" }, inlineContent: [] };
    s.repository.commit("unplaced", [{ kind: "put-content", record: orphan }]);
    const creation = s.store.producer.headRevisionId;
    expect((await s.queries.getSubtreeAt(s.request("orphan"))).status).toBe("unplaced");
    expect((await s.queries.getSubtreeAt({ ...s.request("orphan", initial), branchHeadRevisionId: creation })).status).toBe("not-yet-created");
    expect((await s.queries.getSubtreeAt({ ...s.request("orphan", initial), branchHeadRevisionId: moved })).status).toBe("unknown-block");
    s.commands.remove(s.placement("p"));
    expect((await s.queries.getSubtreeAt(s.request("p"))).status).toBe("deleted");
    expect((await s.queries.getSubtreeAt(s.request("p", initial))).status).toBe("available"); s.store.dispose();
  });

  it("uses historical before/after membership and historical linked definitions for timelines", async () => {
    const s = setup({ id: "doc", type: "document-block", linkedAnnotations: { shared: { type: "codex/entity-reference", value: "one" } }, children: [
      { id: "A", type: "container-block" }, { id: "B", type: "container-block", children: [{ id: "p", type: "standoff-editor-block", text: "text", standoffProperties: [{ id: "segment", annotationId: "shared", start: 0, end: 2 }] }] },
    ] });
    s.commands.move(s.placement("p"), { kind: "at", parentKey: s.placement("A"), index: 0 }); const move = s.store.producer.headRevisionId;
    s.commands.replaceInlineRange(s.placement("p"), 4, 4, "!"); const edit = s.store.producer.headRevisionId;
    s.commands.setPayloadField(s.placement("doc"), "linkedAnnotations", { shared: { type: "codex/entity-reference", value: "two" } }); const definition = s.store.producer.headRevisionId;
    const timeline = (id: string) => s.queries.getTimeline({ segmentId: s.store.segmentId, blockId: id, headRevisionId: definition });
    expect((await timeline("B")).entries.map(e => e.revisionId)).toEqual([move]);
    expect((await timeline("A")).entries.map(e => e.revisionId)).toEqual([move, edit, definition]);
    const old = await s.queries.getSubtreeAt(s.request("p", move));
    expect(old.fragment?.linkedAnnotations.shared).toMatchObject({ value: "one" });
    const comparison = await s.queries.compareSubtree({ before: s.request("p", move), after: s.request("p", definition) });
    expect(comparison.changes.map(c => c.kind)).toContain("authored"); expect(comparison.changes.map(c => c.kind)).toContain("dependency");
    const first = await s.queries.getTimeline({ segmentId: s.store.segmentId, blockId: "A", headRevisionId: definition, limit: 1 });
    expect(first.nextCursor).toBe(move);
    expect((await s.queries.getTimeline({ segmentId: s.store.segmentId, blockId: "A", headRevisionId: definition, afterRevisionId: first.nextCursor })).entries.map(e => e.revisionId)).toEqual([edit, definition]); s.store.dispose();
  });

  it("returns immutable state/closures and display warnings without consulting the editor", async () => {
    const s = setup({ id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "text", standoffProperties: [
      { annotationId: "missing", start: 0, end: 1 }, { type: "codex/block-reference", value: "external", start: 1, end: 2 },
    ], relation: { opaque: { id: "never-a-reference" } } }] });
    s.commands.insertInlineImage(s.placement("p"), 1, { assetId: "asset", src: "https://example.invalid/image", alt: "image" });
    const head = s.store.producer.headRevisionId, live = s.repository.snapshot();
    const snapshot = vi.spyOn(s.repository, "snapshot");
    const state = await s.store.getStateAt(s.store.segmentId, head);
    expect(() => { (state as RepositoryState).revision = -1; }).toThrow();
    const result = await s.queries.getSubtreeAt(s.request("p"));
    expect(result.status).toBe("available"); expect(result.fragment?.diagnostics.map(d => d.kind)).toEqual(expect.arrayContaining(["asset", "block-reference", "linked-annotation"]));
    expect(JSON.stringify(result.fragment?.diagnostics)).not.toContain("never-a-reference");
    expect(() => { (result.fragment!.contents as Record<string, unknown>).bad = {}; }).toThrow();
    expect(snapshot).not.toHaveBeenCalled(); snapshot.mockRestore();
    expect(s.repository.snapshot()).toEqual(live); expect(s.repository.canUndo()).toBe(true);
    s.repository.undo(); expect(await s.store.getStateAt(s.store.segmentId, head)).toEqual(state); s.store.dispose();
  });
});

describe("derived sentence grouping", () => {
  it("honors captured idle/max-span boundaries and closes an open group when ancestry enters a fork", async () => {
    vi.useFakeTimers();
    try {
      const s = setup(); const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        vi.setSystemTime(Date.UTC(2026, 0, 1) + i * 500);
        s.commands.replaceInlineRange(s.placement("p"), 5 + i, 5 + i, "a"); ids.push(s.store.producer.headRevisionId);
      }
      const request = { segmentId: s.store.segmentId, headRevisionId: ids[2] };
      const span = await groupTimeline(s.store, { ...request, idleMs: 2000, maxSpanMs: 1000 });
      expect(span[0].boundaryReason).toBe("max-span"); expect(span.map(g => g.memberRevisionIds.length)).toEqual([2, 1]);
      const idle = await groupTimeline(s.store, { ...request, idleMs: 500 }); expect(idle).toHaveLength(3); expect(idle[0].boundaryReason).toBe("idle");
      const fork = await s.store.forkFrom(ids[1]);
      new TreeCommands(fork.repository, key => key).replaceInlineRange(s.placement("p"), 7, 7, "b");
      const branch = await groupTimeline(s.store, { ...request, headRevisionId: fork.headRevisionId });
      expect(branch[0].boundaryReason).toBe("branch"); expect(branch).toHaveLength(2); s.store.dispose();
    } finally { vi.useRealTimers(); }
  });

  it("preserves exact revisions and ordinary undo, causal finalized groups, and branch boundaries", async () => {
    vi.useFakeTimers();
    try {
      const s = setup({ id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "" }] });
      let now = Date.UTC(2026, 0, 1), caret = 0;
      for (const char of "Hello. ") { vi.setSystemTime(now); now += 100; s.commands.replaceInlineRange(s.placement("p"), caret, caret, char); caret++; }
      const head = s.store.producer.headRevisionId;
      const request = { segmentId: s.store.segmentId, headRevisionId: head };
      const first = await groupTimeline(s.store, request);
      expect(first).toHaveLength(1); expect(first[0].memberRevisionIds).toHaveLength(7); expect(first[0].finalized).toBe(true);
      vi.setSystemTime(now); s.commands.replaceInlineRange(s.placement("p"), caret, caret, "X");
      const second = await groupTimeline(s.store, { ...request, headRevisionId: s.store.producer.headRevisionId }); expect(second[0]).toEqual(first[0]);
      s.repository.undo();
      const undo = (await groupTimeline(s.store, { ...request, headRevisionId: s.store.producer.headRevisionId })).at(-1)!;
      expect(undo.boundaryReason).toBe("undo"); expect(undo.memberRevisionIds).toHaveLength(1);
      const fork = await s.store.forkFrom(head);
      new TreeCommands(fork.repository, key => key).replaceInlineRange(s.placement("p"), caret, caret, "Y");
      const forked = await groupTimeline(s.store, { ...request, headRevisionId: fork.headRevisionId });
      expect(forked[0].memberRevisionIds).toEqual(first[0].memberRevisionIds); expect(forked[0].groupId).not.toBe(first[0].groupId);
      for (const id of first[0].memberRevisionIds) expect((await s.store.getStateAt(s.store.segmentId, id)).revision).toBeGreaterThan(0);
      const current = s.repository.snapshot(); await groupTimeline(s.store, request); expect(s.repository.snapshot()).toEqual(current);
      const invalid = { ...request, revisionIds: [...first[0].memberRevisionIds].reverse() };
      await expect(groupTimeline(s.store, invalid)).rejects.toThrow("ordered"); s.store.dispose();
    } finally { vi.useRealTimers(); }
  });

  it("breaks omitted revisions and uses captured time, not rebuild wall clock", async () => {
    vi.useFakeTimers();
    try {
      const s = setup(); const ids: string[] = [];
      for (let i = 0; i < 3; i++) { vi.setSystemTime(Date.UTC(2026, 0, 1) + i * 100); s.commands.replaceInlineRange(s.placement("p"), 5 + i, 5 + i, "a"); ids.push(s.store.producer.headRevisionId); }
      const request = { segmentId: s.store.segmentId, headRevisionId: ids[2] };
      const groups = await groupTimeline(s.store, request); expect(groups).toHaveLength(1);
      vi.setSystemTime(Date.UTC(2030, 0, 1)); expect(await groupTimeline(s.store, request)).toEqual(groups);
      expect(await groupTimeline(s.store, { ...request, revisionIds: [ids[0], ids[2]] })).toHaveLength(2);
      expect((await groupTimeline(s.store, { ...request, asOfTimestamp: "2026-01-01T00:00:02.000Z" }))[0].finalized).toBe(true);
      const otherBranch = await s.store.forkFrom(s.store.baselineRevisionId);
      new TreeCommands(otherBranch.repository, key => key).replaceInlineRange(s.placement("p"), 5, 5, "z");
      await expect(groupTimeline(s.store, { ...request, revisionIds: [otherBranch.headRevisionId] })).rejects.toThrow("ordered"); s.store.dispose();
    } finally { vi.useRealTimers(); }
  });

  it("maps Unicode sentence boundaries to Cell offsets and keeps titles/decimals tentative", () => {
    expect(sentenceEnds("Dr. ", "en")).toEqual([]);
    expect(sentenceEnds("3.14", "en")).toEqual([]);
    expect(sentenceEnds("😀Hello. ", "en")).toContain(Array.from("😀Hello. ").length);
    expect(sentenceEnds("你好。世界。", "zh")).toContain(3);
  });
});
