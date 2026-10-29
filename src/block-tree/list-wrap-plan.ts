import { inlineOwnerFor } from './inline-plan';
import type { ContentRecord, Location, RepositoryOperation, RepositoryState } from './types';

export interface ListWrapChange {
  parent: string;
  child: string;
  item: string;
  wrapper: string;
  wrapperContent: string;
  wrapped: boolean;
  inlineChanged: boolean;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const parentStructure = ({ children, wireChildren, revision, ...rest }: ContentRecord) => rest;

/** Prove this exact wrap (or its undo) locally. One fresh list replaces one
 * existing child edge, whose placement and owned subtree are unchanged. Any
 * prefix edit must independently pass the native leaf-Cell validator. */
export function listWrapChangeFor(
  state: RepositoryState,
  operations: RepositoryOperation[],
  references: Pick<ReadonlyMap<string, number>, 'get'>,
  locationOf: (key: string) => Location | undefined,
): ListWrapChange | undefined {
  if (operations.length < 3 || operations.some(op => op.kind === 'set-root' || op.kind === 'record-batch')) return;
  const edges = operations.filter(op => op.kind === 'put-placement' ? op.record.kind !== 'inline' :
    op.kind === 'remove-placement' && state.placements[op.key]?.kind !== 'inline');
  if (edges.length !== 1) return;
  const edge = edges[0], wrapped = edge.kind === 'put-placement';
  const wrapper = edge.kind === 'put-placement' ? edge.record : edge.kind === 'remove-placement' ? state.placements[edge.key] : undefined;
  if (!wrapper || wrapper.kind !== 'owned' || wrapper.externalReference || wrapper.resolvedReference || wrapper.resourceRegistration || wrapper.key === state.rootPlacementKey) return;
  if (wrapped ? !!state.placements[wrapper.key] : references.get(wrapper.contentKey) !== 1) return;
  const wrapperOps = operations.filter(op => op.kind === 'put-content' ? op.record.key === wrapper.contentKey : op.kind === 'remove-content' && op.key === wrapper.contentKey);
  if (wrapperOps.length !== 1) return;
  const wrapperOp = wrapperOps[0];
  if (wrapped ? wrapperOp.kind !== 'put-content' || !!state.contents[wrapper.contentKey] : wrapperOp.kind !== 'remove-content') return;
  const list = wrapperOp.kind === 'put-content' ? wrapperOp.record : state.contents[wrapper.contentKey];
  if (!list || list.viewType !== 'indented-list-block' || list.inlineKind || list.inlineContent.length || list.children.length !== 1 ||
    Object.keys(list.ownedRelations).length || Object.keys(list.opaqueRelations).length ||
    Object.keys(list.payload).some(key => key !== 'id' && key !== 'type' && key !== 'metadata') ||
    list.payload.type !== 'indented-list-block' || !same(list.payload.metadata, { htmlList: { ordered: false } })) return;
  const item = list.children[0], placement = state.placements[item], child = placement && state.contents[placement.contentKey];
  if (!child || child.viewType !== 'standoff-editor-block' || child.inlineKind !== 'standoff') return;
  const parents = operations.filter(op => op.kind === 'put-content' && op.record.key !== child.key && op.record.key !== list.key && !!state.contents[op.record.key]);
  if (parents.length !== 1 || parents[0].kind !== 'put-content') return;
  const parentOp = parents[0], parent = parentOp.record, previous = state.contents[parent.key];
  if (!same(parentStructure(previous), parentStructure(parent)) || parent.children.length !== previous.children.length) return;
  const beforeKey = wrapped ? item : wrapper.key, afterKey = wrapped ? wrapper.key : item;
  const index = previous.children.indexOf(beforeKey);
  if (index < 0 || previous.children.lastIndexOf(beforeKey) !== index || parent.children[index] !== afterKey ||
    !previous.children.every((key, i) => i === index || parent.children[i] === key)) return;
  const location = locationOf(beforeKey), itemLocation = locationOf(item);
  if (location?.ownerContentKey !== parent.key || location.slot.kind !== 'children' ||
    itemLocation?.ownerContentKey !== (wrapped ? parent.key : list.key) || itemLocation.slot.kind !== 'children') return;
  if (list.definitionOwnerKey !== parent.definitionOwnerKey ||
    list.definitionOwnerKey && state.contents[list.definitionOwnerKey]?.viewType !== 'document-block') return;
  const inline = operations.filter(op => op !== edge && op !== wrapperOp && op !== parentOp);
  if (inline.length && (inline.some(op => op.kind === 'put-content' && state.contents[op.record.key] && op.record.key !== child.key) ||
    inlineOwnerFor(state, inline, references) !== child.key)) return;
  return { parent: parent.key, child: child.key, item, wrapper: wrapper.key, wrapperContent: list.key, wrapped, inlineChanged: !!inline.length };
}
