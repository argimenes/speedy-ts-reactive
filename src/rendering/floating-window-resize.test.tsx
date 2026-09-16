// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { createFloatingWindowResize, FloatingWindowResizeHandle, type FloatingWindowSize } from "./floating-window-resize";

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()?.(); document.body.replaceChildren(); vi.useRealTimers(); });

function mount() {
  const host = document.body.appendChild(document.createElement("div"));
  const commits: FloatingWindowSize[] = [];
  let box!: HTMLDivElement;
  const dispose = render(() => {
    const [size, setSize] = createSignal({ width: 300, height: 200 });
    const resize = createFloatingWindowResize({
      element: () => box,
      size,
      minimum: { width: 200, height: 120 },
      onCommit: next => { commits.push(next); setSize(next); },
    });
    return <div ref={box} data-box style={{ width: `${resize.dimensions().width}px`, height: `${resize.dimensions().height}px` }}>
      <FloatingWindowResizeHandle controller={resize} label="Resize test window" />
    </div>;
  }, host);
  cleanup.push(dispose);
  const element = host.querySelector<HTMLElement>("[data-box]")!, handle = host.querySelector<HTMLElement>(".floating-window-resize-handle")!;
  element.getBoundingClientRect = () => ({ x: 20, y: 30, left: 20, top: 30, right: 320, bottom: 230, width: 300, height: 200, toJSON: () => ({}) });
  handle.setPointerCapture = vi.fn();
  const pointer = (type: string, x: number, y: number) => handle.dispatchEvent(new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  return { element, handle, commits, pointer };
}

describe("shared floating-window resize", () => {
  it("previews locally, commits once, ignores a click and cancels without a commit", () => {
    const { element, commits, pointer } = mount();
    pointer("pointerdown", 300, 200); pointer("pointerup", 300, 200);
    expect(commits).toEqual([]);

    pointer("pointerdown", 300, 200); pointer("pointermove", 340, 220);
    expect(element.style.width).toBe("340px"); expect(element.style.height).toBe("220px");
    pointer("pointerup", 340, 220); pointer("lostpointercapture", 340, 220);
    expect(commits).toEqual([{ width: 340, height: 220 }]);

    pointer("pointerdown", 300, 200); pointer("pointermove", 200, 100); pointer("pointercancel", 200, 100);
    expect(element.style.width).toBe("340px"); expect(element.style.height).toBe("220px");
    expect(commits).toHaveLength(1);
  });

  it("groups keyboard changes and supports fine adjustment and cancellation", () => {
    vi.useFakeTimers();
    const { element, handle, commits } = mount();
    const key = (key: string, shiftKey = false) => handle.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
    key("ArrowRight"); key("ArrowDown", true);
    expect(element.style.width).toBe("310px"); expect(element.style.height).toBe("201px");
    vi.advanceTimersByTime(300);
    expect(commits).toEqual([{ width: 310, height: 201 }]);

    key("ArrowLeft"); key("Escape"); vi.advanceTimersByTime(300);
    expect(element.style.width).toBe("310px"); expect(commits).toHaveLength(1);
  });
});
