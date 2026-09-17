import { applyExactRecords } from "../../src/history/apply-records";
import { validateResource } from "../../src/history/stage-c-gates/resource";
import { encodeWire } from "../../src/history/preplan-spike/wire";

let state: any, db: IDBDatabase, queue = Promise.resolve(), uploading = false, parent = "baseline", count = 0;
const metrics = { verify: [] as number[], encode: [] as number[], idb: [] as number[], append: [] as number[], maxBytes: 0, maxCount: 0, maxAge: 0, bytes: [] as number[] };
const capacity = 16 * 1024 * 1024;
function tx(stores: string[], mode: IDBTransactionMode, work: (transaction: IDBTransaction) => void) {
  return new Promise<void>((resolve, reject) => { const t = db.transaction(stores, mode, { durability: "strict" }); work(t); t.oncomplete = () => resolve(); t.onabort = () => reject(t.error); });
}
async function ledger() {
  let value: any; await tx(["meta"], "readonly", t => { const r = t.objectStore("meta").get("ledger"); r.onsuccess = () => value = r.result; }); return value;
}
async function pump() {
  if (uploading || !db) return; uploading = true;
  try {
    const packets: any[] = [];
    await tx(["packets"], "readonly", t => { const r = t.objectStore("packets").openCursor(); let bytes = 0; r.onsuccess = () => {
      const c = r.result; if (!c || packets.length === 32 || bytes + c.value.bytes > 120 * 1024) return;
      packets.push(c.value); bytes += c.value.bytes; c.continue();
    }; });
    if (!packets.length) return;
    metrics.maxAge = Math.max(metrics.maxAge, Date.now() - packets[0].created);
    const start = performance.now(), response = await fetch("/append", { method: "POST", body: JSON.stringify(packets.map(p => p.record)) });
    if (!response.ok) return;
    const ack = await response.json();
    if (JSON.stringify(ack.accepted) !== JSON.stringify(packets.map(p => p.record.id))) throw Error("Incorrect acknowledgement");
    metrics.append.push(performance.now() - start);
    await tx(["meta", "packets"], "readwrite", t => {
      const meta = t.objectStore("meta"), r = meta.get("ledger"); r.onsuccess = () => {
        const value = r.result;
        for (const p of packets) { t.objectStore("packets").delete(p.seq); value.bytes -= p.bytes; value.count--; }
        meta.put(value, "ledger"); meta.put(ack, "ack");
      };
    });
  } finally { uploading = false; }
}
setInterval(() => pump().catch(fail), 100);
function fail(error: any) { postMessage({ error: String(error?.stack ?? error) }); }
onmessage = ({ data }) => {
  queue = queue.then(async () => {
    if (data.kind === "init") {
      state = data.baseline;
      db = await new Promise((resolve, reject) => { const r = indexedDB.open("codex-g3-cost", 1); r.onupgradeneeded = () => { r.result.createObjectStore("meta"); r.result.createObjectStore("packets"); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      await tx(["meta"], "readwrite", t => t.objectStore("meta").put({ bytes: 0, count: 0 }, "ledger"));
      const wire = encodeWire(state); const response = await fetch("/baseline", { method: "POST", body: wire }); if (!response.ok) throw Error(await response.text());
      postMessage({ ready: true, baselineBytes: new TextEncoder().encode(wire).length }); return;
    }
    if (data.kind === "finish") {
      await pump(); const pending = await ledger();
      if (pending.count || uploading) { postMessage({ pending }); return; }
      postMessage({ done: true, count, metrics, finalWire: encodeWire(state) }); return;
    }
    const event = data.event, start = performance.now();
    if (event.beforeRevision !== state.revision || event.root.before !== state.rootPlacementKey) throw Error("Wrong exact parent");
    // Private disposable mirror: checked preimages, followed by full graph validation.
    // No clone of the entire state per edit. An error discards this gate worker.
    applyExactRecords(state, event); state.revision = event.afterRevision; state.rootPlacementKey = event.root.after;
    validateResource(state); metrics.verify.push(performance.now() - start);
    const encodeStart = performance.now(), wire = encodeWire(event); metrics.encode.push(performance.now() - encodeStart);
    const bytes = new TextEncoder().encode(wire).length; if (bytes > 100 * 1024) throw Error("Gate atomic packet cap");
    metrics.bytes.push(bytes);
    const record = { kind: "revision", id: event.commitId, stateParent: parent, wire };
    const idbStart = performance.now();
    await tx(["meta", "packets"], "readwrite", t => {
      const meta = t.objectStore("meta"), r = meta.get("ledger"); r.onsuccess = () => {
        const value = r.result; if (value.bytes + bytes > capacity || value.count >= 4096) { t.abort(); return; }
        value.bytes += bytes; value.count++; metrics.maxBytes = Math.max(metrics.maxBytes, value.bytes); metrics.maxCount = Math.max(metrics.maxCount, value.count);
        t.objectStore("packets").add({ seq: ++count, record, bytes, created: data.created }, count); meta.put(value, "ledger");
      };
    });
    metrics.idb.push(performance.now() - idbStart); parent = record.id; postMessage({ captured: event.commitId });
    void pump().catch(fail);
  }).catch(fail);
};
