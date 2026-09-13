import { matchSources } from "./search-matching";
self.onmessage = event => {
  try { self.postMessage({ results: matchSources(event.data.sources, event.data.query, event.data.options) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
