import type {ContentRecord,RepositoryOperation,RepositoryState} from './types';
const same = (a: unknown,b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const parentStructure = ({children,wireChildren,revision,...rest}:ContentRecord) => rest;
/** Document tabs are leaf views; the target Document remains in the object bank. */
export function isDocumentTabLeaf(c: ContentRecord | undefined): c is ContentRecord {
 const target=(c?.payload.metadata as any)?.documentTarget;
 return !!c && c.viewType==='tab-block' && c.definitionOwnerKey===undefined && !c.children.length && !c.inlineContent.length && !Object.keys(c.ownedRelations).length && target?.version===1 && typeof target.documentId==='string' && !!target.documentId.trim();
}
/** Recognise a single fresh leaf tab insertion and its exact Undo inverse. */
export function documentTabParentFor(
  state: RepositoryState,
  operations: RepositoryOperation[],
  references: Pick<ReadonlyMap<string, number>, "get">,
): string | undefined {
  if (operations.length !== 3) return;
  const edges = operations.filter(op => op.kind === "put-placement" || op.kind === "remove-placement");
  if (edges.length !== 1) return;
  const edge = edges[0];
  const inserting = edge.kind === "put-placement";
  const placement = edge.kind === "put-placement" ? edge.record : edge.kind === "remove-placement" ? state.placements[edge.key] : undefined;
  if (!placement || placement.key === state.rootPlacementKey || placement.kind !== "owned" || placement.externalReference || placement.resolvedReference || placement.resourceRegistration) return;
  if (inserting ? !!state.placements[placement.key] : references.get(placement.contentKey) !== 1) return;
  const put = operations.filter(op => op.kind === "put-content").map(op => op.record);
  if (put.length !== (inserting ? 2 : 1) || new Set(put.map(c => c.key)).size !== put.length) return;
  const child = inserting ? put.find(c => c.key === placement.contentKey) : state.contents[placement.contentKey];
  if (!isDocumentTabLeaf(child)) return;
  if (inserting ? !!state.contents[child.key] : !operations.some(op => op.kind === "remove-content" && op.key === child.key)) return;
  const parent = put.find(c => c.key !== child.key);
  const previous = parent && state.contents[parent.key];
  if (!parent || !previous || parent.viewType !== "tab-row-block" || parent.definitionOwnerKey !== undefined || !same(parentStructure(previous), parentStructure(parent))) return;
  const expanded = inserting ? parent.children : previous.children;
  const compact = inserting ? previous.children : parent.children;
  if (expanded.filter(key => key === placement.key).length !== 1 ||
    !same(expanded.filter(key => key !== placement.key), compact)) return;
  return parent.key;
}
