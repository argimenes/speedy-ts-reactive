// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { DocumentStyleBar } from './document-style-bar';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(f => f()); vi.restoreAllMocks(); document.body.replaceChildren(); });
const tick = () => new Promise(resolve => setTimeout(resolve, 40));
function setup(direct: boolean, annotationEvents = true) {
  const rectangles = vi.fn(() => [{ left: 0, top: 0, width: 80, height: 20, x: 0, y: 0, right: 80, bottom: 20 }]);
  const descriptor = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: rectangles });
  cleanups.push(() => { if (descriptor) Object.defineProperty(Range.prototype, 'getClientRects', descriptor); else Reflect.deleteProperty(Range.prototype, 'getClientRects'); });
  const editor = new ReactiveEditor({ id: 'doc', type: 'document-block', children: [
    { id: 'a', type: 'standoff-editor-block', text: 'First sentence. Second sentence!', standoffProperties: [{ id: 'p', type: 'test', start: 0, end: 8 }] },
    { id: 'b', type: 'standoff-editor-block', text: 'Another paragraph.' },
  ] }, { features: { directDomCharacterCells: direct, annotationRangeEvents: annotationEvents } });
  editor.visualEffects.registerType({ type: 'test', renderers: [{ id: 'line', name: 'svg-underline' }, { id: 'class', name: 'css-class', params: { classes: ['persisted'] } }] });
  registerCoreViews(editor);
  const projection = editor.createView('caret-test'), key = projection.node(projection.state.rootKey)!.children[0];
  const host = document.body.appendChild(document.createElement('div'));
  const dispose = render(() => <><DocumentStyleBar editor={editor} scopeKey={projection.state.rootKey} /><ReactiveTreeView editor={editor} projection={projection} /></>, host);
  const gateway = editor.installGateway(document);
  cleanups.push(() => { gateway(); dispose(); editor.dispose(); });
  const mount = editor.mounts.get(key)!, flow = mount.focusElement!;
  const caret = (index: number) => { flow.focus(); mount.restoreInlineSelection?.({ anchor: index, head: index }); };
  return { editor, projection, key, host, flow, mount, caret, rectangles, dispose };
}
it.each([true, false])('composes focus with persisted/temporary renderers without writes, geometry reads or cell replacement (direct=%s)', async direct => {
  const f = setup(direct);
  const temporary = f.editor.temporaryRanges.createCollection('search-proof');
  temporary.replace([{ id: 'match', range: f.editor.textRanges.snapshot(f.key, 0, 5), type: 'test' }]);
  await tick();
  const snapshot = vi.spyOn(f.editor.repository, 'snapshot'), changes = vi.fn();
  cleanups.push(f.editor.repository.subscribeChanges(changes));
  const paths = [...f.host.querySelectorAll('path')], cells = [...f.flow.childNodes];
  f.rectangles.mockClear();
  f.editor.caretModes.select('sentence-focus'); f.caret(3); await tick();
  expect(f.flow.dataset.caretFocus).toBeTruthy();
  for (let i = 4; i < 12; i++) f.caret(i);
  await tick();
  expect(f.rectangles).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled(); expect(changes).not.toHaveBeenCalled();
  expect([...f.flow.childNodes]).toEqual(cells); expect([...f.host.querySelectorAll('path')]).toEqual(paths);
  expect((cells[0] as HTMLElement).classList.contains('persisted')).toBe(true);
  f.editor.caretModes.select('normal');
  expect(f.flow.dataset.caretScope).toBeUndefined();
  expect([...f.host.querySelectorAll('path')]).toEqual(paths); expect(changes).not.toHaveBeenCalled();
  temporary.dispose();
});
it('shares the native caret feed even with annotation events disabled; preserves input, undo, selection and IME', async () => {
  const f = setup(true, false); await tick();
  f.editor.caretModes.select('sentence-focus'); f.caret(16); await tick();
  expect(f.flow.dataset.caretFocus).toBeTruthy();
  const before = f.mount.captureText!();
  f.flow.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'X' }));
  await tick(); expect(f.mount.captureText!()).toBe(before.slice(0, 16) + 'X' + before.slice(16));
  f.editor.repository.undo(); await tick(); expect(f.mount.captureText!()).toBe(before);
  f.caret(2); await tick(); const style = document.querySelector('style[data-caret-effect]')!, rule = style.textContent;
  f.flow.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  f.caret(20); await tick(); expect(style.textContent).toBe(rule);
  f.flow.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); await tick();
  expect(style.textContent).not.toBe(rule);
  f.mount.restoreInlineSelection?.({ anchor: 0, head: 4 }); await tick();
  expect(f.flow.dataset.caretScope).toBeUndefined(); expect(f.mount.captureInlineSelection?.()).toEqual({ anchor: 0, head: 4 });
  f.caret(2); await tick();
  const selector = f.host.querySelector<HTMLSelectElement>('[aria-label="Caret Mode"]')!;
  selector.focus(); selector.value = 'block-focus'; selector.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  expect(f.editor.caretModes.active()).toBe('block-focus'); expect(document.activeElement).toBe(f.flow);
  expect(f.mount.captureInlineSelection?.()).toEqual({ anchor: 2, head: 2 });
  f.dispose(); await tick();
  expect(document.querySelector('[data-caret-scope]')).toBeNull();
});
