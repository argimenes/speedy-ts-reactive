export interface TextCounts { words: number; characters: number; withoutWhitespace: number }
export const emptyCounts = (): TextCounts => ({ words: 0, characters: 0, withoutWhitespace: 0 });
export function countText(text: string): TextCounts {
  const counts = emptyCounts();
  const characters = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text) : [...text].map(segment => ({ segment }));
  for (const { segment } of characters) { counts.characters++; if (!/^\s+$/u.test(segment)) counts.withoutWhitespace++; }
  if (typeof Intl.Segmenter === "function") {
    for (const word of new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)) if (word.isWordLike) counts.words++;
  } else counts.words = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  return counts;
}
