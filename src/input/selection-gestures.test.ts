import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionGestures, type SelectionInputTarget } from "./selection-gestures";
import { CurrentTextOperations } from "../runtime/current-text-operation";

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(dispose => dispose()); document.body.replaceChildren(); });
function fixture() {
  const element = document.body.appendChild(document.createElement("div"));
  let target: SelectionInputTarget = { key: "text", excluded: false };
  const operations = new CurrentTextOperations();
  const operation = { active: vi.fn(() => true), owns: vi.fn(() => true), annotationTargets: () => [], apply: () => 0,
    delete: vi.fn(() => true), cancel: vi.fn(), error: vi.fn() };
  const releaseOperation = operations.register("test", operation);
  const snapshot = { ranges: [], head: { nodeKey: "text", index: 3 } };
  const ports = { operations, target: vi.fn(() => target), capture: vi.fn(() => snapshot), point: () => 1, focusedKey: () => "text", releasePointer: vi.fn(), clearSelection: vi.fn() };
  const gestures = new SelectionGestures(ports);
  const policy = { owner: "test", modifier: "Control" as const, complete: vi.fn(), removeAt: vi.fn(() => false), error: vi.fn() };
  const release = gestures.register(policy);
  gestures.install(document); cleanup.push(() => { gestures.dispose(); releaseOperation(); });
  const pointer = (type: string, ctrlKey = true, pointerId = 1) => {
    const event = new MouseEvent(type, { ctrlKey, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: pointerId }); element.dispatchEvent(event); return event;
  };
  const key = (type: string, key: string, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...options }); element.dispatchEvent(event); return event;
  };
  return { element, gestures, policy, ports, operation, operations, release, pointer, key, snapshot, target: (value: SelectionInputTarget) => { target = value; } };
}

