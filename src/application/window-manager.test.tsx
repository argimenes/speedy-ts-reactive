// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { workspaceOpen } from "./workspace-open";
import type { ExistingBlockDto } from "../block-tree/types";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(stop => stop()); document.body.replaceChildren(); vi.restoreAllMocks(); });
function mount(enabled = true) {
  const dto: ExistingBlockDto = { id: "workspace", type: "workspace-block", children: [
    { id: "background", type: "canvas-background-block", children: [
      { id: "ink", type: "document-window-block", metadata: { title: "Ink", state: "maximized", zIndex: 99999999 }, children: [
        { id: "doc", type: "document-block", metadata: { documentId: "doc" }, children: [{ id: "text", type: "plain-text-block", text: "Selected text" }] },
      ] },
      { id: "other", type: "window-block", metadata: { title: "Other", zIndex: 2 }, children: [{ type: "plain-text-block", text: "Other text" }] },
    ] },
  ] };
  const session = new WorkspaceSession(materializeLocalWorkspace(dto), { features: { mutableWindowManager: enabled } });
  const host = document.body.appendChild(document.createElement("main")); host.className = "workspace-demo"; host.dataset.windowWorkArea = "";
  cleanups.push(() => session.dispose());
  cleanups.push(render(() => <WorkspacePresentationView session={session} />, host));
  const node = (id: string) => Object.values(session.projection.state.nodes).find(n => n.payload.id === id)!;
  return { session, editor: session.editor, host, node, manager: session.windowManager };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

it("adopts imports independently of mount order, raises without resource/history changes, and cleans up", async () => {
  const f = mount(), registry = f.manager!.registry, ink = f.node("ink"), other = f.node("other");
  expect(Object.keys(registry.windows)).toHaveLength(2);
  expect(registry.windows[ink.key].rank).toBe(2);
  const before = f.editor.encodeWorkspace(), revision = f.editor.repository.state.revision;
  f.manager!.raisePlacement(other.placementKey);
  expect(registry.windows[other.key].rank).toBe(2);
  expect(f.editor.encodeWorkspace()).toEqual(before);
  expect(f.editor.repository.state.revision).toBe(revision);
  expect(f.host.querySelectorAll(".mwm-window-group")).toHaveLength(2);
  f.editor.closeView(other.key); await tick();
  expect(registry.windows[other.key]).toBeUndefined();
  expect(f.host.querySelectorAll(".mwm-window-group")).toHaveLength(1);
});

it("owns portalled panels by source occurrence and keeps them with the window group", async () => {
  const f = mount(), registry = f.manager!.registry;
  const stop = f.editor.panels.register({ type: "a0-tool", view: () => <input aria-label="A0 tool" /> });
  cleanups.push(stop);
  const key = f.editor.overlays.open({ ownerKey: f.node("text").key, viewType: "a0-tool", anchor: { x: 1, y: 1 } });
  await tick();
  const input = document.querySelector<HTMLInputElement>('[aria-label="A0 tool"]')!;
  expect(input.closest<HTMLElement>("[data-mwm-window]")!.dataset.mwmWindow).toBe(f.node("ink").key);
  expect(registry.surfaces[key]).toMatchObject({ ownerWindowId: f.node("ink").key, sourceViewId: f.session.projection.viewId });
  input.focus(); expect(registry.windows[f.node("ink").key].active).toBe(true);
  f.manager!.raisePlacement(f.node("other").placementKey);
  expect(registry.windows[f.node("other").key].rank).toBeGreaterThan(registry.windows[f.node("ink").key].rank);
  expect(document.querySelector('[aria-label="A0 tool"]')).toBe(input);
  f.editor.closeView(f.node("ink").key); await tick();
  expect(registry.surfaces[key]).toBeUndefined();
  expect(document.querySelector('[aria-label="A0 tool"]')).toBeNull();
});

it("launches new workspace windows above historical z values through central registration", () => {
  const f = mount();
  const placement = workspaceOpen(f.session).newDocument();
  const added = f.session.projection.nodeForPlacement(placement)!;
  expect(f.manager!.registry.windows[added.key].rank).toBeGreaterThan(f.manager!.registry.windows[f.node("ink").key].rank);
  expect(f.host.querySelectorAll(".mwm-window-group")).toHaveLength(3);
});

it("does no registry ordering, registration, snapshots or owner lookup on ordinary text edits", async () => {
  const f = mount(), registry = f.manager!.registry;
  await tick();
  const registration = vi.spyOn(registry, "registerWindow"), raise = vi.spyOn(registry, "raise"), ownership = vi.spyOn(f.manager!, "ownerForNode");
  const snapshot = vi.spyOn(f.editor.repository, "snapshot"), revision = registry.revision();
  f.editor.commands.setPayloadField(f.node("text").key, "text", "Changed text");
  await tick();
  expect(registry.revision()).toBe(revision);
  expect(registration).not.toHaveBeenCalled(); expect(raise).not.toHaveBeenCalled();
  expect(ownership).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
});

it("keeps the exclusive legacy path when disabled", () => {
  const f = mount(false);
  expect(f.manager).toBeUndefined(); expect(f.editor.windowManager).toBeUndefined();
  expect(f.host.querySelector(".mwm-window-plane")).toBeNull();
  const ink = f.host.querySelector<HTMLElement>('[data-block-id="ink"]')!;
  expect(ink.style.zIndex).toBe("99999999");
});
