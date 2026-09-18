import { describe, expect, it } from "vitest";
import { clone } from "../block-tree/clone";
import { decodeDocument, encodeDocument } from "../block-tree/codecs";
import { CanonicalRepository } from "../block-tree/repository";
import { TreeCommands } from "../block-tree/commands";
import type { DeepReadonly } from "../block-tree/commit-capture";
import type { ResourceSnapshot, ResourceTransition } from "./stage-c-gates/resource";
import { replayResource } from "./stage-c-gates/resource";
import { DURABLE_LIMITS, WholeDocumentCapture, affectedBlockIds, applyDurableTransitionInPlace, assertBoundedSnapshot,
  compareDurableSubtrees, decodeDurableWire, decodeHistoryDocument, encodeDurableWire, encodeHistoryDocument,
  projectWholeDocument, queryDurableSubtree, replayDurablePath } from "./durable-core";

function setup(length = 5) {
  const state = decodeDocument({ id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "x".repeat(length) }] }).state;
  const repository = new CanonicalRepository(state, { enforceBlockIdentity: true }), commands = new TreeCommands(repository, k => k);
  const root = state.placements[state.rootPlacementKey];
  const paragraph = state.contents[root.contentKey].children[0];
  return { state, repository, commands, root, paragraph };
}

describe("persistent single Document shared contracts", () => {
  it("has canonical lossless versioned bytes and rejects corrupt/reserved portable fields", () => {
    const value = { absent: undefined, signedZero: -0, nan: NaN, tag: { $codexHistoryValue: ["undefined"] } };
    const wire = encodeDurableWire(value);
    expect(wire.startsWith('{"format":"codex-history-value","version":1,')).toBe(true);
    expect(decodeDurableWire(wire)).toEqual(value);
    expect(() => decodeDurableWire(wire.replace('"version":1', '"version":2'))).toThrow();
    expect(() => decodeDurableWire(wire + " ")).toThrow();
    const envelope = encodeHistoryDocument(projectWholeDocument(setup().state, "r"), "m");
    expect(() => decodeHistoryDocument({ ...envelope, contents: {} })).toThrow("reserved");
    const bad = clone(envelope); (bad.document.blocks[0] as any).runtimeKey = "ignored?";
    expect(() => decodeHistoryDocument(bad)).toThrow("reserved");
  });

  it("roundtrips authored content and structural identities without changing definition retention or following unsaved history", () => {
    const s = setup(); const paragraphContent = s.state.placements[s.paragraph].contentKey;
    s.state.contents[paragraphContent].definitionOwnerKey = s.root.contentKey;
    const baseline = projectWholeDocument(s.state, "r"), envelope = encodeHistoryDocument(baseline, "m", { segmentId: "s", revisionId: "saved" });
    const opened = decodeHistoryDocument(envelope), next = projectWholeDocument(opened.state, "r");
    expect(opened.state.rootPlacementKey).not.toBe(s.state.rootPlacementKey);
    expect(encodeDocument(opened.state)).toEqual(encodeDocument(s.state));
    expect(encodeHistoryDocument(next, "m", opened.saved)).toEqual(envelope);
    expect(Object.values(opened.state.contents).filter(c => c.definitionOwnerKey).map(c => c.payload.id)).toEqual(["p"]);
    const before = queryDurableSubtree(baseline, { blockId: "p", revisionId: "old" });
    const after = queryDurableSubtree(next, { blockId: "p", revisionId: "new" });
    expect(compareDurableSubtrees(before, after).changes).toEqual([]);
    expect(Object.isFrozen(before.fragment!.contents)).toBe(true);
  });

  it("projects exact edits/undo/redo/branches with no live normalization and equals full-state oracles", () => {
    const s = setup(), untouched = clone(s.state), baseline = projectWholeDocument(s.state, "r");
    const capture = new WholeDocumentCapture(baseline, s.state.revision);
    const events: DeepReadonly<ResourceTransition>[] = [], errors: unknown[] = [];
    let exact = baseline;
    s.repository.subscribeHistoryChanges(source => {
      const event = capture.capture(source), before = exact;
      exact = replayResource(exact, event);
      const privateState = clone(before) as ResourceSnapshot; applyDurableTransitionInPlace(privateState, event);
      expect(privateState).toEqual(exact);
      expect(exact).toEqual(projectWholeDocument(s.repository.readState(), "r", capture.localRevision));
      expect(affectedBlockIds(before, exact, event)).toEqual(["doc", "p"]);
      events.push(event);
    }, error => errors.push(error));
    s.commands.replaceInlineRange(s.paragraph, 1, 2, "abc");
    s.repository.undo(); s.repository.redo(); s.repository.undo();
    s.commands.replaceInlineRange(s.paragraph, 0, 1, "Y");
    expect(errors).toEqual([]); expect(events.map(e => e.cause.kind)).toEqual(["edit", "undo", "redo", "undo", "edit"]);
    expect(s.state).toEqual(untouched);
    expect(replayDurablePath(baseline, events)).toEqual(exact);
    expect(() => replayDurablePath(baseline, Array(13).fill(events[0]))).toThrow("distance");
    expect(() => replayResource(exact, events[0])).toThrow("parent");
  });

  it("keeps external references terminal across save/open and renders an immutable unavailable marker", () => {
    const s = setup(), key = "external", doc = s.state.contents[s.root.contentKey];
    doc.children.push(key);
    s.state.placements[key] = { key, contentKey: "unresolved", kind: "reference", externalReference: {
      kind: "block", targetId: "foreign", source: { scope: "document", resourceId: "other" }, version: { kind: "unpinned" },
    } };
    const snapshot = projectWholeDocument(s.state, "r"), envelope = encodeHistoryDocument(snapshot, "m");
    const opened = projectWholeDocument(decodeHistoryDocument(envelope).state, "r");
    expect(encodeHistoryDocument(opened, "m")).toEqual(envelope);
    const query = queryDurableSubtree(opened, { blockId: "doc", revisionId: "r0" });
    expect(query.status).toBe("available"); expect(query.fragment!.tree!.children.at(-1)!.excludedReference).toBe(true);
    expect(query.fragment!.diagnostics).toContainEqual(expect.objectContaining({ id: "foreign", available: false }));
    const pinned = clone(opened) as ResourceSnapshot;
    const foreign = Object.values(pinned.placements).find(p => p.target.kind === "external")!;
    if (foreign.target.kind === "external") foreign.target.reference.version = { kind: "revision", memoirId: "fm", segmentId: "fs", revisionId: "fr" };
    expect(compareDurableSubtrees(query, queryDurableSubtree(pinned, { blockId: "doc", revisionId: "r1" })).changes).toContainEqual({ kind: "dependency", blockId: "doc" });
    expect(queryDurableSubtree(opened, { blockId: "not-proven", revisionId: "r0" }).status).toBe("unknown-block");
  });

  it("includes moved/reordered descendants in timeline evidence and detects same-parent index changes", () => {
    const initial = decodeDocument({ id: "doc", type: "document-block", children: [
      { id: "container", type: "vertical-stack-block", children: [{ id: "nested", type: "standoff-editor-block", text: "nested" }] },
      { id: "sibling", type: "standoff-editor-block", text: "sibling" },
    ] }).state;
    const repository = new CanonicalRepository(initial, { enforceBlockIdentity: true }), commands = new TreeCommands(repository, k => k);
    const before = projectWholeDocument(initial, "r"), capture = new WholeDocumentCapture(before, initial.revision);
    let event!: DeepReadonly<ResourceTransition>;
    repository.subscribeHistoryChanges(e => { event = capture.capture(e); }, e => { throw e; });
    const root = initial.placements[initial.rootPlacementKey], container = initial.contents[root.contentKey].children[0];
    commands.move(container, { kind: "at", parentKey: initial.rootPlacementKey, index: 1 });
    const after = projectWholeDocument(repository.readState(), "r", 1);
    expect(affectedBlockIds(before, after, event)).toEqual(["container", "doc", "nested", "sibling"]);
    const old = queryDurableSubtree(before, { blockId: "container", revisionId: "before" });
    const next = queryDurableSubtree(after, { blockId: "container", revisionId: "after" });
    expect(old.occurrence!.route).toEqual(next.occurrence!.route);
    expect(compareDurableSubtrees(old, next).changes).toContainEqual({ kind: "location", blockId: "container" });
  });

  it("admits and exactly reopens a 25,000-character Document above the temporary 8 MiB state limit within measured durable bounds", () => {
    const s = setup(25_000), baseline = projectWholeDocument(s.state, "r"), wire = encodeDurableWire(baseline);
    expect(new TextEncoder().encode(wire).byteLength).toBeGreaterThan(8 * 1024 * 1024);
    expect(new TextEncoder().encode(wire).byteLength).toBeLessThan(DURABLE_LIMITS.supportedStateBytes);
    assertBoundedSnapshot(baseline);
    const decoded = decodeDurableWire(wire) as ResourceSnapshot;
    expect(decoded).toEqual(baseline);
    const portable = encodeHistoryDocument(baseline, "m");
    expect(encodeDocument(decodeHistoryDocument(portable).state)).toEqual(encodeDocument(s.state));
  }, 20_000);
});
