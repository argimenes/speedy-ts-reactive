// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { BlockHistorySession } from "./block-history";
import { BlockHistoryLayer } from "../rendering/block-history";
import { createSessionHistorySource } from "../history/ui-session-source";
import type { DurableHistorySource, DurableRecorderStatus } from "../history/durable-browser";
import { encodeHistoryDocument, projectWholeDocument } from "../history/durable-core";
import type { ExistingBlockDto } from "../block-tree/types";

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const dto: ExistingBlockDto = { id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "Saved",
  blockProperties: [{ type: "block/alignment/left " }, { type: "block/font/size", value: "h3", metadata: {}, isDeleted: false }],
  standoffProperties: [{ type: "text/colour", start: 0, end: 4, value: "#ff0000", metadata: {}, text: "Save", plugin: null, isDeleted: false }],
}] };
function fixture() {
  const editor = new ReactiveEditor(dto), view = editor.createView("history-persistence");
  cleanup.push(() => editor.dispose());
  const key = Object.values(view.state.nodes).find(node => node.payload.id === "p")!.key;
  const status: DurableRecorderStatus = { phase: "recording", message: "Verified", pendingCapture: 0, pendingCount: 0, pendingBytes: 0, browserCommitted: 1, serverDurable: 1, verified: 1 };
  const select = vi.fn(async (revisionId: string) => {
    const selected = { blockId: "p", revisionId, status: "unknown-block" as const, missingDependencies: false };
    return { selected, comparison: { before: selected, after: selected, comparable: false, changes: [] } };
  });
  const source: DurableHistorySource = {
    open: vi.fn(async (_selection, _signal, segmentId = "earlier") => ({ storage: "persistent" as const, segmentId, headRevisionId: `${segmentId}-head`, status: "available" as const, message: "Verified persistent history", select,
      timeline: async () => ({ headRevisionId: `${segmentId}-head`, entries: [{ revisionId: `${segmentId}-head`, timestamp: "2026-09-18T00:00:00Z", label: "Edit", cause: "edit", kinds: [] }] }) })),
    sessions: async () => ["earlier", "current"].map(segmentId => ({ segmentId, revisionId: `${segmentId}-start`, headRevisionId: `${segmentId}-head`, headSequence: 1, metadata: { timestamp: "2026-09-18T00:00:00Z" } })),
    status: () => status, subscribeStatus: listener => { listener(status); return () => {}; }, dispose: vi.fn(),
    save: vi.fn(async () => ({ document: encodeHistoryDocument(projectWholeDocument(editor.repository.readState(), "doc"), "memoir", { segmentId: "current", revisionId: "current-head" }), revision: editor.repository.state.revision })),
  };
  const factory = vi.fn(async () => source);
  editor.blockHistory.dispose();
  const controller = new BlockHistorySession(editor, createSessionHistorySource, factory);
  Object.defineProperty(editor, "blockHistory", { value: controller });
  return { editor, view, key, controller, factory, source, status };
}

describe("persistent history application seams", () => {
  it("opts a saved legacy Document in through History, selects prior recording sessions, and keeps preview read-only", async () => {
    const { editor, controller, factory, key, view, source } = fixture();
    controller.attachLocation({ folder: "notes", filename: "Real.json" });
    expect(factory).not.toHaveBeenCalled();
    const initial = editor.repository.snapshot();
    const host = document.body.appendChild(document.createElement("div"));
    cleanup.push(render(() => <BlockHistoryLayer editor={editor} viewId={view.viewId} />, host));
    controller.open(key);
    await vi.waitFor(() => expect(controller.state.result).toBeDefined());
    expect(factory).toHaveBeenCalledOnce();
    expect(document.querySelector(".block-history-badge")?.textContent).toBe("Persistent");
    const picker = document.querySelector<HTMLSelectElement>('[aria-label="Recording session"]')!;
    expect(picker.value).toBe("earlier");
    picker.value = "current"; picker.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(controller.state.result?.selected.revisionId).toBe("current-head"));
    expect(source.open).toHaveBeenLastCalledWith(expect.objectContaining({ blockId: "p" }), expect.any(AbortSignal), "current");
    expect(editor.repository.snapshot()).toEqual(initial);
    expect(editor.repository.canUndo()).toBe(false);
  });

  it("starts an enrolled reopened Document before History is opened and saves the captured revision, leaving newer edits dirty", async () => {
    const { editor, controller, factory, source, key } = fixture();
    controller.attachIdentity({ resourceId: "doc", memoirId: "memoir" });
    controller.attachLocation({ folder: "notes", filename: "Real.json" });
    expect(factory).toHaveBeenCalledOnce();
    await Promise.resolve();
    const savedDocument = encodeHistoryDocument(projectWholeDocument(editor.repository.readState(), "doc"), "memoir", { segmentId: "earlier", revisionId: "earlier-head" });
    let finish!: (value: { document: typeof savedDocument; revision: number }) => void;
    vi.mocked(source.save).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = editor.persistence.saveDocument("Real.json", "notes");
    await vi.waitFor(() => expect(source.save).toHaveBeenCalledOnce());
    editor.commands.replaceInlineRange(key, 5, 5, " newer");
    finish({ document: savedDocument, revision: 0 });
    expect(await pending).toBe(true);
    expect(editor.persistence.state.lastSavedRevision).toBe(0);
    expect(editor.repository.state.revision).toBe(1);
    expect(editor.persistence.savedDocument).toEqual(savedDocument);
    const reopened = new ReactiveEditor(savedDocument as unknown as ExistingBlockDto); cleanup.push(() => reopened.dispose());
    expect(reopened.encodeDocument().children![0].text).toBe("Saved");
    expect(reopened.repository.canUndo()).toBe(false);
  });

  it("preserves ordinary portable Save with an explicit warning when history admission fails, without inventing a receipt", async () => {
    const { editor, controller, factory } = fixture();
    factory.mockRejectedValueOnce(new Error("The durable state admission bound was exceeded"));
    controller.attachIdentity({ resourceId: "doc", memoirId: "memoir" });
    controller.attachLocation({ folder: "notes", filename: "Real.json" });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ Success: true, Warning: "Document saved; history association unavailable" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await editor.persistence.saveDocument("Real.json", "notes")).toBe(true);
    expect(controller.state.recordingError).toContain("admission bound");
    expect(editor.persistence.state.warning).toContain("history association unavailable");
    expect(editor.persistence.savedDocument).toMatchObject({ format: "codex-history-document", memoirId: "memoir" });
    expect(editor.persistence.savedDocument?.saved).toBeUndefined();
    const request = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(request[1].body as string).historyProof).toBeUndefined();
  });
});

