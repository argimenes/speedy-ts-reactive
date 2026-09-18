/** Disposable Merkle lookup/shard format. Not archive authority. */
import { decodeDurableWire, encodeDurableWire } from "../durable-core";
export const SELECTIVE_LIMITS = Object.freeze({ pageBytes: 64 * 1024, shardBytes: 1024 * 1024,
  cacheBytes: 4 * 1024 * 1024, readBytes: 24 * 1024 * 1024, readPages: 4096,
  buildBytes: 128 * 1024 * 1024, revisions: 16, entries: 200_000, concurrency: 4 });
export const requireRead = (ok: unknown, message: string): void => { if (!ok) throw Error(`Selective history: ${message}`); };
export interface BlobRef { hash: string; bytes: number }
export interface BlobIO {
  digest(bytes: Uint8Array): Promise<string>;
  get(hash: string, signal?: AbortSignal): Promise<Uint8Array>;
}
export interface BlobWriter extends BlobIO { put(hash: string, bytes: Uint8Array): Promise<void> }
export const bytesOf = (value: unknown) => new TextEncoder().encode(encodeDurableWire(value));
export async function putValue(io: BlobWriter, value: unknown): Promise<BlobRef> {
  const bytes = bytesOf(value); requireRead(bytes.length <= SELECTIVE_LIMITS.shardBytes, "shard exceeds bound");
  const hash = await io.digest(bytes); await io.put(hash, bytes); return { hash, bytes: bytes.length };
}
type Page = { kind: "leaf"; entries: [string, unknown][] } | { kind: "branch"; children: [string, BlobRef][] };
/** Fixed fanout hash trie; unchanged buckets remain content-addressed across revisions. */
export async function buildLookup(io: BlobWriter, values: [string, unknown][]): Promise<BlobRef> {
  requireRead(values.length <= SELECTIVE_LIMITS.entries && new Set(values.map(v => v[0])).size === values.length, "index entry bound/duplicate");
  const keyed = await Promise.all(values.map(async ([key, value]) => ({ key, value, hash: await io.digest(new TextEncoder().encode(key)) })));
  const build = async (entries: typeof keyed, depth: number): Promise<BlobRef> => {
    const leaf: Page = { kind: "leaf", entries: entries.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map(e => [e.key, e.value]) };
    if (bytesOf(leaf).length <= SELECTIVE_LIMITS.pageBytes) return putValue(io, leaf);
    requireRead(depth < 64, "index entry too large/hash collision");
    const groups = new Map<string, typeof keyed>();
    for (const entry of entries) { const nibble = entry.hash[depth]; if (!groups.has(nibble)) groups.set(nibble, []); groups.get(nibble)!.push(entry); }
    const children: [string, BlobRef][] = [];
    for (const [prefix, group] of [...groups].sort()) children.push([prefix, await build(group, depth + 1)]);
    return putValue(io, { kind: "branch", children });
  };
  return build(keyed, 0);
}
export const REMOVE = Symbol("remove-derived-key");
/** Copy only changed Merkle paths; unchanged pages keep their exact hash. */
export async function updateLookup(io: BlobWriter, root: BlobRef, updates: Map<string, unknown | typeof REMOVE>): Promise<BlobRef> {
  const items = await Promise.all([...updates].map(async ([key, value]) => ({ key, value, hash: await io.digest(new TextEncoder().encode(key)) })));
  const visit = async (ref: BlobRef, changes: typeof items, depth: number): Promise<BlobRef> => {
    const bytes = await io.get(ref.hash); requireRead(bytes.length === ref.bytes && await io.digest(bytes) === ref.hash, "mutable index preimage hash");
    const page = decodeDurableWire(new TextDecoder().decode(bytes)) as Page;
    if (page.kind === "leaf") {
      const values = new Map(page.entries);
      for (const change of changes) { if (change.value === REMOVE) values.delete(change.key); else values.set(change.key, change.value); }
      // Existing leaf's prefix is implicit. Build at the SAME depth on overflow.
      const build = async (entries: [string, unknown][], at: number): Promise<BlobRef> => {
        const leaf: Page = { kind: "leaf", entries: entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) };
        if (bytesOf(leaf).length <= SELECTIVE_LIMITS.pageBytes) return putValue(io, leaf);
        requireRead(at < 64, "index entry too large"); const groups = new Map<string, [string, unknown][]>();
        for (const entry of entries) { const p = (await io.digest(new TextEncoder().encode(entry[0])))[at]; if (!groups.has(p)) groups.set(p, []); groups.get(p)!.push(entry); }
        const children: [string, BlobRef][] = []; for (const [p, group] of [...groups].sort()) children.push([p, await build(group, at + 1)]);
        return putValue(io, { kind: "branch", children });
      };
      return build([...values], depth);
    }
    requireRead(page.kind === "branch" && depth < 64, "invalid index path");
    const children = new Map(page.children), grouped = new Map<string, typeof items>();
    for (const item of changes) { const p = item.hash[depth]; if (!grouped.has(p)) grouped.set(p, []); grouped.get(p)!.push(item); }
    for (const [p, group] of grouped) children.set(p, await visit(children.get(p) ?? await putValue(io, { kind: "leaf", entries: [] }), group, depth + 1));
    return putValue(io, { kind: "branch", children: [...children].sort(([a], [b]) => a < b ? -1 : 1) });
  };
  return items.length ? visit(root, items, 0) : root;
}
export interface SelectiveMetrics { bytes: number; pages: number; cacheHits: number; decodeMs: number; verifyMs: number; fetchMs: number; totalMs: number; fallback?: string }
/** One bounded session cache; per-query transfer/work budgets, including cache hits. */
export class PageReader {
  private cache = new Map<string, { value: any; bytes: number }>();
  private retained = 0;
  metrics!: SelectiveMetrics;
  constructor(private io: BlobIO) { this.begin(); }
  begin() { this.metrics = { bytes: 0, pages: 0, cacheHits: 0, decodeMs: 0, verifyMs: 0, fetchMs: 0, totalMs: 0 }; }
  clear() { this.cache.clear(); this.retained = 0; }
  usage() { return { bytes: this.retained, entries: this.cache.size }; }
  async value(ref: BlobRef, signal?: AbortSignal): Promise<any> {
    signal?.throwIfAborted();
    requireRead(ref && /^[a-f0-9]{64}$/.test(ref.hash) && Number.isSafeInteger(ref.bytes) && ref.bytes > 0 && ref.bytes <= SELECTIVE_LIMITS.shardBytes, "bad shard reference");
    requireRead(++this.metrics.pages <= SELECTIVE_LIMITS.readPages, "read page budget");
    const cached = this.cache.get(ref.hash);
    if (cached) { requireRead(cached.bytes === ref.bytes, "cached size mismatch"); this.metrics.cacheHits++; return cached.value; }
    const start = performance.now(), bytes = await this.io.get(ref.hash, signal); this.metrics.fetchMs += performance.now() - start;
    this.metrics.bytes += bytes.length; requireRead(this.metrics.bytes <= SELECTIVE_LIMITS.readBytes, "read byte budget");
    const verify = performance.now(); requireRead(bytes.length === ref.bytes && await this.io.digest(bytes) === ref.hash, "shard hash/length mismatch"); this.metrics.verifyMs += performance.now() - verify;
    signal?.throwIfAborted(); const decode = performance.now();
    const value = decodeDurableWire(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); this.metrics.decodeMs += performance.now() - decode;
    while (this.retained + bytes.length > SELECTIVE_LIMITS.cacheBytes && this.cache.size) { const key = this.cache.keys().next().value!; this.retained -= this.cache.get(key)!.bytes; this.cache.delete(key); }
    // Concurrent requests for the same immutable page must not double-count it.
    if (!this.cache.has(ref.hash)) { this.cache.set(ref.hash, { value, bytes: bytes.length }); this.retained += bytes.length; }
    return value;
  }
  async lookup(root: BlobRef, key: string, signal?: AbortSignal): Promise<any | undefined> {
    const digest = await this.io.digest(new TextEncoder().encode(key));
    let ref = root;
    for (let depth = 0; depth <= 64; depth++) {
      const page = await this.value(ref, signal) as Page;
      if (page.kind === "leaf") return page.entries.find(e => e[0] === key)?.[1];
      requireRead(page.kind === "branch", "unknown index page");
      const next = page.children.find(([prefix]) => prefix === digest[depth]);
      if (!next) return undefined; // authenticated absent branch
      ref = next[1];
    }
    throw Error("Selective history: index depth bound");
  }
}
