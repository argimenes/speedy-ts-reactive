// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { BindingRegistry, chord, keyboard } from "./bindings";

afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

function action(registry: BindingRegistry, id: string, defaults: any[]) {
  registry.register({ id, name: id === "list" ? "Listing" : "Reference", description: "", category: "Entities", tags: [], scope: "editor", defaults, handler: context => context.run(id) });
}

describe("chord bindings", () => {
  it("shows a pending hint and invokes only the completed sequence", () => {
    const registry = new BindingRegistry();
    action(registry, "list", [chord(keyboard(";", "Ctrl"), keyboard("l"))]);
    action(registry, "reference", [chord(keyboard(";", "Ctrl"), keyboard("r"))]);
    const run = vi.fn(), prefix = new KeyboardEvent("keydown", { key: ";", ctrlKey: true, cancelable: true });
    expect(registry.dispatch(prefix, ["editor"], run)).toBe(true);
    expect(prefix.defaultPrevented).toBe(true); expect(registry.pendingHint()).toContain("L Listing"); expect(run).not.toHaveBeenCalled();
    const finish = new KeyboardEvent("keydown", { key: "l", cancelable: true });
    expect(registry.dispatch(finish, ["editor"], run)).toBe(true);
    expect(run).toHaveBeenCalledWith("list"); expect(registry.pendingHint()).toBe(""); registry.dispose();
  });

  it("cancels on Escape, timeout and an unknown stroke without swallowing the unknown key", () => {
    vi.useFakeTimers(); const registry = new BindingRegistry();
    action(registry, "list", [chord(keyboard(";", "Ctrl"), keyboard("l"))]); const run = vi.fn();
    const prefix = () => registry.dispatch(new KeyboardEvent("keydown", { key: ";", ctrlKey: true, cancelable: true }), ["editor"], run);
    prefix(); const unknown = new KeyboardEvent("keydown", { key: "x", cancelable: true }); expect(registry.dispatch(unknown, ["editor"], run)).toBe(false); expect(unknown.defaultPrevented).toBe(false);
    prefix(); const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true }); expect(registry.dispatch(escape, ["editor"], run)).toBe(true); expect(registry.pendingHint()).toBe("");
    prefix(); const composing = new KeyboardEvent("keydown", { key: "l", isComposing: true, cancelable: true }); expect(registry.dispatch(composing, ["editor"], run)).toBe(false); expect(registry.pendingHint()).toBe("");
    prefix(); vi.advanceTimersByTime(1501); expect(registry.pendingHint()).toBe(""); expect(run).not.toHaveBeenCalled(); registry.dispose();
  });

  it("detects prefix conflicts and imports version-one preferences", () => {
    const registry = new BindingRegistry(); action(registry, "list", [chord(keyboard(";", "Ctrl"), keyboard("l"))]); action(registry, "reference", [keyboard("r", "Alt")]);
    expect(registry.conflicts("reference", [keyboard(";", "Ctrl")]).map(item => item.id)).toEqual(["list"]);
    registry.import(JSON.stringify({ version: 1, overrides: { reference: [{ kind: "keyboard", key: "q", modifiers: ["Ctrl"] }] } }));
    expect(registry.label("reference")).toBe("Ctrl+q"); expect(JSON.parse(registry.export()).version).toBe(2); registry.dispose();
  });

  it("rejects ambiguous prefixes within assignments and imported actions", () => {
    const registry = new BindingRegistry(); action(registry, "list", [chord(keyboard(";", "Ctrl"), keyboard("l"))]); action(registry, "reference", [keyboard("r", "Alt")]);
    expect(() => registry.assign("reference", [keyboard(";", "Ctrl"), chord(keyboard(";", "Ctrl"), keyboard("r"))])).toThrow("ambiguous");
    expect(() => registry.import(JSON.stringify({ version: 2, overrides: {
      list: [{ kind: "keyboard", key: ";", modifiers: ["Ctrl"] }],
      reference: [{ kind: "chord", steps: [{ kind: "keyboard", key: ";", modifiers: ["Ctrl"] }, { kind: "keyboard", key: "r", modifiers: [] }] }],
    } }))).toThrow("Conflicting imported bindings");
    registry.dispose();
  });
});
