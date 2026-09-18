import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeDocument } from "../block-tree/codecs";
import { TreeCommands } from "../block-tree/commands";
import { CanonicalRepository } from "../block-tree/repository";
import { createDurableHistorySource } from "./durable-browser";

class WorkerDouble {
  static latest: WorkerDouble;
  messages: any[] = []; onmessage?: (event: { data: any }) => void;
  listeners: Array<(event: { data: any }) => void> = [];
  terminate = vi.fn();
  constructor() { WorkerDouble.latest = this; }
  postMessage(data: any) { this.messages.push(data); }
  addEventListener(_event: string, listener: (event: { data: any }) => void) { this.listeners.push(listener); }
  send(data: any) { this.onmessage?.({ data }); this.listeners.forEach(listener => listener({ data })); }
  answer(kind: string, result: any) { this.send({ id: this.messages.findLast(message => message.kind === kind).id, result }); }
}
function setup() {
  vi.stubGlobal("Worker", WorkerDouble);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const repository = new CanonicalRepository(decodeDocument({ id: "doc", type: "document-block", children: [
    { id: "p", type: "standoff-editor-block", text: "a" },
  ] }).state, { enforceBlockIdentity: true });
  const commands = new TreeCommands(repository, key => key);
  const paragraph = Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey].payload.id === "p")!.key;
  const opening = createDurableHistorySource(repository, { folder: ".", filename: "doc.json" }, { resourceId: "doc" });
  return { repository, commands, paragraph, opening, worker: WorkerDouble.latest };
}
afterEach(() => vi.unstubAllGlobals());
describe("persistent worker bridge", () => {
  it("captures ordered edits immediately after the baseline without additional snapshots or changing undo", async () => {
    const s = setup(), snapshot = vi.spyOn(s.repository, "snapshot");
    s.commands.replaceInlineRange(s.paragraph, 0, 1, "b"); s.repository.undo(); s.repository.redo();
    expect(snapshot).not.toHaveBeenCalled();
    expect(s.worker.messages.map(message => message.kind)).toEqual(["init", "capture", "capture", "capture"]);
    expect(s.worker.messages.filter(message => message.kind === "capture").map(message => message.event.cause.kind)).toEqual(["edit", "undo", "redo"]);
    s.worker.answer("init", {}); const source = await s.opening;
    expect(source.status()).toMatchObject({ browserCommitted: 0, pendingCapture: 3 });
    s.worker.send({ captured: s.worker.messages[1].event.commitId, status: { browserCommitted: 1, serverDurable: 0, verified: 0, pendingCount: 1, pendingBytes: 99, phase: "offline" } });
    expect(source.status()).toMatchObject({ browserCommitted: 1, serverDurable: 0, pendingCapture: 2, phase: "offline" });
    const original = s.worker.messages[0].baseline;
    const saved = source.save("doc.json", ".", false, original);
    expect(s.worker.messages.at(-1)).toMatchObject({ kind: "save", sourceRevision: 0, baseline: original });
    s.worker.answer("save", { revision: 0, document: {} }); expect((await saved).revision).toBe(0);
    source.dispose(); expect(s.worker.messages.at(-1).kind).toBe("close");
    expect(s.worker.terminate).not.toHaveBeenCalled(); s.worker.send({ closed: true }); expect(s.worker.terminate).toHaveBeenCalledOnce();
  });

  it("stops capture at the unchanged 64-message boundary and never labels the gap durable", async () => {
    const s = setup(); s.worker.answer("init", {}); const source = await s.opening;
    for (let i = 0; i < 66; i++) s.commands.replaceInlineRange(s.paragraph, 0, 1, i % 2 ? "b" : "c");
    expect(s.worker.messages.filter(message => message.kind === "capture")).toHaveLength(64);
    expect(source.status()).toMatchObject({ phase: "stopped", pendingCapture: 64, browserCommitted: 0 });
    expect(s.repository.readState().revision).toBe(66); expect(s.repository.canUndo()).toBe(true);
    const saving = source.save("doc.json", ".");
    expect(s.worker.messages.at(-1)).toMatchObject({ kind: "save", sourceRevision: 66, baseline: { revision: 66 }, captureFailure: expect.stringContaining("64-message") });
    s.worker.answer("save", { revision: 66, document: {}, warning: "Document saved without a history save receipt" });
    expect(await saving).toMatchObject({ revision: 66, warning: expect.any(String) }); source.dispose();
  });

  it("publishes immutable results, cancels actual worker requests and keeps a fixed session head", async () => {
    const s = setup(); s.worker.answer("init", {}); const source = await s.opening;
    const opening = source.open({ blockId: "p" }); s.worker.answer("openReader", { readerId: "reader", headRevisionId: "head", segmentId: "segment" });
    const reader = await opening; expect(reader.storage).toBe("persistent");
    const selecting = reader.select("old"); s.worker.answer("select", { selected: { status: "available", fragment: { contents: { p: { payload: { text: "original" } } } } }, comparison: { changes: [] } });
    const result = await selecting; expect(Object.isFrozen(result.selected.fragment!.contents.p.payload)).toBe(true);
    const controller = new AbortController(), cancelled = reader.select("old", { signal: controller.signal });
    controller.abort(); await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    expect(s.worker.messages.at(-1).kind).toBe("cancel"); expect(reader.headRevisionId).toBe("head");
    reader.dispose?.(); expect(s.worker.messages.at(-1)).toEqual({ kind: "closeReader", readerId: "reader" }); source.dispose();
  });
});
