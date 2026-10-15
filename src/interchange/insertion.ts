import { clone } from '../block-tree/clone';
import { planCrossTextEdit, type CrossTextSegment } from '../block-tree/cross-text-edit';
import { createBlockId, createContentKey, createPlacementKey } from '../block-tree/ids';
import { deriveLocations } from '../block-tree/repository';
import { resourceOwner } from '../block-tree/resource-identity';
import { linkedRegistry } from '../block-tree/linked-annotations';
import type { BlockFragment } from '../block-tree/clipboard';
import type { ContentRecord, JsonObject, RepositoryState } from '../block-tree/types';
import type { MutableFragment } from './fragment';
import { clipProperties, mapStandoffPropertiesForReplacement } from './ranges';

export interface InsertionResult { state: RepositoryState; placementKey: string; caret: number }
const annotations = (c: ContentRecord) => c.payload.standoffProperties as JsonObject[] ?? [];
const shifted = (props: JsonObject[], delta: number) => props.map(p => ({ ...clone(p), start: Number(p.start) + delta, end: Number(p.end) + delta }));

/** Identity-bearing roots must survive independently, even for an open slice. */
export function inlineMergePredicate(fragment: BlockFragment, viewType: string) {
  const anchored = new Set(Object.values(fragment.state.contents).map(c => (c.payload.metadata as any)?.anchor?.blockId).filter(Boolean));
  const references = [...Object.values(fragment.linkedAnnotations ?? {})];
  for (const c of Object.values(fragment.state.contents)) references.push(...annotations(c), ...((c.payload.blockProperties as JsonObject[]) ?? []));
  for (const p of references) if (p.type === 'codex/block-reference') anchored.add(p.value);
  const uses = new Map<string, number>();
  for (const p of Object.values(fragment.state.placements)) uses.set(p.contentKey, (uses.get(p.contentKey) ?? 0) + 1);
  return (c: ContentRecord) => c.viewType === viewType && c.inlineKind === 'standoff' && !c.children.length && !Object.keys(c.ownedRelations).length && !Object.keys(c.opaqueRelations).length && !anchored.has(c.payload.id) && !(c.payload.metadata as any)?.anchor && uses.get(c.key) === 1;
}

