/** Derived state only. accept() is a PRIVATE native-verifier receipt boundary:
 * callers must have fully verified AND durably published the exact revision.
 * Nothing here can acknowledge, repair or replace an archive revision. */
import { applyExactRecords } from "../apply-records";
import { decodeDurableWire, applyDurableTransitionSized, DURABLE_LIMITS } from "../durable-core";
import { equal } from "../../block-tree/commit-capture";
import type { ContentRecord } from "../../block-tree/types";
import type { ResourceSnapshot, ResourceTransition } from "../stage-c-gates/resource";
import { bytesOf, putValue, buildLookup, updateLookup, REMOVE, requireRead, type BlobWriter, type BlobRef } from "./pages";
import { isCell, edges, type Binding, type Bundle, type Row, type BlockEntry, type Manifest, type Certificate } from "./contracts";

type InlinePage = { keys: string[]; ref: BlobRef };
class InlineOrder {
  pages: InlinePage[] = [];
  constructor(private io: BlobWriter) {}
  async initialize(keys: string[]) { this.pages = await this.pack(keys); }
  private async pack(keys: string[]) {
    const result: InlinePage[] = [];
    for (let at = 0; at < keys.length; at += 512) { const part = keys.slice(at, at + 512); result.push({ keys: part, ref: await putValue(this.io, { keys: part }) }); }
    return result;
  }
  async splice(index: number, removed: number, inserted: string[]) {
    let first = 0, offset = 0;
    while (first < this.pages.length - 1 && offset + this.pages[first].keys.length <= index) offset += this.pages[first++].keys.length;
    if (!this.pages.length) { this.pages = await this.pack(inserted); return; }
    let last = first, end = offset + this.pages[first].keys.length;
    while (last < this.pages.length - 1 && end < index + removed) end += this.pages[++last].keys.length;
    const merged = [...this.pages[first].keys.slice(0, index - offset), ...inserted, ...this.pages[last].keys.slice(this.pages[last].keys.length - (end - index - removed))];
    this.pages.splice(first, last - first + 1, ...await this.pack(merged));
  }
}
type Bucket = { rows: Map<string, Row>; ref?: BlobRef };
const rowId = (row: Row) => `${row[0] === "placement" ? "P" : "C"}:${row[1]}`;
/** Small bundles fit one page; overflow splits by stable record-key hashes.
 * Inserts never shift unrelated record-page boundaries. Hard shard cap stays 1MiB. */
