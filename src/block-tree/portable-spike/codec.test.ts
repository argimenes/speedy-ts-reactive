import { describe, expect, it } from "vitest";
import { clone } from "../clone";
import { decodeDocument } from "../codecs";
import { TreeCommands } from "../commands";
import { captureBlocks, cloneBlocks } from "../clipboard";
import { isAuthoredBlock } from "../identity";
import { CanonicalRepository } from "../repository";
import { applyHistoryChanges } from "../../history/replay";
import type { HistoryChanges } from "../compact-changes";
import type { DeepReadonly } from "../commit-capture";
import type { RepositoryState } from "../types";
import { assertPortableJson, decodePortable, encodePortable, migrateLegacy, openLegacyInMemory, validatePortable, type PortableBindings, type PortableDocument } from "./codec";
import { legacyTree, sharedContainer } from "./fixtures";

function ready(document: PortableDocument) {
  const decoded = decodePortable(JSON.parse(JSON.stringify(document)));
  if (decoded.status !== "ready") throw new Error("Unexpected unresolved fixture");
  return decoded;
}
function setup() {
  const session = openLegacyInMemory(legacyTree, "resource-test");
  if (session.status !== "ready") throw new Error("Unexpected ambiguous fixture");
  const repository = new CanonicalRepository(session.state, { enforceBlockIdentity: true });
  const commands = new TreeCommands(repository, key => key);
  const placement = (id: string) => Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey].payload.id === id)!.key;
  return { ...session, repository, commands, placement };
}

