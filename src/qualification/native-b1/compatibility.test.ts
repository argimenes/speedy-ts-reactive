// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { unwrap } from "solid-js/store";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { materializeLocalWorkspace } from "../../reactive-editor/workspace-manifest";
import { clone } from "../../block-tree/clone";
import { captureBlocks, cloneBlocks } from "../../block-tree/clipboard";
import { externalDefinitionLink } from "../../block-tree/external-reference";
import { admitNative, captureNative, nativeBytes, nativeText, decodeNative, nativeEnvelope } from "./resource";

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).reverse().forEach(f => f()));
function host(ids: string[] = ["a", "b"], workspaceId = "workspace") {
  const editor = new ReactiveEditor(materializeLocalWorkspace({ id: workspaceId, type: "workspace-block", children: [
    { id: "bank", type: "workspace-object-bank-block", children: ids.map(id => ({ id, type: "document-block", metadata: { documentId: `resource-${id}` }, children: [0, 1].map(i => ({ id: `${id}-${i}`, type: "standoff-editor-block", text: "Native linked words" })) })) },
  ] }));
  cleanup.push(() => editor.dispose());
  const main = editor.createView("main");
  const node = (id: string) => Object.values(main.state.nodes).find(n => n.payload.id === id)!;
  const property = (id: string) => (node(id).payload.standoffProperties as any[])[0];
  const annotate = (ids: string[]) => editor.linkedAnnotations.createForSegments(ids.map(id => ({ nodeKey: node(id).key, start: 0, end: 3 })), "codex/entity-reference", "entity-poe", { entityName: "Poe" });
  const capture = (id = "a") => captureNative(editor.repository.snapshot(), `resource-${id}`);
  return { editor, main, node, property, annotate, capture, bank: node("bank").contentKey };
}

