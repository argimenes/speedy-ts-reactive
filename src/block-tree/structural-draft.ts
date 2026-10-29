import { clone } from './clone';
import type { ContentRecord, Location, RepositoryOperation, RepositoryState } from './types';

/** A private write set over the current canonical state. It never mutates borrowed
 * records. Only changed records and edge locations are copied. Unsupported tree
 * commands can materialize it once and continue through the general planner. */
export class StructuralDraft {
  readonly state: RepositoryState;
  private contents = new Map<string, ContentRecord | undefined>();
  private placements = new Map<string, RepositoryState['placements'][string] | undefined>();
  private locations = new Map<string, Location | undefined>();
  private references = new Map<string, number>();
  private origins = new Map<string, readonly (number | null)[]>();
  constructor(readonly base: RepositoryState, private baseLocation: (key: string) => Location | undefined,
    private baseReferences: (key: string) => number, private baseOwners: (key: string) => Iterable<string>) {
    this.state = { ...base, contents: Object.create(base.contents), placements: Object.create(base.placements) };
  }
  locationOf(key: string) { return this.locations.has(key) ? this.locations.get(key) : this.baseLocation(key); }
  referenceCount(key: string) { return this.references.get(key) ?? this.baseReferences(key); }
  ownedKeys(key: string): Iterable<string> {
    const keys = new Set(this.baseOwners(key));
    for (const [pk, p] of this.placements) {
      if (p?.contentKey === key && p.kind !== 'reference') keys.add(pk);
      else keys.delete(pk);
    }
    return keys;
  }
  private edges(c: ContentRecord, visit: (key: string, location: Location) => void) {
    c.children.forEach((key, index) => visit(key, { ownerContentKey: c.key, slot: { kind: 'children' }, index }));
    c.inlineContent.forEach((key, index) => visit(key, { ownerContentKey: c.key, slot: { kind: 'inline-content' }, index }));
    for (const [name, key] of Object.entries(c.ownedRelations)) visit(key, { ownerContentKey: c.key, slot: { kind: 'relation', name } });
  }
  apply(operations: RepositoryOperation[]) {
    for (const op of operations) {
      if (op.kind === 'record-batch' || op.kind === 'set-root') throw Error('Unsupported local draft operation');
      const content = op.kind === 'put-content' || op.kind === 'remove-content';
      const key = op.kind === 'put-content' || op.kind === 'put-placement' ? op.record.key : op.key;
      if (content) {
        const previous = this.state.contents[key];
        if (previous) this.edges(previous, (pk) => {
          if (this.locationOf(pk)?.ownerContentKey === key) this.locations.set(pk, undefined);
        });
      }
    }
    for (const op of operations) {
      if (op.kind === 'record-batch' || op.kind === 'set-root') throw Error('Unsupported local draft operation');
      const key = op.kind === 'put-content' || op.kind === 'put-placement' ? op.record.key : op.key;
      if (op.kind === 'put-content' || op.kind === 'remove-content') {
        // Also clear an earlier write to this record within the same batch.
        const previous = this.state.contents[key];
        if (previous) this.edges(previous, pk => { if (this.locationOf(pk)?.ownerContentKey === key) this.locations.set(pk, undefined); });
        const record = op.kind === 'put-content' ? clone(op.record) : undefined;
        if (op.kind === 'put-content' && op.annotationOrigins) {
          const prior = this.origins.get(key);
          this.origins.set(key, op.annotationOrigins.map(i => i === null ? null : this.contents.has(key) ? prior?.[i] ?? null : i));
        } else this.origins.delete(key);
        this.contents.set(key, record); this.state.contents[key] = record!;
        if (record) this.edges(record, (pk, location) => this.locations.set(pk, location));
      } else {
        const old = this.state.placements[key], record = op.kind === 'put-placement' ? clone(op.record) : undefined;
        if (old) this.references.set(old.contentKey, this.referenceCount(old.contentKey) - 1);
        if (record) this.references.set(record.contentKey, this.referenceCount(record.contentKey) + 1);
        this.placements.set(key, record); this.state.placements[key] = record!;
      }
    }
  }
  operations(): RepositoryOperation[] {
    const result: RepositoryOperation[] = [];
    for (const [key, record] of this.contents) {
      if (record) result.push({ kind: 'put-content', record, ...(this.origins.has(key) ? { annotationOrigins: [...this.origins.get(key)!] } : {}) });
      else if (this.base.contents[key]) result.push({ kind: 'remove-content', key });
    }
    for (const [key, record] of this.placements) {
      if (record) result.push({ kind: 'put-placement', record });
      else if (this.base.placements[key]) result.push({ kind: 'remove-placement', key });
    }
    return result;
  }
  materialize(): RepositoryState {
    const result = clone(this.base);
    for (const [key, record] of this.contents) { if (record) result.contents[key] = clone(record); else delete result.contents[key]; }
    for (const [key, record] of this.placements) { if (record) result.placements[key] = clone(record); else delete result.placements[key]; }
    return result;
  }
}
