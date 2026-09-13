/** Worker-safe matching. Offsets in inputs/results are UTF-16 until mapped to Cells. */
export interface SearchOptions { matchCase?: boolean; wholeWords?: boolean; regex?: boolean; multiline?: boolean; dotAll?: boolean }
export interface TextRun { text: string; boundaries?: number[] }
export interface SearchSource { contentKey: string; version: number; runs: TextRun[]; coordinate: "cell" | "utf16" }
export interface RawMatch { start: number; end: number; text: string; context: string; captures: (string | undefined)[]; groups?: Record<string, string>; actionable: boolean }
export interface SourceMatches { contentKey: string; matches: RawMatch[]; truncated: boolean; zeroWidth: number }
export function matchSources(sources: SearchSource[], query: string, options: SearchOptions, limit = 5000): SourceMatches[] {
  let returned = 0;
  const pattern = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(pattern, `gu${options.matchCase ? "" : "i"}${options.multiline ? "m" : ""}${options.dotAll ? "s" : ""}`);
  return sources.map(source => {
    const matches: RawMatch[] = []; let zeroWidth = 0, truncated = false;
    if (!query) return { contentKey: source.contentKey, matches, zeroWidth, truncated };
    for (const run of source.runs) {
      regex.lastIndex = 0;
      const graphemes = new Set<number>([0, run.text.length]);
      for (const segment of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(run.text)) graphemes.add(segment.index);
      const starts = new Set<number>(), ends = new Set<number>();
      if (options.wholeWords && !options.regex) for (const segment of new Intl.Segmenter(undefined, { granularity: "word" }).segment(run.text)) {
        if (segment.isWordLike) { starts.add(segment.index); ends.add(segment.index + segment.segment.length); }
      }
      let match: RegExpExecArray | null;
      while ((match = regex.exec(run.text))) {
        if (!match[0].length) { zeroWidth++; regex.lastIndex = match.index + ((run.text.codePointAt(match.index) ?? 0) > 0xffff ? 2 : 1); continue; }
        const from = match.index, to = from + match[0].length;
        if (options.wholeWords && !options.regex && (!starts.has(from) || !ends.has(to))) continue;
        if (matches.length >= limit) { truncated = true; break; }
        if (++returned > 50000) throw new Error("Search exceeds the worker's 50,000-candidate memory budget. Narrow the scope or query.");
        const start = run.boundaries ? run.boundaries[from] : from, end = run.boundaries ? run.boundaries[to] : to;
        if (start === undefined || end === undefined || start < 0 || end < 0) continue;
        matches.push({ start, end, text: match[0], context: run.text.slice(Math.max(0, from - 35), Math.min(run.text.length, to + 35)), captures: match.slice(1), groups: match.groups, actionable: graphemes.has(from) && graphemes.has(to) });
      }
      if (truncated) break;
    }
    return { contentKey: source.contentKey, matches, zeroWidth, truncated };
  });
}