describe("B1.1 resource-aware definitions", () => {
  it("keeps definitions in their canonical Document through native reopen, edit/delete and shared-occurrence undo", () => {
    const source = host(), id = source.annotate(["a-0", "a-1"]), target = host([]);
    const saved = nativeBytes(source.capture());
    const admitted = admitNative(target.editor.repository, saved, target.bank);
    const one = target.editor.createView("one", admitted.placementKey), two = target.editor.createView("two", admitted.placementKey);
    const text = Object.values(one.state.nodes).find(n => n.payload.id === "a-0")!;
    target.editor.linkedAnnotations.edit(text.key, 0, target.property("a-0"), { start: 0, end: 2, value: "changed" });
    expect(target.editor.linkedAnnotations.resolve(target.property("a-1"), target.node("a-1").contentKey).value).toBe("changed");
    expect((two.state.nodes[two.state.rootKey].payload.linkedAnnotations as any)[id].value).toBe("changed");
    target.editor.repository.undo(); expect(nativeBytes(target.capture())).toEqual(saved);
    target.editor.linkedAnnotations.deleteAll(id, target.property("a-0"), text.contentKey);
    expect(target.editor.linkedAnnotations.resolve(target.property("a-1"), target.node("a-1").contentKey).isDeleted).toBe(true);
    target.editor.repository.undo(); expect(nativeBytes(target.capture())).toEqual(saved);
    target.editor.disposeView(one); target.editor.disposeView(two); expect(nativeBytes(target.capture())).toEqual(saved);
  });
  it("cross-Document segments share one Workspace definition with explicit provenance, never copied into native resources", () => {
    const source = host(), id = source.annotate(["a-0", "b-0"]);
    const workspace = source.main.state.nodes[source.main.state.rootKey];
    expect(Object.keys(workspace.payload.linkedAnnotations as object)).toEqual([id]);
    for (const name of ["a", "b"]) {
      expect(source.node(name).payload.linkedAnnotations).toBeUndefined();
      expect(externalDefinitionLink(source.property(`${name}-0`))?.source).toEqual({ scope: "workspace", resourceId: "workspace" });
      expect(nativeText(source.capture(name))).not.toContain('"entity-poe"');
    }
    const target = host([]);
    for (const name of ["a", "b"]) admitNative(target.editor.repository, nativeBytes(source.capture(name)), target.bank);
    expect(target.editor.linkedAnnotations.resolve(target.property("a-0"), target.node("a-0").contentKey).value).toBeUndefined();
    // The Workspace owns/loads this authored registry separately, once.
    target.editor.commands.setPayloadField(target.main.state.rootKey, "linkedAnnotations", clone(unwrap(workspace.payload.linkedAnnotations)));
    expect(target.editor.linkedAnnotations.segments(id, target.property("a-0"), target.node("a-0").contentKey)).toHaveLength(2);
    target.editor.linkedAnnotations.edit(target.node("b-0").key, 0, target.property("b-0"), { start: 0, end: 2, value: "shared-edit" });
    expect(target.editor.linkedAnnotations.resolve(target.property("a-0"), target.node("a-0").contentKey).value).toBe("shared-edit");
    target.editor.repository.undo(); expect(target.editor.linkedAnnotations.resolve(target.property("a-0"), target.node("a-0").contentKey).value).toBe("entity-poe");
  });
  it("interprets the old root-registry rule on a detached capture without changing live ownership", () => {
    const source = host();
    source.editor.commands.setPayloadField(source.main.state.rootKey, "linkedAnnotations", { old: { id: "old", type: "codex/entity-reference", value: "legacy" } });
    source.editor.commands.setPayloadField(source.node("a-0").key, "standoffProperties", [{ id: "segment", annotationId: "old", type: "codex/entity-reference", start: 0, end: 2 }]);
    const before = source.editor.repository.snapshot(), saved = nativeBytes(source.capture());
    expect(source.editor.repository.snapshot()).toEqual(before);
    const target = host([], "different-workspace"); admitNative(target.editor.repository, saved, target.bank);
    target.editor.commands.setPayloadField(target.main.state.rootKey, "linkedAnnotations", { old: { value: "wrong-root" } });
    target.editor.commands.setPayloadField(target.node("a").key, "linkedAnnotations", { old: { value: "wrong-local" } });
    expect(externalDefinitionLink(target.property("a-0"))?.source).toEqual({ scope: "workspace", resourceId: "workspace" });
    expect(target.editor.linkedAnnotations.resolve(target.property("a-0"), target.node("a-0").contentKey).value).toBeUndefined();
  });
  it("resolves explicit foreign Document definitions and refuses ambiguous or pinned identities", () => {
    const f = host(), id = f.annotate(["a-0", "a-1"]);
    const foreign = { ...clone(unwrap(f.property("a-0"))), id: "foreign", externalDefinition: { format: "codex-external-definition-gate", version: 1,
      target: { kind: "definition", targetId: id, source: { scope: "document", resourceId: "resource-a" }, version: { kind: "unpinned" } } } };
    f.editor.commands.setPayloadField(f.node("b-0").key, "standoffProperties", [foreign]);
    expect(f.editor.linkedAnnotations.resolve(foreign, f.node("b-0").contentKey).value).toBe("entity-poe");
    f.editor.commands.setPayloadField(f.node("b").key, "metadata", { documentId: "resource-a" });
    expect(f.editor.linkedAnnotations.resolve(foreign, f.node("b-0").contentKey).value).toBeUndefined();
    expect(() => f.editor.linkedAnnotations.edit(f.node("b-0").key, 0, foreign, { start: 0, end: 2, value: "bad" })).toThrow("Ambiguous");
    f.editor.repository.undo();
    const pinned = clone(foreign) as any; pinned.externalDefinition.target.version = { kind: "revision", memoirId: "m", segmentId: "s", revisionId: "r" };
    expect(f.editor.linkedAnnotations.resolve(pinned, f.node("b-0").contentKey).value).toBeUndefined();
  });
  it("copies local linked annotations into the destination resource with fresh identity", () => {
    const f = host(), oldId = f.annotate(["a-0", "a-1"]);
    const fragment = cloneBlocks(captureBlocks(f.editor.repository.snapshot(), [f.node("a-0").placementKey, f.node("a-1").placementKey]));
    f.editor.commands.insertFragment(fragment, { kind: "at", parentKey: f.node("b").key, index: 0 });
    const definitions = f.node("b").payload.linkedAnnotations as any;
    expect(Object.keys(definitions)).toHaveLength(1); expect(Object.keys(definitions)[0]).not.toBe(oldId);
    expect(f.main.state.nodes[f.main.state.rootKey].payload.linkedAnnotations).toBeUndefined();
    expect(() => nativeBytes(f.capture("b"))).not.toThrow();
  });
  it("moving a linked segment across Documents retains its source definition and undoes atomically", () => {
    const f = host(), id = f.annotate(["a-0", "a-1"]), before = nativeBytes(f.capture("a"));
    f.editor.commands.move(f.node("a-0").key, { kind: "at", parentKey: f.node("b").key, index: 0 });
    expect(externalDefinitionLink(f.property("a-0"))?.source).toEqual({ scope: "document", resourceId: "resource-a" });
    expect(f.editor.linkedAnnotations.resolve(f.property("a-0"), f.node("a-0").contentKey).value).toBe("entity-poe");
    expect((f.node("a").payload.linkedAnnotations as any)[id]).toBeDefined();
    expect(f.node("b").payload.linkedAnnotations).toBeUndefined();
    expect(nativeText(f.capture("b"))).not.toContain('"entity-poe"');
    f.editor.repository.undo(); expect(nativeBytes(f.capture("a"))).toEqual(before);
  });
});

