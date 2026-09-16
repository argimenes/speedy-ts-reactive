import type { BlockNode, NodeKey } from "../block-tree/types";
import type { BlockTreeProjection } from "../block-tree/projection";
import { markerNodeKey, normalisePositionMarkers, type DocumentPositionMarker } from "./document-position-markers";
import type { SearchScope } from "./text-search";

export interface ConcertinaRequest {
  owner: string;
  viewId: string;
  scope: SearchScope;
  markers: Iterable<DocumentPositionMarker>;
  activeMarkerOrGroup?: string;
}

export interface ConcertinaDerivation {
  markers: readonly DocumentPositionMarker[];
  scopedKeys: ReadonlySet<NodeKey>;
  protectedKeys: ReadonlySet<NodeKey>;
  hiddenBranchRoots: ReadonlySet<NodeKey>;
  matching: ReadonlyMap<NodeKey, readonly DocumentPositionMarker[]>;
  diagnostics: readonly string[];
}

const sideRegion = /^(left-margin|right-margin|sticky-tab)/;
const safeHide = /^(standoff-editor|text|plain-text|code-mirror|container|text-container|list|indented-list|table-row|grid-row|tab-panel|document-tab-panel|image|iframe|youtube)-block$/;
const shell = /^(document|page|fixed-size-page|document-window|window|workspace|universe|table|tab-row|document-tab-row|sticky-tab-row|surface)-block$/;

function descendants(node: BlockNode, scope: SearchScope): NodeKey[] {
  return [...node.children, ...Object.values(node.ownedRelations).filter(() => scope.region !== "main")];
}

/** Pure structural reduction: no mounts, DOM measurements, or repository writes. */
export function deriveConcertinaPresentation(request: ConcertinaRequest, projection: BlockTreeProjection): ConcertinaDerivation {
  const diagnostics: string[] = [], scoped = new Set<NodeKey>(), parents = new Map<NodeKey, NodeKey>();
  const matching = new Map<NodeKey, DocumentPositionMarker[]>(), protectedKeys = new Set<NodeKey>(), hiddenBranchRoots = new Set<NodeKey>();
  if (request.viewId !== projection.viewId || request.scope.viewId !== projection.viewId || !projection.state.nodes[request.scope.rootKey]) {
    return { markers: [], scopedKeys: scoped, protectedKeys, hiddenBranchRoots, matching, diagnostics: ["Concertina scope is unavailable in this view."] };
  }
  const visit = (key: NodeKey, seen: Set<NodeKey>) => {
    if (seen.has(key)) return;
    const node = projection.state.nodes[key]; if (!node) return;
    scoped.add(key);
    const next = new Set(seen).add(key);
    for (const child of descendants(node, request.scope)) { parents.set(child, key); visit(child, next); }
  };
  visit(request.scope.rootKey, new Set());
  const valid: DocumentPositionMarker[] = [];
  for (const marker of normalisePositionMarkers(request.markers)) {
    const key = markerNodeKey(marker), node = projection.state.nodes[key];
    if (!node || !scoped.has(key)) { diagnostics.push(`Ignored out-of-scope marker ${marker.id}.`); continue; }
    if (marker.anchor.kind === "text-range" && (marker.anchor.range.contentKey !== node.contentKey || marker.anchor.range.placementKey !== node.placementKey)) {
      diagnostics.push(`Ignored stale marker ${marker.id}.`); continue;
    }
    valid.push(marker);
    const group = matching.get(key) ?? []; group.push(marker); matching.set(key, group);
    for (let cursor: NodeKey | undefined = key; cursor; cursor = parents.get(cursor)) protectedKeys.add(cursor);
  }
  if (!valid.length) return { markers: [], scopedKeys: scoped, protectedKeys, hiddenBranchRoots, matching, diagnostics };
  const hide = (key: NodeKey, seen: Set<NodeKey>) => {
    if (seen.has(key)) return;
    const node = projection.state.nodes[key]; if (!node) return;
    if (!protectedKeys.has(key) && key !== request.scope.rootKey && safeHide.test(node.viewType) && !shell.test(node.viewType)) {
      hiddenBranchRoots.add(key); return;
    }
    const next = new Set(seen).add(key);
    for (const child of descendants(node, request.scope)) hide(child, next);
  };
  hide(request.scope.rootKey, new Set());
  return { markers: Object.freeze(valid), scopedKeys: scoped, protectedKeys, hiddenBranchRoots, matching, diagnostics };
}
