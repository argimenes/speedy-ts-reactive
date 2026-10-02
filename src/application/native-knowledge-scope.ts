import { PreferredSavedFactsClient } from './preferred-saved-facts-client';
import { SavedFactsClient } from './saved-facts-client';
import { NativeKnowledgeHost } from '../knowledge/session';
import type { BoundaryRepository } from '../knowledge/live-observer';
import type { NativeDocumentSession } from '../persistence/native-session';
import type { DocumentVaultLease } from './document-vault';
import type { ExtractionPolicy } from '../knowledge/policy';
import { decodeFacts } from '../knowledge/transport';
import type { DiscoveryRow, VerifiedSaved } from '../knowledge/contribution-state';
/** Shared host composition; Flint uses it only with nativeKnowledge enabled.
 * Host/Workspace lifecycle owns this object, not a tab, Window or projection. */
export function createNativeKnowledgeHost(repository: BoundaryRepository, native: Pick<NativeDocumentSession, 'knowledgeEvidence' | 'subscribeKnowledge'> & Partial<Pick<NativeDocumentSession, 'knowledgeBindings'>>, policy: {
    read(): ExtractionPolicy;
    subscribe(listener: () => void): () => void;
}, options: ConstructorParameters<typeof NativeKnowledgeHost>[1] & {sqliteSaved?:boolean} = {}) {
    const host = new NativeKnowledgeHost(repository, options);
    const stop = native.subscribeKnowledge(() => { if (native.knowledgeEvidence('').closed)
        void host.dispose(); });
    return {
        host,
        progressive: !!options.progressiveSaved,
        bindings: () => native.knowledgeBindings?.() ?? [],
        acquire(vault: DocumentVaultLease) {
            let providerChanged=()=>{};
            const saved = options.progressiveSaved ? options.sqliteSaved ? new PreferredSavedFactsClient(vault,id=>!!native.knowledgeEvidence(id).location,()=>providerChanged()) : new SavedFactsClient(vault, id => !!native.knowledgeEvidence(id).location) : undefined;
            return host.acquire({ root: vault.root, snapshot: () => vault.isAlive() ? vault.snapshot() : { ...vault.snapshot(), complete: false }, native: id => native.knowledgeEvidence(id), policy: () => policy.read(),
                subscribe(listener) { providerChanged=listener; const changed=()=>{saved?.reset();listener();}; const a = vault.subscribe(changed), b = native.subscribeKnowledge(changed), c = policy.subscribe(changed); return () => { a(); b(); c(); saved?.reset(); }; },
                prepareSaved: saved ? (policy,signal) => saved.prepare(policy,signal) : undefined,
                validateSaved: saved instanceof PreferredSavedFactsClient ? signal=>saved.current(signal) : undefined,
                savedCoverage: saved instanceof PreferredSavedFactsClient ? ()=>saved.status() : undefined,
                savedFailure: () => saved?.failure(),
                savedMetrics: () => saved?.metrics,
                async verifySaved(row: DiscoveryRow, extraction: ExtractionPolicy, signal: AbortSignal): Promise<VerifiedSaved> {
                    if (saved) return saved.read(row, extraction, signal);
                    // Explicit single-resource enrollment/hand-back only. Not N invocations for
                    // progressive vault discovery; that remains P5's separate coverage work.
                    const response = await fetch('/api/native/vault/facts', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vault: vault.root, location: row.location, resourceId: row.resourceId, byteHash: row.baseline?.nativeHash, policy: extraction }) });
                    if (!response.body)
                        throw Error('Saved verification response unavailable');
                    const reader = response.body.getReader(), decoder = new TextDecoder(), parts: string[] = [];
                    let bytes = 0;
                    try {
                        for (;;) {
                            signal.throwIfAborted();
                            const chunk = await reader.read();
                            if (chunk.done)
                                break;
                            bytes += chunk.value.byteLength;
                            if (bytes > 4 * 1024 * 1024)
                                throw Error('Knowledge browser response work budget exceeded');
                            parts.push(decoder.decode(chunk.value, { stream: true }));
                        }
                        parts.push(decoder.decode());
                    }
                    finally {
                        await reader.cancel();
                    }
                    signal.throwIfAborted();
                    const json = JSON.parse(parts.join(''));
                    if (!response.ok || !json.Success)
                        throw Error(json.Error ?? 'Saved verification unavailable');
                    if (typeof json.Data?.wire !== 'string' || json.Data.wire.length > 2 * 1024 * 1024)
                        throw Error('Knowledge browser response work budget exceeded');
                    return { ...json.Data.evidence, facts: decodeFacts(json.Data.wire) };
                } });
        },
        /** Replacement requires a new factory/host, never token migration. */
        async dispose() { stop(); await host.dispose(); },
    };
}
