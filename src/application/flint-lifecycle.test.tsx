// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerApplicationViews } from "./features";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import { materializeLocalWorkspace, createWorkspaceSaveBundle, materializeWorkspace } from "../reactive-editor/workspace-manifest";
import type { ExistingBlockDto } from "../block-tree/types";
const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).reverse().forEach(d => d()); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals(); });
function setup(enabled = true, saved?: ExistingBlockDto) {
  const editor = new ReactiveEditor(materializeLocalWorkspace(saved ?? { id: "workspace", type: "workspace-block", children: [] }), { features: { flint: enabled, compactEditorChrome: false } });
  registerApplicationViews(editor); const projection = editor.createView("workspace");
  disposers.push(() => editor.dispose());
  if (!saved && enabled) editor.commandRegistry.execute("flint.open", { targetKey: projection.state.rootKey, args: undefined });
  const host = document.body.appendChild(document.createElement("div"));
  disposers.push(render(() => <ReactiveTreeView editor={editor} projection={projection} />, host));
  editor.installGateway(document);
  const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const views = () => [...editor.projections.values()].filter(p => p !== projection);
  const text = () => Object.values(views()[0].state.nodes).find(n => n.viewType === "standoff-editor-block")!;
  return { editor, projection, host, tabs, views, text };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
describe("Flint composite transient hosting", () => {
  it("mounts one ordinary editor, restores selection across tab switches, and releases occurrence state", async () => {
    const f = setup(); await tick();
    expect(f.views()).toHaveLength(1); expect(f.tabs()).toHaveLength(2);
    const old = f.text(), mount = f.editor.mounts.get(old.key)!;
    expect(mount.inputPolicy).toBe("standoff");
    f.editor.focus.request(old.key);
    mount.restoreInlineSelection!({ anchor: 2, head: 7 });
    f.editor.selections.setPrimary(old.key, old.contentKey, old.viewId, 2, 7);
    const occurrenceRoot = f.views()[0].state.rootKey;
    f.editor.overlays.open({ ownerKey: old.key, viewType: "context-menu", anchor: { x: 0, y: 0 } });
    f.tabs()[1].click(); await tick();
    expect(f.views()).toHaveLength(1); expect(f.editor.node(old.key)).toBeUndefined();
    expect(f.editor.mounts.get(old.key)).toBeUndefined(); expect(f.editor.mounts.selection(old.key)).toBeUndefined();
    expect(f.editor.selections.sets[old.key]).toBeUndefined(); expect(f.editor.overlays.overlays).toHaveLength(0);
    expect(f.editor.focus.state.lastFocusedKey).not.toBe(old.key);
    f.tabs()[0].click(); await tick();
    const next = f.text(); expect(next.key).not.toBe(old.key); expect(next.contentKey).toBe(old.contentKey);
    expect(f.editor.mounts.get(next.key)!.captureInlineSelection!()).toEqual({ anchor: 2, head: 7 });
    expect(f.editor.focus.state.focusedKey).toBe(next.key); expect(f.editor.node(occurrenceRoot)).toBeUndefined();
    for (let i = 0; i < 10; i++) { f.tabs()[i % 2].click(); await tick(); expect(f.views()).toHaveLength(1); }
  });
  it("restores occurrence-local cross-Block selection and drops stale bookmarks after edits elsewhere", async () => {
    const f = setup(); await tick();
    f.editor.crossText.enable(true);
    const texts = Object.values(f.views()[0].state.nodes).filter(n => n.viewType === "standoff-editor-block");
    f.editor.focus.request(texts[0].key);
    expect(f.editor.crossText.set(f.editor.crossText.position(texts[0].key, 2), f.editor.crossText.position(texts[1].key, 4))).toBe(true);
    const selected = f.editor.crossText.selectedText();
    f.tabs()[1].click(); await tick(); expect(f.editor.crossText.range()).toBeUndefined();
    f.tabs()[0].click(); await tick(); expect(f.editor.crossText.selectedText()).toBe(selected);
    const old = f.text();
    f.tabs()[1].click(); await tick();
    f.editor.commands.replaceInlineRange(old.placementKey, 0, 3, "Changed");
    f.tabs()[0].click(); await tick(); expect(f.editor.crossText.range()).toBeUndefined();
  });
  it("prevents a different Window toolbar from applying another occurrence's grouped selection", async () => {
    const f = setup(); await tick();
    f.editor.commandRegistry.execute("flint.open", { targetKey: f.projection.state.rootKey, args: undefined }); await tick();
    const first = f.text();
    const range = f.editor.textRanges.snapshot(first.key, 0, 4);
    // The actual Grouping provider owns the single operation slot. Use its public input gesture.
    const mount = f.editor.mounts.get(first.key)!;
    mount.focus();
    mount.focusElement.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, ctrlKey: true, button: 0 }));
    mount.focusElement.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, ctrlKey: true, clientX: 20 }));
    mount.restoreInlineSelection!({ anchor: 0, head: 4 });
    mount.focusElement.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, ctrlKey: true, button: 0 }));
    await tick();
    expect(f.editor.currentTextOperation.annotationOperation()?.annotationTargets()?.[0].nodeKey).toBe(range.nodeKey);
    const otherWindow = [...f.host.querySelectorAll('.flint-application')].find(w => !w.contains(mount.root))!;
    const bold = otherWindow.querySelector<HTMLButtonElement>('button[title="Bold selection"]')!;
    expect(bold).toBeTruthy(); bold.click();
    expect((f.editor.node(first.key)!.payload.standoffProperties as any[] ?? []).some(p => p.type === "style/bold")).toBe(false);
    expect(otherWindow.textContent).toContain("another document");
  });
  it("owns Entity panel focus and cancels asynchronous work when its tab disappears", async () => {
    let reply!: (value: unknown) => void, signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options) => { signal = options.signal; return new Promise(resolve => reply = resolve); }));
    const f = setup(); await tick(); const n = f.text();
    f.editor.focus.request(n.key); f.editor.mounts.get(n.key)!.restoreInlineSelection!({ anchor: 0, head: 5 });
    f.editor.annotationUI.get("codex/entity-reference")!.apply([{ nodeKey: n.key, start: 0, end: 5 }], n.key);
    await vi.waitFor(() => expect(signal).toBeDefined());
    expect(document.querySelectorAll('.reactive-entity-search')).toHaveLength(1);
    const panel = f.editor.overlays.overlays[0];
    expect(panel.ownerKey).toBe(n.key); f.editor.overlays.close(panel.key); await tick();
    expect(f.editor.focus.state.focusedKey).toBe(n.key);
    expect(f.editor.mounts.get(n.key)!.captureInlineSelection!()).toEqual({ anchor: 0, head: 5 });
    f.editor.annotationUI.get("codex/entity-reference")!.apply([{ nodeKey: n.key, start: 0, end: 5 }], n.key);
    await vi.waitFor(() => expect(document.querySelector('.reactive-entity-search')).toBeTruthy());
    f.tabs()[1].click(); await tick();
    expect(signal?.aborted).toBe(true); expect(f.editor.overlays.overlays).toHaveLength(0);
    expect(document.querySelector('.reactive-entity-search')).toBeNull();
    reply({ ok: true, json: async () => ({ Success: true, Results: [{ id: "late", name: "Late result" }] }) }); await tick();
    expect(f.text().payload.standoffProperties ?? []).toEqual([]);
  });
  it("round-trips launched Windows with the unchanged server bundle and one object bank", async () => {
    const f = setup(); await tick();
    f.editor.commandRegistry.execute("flint.open", { targetKey: f.projection.state.rootKey, args: undefined }); await tick();
    expect(Object.values(f.editor.repository.state.contents).filter(c => c.viewType === "workspace-object-bank-block")).toHaveLength(1);
    const bundle = await createWorkspaceSaveBundle(f.editor.repository.snapshot(), [], "flint-proof");
    expect(bundle.documents).toHaveLength(2);
    const loaded = materializeWorkspace(bundle.manifest, new Map(bundle.documents.map(d => [d.documentId, d.document])));
    const reopened = new ReactiveEditor(loaded); disposers.push(() => reopened.dispose());
    const docs = Object.values(reopened.repository.state.contents).filter(c => c.viewType === "document-block");
    expect(docs).toHaveLength(2);
    for (const doc of docs) expect(Object.values(reopened.repository.state.placements).filter(p => p.contentKey === doc.key).map(p => p.kind)).toEqual(["owned"]);
  });
  it("releases the live view on Window minimize and restores ordinary editing on return", async () => {
    const f = setup(); await tick(); const old = f.text().key;
    f.editor.focus.request(old);
    f.host.querySelector<HTMLButtonElement>('[aria-label="Minimize window"]')!.click(); await tick();
    expect(f.views()).toHaveLength(0); expect(f.editor.node(old)).toBeUndefined();
    f.host.querySelector<HTMLButtonElement>('[data-window-icon]')!.click(); await tick();
    expect(f.views()).toHaveLength(1);
    expect(f.editor.focus.state.focusedKey).toBe(f.text().key);
  });
  it("rejects ambiguous target identities without choosing a new canonical owner", async () => {
    const f = setup(); await tick();
    const source = f.views()[0].state.nodes[f.views()[0].state.rootKey];
    const identity = (source.payload.metadata as any).documentId;
    const bank = Object.values(f.projection.state.nodes).find(n => n.viewType === "workspace-object-bank-block")!;
    f.editor.commands.insert({ id: "conflicting-document", type: "document-block", metadata: { documentId: identity }, children: [{ type: "standoff-editor-block", text: "Conflicting content" }] }, { kind: "at", parentKey: bank.key, index: 0 });
    await tick(); expect(f.views()).toHaveLength(0); expect(f.host.textContent).toContain("missing or ambiguous");
    f.editor.repository.undo(); await tick();
    expect(f.views()).toHaveLength(1); expect(f.views()[0].rootPlacementKey).toBe(source.placementKey);
  });
  it("does not leak the application's Document slot into authored tabs inside its Document", async () => {
    const f = setup(); await tick(); const doc = f.views()[0].node(f.views()[0].state.rootKey)!;
    f.editor.commands.insert({ type: "tab-row-block", children: [{ type: "tab-block", metadata: { documentTarget: { version: 1, documentId: (doc.payload.metadata as any).documentId } } }] }, { kind: "at", parentKey: doc.key, index: doc.children.length });
    await tick(); expect(f.views()).toHaveLength(1);
    expect(f.host.textContent).toContain("Document view unavailable");
    f.editor.commands.replaceInlineRange(f.text().key, 0, 0, "Still editable ");
    expect(f.editor.mounts.get(f.text().key)!.captureText!()).toContain("Still editable");
  });
  it("does not resurrect disposed focus from a queued panel return", async () => {
    const f = setup(); await tick(); const old = f.text().key;
    f.editor.focus.request(old);
    const panel = f.editor.overlays.open({ ownerKey: old, viewType: "context-menu", anchor: { x: 0, y: 0 } });
    await tick(); f.editor.overlays.close(panel);
    const window = Object.values(f.projection.state.nodes).find(n => n.viewType === "window-block")!;
    f.editor.commands.remove(window.key); await tick();
    expect(f.views()).toHaveLength(0); expect(f.editor.focus.state.focusedKey).not.toBe(old);
    expect(f.editor.focus.state.lastFocusedKey).not.toBe(old);
  });
  it("handles source deletion, unavailable view and undo while remaining editable", async () => {
    const f = setup(); await tick();
    const source = f.views()[0].rootPlacementKey;
    expect(() => f.editor.commands.remove(source)).not.toThrow(); await tick();
    expect(f.views()).toHaveLength(0); expect(f.host.textContent).toContain("Document unavailable");
    expect(() => f.editor.repository.undo()).not.toThrow(); await tick();
    expect(f.views()).toHaveLength(1);
    f.editor.commands.replaceInlineRange(f.text().key, 0, 0, "Recovered ");
    expect(f.editor.mounts.get(f.text().key)!.captureText!()).toContain("Recovered");
  });
  it("closes/reopens tabs without deleting canonical Documents; disablement retains their data", async () => {
    const f = setup(); await tick();
    const before = Object.values(f.editor.repository.state.contents).filter(c => c.viewType === "document-block").map(c => c.key);
    [...f.host.querySelectorAll('button')].find(b => b.textContent === 'Close tab')!.click(); await tick();
    expect(f.tabs()).toHaveLength(1); expect(f.views()).toHaveLength(1);
    [...f.host.querySelectorAll<HTMLButtonElement>('[aria-label="Flint Documents"] button')].find(b => b.textContent === 'Notes')!.click(); await tick();
    expect(f.tabs()).toHaveLength(2);
    expect(Object.values(f.editor.repository.state.contents).filter(c => c.viewType === "document-block").map(c => c.key)).toEqual(before);
    const saved = f.editor.persistence.captureWorkspace().document;
    const disabled = setup(false, saved); await tick();
    expect(disabled.views()).toHaveLength(0);
    expect(disabled.editor.persistence.captureWorkspace().document).toEqual(saved);
    expect(disabled.editor.commandRegistry.list().some(c => c.id === 'flint.open')).toBe(false);
  });
  it("keeps two application Windows independent while editing shared content and renaming tabs", async () => {
    const f = setup(); await tick();
    f.editor.commandRegistry.execute('flint.open', { targetKey: f.projection.state.rootKey, args: undefined }); await tick();
    expect(f.views()).toHaveLength(2);
    const [a, b] = f.views().map(p => Object.values(p.state.nodes).find(n => n.viewType === 'standoff-editor-block')!);
    expect(a.contentKey).toBe(b.contentKey); expect(a.key).not.toBe(b.key);
    f.editor.commands.replaceInlineRange(a.key, 0, 0, 'Shared ');
    expect(f.editor.mounts.get(b.key)!.captureText!()).toContain('Shared');
    const title = f.host.querySelector<HTMLInputElement>('[aria-label="Rename Notes"]')!;
    title.value = 'Renamed'; title.dispatchEvent(new Event('change', { bubbles: true })); await tick();
    expect(f.tabs().filter(t => t.textContent === 'Renamed')).toHaveLength(2);
    const window = Object.values(f.projection.state.nodes).find(n => n.viewType === 'window-block')!;
    f.editor.commands.remove(window.key); await tick();
    expect(f.views()).toHaveLength(1); expect(f.editor.node(a.key)).toBeUndefined(); expect(f.editor.node(b.key)).toBeDefined();
  });
});