/** Independent canonical semantic oracle: no calls to the portable encoder. */
function semantics(state: RepositoryState, bindings: PortableBindings) {
  const edge = (key: string) => {
    const p = state.placements[key];
    return [bindings.placementIds.get(key), p.kind, state.contents[p.contentKey].payload.id];
  };
  return {
    resource: bindings.resourceId, root: edge(state.rootPlacementKey),
    blocks: Object.values(state.contents).filter(isAuthoredBlock).map(c => ({
      id: c.payload.id, type: c.viewType, payload: c.payload,
      children: c.children.map(edge), relations: Object.fromEntries(Object.entries(c.ownedRelations).map(([n, k]) => [n, edge(k)])),
      opaque: c.opaqueRelations, childrenState: c.wireChildren, relationState: c.wireRelation,
      inline: c.inlineContent.map(k => { const atom = state.contents[state.placements[k].contentKey]; return [atom.viewType, atom.payload]; }),
    })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}
function roundTrip(state: RepositoryState, bindings: PortableBindings) {
  const before = clone(state), wire = encodePortable(state, bindings), decoded = ready(wire);
  expect(state).toEqual(before);
  expect(semantics(decoded.state, decoded.bindings)).toEqual(semantics(state, bindings));
  expect(Object.keys(decoded.state.contents).some(key => own(state.contents, key))).toBe(false);
  expect(Object.keys(decoded.state.placements).some(key => own(state.placements, key))).toBe(false);
  expect(decoded.state.rootPlacementKey).not.toBe(state.rootPlacementKey);
  const bytes = JSON.stringify(wire);
  for (const key of [...Object.keys(state.contents), ...Object.keys(state.placements)]) expect(bytes).not.toContain(key);
  expect(bytes).not.toMatch(/"(?:contentKey|rootPlacementKey|inlineRevision|wireChildren|wireRelation|revision|inlineContent)":/);
  return { wire, ...decoded };
}
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

describe("isolated portable authored Document spike", () => {
  it("round-trips trees, null/omitted collections, margins, opaque data and annotations with fresh keys", () => {
    const s = setup(); const result = roundTrip(s.repository.snapshot(), s.bindings);
    expect(result.wire.blocks.find(b => b.id === "paragraph")?.relations?.owned.leftMargin.blockId).toBe("margin");
    expect(result.wire.blocks.find(b => b.id === "paragraph")?.children).toBeNull();
    expect(result.wire.blocks.find(b => b.id === "note")?.relations).toBeNull();
    expect(result.wire.blocks.find(b => b.id === "note")).not.toHaveProperty("children");
  });

  it("preserves shared Blocks when their owned placement is deleted, including undo/redo identity", () => {
    const s = setup(), owned = s.placement("paragraph");
    const ref = s.commands.transclude(owned, { kind: "at", parentKey: s.placement("right"), index: 0 });
    encodePortable(s.repository.snapshot(), s.bindings);
    const oldId = s.bindings.placementIds.get(owned), refId = s.bindings.placementIds.get(ref);
    s.commands.remove(owned);
    const result = roundTrip(s.repository.snapshot(), s.bindings);
    expect(result.wire.blocks.filter(b => b.id === "paragraph")).toHaveLength(1);
    const targets = Object.values(result.state.placements).filter(p => result.state.contents[p.contentKey].payload.id === "paragraph");
    expect(targets).toHaveLength(1); expect(targets[0].kind).toBe("reference");
    expect(result.bindings.placementIds.get(targets[0].key)).toBe(refId);
    s.repository.undo(); roundTrip(s.repository.snapshot(), s.bindings);
    expect(s.bindings.placementIds.get(owned)).toBe(oldId);
    s.repository.redo(); s.commands.unlink(ref);
    expect(encodePortable(s.repository.snapshot(), s.bindings).blocks.some(b => b.id === "paragraph")).toBe(false);
  });

  it("shared containers retain one child edge reached through two displayed paths", () => {
    const initial = ready(sharedContainer), result = roundTrip(initial.state, initial.bindings);
    const containers = Object.values(result.state.placements).filter(p => result.state.contents[p.contentKey].payload.id === "container");
    expect(containers).toHaveLength(2); expect(new Set(containers.map(p => p.contentKey)).size).toBe(1);
    const child = result.state.contents[containers[0].contentKey].children[0];
    expect(result.bindings.placementIds.get(child)).toBe("shared-child-edge");
    const repository = new CanonicalRepository(result.state, { enforceBlockIdentity: true });
    new TreeCommands(repository, key => key).setPayloadField(child, "sharedEdit", "both views");
    expect(containers.map(p => repository.readState().contents[repository.readState().placements[repository.readState().contents[p.contentKey].children[0]].contentKey].payload.sharedEdit)).toEqual(["both views", "both views"]);
  });

  it("moves preserve placement IDs while transclusion creates a new placement ID", () => {
    const s = setup(), key = s.placement("paragraph"), id = s.bindings.placementIds.get(key);
    s.commands.move(key, { kind: "at", parentKey: s.placement("right"), index: 0 });
    const ref = s.commands.transclude(key, { kind: "at", parentKey: s.placement("left"), index: 0 });
    const result = roundTrip(s.repository.snapshot(), s.bindings);
    expect(result.wire.blocks.find(b => b.id === "right")?.children?.[0].placementId).toBe(id);
    expect(s.bindings.placementIds.get(ref)).not.toBe(id);
    expect(result.wire.blocks.find(b => b.id === "left")?.children?.[0].kind).toBe("reference");
  });

  it("copies allocate fresh Block/placement IDs while preserving sharing inside the copied graph", () => {
    const s = setup(); s.commands.transclude(s.placement("paragraph"), { kind: "at", parentKey: s.placement("left"), index: 1 });
    encodePortable(s.repository.snapshot(), s.bindings);
    const oldIds = new Set(s.bindings.placementIds.values());
    const copy = s.commands.copy(s.placement("left"), { kind: "at", parentKey: s.placement("right"), index: 0 });
    const snapshot = s.repository.snapshot(), content = snapshot.contents[snapshot.placements[copy].contentKey];
    expect(content.payload.id).not.toBe("left");
    expect(snapshot.placements[content.children[0]].contentKey).toBe(snapshot.placements[content.children[1]].contentKey);
    expect(snapshot.contents[snapshot.placements[content.children[0]].contentKey].payload.id).not.toBe("paragraph");
    roundTrip(snapshot, s.bindings);
    for (const key of [copy, ...content.children]) expect(oldIds.has(s.bindings.placementIds.get(key)!)).toBe(false);
  });

  it("detach replaces Block identity at the surviving placement, with undo restoring both", () => {
    const s = setup(); const ref = s.commands.transclude(s.placement("paragraph"), { kind: "at", parentKey: s.placement("right"), index: 0 });
    encodePortable(s.repository.snapshot(), s.bindings); const id = s.bindings.placementIds.get(ref);
    s.commands.detach(ref); roundTrip(s.repository.snapshot(), s.bindings);
    expect(s.bindings.placementIds.get(ref)).toBe(id);
    expect(s.repository.readState().contents[s.repository.readState().placements[ref].contentKey].payload.id).not.toBe("paragraph");
    s.repository.undo(); roundTrip(s.repository.snapshot(), s.bindings);
    expect(s.repository.readState().placements[ref].kind).toBe("reference");
  });

  it("preserves Unicode, inline images, authored annotation units and rich canonical copies", () => {
    const s = setup(); s.commands.insertInlineImage(s.placement("paragraph"), 2, { assetId: "img", src: "/img.png", alt: "Image", width: 25 });
    const state = s.repository.snapshot();
    const result = roundTrip(state, s.bindings), paragraph = result.wire.blocks.find(b => b.id === "paragraph")!;
    expect(paragraph.inline?.map(span => span.kind)).toEqual(["text", "image", "text"]);
    expect(paragraph.inline?.[0]).toEqual({ kind: "text", text: "A😀" });
    expect(paragraph.properties.standoffProperties).toEqual(state.contents[state.placements[s.placement("paragraph")].contentKey].payload.standoffProperties);
    const fragment = cloneBlocks(captureBlocks(state, [s.placement("paragraph")]));
    s.commands.insertFragment(fragment, { kind: "at", parentKey: s.placement("right"), index: 0 });
    roundTrip(s.repository.snapshot(), s.bindings);
  });

  it("supports explicit reference cycles and rejects ownership cycles", () => {
    const s = setup(); s.commands.transclude(s.placement("left"), { kind: "at", parentKey: s.placement("left"), index: 1 });
    const result = roundTrip(s.repository.snapshot(), s.bindings);
    const invalid = clone(result.wire); invalid.blocks.find(b => b.id === "left")!.children![1].kind = "owned";
    expect(() => decodePortable(invalid)).toThrow("ownership cycle");
  });

  it("preserves multiple owned placements without inventing an exclusive owner invariant", () => {
    const doc = clone(sharedContainer);
    doc.blocks.find(b => b.id === "doc")!.children![1].kind = "owned";
    const initial = ready(doc); const result = roundTrip(initial.state, initial.bindings);
    const targets = Object.values(result.state.placements).filter(p => result.state.contents[p.contentKey].payload.id === "container");
    expect(targets.map(p => p.kind)).toEqual(["owned", "owned"]);
    expect(new Set(targets.map(p => p.contentKey)).size).toBe(1);
  });

  it("preserves unplaced leaf definitions without claiming a location", () => {
    const doc = clone(sharedContainer);
    doc.blocks.push({ id: "unplaced", type: "plain-text-block", properties: { text: "Retained content" } });
    const initial = ready(doc), result = roundTrip(initial.state, initial.bindings);
    expect(result.wire.blocks.some(b => b.id === "unplaced")).toBe(true);
    expect(Object.values(result.state.placements).some(p => result.state.contents[p.contentKey].payload.id === "unplaced")).toBe(false);
  });

  it("retains arbitrary explicit structural relation names without treating opaque data as edges", () => {
    const doc = clone(sharedContainer);
    doc.blocks.find(b => b.id === "doc")!.relations = {
      owned: { footnotes: { placementId: "footnotes", blockId: "paragraph", kind: "reference" } },
      opaque: { lookalike: { placementId: "root", blockId: "absent", kind: "reference" } },
    };
    const initial = ready(doc); roundTrip(initial.state, initial.bindings);
    expect(initial.bindings.placementIds.size).toBe(5);
  });

  it("returns unresolved references without inventing Blocks and rejects missing owned definitions", () => {
    const doc = clone(sharedContainer); doc.blocks.find(b => b.id === "doc")!.children![1].blockId = "missing";
    const result = decodePortable(doc);
    expect(result.status).toBe("unresolved"); expect(result).not.toHaveProperty("state");
    if (result.status !== "unresolved") throw new Error("Expected diagnostic");
    expect(result.missingBlockIds).toEqual(["missing"]); expect(result.document).toEqual(doc);
    result.document.blocks[0].properties.changed = true; expect(doc.blocks[0].properties).toEqual({});
    doc.blocks.find(b => b.id === "doc")!.children![1].kind = "owned";
    expect(() => decodePortable(doc)).toThrow("missing owned definition");
  });

  it("reads legacy without rewriting, normalizes once in memory, saves new, and reopens stable identities", () => {
    const legacy = { type: "main-list-block", children: [{ id: "kept", type: "plain-text-block", text: "old" }, { type: "plain-text-block", text: "new identity" }] };
    const originalBytes = JSON.stringify(legacy);
    expect(decodeDocument(JSON.parse(originalBytes)).state).toBeDefined(); // Existing codec remains directly usable.
    const session = openLegacyInMemory(legacy, "new-resource");
    if (session.status !== "ready") throw new Error("Expected migration");
    const first = encodePortable(session.state, session.bindings), next = encodePortable(session.state, session.bindings);
    expect(next).toEqual(first); expect(first.blocks.some(b => b.id === "kept")).toBe(true);
    expect(first.blocks.every(b => typeof b.id === "string" && b.id.length > 0)).toBe(true);
    expect(session.normalization.status === "ready" && session.normalization.assignments).toHaveLength(2);
    const reopened = ready(JSON.parse(JSON.stringify(next)));
    expect(encodePortable(reopened.state, reopened.bindings)).toEqual(first);
    expect(JSON.stringify(legacy)).toBe(originalBytes); expect(originalBytes).not.toContain("placementId");
    // A second fresh migration has no persisted evidence for the generated identities.
    const independent = migrateLegacy(legacy, "new-resource");
    expect(independent.root.blockId).not.toBe(first.root.blockId);
    expect(independent.root.placementId).not.toBe(first.root.placementId);
  });

  it("reports legacy ID ambiguity while leaving the old file independently decodable", () => {
    const legacy = { id: "doc", type: "document-block", children: [{ id: "same", type: "plain-text-block" }, { id: "same", type: "plain-text-block" }] };
    const result = openLegacyInMemory(legacy, "resource");
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") expect(result.issues[0].kind).toBe("duplicate-id");
    expect(() => decodeDocument(legacy)).not.toThrow();
    expect(() => migrateLegacy(legacy, "resource")).toThrow("ambiguous legacy");
  });

  it("newly normalized IDs survive unsaved edits and undo until deliberate serialization", () => {
    const legacy = { type: "document-block", children: [{ type: "plain-text-block", text: "Before" }] };
    const session = openLegacyInMemory(legacy, "unsaved-resource");
    if (session.status !== "ready") throw new Error("Expected ready");
    const baseline = encodePortable(session.state, session.bindings);
    const repository = new CanonicalRepository(session.state, { enforceBlockIdentity: true });
    const commands = new TreeCommands(repository, key => key);
    const child = repository.readState().contents[repository.readState().placements[repository.readState().rootPlacementKey].contentKey].children[0];
    commands.setPayloadField(child, "text", "After");
    const edited = encodePortable(repository.snapshot(), session.bindings);
    expect(edited.blocks.map(b => b.id)).toEqual(baseline.blocks.map(b => b.id));
    expect(edited.root).toEqual(baseline.root);
    expect(edited.blocks[0].children).toEqual(baseline.blocks[0].children);
    repository.undo(); expect(encodePortable(repository.snapshot(), session.bindings)).toEqual(baseline);
    repository.redo();
    const reopened = ready(encodePortable(repository.snapshot(), session.bindings));
    expect(encodePortable(reopened.state, reopened.bindings)).toEqual(edited);
    expect(legacy.children[0].text).toBe("Before"); expect(legacy.children[0]).not.toHaveProperty("id");
  });

  it("does not claim semantic equivalence is an exact history replay base", () => {
    const s = setup(); s.commands.replaceInlineRange(s.placement("paragraph"), 0, 0, "saved ");
    const saved = s.repository.snapshot(), reopened = roundTrip(saved, s.bindings);
    let event!: DeepReadonly<HistoryChanges>;
    s.repository.subscribeHistoryChanges(value => { event = value; }, error => { throw error; });
    s.commands.replaceInlineRange(s.placement("paragraph"), 0, 0, "next ");
    expect(applyHistoryChanges(saved, event)).toEqual(s.repository.snapshot());
    expect(() => applyHistoryChanges(reopened.state, event)).toThrow("base revision/root mismatch");
    expect(reopened.state.revision).toBe(0); expect(saved.revision).toBeGreaterThan(0);
  });

  it.each(["definition", "placement", "version", "operation", "resource", "inline"])("rejects malformed %s without mutating input", problem => {
    const doc = clone(sharedContainer);
    if (problem === "definition") doc.blocks.push(clone(doc.blocks[0]));
    if (problem === "placement") doc.blocks.find(b => b.id === "doc")!.children![1].placementId = "root";
    if (problem === "version") (doc as unknown as { version: number }).version = 99;
    if (problem === "operation") (doc.root as unknown as { kind: string }).kind = "implicit";
    if (problem === "resource") doc.blocks.find(b => b.id === "doc")!.properties.metadata = { documentId: "another-resource" };
    if (problem === "inline") (doc.blocks[0].inline![0] as unknown as { kind: string }).kind = "future-atom";
    const original = clone(doc); expect(() => decodePortable(doc)).toThrow(); expect(doc).toEqual(original);
  });

  it.each([undefined, NaN, Infinity, -0, new Date(), new Map(), Array(2)])("rejects unsupported payload values instead of silently changing them: %s", value => {
    const doc = clone(sharedContainer); doc.blocks[0].properties.extra = value;
    expect(() => validatePortable(doc)).toThrow();
  });

  it("preserves opaque property names safely and rejects cycles/accessors", () => {
    const doc = clone(sharedContainer); doc.blocks[0].properties = JSON.parse('{"__proto__":{"safe":true},"constructor":"data"}');
    const result = ready(doc); expect(encodePortable(result.state, result.bindings).blocks.find(b => b.id === "paragraph")!.properties).toEqual(doc.blocks[0].properties);
    expect(({} as { safe?: boolean }).safe).toBeUndefined();
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => assertPortableJson(cycle)).toThrow("cyclic payload");
    expect(() => assertPortableJson({ get x() { throw new Error("must not evaluate"); } })).toThrow("accessors");
  });

  it("failed export does not change the source graph or publish newly allocated identities", () => {
    const s = setup(); s.commands.transclude(s.placement("paragraph"), { kind: "at", parentKey: s.placement("right"), index: 0 });
    const state = s.repository.snapshot(), key = state.placements[s.placement("paragraph")].contentKey;
    state.contents[key].payload.unsupported = undefined;
    const before = clone(state), ids = new Map(s.bindings.placementIds);
    expect(() => encodePortable(state, s.bindings)).toThrow("unsupported JSON value");
    expect(state).toEqual(before); expect(s.bindings.placementIds).toEqual(ids);
  });
});
