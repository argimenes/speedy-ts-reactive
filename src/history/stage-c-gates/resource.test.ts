import { describe, expect, it } from "vitest";
import { clone } from "../../block-tree/clone";
import { decodeDocument } from "../../block-tree/codecs";
import { CanonicalRepository } from "../../block-tree/repository";
import { TreeCommands } from "../../block-tree/commands";
import type { DeepReadonly } from "../../block-tree/commit-capture";
import type { HistoryChanges } from "../../block-tree/compact-changes";
import { decodeWire, encodeWire } from "../preplan-spike/wire";
import { externalStatus, locations, projectOwned, replayResource, sameOwnedState, transition, validateResource,
  type ExternalTarget, type OwnershipEvidence, type ResourceSnapshot, type ResourceTransition } from "./resource";

function setup() {
  const initial = decodeDocument({ id: "workspace", type: "workspace-block", children: [
    { id: "A", type: "document-block", children: [{ id: "a", type: "plain-text-block", text: "local" }] },
    { id: "B", type: "document-block", children: [{ id: "b", type: "plain-text-block", text: "foreign" }] },
  ] }).state;
  const repository = new CanonicalRepository(initial, { enforceBlockIdentity: true });
  const commands = new TreeCommands(repository, key => key);
  const key = (id: string) => Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey].payload.id === id)!.key;
  const contentKey = (id: string) => repository.readState().placements[key(id)].contentKey;
  // These fixtures are authored as two independent definitions, before linking.
  const owners = new Map([[contentKey("A"), "resource-A"], [contentKey("a"), "resource-A"],
    [contentKey("B"), "resource-B"], [contentKey("b"), "resource-B"]]);
  const placementIds = new Map(Object.keys(initial.placements).map(k => [k, `semantic:${k}`]));
  const externalTargets = new Map<string, ExternalTarget>();
  const evidence: OwnershipEvidence = { contents: owners, placementIds, externalTargets,
    root: { key: "archive-root-A", placementId: "document-root-A", contentKey: contentKey("A") } };
  const external = commands.transclude(key("b"), { kind: "at", parentKey: key("A"), index: 1 });
  placementIds.set(external, "reference-X");
  externalTargets.set(external, { kind: "block", targetId: "b", source: { scope: "document", resourceId: "resource-B" },
    version: { kind: "revision", memoirId: "memoir-B", segmentId: "segment-B", revisionId: "commit-B" } });
  const project = () => projectOwned(repository.snapshot(), "resource-A", evidence, 0);
  return { repository, commands, key, contentKey, evidence, external, externalTargets, placementIds, project };
}

