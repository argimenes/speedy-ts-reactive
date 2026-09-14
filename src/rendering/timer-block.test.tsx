// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type { ExistingBlockDto } from "../block-tree/types";
import { ReactiveEditor } from "../reactive-editor/editor";
import { blockMenuItems } from "../runtime/block-menu-actions";
import { timerBlockDto } from "../runtime/timer-block";
import { ReactiveTreeView } from "./reactive-tree-view";
import { registerCoreViews } from "./register-core-views";

const cleanup: Array<() => void> = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-14T12:00:00Z")); });
afterEach(() => { cleanup.splice(0).reverse().forEach(dispose => dispose()); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

function setup(children: ExistingBlockDto[]) {
  const editor = new ReactiveEditor({ id: "document", type: "document-block", children });
  registerCoreViews(editor); const projection = editor.createView("timer-test"), host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(item => item.payload.id === id)!;
  const timers = () => Object.values(projection.state.nodes).filter(item => item.viewType === "timer-block");
  const timerElement = (key: string) => document.querySelector<HTMLElement>(`[data-client-id="${key}"][data-block-type="timer-block"]`)!;
  const trigger = (target: Element) => {
    const prefix = new KeyboardEvent("keydown", { key: ";", ctrlKey: true, bubbles: true, cancelable: true }); target.dispatchEvent(prefix);
    const finish = new KeyboardEvent("keydown", { key: "t", bubbles: true, cancelable: true }); target.dispatchEvent(finish);
    return { prefix, finish };
  };
  return { editor, projection, host, node, timers, timerElement, trigger };
}

describe("TimerBlock", () => {
  it("uses Ctrl+; then T, floats beside focused text without replacing it and appears in Add Block", async () => {
    const { editor, node, timers, timerElement, trigger } = setup([
      { id: "full", type: "standoff-editor-block", text: "Keep this" },
      { id: "empty", type: "standoff-editor-block", text: "" },
    ]);
    editor.crossText.enable(true);
    const full = editor.mounts.get(node("full").key)!.focusElement; full.focus();
    editor.mounts.get(node("full").key)!.root.getBoundingClientRect = () => ({ left: 400, top: 90, right: 700, bottom: 130, width: 300, height: 40, x: 400, y: 90, toJSON: () => ({}) });
    const first = trigger(full); expect(first.prefix.defaultPrevented).toBe(true); expect(first.finish.defaultPrevented).toBe(true); await tick();
    expect(editor.encodeDocument().children?.map(item => item.type)).toEqual(["standoff-editor-block", "timer-block", "standoff-editor-block"]);
    const created = timers()[0];
    expect(timerElement(created.key).querySelector(".reactive-timer__display")?.textContent).toBe("05:00");
    expect(timerElement(created.key).style.cssText).toContain("width: 130px");
    expect(timerElement(created.key).style.cssText).toContain("left: 270px");
    expect(created.payload.blockProperties).toContainEqual(expect.objectContaining({ type: "block/position", metadata: expect.objectContaining({ x: 270, y: 90, position: "fixed" }) }));
    editor.repository.undo(); expect(timers()).toHaveLength(0);

    const empty = editor.mounts.get(node("empty").key)!.focusElement; empty.focus(); trigger(empty); await tick();
    expect(editor.encodeDocument().children?.map(item => item.id)).toEqual(["full", "empty", expect.any(String)]);
    expect(editor.encodeDocument().children?.[2].type).toBe("timer-block");
    editor.repository.undo();
    const add = blockMenuItems(editor, node("full").key).find(item => item.label === "Add Block")!;
    add.children!.find(item => item.label === "Timer")!.run!(); await tick();
    expect(timers()).toHaveLength(1);
    timerElement(timers()[0].key).querySelector<HTMLButtonElement>('[aria-label="Close timer"]')!.click(); await tick();
    expect(timers()).toHaveLength(0);
    editor.repository.undo(); await tick(); expect(timers()).toHaveLength(1);
  });

  it("ticks locally, persists only controls, pauses, changes duration and removes itself when done", async () => {
    const sounded = vi.fn();
    vi.stubGlobal("AudioContext", class {
      currentTime = 0; destination = {};
      resume = vi.fn(); close = vi.fn();
      createOscillator() { return { type: "sine", frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: sounded, stop: vi.fn() }; }
      createGain() { return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }; }
    });
    const timer = timerBlockDto(); timer.id = "timer";
    const { editor, node, timerElement } = setup([timer]);
    const window = () => timerElement(node("timer").key);
    const display = () => window().querySelector<HTMLOutputElement>(".reactive-timer__display")!;
    expect(display().textContent).toBe("05:00");
    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Start")!.click();
    const afterStart = editor.repository.state.revision;
    expect(node("timer").payload.timer).toMatchObject({ durationSeconds: 300, mode: "running", runningUntil: Date.now() + 300000 });
    await vi.advanceTimersByTimeAsync(1000); expect(display().textContent).toBe("04:59"); expect(editor.repository.state.revision).toBe(afterStart);

    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Pause")!.click();
    expect(node("timer").payload.timer).toMatchObject({ mode: "paused", remainingMilliseconds: 299000 });
    const pausedRevision = editor.repository.state.revision;
    await vi.advanceTimersByTimeAsync(10000); expect(display().textContent).toBe("04:59"); expect(editor.repository.state.revision).toBe(pausedRevision);

    const input = window().querySelector<HTMLInputElement>('[aria-label="Timer duration in minutes and seconds"]')!;
    input.value = "00:02"; input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Set")!.click();
    expect(display().textContent).toBe("00:02"); expect(node("timer").payload.timer).toMatchObject({ durationSeconds: 2, mode: "idle" });
    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Start")!.click();
    const runningRevision = editor.repository.state.revision;
    await vi.advanceTimersByTimeAsync(2000); expect(display().textContent).toBe("00:00"); expect(window().textContent).toContain("Time’s up");
    expect(editor.repository.state.revision).toBe(runningRevision); expect(sounded).toHaveBeenCalledTimes(1);
    expect(editor.encodeDocument().children?.[0].timer).toMatchObject({ mode: "running", runningUntil: Date.now() });
    await vi.advanceTimersByTimeAsync(5000); expect(sounded).toHaveBeenCalledTimes(1);

    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Done")!.click(); await tick();
    expect(editor.encodeDocument().children).toEqual([]);
    editor.repository.undo(); await tick(); expect(window().textContent).toContain("Time’s up");
  });

  it("reconstructs remaining time after reload and commits move/resize only when each gesture ends", async () => {
    const timer = timerBlockDto(); timer.id = "timer";
    const { editor, node, timerElement } = setup([timer]);
    const window = () => timerElement(node("timer").key);
    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Start")!.click();
    const saved = editor.encodeDocument(); await vi.advanceTimersByTimeAsync(60000);
    const loaded = setup(saved.children!); await tick();
    expect(loaded.timerElement(loaded.node("timer").key).querySelector(".reactive-timer__display")?.textContent).toBe("04:00");

    const handle = window().querySelector<HTMLElement>(".reactive-timer__resize")!; handle.setPointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number) => handle.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
    const revision = editor.repository.state.revision;
    pointer("pointerdown", 0, 0); pointer("pointermove", 40, 20);
    expect(editor.repository.state.revision).toBe(revision); expect(window().style.width).toBe("170px");
    pointer("pointerup", 40, 20);
    expect(editor.repository.state.revision).toBe(revision + 1);
    expect(node("timer").payload.blockProperties).toContainEqual(expect.objectContaining({ type: "block/size", metadata: expect.objectContaining({ width: 170, height: 150 }) }));

    const header = window().querySelector<HTMLElement>(".reactive-timer__header")!; header.setPointerCapture = vi.fn();
    const drag = (type: string, x: number, y: number) => header.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
    const moveRevision = editor.repository.state.revision;
    drag("pointerdown", 20, 20); drag("pointermove", 50, 70);
    expect(editor.repository.state.revision).toBe(moveRevision); expect(window().style.left).toBe("54px"); expect(window().style.top).toBe("130px");
    drag("pointerup", 50, 70); expect(editor.repository.state.revision).toBe(moveRevision + 1);
    expect(node("timer").payload.blockProperties).toContainEqual(expect.objectContaining({ type: "block/position", metadata: expect.objectContaining({ x: 54, y: 130, position: "fixed" }) }));
  });
});
