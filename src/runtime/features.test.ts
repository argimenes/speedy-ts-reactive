// @vitest-environment jsdom
import { createEffect, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { BlockRegistry, CommandRegistry } from "../block-tree/registry";
import { BindingRegistry } from "../input/bindings";
import { FeatureActions, FeatureHost } from "./features";

describe("owned feature lifetime", () => {
  it("rolls back partial activation, stops effects/deferred work, and permits retry", async () => {
    const host = new FeatureHost(), commands = new CommandRegistry();
    const disposed = vi.fn(), deferred = vi.fn(), effect = vi.fn();
    const [value, setValue] = createSignal(0);
    expect(() => host.activate({ id: "pilot", activate(scope) {
      scope.own(commands.register({ id: "pilot.do", label: "Do", canExecute: () => true, execute() {} }, scope.owner));
      scope.own(disposed); scope.defer(deferred);
      throw new Error("injected failure");
    } })).toThrow("Feature pilot activation failed");
    await Promise.resolve();
    expect(commands.list()).toEqual([]); expect(host.list()).toEqual([]);
    expect(disposed).toHaveBeenCalledOnce(); expect(deferred).not.toHaveBeenCalled();
    const release = host.activate({ id: "pilot", activate(scope) {
      createEffect(() => effect(value())); scope.own(disposed);
    } });
    expect(() => host.activate({ id: "pilot", activate() {} })).toThrow("already active");
    expect(effect).toHaveBeenCalledWith(0);
    release(); release(); setValue(1); host.dispose(); host.dispose();
    expect(effect).toHaveBeenCalledTimes(1); expect(disposed).toHaveBeenCalledTimes(2);
    expect(() => host.activate({ id: "later", activate() {} })).toThrow("disposed");
  });

  it("rejects conflicting IDs/aliases atomically and makes old disposers harmless", () => {
    const blocks = new BlockRegistry(), commands = new CommandRegistry(), bindings = new BindingRegistry(), actions = new FeatureActions();
    const block = { type: "widget", aliases: ["alias"], capabilities: [], view: () => null };
    const command = { id: "widget.create", label: "Widget", canExecute: () => true, execute() {} };
    const binding = { id: command.id, name: "Widget", description: "", category: "", tags: [], defaults: [], scope: "editor", handler() {} };
    const action = { id: "widget.menu", slot: "add-block-menu" as const, label: "Widget", command: command.id };
    const releases = [blocks.register(block, "one"), commands.register(command, "one"), bindings.register(binding, "one"), actions.register(action, "one")];
    expect(blocks.owner("alias")).toBe("one"); expect(commands.owner(command.id)).toBe("one"); expect(bindings.owner(command.id)).toBe("one");
    expect(() => blocks.register({ ...block, type: "other" }, "two")).toThrow("one");
    expect(blocks.resolve("other")).toBeUndefined();
    expect(() => blocks.register({ ...block, type: "alias", aliases: [] }, "two")).toThrow("one");
    expect(() => commands.register(command, "two")).toThrow("one");
    expect(() => bindings.register(binding, "two")).toThrow("one");
    expect(() => actions.register(action, "two")).toThrow("one");
    releases.forEach(release => release());
    const replacements = [blocks.register(block, "two"), commands.register(command, "two"), bindings.register(binding, "two"), actions.register(action, "two")];
    releases.forEach(release => release());
    expect(blocks.owner("widget")).toBe("two"); expect(commands.owner(command.id)).toBe("two"); expect(bindings.owner(command.id)).toBe("two"); expect(actions.list("add-block-menu")[0].owner).toBe("two");
    replacements.forEach(release => release()); bindings.dispose();
    expect(blocks.resolve("alias")).toBeUndefined(); expect(actions.list("add-block-menu")).toEqual([]);
  });
});
