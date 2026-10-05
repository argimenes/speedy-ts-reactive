import {isNativeDocumentName} from '../persistence/document-file-names.mjs';
import type { Facts } from './facts';
import type { ExtractionPolicy } from './policy';
export interface Location {
    readonly folder: string;
    readonly filename: string;
}
export interface DiscoveryRow {
    readonly resourceId: string;
    readonly state: string;
    readonly location: Location;
    readonly baseline?: {
        readonly nativeHash: string | null;
    };
}
export interface Discovery {
    readonly complete: boolean;
    readonly documents: readonly DiscoveryRow[];
    readonly operations: readonly {
        phase: string;
    }[];
}
export interface NativeEvidence {
    readonly closed: boolean;
    readonly admitting: boolean;
    readonly pending: boolean;
    readonly location?: Location;
    readonly byteHash?: string | null;
}
export interface VerifiedSaved {
    facts: Facts;
    resourceId: string;
    byteHash: string;
    location: Location;
    policy: string;
}
/** Read-only capabilities. The store verifies bytes/uniqueness; this cannot save,
 * bind, relocate, admit or navigate. Saved verification is explicitly requested,
 * not a progressive whole-vault loop over P2's single-resource HTTP route. */
import type {SavedProviderCoverage} from '../feature-api/backlinks';
export type {SavedProviderCoverage} from '../feature-api/backlinks';
export interface KnowledgeScope {
    readonly root: string;
    snapshot(): Discovery;
    native(id: string): NativeEvidence;
    policy(): ExtractionPolicy;
    subscribe(listener: () => void): () => void;
    prepareSaved?(policy:ExtractionPolicy, signal:AbortSignal): Promise<void>;
    validateSaved?(signal:AbortSignal):Promise<void>;
    savedCoverage?():SavedProviderCoverage;
    savedFailure?(): string | undefined;
    savedMetrics?(): Readonly<Record<string, number>> | undefined;
    verifySaved(row: DiscoveryRow, policy: ExtractionPolicy, signal: AbortSignal): Promise<VerifiedSaved>;
}
export type ContributionState = 'unavailable' | 'live-pending' | 'live-ready' | 'live-incomplete' | 'saved-ready' | 'saved-incomplete' | 'verifying-hand-back';
export const sameLocation = (a: Location, b: Location) => a.folder === b.folder && a.filename === b.filename;
export function eligibleRow(scope: KnowledgeScope, id: string): DiscoveryRow {
    const scan = scope.snapshot(), native = scope.native(id), rows = scan.documents.filter(d => d.resourceId === id), row = rows[0];
    if (native.closed || native.admitting || native.pending || !scan.complete || scan.operations.some(o => o.phase === 'pending'))
        throw Error('Knowledge scope, admission or operation evidence unavailable');
    if (rows.length !== 1 || !['paired', 'unenrolled'].includes(row.state) || !isNativeDocumentName(row.location.filename))
        throw Error('Knowledge identity unavailable or ambiguous');
    const file = row.location.folder === '.' ? row.location.filename : row.location.folder + '/' + row.location.filename;
    if (scope.root !== '.' && !file.startsWith(scope.root + '/'))
        throw Error('Resource outside vault');
    if (native.location && !sameLocation(native.location, row.location))
        throw Error('Binding/location conflict; explicit reconciliation required');
    return row;
}