/** Pure, one-shot structural plan. No command-per-atom loop and no DOM access. */
export function planFragmentInsertion(source: RepositoryState, segments: CrossTextSegment[], fragment: BlockFragment, slices: MutableFragment['roots']): InsertionResult {
  if (!segments.length) throw Error('Select a destination first.');
  const records = segments.map(s => {
    const c = source.contents[source.placements[s.placementKey]?.contentKey];
    if (!c || c.inlineKind !== 'standoff' || !Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < 0 || s.end < s.start || s.end > c.inlineContent.length) throw Error('The clipboard destination is stale.');
    return c;
  });
  const first = records[0], last = records.at(-1)!, start = segments[0].start, end = segments.at(-1)!.end;
  const rootRecords = fragment.roots.map(k => fragment.state.contents[fragment.state.placements[k].contentKey]);
  const canMerge = inlineMergePredicate(fragment, first.viewType);
  const single = segments.length === 1 && rootRecords.length === 1 && slices[0].openStart && slices[0].openEnd && canMerge(rootRecords[0]);
  const base = segments.length > 1 ? planCrossTextEdit(source, segments, '').state : source;
  const state: RepositoryState = { ...base, contents: { ...base.contents, ...clone(fragment.state.contents) }, placements: { ...base.placements, ...clone(fragment.state.placements) } };
  const keep = (c: ContentRecord) => { c.revision++; c.inlineRevision++; state.contents[c.key] = c; };
  const mergeDefinitions = () => {
    if (!Object.keys(fragment.linkedAnnotations ?? {}).length) return;
    const owner = resourceOwner(source, first.key) ?? source.contents[source.placements[source.rootPlacementKey].contentKey];
    const c = clone(state.contents[owner.key]); c.payload.linkedAnnotations = { ...clone(linkedRegistry(source, owner.key)), ...clone(fragment.linkedAnnotations) }; c.revision++; state.contents[c.key] = c;
  };
  if (single) {
    const incoming = rootRecords[0], c = clone(first), origins: (number | null)[] = [];
    c.inlineContent = [...first.inlineContent.slice(0, start), ...incoming.inlineContent, ...first.inlineContent.slice(end)];
    c.payload.standoffProperties = [...mapStandoffPropertiesForReplacement(annotations(first), start, end, incoming.inlineContent.length, origins, first.inlineContent.length), ...shifted(annotations(incoming), start)];
    keep(c); mergeDefinitions();
    return { state, placementKey: segments[0].placementKey, caret: start + incoming.inlineContent.length };
  }
  const location = deriveLocations(source).get(segments[0].placementKey);
  if (!location || location.slot.kind !== 'children') throw Error('Structural paste needs an ordinary paragraph list.');
  if (Object.values(source.placements).filter(p => p.contentKey === first.key).length > 1) throw Error('Detach a shared paragraph before structural paste.');
  const parent = clone(state.contents[location.ownerContentKey]), index = parent.children.indexOf(segments[0].placementKey);
  const left = clone(state.contents[first.key]); left.inlineContent = first.inlineContent.slice(0, start);
  left.payload.standoffProperties = clipProperties(first.payload.standoffProperties, 0, start, first.inlineContent.length, 0);
  // Do not duplicate an affinity-boundary point in an empty surviving side.
  left.payload.standoffProperties = (left.payload.standoffProperties as JsonObject[]).filter(p => p.isZeroWidth !== true || p.start !== start || p.affinity === 'before');
  const suffixCells = last.inlineContent.slice(end);
  const suffixProperties = clipProperties(last.payload.standoffProperties, end, last.inlineContent.length, last.inlineContent.length).filter(p => p.isZeroWidth !== true || p.start !== 0 || p.affinity === 'after');
  const output: string[] = [];
  const incoming = [...fragment.roots];
  if (slices[0].openStart && canMerge(rootRecords[0])) {
    const c = rootRecords[0]; left.inlineContent.push(...c.inlineContent); left.payload.standoffProperties = [...annotations(left), ...shifted(annotations(c), start)]; incoming.shift();
    output.push(segments[0].placementKey); keep(left);
  } else if (left.inlineContent.length || annotations(left).length || left.children.length || Object.keys(left.ownedRelations).length || Object.keys(left.opaqueRelations).length || (left.payload.metadata as any)?.anchor || (left.payload.blockProperties as any[])?.length) {
    output.push(segments[0].placementKey); keep(left);
  }
  output.push(...incoming);
  const tailKey = output.at(-1)!;
  const tail = clone(state.contents[state.placements[tailKey].contentKey]);
  let caret = tail.inlineContent.length, caretKey = tailKey;
  if (slices.at(-1)!.openEnd && canMerge(rootRecords.at(-1)!)) {
    tail.payload.standoffProperties = [...annotations(tail), ...shifted(suffixProperties, tail.inlineContent.length)]; tail.inlineContent.push(...suffixCells); keep(tail);
  } else if (suffixCells.length || suffixProperties.length || tail.inlineKind !== 'standoff') {
    const right = clone(last); right.key = createContentKey(); right.payload.id = createBlockId(); right.children = []; right.ownedRelations = {}; right.opaqueRelations = {}; delete right.definitionOwnerKey;
    if (right.payload.metadata) delete (right.payload.metadata as JsonObject).anchor;
    right.inlineContent = suffixCells; right.payload.standoffProperties = suffixProperties;
    right.payload.blockProperties = ((right.payload.blockProperties as JsonObject[]) ?? []).map(p => ({ ...p, id: crypto.randomUUID() }));
    const key = createPlacementKey(); state.placements[key] = { key, contentKey: right.key, kind: 'owned' }; keep(right); output.push(key);
    caretKey = key; caret = 0;
  }
  const seen = new Set<string>();
  for (const key of output) {
    const c = state.contents[state.placements[key].contentKey];
    for (const p of annotations(c)) if (typeof p.id === 'string') { if (seen.has(p.id)) p.id = crypto.randomUUID(); seen.add(String(p.id)); }
  }
  parent.children.splice(index, 1, ...output); parent.revision++; state.contents[parent.key] = parent;
  mergeDefinitions();
  return { state, placementKey: caretKey, caret };
}
