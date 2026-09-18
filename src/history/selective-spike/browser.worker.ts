import { DurableHistoryReader } from "../durable-reader";
import { equal } from "../../block-tree/commit-capture";
import { compareDurableSubtrees } from "../durable-core";
import { SelectiveReader } from "./reader";
import { compactPreview } from "./preview";
const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), b => b.toString(16).padStart(2, "0")).join("");
let base: string, metadata: any, full: DurableHistoryReader, selective: SelectiveReader;
let head: any, headProof: string | undefined, retainedExact: any;
const json = async (url: string) => { const r = await fetch(url); if (!r.ok) throw Error(await r.text()); return r.json(); };
self.onmessage = async ({ data }) => {
  try {
    if (data.kind === "init") {
      base = `/__selective/${data.name}`; metadata = await json(`${base}/metadata`);
      const io = { digest, path: (sequence: number) => json(`${base}/path/${sequence}`), chunk: async (hash: string) => new Uint8Array(await (await fetch(`${base}/blob/${hash}`)).arrayBuffer()) };
      full = new DurableHistoryReader(metadata.identity, { blockId: "target" }, io);
      selective = new SelectiveReader(metadata.identity, { digest, get: io.chunk,
        certificate: (sequence, revisionId) => json(`${base}/certificate/${sequence}?revisionId=${encodeURIComponent(revisionId)}`),
        fallback: async (sequence, revisionId, _selection, signal) => (await full.select(sequence, revisionId, signal)).selected });
      postMessage({ id: data.id, metadata }); return;
    }
    if (data.cold) { full.clear(); selective.clear(); head = undefined; headProof = undefined; retainedExact = undefined; }
    const start = performance.now(), revisionId = metadata.revisions[data.sequence]; let exact: any, diagnostics: any;
    if (data.kind === "transport") { if (!retainedExact) throw Error("No retained graph"); exact = retainedExact; diagnostics = { retainedGraph: true }; }
    else if (data.reader === "full") { exact = await full.select(data.sequence, revisionId); diagnostics = exact.timing; }
    else {
      const selected = await selective.select(data.sequence, revisionId, { blockId: "target" });
      if (selected.source !== "selective") throw Error(`Unexpected fallback: ${selected.metrics.fallback}`);
      diagnostics = selected.metrics;
      const h = metadata.identity.headSequence;
      if (data.sequence === h) { head = selected.result; headProof = JSON.stringify(await json(`${base}/certificate/${h}?revisionId=${encodeURIComponent(metadata.revisions[h])}`)); }
      else {
        const proof = JSON.stringify(await json(`${base}/certificate/${h}?revisionId=${encodeURIComponent(metadata.revisions[h])}`));
        if (!head || proof !== headProof) { head = (await selective.select(h, metadata.revisions[h], { blockId: "target" })).result; headProof = proof; }
      }
      exact = { selected: selected.result, comparison: compareDurableSubtrees(selected.result, head) };
    }
    if (data.kind === "verify") {
      const oracle = await full.select(data.sequence, revisionId);
      if (!equal(exact.selected, oracle.selected) || !equal(exact.comparison, oracle.comparison)) throw Error("Full reader parity failure");
      postMessage({ id: data.id, parity: true }); return;
    }
    retainedExact = exact; // only latest exact result; display projection never authority
    const projectStart = performance.now();
    const body = data.compact ? { selected: compactPreview(exact.selected), after: compactPreview(exact.comparison.after), comparable: exact.comparison.comparable, changes: exact.comparison.changes } : { selected: exact.selected, after: exact.comparison.after, comparable: exact.comparison.comparable, changes: exact.comparison.changes };
    postMessage({ id: data.id, body, compact: !!data.compact, diagnostics, projectionMs: performance.now() - projectStart, workerMs: performance.now() - start });
  } catch (error) { postMessage({ id: data.id, error: String((error as Error).stack ?? error) }); }
};
