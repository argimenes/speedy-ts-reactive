import { describe, expect, it, vi } from "vitest";
import { clone } from "../block-tree/clone";
import { decodeDocument } from "../block-tree/codecs";
import { TreeCommands } from "../block-tree/commands";
import type { CommitMetadata, DeepReadonly } from "../block-tree/commit-capture";
import type { HistoryChanges } from "../block-tree/compact-changes";
import { applyBlockIdentityNormalization, planBlockIdentityNormalization } from "../block-tree/identity";
import { CanonicalRepository } from "../block-tree/repository";
import { MemoryHistoryStore, type StoreOptions } from "./memory-store";
import { HistoryQueries } from "./query";
import { groupTimeline } from "./grouping";
import { readOnlyHistorySource } from "./source";

function setup(options: StoreOptions = {}) {
  const decoded = decodeDocument({ id: "doc", type: "document-block", children: [
    { id: "A", type: "container-block", children: [{ id: "p", type: "standoff-editor-block", text: "abc" }] },
    { id: "B", type: "container-block" }, { id: "q", type: "standoff-editor-block", text: "other" },
  ] }).state;
  const store = new MemoryHistoryStore(applyBlockIdentityNormalization(decoded, planBlockIdentityNormalization(decoded)), { schedule: () => () => {}, ...options });
  const repository = store.producer.repository, commands = new TreeCommands(repository, key => key), queries = new HistoryQueries(store);
  const key = (id: string) => Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey].payload.id === id)!.key;
  const request = (blockId: string, revisionId = store.producer.headRevisionId) => ({ segmentId: store.segmentId, blockId, revisionId });
  return { store, repository, commands, queries, key, request };
}