describe("Stage C G1 owned resource candidate", () => {
  it("preserves a structural boundary without retaining the foreign definition, and reports a local occurrence", () => {
    const s = setup(), state = s.project();
    expect(Object.values(state.contents).map(c => c.payload.id).sort()).toEqual(["A", "a"]);
    const result = locations(state, "reference-X");
    expect(result).toEqual([{ placementId: "reference-X", route: ["document-root-A", "reference-X"], external: s.externalTargets.get(s.external) }]);
    expect(externalStatus(result[0].external!)).toBe("resolution-not-attempted");
    expect(sameOwnedState(decodeWire(encodeWire(state)) as ResourceSnapshot, state)).toBe(true);
    expect(() => { (result as any).push({}); }).toThrow();
    expect(() => { (state.contents as any).evil = {}; }).toThrow();
  });

  it("ignores foreign target edits, deletion of its owned occurrence, undo and redo", () => {
    const s = setup(), before = s.project();
    s.commands.setPayloadField(s.key("b"), "text", "changed ".repeat(10000));
    expect(sameOwnedState(before, s.project())).toBe(true);
    s.commands.remove(s.key("b"));
    expect(sameOwnedState(before, s.project())).toBe(true);
    s.repository.undo(); s.repository.undo();
    expect(sameOwnedState(before, s.project())).toBe(true);
    s.repository.redo(); s.repository.redo();
    expect(sameOwnedState(before, s.project())).toBe(true);
  });

  it("retains the reference without target state or history available to projection", () => {
    const s = setup(), before = s.project(), withoutForeign = s.repository.snapshot();
    // This is projection input, not a valid live CanonicalRepository. The projector
    // must never read foreign records; provenance comes from the local reference.
    for (const [key, owner] of s.evidence.contents) if (owner !== "resource-A") delete withoutForeign.contents[key];
    const after = projectOwned(withoutForeign, "resource-A", s.evidence, 0);
    expect(after).toStrictEqual(before);
    expect(encodeWire(after)).not.toContain("foreign");
  });

  it("preserves local field presence and actual reference removal/move through unchanged command undo", () => {
    const s = setup(), start = s.project();
    s.commands.setPayloadField(s.key("a"), "opaque", { ownUndefined: undefined, numbers: [NaN, -0, Infinity] });
    const edited = s.project(); expect(sameOwnedState(decodeWire(encodeWire(edited)) as ResourceSnapshot, edited)).toBe(true);
    s.commands.move(s.external, { kind: "at", parentKey: s.key("A"), index: 0 });
    const moved = s.project(); expect(moved.contents[s.contentKey("A")].children[0]).toBe(s.external);
    s.commands.unlink(s.external); expect(s.project().placements[s.external]).toBeUndefined();
    // Existing undo restores authored effects, but creates a fresh canonical
    // revision. Assert those exact counter transitions rather than resetting them.
    const restored = (base: typeof start, rootDelta: number, leafDelta = 0) => {
      const expected = clone(base) as ResourceSnapshot;
      expected.contents[s.contentKey("A")].revision += rootDelta;
      expected.contents[s.contentKey("a")].revision += leafDelta;
      expect(sameOwnedState(s.project(), expected)).toBe(true);
    };
    s.repository.undo(); restored(moved, 2);
    s.repository.undo(); restored(edited, 4);
    s.repository.undo(); restored(start, 4, 2);
  });

  it("refuses guessed owners and disguised missing local content", () => {
    const s = setup(); s.externalTargets.clear();
    expect(s.project).toThrow("ownership/provenance evidence");
    const t = setup(), invalid = clone(t.project()) as ResourceSnapshot;
    delete invalid.contents[t.contentKey("a")];
    expect(() => validateResource(invalid)).toThrow("missing owned target");
    const bad = clone(t.project()) as ResourceSnapshot;
    const edge = bad.placements[t.external];
    if (edge.target.kind !== "external") throw new Error("fixture");
    edge.target.reference.source = { scope: "document", resourceId: "resource-A" };
    expect(() => validateResource(bad)).toThrow("disguised as external");
  });

  it("does not invent source/version evidence or consult a resolver", () => {
    expect(externalStatus({ kind: "definition", targetId: "D", source: { scope: "unknown" }, version: { kind: "unpinned" } })).toBe("unknown-source");
    expect(externalStatus({ kind: "definition", targetId: "D", source: { scope: "workspace", resourceId: "workspace" }, version: { kind: "unpinned" } })).toBe("unpinned");
  });

  it("replays every local event and descriptor preimage with source causes and independent local counters", () => {
    const s = setup(); let mirror = s.project();
    const events: DeepReadonly<HistoryChanges>[] = [], errors: unknown[] = [];
    s.repository.subscribeHistoryChanges(event => {
      events.push(event);
      const after = projectOwned(s.repository.snapshot(), "resource-A", s.evidence, mirror.revision);
      const delta = transition(mirror, after, event);
      if (!delta) { expect(sameOwnedState(mirror, after)).toBe(true); return; }
      const previous = mirror;
      mirror = replayResource(mirror, decodeWire(encodeWire(delta)) as typeof delta);
      const expected = clone(after) as ResourceSnapshot; expected.revision++;
      expect(sameOwnedState(mirror, expected)).toBe(true);
      expect(delta.commitId).toBe(event.commitId); expect(delta.cause).toEqual(event.cause);
      expect(() => replayResource(mirror, delta)).toThrow("wrong exact parent");
      const corrupt = clone(delta) as ResourceTransition; corrupt.beforeRevision = previous.revision;
      if (corrupt.placements[0]?.before) {
        corrupt.placements[0].before.placementId = "tampered";
        expect(() => replayResource(previous, corrupt)).toThrow("preimage mismatch");
      }
    }, error => errors.push(error));
    s.commands.setPayloadField(s.key("b"), "text", "external change");
    expect(mirror.revision).toBe(0);
    s.commands.setPayloadField(s.key("a"), "text", "😀é own change");
    s.commands.move(s.external, { kind: "at", parentKey: s.key("A"), index: 0 });
    s.commands.unlink(s.external);
    s.repository.undo(); s.repository.undo(); s.repository.undo();
    s.repository.redo(); s.repository.redo(); s.repository.redo();
    expect(errors).toEqual([]);
    expect(events).toHaveLength(10); expect(mirror.revision).toBe(9);
    expect(events.at(-1)!.cause.kind).toBe("redo");
  });
});
