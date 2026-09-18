// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { decodeDocument } from "../block-tree/codecs";
import { CanonicalRepository } from "../block-tree/repository";
import { TreeCommands } from "../block-tree/commands";
import { clone } from "../block-tree/clone";
import { DurableHistoryReader, type ReaderIO, type ReadPath } from "./durable-reader";
import { WholeDocumentCapture, encodeDurableWire, projectWholeDocument, queryDurableSubtree, compareDurableSubtrees } from "./durable-core";
import type { ResourceTransition } from "./stage-c-gates/resource";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const repository = new CanonicalRepository(decodeDocument({ id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "abc".repeat(20) }] }).state);
  const commands = new TreeCommands(repository, key => key), paragraph = Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey].payload.id === "p")!.key;
  const initial = projectWholeDocument(repository.readState(), "resource"), capture = new WholeDocumentCapture(initial, 0);
  const events: ResourceTransition[] = [], states = [initial];
  repository.subscribeHistoryChanges(source => { events.push(capture.capture(source) as ResourceTransition); states.push(projectWholeDocument(repository.readState(), "resource", events.length)); }, error => { throw error; });
  commands.replaceInlineRange(paragraph, 1, 2, "🙂"); repository.undo(); repository.redo(); repository.undo();
  commands.replaceInlineRange(paragraph, 2, 3, "Z");
  for (let i = 5; i < 13; i++) commands.replaceInlineRange(paragraph, 0, 1, String(i));
  const blobs = new Map<string, Uint8Array>(), descriptors = [0, 12].map(sequence => {
    const bytes = new TextEncoder().encode(encodeDurableWire(states[sequence])), chunks = [];
    for (let at = 0; at < bytes.length; at += 4096) { const part = bytes.slice(at, at + 4096), digest = hash(part); blobs.set(digest, part); chunks.push({ hash: digest, byteLength: part.length }); }
    return { hash: hash(bytes), byteLength: bytes.length, chunks };
  });
  const io: ReaderIO = { path: vi.fn(async sequence => { const checkpointSequence = sequence >= 12 ? 12 : 0; return { checkpoint: descriptors[checkpointSequence ? 1 : 0], checkpointSequence, records: events.slice(checkpointSequence, sequence).map(encodeDurableWire) }; }),
    chunk: vi.fn(async key => blobs.get(key)!), digest: async bytes => hash(bytes) };
  const reader = new DurableHistoryReader({ resourceId: "resource", memoirId: "memoir", segmentId: "segment", headSequence: 13, headRevisionId: events[12].commitId }, { blockId: "p" }, io);
  return { reader, io, states, events, descriptors };
}
describe("bounded persistent read acceleration", () => {
  it("matches independent canonical states for edit/undo/redo/branch and checkpoint crossings; results and cached baseline stay immutable", async () => {
    const { reader, states, events } = fixture();
    const head = queryDurableSubtree(states[13], { blockId: "p", revisionId: events[12].commitId });
    for (const sequence of [13, 0, 1, 2, 3, 4, 5, 12, 13, 0]) {
      const revisionId = sequence ? events[sequence - 1].commitId : "baseline";
      const result = await reader.select(sequence, revisionId);
      const oracle = queryDurableSubtree(states[sequence], { blockId: "p", revisionId });
      expect(result.selected).toEqual(oracle); expect(result.comparison).toEqual(compareDurableSubtrees(oracle, head));
      expect(Object.isFrozen(result.selected.fragment!.contents)).toBe(true);
      expect(reader.cacheUsage().checkpointEntries).toBe(1); expect(reader.cacheUsage().headEntries).toBe(1);
    }
    reader.clear(); expect(reader.cacheUsage()).toEqual({ checkpointEntries: 0, checkpointBytes: 0, headEntries: 0 });
  });
  it("reuses verified checkpoint and fixed head only while authoritative paths still agree", async () => {
    const { reader, io, events } = fixture();
    await reader.select(13, events[12].commitId);
    const first = await reader.select(1, events[0].commitId), calls = vi.mocked(io.chunk).mock.calls.length;
    expect(first.timing!.headHits).toBe(1);
    const next = await reader.select(2, events[1].commitId);
    expect(next.timing).toMatchObject({ checkpointHits: 1, headHits: 1, fetchedBytes: 0 });
    expect(vi.mocked(io.chunk).mock.calls.length).toBe(calls);
    const path = io.path;
    io.path = async (sequence, signal) => { if (sequence === 13) throw Error("Archive unavailable"); return path(sequence, signal); };
    await expect(reader.select(3, events[2].commitId)).rejects.toThrow("Archive unavailable");
    io.path = async (sequence, signal) => {
      const value = clone(await path(sequence, signal)) as ReadPath;
      if (sequence === 13) { const event = clone(events[12]); event.root.before = "changed-head"; value.records = [encodeDurableWire(event)]; }
      return value;
    };
    await expect(reader.select(3, events[2].commitId)).rejects.toThrow("parent");
    io.path = path;
    expect((await reader.select(3, events[2].commitId)).selected.status).toBe("available");
  });
  it("rejects corrupt bytes, descriptors and forged preimages without poisoning the cache", async () => {
    const { reader, io, events } = fixture(), original = io.chunk;
    io.chunk = async () => new Uint8Array([1, 2]);
    await expect(reader.select(0, "baseline")).rejects.toThrow("hash mismatch");
    expect(reader.cacheUsage().checkpointEntries).toBe(0); io.chunk = original;
    await reader.select(0, "baseline");
    const path = io.path;
    io.path = async (sequence, signal) => {
      const value = clone(await path(sequence, signal)) as ReadPath;
      if (sequence === 1) { const event = clone(events[0]); event.root.before = "forged"; value.records = [encodeDurableWire(event)]; }
      return value;
    };
    await expect(reader.select(1, events[0].commitId)).rejects.toThrow("parent");
    expect((await reader.select(0, "baseline")).selected.status).toBe("available");
    io.path = async () => ({ checkpointSequence: 0, records: [], checkpoint: { hash: "a".repeat(64), byteLength: 1, chunks: [{ hash: "b".repeat(64), byteLength: 2 }] } });
    await expect(reader.select(0, "baseline")).rejects.toThrow("total length");
  });
  it("bounds concurrent chunk transfers to four and cancels them without publishing a partial checkpoint", async () => {
    const { reader, io } = fixture(), original = io.chunk, cancellation = new AbortController();
    let active = 0, peak = 0;
    io.chunk = async (key, signal) => {
      active++; peak = Math.max(peak, active);
      try { await new Promise(resolve => setTimeout(resolve, 10)); signal?.throwIfAborted(); return await original(key, signal); }
      finally { active--; }
    };
    const pending = reader.select(0, "baseline", cancellation.signal);
    setTimeout(() => cancellation.abort(), 5);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(peak).toBe(4); expect(active).toBe(0); expect(reader.cacheUsage().checkpointEntries).toBe(0);
    expect((await reader.select(0, "baseline")).selected.status).toBe("available");
  });
  it("decodes base64 chunk transport identically to byte transport", async () => {
    const { reader, io } = fixture(), chunk = io.chunk;
    const left = await reader.select(0, "baseline"); reader.clear();
    io.chunk = async (key, signal) => Buffer.from(await chunk(key, signal) as Uint8Array).toString("base64");
    const right = await reader.select(0, "baseline");
    expect(right.selected).toEqual(left.selected);
    expect(right.comparison.after.fragment).toEqual(left.comparison.after.fragment);
  });
});
