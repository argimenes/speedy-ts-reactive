import { describe, expect, it, vi } from "vitest";
import { clone } from "../block-tree/clone";
import { decodeDocument } from "../block-tree/codecs";
import { TreeCommands } from "../block-tree/commands";
import { CanonicalRepository } from "../block-tree/repository";
import type { ExistingBlockDto } from "../block-tree/types";
import type { SubtreeResult } from "./types";
import { createSessionHistorySource, type SessionHistoryOptions } from "./ui-session-source";

const documentDto: ExistingBlockDto = { id: "doc", type: "document-block", children: [
  { id: "p", type: "standoff-editor-block", text: "Hello", standoffProperties: [{ type: "bold", start: 0, end: 2 }] },
] };
function setup(options: SessionHistoryOptions = {}, workspace = false) {
  const initial = decodeDocument(workspace ? { id: "workspace", type: "workspace-block", children: [documentDto,
    { id: "other-doc", type: "document-block", children: [{ id: "other", type: "standoff-editor-block", text: "Private other Document" }] },
  ] } : documentDto).state;
  const repository = new CanonicalRepository(initial, { enforceBlockIdentity: true }), commands = new TreeCommands(repository, key => key);
  const placement = (id: string) => Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey]?.payload.id === id)!.key;
  const recorder = createSessionHistorySource(repository, placement("doc"), options);
  const selection = { blockId: "p", placementId: `session:${placement("p")}` };
  return { repository, commands, placement, recorder, selection };
}
function textOf(result: { fragment?: { contents: any; placements: any } }) {
  const fragment = result.fragment!;
  const paragraph = Object.values(fragment.contents).find((content: any) => content.payload.id === "p") as any;
  return paragraph.inlineContent.map((key: string) => fragment.contents[fragment.placements[key].contentKey].payload.text).join("");
}

