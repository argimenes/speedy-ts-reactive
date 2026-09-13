import type { SearchOptions, SearchSource, SourceMatches } from "./search-matching";
export type SearchRunner = (sources: SearchSource[], query: string, options: SearchOptions, signal?: AbortSignal) => Promise<SourceMatches[]>;
/** Never evaluates user regex on the UI thread. Termination interrupts pathological regex. */
export const runSearchWorker: SearchRunner = (sources, query, options, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException("Search cancelled", "AbortError")); return; }
  const worker = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" });
  const finish = (error?: Error, results?: SourceMatches[]) => { clearTimeout(timer); worker.terminate(); signal?.removeEventListener("abort", abort); error ? reject(error) : resolve(results!); };
  const abort = () => finish(new DOMException("Search cancelled", "AbortError"));
  const timer = setTimeout(() => finish(new Error("Search exceeded its 5-second budget. Simplify the expression or narrow the scope.")), 5000);
  signal?.addEventListener("abort", abort, { once: true });
  worker.onmessage = event => finish(event.data.error ? new Error(event.data.error) : undefined, event.data.results);
  worker.onerror = () => finish(new Error("Search worker unavailable; editing is unaffected."));
  worker.postMessage({ sources, query, options });
});
