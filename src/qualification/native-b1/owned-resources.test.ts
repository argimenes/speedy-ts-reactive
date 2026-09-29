// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { materializeLocalWorkspace } from "../../reactive-editor/workspace-manifest";
import { resourceOwnership, documentRootPlacements } from "../../block-tree/resource-registration";
import { encodeWorkspace } from "../../block-tree/codecs";
import type { ExistingBlockDto } from "../../block-tree/types";
import { admitNative, captureNative, nativeBytes, nativeText, decodeNative, nativeEnvelope } from "./resource";

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).reverse().forEach(f => f()));
const doc = (id: string, children: ExistingBlockDto[] = []): ExistingBlockDto => ({ id, type: "document-block", metadata: { documentId: `resource-${id}` }, children: [{ id: `${id}-text`, type: "standoff-editor-block", text: `Document ${id}` }, ...children] });
function host(documents: ExistingBlockDto[] = []) {
  const editor = new ReactiveEditor(materializeLocalWorkspace({ id: "workspace", type: "workspace-block", children: [{ id: "bank", type: "workspace-object-bank-block", children: documents }] }));
  cleanup.push(() => editor.dispose()); const main = editor.createView("main");
  const node = (id: string) => Object.values(main.state.nodes).find(n => n.payload.id === id)!;
  const capture = (id: string) => captureNative(editor.repository.snapshot(), `resource-${id}`);
  const load = (bytes: Uint8Array) => admitNative(editor.repository, bytes, node("bank").contentKey);
  return { editor, main, node, capture, load };
}
function pair() {
  const source = host([doc("a", [doc("b")]), doc("c")]);
  source.editor.commands.transclude(source.node("b").key, { kind: "at", parentKey: source.node("c").key, index: 1 });
  return { source, a: nativeBytes(source.capture("a")), b: nativeBytes(source.capture("b")), c: nativeBytes(source.capture("c")) };
}
const json = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function ownedEdge(a: Uint8Array) { return json(a).document.blocks.find((b: any) => b.id === "a").children.find((e: any) => e.target.kind === "external"); }
function withEdge(file: Uint8Array, edge: any) {
  const value = json(file); value.document.version = 2; value.document.blocks.find((b: any) => b.id === value.document.root.target.blockId).children.push(edge); return bytes(value);
}

