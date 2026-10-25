import { afterEach, expect, it, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { render } from 'solid-js/web';
import { ANNOTATION_BAR_KEY, annotationBarSpacious, createAnnotationBarPreference, resolveAnnotationBar } from './annotation-bar-policy';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const context = { fullscreen: false, maximized: false, spacious: true };
it('resolves Auto by presentation and only hides for an explicit Hidden choice', () => {
  expect(resolveAnnotationBar('auto', context)).toBe('compact');
  expect(resolveAnnotationBar('auto', { ...context, fullscreen: true, spacious: false })).toBe('expanded');
  expect(resolveAnnotationBar('auto', { ...context, maximized: true })).toBe('expanded');
  expect(resolveAnnotationBar('auto', { ...context, maximized: true, spacious: false })).toBe('compact');
  for (const policy of ['expanded', 'compact', 'hidden'] as const) {
    expect(resolveAnnotationBar(policy, context)).toBe(policy);
  }
});
it('uses hysteresis, not a single flickering resize threshold', () => {
  let spacious = false;
  for (const width of [940, 959, 950]) { spacious = annotationBarSpacious(width, spacious); expect(spacious).toBe(false); }
  spacious = annotationBarSpacious(960, spacious); expect(spacious).toBe(true);
  for (const width of [959, 930, 880]) { spacious = annotationBarSpacious(width, spacious); expect(spacious).toBe(true); }
  expect(annotationBarSpacious(879, spacious)).toBe(false);
});
it('shares and reloads only policy, validates storage, and works when storage is unavailable', () => {
  localStorage.setItem(ANNOTATION_BAR_KEY, 'invalid');
  createRoot(dispose => {
    cleanup.push(dispose);
    const a = createAnnotationBarPreference(), b = createAnnotationBarPreference();
    expect(a.policy()).toBe('auto'); a.set('hidden'); expect(b.policy()).toBe('hidden');
    expect(localStorage.getItem(ANNOTATION_BAR_KEY)).toBe('hidden');
    expect(createAnnotationBarPreference().policy()).toBe('hidden');
    localStorage.setItem(ANNOTATION_BAR_KEY, 'expanded'); window.dispatchEvent(new StorageEvent('storage', { key: ANNOTATION_BAR_KEY }));
    expect(b.policy()).toBe('expanded');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
    a.set('compact'); expect(b.policy()).toBe('compact');
  });
});
function fixture(flint = false, readingDensity = false) {
  const editor = new ReactiveEditor({ type: 'document-window-block', children: [{ type: 'document-block', children: [{ id: 'text', type: 'standoff-editor-block', text: 'one two three' }] }] });
  registerCoreViews(editor); const view = editor.createView('annotation-bar-proof');
  const host = document.body.appendChild(document.createElement('div'));
  if (flint) host.className = 'flint-application';
  if (readingDensity) host.dataset.density = 'reading';
  cleanup.push(() => editor.dispose()); cleanup.push(render(() => <ReactiveTreeView editor={editor} projection={view} />, host)); editor.installGateway(document);
  const node = Object.values(view.state.nodes).find(n => n.payload.id === 'text')!, mount = editor.mounts.get(node.key)!;
  const bar = host.querySelector<HTMLElement>('[data-annotation-bar-state]')!;
  const policy = (value: string) => { const picker = bar.querySelector<HTMLSelectElement>('[aria-label="Annotation bar presentation"]')!; picker.value = value; picker.dispatchEvent(new Event('change', { bubbles: true })); };
  return { editor, host, node, mount, bar, policy };
}
it('preserves exact editing DOM and selected range across presentations without snapshots or revisions', () => {
  const f = fixture(); f.mount.focus(); f.mount.restoreInlineSelection!({ anchor: 1, head: 5 }); document.dispatchEvent(new Event('selectionchange'));
  const snapshot = vi.spyOn(f.editor.repository, 'snapshot'), revision = f.editor.repository.state.revision, root = f.mount.root;
  for (const policy of ['expanded', 'hidden', 'compact', 'auto']) f.policy(policy);
  expect(f.editor.mounts.get(f.node.key)!.root).toBe(root);
  expect(f.mount.captureInlineSelection!()).toEqual({ anchor: 1, head: 5 });
  expect(f.editor.repository.state.revision).toBe(revision); expect(snapshot).not.toHaveBeenCalled();
  f.bar.querySelector<HTMLButtonElement>('[data-annotation-type="style/bold"]')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  f.bar.querySelector<HTMLButtonElement>('[data-annotation-type="style/bold"]')!.click();
  expect(f.editor.node(f.node.key)!.payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'style/bold', start: 1, end: 4 })]));
});
it('loads a visible Compact bar with Reading density and keeps visibility independent of density changes', async () => {
  const f = fixture(true, true);
  expect(f.bar.dataset.annotationBarState).toBe('compact'); expect(f.bar.querySelector('.annotation-bar__reveal')).toBeNull();
  expect(f.bar.querySelector('[data-annotation-type="style/bold"]')).not.toBeNull();
  f.policy('expanded'); f.host.dataset.density = 'compact'; await Promise.resolve();
  f.host.dataset.density = 'reading'; await Promise.resolve(); expect(f.bar.dataset.annotationBarState).toBe('expanded');
  f.policy('hidden'); f.bar.querySelector<HTMLButtonElement>('.annotation-bar__reveal')!.click();
  expect(f.bar.dataset.annotationBarState).toBe('compact'); expect(localStorage.getItem(ANNOTATION_BAR_KEY)).toBe('compact');
});
it('coalesces container resize, observes no editing subtree, and cancels pending resize on disposal', async () => {
  vi.useFakeTimers();
  const observers: { callback: ResizeObserverCallback; targets: Element[]; disconnect: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal('ResizeObserver', class {
    targets: Element[] = [];
    disconnect = vi.fn();
    constructor(public callback: ResizeObserverCallback) { observers.push(this); }
    observe(target: Element) { this.targets.push(target); } unobserve() {}
  });
  const mutation = vi.spyOn(MutationObserver.prototype, 'observe');
  const f = fixture(), observer = observers.find(o => o.targets.includes(f.bar))!;
  const resize = (width: number) => observer.callback([{ target: f.bar, contentRect: { width } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
  expect(observer).toBeDefined();
  expect(mutation.mock.calls.filter(([target]) => target === f.bar.parentElement).every(([, options]) => !options?.subtree)).toBe(true);
  f.bar.closest('.reactive-window')!.classList.add('reactive-window--maximized'); await Promise.resolve();
  const revision = f.editor.repository.state.revision, snapshot = vi.spyOn(f.editor.repository, 'snapshot');
  resize(1100); vi.advanceTimersByTime(100); expect(f.bar.dataset.annotationBarState).toBe('compact');
  resize(980); vi.advanceTimersByTime(119); expect(f.bar.dataset.annotationBarState).toBe('compact');
  vi.advanceTimersByTime(1); expect(f.bar.dataset.annotationBarState).toBe('expanded');
  resize(900); resize(0); vi.advanceTimersByTime(120); expect(f.bar.dataset.annotationBarState).toBe('expanded');
  resize(870); vi.advanceTimersByTime(120); expect(f.bar.dataset.annotationBarState).toBe('compact');
  expect(snapshot).not.toHaveBeenCalled(); expect(f.editor.repository.state.revision).toBe(revision);
  resize(1100); cleanup.splice(0).reverse().forEach(fn => fn()); vi.runAllTimers();
  expect(observer.disconnect).toHaveBeenCalledOnce(); expect(f.bar.dataset.annotationBarState).toBe('compact');
});

it('keeps the bar visible across Block/Sentence Focus and Reading Spotlight without writes', () => {
  const f = fixture(true, true), revision = f.editor.repository.state.revision;
  const snapshot = vi.spyOn(f.editor.repository, 'snapshot');
  for (const mode of ['block-focus', 'sentence-focus', 'reading-spotlight', 'normal']) {
    f.editor.caretModes.select(mode);
    expect(f.bar.dataset.annotationBarState).toBe('compact');
    expect(f.bar.querySelector('.annotation-bar__reveal')).toBeNull();
  }
  expect(localStorage.getItem(ANNOTATION_BAR_KEY)).toBeNull();
  expect(snapshot).not.toHaveBeenCalled(); expect(f.editor.repository.state.revision).toBe(revision);
});
it('applies one saved policy across live Documents and newly mounted Documents', () => {
  const a = fixture(), b = fixture();
  a.policy('expanded'); expect(b.bar.dataset.annotationBarState).toBe('expanded');
  b.policy('hidden'); expect(a.bar.dataset.annotationBarState).toBe('hidden');
  const reopened = fixture(); expect(reopened.bar.dataset.annotationBarState).toBe('hidden');
  reopened.policy('auto');
  for (const document of [a, b, reopened]) expect(document.bar.dataset.annotationBarState).toBe('compact');
});

it('defaults Flint to an explicit Compact policy without overwriting saved choices or Ink defaults', () => {
  const flint = fixture(true), ink = fixture();
  expect(flint.bar.dataset.annotationBarPolicy).toBe('compact');
  expect(flint.bar.dataset.annotationBarState).toBe('compact');
  expect(ink.bar.dataset.annotationBarPolicy).toBe('auto');
  expect(localStorage.getItem(ANNOTATION_BAR_KEY)).toBeNull();
  flint.policy('expanded');
  expect(fixture(true).bar.dataset.annotationBarState).toBe('expanded');
  flint.policy('auto');
  expect(fixture(true).bar.dataset.annotationBarPolicy).toBe('auto');
});
