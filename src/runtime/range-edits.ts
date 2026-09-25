import type { NodeKey } from "../block-tree/types";
import { mergeTextRanges, type TextRanges, type TextRangeSnapshot } from "./text-ranges";
export interface RangeEditPorts {
  ranges: Pick<TextRanges, "validate">;
  order(key: NodeKey): ReadonlyMap<NodeKey, number>;
  transaction(label: string, apply: () => void): void;
  remove(key: NodeKey, start: number, end: number): void;
}
/** Validated canonical edits; operation policy and focus remain with the caller. */
export function deleteTextRanges(ports: RangeEditPorts, ranges: readonly TextRangeSnapshot[], label: string): { nodeKey: NodeKey; index: number } {
  if (!ranges.length) throw new Error("Select a non-empty text range first.");
  ports.ranges.validate(ranges, "cell");
  const merged = mergeTextRanges(ranges), order = ports.order(ranges[0].nodeKey);
  merged.sort((a, b) => (order.get(a.nodeKey) ?? 0) - (order.get(b.nodeKey) ?? 0) || a.start - b.start);
  const first = merged[0];
  ports.transaction(label, () => {
    for (const range of [...merged].reverse()) ports.remove(range.nodeKey, range.start, range.end);
  });
  return { nodeKey: first.nodeKey, index: first.start };
}