class RecordPages {
  leaves = new Map<string, Bucket>([["", { rows: new Map() }]]);
  keys = new Map<string, string>();
  constructor(private io: BlobWriter) {}
  private async hash(key: string) { return this.io.digest(new TextEncoder().encode(key)); }
  async update(changes: Map<string, Row | null>) {
    const dirty = new Set<string>();
    for (const [key, row] of changes) {
      let prefix = this.keys.get(key);
      if (prefix === undefined) { const hash = await this.hash(key); prefix = [...this.leaves.keys()].find(p => hash.startsWith(p)); requireRead(prefix !== undefined, "missing record bucket"); }
      const bucket = this.leaves.get(prefix!)!; if (row) { bucket.rows.set(key, row); this.keys.set(key, prefix!); } else { bucket.rows.delete(key); this.keys.delete(key); }
      dirty.add(prefix!);
    }
    const publish = async (prefix: string) => {
      const bucket = this.leaves.get(prefix)!, rows = [...bucket.rows].sort(([a], [b]) => a < b ? -1 : 1).map(([, value]) => value);
      if (bytesOf({ rows }).length <= 256 * 1024) { bucket.ref = await putValue(this.io, { rows }); return; }
      requireRead(prefix.length < 64, "record bucket overflow"); this.leaves.delete(prefix);
      for (const char of "0123456789abcdef") this.leaves.set(prefix + char, { rows: new Map() });
      for (const row of rows) { const key = rowId(row), p = (await this.hash(key)).slice(0, prefix.length + 1); this.leaves.get(p)!.rows.set(key, row); this.keys.set(key, p); }
      for (const char of "0123456789abcdef") await publish(prefix + char);
    };
    for (const prefix of dirty) await publish(prefix);
  }
  parts() { return [...this.leaves].sort(([a], [b]) => a < b ? -1 : 1).filter(([, value]) => value.rows.size).map(([, value]) => value.ref!); }
}
type OwnedBundle = { pages: RecordPages; inline?: InlineOrder; ref?: BlobRef; cost: { bytes: number; pages: number }; rowKeys: Set<string>; dependencies: Set<string> };
export interface MaintenanceStats { mode: "baseline" | "incremental" | "structural"; ms: number; updatedRows: number; changedBundles: number; bytesWritten: number; totalBytes: number }
export class DerivedMaintenance {
  private state!: ResourceSnapshot;
  private binding!: Binding;
  private stateBytes = 0;
  private lookup!: BlobRef;
  private bundles = new Map<string, OwnedBundle>();
  private owners = new Map<string, Set<string>>();
  private entries = new Map<string, unknown>();
  private occurrences = new Map<string, BlockEntry>();
  private locationWork = 0;
  private recordMemberships = 0;
  private blobBytes = new Map<string, number>();
  private totalBytes = 0;
  private io: BlobWriter;
  private refsByCell = new Map<string, Set<string>>();
  constructor(storage: BlobWriter) {
    this.io = { ...storage, put: async (hash, bytes) => {
      if (this.blobBytes.has(hash)) return;
      requireRead(this.totalBytes + bytes.length <= 128 * 1024 * 1024, "derived cache storage budget");
      await storage.put(hash, bytes); this.blobBytes.set(hash, bytes.length); this.totalBytes += bytes.length;
    } };
  }
  private associate(row: string, owner: string) { if (!this.owners.has(row)) this.owners.set(row, new Set()); this.owners.get(row)!.add(owner); }
  private async row(content: ContentRecord, bundle: OwnedBundle): Promise<Row> {
    if (content.inlineContent.length > 1024 || bundle.inline) {
      if (!bundle.inline) { bundle.inline = new InlineOrder(this.io); await bundle.inline.initialize(content.inlineContent); }
      return ["inline-content", content.key, { record: { ...content, inlineContent: [] }, parts: bundle.inline.pages.map(p => p.ref), length: content.inlineContent.length }];
    }
    return ["content", content.key, content];
  }
  private async publishBundle(key: string, bundle: OwnedBundle) {
    const parts = bundle.pages.parts(), body: Bundle = { contentKey: key, parts };
    bundle.ref = await putValue(this.io, body);
    const all = [...parts, ...bundle.inline?.pages.map(p => p.ref) ?? [], bundle.ref];
    bundle.cost = { bytes: all.reduce((n, p) => n + p.bytes, 0), pages: all.length };
  }
  private async makeBundle(key: string) {
    const bundle: OwnedBundle = { pages: new RecordPages(this.io), cost: { bytes: 0, pages: 0 }, rowKeys: new Set(), dependencies: new Set() }, rows = new Map<string, Row | null>(), seen = new Set<string>();
    const add = async (c: ContentRecord) => {
      if (seen.has(c.key)) return; seen.add(c.key);
      rows.set(`C:${c.key}`, c.key === key ? await this.row(c, bundle) : ["content", c.key, c]);
      for (const edge of edges(c)) {
        const p = this.state.placements[edge.key]; rows.set(`P:${p.key}`, ["placement", p.key, p]);
        if (p.target.kind === "local" && isCell(this.state.contents[p.target.contentKey])) {
          if (!this.refsByCell.has(p.target.contentKey)) this.refsByCell.set(p.target.contentKey, new Set()); this.refsByCell.get(p.target.contentKey)!.add(p.key);
          await add(this.state.contents[p.target.contentKey]);
        } else if (p.target.kind === "local") bundle.dependencies.add(p.target.contentKey);
      }
    };
    await add(this.state.contents[key]);
    this.recordMemberships += rows.size;
    requireRead(this.recordMemberships <= DURABLE_LIMITS.maxGraphRecords * 2, "derived record membership budget");
    for (const id of rows.keys()) { bundle.rowKeys.add(id); this.associate(id, key); }
    await bundle.pages.update(rows); await this.publishBundle(key, bundle); this.bundles.set(key, bundle);
  }
  private structuralEvidence() {
    this.occurrences.clear(); this.locationWork = 0; let routeUnits = 0;
    for (const c of Object.values(this.state.contents)) if (!isCell(c)) this.occurrences.set(c.key, { contentKey: c.key, occurrences: [] });
    const visit = (key: string, route: string[], seen: Set<string>, parent?: string, slot?: any, index?: number) => {
      requireRead(++this.locationWork <= DURABLE_LIMITS.maxGraphRecords * 2, "structural evidence budget");
      const p = this.state.placements[key]; if (p.target.kind === "external") return;
      const c = this.state.contents[p.target.contentKey], next = [...route, p.placementId];
      routeUnits += next.length; requireRead(routeUnits <= DURABLE_LIMITS.maxGraphRecords * 2, "occurrence route budget");
      this.occurrences.get(c.key)?.occurrences.push({ placement: p, occurrence: { placementKey: key, contentKey: c.key, route: next, ...(parent ? { parentContentKey: parent, slot, index } : {}) } });
      if (seen.has(c.key)) return;
      for (const edge of edges(c)) if (edge.slot.kind !== "inline-content") visit(edge.key, next, new Set(seen).add(c.key), c.key, edge.slot, edge.index);
    };
    visit(this.state.rootPlacementKey, [], new Set());
  }
  private closureCost(key: string) {
    const seen = new Set<string>(), pending = [key]; let bytes = 0, pages = 0, steps = 0;
    while (pending.length) {
      const at = pending.pop()!; if (seen.has(at)) continue; seen.add(at);
      if (++steps > 4096) return { bytes: Infinity, pages: Infinity };
      const bundle = this.bundles.get(at); if (!bundle) continue; bytes += bundle.cost.bytes; pages += bundle.cost.pages;
      // Include non-Cell dependencies reached through Cells as well as direct
      // children/relations; routing must cost everything the reader will load.
      for (const dependency of bundle.dependencies) pending.push(dependency);
    }
    return { bytes, pages };
  }
  private async index(binding: Binding, stateBytes: number, initial: boolean) {
    const entries = new Map<string, unknown>();
    // Only structural metadata is revisited. No unchanged Cell payload encoding.
    for (const [key, block] of this.occurrences) {
      entries.set(`C:${key}`, this.bundles.get(key)!.ref);
      entries.set(`B:${String(this.state.contents[key].payload.id)}`, await putValue(this.io, { ...block, cost: this.closureCost(key) }));
    }
    for (const p of Object.values(this.state.placements)) if (p.kind !== "inline") entries.set(`P:${p.placementId}`, p.key);
    const root = this.state.placements[this.state.rootPlacementKey]; requireRead(root.target.kind === "local", "external root");
    if (root.target.kind !== "local") throw Error("invalid root");
    const registry = this.state.contents[root.target.contentKey].payload.linkedAnnotations;
    if (registry && typeof registry === "object") for (const [key, value] of Object.entries(registry)) entries.set(`A:${key}`, { value });
    if (initial) this.lookup = await buildLookup(this.io, [...entries]);
    else {
      const updates = new Map<string, unknown | typeof REMOVE>();
      for (const [key, value] of entries) if (!equal(value, this.entries.get(key))) updates.set(key, value);
      for (const key of this.entries.keys()) if (!entries.has(key)) updates.set(key, REMOVE);
      this.lookup = await updateLookup(this.io, this.lookup, updates);
    }
    this.entries = entries;
    const manifest: Manifest = { format: "selective-history-spike", version: 1, binding, lookup: this.lookup, locationWork: this.locationWork, stateBytes };
    return { binding, manifest: await putValue(this.io, manifest) } satisfies Certificate;
  }
  async initialize(wire: string | ResourceSnapshot, binding: Binding, stateBytes: number) {
    const started = performance.now(), prior = this.totalBytes;
    requireRead(stateBytes <= DURABLE_LIMITS.supportedStateBytes && stateBytes > 0, "derived baseline bound");
    this.state = typeof wire === "string" ? decodeDurableWire(wire) as ResourceSnapshot : wire;
    requireRead(this.state.resourceId === binding.resourceId && this.state.revision === binding.sequence, "derived baseline identity");
    for (const c of Object.values(this.state.contents)) if (!isCell(c)) await this.makeBundle(c.key);
    this.structuralEvidence();
    this.binding = binding; this.stateBytes = stateBytes;
    const certificate = await this.index(binding, stateBytes, true);
    return { certificate, stats: { mode: "baseline", ms: performance.now() - started, updatedRows: Object.keys(this.state.contents).length + Object.keys(this.state.placements).length, changedBundles: this.bundles.size, bytesWritten: this.totalBytes - prior, totalBytes: this.totalBytes } as MaintenanceStats };
  }
  async accept(wire: string, binding: Binding, stateBytes?: number) {
    const started = performance.now(), prior = this.totalBytes, event = decodeDurableWire(wire) as ResourceTransition;
    requireRead(new TextEncoder().encode(wire).length <= DURABLE_LIMITS.recordBytes && event.resourceId === this.state.resourceId && binding.resourceId === this.state.resourceId && event.beforeRevision === this.state.revision && event.afterRevision === binding.sequence && event.afterRevision === event.beforeRevision + 1 && event.commitId === binding.revisionId && event.root.before === this.state.rootPlacementKey, "derived receipt gap/identity");
    requireRead(binding.memoirId === this.binding.memoirId && binding.segmentId === this.binding.segmentId && (stateBytes === undefined || stateBytes > 0 && stateBytes <= DURABLE_LIMITS.supportedStateBytes), "derived segment/bound mismatch");
    let structural = event.root.after !== event.root.before;
    const dirty = new Map<string, Set<string>>(), mark = (row: string, owner: string) => { if (!dirty.has(owner)) dirty.set(owner, new Set()); dirty.get(owner)!.add(row); };
    for (const change of event.contents) {
      const c = this.state.contents[change.key];
      for (const owner of this.owners.get(`C:${change.key}`) ?? []) mark(`C:${change.key}`, owner);
      if (change.kind === "record-content" && (change.before && !isCell(change.before) || change.after && !isCell(change.after))) structural = true;
      if (change.kind === "patch-content" && change.fields.some(f => f.scope === "record" && f.field === "viewType")) structural = true;
      if (change.kind === "patch-content" && c && !isCell(c)) {
        if (change.sequences.some(s => s.field !== "inlineContent") || change.fields.some(f => f.scope === "record" && ["ownedRelations", "viewType", "definitionOwnerKey"].includes(f.field) || f.scope === "payload" && f.field === "id")) structural = true;
        const bundle = this.bundles.get(c.key)!;
        for (const sequence of change.sequences) if (sequence.field === "inlineContent") {
          if (bundle.inline) await bundle.inline.splice(sequence.index, sequence.removed.length, sequence.inserted);
          for (const pk of sequence.inserted) {
            mark(`P:${pk}`, c.key); this.associate(`P:${pk}`, c.key);
            const p = event.placements.find(p => p.key === pk)?.after ?? this.state.placements[pk];
            if (p?.target.kind === "local") { mark(`C:${p.target.contentKey}`, c.key); this.associate(`C:${p.target.contentKey}`, c.key); }
          }
        }
      }
      if (c && isCell(c) && (edges(c).length || change.kind === "patch-content" && (change.sequences.length || change.fields.some(f => f.scope === "record")))) structural = true;
    }
    for (const p of event.placements) {
      if (p.before?.kind !== "inline" && p.before || p.after?.kind !== "inline" && p.after) structural = true;
      for (const owner of this.owners.get(`P:${p.key}`) ?? []) {
        mark(`P:${p.key}`, owner);
        if (p.after?.target.kind === "local") {
          mark(`C:${p.after.target.contentKey}`, owner); this.associate(`C:${p.after.target.contentKey}`, owner);
        }
      }
      if (p.before?.target.kind === "local") this.refsByCell.get(p.before.target.contentKey)?.delete(p.key);
      if (p.after?.target.kind === "local") {
        const ck = p.after.target.contentKey;
        if (!this.refsByCell.has(ck)) this.refsByCell.set(ck, new Set()); this.refsByCell.get(ck)!.add(p.key);
        const target = event.contents.find(c => c.key === ck);
        const content = target?.kind === "record-content" ? target.after : this.state.contents[ck];
        if (content && (!isCell(content) || edges(content).length)) structural = true;
      }
      if (p.before?.target.kind === "local" && (this.refsByCell.get(p.before.target.contentKey)?.size ?? 0) > 1) structural = true;
    }
    // Full semantic verification already occurred in the independent native
    // verifier. This private derivative additionally enforces exact preimages.
    if (stateBytes === undefined) {
      // Archive rebuild, not an ordinary published compact receipt: retain full
      // semantic validation and exact byte accounting for every replayed step.
      stateBytes = applyDurableTransitionSized(this.state, event, this.stateBytes);
    } else {
      applyExactRecords(this.state, event); this.state.revision = event.afterRevision; this.state.rootPlacementKey = event.root.after;
    }
    this.stateBytes = stateBytes;
    if (structural) {
      this.bundles.clear(); this.owners.clear(); this.refsByCell.clear(); this.recordMemberships = 0;
      for (const c of Object.values(this.state.contents)) if (!isCell(c)) await this.makeBundle(c.key);
      this.structuralEvidence();
    } else {
      for (const [key, ids] of dirty) {
        const bundle = this.bundles.get(key)!; requireRead(bundle, "derived owner missing"); const updates = new Map<string, Row | null>();
        for (const id of ids) {
          const kind = id.slice(0, 1), at = id.slice(2), value = kind === "C" ? this.state.contents[at] : this.state.placements[at];
          updates.set(id, value ? kind === "P" ? ["placement", at, value as any] : at === key ? await this.row(value as ContentRecord, bundle) : ["content", at, value as ContentRecord] : null);
          if (value) {
            if (!bundle.rowKeys.has(id)) this.recordMemberships++;
            requireRead(this.recordMemberships <= DURABLE_LIMITS.maxGraphRecords * 2, "derived record membership budget"); bundle.rowKeys.add(id);
          } else {
            if (bundle.rowKeys.delete(id)) this.recordMemberships--;
            const owners = this.owners.get(id); owners?.delete(key); if (!owners?.size) this.owners.delete(id);
          }
        }
        await bundle.pages.update(updates); await this.publishBundle(key, bundle);
      }
    }
    const certificate = await this.index(binding, stateBytes, false);
    return { certificate, stats: { mode: structural ? "structural" : "incremental", ms: performance.now() - started, updatedRows: [...dirty.values()].reduce((n, keys) => n + keys.size, 0), changedBundles: structural ? this.bundles.size : dirty.size, bytesWritten: this.totalBytes - prior, totalBytes: this.totalBytes } as MaintenanceStats };
  }
}
