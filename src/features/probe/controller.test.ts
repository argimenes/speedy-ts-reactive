// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProbeController, type ProbeController } from './controller';
import { probeTargets } from './targets';

vi.mock('./renderer', () => ({
  createProbeRenderer: vi.fn((fail: () => void) => {
    const canvas = document.body.appendChild(document.createElement('canvas'));
    return { canvas, fail, draw: vi.fn((...args: unknown[]) => { canvas.hidden = !args[7]; }),
      setSize: vi.fn(), dispose: vi.fn(() => canvas.remove()) };
  }),
}));
const controllers: ProbeController[] = [];
let hit: Element | null, frames: Map<number, FrameRequestCallback>, media: Map<string, MediaQueryList>;
beforeEach(() => {
  hit = null; frames = new Map(); media = new Map(); let next = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('matchMedia', (query: string) => {
    if (!media.has(query)) media.set(query, Object.assign(new EventTarget(), { matches: false }) as MediaQueryList);
    return media.get(query);
  });
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit });
});
afterEach(() => {
  controllers.splice(0).forEach(c => c.dispose()); document.body.replaceChildren();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});
function flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(100)); }
function setup(parent: HTMLElement = document.body) {
  const root = parent.appendChild(document.createElement('section'));
  const controller = createProbeController(root, () => undefined, vi.fn()); controllers.push(controller);
  return { root, controller };
}
function move(target: Element, x = 40, type = 'mouse') {
  hit = target;
  const event = new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: 50 });
  Object.defineProperty(event, 'pointerType', { value: type }); target.dispatchEvent(event); flush();
}
const space = (target: Element, repeat = false) => {
  const e = new KeyboardEvent('keydown', { key: ' ', repeat, bubbles: true, cancelable: true }); target.dispatchEvent(e); return e;
};

describe('presentation-independent Probe', () => {
  it('owns any host, coalesces input and releases the cursor outside it', () => {
    const { root, controller } = setup(); move(root);
    expect(controller.state.visibility).toBe('visible'); expect(controller.renderer!.canvas.hidden).toBe(false); expect(root.dataset.probeCursor).toBe('hidden');
    expect(controller.renderer!.draw).toHaveBeenLastCalledWith(expect.anything(), 40, 50, .12, 'none', 0, expect.anything(), true);
    expect(frames.size).toBe(0);
    move(document.body); expect(controller.state.visibility).toBe('outside'); expect(root.dataset.probeCursor).toBeUndefined();
  });
  it('lets the innermost host own nested presentations, even after layout changes', () => {
    const outer = setup(), inner = setup(outer.root); move(inner.root);
    expect(inner.controller.state.visibility).toBe('visible'); expect(outer.controller.state.visibility).toBe('outside');
    window.dispatchEvent(new Event('resize')); flush();
    expect(outer.root.dataset.probeCursor).toBeUndefined();
    const event = new WheelEvent('wheel', { altKey: true, deltaY: 50, bubbles: true, cancelable: true }); inner.root.dispatchEvent(event);
    expect(inner.controller.targetRotation).toBeCloseTo(.52); expect(outer.controller.targetRotation).toBe(.12);
    inner.controller.setEnabled(false); move(inner.root, 41);
    expect(outer.root.dataset.probeCursor).toBeUndefined(); expect(inner.root.dataset.probeCursor).toBeUndefined();
    move(outer.root, 42); expect(outer.controller.state.visibility).toBe('visible');
  });
  it('preserves text input and control activation, hides on composition, restores on movement', () => {
    const { root, controller } = setup(); const input = root.appendChild(document.createElement('textarea'));
    move(input); expect(space(input).defaultPrevented).toBe(false); flush();
    expect(controller.state.visibility).toBe('suppressed-while-typing'); expect(controller.renderer!.canvas.hidden).toBe(true);
    move(input, 41); expect(controller.state.visibility).toBe('visible');
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); flush();
    expect(controller.state.visibility).toBe('suppressed-while-typing');
    const button = root.appendChild(document.createElement('button')); move(button, 42);
    expect(space(button).defaultPrevented).toBe(false); expect(controller.targetRotation).toBe(.12);
    move(root, 43); expect(space(root).defaultPrevented).toBe(true); space(root, true);
    expect(controller.targetRotation).toBeCloseTo(.12 + Math.PI);
  });
  it('reserves only Alt-wheel and supports target sensing without Flint', () => {
    const { root, controller } = setup();
    const unregister = probeTargets(root).register({ id: 'node', kind: 'graph-node', bounds: () => ({ left: 30, right: 60, top: 30, bottom: 60 }) });
    move(root); expect(controller.state.proximity).toBe('graph-node');
    for (const modifiers of [{}, { altKey: true, ctrlKey: true }, { altKey: true, metaKey: true }]) {
      const e = new WheelEvent('wheel', { ...modifiers, deltaY: 100, bubbles: true, cancelable: true }); root.dispatchEvent(e); expect(e.defaultPrevented).toBe(false);
    }
    const bubble = vi.fn(); root.addEventListener('wheel', bubble);
    const e = new WheelEvent('wheel', { altKey: true, deltaY: 100, bubbles: true, cancelable: true }); root.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true); expect(bubble).not.toHaveBeenCalled(); expect(controller.targetRotation).toBeCloseTo(.92);
    unregister(); flush(); expect(controller.state.proximity).toBe('none');
  });
  it('retains size on disable, restores native cursor for touch/forced colours, and honours reduced motion', () => {
    const { root, controller } = setup(); move(root); controller.setSize(100);
    expect(controller.renderer!.setSize).toHaveBeenCalledWith(100);
    controller.setEnabled(false); expect(root.dataset.probeCursor).toBeUndefined(); expect(controller.renderer).toBeUndefined();
    controller.setEnabled(true); flush(); expect(controller.size).toBe(100);
    move(root, 41, 'touch'); expect(controller.state.visibility).toBe('outside');
    move(root, 42);
    const reduced = media.get('(prefers-reduced-motion: reduce)')!; Object.assign(reduced, { matches: true });
    space(root); flush(); expect(controller.rotation).toBe(controller.targetRotation); expect(frames.size).toBe(0);
    const forced = media.get('(forced-colors: active)')!; Object.assign(forced, { matches: true }); forced.dispatchEvent(new Event('change')); flush();
    expect(controller.state.visibility).toBe('disabled'); expect(controller.renderer).toBeUndefined(); expect(root.dataset.probeCursor).toBeUndefined();
    Object.assign(forced, { matches: false }); forced.dispatchEvent(new Event('change')); flush(); expect(controller.state.visibility).toBe('visible');
  });
  it('restores the native cursor on renderer failure and disposes all pending work', () => {
    const { root, controller } = setup(); move(root);
    (controller.renderer as unknown as { fail(): void }).fail(); expect(controller.state.visibility).toBe('disabled'); expect(root.dataset.probeCursor).toBeUndefined();
    controller.setEnabled(true); flush(); const renderer = controller.renderer!;
    space(root); expect(frames.size).toBe(1); controller.dispose();
    expect(frames.size).toBe(0); expect(renderer.dispose).toHaveBeenCalledOnce(); expect(root.hasAttribute('data-probe-root')).toBe(false);
    move(root, 42); expect(frames.size).toBe(0); expect(document.querySelector('canvas')).toBeNull();
  });
});
