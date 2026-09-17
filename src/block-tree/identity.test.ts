import { describe, expect, it } from "vitest";
import { clone } from "./clone";
import { decodeDocument, encodeDocument } from "./codecs";
import { decodeExtendedRepository, encodeExtendedRepository } from "./extended-codec";
import { applyBlockIdentityNormalization, BlockIdentityIndex, isAuthoredBlock, planBlockIdentityNormalization, readBlockId } from "./identity";
import { CanonicalRepository } from "./repository";
import { setupCaptureSpike } from "./test-support/captured-replay";
import type { ExistingBlockDto } from "./types";
import { captureBlocks, cloneBlocks } from "./clipboard";
import { TreeCommands } from "./commands";

describe("explicit authored Block identity", () => {
  it("normalizes missing/null/blank IDs deterministically without changing input, Cells or opaque data", () => {
    const dto = { type: "document-block", children: [
      { id: null, type: "standoff-editor-block", text: "😀a", children: null, relation: {
        leftMargin: { id: " ", type: "left-margin-block", children: [] }, opaque: { id: "external" },
      } },
      { id: " legacy ", type: "unknown-block", extra: null },
    ] };
    // Deliberately malformed legacy input can contain a null public ID.
    const state = decodeDocument(dto as unknown as ExistingBlockDto).state, original = clone(state);
    let serial = 0;
    const plan = planBlockIdentityNormalization(state, () => `assigned-${++serial}`);
    expect(plan.status).toBe("ready");
    const normalized = applyBlockIdentityNormalization(state, plan);
    expect(state).toEqual(original);
    expect(serial).toBe(3);
    expect(Object.values(normalized.contents).filter(isAuthoredBlock).map(readBlockId)).toEqual(["assigned-1", "assigned-2", "assigned-3", " legacy "]);
    expect(Object.values(normalized.contents).filter(c => !isAuthoredBlock(c)).every(c => c.payload.id === undefined)).toBe(true);
    const output = encodeDocument(normalized);
    expect(output.children![0].children).toBeNull();
    expect(output.children![0].relation!.opaque).toEqual({ id: "external" });
    expect(planBlockIdentityNormalization(normalized)).toEqual({ status: "ready", assignments: [] });
    expect(encodeDocument(decodeDocument(output).state)).toEqual(output);
    expect(encodeDocument(state)).toEqual(dto);
    expect(() => applyBlockIdentityNormalization(normalized, plan)).toThrow(/Stale/);
  });

  it("reports all ambiguous IDs before allocating or applying anything", () => {
    const state = decodeDocument({ type: "document-block", children: [
      { id: "same", type: "plain-text-block" }, { id: "same", type: "plain-text-block" },
      { id: 42 as unknown as string, type: "plain-text-block" },
    ] }).state;
    const original = clone(state);
    const plan = planBlockIdentityNormalization(state, () => { throw new Error("must not allocate"); });
    expect(plan.status).toBe("ambiguous");
    if (plan.status === "ambiguous") expect(plan.issues.map(x => x.kind).sort()).toEqual(["duplicate-id", "invalid-id"]);
    expect(() => applyBlockIdentityNormalization(state, plan)).toThrow(/Ambiguous/);
    expect(state).toEqual(original);
    expect(() => new CanonicalRepository(state)).not.toThrow();
    expect(() => new CanonicalRepository(state, { enforceBlockIdentity: true })).toThrow();
  });

  it("rejects allocator collisions and stale plans without partial normalization", () => {
    const state = decodeDocument({ id: "root", type: "document-block", children: [{ type: "unknown-block" }] }).state;
    expect(() => planBlockIdentityNormalization(state, () => "root")).toThrow(/duplicate/);
    const plan = planBlockIdentityNormalization(state);
    const changed = clone(state);
    changed.contents[changed.placements[changed.contents[changed.placements[changed.rootPlacementKey].contentKey].children[0]].contentKey].payload.id = "assigned-elsewhere";
    expect(() => applyBlockIdentityNormalization(changed, plan)).toThrow(/Stale/);
  });

  it("allows shared content and rejects direct ID changes/collisions before mutation", () => {
    const s = setupCaptureSpike();
    const ref = s.commands.transclude(s.block("p").key, { kind: "at", parentKey: s.view.state.rootKey, index: 2 });
    expect(planBlockIdentityNormalization(s.repository.snapshot())).toEqual({ status: "ready", assignments: [] });
    expect(decodeExtendedRepository(encodeExtendedRepository(s.repository.snapshot()))).toEqual(s.repository.snapshot());
    const before = s.repository.snapshot(), count = s.events.length;
    expect(() => s.commands.setPayloadField(s.block("p").key, "id", "changed")).toThrow(/identity/);
    const q = clone(before.contents[s.block("q").contentKey]); q.payload.id = "p";
    expect(() => s.repository.commit("collision", [{ kind: "put-content", record: q }])).toThrow(/identity/);
    expect(s.repository.snapshot()).toEqual(before);
    expect(s.events).toHaveLength(count);
    s.commands.unlink(ref);
    expect(s.block("p").payload.id).toBe("p");
    s.repository.undo();
    expect(s.repository.state.placements[ref].contentKey).toBe(s.block("p").contentKey);
  });

  it("validates final identity assignments atomically and excludes image Cells", () => {
    const s = setupCaptureSpike();
    s.commands.insertInlineImage(s.block("p").key, 2, { assetId: "asset", src: "/image", alt: "image" });
    expect(() => new BlockIdentityIndex(s.repository.snapshot())).not.toThrow();
    const original = clone(s.repository.readState().contents[s.block("p").contentKey]);
    const index = new BlockIdentityIndex(s.repository.snapshot());
    const next = { ...clone(original), key: "replacement-runtime-key" };
    const delta = index.validateCommit([{ kind: "put-content", record: next }, { kind: "remove-content", key: original.key }]);
    index.acceptCommit(delta);
    expect(() => index.validateCommit([{ kind: "put-content", record: original }])).toThrow(/Duplicate/);
  });

  it("assigns IDs throughout inserted, related, replaced and fragment content without modifying caller data", () => {
    const s = setupCaptureSpike();
    const dto = { type: "container-block", children: [{ type: "custom-cell", children: null }, { type: "standoff-editor-block", text: "text" }] };
    const original = clone(dto);
    const inserted = s.commands.insert(dto, { kind: "after", anchorKey: s.block("q").key });
    expect(dto).toEqual(original);
    const insertedNode = s.view.nodeForPlacement(inserted)!;
    const oldChildIds = insertedNode.children.map(key => s.view.node(key)!.payload.id);
    expect(oldChildIds.every(Boolean)).toBe(true); // Unknown *-cell is authored.
    const previousId = insertedNode.payload.id;
    s.commands.replace(inserted, { type: "page-block" }, "preserve");
    const replacement = s.view.nodeForPlacement(inserted)!;
    expect(replacement.payload.id).not.toBe(previousId);
    expect(replacement.children.map(key => s.view.node(key)!.payload.id)).toEqual(oldChildIds);
    expect(s.events.at(-1)!.commands[0].relation?.kind).toBe("replace");
    s.repository.undo();
    expect(s.view.nodeForPlacement(inserted)!.payload.id).toBe(previousId);
    s.commands.setRelation(s.block("p").key, "leftMargin", { type: "left-margin-block", children: [{ type: "plain-text-block", text: "note" }] });
    const raw = decodeDocument({ type: "container-block", children: [{ type: "plain-text-block", text: "fragment" }] }).state;
    const fragment = captureBlocks(raw, [raw.rootPlacementKey]);
    const saved = clone(fragment);
    s.commands.insertFragment(fragment, { kind: "after", anchorKey: inserted });
    expect(fragment).toEqual(saved);
    expect(planBlockIdentityNormalization(s.repository.snapshot())).toEqual({ status: "ready", assignments: [] });
    const before = s.repository.snapshot();
    expect(() => s.commands.insert({ id: "p", type: "plain-text-block" }, { kind: "after", anchorKey: inserted })).toThrow(/identity/);
    expect(s.repository.snapshot()).toEqual(before);
  });

  it("keeps split/join/empty and multiline identities and records genealogy", () => {
    const s = setupCaptureSpike();
    const left = s.block("p").contentKey;
    const right = s.commands.splitStandoff(s.block("p").key, 3);
    const rightId = s.view.nodeForPlacement(right)!.payload.id;
    expect(rightId).toBeTruthy(); expect(rightId).not.toBe("p");
    expect(s.block("p").contentKey).toBe(left);
    expect(s.events.at(-1)!.commands[0].relation).toMatchObject({ kind: "split", source: { blockId: "p" }, created: { blockId: rightId }, at: 3 });
    s.commands.joinStandoff(s.block("p").key, right);
    expect(s.block("p").contentKey).toBe(left);
    expect(s.events.at(-1)!.commands[0].relation).toMatchObject({ kind: "join", survivor: { blockId: "p" }, absorbed: { blockId: rightId } });
    s.repository.undo(); expect(s.view.nodeForPlacement(right)!.payload.id).toBe(rightId);
    s.repository.redo();
    const empty = s.commands.insertEmptyStandoffSibling(s.block("q").key, "after");
    expect(s.view.nodeForPlacement(empty)!.payload.id).toBeTruthy();
    s.commands.replaceAcrossBlocks([
      { placementKey: s.block("p").placementKey, start: 2, end: 6 },
      { placementKey: s.block("q").placementKey, start: 0, end: 2 },
    ], "first\nsecond\nthird");
    const relation = s.events.at(-1)!.commands[0].relation;
    expect(relation?.kind).toBe("cross-text-replace");
    if (relation?.kind !== "cross-text-replace") throw new Error("Missing provenance");
    expect(relation.inputs.map(x => x.blockId)).toEqual(["p", "q"]);
    expect(relation.outputs[0].blockId).toBe("p");
    expect(new Set(relation.outputs.map(x => x.blockId)).size).toBe(3);
    expect(relation.outputs.every(x => x.blockId)).toBe(true);
    expect(planBlockIdentityNormalization(s.repository.snapshot())).toEqual({ status: "ready", assignments: [] });
  });

  it("copies shared content once and remaps local references and linked definitions without touching opaque data", () => {
    const s = setupCaptureSpike({ id: "doc", type: "document-block", linkedAnnotations: {
      definition: { id: "definition", type: "codex/block-reference", value: "shared" },
    }, children: [{ id: "group", type: "container-block", relation: { opaque: { id: "shared", value: "shared" } }, children: [
      { id: "shared", type: "standoff-editor-block", text: "text", standoffProperties: [{ id: "segment", annotationId: "definition", type: "codex/block-reference", start: 0, end: 1 }] },
      { id: "host", type: "container-block", children: [] },
      { id: "linker", type: "plain-text-block", blockProperties: [
        { id: "reference", type: "codex/block-reference", value: "shared" },
        { id: "entity", type: "codex/entity-reference", value: "shared" },
      ] },
    ] }] });
    s.commands.transclude(s.block("shared").key, { kind: "at", parentKey: s.block("host").key, index: 0 });
    const copyKey = s.commands.copy(s.block("group").key, { kind: "after", anchorKey: s.block("group").key });
    const copy = s.view.nodeForPlacement(copyKey)!;
    const [shared, host, linker] = copy.children.map(key => s.view.node(key)!);
    const reference = s.view.node(host.children[0])!;
    expect(reference.contentKey).toBe(shared.contentKey);
    expect(shared.payload.id).not.toBe("shared");
    const properties = linker.payload.blockProperties as Array<Record<string, unknown>>;
    expect(properties[0].value).toBe(shared.payload.id); expect(properties[1].value).toBe("shared");
    expect(s.repository.readState().contents[copy.contentKey].opaqueRelations.opaque).toEqual({ id: "shared", value: "shared" });
    const segment = (shared.payload.standoffProperties as Array<Record<string, unknown>>)[0];
    expect(segment.id).not.toBe("segment"); expect(segment.annotationId).not.toBe("definition");
    const root = s.repository.readState().contents[s.view.node(s.view.state.rootKey)!.contentKey];
    const registry = root.payload.linkedAnnotations as Record<string, Record<string, unknown>>;
    expect(registry[String(segment.annotationId)].value).toBe(shared.payload.id);
    expect(registry.definition.value).toBe("shared");
    const relation = s.events.at(-1)!.commands[0].relation;
    expect(relation?.kind).toBe("copy");
    if (relation?.kind !== "copy") throw new Error("Missing copy provenance");
    expect(relation.pairs.filter(pair => pair.source.blockId === "shared")).toHaveLength(1);
    expect(planBlockIdentityNormalization(s.repository.snapshot())).toEqual({ status: "ready", assignments: [] });
    s.repository.undo(); expect(s.view.nodeForPlacement(copyKey)).toBeUndefined();
    s.repository.redo(); expect(s.view.nodeForPlacement(copyKey)!.payload.id).toBe(copy.payload.id);
  });

  it("gives id-less copied/detached/split Blocks IDs while leaving legacy originals unchanged", () => {
    const state = decodeDocument({ type: "document-block", children: [{ type: "standoff-editor-block", text: "legacy" }] }).state;
    const repository = new CanonicalRepository(state);
    const commands = new TreeCommands(repository, key => key);
    const root = state.rootPlacementKey, source = state.contents[state.placements[root].contentKey].children[0];
    const content = (placement: string) => repository.readState().contents[repository.readState().placements[placement].contentKey];
    const copied = commands.copy(source, { kind: "after", anchorKey: source });
    const ref = commands.transclude(source, { kind: "after", anchorKey: copied });
    commands.detach(ref);
    const split = commands.splitStandoff(source, 3);
    expect(content(source).payload.id).toBeUndefined();
    expect([copied, ref, split].map(key => content(key).payload.id).every(Boolean)).toBe(true);
    expect(new Set([copied, ref, split].map(key => content(key).payload.id)).size).toBe(3);
    const fragmented = cloneBlocks(captureBlocks(state, [source]));
    expect(Object.values(fragmented.state.contents).filter(isAuthoredBlock).every(c => !!readBlockId(c))).toBe(true);
  });

  it("retains ordinary copy export limitations and keeps Background identity stable", () => {
    const s = setupCaptureSpike();
    s.commands.insertInlineImage(s.block("p").key, 2, { assetId: "asset", src: "/image", alt: "image" });
    const before = s.repository.snapshot();
    expect(() => s.commands.copy(s.block("p").key, { kind: "after", anchorKey: s.block("q").key })).toThrow(/inline|image/i);
    expect(s.repository.snapshot()).toEqual(before);
    const background = s.commands.insert({ type: "image-background-block", metadata: { url: "/image" } }, { kind: "after", anchorKey: s.block("q").key });
    const id = s.view.nodeForPlacement(background)!.payload.id;
    s.commands.setBackground(background, { type: "video-background-block", metadata: { url: "/video" } });
    expect(s.view.nodeForPlacement(background)!.payload.id).toBe(id);
    expect(() => s.commands.setBackground(background, { id: "changed", type: "image-background-block" })).toThrow(/identity/);
    s.commands.remove(background); s.repository.undo(); expect(s.view.nodeForPlacement(background)!.payload.id).toBe(id);

    const group = s.commands.insert({ type: "container-block", children: [] }, { kind: "after", anchorKey: s.block("q").key });
    s.commands.transclude(group, { kind: "at", parentKey: group, index: 0 });
    const cyclic = s.repository.snapshot(), count = s.events.length;
    expect(() => s.commands.copy(group, { kind: "after", anchorKey: s.block("q").key })).toThrow(/cyclic/i);
    expect(s.repository.snapshot()).toEqual(cyclic);
    expect(s.events).toHaveLength(count);
  });
});
