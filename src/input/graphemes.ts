/** Cell coordinates count Unicode code points, not UTF-16 code units. Count
 * each segment once; counting every prefix makes paragraph deletion quadratic.
 */
export function graphemeBoundaries(text: string): number[] {
  const boundaries = [0];
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let end = 0;
    for (const { segment } of segmenter.segment(text)) {
      end += [...segment].length;
      boundaries.push(end);
    }
  } else {
    const length = [...text].length;
    for (let index = 1; index <= length; index++) boundaries.push(index);
  }
  return boundaries;
}
