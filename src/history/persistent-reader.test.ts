// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { PersistentHistoryReader } from "./persistent-reader";
import { captureFixture, fixtureArchive } from "./selective-spike/fixture";
import { DerivedMaintenance } from "./selective/maintenance";
import { bytesOf, type BlobWriter } from "./selective/pages";
import type { Certificate } from "./selective/contracts";
import { encodeDurableWire, queryDurableSubtree, compareDurableSubtrees } from "./durable-core";
async function setup(cellReference = false) {
  const data = new Map<string, Uint8Array>(), certificates = new Map<number, Certificate>();
  const io: BlobWriter = { digest: async bytes => createHash("sha256").update(bytes).digest("hex"), get: async hash => data.get(hash)!, put: async (hash, bytes) => { data.set(hash, bytes); } };
  const f = captureFixture({ id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "a".repeat(200) }, { id: "large", type: "standoff-editor-block", text: "b".repeat(2000) }] }, state => {
    if (!cellReference) return;
    const paragraph = Object.values(state.contents).find(c => c.payload.id === "p")!, large = Object.values(state.contents).find(c => c.payload.id === "large")!;
    const cell = state.contents[state.placements[paragraph.inlineContent[0]].contentKey];
    cell.children.push("cell-child"); state.placements["cell-child"] = { key: "cell-child", kind: "reference", contentKey: large.key };
  });
  f.commands.replaceInlineRange(f.key("p"), 3, 3, "X"); f.repository.undo(); f.repository.redo();
  const archive = await fixtureArchive(f, io), engine = new DerivedMaintenance(io);
  for (let n = 0; n < f.states.length; n++) {
    const binding = { resourceId: "resource", memoirId: "memoir", segmentId: "segment", sequence: n, revisionId: archive.revisionId(n), pathHash: "native-verified-receipt" };
    const value = n ? await engine.accept(encodeDurableWire(f.events[n - 1]), binding, bytesOf(f.states[n]).length) : await engine.initialize(encodeDurableWire(f.baseline), binding, bytesOf(f.baseline).length);
    certificates.set(n, value.certificate);
  }
  const path = vi.fn(archive.io.path), certificate = vi.fn(async (n: number) => certificates.get(n));
  const reader = (blockId = "p") => new PersistentHistoryReader(archive.identity, { blockId }, { ...archive.io, path }, { ...io, certificate });
  return { f, archive, data, certificates, io, path, certificate, reader };
}
it("uses certified bounded closure reads and the fixed comparison head without moving exact graphs to display", async () => {
  const s = await setup(), reader = s.reader();
  for (const n of [3, 0, 1, 2, 1]) {
    const value = await reader.select(n, s.archive.revisionId(n));
    const expected = queryDurableSubtree(s.f.states[n], { blockId: "p", revisionId: s.archive.revisionId(n) });
    const head = queryDurableSubtree(s.f.states[3], { blockId: "p", revisionId: s.archive.revisionId(3) });
    expect(value.selected).toEqual(expected); expect(value.comparison).toEqual(compareDurableSubtrees(expected, head));
    expect(value.timing?.route).toBe("selective"); if (n !== 3) expect(value.timing?.headHits).toBe(1);
    expect(Object.isFrozen(value.selected.fragment)).toBe(true);
  }
  expect(s.path).not.toHaveBeenCalled();
  s.certificates.clear();
  expect((await reader.select(1, s.archive.revisionId(1))).timing?.route).toBe("full");
  expect(s.path).toHaveBeenCalled();
});
it("routes large closures to the unchanged full oracle; corruption cannot fabricate a result", async () => {
  const s = await setup();
  const large = await s.reader("large").select(0, "baseline");
  expect(large.timing?.route).toBe("full"); expect(large.timing?.fallback).toContain("closure byte/page cost");
  const cert = s.certificates.get(0)!; s.data.set(cert.manifest.hash, new Uint8Array([0]));
  const value = await s.reader().select(0, "baseline");
  expect(value.timing?.route).toBe("full"); expect(value.timing?.fallback).toContain("hash/length");
  expect(value.selected).toEqual(queryDurableSubtree(s.f.baseline, { blockId: "p", revisionId: "baseline" }));
});
it("honours cancellation without triggering full fallback", async () => {
  const s = await setup(), controller = new AbortController();
  const reader = new PersistentHistoryReader(s.archive.identity, { blockId: "p" }, { ...s.archive.io, path: s.path }, {
    ...s.io, certificate: async n => { controller.abort(); return s.certificates.get(n); },
  });
  await expect(reader.select(0, "baseline", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(s.path).not.toHaveBeenCalled();
});

it("includes non-Cell dependencies reached through Cells in the route cost", async () => {
  const s = await setup(true), value = await s.reader().select(0, "baseline");
  expect(value.timing?.route).toBe("full"); expect(value.timing?.fallback).toContain("closure byte/page cost");
  expect(value.selected).toEqual(queryDurableSubtree(s.f.baseline, { blockId: "p", revisionId: "baseline" }));
});
