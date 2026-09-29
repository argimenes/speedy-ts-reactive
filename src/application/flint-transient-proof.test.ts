// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import { materializeLocalWorkspace, materializeWorkspace, createWorkspaceSaveBundle } from "../reactive-editor/workspace-manifest";
import type { ExistingBlockDto } from "../block-tree/types";

export function flintProofFixture(): ExistingBlockDto {
  return { id: "workspace", type: "workspace-block", children: [
    { id: "window", type: "window-block", children: [{ id: "flint", type: "flint-application-block", metadata: { vaultId: "vault" }, children: [{ id: "tabs", type: "tab-row-block", children: ["a", "b"].map(id => ({ id: `tab-${id}`, type: "tab-block", metadata: { documentTarget: { version: 1, documentId: `resource-${id}` } } })) }] }] },
    { id: "bank", type: "workspace-object-bank-block", children: [{ id: "vault", type: "container-block", metadata: { members: ["resource-a", "resource-b"] }, children: ["a", "b"].map(id => ({ id: `doc-${id}`, type: "document-block", metadata: { documentId: `resource-${id}`, title: `Document ${id}`, folder: ".", filename: `${id}.json` }, children: [{ id: `text-${id}`, type: "standoff-editor-block", text: `Original ${id}` }] })) }] },
  ] };
}
function setup() {
  const editor = new ReactiveEditor(materializeLocalWorkspace(flintProofFixture()));
  const main = editor.createView("main");
  const node = (id: string) => Object.values(main.state.nodes).find(n => n.payload.id === id)!;
  return { editor, main, node };
}
describe("Flint transient occurrence gate", () => {
  it("shares canonical content with independent occurrence keys and no extra placements", () => {
    const { editor, node } = setup();
    try {
      const before = editor.repository.snapshot();
      const one = editor.createView("one", node("doc-a").placementKey), two = editor.createView("two", node("doc-a").placementKey);
      expect(editor.repository.snapshot()).toEqual(before);
      const a = one.state.nodes[one.state.rootKey].children[0], b = two.state.nodes[two.state.rootKey].children[0];
      expect(a).not.toBe(b); expect(editor.node(a)!.contentKey).toBe(editor.node(b)!.contentKey);
      editor.commands.replaceInlineRange(a, 0, 0, "Shared ");
      expect(editor.node(b)!.inlineContent).toHaveLength(17);
      editor.commands.setPayloadField(one.state.rootKey, "metadata", { documentId: "resource-a", title: "Renamed" });
      expect((two.state.nodes[two.state.rootKey].payload.metadata as any).title).toBe("Renamed");
      editor.repository.undo(); editor.repository.undo();
      expect(editor.node(b)!.inlineContent).toHaveLength(10);
    } finally { editor.dispose(); }
  });
  it("handles canonical source removal and undo without interrupting repository delivery", () => {
    const { editor, node } = setup();
    try {
      const view = editor.createView("source-lifetime", node("doc-a").placementKey);
      let delivered = 0; const stop = editor.repository.subscribeChanges(() => delivered++);
      expect(() => editor.commands.remove(node("doc-a").key)).not.toThrow();
      expect(view.node(view.state.rootKey)).toBeUndefined(); expect(delivered).toBe(1);
      expect(() => editor.repository.undo()).not.toThrow();
      expect(view.node(view.state.rootKey)?.payload.id).toBe("doc-a"); stop();
    } finally { editor.dispose(); }
  });
  it("disposes independently, rejects duplicate live view IDs and revokes queued focus", () => {
    const { editor, node } = setup();
    try {
      const first = editor.createView("first", node("doc-a").placementKey);
      const second = editor.createView("second", node("doc-a").placementKey);
      expect(() => editor.createView("first", node("doc-a").placementKey)).toThrow("already exists");
      const key = first.node(first.state.rootKey)!.children[0], text = first.node(key)!;
      editor.focus.request(key); editor.selections.setPrimary(key, text.contentKey, text.viewId, 1, 3);
      editor.mounts.rememberSelection(key, { start: 1, end: 3, direction: "forward" });
      const snapshot = editor.repository.snapshot();
      editor.disposeView(first); editor.disposeView(first);
      expect(editor.repository.snapshot()).toEqual(snapshot);
      expect(editor.projections.has("first")).toBe(false); expect(editor.projections.has("second")).toBe(true);
      expect(editor.node(key)).toBeUndefined(); expect(editor.selections.sets[key]).toBeUndefined();
      expect(editor.mounts.selection(key)).toBeUndefined(); expect(editor.focus.state.focusedKey).toBeUndefined();
      let focused = false; const root = document.createElement("div");
      const release = editor.mounts.register(key, { root, focusElement: root, inputPolicy: "container", focus: () => { focused = true; } });
      expect(focused).toBe(false); release(); editor.mounts.releaseOccurrence(key);
      expect(second.node(second.state.rootKey)).toBeDefined();
    } finally { editor.dispose(); }
  });
  it.each(["local", "server"] as const)("preserves target IDs and canonical ownership through %s persistence, regardless of tab-first order", async path => {
    const { editor, node } = setup(); let reopened: ReactiveEditor | undefined;
    try {
      editor.createView("tab-a", node("doc-a").placementKey);
      editor.createView("tab-a-second", node("doc-a").placementKey);
      const captured = editor.persistence.captureWorkspace().document;
      const bundle = path === "server" ? await createWorkspaceSaveBundle(editor.repository.snapshot(), [], "workspace") : undefined;
      if (bundle) expect(bundle.documents).toHaveLength(2);
      const loaded = bundle ? materializeWorkspace(bundle.manifest, new Map(bundle.documents.map(d => [d.documentId, d.document]))) : materializeLocalWorkspace(JSON.parse(JSON.stringify(captured)));
      reopened = new ReactiveEditor(loaded);
      const view = reopened.createView("reopened");
      const docs = Object.values(view.state.nodes).filter(n => n.viewType === "document-block");
      expect(docs).toHaveLength(2);
      expect(docs.map(n => reopened!.repository.state.placements[n.placementKey].kind)).toEqual(["owned", "owned"]);
      const tab = Object.values(view.state.nodes).find(n => n.payload.id === "tab-a")!;
      expect(tab.children).toEqual([]); expect((tab.payload.metadata as any).documentTarget.documentId).toBe("resource-a");
      reopened.commands.remove(Object.values(view.state.nodes).find(n => n.payload.id === "window")!.key);
      expect(Object.values(reopened.repository.state.contents).filter(c => c.viewType === "document-block")).toHaveLength(2);
    } finally { reopened?.dispose(); editor.dispose(); }
  });
});
