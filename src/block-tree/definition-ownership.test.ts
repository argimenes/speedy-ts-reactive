import { describe, expect, it } from "vitest";
import { decodeDocument } from "./codecs";
import { cloneBlocks, captureBlocks } from "./clipboard";
import { TreeCommands } from "./commands";
import { normalizeDefinitionOwnership } from "./definition-ownership";
import { CanonicalRepository, validateRepository } from "./repository";
import { applyHistoryChanges } from "../history/replay";
import type { ExistingBlockDto } from "./types";

function fixture(children: ExistingBlockDto[], normalized = true) {
  const raw = decodeDocument({ id: "doc", type: "document-block", children }).state;
  const root = raw.placements[raw.rootPlacementKey].contentKey;
  const initial = normalized ? normalizeDefinitionOwnership(raw, new Map(Object.keys(raw.contents).map(k => [k, root]))) : raw;
  const repository = new CanonicalRepository(initial, { enforceBlockIdentity: true });
  const commands = new TreeCommands(repository, k => k);
  const key = (id: string) => Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey]?.payload.id === id)!.key;
  let replay = initial;
  const errors: unknown[] = [];
  repository.subscribeHistoryChanges(e => {
    replay = applyHistoryChanges(replay, e);
    expect(replay).toEqual(repository.snapshot());
  }, e => errors.push(e));
  return { repository, commands, key, root, errors };
}
const paragraph = (id: string, text = "abcd"): ExistingBlockDto => ({ id, type: "standoff-editor-block", text });

describe("Document definition membership", () => {
  it("assigns new inserted/copied/split definitions in the same ordinary undo step", () => {
    const s = fixture([paragraph("p")]);
    const inserted = s.commands.insert(paragraph("new"), { kind: "at", parentKey: s.key("doc"), index: 1 });
    const ck = s.repository.readState().placements[inserted].contentKey;
    expect(s.repository.readState().contents[ck].definitionOwnerKey).toBe(s.root);
    s.repository.undo(); expect(s.repository.readState().contents[ck]).toBeUndefined();
    expect(s.repository.canUndo()).toBe(false); s.repository.redo();
    const split = s.commands.splitStandoff(s.key("p"), 2);
    expect(s.repository.readState().contents[s.repository.readState().placements[split].contentKey].definitionOwnerKey).toBe(s.root);
    const copied = s.commands.insertFragment(cloneBlocks(captureBlocks(s.repository.snapshot(), [s.key("p")])), { kind: "after", anchorKey: split })[0];
    const copyKey = s.repository.readState().placements[copied].contentKey;
    expect(s.repository.readState().contents[copyKey].definitionOwnerKey).toBe(s.root);
    s.commands.remove(copied);
    expect(s.repository.readState().contents[copyKey]).toBeDefined();
    expect(s.errors).toEqual([]);
  });

  it("retains a removed container's subtree, margins and Cells as a definition component", () => {
    const s = fixture([{ id: "c", type: "container-block", children: [
      { ...paragraph("p"), relation: { leftMargin: { id: "m", type: "left-margin-block", children: [paragraph("note")] } } },
    ] }]);
    const before = Object.keys(s.repository.readState().contents);
    s.commands.remove(s.key("c"));
    expect(Object.keys(s.repository.readState().contents)).toEqual(before);
    validateRepository(s.repository.snapshot());
    const copied = cloneBlocks(captureBlocks(s.repository.snapshot(), [s.key("doc")]));
    validateRepository(copied.state);
    expect(Object.keys(copied.state.contents)).toHaveLength(before.length);
    const copiedRoot = copied.state.placements[copied.state.rootPlacementKey].contentKey;
    expect(Object.values(copied.state.contents).filter(c => c.definitionOwnerKey).every(c => c.definitionOwnerKey === copiedRoot)).toBe(true);
    s.repository.undo(); s.repository.redo(); expect(s.errors).toEqual([]);
  });

  it.each(["join", "cross-replace", "unwrap", "replace-preserve"])("consumes definitions explicitly during %s with exact undo/redo", operation => {
    const s = fixture(operation === "unwrap" || operation === "replace-preserve"
      ? [{ id: "wrapper", type: "container-block", children: [paragraph("p")] }]
      : [paragraph("p"), paragraph("q")]);
    if (operation === "join") s.commands.joinStandoff(s.key("p"), s.key("q"));
    if (operation === "cross-replace") s.commands.replaceAcrossBlocks([{ placementKey: s.key("p"), start: 2, end: 4 }, { placementKey: s.key("q"), start: 0, end: 2 }], "Z\nY");
    if (operation === "unwrap") s.commands.unwrap(s.key("wrapper"));
    if (operation === "replace-preserve") s.commands.replace(s.key("wrapper"), { id: "replacement", type: "container-block" }, "preserve");
    validateRepository(s.repository.snapshot());
    s.repository.undo(); expect(s.repository.canUndo()).toBe(false);
    s.repository.redo(); expect(s.errors).toEqual([]);
  });

  it("leaves non-normalized legacy pruning unchanged", () => {
    const s = fixture([paragraph("p")], false);
    const pk = s.key("p"), ck = s.repository.readState().placements[pk].contentKey;
    s.commands.remove(pk); expect(s.repository.readState().contents[ck]).toBeUndefined();
    s.repository.undo(); expect(s.repository.readState().contents[ck]).toBeDefined();
    expect(s.errors).toEqual([]);
  });

  it("rejects invalid membership even on optimized empty-paragraph insertion", () => {
    const s = fixture([]);
    const detached = decodeDocument(paragraph("new", "")).state;
    const pk = detached.rootPlacementKey, child = detached.contents[detached.placements[pk].contentKey];
    child.definitionOwnerKey = "missing";
    const parent = s.repository.readState().contents[s.root];
    expect(() => s.repository.commit("invalid", [
      { kind: "put-content", record: child }, { kind: "put-placement", record: detached.placements[pk] },
      { kind: "put-content", record: { ...parent, children: [pk] } },
    ])).toThrow("Invalid definition owner");
    expect(s.repository.canUndo()).toBe(false); expect(s.errors).toEqual([]);
  });
});
