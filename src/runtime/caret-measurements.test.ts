// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { MeasurementService } from './measurements';
import { MountRegistry } from './mounts';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); document.getSelection()?.removeAllRanges(); });
it('caches one collapsed native Range per frame and rejects stale/uncollapsed/unfocused selection', () => {
  const mounts = new MountRegistry(), measurements = new MeasurementService(mounts);
  const flow = document.body.appendChild(document.createElement('div')); flow.tabIndex = 0;
  const span = flow.appendChild(document.createElement('span')); span.textContent = 'abc'; flow.focus();
  const release = mounts.register('a', { root: flow, focusElement: flow, inputPolicy: 'standoff', focus: () => flow.focus() });
  const range = document.createRange(); range.setStart(span.firstChild!, 1); range.collapse(true);
  document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
  const rects = vi.fn(() => [new DOMRect(25, 40, 0, 18)]);
  Object.defineProperty(range, 'getClientRects', { value: rects });
  const box = measurements.caretRect('a', 1, 1);
  expect(box).toMatchObject({ x: 25, y: 40, height: 18 });
  expect(measurements.caretRect('a', 1, 1)).toBe(box); expect(rects).toHaveBeenCalledTimes(1);
  measurements.caretRect('a', 1, 2); expect(rects).toHaveBeenCalledTimes(2);
  measurements.releaseCaret(); measurements.caretRect('a', 1, 2); expect(rects).toHaveBeenCalledTimes(3);
  range.setEnd(span.firstChild!, 2); expect(measurements.caretRect('a', 1, 3)).toBeUndefined();
  range.collapse(true); flow.blur(); expect(measurements.caretRect('a', 1, 3)).toBeUndefined();
  release(); expect(measurements.caretRect('a', 1, 3)).toBeUndefined();
});

it('resolves an element boundary using only its adjacent cell, including empty Blocks', () => {
  const mounts = new MountRegistry(), measurements = new MeasurementService(mounts);
  const flow = document.body.appendChild(document.createElement('div')); flow.tabIndex = 0;
  const first = flow.appendChild(document.createElement('span')), second = flow.appendChild(document.createElement('span'));
  first.textContent = 'a'; second.textContent = '😀'; flow.focus();
  mounts.register('a', { root: flow, focusElement: flow, inputPolicy: 'standoff', focus: () => flow.focus(), inlineBoundary: index => ({ node: flow, offset: index }) });
  const range = document.createRange(); range.setStart(flow, 1); range.collapse(true); document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
  const descriptor = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  const reads = vi.fn(function (this: Range) { return this.startContainer.nodeType === Node.TEXT_NODE ? [new DOMRect(50, 60, 0, 20)] : []; });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: reads });
  try {
    const cellRead = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    expect(measurements.caretRect('a', 1, 1)).toMatchObject({ x: 50, y: 60 });
    expect(reads).toHaveBeenCalledTimes(2); expect(cellRead).not.toHaveBeenCalled();
    mounts.get('a')!.inlineBoundary = () => ({ node: second.firstChild!, offset: 0 });
    expect(measurements.caretRect('a', 1, 2)).toMatchObject({ x: 50, y: 60 });
    expect(cellRead).not.toHaveBeenCalled();
    mounts.get('a')!.inlineBoundary = index => ({ node: flow, offset: index });
    flow.replaceChildren(); range.setStart(flow, 0); range.collapse(true);
    vi.spyOn(flow, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 100, 22));
    expect(measurements.caretRect('a', 0, 3)).toMatchObject({ x: 10, y: 20, width: 0, height: 22 });
  } finally { if (descriptor) Object.defineProperty(Range.prototype, 'getClientRects', descriptor); else Reflect.deleteProperty(Range.prototype, 'getClientRects'); }
});
