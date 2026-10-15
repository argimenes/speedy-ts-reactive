import { clone } from '../block-tree/clone';
import { linkedDefinitionOwner, linkedRegistry } from '../block-tree/linked-annotations';
import type { JsonObject, RepositoryState } from '../block-tree/types';
import { clipProperties } from './ranges';
import { emptyFragment, LIMITS, validateFragment, type FragmentBlock, type InterchangeScope, type MutableFragment, type Reference } from './fragment';

export interface Slice { placementKey: string; start?: number; end?: number; gap?: boolean }
const omit = (data: JsonObject, keys: string[]) => Object.fromEntries(Object.entries(clone(data)).filter(([key, v]) => !keys.includes(key) && v !== undefined));

/** Selected authored data only. Inline Cells are compact runs, never repository keys. */
export function serializeSelection(state: RepositoryState, slices: Slice[], scope: InterchangeScope = {}): MutableFragment {
  const f = emptyFragment(); f.provenance = { producer: 'Mutable', ...scope };
  let serial = 0; const id = () => `f${++serial}`;
  const contentIds = new Map<string, string>(), placementIds = new Map<string, string>(), blockIds = new Map<string, string>(), definitionIds = new Map<string, string>();
  const pending: Array<{ reference: Reference; sourceId: string }> = [];
  const external = (object: 'entity' | 'block', value: string): Reference => {
    const ref: Reference = { kind: 'external', object, id: value, source: { ...scope } };
    if (object === 'block') pending.push({ reference: ref, sourceId: value });
    return ref;
  };
  const target = (p: JsonObject): Reference | undefined => typeof p.value === 'string'
    ? p.type === 'codex/entity-reference' ? external('entity', p.value)
      : p.type === 'codex/block-reference' ? external('block', p.value)
        : p.type === 'reference/url' ? { kind: 'url', url: p.value } : undefined : undefined;
  const property = (p: JsonObject, contentKey: string) => {
    let reference = target(p);
    if (typeof p.annotationId === 'string') {
      const owner = linkedDefinitionOwner(state, p, contentKey);
      const definition = owner && linkedRegistry(state, owner.key)[p.annotationId];
      if (definition) {
        const key = `${owner.key}:${p.annotationId}`;
        if (!definitionIds.has(key)) {
          const localId = id(); definitionIds.set(key, localId);
          const ref = target(definition);
          f.definitions.push({ localId, type: String(definition.type), attributes: omit(definition, ['id', 'type', ...(ref ? ['value'] : [])]), ...(ref ? { target: ref } : {}) });
        }
        reference = { kind: 'local', object: 'definition', id: definitionIds.get(key)! };
      }
    }
    return { localId: id(), type: String(p.type ?? 'unknown'), attributes: omit(p, ['id', 'type', 'start', 'end', 'isZeroWidth', 'affinity', ...(reference ? ['value', 'annotationId'] : [])]), ...(reference ? { target: reference } : {}) };
  };
  const visit = (placementKey: string, slice?: Slice): string => {
    if (!slice && placementIds.has(placementKey)) return placementIds.get(placementKey)!;
    const p = state.placements[placementKey]; if (!p) throw Error('The selected Block no longer exists.');
    const edge = id(); if (!slice) placementIds.set(placementKey, edge);
    if (p.externalReference) {
      const source = p.externalReference.source;
      f.placements.push({ localId: edge, kind: 'reference', target: { kind: 'external', object: 'block', id: p.externalReference.targetId, source: { ...(scope.cavernId ? { cavernId: scope.cavernId } : {}), ...(source.scope !== 'unknown' ? { resourceId: source.resourceId } : {}) } } });
      return edge;
    }
    const c = state.contents[p.contentKey]; if (!c) throw Error('Missing selected content.');
    const localId = !slice && contentIds.get(c.key) || id();
    f.placements.push({ localId: edge, kind: p.kind === 'reference' ? 'reference' : 'owned', target: { kind: 'local', object: 'block', id: localId } });
    if (!slice && contentIds.has(c.key)) return edge;
    if (!slice) contentIds.set(c.key, localId);
    if (typeof c.payload.id === 'string') {
      const previous = blockIds.get(c.payload.id);
      // Disjoint text slices intentionally have distinct output identities.
      if (previous && previous !== localId && !slice) throw Error('Ambiguous source Block identity.');
      if (!previous) blockIds.set(c.payload.id, localId);
    }
    const b: FragmentBlock = { localId, type: c.viewType, data: omit(c.payload, ['id', 'type', 'text', 'standoffProperties', 'blockProperties', 'linkedAnnotations']), blockProperties: [], children: [], relations: {} };
    if (Object.keys(c.opaqueRelations).length) b.data.opaqueRelations = clone(c.opaqueRelations);
    if (c.viewType === 'plain-text-block') b.data.text = String(c.payload.text ?? '');
    f.blocks.push(b);
    const anchor = (b.data.metadata as any)?.anchor;
    if (anchor && typeof anchor.blockId === 'string') {
      f.links.push({ localId: id(), type: 'anchor', from: { object: 'block', id: localId }, to: external('block', anchor.blockId), attributes: { offset: clone(anchor.offset ?? { x: 0, y: 0 }) } });
      delete (b.data.metadata as any).anchor;
    }
    for (const p of (Array.isArray(c.payload.blockProperties) ? c.payload.blockProperties : [])) b.blockProperties.push(property(p, c.key));
    if (c.inlineKind === 'standoff') {
      const start = slice?.start ?? 0, end = slice?.end ?? c.inlineContent.length;
      if (start < 0 || end < start || end > c.inlineContent.length) throw Error('Stale text selection.');
      b.inline = { atoms: [], properties: [] };
      for (const key of c.inlineContent.slice(start, end)) {
        const cell = state.contents[state.placements[key].contentKey];
        if (cell.viewType === 'text-cell') {
          const text = String(cell.payload.text ?? ''), last = b.inline.atoms.at(-1);
          if (last?.kind === 'text') last.text += text; else b.inline.atoms.push({ kind: 'text', text });
        } else {
          const embed = id(); b.inline.atoms.push({ kind: 'embed', embed });
          // Retain source descriptors inertly. Phase 1 does not fetch foreign URLs.
          const asset = id();
          f.assets.push({ localId: asset, source: scope.cavernId && typeof cell.payload.assetId === 'string'
            ? { kind: 'managed', cavernId: scope.cavernId, assetId: cell.payload.assetId }
            : { kind: 'unresolved', description: String(cell.payload.alt ?? 'Inline object') } });
          f.embeds.push({ localId: embed, type: cell.viewType, data: omit(cell.payload, ['id']), asset: { kind: 'local', object: 'asset', id: asset } });
        }
      }
      for (const p of (Array.isArray(c.payload.standoffProperties) ? c.payload.standoffProperties : [])) {
        if (!p || !Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < 0 ||
          (p.isZeroWidth === true ? p.start !== p.end || p.end > c.inlineContent.length : p.end < p.start || p.end >= c.inlineContent.length)) {
          throw Error('A selected Block contains an invalid annotation range; nothing was copied or cut.');
        }
      }
      for (const p of clipProperties(c.payload.standoffProperties, start, end, c.inlineContent.length, -start, !slice)) {
        b.inline.properties.push({ ...property(p, c.key), startIndex: Number(p.start), endIndex: Number(p.end) + (p.isZeroWidth === true ? 0 : 1), isZeroWidth: p.isZeroWidth === true, ...(p.isZeroWidth === true ? { affinity: p.affinity as 'before' | 'after' } : {}) });
      }
    }
    if (!slice) {
      b.children = c.children.map(key => visit(key));
      b.relations = Object.fromEntries(Object.entries(c.ownedRelations).map(([name, key]) => [name, visit(key)]));
    }
    return edge;
  };
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i], partial = s.start !== undefined;
    const c = state.contents[state.placements[s.placementKey]?.contentKey];
    f.roots.push({ placement: visit(s.placementKey, partial ? s : undefined), openStart: partial, openEnd: partial, clippedStart: partial && s.start! > 0, clippedEnd: partial && s.end! < c.inlineContent.length, ...(i < slices.length - 1 ? { separatorAfter: s.gap ? 'selection-gap' as const : 'paragraph' as const } : {}) });
  }
  for (const { reference, sourceId } of pending) if (blockIds.has(sourceId)) Object.assign(reference, { kind: 'local', object: 'block', id: blockIds.get(sourceId) });
  // Validate authored values before JSON encoding can discard or coerce them
  // (for example Maps, non-finite numbers, or nested undefined values).
  return validateFragment(f);
}