async function restoreFixture() {
  const f = fixture();
  const recorder = createSessionHistorySource(f.editor.repository, f.editor.repository.state.rootPlacementKey);
  cleanup.push(() => recorder.dispose());
  f.source.open = async selection => {
    const session = await recorder.open(selection);
    return { ...session, storage: "persistent" as const };
  };
  f.source.preflightRestore = vi.fn(async () => {});
  f.controller.attachLocation({ folder: "notes", filename: "Real.json" });
  f.controller.open(f.key); await vi.waitFor(() => expect(f.controller.state.result).toBeDefined());
  const baseline = f.controller.state.entries[0].revisionId;
  f.editor.commands.replaceInlineRange(f.key, 0, 5, "Current");
  f.controller.close(false); f.controller.open(f.key);
  await vi.waitFor(() => expect(f.controller.state.entries).toHaveLength(2));
  await f.controller.select(baseline);
  return { ...f, baseline };
}
describe("History restore confirmation seam", () => {
  it("requires confirmation, commits once, and exposes Undo/Redo as normal present changes", async () => {
    const f = await restoreFixture(), before = f.editor.repository.state.revision;
    const host = document.body.appendChild(document.createElement("div"));
    cleanup.push(render(() => <BlockHistoryLayer editor={f.editor} viewId={f.view.viewId} />, host));
    const button = [...document.querySelectorAll("button")].find(b => b.textContent === "Restore this Block…")!;
    expect(button.disabled).toBe(false); button.click();
    await vi.waitFor(() => expect(f.controller.state.restoreConfirmation?.revisionId).toBe(f.baseline));
    expect(f.editor.repository.state.revision).toBe(before);
    expect(document.querySelector('[aria-label="Confirm Block restore"]')?.textContent).toContain("does not rewind or truncate");
    [...document.querySelectorAll("button")].find(b => b.textContent === "Confirm Restore this Block")!.click();
    expect(f.editor.repository.state.revision).toBe(before + 1);
    expect(f.editor.encodeDocument().children![0].text).toBe("Saved");
    expect(f.editor.encodeDocument().children![0]).toMatchObject({ blockProperties: dto.children![0].blockProperties, standoffProperties: dto.children![0].standoffProperties });
    expect(f.controller.state.restoreNotice).toContain("new current change");
    f.editor.repository.undo(); expect(f.editor.encodeDocument().children![0].text).toBe("Current");
    f.editor.repository.redo(); expect(f.editor.encodeDocument().children![0].text).toBe("Saved");
  });
  it("refuses a stale confirmation or changed selection without mutating the live Document", async () => {
    const f = await restoreFixture(); await f.controller.prepareRestore();
    expect(f.controller.state.restoreConfirmation).toBeDefined();
    f.editor.commands.replaceInlineRange(f.key, 0, 1, "X"); const before = f.editor.repository.snapshot();
    f.controller.confirmRestore(); expect(f.controller.state.error).toContain("Document changed");
    expect(f.editor.repository.snapshot()).toEqual(before);
    await f.controller.prepareRestore(); expect(f.controller.state.restoreConfirmation).toBeDefined();
    await f.controller.select(f.controller.state.entries[1].revisionId);
    expect(f.controller.state.restoreConfirmation).toBeUndefined();
    f.controller.confirmRestore(); expect(f.editor.repository.snapshot()).toEqual(before);
  });
  it("cancels an in-flight export and leaves a failed preflight atomic", async () => {
    const f = await restoreFixture();
    f.source.preflightRestore = vi.fn(async () => { throw Error("Injected admission failure"); });
    const before = f.editor.repository.snapshot(); await f.controller.prepareRestore();
    expect(f.controller.state.error).toBe("Injected admission failure");
    expect(f.controller.state.restoreConfirmation).toBeUndefined(); expect(f.editor.repository.snapshot()).toEqual(before);
    let release!: () => void;
    f.source.preflightRestore = vi.fn(async () => new Promise<void>(resolve => { release = resolve; }));
    const preparing = f.controller.prepareRestore();
    await vi.waitFor(() => expect(release).toBeDefined()); f.controller.cancelRestore(); release(); await preparing;
    expect(f.controller.state.restoreConfirmation).toBeUndefined(); expect(f.editor.repository.snapshot()).toEqual(before);
  });
});
