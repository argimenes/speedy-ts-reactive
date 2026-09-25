import type { NodeKey } from "../block-tree/types";
import type { SearchMatch, SearchRange, SearchScope } from "./text-search";

/** A source-neutral occurrence anchor. Ratio-only minimap positions are intentionally excluded. */
export type DocumentPositionAnchor =
  | { kind: "text-range"; range: SearchRange }
  | { kind: "block"; nodeKey: NodeKey };

export interface DocumentPositionMarker {
  id: string;
  group?: string;
  anchor: DocumentPositionAnchor;
  label?: string;
}

export function searchMatchesToPositionMarkers(matches: Iterable<Pick<SearchMatch, "id" | "ranges" | "context">>): DocumentPositionMarker[] {
  return [...matches].flatMap(match => match.ranges.map((range, index) => ({
    id: `${match.id}:${index}`,
    group: match.id,
    anchor: { kind: "text-range" as const, range },
    label: match.context,
  })));
}

export function rangesToPositionMarkers(groupId: string, ranges: Iterable<SearchRange>): DocumentPositionMarker[] {
  return [...ranges].map((range, index) => ({
    id: `${groupId}:${index}`,
    group: groupId,
    anchor: { kind: "text-range" as const, range },
  }));
}

export function blockKeysToPositionMarkers(keys: Iterable<NodeKey>): DocumentPositionMarker[] {
  return [...keys].map((nodeKey, index) => ({ id: `block:${index}:${nodeKey}`, anchor: { kind: "block" as const, nodeKey } }));
}

export function markerNodeKey(marker: DocumentPositionMarker): NodeKey {
  return marker.anchor.kind === "block" ? marker.anchor.nodeKey : marker.anchor.range.nodeKey;
}

export function normalisePositionMarkers(markers: Iterable<DocumentPositionMarker>): readonly DocumentPositionMarker[] {
  const seen = new Set<string>(), result: DocumentPositionMarker[] = [];
  for (const marker of markers) {
    if (!marker?.id || seen.has(marker.id) || !marker.anchor) continue;
    const anchor = marker.anchor;
    if (anchor.kind === "text-range") {
      const range = anchor.range;
      if (!range?.nodeKey || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end <= range.start) continue;
      result.push(Object.freeze({ ...marker, anchor: Object.freeze({ kind: "text-range" as const, range: Object.freeze({ ...range }) }) }));
    } else if (anchor.kind === "block" && anchor.nodeKey) {
      result.push(Object.freeze({ ...marker, anchor: Object.freeze({ kind: "block" as const, nodeKey: anchor.nodeKey }) }));
    } else continue;
    seen.add(marker.id);
  }
  return Object.freeze(result);
}

/** Caller supplies a set of occurrence keys belonging to the chosen scope/view. */
export function filterPositionMarkersToScope(markers: Iterable<DocumentPositionMarker>, scope: SearchScope, scopedKeys: ReadonlySet<NodeKey>): readonly DocumentPositionMarker[] {
  if (!scopedKeys.has(scope.rootKey)) return Object.freeze([]);
  return Object.freeze([...markers].filter(marker => scopedKeys.has(markerNodeKey(marker))));
}