export function plainFragment(text: string): MutableFragment {
  const f = emptyFragment();
  if ([...text].length > LIMITS.cells) throw Error('Clipboard text exceeds the inline position limit.');
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > LIMITS.blocks) throw Error('Clipboard text contains too many Blocks.');
  lines.forEach((text, i, lines) => {
    const block = `b${i}`, placement = `e${i}`;
    f.blocks.push({ localId: block, type: 'standoff-editor-block', data: {}, inline: { atoms: [{ kind: 'text', text }], properties: [] }, blockProperties: [], children: [], relations: {} });
    f.placements.push({ localId: placement, kind: 'owned', target: { kind: 'local', object: 'block', id: block } });
    f.roots.push({ placement, openStart: true, openEnd: true, clippedStart: false, clippedEnd: false, ...(i < lines.length - 1 ? { separatorAfter: 'paragraph' as const } : {}) });
  });
  return validateFragment(f);
}

export function fragmentText(f: MutableFragment): string {
  const blocks = new Map(f.blocks.map(b => [b.localId, b])), placements = new Map(f.placements.map(p => [p.localId, p])), embeds = new Map(f.embeds.map(e => [e.localId, e]));
  const visit = (edge: string): string => {
    const p = placements.get(edge)!; if (p.target.kind !== 'local') return '[Unresolved Block]';
    const b = blocks.get(p.target.id)!;
    const text = b.inline?.atoms.map(a => a.kind === 'text' ? a.text : String(embeds.get(a.embed)?.data.alt ?? '\uFFFC')).join('') ?? String(b.data.text ?? '');
    return [text, ...b.children.map(visit)].filter((v, i) => v || i > 0).join('\n');
  };
  return f.roots.map(r => visit(r.placement)).join('\n');
}
