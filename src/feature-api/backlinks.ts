export interface SavedProviderCoverage {provider:'sqlite'|'file';state:'verified'|'incomplete'|'unknown';reason?:string}
/** Derived, read-only mentions. IDs are authored identities, never DOM/projection keys. */
export interface BacklinkTarget { documentId: string; blockId: string }
export interface BacklinkDocument extends BacklinkTarget { title: string; location: string }
export interface BacklinksQuery { vault: string; target: BacklinkTarget }
/** Half-open native Cell offsets within the authored source Block. */
export interface BacklinkRange { blockId: string; start: number; end: number }
export interface BacklinkMention {
  /** Opaque logical mention identity; linked segments share one identity. */
  id: string;
  source: BacklinkDocument;
  target: BacklinkTarget;
  ranges: readonly BacklinkRange[];
  snippet: string;
}
export interface BacklinksResult {
  query: BacklinksQuery;
  target: BacklinkDocument;
  mentions: readonly BacklinkMention[];
  coverage: { savedProvider?:SavedProviderCoverage; mode?: 'loaded'|'saved-and-live'; available: number; discovered: number; complete: boolean; diagnostics: readonly string[] };
}
/** Implementations declare coverage; storage and reference representation stay private. */
export interface BacklinksService {
  query(request: BacklinksQuery, signal?: AbortSignal): Promise<BacklinksResult>;
  /** Revalidate provider-owned freshness evidence; false results cannot navigate. */
  current(result: BacklinksResult): boolean;
  subscribe(changed: () => void): () => void;
}
export interface ApplicationBacklinks {
  service: BacklinksService;
  target(): BacklinksQuery | undefined;
  follow(result: BacklinksResult, mention: BacklinkMention, signal?: AbortSignal): Promise<void>;
}
