export interface EntitySummary { id: string; name: string; mentions: number }
export type EntitySummaryLoader = (ids: string[], signal?: AbortSignal) => Promise<EntitySummary[]>;

export const loadEntitySummaries: EntitySummaryLoader = async (ids, signal) => {
  if (!ids.length) return [];
  const response = await fetch("/api/entities/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
    signal,
  });
  const json = await response.json();
  if (!response.ok || json?.Success !== true) throw new Error(json?.Error || "Graph entity summaries are unavailable.");
  if (!Array.isArray(json.Results)) throw new Error("The graph summary API returned invalid results.");
  return json.Results.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("The graph summary API returned invalid results.");
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string" || !Number.isFinite(Number(row.mentions)) || Number(row.mentions) < 0) throw new Error("The graph summary API returned invalid results.");
    return { id: row.id, name: row.name, mentions: Number(row.mentions) };
  });
};
