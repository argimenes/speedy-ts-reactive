import { describe, expect, it } from "vitest";
import { decodeDocument } from "../../block-tree/codecs";
import { TreeCommands } from "../../block-tree/commands";
import { clone } from "../../block-tree/clone";
import type { ExistingBlockDto, RepositoryState } from "../../block-tree/types";
import { normalizeDefinitionOwnership } from "../../block-tree/definition-ownership";
import { CanonicalRepository } from "../../block-tree/repository";
import { encodeWire, decodeWire } from "../preplan-spike/wire";
import { projectOwned, replayResource, transition, type ResourceSnapshot } from "./resource";
import { IncrementalResourceCapture } from "./incremental";

function setup(length = 12, foreignLength = 10) {
  const paragraph = (id: string, n: number): ExistingBlockDto => ({ id, type: "standoff-editor-block", text: "x".repeat(n) });
  const raw = decodeDocument({ id: "workspace", type: "workspace-block", children: [
    { id: "A", type: "document-block", children: [paragraph("a", length), paragraph("b", 8)] },
    { id: "B", type: "document-block", children: [paragraph("foreign", foreignLength)] },
  ] }).state;
  const find = (s: RepositoryState, id: string) => Object.values(s.placements).find(p => s.contents[p.contentKey]?.payload.id === id)!.key;
  const owners = new Map<string, string>();
  for (const id of ["A", "B"]) {
    const root = raw.placements[find(raw, id)].contentKey;
    const visit = (pk: string) => { const c = raw.contents[raw.placements[pk].contentKey]; owners.set(c.key, root); for (const child of [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)]) visit(child); };
    visit(find(raw, id));
  }
  const state = normalizeDefinitionOwnership(raw, owners);
  for (const p of Object.values(state.placements)) if (p.kind !== "inline") p.placementId = `semantic:${p.key}`;
  const repository = new CanonicalRepository(state, { enforceBlockIdentity: true });
  const commands = new TreeCommands(repository, k => k), key = (id: string) => find(repository.readState(), id);
  const root = state.placements[key("A")];
  const oracle = (revision: number) => {
    const current = repository.snapshot(), contents = new Map<string, string>();
    for (const c of Object.values(current.contents)) if (c.definitionOwnerKey === root.contentKey) {
      contents.set(c.key, "resource-A");
      for (const pk of c.inlineContent) contents.set(current.placements[pk].contentKey, "resource-A");
    }
    return projectOwned(current, "resource-A", { contents, placementIds: new Map(), externalTargets: new Map(), root: { key: root.key, contentKey: root.contentKey, placementId: root.placementId! } }, revision);
  };
  return { repository, commands, key, oracle, root };
}

