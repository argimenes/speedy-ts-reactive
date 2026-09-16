export interface ConcertinaSettings {
  naturalHeightThresholdPx: number;
  preferredExcerptHeightPx: number;
  minimumExcerptHeightPx: number;
  maximumExcerptHeightPx: number;
  contextBeforePx: number;
  contextAfterPx: number;
  nearbyMatchMergeGapPx: number;
  visibleBlockGapPx: number;
  activeMatchScrollMarginPx: number;
  continuationFadePx: number;
}

export const DEFAULT_CONCERTINA_SETTINGS: Readonly<ConcertinaSettings> = Object.freeze({
  naturalHeightThresholdPx: 260,
  preferredExcerptHeightPx: 200,
  minimumExcerptHeightPx: 120,
  maximumExcerptHeightPx: 240,
  contextBeforePx: 48,
  contextAfterPx: 48,
  nearbyMatchMergeGapPx: 24,
  visibleBlockGapPx: 12,
  activeMatchScrollMarginPx: 8,
  continuationFadePx: 18,
});

export function resolveConcertinaSettings(input: Partial<ConcertinaSettings> = {}): Readonly<ConcertinaSettings> {
  const values = { ...DEFAULT_CONCERTINA_SETTINGS };
  for (const key of Object.keys(values) as (keyof ConcertinaSettings)[]) {
    const candidate = input[key];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) values[key] = candidate;
  }
  values.minimumExcerptHeightPx = Math.max(1, values.minimumExcerptHeightPx);
  values.maximumExcerptHeightPx = Math.max(values.minimumExcerptHeightPx, values.maximumExcerptHeightPx);
  values.preferredExcerptHeightPx = Math.max(values.minimumExcerptHeightPx, Math.min(values.maximumExcerptHeightPx, values.preferredExcerptHeightPx));
  return Object.freeze(values);
}
