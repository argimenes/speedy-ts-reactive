import { applyExactRecords } from "../../src/history/apply-records";
import { validateResource } from "../../src/history/stage-c-gates/resource";
import { encodeWire } from "../../src/history/preplan-spike/wire";

let state: any, db: IDBDatabase, queue = Promise.resolve(), uploading = false, parent = "baseline", count = 0;
const metrics = { verify: [] as number[], encode: [] as number[], idb: [] as number[], append: [] as number[], maxBytes: 0, maxCount: 0, maxAge: 0, bytes: [] as number[] };
const stages: Record<string, { count: number; totalMs: number; maxMs: number; lastMs: number }> = {};
const pending = new Map<number, number>(), outboxCreated = new Map<number, number>();
let committedCaptures = 0, serverAcknowledged = 0, telemetryInFlight = false;
let nextMessage = 0, active: any = null, currentOutbox = { bytes: 0, count: 0 }, acknowledged = 0, rejected = 0, maxQueueDepth = 0;
let phase = "online", reconnectAt = 0, reconnectDrainedAt = 0, reconnectBacklog: any, lastError: string | undefined;
let lastCaptureAck: any = null, heartbeat = 0, heartbeatAt = 0;
const epoch = () => performance.timeOrigin + performance.now();
function record(name: string, ms: number) {
  const s = stages[name] ??= { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
  s.count++; s.totalMs += ms; s.maxMs = Math.max(s.maxMs, ms); s.lastMs = ms;
}
function snapshot() {
  const oldest = pending.values().next().value, oldestPacket = outboxCreated.values().next().value;
  return { at: Date.now(), phase, captured: committedCaptures, allocatedSequence: count, acknowledged, serverAcknowledged, rejected, queueDepth: pending.size, maxQueueDepth,
    oldestQueueAgeMs: oldest === undefined ? 0 : epoch() - oldest, active: active && { ...active, messageAgeMs: epoch() - active.started, stageAgeMs: epoch() - active.stageStarted },
    uploading, outbox: currentOutbox, oldestOutboxAgeMs: oldestPacket === undefined ? 0 : Date.now() - oldestPacket, maxOutboxBytes: metrics.maxBytes, maxOutboxCount: metrics.maxCount, oldestPendingMs: metrics.maxAge,
    reconnectAt, reconnectBacklog, reconnectDrainMs: reconnectDrainedAt ? reconnectDrainedAt - reconnectAt : null, stages, lastError, lastCaptureAck, heartbeat, heartbeatAt };
}
function publish() {
  const telemetry = snapshot(); postMessage({ telemetry });
  // Independent of main-thread responsiveness; a slow endpoint cannot accumulate requests.
  if (telemetryInFlight) return;
  telemetryInFlight = true;
  void fetch("/telemetry", { method: "POST", body: JSON.stringify({ source: "worker", ...telemetry }) })
    .then(response => response.text()).catch(() => {}).finally(() => { telemetryInFlight = false; });
}
const capacity = 16 * 1024 * 1024;
function tx(stores: string[], mode: IDBTransactionMode, work: (transaction: IDBTransaction, first: (request: IDBRequest) => void) => void, label: string) {
  const start = performance.now();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(stores, mode, { durability: "strict" }); let firstAt = 0;
    record(`${label}.handoff`, performance.now() - start);
    work(t, request => request.addEventListener("success", () => { firstAt = performance.now(); record(`${label}.waitAndFirstRequest`, firstAt - start); }, { once: true }));
    t.oncomplete = () => { record(`${label}.total`, performance.now() - start); if (firstAt) record(`${label}.afterFirstRequestThroughCommit`, performance.now() - firstAt); resolve(); };
    t.onabort = () => reject(t.error ?? Error(`${label} aborted`));
  });
}
async function ledger() {
  let value: any; await tx(["meta"], "readonly", (t, first) => { const r = t.objectStore("meta").get("ledger"); first(r); r.onsuccess = () => value = r.result; }, "idb.ledger"); return value;
}
async function pump() {
  if (uploading || !db) return; uploading = true;
  try {
    const packets: any[] = [];
    await tx(["packets"], "readonly", (t, first) => { const r = t.objectStore("packets").openCursor(); first(r); let bytes = 0; r.onsuccess = () => {
      const c = r.result; if (!c || packets.length === 32 || bytes + c.value.bytes > 120 * 1024) return;
      packets.push(c.value); bytes += c.value.bytes; c.continue();
    }; }, "idb.readBatch");
    if (!packets.length) return;
    metrics.maxAge = Math.max(metrics.maxAge, Date.now() - packets[0].created);
    const encodeStart = performance.now(), body = JSON.stringify(packets.map(p => p.record)); record("transport.bodyEncode", performance.now() - encodeStart);
    const start = performance.now(), response = await fetch("/append", { method: "POST", body });
    record("transport.responseHeaders", performance.now() - start);
    const serverMs = response.headers.get("X-G3-Append-Ms"); if (serverMs !== null) record("server.append", Number(serverMs));
    if (!response.ok) { rejected++; record("transport.rejected", performance.now() - start); return; }
    const ack = await response.json();
    if (JSON.stringify(ack.accepted) !== JSON.stringify(packets.map(p => p.record.id))) throw Error("Incorrect acknowledgement");
    metrics.append.push(performance.now() - start); record("transport.acknowledgement", performance.now() - start);
    serverAcknowledged += packets.length;
    for (const p of packets) record("captureToDurableServerAck", Date.now() - p.created);
    let committedLedger: typeof currentOutbox;
    await tx(["meta", "packets"], "readwrite", (t, first) => {
      const meta = t.objectStore("meta"), r = meta.get("ledger"); first(r); r.onsuccess = () => {
        const value = r.result;
        for (const p of packets) { t.objectStore("packets").delete(p.seq); value.bytes -= p.bytes; value.count--; }
        meta.put(value, "ledger"); meta.put(ack, "ack"); committedLedger = { ...value };
      };
    }, "idb.acknowledge");
    currentOutbox = committedLedger;
    acknowledged += packets.length;
    for (const p of packets) outboxCreated.delete(p.seq);
    for (const p of packets) record("captureToLocalAckCommit", Date.now() - p.created);
    if (reconnectAt && !reconnectDrainedAt && !currentOutbox.count) reconnectDrainedAt = Date.now();
  } finally { uploading = false; }
}
setInterval(() => pump().catch(fail), 100);
let heartbeatDeadline = performance.now() + 1000;
setInterval(() => { heartbeat++; heartbeatAt = epoch(); record("worker.heartbeatLateness", performance.now() - heartbeatDeadline); heartbeatDeadline = performance.now() + 1000; publish(); }, 1000);
function fail(error: any) { lastError = String(error?.stack ?? error); postMessage({ error: lastError, telemetry: snapshot() }); publish(); }
onmessage = ({ data }) => {
  if (data.kind === "network") { phase = data.phase; if (phase === "reconnected") { reconnectAt = Date.now(); reconnectBacklog = { ...currentOutbox, workerQueueDepth: pending.size }; } publish(); return; }
  const message = ++nextMessage, arrived = epoch(); pending.set(message, arrived); maxQueueDepth = Math.max(maxQueueDepth, pending.size);
  if (data.postedAt) record("mainToWorker.delivery", arrived - data.postedAt);
  queue = queue.then(async () => {
    record("worker.queueWait", epoch() - arrived); active = { kind: data.kind ?? "event", commitId: data.event?.commitId, stage: "start", started: epoch(), stageStarted: epoch() };
    if (data.kind === "init") {
      state = data.baseline;
      db = await new Promise((resolve, reject) => { const r = indexedDB.open("codex-g3-cost", 1); r.onupgradeneeded = () => { r.result.createObjectStore("meta"); r.result.createObjectStore("packets"); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      await tx(["meta"], "readwrite", (t, first) => first(t.objectStore("meta").put({ bytes: 0, count: 0 }, "ledger")), "idb.init");
      const wire = encodeWire(state); const response = await fetch("/baseline", { method: "POST", body: wire }); if (!response.ok) throw Error(await response.text());
      postMessage({ ready: true, baselineBytes: new TextEncoder().encode(wire).length }); return;
    }
    if (data.kind === "finish") {
      await pump(); const pending = await ledger();
      if (pending.count || uploading) { postMessage({ pending }); return; }
      postMessage({ done: true, count, metrics, pipeline: snapshot(), finalWire: encodeWire(state) }); return;
    }
    const event = data.event, start = performance.now();
    if (event.beforeRevision !== state.revision || event.root.before !== state.rootPlacementKey) throw Error("Wrong exact parent");
    active.stage = "apply"; active.stageStarted = epoch();
    applyExactRecords(state, event); state.revision = event.afterRevision; state.rootPlacementKey = event.root.after;
    record("worker.apply", performance.now() - start);
    active.stage = "validate"; active.stageStarted = epoch(); const validateStart = performance.now();
    validateResource(state); record("worker.validate", performance.now() - validateStart); metrics.verify.push(performance.now() - start);
    active.stage = "encode"; active.stageStarted = epoch(); const encodeStart = performance.now(), wire = encodeWire(event); metrics.encode.push(performance.now() - encodeStart); record("worker.encode", performance.now() - encodeStart);
    const bytes = new TextEncoder().encode(wire).length; if (bytes > 100 * 1024) throw Error("Gate atomic packet cap");
    metrics.bytes.push(bytes);
    const revision = { kind: "revision", id: event.commitId, stateParent: parent, wire };
    active.stage = "idb.capture"; active.stageStarted = epoch(); const idbStart = performance.now();
    let committedLedger: typeof currentOutbox, allocatedSequence: number;
    await tx(["meta", "packets"], "readwrite", (t, first) => {
      const meta = t.objectStore("meta"), r = meta.get("ledger"); first(r); r.onsuccess = () => {
        const value = r.result; if (value.bytes + bytes > capacity || value.count >= 4096) { t.abort(); return; }
        value.bytes += bytes; value.count++;
        t.objectStore("packets").add({ seq: ++count, record: revision, bytes, created: data.created }, count); allocatedSequence = count; meta.put(value, "ledger"); committedLedger = { ...value };
      };
    }, "idb.capture");
    committedCaptures++; currentOutbox = committedLedger; outboxCreated.set(allocatedSequence, data.created);
    metrics.maxBytes = Math.max(metrics.maxBytes, currentOutbox.bytes); metrics.maxCount = Math.max(metrics.maxCount, currentOutbox.count);
    metrics.idb.push(performance.now() - idbStart); record("worker.eventTotal", performance.now() - start); parent = revision.id;
    lastCaptureAck = { commitId: event.commitId, postedAt: epoch(), sequence: committedCaptures };
    postMessage({ captured: event.commitId, capturedAt: lastCaptureAck.postedAt, captureSequence: committedCaptures });
    void pump().catch(fail);
  }).catch(fail).finally(() => { pending.delete(message); active = null; });
};
