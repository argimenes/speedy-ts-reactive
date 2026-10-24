import { describe, expect, it, vi } from 'vitest';
import { uriAtCaret } from './uri-at-caret';

describe('URI at the editor caret', () => {
  it.each([
    ['See https://example.org/a.pdf now', 'example', 'https://example.org/a.pdf'],
    ['🙂 See (https://example.org/a.pdf).', 'example', 'https://example.org/a.pdf'],
    ['[paper](https://example.org/a_(b).pdf), next', 'example', 'https://example.org/a_(b).pdf'],
    ['https://one.org/a https://two.org/b', 'two', 'https://two.org/b'],
    ['<https://example.org/a?q=x&y=2#page=3>', 'example', 'https://example.org/a?q=x&y=2#page=3'],
  ])('finds the touching URI in %s', (text, at, source) => {
    const cells = [...text], caret = [...text.slice(0, text.indexOf(at))].length + 2;
    const result = uriAtCaret(caret, cells.length, i => cells[i]);
    expect(result?.source).toBe(source);
    expect(cells.slice(result!.start, result!.end).join('')).toBe(source);
  });
  it.each(['plain words', 'javascript:alert(1)', 'https://', 'prefixhttps://example.org'])('ignores non-URIs: %s', text => {
    const cells = [...text]; expect(uriAtCaret(cells.length, cells.length, i => cells[i])).toBeUndefined();
  });
  it('accepts URI endpoints, but not surrounding punctuation or another word', () => {
    const text = '(https://example.org). words', cells = [...text];
    for (const at of [1, 20]) expect(uriAtCaret(at, cells.length, i => cells[i])?.source).toBe('https://example.org');
    for (const at of [0, 21, cells.length]) expect(uriAtCaret(at, cells.length, i => cells[i])).toBeUndefined();
  });
  it('reads only the touching token even in a long TextBlock', () => {
    const prefix = 'unrelated '.repeat(1000), url = 'https://example.org/a.pdf';
    const cells = [...prefix + url + ' unrelated'.repeat(1000)], read = vi.fn((i: number) => cells[i]);
    expect(uriAtCaret(prefix.length + 10, cells.length, read)?.source).toBe(url);
    expect(read.mock.calls.length).toBeLessThan(url.length * 3);
    expect(read.mock.calls.every(([i]) => i >= prefix.length - 1 && i <= prefix.length + url.length)).toBe(true);
  });
});
