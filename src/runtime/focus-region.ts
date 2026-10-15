/** Session presentation coordinates, never canonical annotations. Text is half-open
 * in character-cell boundaries (not UTF-16 offsets). nodeKey identifies an occurrence. */
export type FocusRegion =
  | { readonly kind: 'block'; readonly nodeKey: string }
  | { readonly kind: 'text'; readonly nodeKey: string; readonly start: number; readonly end: number }
  | { readonly kind: 'geometry'; readonly rects: readonly DOMRectReadOnly[] };

export interface FocusContext {
  readonly nodeKey: string;
  readonly caret: number;
  readonly revision: number;
  /** Lazy: Block Focus never reads text. One entry per canonical character cell. */
  cells(): readonly string[];
}
export interface FocusProvider {
  readonly name: string;
  readonly kind: FocusRegion['kind'];
  /** Called once per activation; caches belong to this session, not the definition. */
  create(): { identify(context: FocusContext): FocusRegion | undefined; dispose?(): void };
}

export function sentenceFocusProvider(): FocusProvider {
  return { name: 'current-sentence', kind: 'text', create() {
    const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'sentence' }) : undefined;
    let key: string | undefined, revision: number | undefined, ranges: { start: number; end: number }[] = [];
    return { identify(context) {
      if (context.nodeKey !== key || context.revision !== revision) {
        key = context.nodeKey; revision = context.revision;
        const cells = context.cells(), text = cells.join(''), boundaries = [0];
        for (const cell of cells) boundaries.push(boundaries[boundaries.length - 1] + cell.length);
        const cellAt = (offset: number) => {
          let lo = 0, hi = boundaries.length - 1;
          while (lo < hi) { const mid = (lo + hi + 1) >>> 1; if (boundaries[mid] <= offset) lo = mid; else hi = mid - 1; }
          return lo;
        };
        const segments = segmenter ? [...segmenter.segment(text)] : [...text.matchAll(/[^.!?]+(?:[.!?]+["'”’)]*\s*|$)|[.!?]+\s*/gu)].map(m => ({ index: m.index!, segment: m[0] }));
        ranges = segments.map(s => ({ start: cellAt(s.index), end: cellAt(s.index + s.segment.length) }));
        if (!ranges.length) ranges = [{ start: 0, end: cells.length }];
      }
      let lo = 0, hi = ranges.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >>> 1; if (ranges[mid].start <= context.caret) lo = mid; else hi = mid - 1; }
      return { kind: 'text', nodeKey: context.nodeKey, ...ranges[lo] };
    } };
  } };
}