describe("history failure and dependency boundaries", () => {
  it("exposes only immutable history read capabilities and does not infer changes from unknown states", async () => {
    const s = setup(); const source = readOnlyHistorySource(s.store);
    expect(Object.isFrozen(source)).toBe(true);
    expect("producer" in source).toBe(false); expect("forkFrom" in source).toBe(false);
    expect(Object.isFrozen(await source.getStateAt(source.segmentId, source.baselineRevisionId))).toBe(true);
    const comparison = await s.queries.compareSubtree({ before: s.request("never-known"), after: s.request("p") });
    expect(comparison.comparable).toBe(false); expect(comparison.changes).toEqual([]);
    await expect(s.queries.getTimeline({ ...s.request("p"), segmentId: "wrong", headRevisionId: s.store.baselineRevisionId })).rejects.toThrow("segment"); s.store.dispose();
  });

  it.each(["duplicate", "out-of-order", "precondition", "version"])("reports %s capture as a gap and rejects its descendants", async mode => {
    let deliver!: (event: DeepReadonly<HistoryChanges>) => void;
    const subscribe = CanonicalRepository.prototype.subscribeHistoryChanges;
    const spy = vi.spyOn(CanonicalRepository.prototype, "subscribeHistoryChanges").mockImplementation(function(this: CanonicalRepository, listener, onError) {
      deliver = listener; return subscribe.call(this, listener, onError);
    });
    const s = setup(); spy.mockRestore();
    const events: DeepReadonly<HistoryChanges>[] = [];
    s.repository.subscribeHistoryChanges(event => events.push(event), () => {});
    s.commands.replaceInlineRange(s.key("p"), 3, 3, "a"); await s.store.flush();
    const verified = s.store.producer.verifiedHeadRevisionId;
    const malformed = clone(events[0]) as HistoryChanges;
    if (mode !== "duplicate") malformed.commitId = "injected";
    if (mode === "precondition") malformed.beforeRevision = 999;
    if (mode === "version") (malformed as { version: number }).version = 99;
    deliver(malformed);
    s.commands.replaceInlineRange(s.key("p"), 4, 4, "b");
    await s.store.flush();
    expect(s.store.producer.verifiedHeadRevisionId).toBe(verified);
    expect(s.store.diagnostics().producers[0].gap).toBeDefined();
    s.store.dispose();
  });

  it("rebuilds temporal relevance from exact revisions and falls back when derived index capacity is exhausted", async () => {
    for (const options of [{}, { maxIndexBytes: 1 }]) {
      const s = setup(options);
      s.commands.move(s.key("A"), { kind: "at", parentKey: s.key("B"), index: 0 }); const move = s.store.producer.headRevisionId;
      s.commands.replaceInlineRange(s.key("q"), 0, 0, "unrelated");
      const request = { segmentId: s.store.segmentId, blockId: "p", headRevisionId: s.store.producer.headRevisionId };
      const before = await s.queries.getTimeline(request); expect(before.entries.map(e => e.revisionId)).toEqual([move]);
      await s.store.rebuildTimelineIndex(); expect(await s.queries.getTimeline(request)).toEqual(before);
      if (options.maxIndexBytes) expect(s.store.diagnostics().indexDisabled).toBe(true);
      expect(s.store.diagnostics().producers[0].gap).toBeUndefined(); s.store.dispose();
    }
  });

  it("keeps reference cycles explicit and reference-excluding timelines independent of target edits", async () => {
    const s = setup();
    s.commands.transclude(s.key("A"), { kind: "at", parentKey: s.key("B"), index: 0 });
    s.commands.transclude(s.key("B"), { kind: "at", parentKey: s.key("A"), index: 1 });
    const before = s.store.producer.headRevisionId;
    s.commands.replaceInlineRange(s.key("p"), 3, 3, "!"); const edit = s.store.producer.headRevisionId;
    const excluded = await s.queries.getTimeline({ ...s.request("B"), route: [s.repository.readState().rootPlacementKey, s.key("B")], headRevisionId: edit, afterRevisionId: before });
    expect(excluded.entries).toEqual([]);
    const included = await s.queries.getTimeline({ ...s.request("B"), placementKey: s.key("B"), route: [s.repository.readState().rootPlacementKey, s.key("B")], references: true, headRevisionId: edit, afterRevisionId: before });
    expect(included.entries.map(e => e.revisionId)).toEqual([edit]);
    const result = await s.queries.getSubtreeAt({ ...s.request("B"), route: [s.repository.readState().rootPlacementKey, s.key("B")], references: true });
    expect(JSON.stringify(result.fragment?.tree)).toContain('"cycle":true'); s.store.dispose();
  });

  it("tracks known Block-reference dependency edits without interpreting opaque IDs", async () => {
    const s = setup();
    s.commands.setPayloadField(s.key("q"), "standoffProperties", [{ type: "codex/block-reference", value: "p", start: 0, end: 1 }]);
    const before = s.store.producer.headRevisionId;
    s.commands.replaceInlineRange(s.key("p"), 3, 3, "!"); const edit = s.store.producer.headRevisionId;
    const result = await s.queries.getSubtreeAt({ ...s.request("q"), references: true });
    expect(result.fragment?.dependencyContentKeys).toHaveLength(1);
    const timeline = await s.queries.getTimeline({ ...s.request("q"), headRevisionId: edit, afterRevisionId: before, references: true });
    expect(timeline.entries.map(e => e.revisionId)).toEqual([edit]); s.store.dispose();
  });

  it("retains all members when paging grouped timelines and separates groups across omitted edits", async () => {
    const s = setup();
    s.commands.replaceInlineRange(s.key("p"), 3, 3, "a");
    s.commands.replaceInlineRange(s.key("p"), 4, 4, "b");
    s.commands.replaceInlineRange(s.key("q"), 0, 0, "unrelated");
    s.commands.replaceInlineRange(s.key("p"), 5, 5, "c");
    const request = { ...s.request("p"), headRevisionId: s.store.producer.headRevisionId, groupLimit: 1 };
    const first = await s.queries.getGroupedTimeline(request);
    expect(first.groups[0].memberRevisionIds).toHaveLength(2); expect(first.nextGroupCursor).toBeDefined();
    const second = await s.queries.getGroupedTimeline({ ...request, afterGroupId: first.nextGroupCursor });
    expect(second.groups[0].memberRevisionIds).toHaveLength(1); expect(second.nextGroupCursor).toBeUndefined(); s.store.dispose();
  });

  it("accepts descriptive hints without changing commits and ignores malformed hint members", async () => {
    const s = setup(); const state = s.repository.readState(), content = clone(state.contents[state.placements[s.key("p")].contentKey]);
    s.repository.commit("paste description", [{ kind: "put-content", record: { ...content, payload: { ...content.payload, extra: true } } }], true, {
      inputIntent: { kind: "paste", boundaryBefore: "relocation", unsupported: () => {} },
    } as unknown as CommitMetadata);
    const head = s.store.producer.headRevisionId;
    expect((await s.store.getRevision(head))?.event.inputIntent).toEqual({ kind: "paste", boundaryBefore: "relocation" });
    expect((await groupTimeline(s.store, { segmentId: s.store.segmentId, headRevisionId: head }))[0].boundaryReason).toBe("explicit-action");
    s.repository.undo(); expect(s.repository.canRedo()).toBe(true); s.store.dispose();
  });
});
