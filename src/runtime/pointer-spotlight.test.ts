// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { PointerSpotlight } from './pointer-spotlight';
import { VisualEffectRegistry } from './visual-effect-registry';
import { registerPointerSpotlight } from '../rendering/pointer-spotlight';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(f => f()); vi.restoreAllMocks(); document.body.replaceChildren(); });
function fixture(available = true) {
  const frames = new Map<number, FrameRequestCallback>(); let next = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++next, callback); return next; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(f => f(0)); };
  const registry = new VisualEffectRegistry(), unregister = registerPointerSpotlight(registry);
  const [caret, setCaret] = createSignal('normal'), [scale, setScale] = createSignal(1);
  const mode = new PointerSpotlight(registry, available, () => setCaret('normal'), caret);
  cleanups.push(() => { mode.dispose(); registry.dispose(); });
  const scroller = document.body.appendChild(document.createElement('div')); scroller.style.overflowX = scroller.style.overflowY = 'auto';
  const host = scroller.appendChild(document.createElement('div')), text = host.appendChild(document.createElement('span'));
  text.textContent = 'Reading';
  const scrollerRect = vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(80, 150, 420, 250));
  for (const [key, value] of Object.entries({ offsetWidth: 420, clientWidth: 400, clientHeight: 230, clientLeft: 2, clientTop: 2 })) Object.defineProperty(scroller, key, { configurable: true, value });
  const hostRect = vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 200, 600, 1500));
  const release = mode.mount(host, scale);
  const move = (x = 180, y = 250, target: HTMLElement = text, pointerType = 'mouse') => {
    const event = new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(event, 'pointerType', { value: pointerType }); target.dispatchEvent(event);
  };
  const overlay = () => host.querySelector<HTMLDivElement>('.pointer-spotlight')!;
  return { mode, host, text, scroller, frames, flush, move, overlay, hostRect, scrollerRect, setCaret, caret, setScale, release, unregister, registry };
}
it('is inert until enabled and coalesces pointer bursts without rereading layout or touching text', () => {
  const f = fixture(), original = f.text;
  f.move(); f.flush(); expect(f.overlay()).toBeNull(); expect(f.hostRect).not.toHaveBeenCalled();
  f.mode.toggle(); expect(f.overlay().hidden).toBe(true);
  f.move(); f.flush();
  expect(f.overlay().hidden).toBe(false);
  expect(f.overlay().style.backgroundImage).toContain('at 80px 50px');
  expect(f.overlay().style.width).toBe('382px'); expect(f.overlay().style.height).toBe('182px');
  f.hostRect.mockClear(); f.scrollerRect.mockClear();
  const style = vi.spyOn(f.overlay().style, 'setProperty');
  for (let i = 0; i < 100; i++) f.move(180 + i, 250);
  expect(f.frames.size).toBe(1); f.flush();
  expect(style).toHaveBeenCalledTimes(1); expect(f.hostRect).not.toHaveBeenCalled(); expect(f.scrollerRect).not.toHaveBeenCalled();
  expect(f.host.firstChild).toBe(original); expect(original.textContent).toBe('Reading');
  style.mockClear(); f.move(279, 250); f.flush(); expect(style).not.toHaveBeenCalled();
});
it('reuses viewport coordinates on scrolling, refreshes clipping and supports existing uniform scale', () => {
  const f = fixture(); f.mode.toggle(); f.move(); f.flush();
  f.hostRect.mockReturnValue(new DOMRect(100, 100, 600, 1500));
  f.scroller.dispatchEvent(new Event('scroll')); f.flush();
  expect(f.overlay().style.top).toBe('52px'); expect(f.overlay().style.height).toBe('230px');
  // Spotlight stays at the same viewport y=250 after content scrolls upwards.
  expect(f.overlay().style.backgroundImage).toContain('at 80px 98px');
  f.setScale(2); f.flush();
  expect(f.overlay().style.backgroundImage).toContain('90px 42.5px at 40px 49px');
  f.move(490, 250); f.flush(); expect(f.overlay().hidden).toBe(true); // native scrollbar gutter
});
it('hides on leaving, controls, touch, cancel and window blur; removes resources on disable/unmount/disposal', () => {
  const f = fixture(); f.mode.toggle(); f.move(); f.flush();
  const button = f.host.appendChild(document.createElement('button'));
  f.move(180, 250, button); expect(f.overlay().hidden).toBe(true);
  for (const event of ['pointerleave', 'pointercancel']) {
    f.move(); f.flush(); f.host.dispatchEvent(new Event(event)); expect(f.overlay().hidden).toBe(true);
  }
  f.move(); f.flush(); window.dispatchEvent(new Event('blur')); expect(f.overlay().hidden).toBe(true);
  f.move(180, 250, f.text, 'touch'); f.flush(); expect(f.overlay().hidden).toBe(true);
  f.move(); expect(f.frames.size).toBe(1); f.mode.toggle(); expect(f.frames.size).toBe(0);
  expect(f.overlay()).toBeNull(); expect(f.host.hasAttribute('data-pointer-spotlight-host')).toBe(false);
  f.mode.toggle(); f.move(); f.release(); f.flush(); expect(f.overlay()).toBeNull();
  f.mode.dispose(); f.mode.toggle(); expect(f.mode.active()).toBe(false);
});
it('keeps caret modes mutually exclusive and honours the feature flag and renderer lifetime', () => {
  const f = fixture(); f.setCaret('reading-spotlight'); f.mode.toggle(); expect(f.caret()).toBe('normal');
  f.move(); f.flush(); f.setCaret('sentence-focus'); expect(f.mode.active()).toBe(false); expect(f.overlay()).toBeNull();
  expect(() => f.registry.registerType({ type: 'wrong', renderers: [{ id: 'a', name: 'pointer-spotlight' }] })).toThrow();
  f.mode.toggle(); f.unregister(); expect(f.overlay()).toBeNull(); expect(f.mode.active()).toBe(false);
  f.mode.toggle(); expect(f.mode.active()).toBe(false);
  const disabled = fixture(false); disabled.mode.toggle(); disabled.move(); disabled.flush(); expect(disabled.overlay()).toBeNull();
});
