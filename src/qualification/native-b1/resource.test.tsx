// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { ReactiveTreeView } from "../../rendering/reactive-tree-view";
import { registerApplicationViews } from "../../application/features";
import { materializeLocalWorkspace, createWorkspaceSaveBundle, materializeWorkspace, validateDocumentSource } from "../../reactive-editor/workspace-manifest";
import { createFormattedDocument, documentFormats } from "../../features/document-formats/model";
import { timerBlockDto } from "../../features/timer/model";
import { objectDto } from "../../features/three-d-object/model";
import { anchorCapabilities } from "../../application/anchor-capabilities";
import { createTextSuperposition } from "../../runtime/text-superposition";
import { clone } from "../../block-tree/clone";
import { encodeDocument } from "../../block-tree/codecs";
import type { ExistingBlockDto } from "../../block-tree/types";
import type { ResourceSnapshot } from "../../history/stage-c-gates/resource";
import type { DeepReadonly } from "../../block-tree/commit-capture";
import { admitNative, captureNative, decodeNative, nativeBytes, nativeEnvelope, nativeText } from "./resource";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); });
const doc = (): ExistingBlockDto => ({ id: "doc", type: "document-block", metadata: { documentId: "resource", folder: ".", filename: "example.mutable.json" }, children: [
  { id: "text", type: "standoff-editor-block", text: "A😀é漢\nSecond line", children: null, relation: null },
  { id: "other", type: "standoff-editor-block", text: "Another paragraph" },
] });
function host(documents: ExistingBlockDto[] = []) {
  const editor = new ReactiveEditor(materializeLocalWorkspace({ id: "workspace", type: "workspace-block", children: [
    { id: "bank", type: "workspace-object-bank-block", children: documents },
  ] }), { features: { textSuperposition: true } });
  cleanups.push(() => editor.dispose());
  const main = editor.createView("main");
  const node = (id: string) => Object.values(main.state.nodes).find(n => n.payload.id === id)!;
  return { editor, main, node, bank: node("bank").contentKey };
}
function rich() {
  const f = host([doc()]), { editor, node } = f;
  editor.commands.insert(timerBlockDto({ x: 18, y: 32 }), { kind: "at", parentKey: node("doc").key, index: 2 });
  editor.commands.insert(objectDto(), { kind: "at", parentKey: node("doc").key, index: 3 });
  editor.commands.insertInlineImage(node("text").key, 2, { assetId: "asset", src: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="teal"/></svg>'), alt: "Native image", width: 40, height: 30, status: "ready" });
  editor.commands.ensureMargin(node("other").key, "left");
  editor.rangeAnnotations.apply([editor.textRanges.snapshot(node("text").key, 3, 5)], "style/rainbow");
  editor.linkedAnnotations.createBatch([[editor.textRanges.snapshot(node("other").key, 0, 3)]], "codex/entity-reference", "entity-poe", { name: "Poe" }, editor.repository.state.revision, "Local entity mention");
  createTextSuperposition(editor, node("other"), 4, 6);
  anchorCapabilities(editor, { owner: "b1", active: () => true, own: fn => fn, defer: fn => fn() }).commit(node("other").key, node("text").key, { x: 120, y: -12 });
  editor.commands.setPayloadField(node("text").key, "futureFeature", { version: 99, object: { unknown: [null, false, 42, "kept"] } });
  // A normal command-created reference shares one canonical text/annotation body.
  editor.commands.transclude(node("text").key, { kind: "at", parentKey: node("doc").key, index: 0 });
  return f;
}
const capture = (f: ReturnType<typeof host>, resource = "resource") => captureNative(f.editor.repository.snapshot(), resource);
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
// Independent canonical oracle: excludes ONLY regenerated private keys/counters.
function semantics(r: DeepReadonly<ResourceSnapshot>) {
  const edge = (key: string) => {
    const p = r.placements[key];
    return { id: p.placementId, kind: p.kind, target: p.target.kind === "external" ? p.target.reference : r.contents[p.target.contentKey].payload.id };
  };
  return { resourceId: r.resourceId, root: edge(r.rootPlacementKey), blocks: Object.values(r.contents)
    .filter(c => !["text-cell", "image-cell"].includes(c.viewType)).map(c => ({
      payload: c.payload, type: c.viewType, owner: c.definitionOwnerKey ? r.contents[c.definitionOwnerKey].payload.id : null,
      children: c.children.map(edge), relations: Object.fromEntries(Object.entries(c.ownedRelations).map(([k, v]) => [k, edge(v)])),
      opaque: c.opaqueRelations, wireChildren: c.wireChildren, wireRelation: c.wireRelation,
      inline: c.inlineContent.map(key => { const p = r.placements[key]; if (p.target.kind !== "local") throw Error("inline"); const c = r.contents[p.target.contentKey]; return { type: c.viewType, payload: c.payload }; }),
    })).sort((a, b) => String(a.payload.id).localeCompare(String(b.payload.id))) };
}

describe("B1 isolated canonical native proof", () => {
  it("rich producers: capture, UTF-8 bytes, fresh decode, shared-host admission, editing, undo/redo and re-save", () => {
    const source = rich(), before = source.editor.repository.snapshot(), captured = capture(source), encoded = nativeBytes(captured);
    expect(source.editor.repository.snapshot()).toEqual(before);
    const decoded = decodeNative(encoded);
    expect(semantics(decoded)).toEqual(semantics(captured));
    expect(Object.keys(decoded.contents).every(k => !captured.contents[k])).toBe(true);
    expect(nativeText(decoded)).toBe(nativeText(captured));
    const target = host(), repository = target.editor.repository;
    const admitted = admitNative(repository, encoded, target.bank);
    expect(target.editor.repository).toBe(repository);
    expect(nativeText(capture(target))).toBe(nativeText(captured));
    const a = target.editor.createView("a", admitted.placementKey), b = target.editor.createView("b", admitted.placementKey);
    const text = Object.values(a.state.nodes).find(n => n.payload.id === "text")!;
    target.editor.commands.replaceInlineRange(text.key, 0, 0, "Edited ");
    expect(Object.values(b.state.nodes).filter(n => n.payload.id === "text")).toHaveLength(2);
    const edited = nativeBytes(capture(target)); expect(edited).not.toEqual(encoded);
    repository.undo(); expect(nativeText(capture(target))).toBe(nativeText(captured));
    repository.redo(); expect(nativeBytes(capture(target))).toEqual(edited);
    target.editor.disposeView(a); target.editor.disposeView(b);
    expect(nativeBytes(capture(target))).toEqual(edited);
    const reopened = host(); admitNative(reopened.editor.repository, edited, reopened.bank);
    expect(nativeBytes(capture(reopened))).toEqual(edited);
    if (process.env.B1_ARTIFACTS) {
      const folder = process.env.B1_ARTIFACTS === "1" ? "artifacts/flint-b1" : process.env.B1_ARTIFACTS;
      mkdirSync(folder, { recursive: true });
      writeFileSync(`${folder}/rich.mutable.json`, encoded);
      writeFileSync(`${folder}/rich-resaved.mutable.json`, edited);
    }
  });
  it("capture semantics are identical with zero, one and multiple transient occurrences", () => {
    const f = host([doc()]), initial = nativeText(capture(f));
    f.editor.disposeView(f.main);
    expect(nativeText(capture(f))).toBe(initial);
    const key = capture(f).rootPlacementKey, a = f.editor.createView("a", key);
    expect(nativeText(capture(f))).toBe(initial);
    const b = f.editor.createView("b", key);
    expect(nativeText(capture(f))).toBe(initial);
    f.editor.disposeView(a); f.editor.disposeView(b);
    expect(nativeText(capture(f))).toBe(initial);
  });
  it.each(documentFormats)("actual $id Document format producer survives native bytes/admission", format => {
    const produced = createFormattedDocument(format.id, new Date("2026-09-29T00:00:00Z")).document;
    const f = host([produced]), captured = capture(f, produced.id!), target = host();
    admitNative(target.editor.repository, nativeBytes(captured), target.bank);
    expect(nativeText(capture(target, produced.id!))).toBe(nativeText(captured));
  });
  it("reuses compatible canonical identity; rejects stale bytes, collisions and ambiguity atomically", () => {
    const source = host([doc()]), encoded = nativeBytes(capture(source)), target = host();
    const admitted = admitNative(target.editor.repository, encoded, target.bank), before = target.editor.repository.snapshot();
    expect(admitNative(target.editor.repository, encoded, target.bank)).toEqual({ ...admitted, reused: true });
    expect(target.editor.repository.snapshot()).toEqual(before);
    target.editor.commands.replaceInlineRange(target.node("text").key, 0, 0, "Dirty ");
    const dirty = target.editor.repository.snapshot();
    expect(() => admitNative(target.editor.repository, encoded, target.bank)).toThrow("disk/live resource conflict");
    expect(target.editor.repository.snapshot()).toEqual(dirty);
    target.editor.repository.undo(); expect(nativeBytes(capture(target))).toEqual(encoded);
    const collision = host([{ id: "another", type: "document-block", children: [{ id: "text", type: "plain-text-block", text: "Taken" }] }]);
    const original = collision.editor.repository.snapshot();
    expect(() => admitNative(collision.editor.repository, encoded, collision.bank)).toThrow("Block identity collision");
    expect(collision.editor.repository.snapshot()).toEqual(original);
    const ambiguous = clone(source.editor.repository.snapshot());
    ambiguous.contents.duplicate = { ...clone(ambiguous.contents[source.node("doc").contentKey]), key: "duplicate", payload: { id: "different-root", metadata: { documentId: "resource" } } };
    expect(() => captureNative(ambiguous, "resource")).toThrow("ambiguous");
    expect(() => captureNative(ambiguous, "missing")).toThrow("missing");
  });
  it("unknown authored payloads survive; unknown reserved fields/versions and malformed ownership fail", () => {
    const f = rich(), envelope = nativeEnvelope(capture(f));
    for (const mutate of [
      (e: any) => { e.extra = true; }, (e: any) => { e.version = 2; },
      (e: any) => { e.document.blocks[0].extra = true; },
      (e: any) => { e.document.root.target.extra = true; },
      (e: any) => { e.definitionOwnerBlockIds = ["missing"]; },
      (e: any) => { e.resourceId = "wrong"; },
      (e: any) => { e.document.blocks.push({ id: "orphan", type: "plain-text-block", properties: { text: "authored" } }); },
    ]) { const value = clone(envelope); mutate(value); expect(() => decodeNative(bytes(value))).toThrow(); }
    expect(nativeText(decodeNative(bytes(envelope)))).toContain('"futureFeature"');
  });
  it("an absent feature's unknown Block, deleted properties and opaque relations remain authored data", () => {
    const f = host([doc()]);
    f.editor.commands.insert({ id: "unknown", type: "future-feature-block", metadata: { version: 42, settings: [null, false] },
      blockProperties: [{ type: "future/property", isDeleted: true, value: "keep" }],
      relation: { opaque: { id: "not-an-edge", data: [1, 2, 3] } }, children: null,
    }, { kind: "at", parentKey: f.node("doc").key, index: 0 });
    const captured = capture(f), target = host(); admitNative(target.editor.repository, nativeBytes(captured), target.bank);
    expect(semantics(capture(target))).toEqual(semantics(captured));
    expect(target.node("unknown").viewType).toBe("future-feature-block");
  });
  it("preserves retained unplaced definitions and a reference cycle without inventing membership", () => {
    const source = host([doc()]), graph = clone(capture(source)) as ResourceSnapshot;
    const template = source.editor.repository.snapshot().contents[source.node("doc").contentKey];
    const root = graph.placements[graph.rootPlacementKey]; if (root.target.kind !== "local") throw Error("root");
    graph.contents.retained = { ...clone(template), key: "retained", viewType: "container-block", payload: { id: "retained", type: "container-block" },
      children: ["cycle"], definitionOwnerKey: root.target.contentKey };
    graph.placements.cycle = { key: "cycle", placementId: "retained-cycle", kind: "reference", target: { kind: "local", contentKey: "retained" } };
    const target = host(); admitNative(target.editor.repository, nativeBytes(graph), target.bank);
    expect(nativeText(capture(target))).toBe(nativeText(graph));
    expect(nativeEnvelope(capture(target)).definitionOwnerBlockIds).toEqual(["retained"]);
    expect(semantics(capture(target))).toEqual(semantics(graph));
  });
  it("explicit foreign descriptors stay terminal and reject unknown reserved target fields", () => {
    const source = host([doc()]), envelope = nativeEnvelope(capture(source));
    const root = envelope.document.blocks.find(b => b.id === "doc")!;
    root.children!.push({ placementId: "external", kind: "reference", target: { kind: "external", reference: {
      kind: "block", targetId: "foreign-block", source: { scope: "document", resourceId: "foreign-resource" }, version: { kind: "unpinned" },
    } } });
    const target = host(); admitNative(target.editor.repository, bytes(envelope), target.bank);
    expect(nativeText(capture(target))).toBe(nativeText(decodeNative(bytes(envelope))));
    expect(Object.values(target.editor.repository.state.contents).some(c => c.payload.id === "foreign-block")).toBe(false);
    (root.children!.at(-1)!.target as any).reference.source.unknown = 1;
    expect(() => decodeNative(bytes(envelope))).toThrow("reserved");
  });
  it("legacy single-file Workspace and v1 manifest remain compatible for legacy Documents", async () => {
    const source = host([doc()]);
    const local = materializeLocalWorkspace(source.editor.persistence.captureWorkspace().document);
    const bundle = await createWorkspaceSaveBundle(source.editor.repository.snapshot(), [], "workspace");
    const loaded = materializeWorkspace(bundle.manifest, new Map(bundle.documents.map(d => [d.documentId, d.document])));
    expect(Object.values(local.state.contents).filter(c => c.viewType === "document-block")).toHaveLength(1);
    expect(Object.values(loaded.state.contents).filter(c => c.viewType === "document-block")).toHaveLength(1);
    expect(bundle.documents[0].documentId).toBe("resource");
    const native = rich();
    expect(() => encodeDocument(native.editor.repository.snapshot(), capture(native).rootPlacementKey)).toThrow("Inline image");
  });
  it("v1 manifest can name native files, but its tree reader cannot admit the envelope", async () => {
    const f = host([doc()]), envelope = nativeEnvelope(capture(f));
    expect(validateDocumentSource({ kind: "document-store", folder: ".", filename: "example.mutable.json" }).filename).toBe("example.mutable.json");
    const bundle = await createWorkspaceSaveBundle(f.editor.repository.snapshot(), [], "workspace");
    const wrong = materializeWorkspace(bundle.manifest, new Map([["resource", envelope as unknown as ExistingBlockDto]]));
    // Characterization, not a supported import: the old tree decoder creates an
    // unknown Block instead of the native graph. Never use it for native input.
    expect(Object.values(wrong.state.contents).filter(c => c.viewType === "document-block")).toHaveLength(0);
  });
  it("legacy tree export duplicates a native reference body and drops its edge role", () => {
    const f = host([doc()]);
    f.editor.commands.transclude(f.node("text").key, { kind: "at", parentKey: f.node("doc").key, index: 0 });
    const target = host(); admitNative(target.editor.repository, nativeBytes(capture(f)), target.bank);
    const legacy = encodeDocument(target.editor.repository.snapshot(), capture(target).rootPlacementKey);
    expect(legacy.children!.filter(c => c.id === "text")).toHaveLength(2);
    expect(legacy.children!.filter(c => c.id === "text").every(c => !("kind" in c))).toBe(true);
  });
});

describe("B1 compatibility findings after B1.1 (nested resources remain gated)", () => {
  it.each(["main-list-block", "membrane-block"])("preserves exact authored alias %s alongside canonical runtime type", alias => {
    const original = doc(); original.type = alias;
    const f = host([original]);
    expect(f.node("doc").viewType).toBe("document-block");
    const target = host(); admitNative(target.editor.repository, nativeBytes(capture(f)), target.bank);
    expect(target.node("doc").viewType).toBe("document-block"); expect(target.node("doc").payload.type).toBe(alias);
    expect(semantics(capture(target))).toEqual(semantics(capture(f)));
  });
  it.each([new Date("2026-09-29T00:00:00Z"), new Map([["a", 1]])])("runtime object %s remains outside the authored value grammar", value => {
    const f = host([doc()]);
    f.editor.commands.setPayloadField(f.node("text").key, "authoredExtension", { value });
    expect(() => nativeBytes(capture(f))).toThrow();
  });
  it("actual linked annotation producer owns a same-Document definition locally", () => {
    const f = host([doc()]);
    const annotation = f.editor.linkedAnnotations.createForSegments(["text", "other"].map(id => ({ nodeKey: f.node(id).key, start: 0, end: 1 })), "codex/entity-reference", "entity-poe");
    const state = f.editor.repository.snapshot(), root = state.contents[state.placements[state.rootPlacementKey].contentKey];
    expect(root.payload.linkedAnnotations).toBeUndefined();
    expect((f.node("doc").payload.linkedAnnotations as any)[annotation].value).toBe("entity-poe");
    expect(nativeText(decodeNative(nativeBytes(capture(f))))).toBe(nativeText(capture(f)));
  });
  it("Document-owned linked registry resolves after admission into Workspace", () => {
    const editor = new ReactiveEditor(doc()); cleanups.push(() => editor.dispose());
    const view = editor.createView("single"), text = Object.values(view.state.nodes).find(n => n.payload.id === "text")!;
    editor.linkedAnnotations.createForSegments([{ nodeKey: text.key, start: 0, end: 1 }], "codex/entity-reference", "entity-poe");
    const encoded = nativeBytes(captureNative(editor.repository.snapshot(), "resource")), target = host();
    admitNative(target.editor.repository, encoded, target.bank);
    const paragraph = target.node("text"), property = (paragraph.payload.standoffProperties as any[])[0];
    expect(target.editor.linkedAnnotations.resolve(property, paragraph.contentKey).value).toBe("entity-poe");
  });
  it("actual insert command accepts an owned nested Document that the resource validator rejects", () => {
    const f = host([doc()]);
    f.editor.commands.insert(createFormattedDocument("card").document, { kind: "at", parentKey: f.node("doc").key, index: 0 });
    expect(() => capture(f)).toThrow("nested resource");
  });
  it("actual transclusion command captures a foreign dependency without copying its body", () => {
    const other = { id: "foreign-doc", type: "document-block", children: [{ id: "foreign-text", type: "standoff-editor-block", text: "Foreign" }] };
    const f = host([doc(), other]);
    f.editor.commands.transclude(f.node("foreign-text").key, { kind: "at", parentKey: f.node("doc").key, index: 0 });
    const saved = capture(f);
    expect(Object.values(saved.contents).some(c => c.payload.id === "foreign-text")).toBe(false);
    expect(Object.values(saved.placements).some(p => p.target.kind === "external" && p.target.reference.targetId === "foreign-text")).toBe(true);
  });
  it("actual rich clipboard paste preserves own undefined dimensions through native bytes and admission", () => {
    const f = host([doc()]); registerApplicationViews(f.editor);
    const view = f.editor.createView("editing", f.node("doc").placementKey), hostElement = document.body.appendChild(document.createElement("div"));
    cleanups.push(render(() => <ReactiveTreeView editor={f.editor} projection={view} />, hostElement));
    f.editor.installGateway(document);
    const text = Object.values(view.state.nodes).find(n => n.payload.id === "text")!, mount = f.editor.mounts.get(text.key)!;
    f.editor.focus.request(text.key); mount.restoreInlineSelection!({ anchor: 0, head: 0 });
    f.editor.selections.setPrimary(text.key, text.contentKey, text.viewId, 0, 0);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: (type: string) => type === "application/json" ? JSON.stringify({ source: "codex", format: "standoff-inline-v1", data: [[{ kind: "image", assetId: "pasted", src: "/image.png", alt: "Pasted" }]] }) : "" } });
    mount.focusElement.dispatchEvent(event);
    const image = Object.values(f.editor.repository.state.contents).find(c => c.viewType === "image-cell")!;
    expect(image).toBeDefined(); expect(Object.hasOwn(image.payload, "width")).toBe(true); expect(image.payload.width).toBeUndefined();
    const target = host(); admitNative(target.editor.repository, nativeBytes(capture(f)), target.bank);
    const reopened = Object.values(target.editor.repository.state.contents).find(c => c.viewType === "image-cell")!;
    expect(Object.hasOwn(reopened.payload, "width")).toBe(true); expect(reopened.payload.width).toBeUndefined();
    expect(Object.hasOwn(reopened.payload, "height")).toBe(true);
    expect(semantics(capture(target))).toEqual(semantics(capture(f)));
  });
});
