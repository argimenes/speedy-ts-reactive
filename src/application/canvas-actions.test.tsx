// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { canvasActions } from "./canvas-actions";
import { createWorkspaceSaveBundle, materializeLocalWorkspace, materializeWorkspace } from "../reactive-editor/workspace-manifest";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); });
function setup() {
  const session = new WorkspaceSession(materializeLocalWorkspace({ type: "workspace-block", children: [{ type: "image-block", metadata: { title: "Unidentified image", url: "https://example.test/image.png" } }] }), { features: { canvasWorkspace: true } });
  cleanup.push(() => session.dispose()); session.selectPresentation("canvas");
  const host = document.body.appendChild(document.createElement("main")); cleanup.push(render(() => <WorkspacePresentationView session={session} />, host));
  return { session, editor: session.editor, actions: canvasActions(session), host };
}
describe("Canvas object actions", () => {
  it("creates a bank once, preserves authored app state across remount, and round-trips local/server identities and layout", async () => {
    const { session, editor, actions, host } = setup();
    const app = actions.create("counter", "Pilot"), doc = actions.create("document", "New note");
    expect(editor.encodeWorkspace().children!.filter(c => c.type === "workspace-object-bank-block")).toHaveLength(1);
    const plus = [...host.querySelectorAll<HTMLButtonElement>(".canvas-counter button")].find(b => b.textContent === "+")!; plus.click(); plus.click();
    expect(host.querySelector('.canvas-counter output')?.textContent).toBe("2");
    expect(session.selectPresentation("desktop")).toBe(true); expect(host.querySelector('.canvas-counter')).toBeNull();
    expect(host.querySelector('[aria-label="Workspace object bank"]')).not.toBeNull();
    expect(session.selectPresentation("canvas")).toBe(true); expect(host.querySelector('.canvas-counter output')?.textContent).toBe("2");
    const capture = editor.persistence.captureWorkspace(), bundle = await createWorkspaceSaveBundle(capture.repository, [], "workspace", capture.presentation);
    expect(bundle.documents).toHaveLength(1);
    for (const loaded of [materializeLocalWorkspace(capture.document), materializeWorkspace(bundle.manifest, new Map(bundle.documents.map(d => [d.documentId, d.document])))]) {
      const reopened = new WorkspaceSession(loaded, { features: { canvasWorkspace: true } }); cleanup.push(() => reopened.dispose());
      expect(reopened.presentation.read()).toEqual(session.presentation.read());
      expect(reopened.canvasRoots().find(r => r.placement.id === doc)?.nodeKey).toBeTruthy();
      expect(Object.values(reopened.editor.repository.state.contents).find(c => c.viewType === "canvas-counter-block")?.payload.count).toBe(2);
    }
    const before = editor.repository.state.revision; actions.remove(app); expect(editor.repository.state.revision).toBe(before);
    const objectId = session.presentation.read()!.objects.find(o => o.label === "Pilot")!.id;
    expect(actions.add(objectId)).toBe(app); expect(actions.add(objectId)).toBe(app);
    expect(session.presentation.read()!.presentations.canvas!.placements.filter(p => p.id === app)).toHaveLength(1);
  });
  it("owns separate application instances and disposes only the removed view", () => {
    const { actions, host } = setup();
    const first = actions.create("counter", "First app"), second = actions.create("counter", "Second app");
    const root = (id: string) => host.querySelector(`[data-canvas-placement="${id}"]`)!;
    const secondMount = root(second).querySelector('.canvas-counter');
    root(first).querySelector<HTMLButtonElement>('[aria-label="Increase counter"]')!.click();
    expect([...host.querySelectorAll('.canvas-counter output')].map(e => e.textContent)).toEqual(["1", "0"]);
    actions.remove(first);
    expect(root(second).querySelector('.canvas-counter')).toBe(secondMount);
    root(second).querySelector<HTMLButtonElement>('[aria-label="Increase counter"]')!.click();
    expect(root(second).querySelector('output')?.textContent).toBe("1");
  });

  it("front/back ordering preserves the relative order of other objects and authored metadata", () => {
    const { session, editor, actions } = setup();
    const a = actions.create("counter", "A"), b = actions.create("counter", "B"), c = actions.create("counter", "C");
    const authored = JSON.stringify(editor.encodeWorkspace()), revision = editor.repository.state.revision;
    const order = () => session.presentation.read()!.presentations.canvas!.placements.slice().sort((a, b) => a.order - b.order).map(p => p.id);
    const original = order(); actions.order(a, Infinity);
    expect(order()).toEqual([original[0], b, c, a]); actions.order(c, -Infinity);
    expect(order()).toEqual([c, original[0], b, a]);
    expect(editor.repository.state.revision).toBe(revision); expect(JSON.stringify(editor.encodeWorkspace())).toBe(authored);
  });

  it("validates before insertion and leaves failed content/directory unchanged", () => {
    const { session, editor, actions } = setup(); const before = editor.persistence.captureWorkspace();
    expect(() => actions.create("image", "blob:session-only")).toThrow("session-only");
    vi.spyOn(editor.commands, "insert").mockImplementation(() => { throw new Error("insertion failed"); });
    expect(() => actions.create("document", "Fail")).toThrow("insertion failed");
    expect(editor.repository.state.revision).toBe(before.repository.revision);
    expect(session.presentation.read()).toEqual(before.presentation?.value);
  });
  it("add-existing identifies missing anchors once without replacing an existing layout", () => {
    const { session, editor, actions } = setup();
    editor.commands.insert({ type: "image-block", metadata: { title: "Later" } }, { kind: "at", parentKey: session.projection.state.rootKey, index: 1 });
    const before = session.presentation.read()!.presentations.canvas!, item = actions.candidates().find(o => o.label === "Later")!;
    const id = actions.add(item.id); expect(session.canvasRoots().find(r => r.placement.id === id)?.nodeKey).toBeTruthy();
    expect(session.presentation.read()!.presentations.canvas!.placements[0]).toEqual(before.placements[0]);
    const revision = editor.repository.state.revision; actions.add(item.id); expect(editor.repository.state.revision).toBe(revision);
  });
  it("keeps opaque layouts and bank content accessible with Canvas disabled", () => {
    const { session, actions } = setup(); actions.create("document", "Bank note"); actions.create("counter", "Pilot");
    const captured = session.editor.persistence.captureWorkspace();
    const absent = new WorkspaceSession(materializeLocalWorkspace(captured.document)); cleanup.push(() => absent.dispose());
    const host = document.body.appendChild(document.createElement("main")); cleanup.push(render(() => <ReactiveTreeView editor={absent.editor} projection={absent.projection} />, host));
    expect(absent.presentation.active()).toBe("desktop");
    [...host.querySelectorAll<HTMLButtonElement>('.workspace-object-bank button')].find(b => b.textContent === 'Bank note')!.click();
    expect(host.querySelector('[contenteditable="true"]')).not.toBeNull();
    const savedWithoutCanvas = absent.editor.persistence.captureWorkspace().document;
    expect((savedWithoutCanvas.metadata as any)?.workspacePresentation).toEqual((captured.document.metadata as any)?.workspacePresentation);
    const enabledAgain = new WorkspaceSession(materializeLocalWorkspace(savedWithoutCanvas), { features: { canvasWorkspace: true } }); cleanup.push(() => enabledAgain.dispose());
    expect(enabledAgain.presentation.active()).toBe("canvas");
    expect(enabledAgain.canvasRoots().every(root => !!root.nodeKey)).toBe(true);
    expect(enabledAgain.presentation.read()).toEqual(session.presentation.read());
  });
});
