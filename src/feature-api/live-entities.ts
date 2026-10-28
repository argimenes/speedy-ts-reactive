export interface LiveEntityRow {
  id: string;
  fallbackName?: string;
  occurrences: number;
  blockReferences: number;
  forms: readonly string[];
}
export interface LiveEntitySnapshot {
  rows: readonly LiveEntityRow[];
  invalid: number;
  removed: boolean;
}
/** A leased, model-only inventory. Pending updates read only changed owned content. */
export interface LiveDocumentEntities {
  readonly documentKey: string;
  read(): LiveEntitySnapshot;
  owns(contentKey: string): boolean;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
