import type { NodeKey } from "../block-tree/types";
import type { MountRegistry } from "./mounts";
import type { CrossBlockSelection } from "./cross-block-selection";
import type { TextRangeSnapshot, TextRanges } from "./text-ranges";

export interface TextSelectionSnapshot {
  ranges: readonly TextRangeSnapshot[];
  head: { nodeKey: NodeKey; index: number };
}

/** Read the existing native/cross selection after core geometry has completed. */
export function captureTextSelection(document: Document, mounts: Pick<MountRegistry, "resolveElement">,
  crossText: Pick<CrossBlockSelection, "range" | "resolve">, ranges: Pick<TextRanges, "snapshot">): TextSelectionSnapshot | undefined {
  const cross = crossText.range();
  const selection = document.getSelection();
  const element = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
  const resolved = mounts.resolveElement(element ?? null);
  const local = resolved?.handle.inputPolicy === "standoff" ? resolved.handle.captureInlineSelection?.() : undefined;
  const segments = cross ? crossText.resolve(cross.anchor, cross.head) :
    resolved && local ? [{ nodeKey: resolved.nodeKey, start: Math.min(local.anchor, local.head), end: Math.max(local.anchor, local.head) }] : [];
  const nonempty = segments.filter(range => range.end > range.start);
  if (!nonempty.length) return;
  return {
    ranges: nonempty.map(range => ranges.snapshot(range.nodeKey, range.start, range.end)),
    head: { nodeKey: cross?.head.occurrenceKey ?? resolved!.nodeKey, index: cross?.head.boundary.index ?? local!.head },
  };
}
