export interface EntitySummary { id: string; name: string; mentions?: number }
export type EntitySummaryLoader = (ids: string[], signal?: AbortSignal) => Promise<EntitySummary[]>;

/** No global graph backend. A source-scoped canonical service must be injected. */
export const loadEntitySummaries: EntitySummaryLoader = async () => {throw Error('Canonical Entity context unavailable. Document mention counts remain local.');};