describe("temporary asynchronous read-only session history", () => {
  it("starts at a real baseline and captures live edit/undo/redo without altering ordinary history", async () => {
    const s = setup();
    expect(s.repository.canUndo()).toBe(false);
    const original = await s.recorder.open(s.selection), first = await original.timeline();
    expect(first.entries).toHaveLength(1); expect(first.entries[0].baseline).toBe(true);
    expect(textOf((await original.select(first.entries[0].revisionId)).selected)).toBe("Hello");
    const snapshot = vi.spyOn(s.repository, "snapshot");
    s.commands.replaceInlineRange(s.placement("p"), 5, 5, "!");
    // The ordinary inline command and compact subscription require no snapshots.
    expect(snapshot).not.toHaveBeenCalled(); snapshot.mockRestore();
    s.repository.undo(); s.repository.redo();
    const current = await s.recorder.open(s.selection), page = await current.timeline();
    expect(page.entries.map(entry => entry.cause)).toEqual(["baseline", "edit", "undo", "redo"]);
    const texts = [];
    for (const entry of page.entries) texts.push(textOf((await current.select(entry.revisionId)).selected));
    expect(texts).toEqual(["Hello", "Hello!", "Hello", "Hello!"]);
    expect((await current.select(page.entries[0].revisionId)).comparison.changes).toContainEqual({ kind: "authored", blockId: "p" });
    expect((await original.timeline()).entries).toHaveLength(1);
    expect(s.repository.canUndo()).toBe(true); expect(s.repository.canRedo()).toBe(false);
    s.recorder.dispose();
  });

  it("returns frozen historical results and never accesses the live repository during queries", async () => {
    const s = setup(); s.commands.replaceInlineRange(s.placement("p"), 0, 1, "Y");
    const before = s.repository.snapshot(), snapshot = vi.spyOn(s.repository, "snapshot"), live = vi.spyOn(s.repository, "readState");
    const session = await s.recorder.open(s.selection), page = await session.timeline();
    const result = await session.select(page.entries[0].revisionId);
    expect(() => { (result.selected as SubtreeResult).status = "unsupported"; }).toThrow();
    expect(() => { (result.selected.fragment!.contents as any).injected = {}; }).toThrow();
    expect(Object.isFrozen(result.selected.fragment!.contents[Object.keys(result.selected.fragment!.contents)[0]].payload)).toBe(true);
    expect(snapshot).not.toHaveBeenCalled(); expect(live).not.toHaveBeenCalled();
    snapshot.mockRestore(); live.mockRestore(); expect(s.repository.snapshot()).toEqual(before);
    expect(Object.keys(s.recorder).sort()).toEqual(["dispose", "open"]);
    s.recorder.dispose();
  });

  it("isolates one closed Document in a Workspace and returns continuation after unrelated work", async () => {
    const s = setup({ timelineScanLimit: 1 }, true);
    s.commands.replaceInlineRange(s.placement("other"), 0, 0, "Unrelated ");
    s.commands.replaceInlineRange(s.placement("p"), 5, 5, "!");
    const session = await s.recorder.open(s.selection);
    const baseline = await session.timeline(), empty = await session.timeline({ cursor: baseline.nextCursor });
    expect(empty.entries).toEqual([]); expect(empty.nextCursor).toBeDefined();
    const last = await session.timeline({ cursor: empty.nextCursor });
    expect(last.entries).toHaveLength(1); expect(last.nextCursor).toBeUndefined();
    expect(JSON.stringify((await session.select(last.entries[0].revisionId)).selected)).not.toContain("Private other Document");
    await expect(s.recorder.open({ blockId: "other", placementId: `session:${s.placement("other")}` })).rejects.toThrow("not in this enrolled Document");
    s.recorder.dispose();
  });

  it("keeps earlier revisions after a finite capture boundary and does not inhibit editing", async () => {
    const s = setup({ maxEvents: 1 });
    const initial = await s.recorder.open(s.selection);
    s.commands.replaceInlineRange(s.placement("p"), 5, 5, "!");
    s.commands.replaceInlineRange(s.placement("p"), 6, 6, "?");
    const session = await s.recorder.open(s.selection), page = await session.timeline();
    expect(session.status).toBe("incomplete"); expect(initial.status).toBe("incomplete");
    expect(session.message).toContain("No history was pruned"); expect(page.entries).toHaveLength(2);
    expect(textOf((await session.select(page.entries[1].revisionId)).selected)).toBe("Hello!");
    expect(s.repository.state.revision).toBe(2); s.repository.undo(); expect(s.repository.state.revision).toBe(3);
    s.recorder.dispose();
  });

  it("handles new structural Blocks and reports not-yet-created against the fixed branch head", async () => {
    const s = setup();
    const inserted = s.commands.insert({ id: "new", type: "standoff-editor-block", text: "New" }, { kind: "at", parentKey: s.placement("doc"), index: 1 });
    const session = await s.recorder.open({ blockId: "new", placementId: `session:${inserted}` });
    const page = await session.timeline();
    expect((await session.select(page.entries[0].revisionId)).selected.status).toBe("not-yet-created");
    expect((await session.select(page.entries.at(-1)!.revisionId)).selected.status).toBe("available");
    s.recorder.dispose();
  });

  it("cancels reads, refuses unsupported reference scope, and checks enrollment size before snapshot", async () => {
    const s = setup(), abort = new AbortController(); abort.abort();
    await expect(s.recorder.open(s.selection, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    const session = await s.recorder.open(s.selection);
    await expect(session.timeline({ signal: abort.signal })).rejects.toMatchObject({ name: "AbortError" });
    const pendingAbort = new AbortController(), selection = session.select(session.headRevisionId, { signal: pendingAbort.signal });
    pendingAbort.abort(); await expect(selection).rejects.toMatchObject({ name: "AbortError" });
    const snapshot = vi.spyOn(s.repository, "snapshot");
    expect(() => createSessionHistorySource(s.repository, s.placement("doc"), { maxGraphRecords: 1 })).toThrow("budget");
    expect(snapshot).not.toHaveBeenCalled(); snapshot.mockRestore();
    const state = s.repository.snapshot(), paragraph = state.placements[s.placement("p")];
    state.placements[paragraph.key] = { ...clone(paragraph), kind: "reference" };
    const referenceRepository = new CanonicalRepository(state);
    expect(() => createSessionHistorySource(referenceRepository, s.placement("doc"))).toThrow("reference");
    s.recorder.dispose(); await expect(session.timeline()).rejects.toThrow("disposed");
  });
});
