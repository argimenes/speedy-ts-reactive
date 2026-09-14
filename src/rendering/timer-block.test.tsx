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
  const trigger = (target: Element) => {
    const prefix = new KeyboardEvent("keydown", { key: ";", ctrlKey: true, bubbles: true, cancelable: true }); target.dispatchEvent(prefix);
    const finish = new KeyboardEvent("keydown", { key: "t", bubbles: true, cancelable: true }); target.dispatchEvent(finish);
    return { prefix, finish };
  };
  return { editor, projection, host, node, timers, trigger };
}

describe("TimerBlock", () => {
  it("uses Ctrl+; then T, inserts after non-empty text, replaces empty text and appears in Add Block", async () => {
    const { editor, host, node, timers, trigger } = setup([
      { id: "full", type: "standoff-editor-block", text: "Keep this" },
      { id: "empty", type: "standoff-editor-block", text: "" },
    ]);
    editor.crossText.enable(true);
    const full = editor.mounts.get(node("full").key)!.focusElement; full.focus();
    const first = trigger(full); expect(first.prefix.defaultPrevented).toBe(true); expect(first.finish.defaultPrevented).toBe(true); await tick();
    expect(editor.encodeDocument().children?.map(item => item.type)).toEqual(["standoff-editor-block", "timer-block", "standoff-editor-block"]);
    expect(host.querySelector(".reactive-timer__display")?.textContent).toBe("05:00");
    editor.repository.undo(); expect(timers()).toHaveLength(0);

    const empty = editor.mounts.get(node("empty").key)!.focusElement; empty.focus(); trigger(empty); await tick();
    expect(editor.encodeDocument().children?.map(item => item.id)).toEqual(["full", expect.any(String)]);
    expect(editor.encodeDocument().children?.[1].type).toBe("timer-block");
    editor.repository.undo();
    const add = blockMenuItems(editor, node("full").key).find(item => item.label === "Add Block")!;
    add.children!.find(item => item.label === "Timer")!.run!(); await tick();
    expect(timers()).toHaveLength(1);
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
    const { editor, host, node } = setup([timer]);
    const display = () => host.querySelector<HTMLOutputElement>(".reactive-timer__display")!;
    expect(display().textContent).toBe("05:00");
    host.querySelector<HTMLButtonElement>("button")!.click();
    const afterStart = editor.repository.state.revision;
    expect(node("timer").payload.timer).toMatchObject({ durationSeconds: 300, mode: "running", runningUntil: Date.now() + 300000 });
    await vi.advanceTimersByTimeAsync(1000); expect(display().textContent).toBe("04:59"); expect(editor.repository.state.revision).toBe(afterStart);

    host.querySelector<HTMLButtonElement>("button")!.click();
    expect(node("timer").payload.timer).toMatchObject({ mode: "paused", remainingMilliseconds: 299000 });
    const pausedRevision = editor.repository.state.revision;
    await vi.advanceTimersByTimeAsync(10000); expect(display().textContent).toBe("04:59"); expect(editor.repository.state.revision).toBe(pausedRevision);

    const input = host.querySelector<HTMLInputElement>('[aria-label="Timer duration in minutes and seconds"]')!;
    input.value = "00:02"; input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Set")!.click();
    expect(display().textContent).toBe("00:02"); expect(node("timer").payload.timer).toMatchObject({ durationSeconds: 2, mode: "idle" });
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Start")!.click();
    const runningRevision = editor.repository.state.revision;
    await vi.advanceTimersByTimeAsync(2000); expect(display().textContent).toBe("00:00"); expect(host.textContent).toContain("Time’s up");
    expect(editor.repository.state.revision).toBe(runningRevision); expect(sounded).toHaveBeenCalledTimes(1);
    expect(editor.encodeDocument().children?.[0].timer).toMatchObject({ mode: "running", runningUntil: Date.now() });
    await vi.advanceTimersByTimeAsync(5000); expect(sounded).toHaveBeenCalledTimes(1);

    [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Done")!.click(); await tick();
    expect(editor.encodeDocument().children).toEqual([]);
    editor.repository.undo(); await tick(); expect(host.textContent).toContain("Time’s up");
  });

  it("reconstructs remaining time after reload and commits resize only when the gesture ends", async () => {
    const timer = timerBlockDto(); timer.id = "timer";
    const { editor, host, node } = setup([timer]);
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Start")!.click();
    const saved = editor.encodeDocument(); await vi.advanceTimersByTimeAsync(60000);
    const loaded = setup(saved.children!); await tick();
    expect(loaded.host.querySelector(".reactive-timer__display")?.textContent).toBe("04:00");

    const handle = host.querySelector<HTMLElement>(".reactive-timer__resize")!; handle.setPointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number) => handle.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
    const revision = editor.repository.state.revision;
    pointer("pointerdown", 0, 0); pointer("pointermove", 40, 20);
    expect(editor.repository.state.revision).toBe(revision); expect(host.querySelector<HTMLElement>(".reactive-timer")!.style.width).toBe("300px");
    pointer("pointerup", 40, 20);
    expect(editor.repository.state.revision).toBe(revision + 1);
    expect(node("timer").payload.blockProperties).toEqual([expect.objectContaining({ type: "block/size", metadata: expect.objectContaining({ width: 300, height: 280 }) })]);
  });
});
