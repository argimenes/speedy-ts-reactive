// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { CaretModes } from './caret-modes';
import { sentenceFocusProvider } from './focus-region';
import { VisualEffectRegistry } from './visual-effect-registry';
import { registerFocusFade } from '../rendering/focus-fade';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(f => f()); vi.restoreAllMocks(); document.body.replaceChildren(); });
function setup(enabled = true) {
  const frames = new Map<number, FrameRequestCallback>(); let next = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++next, callback); return next; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(f => f(0)); };
  const registry = new VisualEffectRegistry(), release = registerFocusFade(registry);
  let revision = 0, text = 'First sentence. Second sentence!';
  const cells = vi.fn(() => [...text]), context = vi.fn((nodeKey: string, caret: number) => ({ nodeKey, caret, revision, cells }));
  const modes = new CaretModes(registry, context, enabled);
  cleanups.push(() => { modes.dispose(); registry.dispose(); });
  const scope = document.body.appendChild(document.createElement('section'));
  const mount = (key: string, visible = true, parent: Element = scope) => {
    const flow = parent.appendChild(document.createElement('div'));
    [...text].forEach((letter, i) => { const cell = document.createElement('span'); cell.dataset.inlineIndex = String(i); cell.textContent = letter; flow.append(cell); });
    const handle = modes.mount(key, flow, parent); handle.visible(visible);
    return { flow, ...handle };
  };
  return { modes, registry, release, flush, frames, cells, context, mount, scope, edit(value: string) { text = value; revision++; modes.invalidate(); } };
}
it('segments only the active Block revision and maps UTF-16 offsets to cell coordinates', () => {
  const provider = sentenceFocusProvider().create(), cells = vi.fn(() => [...'😀 Hello. “Goodbye!” Next.']);
  const context = { nodeKey: 'a', revision: 1, caret: 0, cells };
  expect(provider.identify(context)).toEqual({ kind: 'text', nodeKey: 'a', start: 0, end: 9 });
  expect(provider.identify({ ...context, caret: 9 })).toEqual({ kind: 'text', nodeKey: 'a', start: 9, end: 20 });
  expect(provider.identify({ ...context, caret: 24 })).toEqual({ kind: 'text', nodeKey: 'a', start: 20, end: 25 });
  expect(cells).toHaveBeenCalledTimes(1);
  provider.identify({ ...context, revision: 2 }); expect(cells).toHaveBeenCalledTimes(2);
  provider.identify({ ...context, nodeKey: 'b', revision: 2 }); expect(cells).toHaveBeenCalledTimes(3);
});
it('keeps Normal inert; Block Focus does no text/geometry reads or offscreen mutations', () => {
  const f = setup(), a = f.mount('a'), b = f.mount('b');
  const offscreen = Array.from({ length: 1000 }, (_, i) => f.mount(`off-${i}`, false));
  f.modes.setCaret('a', 1); f.flush(); expect(f.context).not.toHaveBeenCalled();
  const geometry = vi.spyOn(Element.prototype, 'getBoundingClientRect');
  f.modes.select('block-focus'); f.flush();
  expect(a.flow.dataset.caretFocus).toBeTruthy(); expect(b.flow.dataset.caretScope).toBeTruthy();
  const mutations = vi.spyOn(Element.prototype, 'setAttribute'); f.context.mockClear();
  for (let i = 2; i < 102; i++) f.modes.setCaret('a', i);
  f.flush();
  expect(f.context).not.toHaveBeenCalled(); expect(mutations).not.toHaveBeenCalled();
  f.modes.setCaret('b', 2); f.flush();
  expect(mutations).toHaveBeenCalledTimes(1); expect(f.cells).not.toHaveBeenCalled(); expect(geometry).not.toHaveBeenCalled();
  expect(offscreen.every(s => !s.flow.dataset.caretScope)).toBe(true);
  f.modes.select('normal');
  expect(document.querySelector('style[data-caret-effect]')).toBeNull();
  expect(a.flow.dataset.caretScope).toBeUndefined(); expect(b.flow.dataset.caretFocus).toBeUndefined();
});
it('coalesces sentence work, skips unchanged paint and freezes effects during IME', () => {
  const f = setup(), a = f.mount('a'); const children = [...a.flow.childNodes];
  f.modes.select('sentence-focus'); f.modes.setCaret('a', 1); f.flush();
  const style = document.querySelector('style[data-caret-effect]')!, firstRule = style.textContent;
  expect(firstRule).toContain('nth-child(-n+16)'); expect(f.cells).toHaveBeenCalledTimes(1);
  for (let i = 2; i < 12; i++) f.modes.setCaret('a', i);
  expect(f.frames.size).toBe(1); f.flush();
  expect(f.cells).toHaveBeenCalledTimes(1); expect(style.textContent).toBe(firstRule);
  f.modes.setComposing(true); f.modes.setCaret('a', 20); f.edit('New sentence. Updated sentence!'); f.flush();
  expect(style.textContent).toBe(firstRule); expect(f.cells).toHaveBeenCalledTimes(1);
  f.modes.setComposing(false); f.flush(); expect(f.cells).toHaveBeenCalledTimes(2);
  expect(style.textContent).not.toBe(firstRule); expect([...a.flow.childNodes]).toEqual(children);
});
it('scopes effects to the focused Document, follows visibility, and releases on blur/unmount', () => {
  const f = setup(), a = f.mount('a'), b = f.mount('b', false);
  const otherScope = document.body.appendChild(document.createElement('section')), other = f.mount('other', true, otherScope);
  f.modes.select('block-focus'); f.modes.setCaret('a', 1); f.flush();
  expect(other.flow.dataset.caretScope).toBeUndefined();
  b.visible(true); expect(b.flow.dataset.caretScope).toBeTruthy();
  b.visible(false); expect(b.flow.dataset.caretScope).toBeUndefined();
  f.modes.setCaret('other', 1); f.flush();
  expect(a.flow.dataset.caretScope).toBeUndefined(); expect(other.flow.dataset.caretScope).toBeTruthy();
  f.modes.setCaret(); f.flush(); expect(other.flow.dataset.caretScope).toBeUndefined();
  f.modes.setCaret('a', 1); f.flush(); a.dispose();
  expect(a.flow.dataset.caretFocus).toBeUndefined(); expect(a.flow.dataset.caretScope).toBeUndefined();
  f.flush(); expect(document.querySelector('style[data-caret-effect]')?.textContent).toBe('');
});
it('validates contributions and cleans up on mode/provider/renderer removal, disable and disposal', () => {
  const f = setup(), a = f.mount('a');
  const definition = { id: 'custom', label: 'Custom', focusProvider: 'current-block', effect: 'fade-outside-focus', params: { opacity: .4 } };
  const remove = f.modes.registerMode(definition); definition.params.opacity = .9;
  expect(() => f.modes.registerMode(definition)).toThrow();
  expect(() => f.modes.registerMode({ ...definition, id: 'bad', params: { opacity: NaN } })).toThrow();
  expect(() => f.modes.registerMode({ ...definition, id: 'bad', params: { blur: 2 } })).toThrow();
  f.modes.select('custom'); f.modes.setCaret('a', 0); f.flush();
  expect(document.querySelector('style[data-caret-effect]')?.textContent).toContain('opacity: 0.4');
  remove(); expect(f.modes.active()).toBe('normal'); expect(a.flow.dataset.caretScope).toBeUndefined();
  f.modes.select('sentence-focus'); f.flush(); f.release();
  expect(document.querySelector('style[data-caret-effect]')).toBeNull(); expect(f.modes.active()).toBe('normal');
  registerFocusFade(f.registry); f.modes.select('block-focus'); f.flush(); f.modes.setEnabled(false);
  expect(a.flow.dataset.caretScope).toBeUndefined(); expect(f.modes.active()).toBe('normal');
  f.modes.setEnabled(true); f.modes.select('block-focus'); f.flush(); f.modes.dispose(); f.modes.setCaret('a', 0); f.flush();
  expect(document.querySelector('style[data-caret-effect]')).toBeNull();
});
it('does not activate when the feature is disabled', () => {
  const f = setup(false); f.mount('a'); f.modes.select('sentence-focus'); f.modes.setCaret('a', 0); f.flush();
  expect(f.modes.active()).toBe('normal'); expect(f.cells).not.toHaveBeenCalled(); expect(document.querySelector('style[data-caret-effect]')).toBeNull();
});
it('owns contributed provider resources and drops them when that provider is removed', () => {
  const f = setup(); f.mount('a'); const dispose = vi.fn();
  const release = f.modes.registerProvider({ name: 'application-block', kind: 'block', create: () => ({ identify: c => ({ kind: 'block', nodeKey: c.nodeKey }), dispose }) });
  f.modes.registerMode({ id: 'application-mode', label: 'Application Mode', focusProvider: 'application-block', effect: 'fade-outside-focus' });
  f.modes.select('application-mode'); f.modes.setCaret('a', 0); f.flush(); release();
  expect(dispose).toHaveBeenCalledTimes(1); expect(f.modes.active()).toBe('normal');
  expect(document.querySelector('style[data-caret-effect]')).toBeNull();
});
