// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DurableHistoryReader } from "../durable-reader";
import { queryDurableSubtree, compareDurableSubtrees } from "../durable-core";
import { DerivedMaintenance } from "./maintenance";
import { bytesOf } from "./pages";
import { encodeDurableWire } from "../durable-core";
import type { Certificate } from "./contracts";
import { SelectiveReader } from "./reader";
import { SELECTIVE_LIMITS, type BlobWriter } from "./pages";
import { captureFixture, fixtureArchive } from "../selective-spike/fixture";
import type { HistorySelection } from "../ui-session-source";

const digest = async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function memory() {
  const data = new Map<string, Uint8Array>(); let size = 0;
  const io: BlobWriter = { digest, get: async (key, signal) => { signal?.throwIfAborted(); const value = data.get(key); if (!value) throw Error("Missing blob"); return value; },
    put: async (key, bytes) => { if (!data.has(key)) { size += bytes.length; if (size > SELECTIVE_LIMITS.buildBytes) throw Error("Build storage bound"); data.set(key, bytes); } } };
  return { io, data };
}
function fixture() {
  return captureFixture({ id: "doc", type: "document-block", linkedAnnotations: { bold: { type: "style/bold" } }, children: [
    { id: "left", type: "container-block", children: [{ id: "p", type: "standoff-editor-block", text: "ab🙂c", standoffProperties: [{ annotationId: "bold", start: 0, end: 1 }] }] },
    { id: "right", type: "container-block", children: [{ id: "q", type: "plain-text-block", text: "retained" }] },
  ] }, state => {
    const root = state.placements[state.rootPlacementKey].contentKey;
    Object.values(state.contents).find(c => c.payload.id === "q")!.definitionOwnerKey = root;
    const left = Object.values(state.contents).find(c => c.payload.id === "left")!;
    left.children.push("foreign-edge"); state.placements["foreign-edge"] = { key: "foreign-edge", contentKey: "unresolved", kind: "reference", externalReference: { kind: "block", targetId: "foreign", source: { scope: "document", resourceId: "other" }, version: { kind: "unpinned" } } };
  });
}
async function readers(f: ReturnType<typeof fixture>) {
  const { io: blobs, data } = memory(), archive = await fixtureArchive(f, blobs);
  const engine = new DerivedMaintenance(blobs), certificates = new Map<number, Certificate>(); let next = 0;
  const builder = {
    async build(sequence: number) {
      let result;
      while (next <= sequence) {
        const binding = { resourceId: "resource", memoirId: "memoir", segmentId: "segment", sequence: next, revisionId: archive.revisionId(next), pathHash: "verified-test-receipt" };
        result = next === 0 ? await engine.initialize(encodeDurableWire(f.baseline), binding, bytesOf(f.baseline).length) :
          await engine.accept(encodeDurableWire(f.events[next - 1]), binding, bytesOf(f.states[next]).length);
        certificates.set(next++, result.certificate);
      }
      return result!;
    },
    async certificate(sequence: number, revisionId: string, signal?: AbortSignal) { signal?.throwIfAborted(); const value = certificates.get(sequence); return value?.binding.revisionId === revisionId ? value : undefined; },
  };
  const fallback = vi.fn(async (sequence: number, revisionId: string, selection: HistorySelection, signal?: AbortSignal) =>
    (await new DurableHistoryReader(archive.identity, selection, archive.io).select(sequence, revisionId, signal)).selected);
  const reader = new SelectiveReader(archive.identity, { ...blobs, certificate: (...args) => builder.certificate(...args), fallback });
  return { builder, reader, fallback, archive, blobs, data };
}
describe("incremental derived maintenance", () => {
  it("equals full-reader and independent live-state oracles through sharing, moves, dependencies, retention, deletion, undo/redo, branch and checkpoint boundaries", async () => {
    const f = fixture(), p = f.key("p"), q = f.key("q");
    f.commands.replaceInlineRange(p, 1, 2, "X"); f.repository.undo(); f.repository.redo();
    f.commands.transclude(p, { kind: "at", parentKey: f.key("right"), index: 1 });
    f.commands.move(f.key("left"), { kind: "after", anchorKey: f.key("right") });
    f.commands.setPayloadField(f.key("doc"), "linkedAnnotations", { bold: { type: "style/italics" } });
    f.commands.remove(q); f.commands.deleteUnplacedDefinition(f.repository.readState().placements[q]?.contentKey ?? Object.values(f.repository.readState().contents).find(c => c.payload.id === "q")!.key);
    f.repository.undo(); f.repository.undo(); f.repository.redo(); f.repository.undo();
    f.commands.replaceInlineRange(p, 0, 1, "branch"); expect(f.repository.canRedo()).toBe(false);
    const s = await readers(f);
    const placementId = f.baseline.placements[p].placementId;
    for (let sequence = 0; sequence < f.states.length; sequence++) {
      await s.builder.build(sequence);
      const revisionId = s.archive.revisionId(sequence);
      for (const selection of [{ blockId: "p" }, { blockId: "p", placementId }, { blockId: "p", route: ["missing"] }, { blockId: "left" }, { blockId: "q" }, { blockId: "doc" }, { blockId: "unknown" }]) {
        const result = await s.reader.select(sequence, revisionId, selection);
        const full = await new DurableHistoryReader(s.archive.identity, selection, s.archive.io).select(sequence, revisionId);
        const expected = queryDurableSubtree(f.states[sequence], { ...selection, revisionId });
        expect(result.source).toBe("selective"); expect(result.result).toEqual(full.selected); expect(result.result).toEqual(expected);
        expect(compareDurableSubtrees(result.result, full.comparison.after)).toEqual(full.comparison);
        expect(Object.isFrozen(result.result)).toBe(true);
        expect(s.reader.pages.usage().bytes).toBeLessThanOrEqual(SELECTIVE_LIMITS.cacheBytes);
      }
    }
    expect(s.fallback).not.toHaveBeenCalled();
  }, 30_000);
  it("preserves paged inline order and bounded transfer concurrency, including cancellation during an actual read", async () => {
    const f = captureFixture({ id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "a🙂".repeat(1000) }] });
    const s = await readers(f); await s.builder.build(0);
    let active = 0, peak = 0; const delayed = { ...s.blobs, get: async (key: string, signal?: AbortSignal) => {
      active++; peak = Math.max(peak, active);
      try { await new Promise(resolve => setTimeout(resolve, 1)); signal?.throwIfAborted(); return await s.blobs.get(key, signal); } finally { active--; }
    } };
    const reader = new SelectiveReader(s.archive.identity, { ...delayed, certificate: (...args) => s.builder.certificate(...args), fallback: s.fallback });
    const result = await reader.select(0, "baseline", { blockId: "p" });
    expect(result.source).toBe("selective"); expect(result.result).toEqual(queryDurableSubtree(f.baseline, { blockId: "p", revisionId: "baseline" }));
    expect(peak).toBe(4); expect(active).toBe(0);
    reader.clear(); const controller = new AbortController(), cancelled = reader.select(0, "baseline", { blockId: "p" }, controller.signal);
    setTimeout(() => controller.abort(), 5); await expect(cancelled).rejects.toMatchObject({ name: "AbortError" }); expect(active).toBe(0); expect(s.fallback).not.toHaveBeenCalled();
  });
  it("reuses large paragraph records across boundary splices, undo/redo and branch edits", async () => {
    const f = captureFixture({ id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "a".repeat(25000) }] });
    const p = f.key("p");
    for (const at of [0, 511, 512, 1024, 24999, 25004]) f.commands.replaceInlineRange(p, at, at, "Z");
    f.repository.undo(); f.repository.redo();
    f.commands.replaceInlineRange(p, 511, 530, "short"); f.repository.undo();
    const s = await readers(f);
    for (let sequence = 0; sequence < f.states.length; sequence++) {
      const built = await s.builder.build(sequence);
      if (sequence) {
        expect(built.stats.mode).toBe("incremental");
        expect(built.stats.bytesWritten, `revision ${sequence}`).toBeLessThan((sequence === 9 || sequence === 10 ? 3 : 1) * 1024 * 1024);
        expect(built.stats.changedBundles).toBe(1);
      }
      const revisionId = s.archive.revisionId(sequence), result = await s.reader.select(sequence, revisionId, { blockId: "p" });
      expect(result.source).toBe("selective");
      expect(result.result).toEqual(queryDurableSubtree(f.states[sequence], { blockId: "p", revisionId }));
    }
  }, 120_000);
  it("preserves explicit cycle/occurrence states without following external references", async () => {
    const f = fixture(); f.commands.transclude(f.key("left"), { kind: "at", parentKey: f.key("left"), index: 1 });
    const s = await readers(f); await s.builder.build(1);
    for (const selection of [{ blockId: "doc" }, { blockId: "left" }, { blockId: "left", placementId: f.baseline.placements[f.key("left")].placementId }]) {
      const result = await s.reader.select(1, s.archive.revisionId(1), selection);
      expect(result.source).toBe("selective"); expect(result.result).toEqual(queryDurableSubtree(f.states[1], { ...selection, revisionId: s.archive.revisionId(1) }));
    }
  });
});
