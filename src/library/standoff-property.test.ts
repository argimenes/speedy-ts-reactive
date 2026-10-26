// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { StandoffProperty } from './standoff-property';

describe('legacy standoff serialization', () => {
  it.each([
    ['-dino\r', 1, 4, 'dino'],
    ['-dino\r', 1, 1, 'd'],
    ['😀-dino\r', 2, 5, 'dino'],
    ['-😀o\r', 1, 2, '😀o'],
  ])('serializes inclusive Cells in %s', (text, start, end, expected) => {
    const cells = [...text].map((text, index) => ({ text, index, next: undefined as unknown }));
    cells.forEach((cell, index) => { cell.next = cells[index + 1]; });
    const getText = vi.fn(() => text);
    const property = Object.assign(Object.create(StandoffProperty.prototype), {
      id: 'reference', type: 'codex/entity-reference', start: cells[start], end: cells[end],
      block: { getText }, value: 'entity', metadata: {}, isDeleted: false,
    }) as StandoffProperty;
    expect(property.serialize()).toMatchObject({ start, end, text: expected, value: 'entity' });
    expect(getText).not.toHaveBeenCalled();
  });
});
