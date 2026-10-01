import type { BacklinkMention, BacklinksQuery, BacklinksResult, BacklinksService } from '../feature-api/backlinks';
import type { DocumentVaultLease } from './document-vault';
import { FactsQueryProvider } from './facts-query-provider';
import { WorkSlice } from '../knowledge/scheduler';

/** Read-only C3 adapter. Navigation and reference commands stay in the application host. */
export class FactsBacklinks implements BacklinksService {
  private evidence = new WeakMap<BacklinksResult, () => void>();
  private stale = new WeakSet<BacklinksResult>();
  private requests = new Set<AbortController>();
  private subscriptions = new Set<() => void>();
  private alive = true;
  constructor(private provider: FactsQueryProvider, private vault: () => DocumentVaultLease) {}
  subscribe = (listener: () => void) => {
    if (!this.alive) throw Error('Backlinks service disposed');
    const stop = this.provider.subscribe(listener), release = () => { stop(); this.subscriptions.delete(release); };
    this.subscriptions.add(release); return release;
  };
  current = (result: BacklinksResult) => { try { if (!this.alive || this.stale.has(result)) return false; const check = this.evidence.get(result); if (!check) return false; check(); return true; } catch { this.stale.add(result); return false; } };
  dispose() { this.alive = false; for (const request of this.requests) request.abort(); this.requests.clear(); for (const stop of this.subscriptions) stop(); }
  query = async (request: BacklinksQuery, signal?: AbortSignal): Promise<BacklinksResult> => {
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once: true}); if (signal?.aborted) abort();
    const timeout = setTimeout(abort, 15000); this.requests.add(controller);
    try {
      if (!this.alive) throw Error('Backlinks service disposed');
      const vault = this.vault(); if (vault.root !== request.vault) throw Error('Backlinks vault changed');
      await vault.refresh(); controller.signal.throwIfAborted();
      const scope = await this.provider.prepare(vault, controller.signal), diagnostics = scope.diagnostics;
      const proof=scope.current;
      const check = () => { if (!this.alive || this.vault() !== vault) throw Error('Backlinks scope changed'); proof(); };
      const target = scope.sources.find(s => s.target.documentId === request.target.documentId && s.target.blockId === request.target.blockId);
      if (!target) throw Error('Backlinks target is unavailable or ambiguous in this vault');
      const mentions: BacklinkMention[] = [], work = new WorkSlice(check);
      for (const source of scope.sources) {
        await work.step(); const {facts} = source, title = source.target.title;
        diagnostics.push(...(facts.referenceDiagnostics ?? facts.diagnostics).map(d => `${title}: ${d}`));
        const blocks = new Map(facts.blocks.map(b => [b.id,b])), groups = new Map<string, BacklinkMention>(), logical = new Map(facts.mentions.filter(m => m.kind === 'document').map(m => [m.id,m]));
        let cells = 0;
        for (const annotation of facts.annotations) {
          await work.step(); const mention = logical.get(annotation.logicalId), block = blocks.get(annotation.blockId);
          if ((block?.ordinal ?? 0) > 5000) { diagnostics.push(`${title}: Block traversal limited to 5,000 entries.`); break; }
          if (!mention || !mention.annotationIds.includes(annotation.id)) continue;
          cells += annotation.contextCells ?? 0;
          if (cells > 250000) { diagnostics.push(`${title}: Snippet inspection limited to 250,000 Cells.`); break; }
          if (annotation.context === undefined) { diagnostics.push(`${title}: Native reference context unavailable.`); continue; }
          let entry = groups.get(mention.id);
          if (!entry) { entry = {id: mention.id, source: source.target, target: request.target, ranges: [], snippet: annotation.context}; groups.set(mention.id,entry); }
          if (!entry.ranges.some(r => r.blockId === annotation.blockId && r.start === annotation.start && r.end === annotation.end)) (entry.ranges as Array<{blockId:string;start:number;end:number}>).push({blockId: annotation.blockId, start: annotation.start, end: annotation.end});
          if (groups.size >= 1000) { diagnostics.push(`${title}: Mention inspection limited to 1,000 entries.`); break; }
        }
        if (facts.blocks.some(b => (b.ordinal ?? 0) > 5000)) diagnostics.push(`${title}: Block traversal limited to 5,000 entries.`);
        for (const entry of groups.values()) {
          await work.step(); const mention = logical.get(entry.id)!;
          const matches = scope.sources.filter(s => s.target.blockId === mention.targetId && (mention.targetResourceId === undefined || s.target.documentId === mention.targetResourceId));
          if (matches.length !== 1) { diagnostics.push(`${title}: reference target missing, unopened, ambiguous or unsupported.`); continue; }
          if (matches[0].target.documentId !== target.target.documentId) continue;
          if (mentions.length === 1000) { diagnostics.push('Backlinks limited to 1,000 mentions.'); break; }
          mentions.push(Object.freeze({...entry, source: Object.freeze({...entry.source}), target: Object.freeze({...entry.target}), ranges: Object.freeze(entry.ranges.map(r => Object.freeze({...r})))}));
        }
      }
      check();
      const result: BacklinksResult = Object.freeze({query: Object.freeze({vault: request.vault,target: Object.freeze({...request.target})}), target: Object.freeze({...target.target}), mentions: Object.freeze(mentions), coverage: Object.freeze({available: scope.sources.length, discovered: scope.discovered, complete: !diagnostics.length, diagnostics: Object.freeze([...new Set(diagnostics)])})});
      this.evidence.set(result, check); return result;
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); this.requests.delete(controller); }
  };
}
