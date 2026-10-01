import type { Facts, BlockFact } from '../knowledge/facts';
import type { KnowledgeLease, NativeKnowledgeHost } from '../knowledge/session';
import { WorkSlice } from '../knowledge/scheduler';
import type { DocumentTarget } from '../feature-api/document-application';
import type { DocumentVaultLease } from './document-vault';
import { vaultPath, vaultContains } from './document-vault';
import { runSearchWorker, type SearchRunner } from '../runtime/search-worker';
import type { SearchSource } from '../runtime/search-matching';

export interface FactsScopeHost { progressive?: boolean; bindings?():readonly {resourceId:string;location:{folder:string;filename:string}}[]; host: NativeKnowledgeHost; acquire(vault: DocumentVaultLease): KnowledgeLease }
export interface FactsSource { target: DocumentTarget; facts: Facts; evidence?: SavedSourceEvidence }
export interface SavedSourceEvidence {resourceId:string;rootBlockId:string;location:{folder:string;filename:string};byteHash:string;policy:string}
export interface DerivedSearchHit { target: DocumentTarget; blockId: string; kind: 'title'|'text'; snippet: string; start: number; end: number; evidence?: SavedSourceEvidence; coordinate: 'cell'|'utf16' }
/** A Window owns this handle, not extraction or retained Facts. No editor or write capability. */
export class FactsQueryProvider {
  private vault?: DocumentVaultLease;
  private lease?: KnowledgeLease;
  private alive = true;
  constructor(private shared: FactsScopeHost) {}
  get progressive() {return !!this.shared.progressive;}
  use(vault?: DocumentVaultLease) {
    if (this.vault === vault) return;
    this.lease?.release(); this.lease = undefined; this.vault = vault;
    if (vault && this.alive) this.lease = this.shared.acquire(vault);
  }
  subscribe(listener: () => void) { return this.shared.host.subscribe(listener); }
  dispose() { this.alive = false; this.use(undefined); }
  async prepare(vault: DocumentVaultLease, signal?: AbortSignal) {
    if (!this.alive) throw Error('Facts query provider disposed');
    this.use(vault); const lease = this.lease!, signature = vault.signature(), generation=lease.generation();
    const check = () => { generation(); signal?.throwIfAborted(); if (!this.alive || this.lease !== lease || signature !== vault.signature() || !vault.isAlive()) throw Error('Stale Facts scope'); };
    check();
    // Cancellation abandons only this query. Resource-owned refresh continues for other Windows.
    if (this.progressive) this.shared.host.start(); else await waitForQuery(this.shared.host.flush(), signal); check();
    const prepared = await lease.prepare(signal), coverage = lease.coverage();
    const proof = prepared.current;
    const current = () => { check(); proof(); };
    const work = new WorkSlice(current), scan = vault.snapshot(), sources: FactsSource[] = [];
    const diagnostics = scan.diagnostics.map(d => `${d.path ?? d.resourceId ?? ''}: ${d.message}`);
    const byId = new Map(prepared.facts.map(f => [f.id, f]));
    const states = new Map(coverage.resources.map(r => [r.id, r]));
    const paths = new Set(scan.documents.map(d => JSON.stringify([d.resourceId,vaultPath(d.location)])));
    for (const binding of this.shared.bindings?.() ?? []) {
      await work.step();
      if (vaultContains(vault.root,vaultPath(binding.location)) && !paths.has(JSON.stringify([binding.resourceId,vaultPath(binding.location)]))) diagnostics.push(`${vaultPath(binding.location)}: missing loaded binding; not searched.`);
    }
    if (this.progressive && !coverage.complete) diagnostics.push('Saved/live coverage is incomplete or rebuilding; zero results do not establish absence.');
    if (!scan.complete) diagnostics.push('Vault discovery is incomplete; unique resource availability cannot be established.');
    if (coverage.diagnostic) diagnostics.push(coverage.diagnostic);
    for (const row of scan.documents) {
      await work.step(); const facts = byId.get(row.resourceId), state = states.get(row.resourceId);
      if (!scan.complete || !facts || !(state?.state.startsWith('live-') || this.progressive && state?.state.startsWith('saved-'))) {
        diagnostics.push(`${vaultPath(row.location)}: ${state?.error ?? 'unopened or unavailable'}; not searched.`); continue;
      }
      if (sources.length === 200) { diagnostics.push('Coverage limited to 200 available Documents.'); break; }
      sources.push({facts, evidence: state!.state.startsWith('saved-') ? {...state!.evidence!,rootBlockId:facts.rootBlockId} : undefined, target: {documentId: facts.id, blockId: facts.rootBlockId, title: facts.hasTitle === false ? row.title ?? 'Untitled' : facts.title, location: vaultPath(row.location)}});
    }
    const discovered = new Set(scan.documents.map(d => d.resourceId));
    for (const row of coverage.resources) if (!discovered.has(row.id)) diagnostics.push(`${row.id}: missing loaded binding; not searched.`);
    if(this.progressive&&diagnostics.length>32){const omitted=diagnostics.length-32;diagnostics.splice(32);diagnostics.push(`${omitted} additional unavailable/incomplete resource diagnostics; Refresh the vault to retry.`);}
    current(); return {sources, diagnostics, discovered: scan.documents.length, current};
  }
  async search(vault: DocumentVaultLease, query: string, signal?: AbortSignal, runner: SearchRunner = runSearchWorker) {
    if (query.length > 256) throw Error('Search text is limited to 256 characters');
    const scope = await this.prepare(vault, signal), diagnostics = scope.diagnostics;
    const inputs: SearchSource[] = [], locators = new Map<string, {source: FactsSource; block?: BlockFact}>();
    const work = new WorkSlice(scope.current); let cells = 0, blocks = 0, units = 0;
    if (query.trim()) outer: for (const source of scope.sources) {
      const title = source.target.title, key = JSON.stringify([source.facts.id, 'title']);
      if (title.length > 10000) diagnostics.push(`${title.slice(0,40)}: title truncated to 10,000 characters.`);
      inputs.push({contentKey: key, version: 0, coordinate: 'utf16', runs: [{text: title.slice(0,10000)}]}); locators.set(key, {source});
      for (const diagnostic of source.facts.diagnostics) {
        // C2 coverage concerns textual traversal; annotation eligibility belongs to C3.
        if (diagnostic === 'External resource body not expanded') diagnostics.push(`${title}: separate Document/reference body omitted.`);
        else if (diagnostic.startsWith('Unsupported hosted content')) diagnostics.push(`${title}: ${diagnostic.replace('Unsupported hosted content', 'unsupported hosted text')}`);
        else if (/Block budget|Missing placement/.test(diagnostic)) diagnostics.push(`${title}: ${diagnostic}`);
      }
      for (const block of source.facts.blocks) {
        await work.step(); if ((block.ordinal ?? 0) > 5000) { diagnostics.push(`${title}: Block traversal limited to 5,000 entries.`); break; }
        if (!block.text || !['standoff-editor-block','plain-text-block','text-block'].includes(block.type)) continue;
        cells += block.cellCount ?? 0;
        if (++blocks > 5000 || cells > 250000) { diagnostics.push('Search limited to 5,000 text Blocks / 250,000 Cells.'); break outer; }
        units += block.text.runs.reduce((n,r) => n+r.text.length, 0);
        if (units > 2000000) { diagnostics.push('Native text exceeds the 2,000,000-character search budget.'); break outer; }
        const key = JSON.stringify([source.facts.id, 'block', block.id]);
        inputs.push({...block.text, contentKey: key, version: 0}); locators.set(key, {source, block});
      }
    }
    const matched = inputs.length ? await runner(inputs, query, {}, signal) : [], hits: DerivedSearchHit[] = [];
    outer: for (const result of matched) {
      await work.step(); const {source, block} = locators.get(result.contentKey)!;
      if (result.truncated) diagnostics.push('Matching was truncated; narrow the query.');
      for (const match of result.matches) {
        await work.step();
        if (!match.actionable) { diagnostics.push('A match splitting a grapheme was omitted; search for the complete character.'); continue; }
        if (hits.length === 1000) { diagnostics.push('Results limited to 1,000 passages.'); break outer; }
        hits.push({target: source.target, evidence: source.evidence, blockId: block?.id ?? source.target.blockId, kind: block ? 'text':'title', snippet: match.context, start: match.start, end: match.end, coordinate: block?.text?.coordinate ?? 'utf16'});
      }
    }
    scope.current(); return {...scope, hits, diagnostics: [...new Set(diagnostics)]};
  }
}
export function waitForQuery<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Query cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, {once: true});
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
