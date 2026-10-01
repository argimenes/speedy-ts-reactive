import type { Facts, Mention } from './facts';
import { WorkSlice, estimateBytes, type YieldControl } from './scheduler';
export interface IndexScope {
    alive: boolean;
    epoch: number;
}
interface Entry {
    scope: IndexScope;
    epoch: number;
    hostEpoch: number;
    id: string;
    facts: Facts;
    bytes: number;
    published: boolean;
    dead: boolean;
    hits: Hit[];
    tags: string[];
}
export interface Hit {
    entry: Entry;
    mention: Mention;
}
/** Ephemeral semantic indexes. Invalidation changes a scalar, never walks hits. */
export class FactsIndex {
    private entries = new Set<Entry>();
    private garbage = new Set<Entry>();
    private closedScopes = new Set<IndexScope>();
    private scopeEntries = new Map<IndexScope, Set<Entry>>();
    private incoming = new Map<string, Set<Hit>>();
    private tags = new Map<string, Set<Entry>>();
    retainedBytes = 0;
    revision = 0;
    maxRetainedBytes = 0;
    constructor(private currentEpoch: () => number, readonly budget = 256 * 1024 * 1024) { }
    eligible(e: Entry) { return !e.dead && e.published && e.scope.alive && e.scope.epoch === e.epoch && e.hostEpoch === this.currentEpoch(); }
    invalidateScope(scope: IndexScope) { scope.epoch++; this.revision++; }
    async publish(scope: IndexScope, facts: Facts, check: () => void, pause: YieldControl) {
        const work = new WorkSlice(check, pause), bytes = await estimateBytes(facts, work, this.budget);
        // Additional conservative allowance for lookup nodes/handles; old entries stay
        // charged until actual cooperative cleanup, including cancelled staging.
        const charge = bytes + facts.mentions.length * 192 + facts.tags.length * 96 + 512;
        if (this.retainedBytes + charge > this.budget)
            throw Error('Knowledge retained-Facts memory budget exceeded');
        const e: Entry = { scope, epoch: scope.epoch, hostEpoch: this.currentEpoch(), id: facts.id, facts, bytes: charge, published: false, dead: false, hits: [], tags: [] };
        this.entries.add(e);
        let owned = this.scopeEntries.get(scope);
        if (!owned)
            this.scopeEntries.set(scope, owned = new Set());
        owned.add(e);
        this.retainedBytes += charge;
        this.maxRetainedBytes = Math.max(this.maxRetainedBytes, this.retainedBytes);
        try {
            for (const mention of facts.mentions) {
                await work.step();
                const hit = { entry: e, mention }, key = JSON.stringify([mention.kind, mention.targetId]);
                let set = this.incoming.get(key);
                if (!set)
                    this.incoming.set(key, set = new Set());
                set.add(hit);
                e.hits.push(hit);
            }
            for (const tag of facts.tags) {
                await work.step();
                let set = this.tags.get(tag);
                if (!set)
                    this.tags.set(tag, set = new Set());
                set.add(e);
                e.tags.push(tag);
            }
            check();
            e.published = true;
            this.revision++;
            return e;
        }
        catch (error) {
            this.retire(e);
            throw error;
        }
    }
    retire(entry: Entry | undefined) { if (entry) {
        entry.dead = true;
        this.garbage.add(entry);
        this.revision++;
    } }
    /** Only the coordinator can requalify an unchanged contribution after fresh
     * boundary evidence; this never restores a suppressed saved contribution. */
    requalify(entry: Entry, scope: IndexScope) { if (entry.dead || entry.scope !== scope)
        throw Error('Retired contribution'); entry.epoch = scope.epoch; entry.hostEpoch = this.currentEpoch(); this.revision++; }
    closeScope(scope: IndexScope) { scope.alive = false; this.closedScopes.add(scope); this.revision++; }
    async sweep(pause: YieldControl) {
        const work = new WorkSlice(() => { }, pause, 256, 4, 20000000);
        for (const scope of this.closedScopes) {
            for (const e of this.scopeEntries.get(scope) ?? []) {
                await work.step();
                this.retire(e);
            }
            this.closedScopes.delete(scope);
        }
        for (const e of this.garbage) {
            await work.step();
            for (const hit of e.hits) {
                await work.step();
                const key = JSON.stringify([hit.mention.kind, hit.mention.targetId]), set = this.incoming.get(key);
                set?.delete(hit);
                if (!set?.size)
                    this.incoming.delete(key);
            }
            for (const tag of e.tags) {
                await work.step();
                const set = this.tags.get(tag);
                set?.delete(e);
                if (!set?.size)
                    this.tags.delete(tag);
            }
            this.entries.delete(e);
            this.garbage.delete(e);
            const owned = this.scopeEntries.get(e.scope);
            owned?.delete(e);
            if (!owned?.size)
                this.scopeEntries.delete(e.scope);
            this.retainedBytes -= e.bytes;
        }
    }
    ticket(scope: IndexScope) { const epoch = this.currentEpoch(), version = scope.epoch, publication = this.revision; return () => { if (!scope.alive || epoch !== this.currentEpoch() || version !== scope.epoch || publication !== this.revision)
        throw Error('Stale Knowledge query'); }; }
    async prepare(scope: IndexScope, pause: YieldControl, signal?: AbortSignal) {
        const current = this.ticket(scope), check = () => { signal?.throwIfAborted(); current(); }, work = new WorkSlice(check, pause), facts: Facts[] = [];
        for (const e of this.entries) {
            await work.step();
            if (e.scope === scope && this.eligible(e))
                facts.push(e.facts);
        }
        check();
        return { facts, current };
    }
    async backlinks(scope: IndexScope, id: string, pause: YieldControl, signal?: AbortSignal) {
        const prepared = await this.prepare(scope, pause, signal), check = () => { signal?.throwIfAborted(); prepared.current(); }, work = new WorkSlice(check, pause);
        let target: Facts | undefined;
        for (const f of prepared.facts) {
            await work.step();
            if (f.id === id) {
                if (target)
                    throw Error('Ambiguous query target');
                target = f;
            }
        }
        const hits: Array<{
            sourceId: string;
            mention: Mention;
        }> = [];
        if (target) {
            let roots = 0;
            for (const f of prepared.facts) {
                await work.step();
                if (f.rootBlockId === target.rootBlockId)
                    roots++;
            }
            for (const hit of this.incoming.get(JSON.stringify(['document', target.rootBlockId])) ?? []) {
                await work.step();
                if (hit.entry.scope !== scope || !this.eligible(hit.entry))
                    continue;
                const m = hit.mention;
                if (m.targetResourceId ? m.targetResourceId === id : roots === 1)
                    hits.push({ sourceId: hit.entry.id, mention: m });
            }
        }
        check();
        return { hits, current: prepared.current };
    }
}
export type IndexedContribution = Awaited<ReturnType<FactsIndex['publish']>>;