describe("owned selection input", () => {
  it("claims policy without consuming geometry and completes after pointer release", async () => {
    const f = fixture();
    expect(f.pointer("pointerdown").defaultPrevented).toBe(false);
    expect(f.gestures.owner()).toBe("test");
    f.pointer("pointerup", true, 2); expect(f.gestures.selecting("pointer")).toBe(true);
    f.pointer("pointerup"); expect(f.policy.complete).not.toHaveBeenCalled();
    expect(f.gestures.owner()).toBeUndefined();
    await Promise.resolve(); expect(f.policy.complete).toHaveBeenCalledWith(f.snapshot);
  });
  it.each(["Control release", "pointercancel", "blur", "composition", "focus", "change", "dispose"])("cancels pending pointer completion on %s", async reason => {
    const f = fixture(); f.pointer("pointerdown");
    if (reason === "Control release") f.key("keyup", "Control");
    f.pointer("pointerup");
    if (reason === "pointercancel") f.pointer("pointercancel");
    if (reason === "blur") window.dispatchEvent(new Event("blur"));
    if (reason === "composition") f.element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    if (reason === "focus") { f.target({ excluded: true }); f.element.dispatchEvent(new Event("focusin", { bubbles: true })); }
    if (reason === "change") f.gestures.cancelGesture();
    if (reason === "dispose") f.release();
    await Promise.resolve(); expect(f.policy.complete).not.toHaveBeenCalled();
  });
  it("never upgrades a gesture after Control was released and pressed again", async () => {
    const f = fixture(); f.pointer("pointerdown"); f.pointer("pointermove", false); f.pointer("pointermove", true); f.pointer("pointerup");
    await Promise.resolve(); expect(f.policy.complete).not.toHaveBeenCalled();
  });
  it("releases core pointer capture when a live claim is cancelled", () => {
    const f = fixture(); f.pointer("pointerdown"); f.gestures.cancelGesture();
    expect(f.ports.releasePointer).toHaveBeenCalledOnce(); expect(f.gestures.owner()).toBeUndefined();
  });
  it("suppresses only owned click/menu events after a claimed pointer gesture", () => {
    const f = fixture(); f.pointer("pointerdown");
    expect(f.pointer("contextmenu").defaultPrevented).toBe(true);
    f.target({ excluded: false }); expect(f.pointer("contextmenu").defaultPrevented).toBe(false);
    f.target({ excluded: true }); expect(f.pointer("click").defaultPrevented).toBe(false);
  });
  it("removes a clicked range without collecting the selection again", async () => {
    const f = fixture(); f.policy.removeAt.mockReturnValue(true); f.pointer("pointerdown"); f.pointer("pointerup");
    await Promise.resolve(); expect(f.ports.clearSelection).toHaveBeenCalledWith("text"); expect(f.policy.complete).not.toHaveBeenCalled();
  });
  it.each(["Shift", "Control"])("completes keyboard selection once on %s release", release => {
    const f = fixture(); f.key("keydown", "ArrowRight", { ctrlKey: true, shiftKey: true });
    expect(f.gestures.selecting("keyboard")).toBe(true);
    f.key("keyup", release); f.key("keyup", release === "Shift" ? "Control" : "Shift");
    expect(f.policy.complete).toHaveBeenCalledTimes(1);
  });
  it("does not claim late Control or margin shortcuts", () => {
    const f = fixture(); f.key("keydown", "ArrowRight", { shiftKey: true }); f.key("keydown", "ArrowRight", { shiftKey: true, ctrlKey: true });
    f.key("keyup", "Control"); expect(f.policy.complete).not.toHaveBeenCalled();
    f.key("keydown", "L", { shiftKey: true, ctrlKey: true }); expect(f.gestures.owner()).toBeUndefined();
  });
  it("ordinary typing bypasses target classification and operation dispatch", () => {
    const f = fixture(); f.key("keydown", "x"); expect(f.ports.target).not.toHaveBeenCalled(); expect(f.operation.active).not.toHaveBeenCalled();
  });
  it.each([{ excluded: true }, { key: "text", excluded: false, composing: true }, { excluded: false }])("respects native/modal/composition/foreign targets %j", target => {
    const f = fixture(); f.target(target); f.pointer("pointerdown"); expect(f.gestures.owner()).toBeUndefined();
    expect(f.key("keydown", "Backspace").defaultPrevented).toBe(false);
    expect(f.key("keydown", "Escape").defaultPrevented).toBe(false); expect(f.operation.cancel).not.toHaveBeenCalled(); expect(f.operation.delete).not.toHaveBeenCalled();
  });
  it("composition cancellation prevents modifier release from collecting text", () => {
    const f = fixture(); f.key("keydown", "ArrowRight", { ctrlKey: true, shiftKey: true });
    f.element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); f.key("keyup", "Control");
    expect(f.key("keydown", "Backspace").defaultPrevented).toBe(false); expect(f.policy.complete).not.toHaveBeenCalled();
    f.element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    expect(f.key("keydown", "Backspace").defaultPrevented).toBe(true);
  });
  it("scopes deletion, finalizes pending keyboard selection, and consumes failed deletion plus repeat", () => {
    const f = fixture(); f.operation.owns.mockReturnValue(false);
    expect(f.key("keydown", "Delete").defaultPrevented).toBe(false); expect(f.operation.delete).not.toHaveBeenCalled();
    f.operation.owns.mockReturnValue(true); f.operation.delete.mockImplementation(() => { throw Error("stale"); });
    f.key("keydown", "ArrowRight", { ctrlKey: true, shiftKey: true });
    expect(f.key("keydown", "Delete").defaultPrevented).toBe(true); expect(f.policy.complete).toHaveBeenCalledTimes(1);
    expect(f.key("keydown", "Delete", { repeat: true }).defaultPrevented).toBe(true); expect(f.operation.delete).toHaveBeenCalledTimes(1);
    expect(f.operation.error).toHaveBeenCalledOnce(); f.key("keyup", "Delete"); f.key("keydown", "Delete"); expect(f.operation.delete).toHaveBeenCalledTimes(2);
  });
  it("consumes deletion if its pending selection cannot be captured", () => {
    const f = fixture(); f.ports.capture.mockImplementation(() => { throw Error("invalid selection"); });
    f.key("keydown", "ArrowRight", { ctrlKey: true, shiftKey: true });
    expect(f.key("keydown", "Backspace").defaultPrevented).toBe(true);
    expect(f.key("keydown", "Backspace", { repeat: true }).defaultPrevented).toBe(true);
    expect(f.operation.delete).not.toHaveBeenCalled(); expect(f.policy.error).toHaveBeenCalledOnce();
  });
  it("old installation and registration disposers cannot cancel replacements", () => {
    const f = fixture(); const oldInstall = f.gestures.install(document); f.gestures.install(document);
    f.pointer("pointerdown"); oldInstall(); expect(f.gestures.owner()).toBe("test");
    f.gestures.dispose(); f.gestures.register(f.policy); f.gestures.install(document);
    f.pointer("pointerdown"); f.release(); expect(f.gestures.owner()).toBe("test");
  });
  it("rejects conflicting owners and makes old release handles harmless", () => {
    const f = fixture(); expect(() => f.gestures.register({ ...f.policy, owner: "other" })).toThrow("test");
    expect(() => f.operations.register("other", f.operation)).toThrow("test");
    f.release(); const release = f.gestures.register({ ...f.policy, owner: "replacement" }); f.release();
    f.pointer("pointerdown"); expect(f.gestures.owner()).toBe("replacement"); release(); expect(f.gestures.owner()).toBeUndefined();
  });
});
