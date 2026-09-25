import type { ContentKey, NodeKey, PlacementKey } from "../block-tree/types";

/** Versioned half-open coordinates. Visibility/decoration is not edit authority. */
export interface TextRangeSnapshot {
  nodeKey: NodeKey; contentKey: ContentKey; placementKey: PlacementKey;
  version: number; start: number; end: number; coordinate: "cell" | "utf16";
}
export interface TextRangeSource {
  nodeKey: NodeKey; contentKey: ContentKey; placementKey: PlacementKey;
  version: number; length: number; coordinate: TextRangeSnapshot["coordinate"];
}
export const exactTextRangeKey = (range: Pick<TextRangeSnapshot, "contentKey" | "start" | "end">) => `${range.contentKey}:${range.start}:${range.end}`;

export class TextRanges {
  constructor(private readonly source: (key: NodeKey) => TextRangeSource | undefined) {}
  snapshot(nodeKey: NodeKey, start: number, end: number): TextRangeSnapshot {
    const source = this.source(nodeKey);
    if (!source) throw new Error("The text range target is unavailable.");
    const range = { nodeKey, contentKey: source.contentKey, placementKey: source.placementKey, version: source.version, coordinate: source.coordinate, start, end };
    this.validate([range]); return range;
  }
  validate(ranges: readonly TextRangeSnapshot[], coordinate?: TextRangeSnapshot["coordinate"]): void {
    for (const range of ranges) {
      const source = this.source(range.nodeKey);
      if (!source || source.contentKey !== range.contentKey || source.placementKey !== range.placementKey || source.version !== range.version ||
        source.coordinate !== range.coordinate || (coordinate && coordinate !== range.coordinate) ||
        !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end <= range.start || range.end > source.length) {
        throw new Error("A text range is stale or invalid. Select the ranges again.");
      }
    }
  }
}

/** Merge overlaps once per shared content; callers choose document/caret order. */
export function mergeTextRanges(ranges: readonly TextRangeSnapshot[]): TextRangeSnapshot[] {
  const groups = new Map<ContentKey, TextRangeSnapshot[]>();
  for (const range of ranges) { const list = groups.get(range.contentKey) ?? []; list.push({ ...range }); groups.set(range.contentKey, list); }
  return [...groups.values()].flatMap(list => {
    const merged: TextRangeSnapshot[] = [];
    for (const range of list.sort((a, b) => a.start - b.start)) {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push(range);
    }
    return merged;
  });
}
