import { FactsIndex, type IndexScope, type IndexedContribution } from './index';
import { observeLive, type BoundaryRepository } from './live-observer';
import { eligibleRow, sameLocation, type KnowledgeScope, type ContributionState } from './contribution-state';
import { normalizePolicy, policyKey } from './policy';
import { WorkSlice, yieldTask, type YieldControl } from './scheduler';
interface Slot {
    state: ContributionState;
    error?: string;
    entry?: IndexedContribution;
    authority?: 'live' | 'saved';
    savedWanted: boolean;
    savedEvidence?: {resourceId:string;byteHash:string;location:{folder:string;filename:string};policy:string};
    structuralEpoch: number;
    scopeEpoch: number;
}
interface Scope extends IndexScope {
    port: KnowledgeScope;
    users: number;
    slots: Map<string, Slot>;
    stop: () => void;
    completedEpoch: number;
    coverageError?: string;
    savedFailure?: string;
}
/** One host/repository subscription; jobs belong to resource slots, never views. */
export class NativeKnowledgeHost {
    private listeners = new Set<() => void>();
    private notification?: ReturnType<typeof setTimeout>;
    /** Coalesced deferred notification; input invalidation remains scalar work. */
    subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
    private notify() {
        if (this.notification || this.closed) return;
        this.notification = setTimeout(() => { this.notification = undefined; for (const listener of this.listeners) listener(); }, 0);
    }
    private completedEpoch = -1;
    private disposal?: Promise<void>;
    private retiredScopes = new Set<Scope>();
    private resourceSlots = 0;
    private lastError?: string;
    private epoch = 0;
    private structuralEpoch = 0;
    private scopes = new Map<string, Scope>();
    private stop?: () => void;
    private firstPending = 0;
    private timer?: ReturnType<typeof setTimeout>;
    private active?: AbortController;
    private running?: Promise<void>;
    private closed = false;
    readonly index: FactsIndex;
    readonly metrics = { invalidations: 0, invalidationMs: 0, maxInvalidationMs: 0, boundaryMs: 0, observationMs: 0, indexingMs: 0, cleanupMs: 0, savedMs: 0, scopeMs: 0, queryMs: 0, observations: 0, savedReads: 0, maxObservationSliceMs: 0 };
    private pause: YieldControl;
    constructor(private repository: BoundaryRepository, private options: {
        loadedOnly?: boolean;
        progressiveSaved?: boolean;
        debounceMs?: number;
        factsBudget?: number;
        maxResources?: number;
        maxScopes?: number;
        maxResourceMs?: number;
        yieldControl?: YieldControl;
    } = {}) {
        this.pause = options.yieldControl ?? yieldTask;
        this.index = new FactsIndex(() => this.epoch, options.factsBudget);
    }
    private invalidate(structural = true) {
        if (this.closed)
            return;
        const start = performance.now();
        this.epoch++;
        this.notify();
        if (structural)
            this.structuralEpoch++;
        this.active?.abort();
        if (!this.firstPending)
            this.firstPending = performance.now();
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.timer = undefined; void this.flush().catch(e => { this.lastError = String(e); }); }, Math.min(this.options.debounceMs ?? 100, Math.max(0, 1000 - (performance.now() - this.firstPending))));
        const elapsed = performance.now() - start;
        this.metrics.invalidations++;
        this.metrics.invalidationMs += elapsed;
        this.metrics.maxInvalidationMs = Math.max(this.metrics.maxInvalidationMs, elapsed);
    }
    acquire(port: KnowledgeScope) {
        if (this.closed)
            throw Error('Knowledge host disposed');
        let scope = this.scopes.get(port.root);
        const created = !scope;
        if (!scope) {
            if (this.scopes.size >= (this.options.maxScopes ?? 8))
                throw Error('Knowledge scope budget exceeded');
            scope = { port, users: 0, slots: new Map(), alive: true, epoch: 0, completedEpoch: -1, stop: () => { } };
            this.scopes.set(port.root, scope);
            const owned = scope;
            scope.stop = port.subscribe(() => { owned.savedFailure=undefined; owned.epoch++; this.invalidate(); });
            if (!this.stop)
                this.stop = this.repository.subscribeChanges(change => this.invalidate(!change.inlineOwner));
        }
        scope.users++;
        if (created)
            this.invalidate();
        let released = false;
        const owned = scope;
        const check = () => { if (released || !owned.alive)
            throw Error('Knowledge lease closed'); };
        return {
            savedMetrics: () => owned.port.savedMetrics?.(),
            generation: () => { check(); const epoch=this.epoch, version=owned.epoch; return () => { check(); if(epoch!==this.epoch || version!==owned.epoch) throw Error('Stale Knowledge query generation'); }; },
            requestSaved: (id: string) => { check(); if (this.options.loadedOnly) throw Error('Saved coverage is disabled'); let s = owned.slots.get(id); if (!s) {
                if (this.resourceSlots >= (this.options.maxResources ?? 10000))
                    throw Error('Knowledge resource queue budget exceeded');
                owned.slots.set(id, s = this.empty());
                this.resourceSlots++;
            } s.savedWanted = true; this.invalidate(); },
            coverage: () => { check(); return { complete: !this.lastError && !owned.coverageError && owned.completedEpoch === this.epoch && owned.port.snapshot().complete && [...owned.slots.values()].every(s => !!s.entry && this.index.eligible(s.entry) && !s.entry.facts.diagnostics.length), diagnostic: owned.coverageError ?? this.lastError, resources: [...owned.slots].map(([id, s]) => ({ id, evidence: s.authority === 'saved' ? s.savedEvidence : undefined, state: s.entry && this.index.eligible(s.entry) ? s.state : 'unavailable', error: s.error ?? (s.entry && !this.index.eligible(s.entry) ? 'Observation pending' : undefined) })), retainedBytes: this.index.retainedBytes }; },
            prepare: async (signal?: AbortSignal) => { check(); const t = performance.now(); const r = await this.index.prepare(owned, this.pause, signal, !!this.options.progressiveSaved); check(); this.metrics.queryMs += performance.now() - t; const current=r.current; return { ...r, current: () => { check(); current(); } }; },
            backlinks: async (id: string, signal?: AbortSignal) => { check(); const t = performance.now(); const r = await this.index.backlinks(owned, id, this.pause, signal); check(); this.metrics.queryMs += performance.now() - t; const current=r.current; return { ...r, current: () => { check(); current(); } }; },
            release: () => { if (released)
                return; released = true; if (--owned.users)
                return; this.index.closeScope(owned); this.retiredScopes.add(owned); owned.epoch++; owned.stop(); this.resourceSlots -= owned.slots.size; this.scopes.delete(port.root); this.invalidate(); if (!this.scopes.size) {
                this.stop?.();
                this.stop = undefined;
            } },
        };
    }
    private empty(): Slot { return { state: 'unavailable', savedWanted: false, structuralEpoch: -1, scopeEpoch: -1 }; }
    private async cleanup() { const t = performance.now(); const work = new WorkSlice(() => { }, this.pause); for (const scope of this.retiredScopes) {
        for (const slot of scope.slots.values()) {
            await work.step();
            slot.entry = undefined;
        }
        scope.slots.clear();
        this.retiredScopes.delete(scope);
    } await this.index.sweep(this.pause); this.metrics.cleanupMs += performance.now() - t; }
    start() { if (!this.running) void this.flush().catch(e => {this.lastError=String(e);this.notify();}); }
    async flush(): Promise<void> {
        clearTimeout(this.timer);
        this.timer = undefined;
        if (this.closed)
            return;
        if (this.running) {
            await this.running;
            return this.flush();
        }
        if (this.completedEpoch === this.epoch)
            return;
        this.firstPending = 0;
        this.lastError = undefined;
        const controller = this.active = new AbortController(), epoch = this.epoch;
        const check = () => { controller.signal.throwIfAborted(); if (this.closed || epoch !== this.epoch)
            throw Error('Stale Knowledge work'); };
        const run = async () => {
            try {
                await this.cleanup();
                check();
                for (const scope of this.scopes.values()) {
                    scope.coverageError = undefined;
                    const documents = scope.port.snapshot().documents;
                    let count = 0;
                    for (const row of documents) {
                        check();
                        if (!scope.slots.has(row.resourceId)) {
                            if (this.resourceSlots >= (this.options.maxResources ?? 10000)) {
                                scope.coverageError = 'Knowledge resource queue budget exceeded';
                                break;
                            }
                            scope.slots.set(row.resourceId, this.empty());
                            this.resourceSlots++;
                        }
                        if (++count % 64 === 0)
                            await this.pause();
                    }
                    let savedPrepared=false;
                    for (const [id, slot] of [...scope.slots].sort((a,b) => Number(!!scope.port.native(b[0]).location)-Number(!!scope.port.native(a[0]).location))) {
                        await this.pause();
                        check();
                        if (!scope.alive)
                            break;
                        // Discovery verification belongs to the scope, not the first resource's
                        // 10 s extraction deadline. Bound it independently and prioritize live work.
                        if (this.options.progressiveSaved && scope.port.prepareSaved && !savedPrepared && !scope.savedFailure && !scope.port.native(id).location && scope.port.snapshot().complete) {
                            savedPrepared=true;const preparation=new AbortController(),abort=()=>preparation.abort(controller.signal.reason);
                            controller.signal.addEventListener('abort',abort,{once:true});const timeout=setTimeout(()=>preparation.abort(Error('Saved scope verification deadline exceeded')),90000);
                            try {const start=performance.now();await scope.port.prepareSaved(normalizePolicy(scope.port.policy()),preparation.signal);this.metrics.scopeMs+=performance.now()-start;check();}
                            catch(error){if(!controller.signal.aborted){scope.savedFailure=String(error);this.invalidate();}throw error;}
                            finally{clearTimeout(timeout);controller.signal.removeEventListener('abort',abort);}
                        }
                        const version = scope.epoch, budget = this.options.maxResourceMs ?? 10000, deadline = performance.now() + budget, job = new AbortController();
                        const abort = () => job.abort(controller.signal.reason);
                        controller.signal.addEventListener('abort', abort, { once: true });
                        const timeout = setTimeout(() => job.abort(Error('Knowledge resource work deadline exceeded')), budget);
                        const valid = () => { check(); job.signal.throwIfAborted(); if (performance.now() > deadline)
                            throw Error('Knowledge resource work deadline exceeded'); if (!scope.alive || scope.epoch !== version)
                            throw Error('Stale Knowledge scope'); };
                        try {
                            // Audit even ineligible scopes: invalid/ambiguous presence is never absence.
                            const jobPause = async () => { valid(); await this.pause(); valid(); };
                            const b = performance.now();
                            const boundary = await this.repository.readCanonicalResourceBoundaryCooperative(id, { signal: job.signal, yieldControl: jobPause });
                            this.metrics.boundaryMs += performance.now() - b;
                            valid();
                            const row = eligibleRow(scope.port, id), policy = normalizePolicy(scope.port.policy()), native = scope.port.native(id);
                            if (boundary.status === 'ready') {
                                if (!native.location)
                                    throw Error('Live native binding unavailable');
                                slot.state = 'live-pending';
                                slot.authority = 'live';
                                slot.savedEvidence = undefined;
                                this.index.retire(slot.entry);
                                slot.entry = undefined;
                                await this.cleanup();
                                valid();
                                const t = performance.now(), observed = await observeLive(this.repository, id, policy, { boundary, signal: job.signal, yieldControl: jobPause, check: valid });
                                this.metrics.observationMs += performance.now() - t;
                                this.metrics.observations++;
                                this.metrics.maxObservationSliceMs = Math.max(this.metrics.maxObservationSliceMs, observed.timings.maxSliceMs);
                                valid();
                                const p = performance.now();
                                slot.entry = await this.index.publish(scope, observed.facts, valid, this.pause);
                                this.metrics.indexingMs += performance.now() - p;
                                slot.state = observed.facts.diagnostics.length ? 'live-incomplete' : 'live-ready';
                            }
                            else if (boundary.status === 'missing') {
                                if (this.options.loadedOnly) throw Error('unopened canonical resource; loaded-only coverage');
                                if (scope.savedFailure) throw Error(scope.savedFailure);
                                // A saved-only contribution may survive a classified unrelated inline edit,
                                // but never a structural/scope change or canonical-to-saved transition.
                                if (slot.authority === 'saved' && slot.entry && slot.structuralEpoch === this.structuralEpoch && slot.scopeEpoch === scope.epoch) {
                                    this.index.requalify(slot.entry, scope);
                                    continue;
                                }
                                const handBack = slot.authority === 'live';
                                this.index.retire(slot.entry);
                                slot.entry = undefined;
                                if (!this.options.progressiveSaved && !slot.savedWanted && !handBack)
                                    throw Error('Saved coverage awaits explicit enrollment (P5 progressive coverage is not enabled)');
                                slot.state = 'verifying-hand-back';
                                const hash = row.baseline?.nativeHash;
                                if (!hash)
                                    throw Error('Native byte evidence unavailable');
                                if (native.byteHash && native.byteHash !== hash)
                                    throw Error('Retained binding byte evidence differs');
                                const t = performance.now(), saved = await scope.port.verifySaved(row, policy, job.signal);
                                this.metrics.savedMs += performance.now() - t;
                                this.metrics.savedReads++;
                                valid();
                                const fresh = eligibleRow(scope.port, id), after = scope.port.native(id);
                                if (after.byteHash && after.byteHash !== hash || fresh.baseline?.nativeHash !== hash || saved.byteHash !== hash || saved.resourceId !== id || saved.facts.id !== id || !sameLocation(saved.location, fresh.location) || saved.policy !== policyKey(policy))
                                    throw Error('Saved hand-back evidence changed');
                                const absence = await this.repository.readCanonicalResourceBoundaryCooperative(id, { signal: job.signal, yieldControl: jobPause });
                                valid();
                                if (absence.status !== 'missing')
                                    throw Error('Canonical absence not verified');
                                await this.cleanup();
                                valid();
                                const p = performance.now();
                                slot.entry = await this.index.publish(scope, saved.facts, valid, this.pause);
                                this.metrics.indexingMs += performance.now() - p;
                                slot.authority = 'saved';
                                slot.savedEvidence = {resourceId:id,byteHash:saved.byteHash,location:saved.location,policy:saved.policy};
                                slot.state = saved.facts.diagnostics.length ? 'saved-incomplete' : 'saved-ready';
                            }
                            else
                                throw Error(`Canonical boundary ${boundary.status}: ${boundary.reason}`);
                            if (this.options.progressiveSaved) this.notify();
                            slot.error = undefined;
                            slot.structuralEpoch = this.structuralEpoch;
                            slot.scopeEpoch = scope.epoch;
                        }
                        catch (error) {
                            this.index.retire(slot.entry);
                            slot.entry = undefined;
                            slot.state = 'unavailable';
                            slot.error = String(error);
                            const fatal=scope.port.savedFailure?.();
                            if (this.options.progressiveSaved && fatal && !scope.savedFailure) {scope.savedFailure=fatal;this.invalidate();}
                            if (controller.signal.aborted)
                                throw error;
                        }
                        finally {
                            clearTimeout(timeout);
                            controller.signal.removeEventListener('abort', abort);
                        }
                    }
                    scope.completedEpoch = this.epoch;
                    if (this.options.progressiveSaved) this.notify();
                }
                check();
                this.completedEpoch = epoch;
            }
            catch (error) {
                if (!controller.signal.aborted && !this.closed)
                    throw error;
            }
            finally {
                await this.cleanup();
            }
        };
        this.running = run();
        try {
            await this.running;
        }
        finally {
            this.running = undefined;
            if (this.active === controller)
                this.active = undefined;
        }
    }
    dispose(): Promise<void> { if (this.disposal)
        return this.disposal; return this.disposal = this.disposeWork(); }
    private async disposeWork() { if (this.closed)
        return; this.closed = true; this.epoch++; clearTimeout(this.timer); clearTimeout(this.notification); this.listeners.clear(); this.active?.abort(); this.stop?.(); this.stop = undefined; for (const scope of this.scopes.values()) {
        this.index.closeScope(scope);
        this.retiredScopes.add(scope);
        scope.stop();
    } this.scopes.clear(); await this.running; await this.cleanup(); }
}
export type KnowledgeLease = ReturnType<NativeKnowledgeHost['acquire']>;