describe("B1.2 owned resources and non-owning storage", () => {
  it("captures actual authored nesting as separate resources with a versioned owned external edge", () => {
    const { source, a, b, c } = pair(), wire = json(a);
    expect(wire.version).toBe(1); expect(wire.document.version).toBe(2);
    expect(wire.document.blocks.map((b: any) => b.id)).toEqual(["a", "a-text"]);
    expect(ownedEdge(a)).toMatchObject({ kind: "owned", target: { kind: "external", reference: { kind: "block", targetId: "b", source: { scope: "document", resourceId: "resource-b" }, version: { kind: "unpinned" } } } });
    expect(json(b).document.version).toBe(1);
    expect(json(b).document.root.placementId).not.toBe(ownedEdge(a).placementId);
    expect(nativeBytes(decodeNative(a))).toEqual(a); expect(nativeBytes(decodeNative(b))).toEqual(b);
    expect(resourceOwnership(source.editor.repository.readState()).get("resource-b")?.owner).toBe("resource-a");
    if (process.env.B12_ARTIFACTS) {
      mkdirSync(process.env.B12_ARTIFACTS, { recursive: true });
      for (const [name, data] of [["a", a], ["b", b], ["c", c]] as const) writeFileSync(`${process.env.B12_ARTIFACTS}/${name}.mutable.json`, data);
    }
  });
  it.each([['a','b'], ['b','a']] as const)("loads %s then %s without assigning ownership from the bank or order", (first, second) => {
    const files = pair(), h = host(); const loaded = h.load(files[first]);
    if (first === "b") {
      expect(resourceOwnership(h.editor.repository.readState()).has("resource-b")).toBe(false); // unknown, not unowned
      expect(h.editor.repository.state.placements[loaded.placementKey]).toMatchObject({ kind: "reference", resourceRegistration: true });
      expect(nativeBytes(h.capture("b"))).toEqual(files.b);
    } else expect(Object.values(h.editor.repository.state.placements).filter(p => p.kind === "owned" && p.externalReference)).toHaveLength(1);
    h.load(files[second]); h.load(files.c);
    expect(resourceOwnership(h.editor.repository.readState()).get("resource-b")?.owner).toBe("resource-a");
    const content = h.node("b").contentKey, placements = Object.values(h.editor.repository.state.placements).filter(p => p.contentKey === content);
    expect(placements.filter(p => p.kind === "owned")).toHaveLength(1);
    expect(placements.filter(p => p.resourceRegistration)).toHaveLength(1);
    expect(placements.filter(p => p.kind === "reference" && !p.resourceRegistration)).toHaveLength(1);
    for (const name of ["a", "b", "c"] as const) expect(nativeBytes(h.capture(name))).toEqual(files[name]);
    const before = h.editor.repository.snapshot(); expect(h.load(files.b).reused).toBe(true); expect(h.editor.repository.snapshot()).toEqual(before);
  });
  it("opens B independently, shares ordinary editing/history across disposable occurrences, then reunites A", () => {
    const files = pair(), h = host(), admitted = h.load(files.b);
    const one = h.editor.createView("one", admitted.placementKey), two = h.editor.createView("two", admitted.placementKey);
    const text = Object.values(one.state.nodes).find(n => n.payload.id === "b-text")!;
    const other = Object.values(two.state.nodes).find(n => n.payload.id === "b-text")!;
    expect(text.key).not.toBe(other.key); expect(text.contentKey).toBe(other.contentKey);
    h.editor.commands.replaceInlineRange(text.key, 0, 0, "Independent ");
    expect(two.node(other.key)!.inlineContent.length).toBe("Independent Document b".length);
    h.load(files.a); h.load(files.c);
    expect(nativeText(h.capture("a"))).not.toContain("Independent");
    expect(nativeText(h.capture("b"))).toContain("Independent Document b");
    const prior = h.editor.repository.snapshot(); h.editor.disposeView(one); expect(h.editor.repository.snapshot()).toEqual(prior);
    expect(two.node(other.key)).toBeDefined(); h.editor.disposeView(two);
    expect(h.editor.repository.state.contents[text.contentKey]).toBeDefined();
    expect(resourceOwnership(h.editor.repository.readState()).get("resource-b")?.owner).toBe("resource-a");
  });
  it("admission and binding undo atomically without destroying a pre-existing independent B", () => {
    const files = pair(), h = host(), b = h.load(files.b), view = h.editor.createView("b", b.placementKey);
    h.load(files.a); expect(resourceOwnership(h.editor.repository.readState()).has("resource-b")).toBe(true);
    h.editor.repository.undo(); expect(resourceOwnership(h.editor.repository.readState()).has("resource-b")).toBe(false);
    expect(view.node(view.state.rootKey)?.payload.id).toBe("b");
    h.editor.repository.redo(); expect(nativeBytes(h.capture("a"))).toEqual(files.a);
  });
  it("rejects two owners (including two claims by A), cycles and non-root targets before mutation", () => {
    const files = pair(), edge = ownedEdge(files.a), h = host(); h.load(files.a);
    const conflict = withEdge(files.c, { ...edge, placementId: "c-owns-b" });
    const before = h.editor.repository.snapshot(); expect(() => h.load(conflict)).toThrow("multiple semantic owners"); expect(h.editor.repository.snapshot()).toEqual(before);
    expect(() => decodeNative(withEdge(files.a, { ...edge, placementId: "a-owns-b-again" }))).toThrow("multiple semantic owners");
    const cycle = withEdge(files.b, { ...edge, placementId: "b-owns-a", target: { kind: "external", reference: { ...edge.target.reference, targetId: "a", source: { scope: "document", resourceId: "resource-a" } } } });
    expect(() => h.load(cycle)).toThrow("ownership cycle"); expect(h.editor.repository.snapshot()).toEqual(before);
    const bad = json(files.a); bad.document.blocks.find((b: any) => b.id === "a").children.find((e: any) => e.target.kind === "external").target.reference.targetId = "b-text";
    const wrong = host(); wrong.load(bytes(bad)); const unchanged = wrong.editor.repository.snapshot();
    expect(() => wrong.load(files.b)).toThrow(/Document resource root/); expect(wrong.editor.repository.snapshot()).toEqual(unchanged);
    const loadedFirst = host(); loadedFirst.load(files.b); expect(() => loadedFirst.load(bytes(bad))).toThrow(/Document resource root/);
  });
  it("permits a reference back to A without turning it into an ownership cycle", () => {
    const files = pair(), edge = ownedEdge(files.a);
    const back = withEdge(files.b, { placementId: "b-ref-a", kind: "reference", target: { kind: "external", reference: { ...edge.target.reference, targetId: "a", source: { scope: "document", resourceId: "resource-a" } } } });
    for (const order of [[files.a, back], [back, files.a]]) {
      const h = host(); for (const file of order) h.load(file);
      expect(resourceOwnership(h.editor.repository.readState()).size).toBe(1);
      expect(nativeEnvelope(h.capture("b")).document.blocks).toHaveLength(2);
    }
  });
  it("rejects old/unknown schemas and invalid ownership descriptors", () => {
    const files = pair();
    for (const version of [1, 99]) { const v = json(files.a); v.document.version = version; expect(() => decodeNative(bytes(v))).toThrow(); }
    for (const patch of [{ source: { scope: "unknown" } }, { kind: "asset" }, { targetRoute: ["x"] }, { version: { kind: "revision", memoirId: "m", segmentId: "s", revisionId: "r" } }]) {
      const v = json(files.a), edge = v.document.blocks.find((b: any) => b.id === "a").children.find((e: any) => e.target.kind === "external");
      Object.assign(edge.target.reference, patch); expect(() => decodeNative(bytes(v))).toThrow();
    }
  });
  it("rejects duplicate or mislocated registrations and ownership conflicts in reverse load order", () => {
    const files = pair(), h = host(), b = h.load(files.b);
    const state = h.editor.repository.snapshot(), registration = state.placements[b.placementKey];
    expect(() => h.editor.repository.commit("Invalid registration", [{ kind: "put-placement", record: { ...registration, kind: "owned" } }])).toThrow("registration");
    expect(h.editor.repository.snapshot()).toEqual(state);
    const bank = state.contents[h.node("bank").contentKey];
    expect(() => h.editor.repository.commit("Duplicate registration", [
      { kind: "put-placement", record: { ...registration, key: "duplicate", placementId: "duplicate-registration" } },
      { kind: "put-content", record: { ...bank, children: [...bank.children, "duplicate"] } },
    ])).toThrow("registration");
    expect(h.editor.repository.snapshot()).toEqual(state);
    const edge = ownedEdge(files.a);
    h.load(withEdge(files.c, { ...edge, placementId: "c-owns-b" }));
    const ownedByC = h.editor.repository.snapshot();
    expect(() => h.load(files.a)).toThrow("multiple semantic owners");
    expect(h.editor.repository.snapshot()).toEqual(ownedByC);
  });
  it("reference removal and occurrence closure retain B; ambiguous lifetime actions fail conservatively", () => {
    const files = pair(), h = host(); h.load(files.a); const b = h.load(files.b); h.load(files.c);
    const reference = Object.values(h.editor.repository.state.placements).find(p => p.kind === "reference" && p.resolvedReference?.targetId === "b")!;
    h.editor.commands.remove(reference.key); expect(nativeBytes(h.capture("b"))).toEqual(files.b);
    const before = h.editor.repository.snapshot();
    expect(() => h.editor.commands.remove(b.placementKey)).toThrow("lifetime decision");
    const owned = Object.values(h.editor.repository.state.placements).find(p => p.kind === "owned" && p.resolvedReference)!;
    expect(() => h.editor.commands.remove(owned.key)).toThrow("lifetime decision");
    expect(() => h.editor.commands.move(owned.key, { kind: "at", parentKey: h.node("c").key, index: 0 })).toThrow("explicit ownership operation");
    expect(() => h.editor.commands.unwrap(owned.key)).toThrow("Cannot flatten");
    expect(() => h.editor.commands.remove(h.node("bank").key)).toThrow("lifetime decision");
    expect(h.editor.repository.snapshot()).toEqual(before);
    expect(() => encodeWorkspace(h.editor.repository.snapshot())).toThrow("legacy tree");
    expect(documentRootPlacements(h.editor.repository.readState(), h.node("b").contentKey)[0].key).toBe(b.placementKey);
  });
});
