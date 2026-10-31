// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { desktopApplications, openDesktopPlaceholder, type DesktopActions } from "./desktop-applications";
import { CodexSystemBar } from "../demo/codex-system-bar";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(stop => stop()); document.body.replaceChildren(); vi.restoreAllMocks(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function mount(enabled = true, extra = 0, actions?: DesktopActions) {
  const session = new WorkspaceSession(materializeLocalWorkspace({ id: "workspace", type: "workspace-block", children: [
    { id: "background", type: "canvas-background-block", children: [] },
    { id: "bank", type: "workspace-object-bank", children: Array.from({ length: extra }, (_, i) => ({ id: `doc-${i}`, type: "document-block", children: [{ id: `text-${i}`, type: "standoff-editor-block", text: "Unrelated annotated content", standoffProperties: [{ id: `annotation-${i}`, type: "bold", start: 0, end: 8 }] }] })) },
  ] }), { features: { desktopApplicationIcons: enabled, entityReferences: false } });
  const host = document.body.appendChild(document.createElement("main")); host.dataset.windowWorkArea = "";
  cleanups.push(() => session.dispose());
  cleanups.push(render(() => <WorkspacePresentationView session={session} desktopActions={actions} />, host));
  const icon = (id: string) => host.querySelector<HTMLButtonElement>(`[data-desktop-application="${id}"]`)!;
  const click = (id: string, double = false) => icon(id).dispatchEvent(new MouseEvent(double ? "dblclick" : "click", { bubbles: true, detail: double ? 2 : 1 }));
  return { session, editor: session.editor, host, icon, click };
}
it("renders all 18 tiles; selection and background clearing never commit or snapshot", () => {
  const f = mount(), snapshot = vi.spyOn(f.editor.repository, "snapshot"), commit = vi.spyOn(f.editor.repository, "commit");
  expect([...f.host.querySelectorAll('[data-desktop-application]')].map(el => el.getAttribute("aria-label"))).toEqual(desktopApplications.map(a => a.name));
  f.click("flint"); expect(f.icon("flint").getAttribute("aria-pressed")).toBe("true");
  f.click("tasks"); expect(f.icon("flint").getAttribute("aria-pressed")).toBe("false");
  f.host.querySelector("[data-workspace-background]")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  expect(f.icon("tasks").getAttribute("aria-pressed")).toBe("false");
  expect(snapshot).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
  expect(Object.keys(f.session.windowManager!.registry.windows)).toHaveLength(0);
});
it("uses existing commands and host actions only on activation", async () => {
  const workbench = vi.fn(), cavern = vi.fn(), f = mount(true, 0, { workbench, cavern });
  const execute = vi.spyOn(f.editor.commandRegistry, "execute").mockImplementation(() => {});
  for (const id of ["flint", "thesis", "phosphor"]) { f.click(id); expect(execute).not.toHaveBeenCalledWith(`${id}.open`, expect.anything()); f.click(id, true); await tick(); expect(execute).toHaveBeenCalledWith(`${id}.open`, { targetKey: f.session.projection.state.rootKey, args: undefined }); }
  f.click("graph", true); await tick(); expect(execute).toHaveBeenCalledWith("flint.open", { targetKey: f.session.projection.state.rootKey, args: { view: "graph" } });
  f.click("workbench", true); await tick(); f.click("cavern", true); await tick();
  expect(workbench).toHaveBeenCalledOnce(); expect(cavern).toHaveBeenCalledOnce();
});
it.each([0, 50])("placeholder creation is local with %i unrelated Documents; reuse, restore, Close and history use existing windows", async extra => {
  const f = mount(true, extra), app = desktopApplications.find(a => a.id === "tasks")!;
  const snapshot = vi.spyOn(f.editor.repository, "snapshot"), rebuild = vi.spyOn(f.editor.repository as any, "rebuildReferences"), projection = vi.spyOn(f.session.projection as any, "build");
  openDesktopPlaceholder(f.session, app); await tick();
  expect(f.host.querySelector('[data-desktop-placeholder="tasks"]')?.textContent).toContain("Tasks is not yet available in Mutable OS.");
  expect(snapshot).not.toHaveBeenCalled(); expect(rebuild).not.toHaveBeenCalled(); expect(projection).not.toHaveBeenCalled();
  f.editor.repository.undo(); await tick(); expect(Object.keys(f.session.windowManager!.registry.windows)).toHaveLength(0);
  f.editor.repository.redo(); await tick(); expect(Object.keys(f.session.windowManager!.registry.windows)).toHaveLength(1);
  const manager = f.session.windowManager!, id = Object.keys(manager.registry.windows)[0];
  manager.lifecycle.minimize(id); await tick();
  expect(manager.registry.windows[id].visible).toBe(false);
  f.click("tasks", true); await tick();
  expect(Object.keys(manager.registry.windows)).toEqual([id]); expect(manager.registry.windows[id].visible).toBe(true);
  f.host.querySelector<HTMLButtonElement>('[data-desktop-placeholder="tasks"] button')!.click(); await tick();
  expect(Object.keys(manager.registry.windows)).toHaveLength(0);
  f.click("tasks", true); await tick(); expect(Object.keys(manager.registry.windows)).toEqual([id]);
});
it("keeps desktop DOM unchanged while an unrelated Document is edited", async () => {
  const f = mount(true, 2), root = f.host.querySelector('.desktop-applications')!, changes: MutationRecord[] = [];
  const observer = new MutationObserver(records => changes.push(...records)); observer.observe(root, { attributes: true, childList: true, subtree: true, characterData: true });
  const text = Object.values(f.session.projection.state.nodes).find(n => n.payload.id === "text-0")!;
  const snapshot = vi.spyOn(f.editor.repository, "snapshot"), rebuild = vi.spyOn(f.session.projection as any, "build");
  f.editor.commands.replaceInlineRange(text.key, 0, 0, "A"); await tick(); observer.disconnect();
  expect(changes).toHaveLength(0); expect(snapshot).not.toHaveBeenCalled(); expect(rebuild).not.toHaveBeenCalled();
});
it("honours the default-on feature flag", () => { const f = mount(false); expect(f.host.querySelector('.desktop-applications')).toBeNull(); });
it("does not bypass an existing command guard with a placeholder", async () => {
  const f = mount(); vi.spyOn(f.editor.commandRegistry, "canExecute").mockReturnValue(false);
  f.click("flint", true); await tick();
  expect(f.host.querySelector('[role="status"]')?.textContent).toContain("Could not open Flint");
  expect(Object.keys(f.session.windowManager!.registry.windows)).toHaveLength(0);
});
it("exposes the existing Workspace menu without toggling it closed on repeated launch", async () => {
  let open: (() => void) | undefined;
  const host = document.body.appendChild(document.createElement("div"));
  cleanups.push(render(() => <CodexSystemBar workspaceLauncher={value => { open = value; }}><button role="menuitem">Existing action</button></CodexSystemBar>, host));
  open!(); await tick(); open!(); await tick();
  expect(host.querySelector('[data-system-menu="workspace"]')).not.toBeNull();
});
