/** Segment only the touched TextBlock, once per gesture/revision. All offsets
 * are code-point Cell positions, including combining marks and emoji. */
export function wordSelection(text: string) {
  const words: { start: number; end: number }[] = [];
  let offset = 0;
  for (const part of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)) {
    const start = offset; offset += [...part.segment].length;
    if (!/^\s+$/u.test(part.segment)) words.push({ start, end: offset });
  }
  return (index: number) => {
    let lo = 0, hi = words.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (words[mid].end <= index) lo = mid + 1; else hi = mid; }
    return words[Math.min(lo, words.length - 1)] ?? { start: 0, end: offset };
  };
}
