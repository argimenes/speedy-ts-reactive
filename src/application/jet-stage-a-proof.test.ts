// @vitest-environment jsdom
/** Stage A qualification evidence. These tests characterize the current gate;
 * they do not assert that ownership-changing persistence is acceptable for Jet. */
import { describe, expect, it } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import { materializeLocalWorkspace, materializeWorkspace, createWorkspaceSaveBundle } from "../reactive-editor/workspace-manifest";
import type { ExistingBlockDto } from "../block-tree/types";

function fixture(sourceFirst = false) {
  const source: ExistingBlockDto = { id: "bank", type: "workspace-object-bank-block", children: [{
    id: "vault", type: "container-block", metadata: { title: "Jet vault", jetVault: { version: 1, members: ["resource-a", "resource-b"] } }, children: ["a", "b"].map(id => ({
      id: `doc-${id}`, type: "document-block", metadata: { documentId: `resource-${id}`, title: `Document ${id}`, folder: ".", filename: `${id}.json` },
      children: [{ id: `text-${id}`, type: "standoff-editor-block", text: `Original ${id}` }],
    })),
  }] };
  const window: ExistingBlockDto = { id: "jet-window", type: "window-block", children: [{ id: "jet", type: "jet-application-block", children: [{
    id: "tabs", type: "tab-row-block", children: ["a", "b"].map(id => ({ id: `tab-${id}`, type: "tab-block", metadata: { name: `Document ${id}` }, children: [] })),
  }] }] };
  return { id: "workspace", type: "workspace-block", children: sourceFirst ? [source, window] : [window, source] };
}
function setup(dto = fixture()) {
  const editor = new ReactiveEditor(materializeLocalWorkspace(dto));
  const projection = editor.createView("jet-proof");
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  for (const id of ["a", "b"]) editor.commands.transclude(node(`doc-${id}`).key, { kind: "at", parentKey: node(`tab-${id}`).key, index: 0 });
  return { editor, projection, node };
}
function inspect(editor: ReactiveEditor) {
  const state = editor.repository.state;
  const content = (id: string) => Object.values(state.contents).find(c => c.payload.id === id)!;
  const tab = state.placements[content("tab-a").children[0]];
  const source = state.placements[content("vault").children[0]];
  return { tab, source, content };
}

describe("Jet Stage A qualification gate", () => {
  it("shares two live Documents without moving owners; unlink and Window close preserve source content", () => {
    const s = setup();
    try {
      const before = inspect(s.editor);
      expect(before.tab.kind).toBe("reference"); expect(before.source.kind).toBe("owned");
      expect(before.tab.contentKey).toBe(before.source.contentKey);
      const document = s.node("doc-a");
      s.editor.commands.setPayloadField(document.key, "metadata", { ...(document.payload.metadata as object), title: "Renamed A" });
      const occurrences = Object.values(s.projection.state.nodes).filter(n => n.payload.id === "doc-a");
      expect(occurrences).toHaveLength(2);
      expect(occurrences.map(n => (n.payload.metadata as any).title)).toEqual(["Renamed A", "Renamed A"]);
      expect(occurrences.every(n => (n.payload.metadata as any).documentId === "resource-a")).toBe(true);
      const tabText = s.projection.state.nodes[s.node("tab-a").children[0]].children[0];
      s.editor.commands.replaceInlineRange(tabText, 0, 0, "Edited through tab. ");
      const sourceText = s.projection.state.nodes[s.node("vault").children[0]].children[0];
      expect(s.projection.state.nodes[sourceText].contentKey).toBe(s.projection.state.nodes[tabText].contentKey);
      s.editor.commands.unlink(before.tab.key);
      s.editor.commands.remove(s.node("jet-window").key);
      expect(Object.values(s.editor.repository.state.contents).filter(c => c.viewType === "document-block")).toHaveLength(2);
      expect(s.editor.encodeDocument().children![0].children![0].children![0].children![0].text).toBe("Edited through tab. Original a");
      s.editor.repository.undo(); expect(s.node("jet-window")).toBeDefined();
    } finally { s.editor.dispose(); }
  });

  it.each(["local", "server"] as const)("documents the %s ownership inversion and unlink failure after tab-first round-trip", async path => {
    const s = setup(); let reopened: ReactiveEditor | undefined;
    try {
      const before = inspect(s.editor);
      expect([before.tab.kind, before.source.kind]).toEqual(["reference", "owned"]);
      const bundle = path === "server" ? await createWorkspaceSaveBundle(s.editor.repository.snapshot(), [], "workspace") : undefined;
      if (bundle) expect(bundle.documents).toHaveLength(2);
      const loaded = bundle ? materializeWorkspace(bundle.manifest, new Map(bundle.documents.map(d => [d.documentId, d.document]))) : materializeLocalWorkspace(JSON.parse(JSON.stringify(s.editor.persistence.captureWorkspace().document)));
      reopened = new ReactiveEditor(loaded);
      const after = inspect(reopened);
      expect(after.tab.contentKey).toBe(after.source.contentKey); // identity deduplication succeeds
      expect([after.tab.kind, after.source.kind]).toEqual(["owned", "reference"]); // gate fails
      expect(() => reopened!.commands.unlink(after.tab.key)).toThrow("Only a reference placement");
      const view = reopened.createView("reopened");
      const window = Object.values(view.state.nodes).find(n => n.payload.id === "jet-window")!;
      reopened.commands.remove(window.key);
      expect(Object.values(reopened.repository.state.contents).filter(c => c.viewType === "document-block")).toHaveLength(2);
      expect(inspectSourceKind(reopened)).toBe("reference");
    } finally { reopened?.dispose(); s.editor.dispose(); }
  });

  it("shows that source-first order masks the problem rather than preserving occurrence semantics", () => {
    const s = setup(fixture(true)); let reopened: ReactiveEditor | undefined;
    try {
      reopened = new ReactiveEditor(materializeLocalWorkspace(JSON.parse(JSON.stringify(s.editor.persistence.captureWorkspace().document))));
      const after = inspect(reopened);
      expect([after.tab.kind, after.source.kind]).toEqual(["reference", "owned"]);
      expect(() => reopened!.commands.unlink(after.tab.key)).not.toThrow();
    } finally { reopened?.dispose(); s.editor.dispose(); }
  });

  it("rejects conflicting copies instead of silently choosing an edited Document", () => {
    const s = setup();
    try {
      const saved = s.editor.persistence.captureWorkspace().document;
      saved.children![1].children![0].children![0].children![0].text = "Conflicting source";
      expect(() => materializeLocalWorkspace(saved)).toThrow("Conflicting copies of Document");
    } finally { s.editor.dispose(); }
  });
});
function inspectSourceKind(editor: ReactiveEditor) {
  const state = editor.repository.state;
  const vault = Object.values(state.contents).find(c => c.payload.id === "vault")!;
  return state.placements[vault.children[0]].kind;
}
