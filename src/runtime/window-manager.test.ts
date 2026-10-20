import { describe, expect, it } from "vitest";
import { WindowRegistry } from "./window-manager";

const windowInput = (id: string, pinned = false) => ({ id, pinned, placementKey: id, ownerAppInstanceId: `app:${id}`, sourceViewId: "view" });
describe("A0 window policy", () => {
  it("keeps dense normal/pinned groups and treats raising the frontmost owner as a no-op", () => {
    const registry = new WindowRegistry();
    registry.registerWindow(windowInput("ink")); registry.registerWindow(windowInput("pinned", true)); registry.registerWindow(windowInput("thesis"));
    expect(["ink", "thesis", "pinned"].map(id => registry.windows[id].rank)).toEqual([1, 2, 3]);
    registry.raise("ink");
    expect(["thesis", "ink", "pinned"].map(id => registry.windows[id].rank)).toEqual([1, 2, 3]);
    const revision = registry.revision(); registry.raise("ink");
    expect(registry.revision()).toBe(revision);
  });
  it("separates mounted, visible and active, without requesting focus", () => {
    const registry = new WindowRegistry(), lease = registry.registerWindow(windowInput("ink"));
    lease.activity(true, false); registry.observeFocus("ink");
    expect(registry.windows.ink).toMatchObject({ mounted: true, visible: false, active: false });
    lease.activity(true, true); registry.observeFocus("ink");
    expect(registry.windows.ink.active).toBe(true);
    lease.activity(true, false);
    expect(registry.windows.ink).toMatchObject({ mounted: true, visible: false, active: false });
    lease.activity(false, true);
    expect(registry.windows.ink).toMatchObject({ mounted: false, visible: false });
  });
  it("stamps ownership, rejects invalid parents, and makes stale disposal harmless", () => {
    const registry = new WindowRegistry(), old = registry.registerWindow(windowInput("ink"));
    const input = { id: "tool", ownerWindowId: "ink", sourceViewId: "document-occurrence", kind: "tool" as const, modality: "none" as const };
    const stop = registry.registerSurface(input);
    expect(registry.surfaces.tool.ownerAppInstanceId).toBe("app:ink");
    expect(() => registry.registerSurface({ ...input, id: "child", parentSurfaceId: "missing" })).toThrow();
    registry.registerSurface({ ...input, id: "child", parentSurfaceId: "tool", kind: "overlay" });
    stop(); expect(Object.keys(registry.surfaces)).toEqual([]);
    const nextStop = registry.registerSurface(input); stop(); expect(registry.surfaces.tool).toBeDefined();
    old.release(); expect(Object.keys(registry.surfaces)).toEqual([]);
    registry.registerWindow(windowInput("ink")); old.release(); nextStop();
    expect(registry.windows.ink).toBeDefined();
    registry.dispose(); expect(Object.keys(registry.windows)).toEqual([]);
  });
  it("keeps owner modal metadata and shell surfaces outside the desktop order", () => {
    const registry = new WindowRegistry(); registry.registerWindow(windowInput("ink"));
    const revision = registry.revision();
    const modal = registry.registerSurface({ id: "storage", ownerWindowId: "ink", sourceViewId: "view", kind: "dialog", modality: "window" });
    const shell = registry.registerSurface({ id: "shell-menu", sourceViewId: "shell", kind: "overlay", modality: "none" });
    expect(registry.windows.ink.ownerModalCount).toBe(1);
    expect(registry.surfaces["shell-menu"].ownerAppInstanceId).toBe("workspace-shell");
    expect(registry.revision()).toBe(revision); expect(Object.keys(registry.windows)).toEqual(["ink"]);
    modal(); modal(); shell();
    expect(registry.windows.ink.ownerModalCount).toBe(0);
  });
});