describe("G3 incremental owned capture", () => {
  it("matches the independent projection after every mixed edit, copy, detach, structural operation and ordinary undo/redo", () => {
    const s = setup(); let mirror = s.oracle(0); const capture = new IncrementalResourceCapture(mirror);
    const errors: unknown[] = []; let count = 0;
    s.repository.subscribeHistoryChanges(source => {
      const expected = s.oracle(mirror.revision), oracleDelta = transition(mirror, expected, source);
      const delta = capture.capture(source);
      // Record/field order is non-semantic; replay and owned values must match.
      expect(!!delta).toBe(!!oracleDelta);
      if (delta) {
        const wire = encodeWire(delta); mirror = replayResource(mirror, decodeWire(wire) as typeof delta); count++;
        expect(mirror).toEqual({ ...expected, revision: mirror.revision });
        expect(delta.cause).toEqual(source.cause); expect(delta.commitId).toBe(source.commitId);
      } else expect(expected).toEqual(mirror);
      expect(capture.retainedKeys).toEqual({ contents: Object.keys(mirror.contents).length, placements: Object.keys(mirror.placements).length });
    }, error => errors.push(error));
    s.commands.replaceInlineRange(s.key("a"), 3, 4, "Z");
    s.commands.setPayloadField(s.key("foreign"), "metadata", { unrelated: true });
    const split = s.commands.splitStandoff(s.key("a"), 4);
    s.commands.joinStandoff(s.key("a"), split);
    const ref = s.commands.transclude(s.key("a"), { kind: "at", parentKey: s.key("A"), index: 1 });
    const refId = s.repository.readState().placements[ref].placementId;
    s.commands.move(ref, { kind: "after", anchorKey: s.key("b") });
    s.commands.detach(ref); expect(s.repository.readState().placements[ref].placementId).toBe(refId);
    const copied = s.commands.copy(s.key("a"), { kind: "after", anchorKey: ref });
    expect(s.repository.readState().placements[copied].placementId).not.toBe(s.repository.readState().placements[s.key("a")].placementId);
    s.commands.setRelation(s.key("a"), "leftMargin", { id: "margin", type: "left-margin-block", children: [{ id: "note", type: "standoff-editor-block", text: "note" }] });
    s.commands.move(ref, { kind: "after", anchorKey: s.key("a") });
    s.commands.replaceAcrossBlocks([{ placementKey: s.key("a"), start: 2, end: 12 }, { placementKey: ref, start: 0, end: 2 }], "X\nY");
    const removedId = s.repository.readState().placements[copied].placementId;
    s.commands.remove(copied); s.repository.undo(); expect(s.repository.readState().placements[copied].placementId).toBe(removedId);
    s.repository.redo();
    while (s.repository.canUndo()) s.repository.undo();
    while (s.repository.canRedo()) s.repository.redo();
    expect(count).toBeGreaterThan(25); expect(errors).toEqual([]);
  });

  it("keeps single-character packets edit-sized and ignores large foreign state", () => {
    const bytes: number[] = [];
    for (const length of [100, 5600, 25000]) {
      const s = setup(length, length), baseline = s.oracle(0), capture = new IncrementalResourceCapture(baseline);
      const errors: unknown[] = []; let packets = 0;
      s.repository.subscribeHistoryChanges(e => {
        const packet = capture.capture(e); if (!packet) return;
        packets++; bytes.push(new TextEncoder().encode(encodeWire(packet)).length);
        expect(packet.contents.some(c => c.kind === "record-content" && c.before?.inlineContent.length)).toBe(false);
        expect(replayResource(baseline, packet)).toEqual(s.oracle(1));
      }, e => errors.push(e));
      s.commands.setPayloadField(s.key("foreign"), "foreignOnly", "z".repeat(length));
      s.commands.replaceInlineRange(s.key("a"), Math.floor(length / 2), Math.floor(length / 2) + 1, "Z");
      expect(packets).toBe(1); expect(errors).toEqual([]);
    }
    expect(bytes[2]).toBeLessThanOrEqual(bytes[0] * 1.25);
  });

  it("checks every state in a deterministic randomized typing/branch trace without retired-key growth", () => {
    const s = setup(); let mirror = s.oracle(0), seed = 49217, events = 0;
    const capture = new IncrementalResourceCapture(mirror), errors: unknown[] = [];
    s.repository.subscribeHistoryChanges(source => {
      const event = capture.capture(source);
      if (event) { mirror = replayResource(mirror, event); events++; }
      expect(mirror).toEqual(s.oracle(capture.localRevision));
      expect(capture.retainedKeys).toEqual({ contents: Object.keys(mirror.contents).length, placements: Object.keys(mirror.placements).length });
    }, e => errors.push(e));
    for (let i = 0; i < 200; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      if (seed % 7 === 0 && s.repository.canUndo()) s.repository.undo();
      else if (seed % 11 === 0 && s.repository.canRedo()) s.repository.redo();
      else {
        const pk = s.key("a"), state = s.repository.readState(), length = state.contents[state.placements[pk].contentKey].inlineContent.length;
        const at = seed % (length + 1), end = Math.min(length, at + seed % 3);
        s.commands.replaceInlineRange(pk, at, end, seed % 5 ? String.fromCharCode(97 + seed % 26) : "");
      }
    }
    expect(events).toBeGreaterThan(150); expect(errors).toEqual([]);
  });

  it("rejects unsupported ownership transfer and cannot resume across a missing event", () => {
    const s = setup(), capture = new IncrementalResourceCapture(s.oracle(0)); const events: any[] = [];
    s.repository.subscribeHistoryChanges(e => events.push(e), e => { throw e; });
    s.commands.replaceInlineRange(s.key("a"), 0, 1, "Z"); s.commands.replaceInlineRange(s.key("a"), 1, 2, "Y");
    expect(() => capture.capture(events[1])).toThrow("Noncontiguous");
    expect(() => capture.capture(events[0])).toThrow("new enrollment");
    const other = new IncrementalResourceCapture(s.oracle(0), 2), event = clone(events[0]);
    event.beforeRevision = 2; event.afterRevision = 3;
    event.contents = [{ kind: "patch-content", key: s.root.contentKey, beforeRevision: 0, afterRevision: 1,
      fields: [{ scope: "record", field: "definitionOwnerKey", before: { present: true, value: s.root.contentKey }, after: { present: true, value: "another-document" } }], sequences: [] }];
    event.placements = [];
    expect(() => other.capture(event)).toThrow("ownership transfer");
  });
});