describe("B1.1 durable foreign transclusions", () => {
  it("retains live editing, saves only a descriptor, and rebinds either admission order in one shared repository", () => {
    const source = host();
    const pk = source.editor.commands.transclude(source.node("b-0").key, { kind: "at", parentKey: source.node("a").key, index: 0 });
    expect(source.editor.repository.state.placements[pk].resolvedReference).toMatchObject({ kind: "block", targetId: "b-0", source: { scope: "document", resourceId: "resource-b" }, version: { kind: "unpinned" } });
    source.editor.commands.replaceInlineRange(pk, 0, 0, "Shared ");
    const a = nativeBytes(source.capture("a")), b = nativeBytes(source.capture("b"));
    for (const order of [[a, b], [b, a]]) {
      const target = host([]); for (const bytes of order) admitNative(target.editor.repository, bytes, target.bank);
      const reference = Object.values(target.editor.repository.state.placements).find(p => p.resolvedReference?.targetId === "b-0")!;
      expect(reference.contentKey).toBe(target.node("b-0").contentKey);
      target.editor.commands.replaceInlineRange(reference.key, 0, 0, "Again ");
      expect(target.node("b-0").inlineContent).toHaveLength(source.node("b-0").inlineContent.length + 6);
      expect(nativeBytes(target.capture("a"))).toEqual(a); // foreign-only edits do not change A
      target.editor.repository.undo(); expect(nativeBytes(target.capture("b"))).toEqual(b);
    }
  });
  it("rejects stale provenance after a source identity change instead of fabricating a new source", () => {
    const f = host(); f.editor.commands.transclude(f.node("b-0").key, { kind: "at", parentKey: f.node("a").key, index: 0 });
    f.editor.commands.setPayloadField(f.node("b").key, "metadata", { documentId: "renamed-resource" });
    expect(() => f.capture()).toThrow("provenance");
    f.editor.repository.undo(); expect(() => f.capture()).not.toThrow();
  });
  it("keeps unavailable dependencies terminal and makes admission/rebinding undoable", () => {
    const f = host(); f.editor.commands.transclude(f.node("b-0").key, { kind: "at", parentKey: f.node("a").key, index: 0 });
    const target = host([]); admitNative(target.editor.repository, nativeBytes(f.capture("a")), target.bank);
    const missing = () => Object.values(target.editor.repository.state.placements).filter(p => p.externalReference);
    expect(missing()).toHaveLength(1);
    admitNative(target.editor.repository, nativeBytes(f.capture("b")), target.bank); expect(missing()).toHaveLength(0);
    target.editor.repository.undo(); expect(missing()).toHaveLength(1);
    target.editor.repository.redo(); expect(missing()).toHaveLength(0);
  });
  it("retains the source definition in its Document after its owned placement is removed", () => {
    const source = host(), original = source.node("b-0").placementKey;
    source.editor.commands.transclude(original, { kind: "at", parentKey: source.node("a").key, index: 0 });
    source.editor.commands.remove(original);
    const b = source.capture("b");
    expect(nativeEnvelope(b).definitionOwnerBlockIds).toContain("b-0");
    const target = host([]);
    admitNative(target.editor.repository, nativeBytes(source.capture("a")), target.bank);
    admitNative(target.editor.repository, nativeBytes(b), target.bank);
    const binding = Object.values(target.editor.repository.state.placements).find(p => p.resolvedReference?.targetId === "b-0")!;
    expect(binding).toBeDefined(); target.editor.commands.replaceInlineRange(binding.key, 0, 0, "Retained ");
    expect(nativeText(target.capture("b"))).toContain("Retained Native linked words");
  });
  it("rejects whole-resource deletion atomically while foreign retained definitions still depend on it", () => {
    const f = host(); f.editor.commands.transclude(f.node("b-0").key, { kind: "at", parentKey: f.node("a").key, index: 0 });
    const before = f.editor.repository.snapshot();
    expect(() => f.editor.commands.remove(f.node("b").key)).toThrow("definition owner");
    expect(f.editor.repository.snapshot()).toEqual(before);
  });
});

describe("B1.1 authored value contract", () => {
  it("preserves undefined, signed zero, nonfinite numbers and colliding tag-shaped user data", () => {
    const f = host(), values = { omittedContrast: {}, explicit: { value: undefined }, zero: -0, nan: NaN, positive: Infinity, negative: -Infinity,
      user: { $codexHistoryValue: ["undefined"], nested: { $codexHistoryValue: ["number", "NaN"] } } };
    f.editor.commands.setPayloadField(f.node("a-0").key, "authored", values);
    const target = host([]); admitNative(target.editor.repository, nativeBytes(f.capture()), target.bank);
    const actual = target.node("a-0").payload.authored as typeof values;
    expect(actual).toEqual(values); expect(Object.is(actual.zero, -0)).toBe(true);
    expect(Object.hasOwn(actual.explicit, "value")).toBe(true);
    expect(nativeBytes(target.capture())).toEqual(nativeBytes(f.capture()));
  });
  it("reads original B1 plain-JSON bytes and rejects unknown encodings and corrupt reserved value tags", () => {
    expect(() => decodeNative(new Uint8Array(readFileSync("artifacts/flint-b1/rich.mutable.json")))).not.toThrow();
    const f = host(), envelope = nativeEnvelope(f.capture());
    const bytes = (e: unknown) => new TextEncoder().encode(JSON.stringify(e));
    expect(() => decodeNative(bytes({ ...envelope, valueEncoding: "future-v99" }))).toThrow("value encoding");
    envelope.document.blocks.find(b => b.id === "a-0")!.properties.bad = { $codexHistoryValue: ["unknown-kind"] };
    expect(() => decodeNative(bytes(envelope))).toThrow("unknown value tag");
  });
});
