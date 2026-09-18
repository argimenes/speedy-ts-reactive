import { displaySelection } from "./preview";
import { PersistentHistoryReader } from "./persistent-reader";
/** One admitted Document. No editor/view capabilities; strict outbox, bounded
 * checkpoint reads and exact replay. Archive bodies never accumulate in a UI. */
import { clone } from "../block-tree/clone";
import { WholeDocumentCapture, projectWholeDocument, encodeDurableWire,
  encodeHistoryDocument,
  applyDurableTransitionSized, assertBoundedSnapshot, DURABLE_LIMITS } from "./durable-core";
import { PersistentHistoryOutbox, type HistoryEnrollment, type HistoryOutboxStatus } from "./persistent-outbox";
import type { ResourceSnapshot } from "./stage-c-gates/resource";
import type { DurableLocation, DurableSegment } from "./durable-browser";
import type { HistorySelection, SessionTimelineEntry } from "./ui-session-source";

type Checkpoint = { hash: string; byteLength: number; chunks: { hash: string; byteLength: number }[] };
type Registration = { key: string; location: DurableLocation; enrollment: HistoryEnrollment; databaseName: string };
type Reader = { segment: DurableSegment; selection: HistorySelection; ids: Map<string, number>; reader: PersistentHistoryReader };
let location: DurableLocation, epoch: string, memoirId: string, segmentId: string, revisionId: string;
let state: ResourceSnapshot, capture: WholeDocumentCapture, outbox: PersistentHistoryOutbox;
let sourceRevision: number, stateByteLength: number, initialized = false, stopped: string | undefined, closing = false;
let transportRejected = false;
let queue = Promise.resolve(), pumping: Promise<void> | undefined, timer: ReturnType<typeof setInterval>, heartbeat: ReturnType<typeof setInterval>;
const readers = new Map<string, Reader>();
const sourceRevisions = new Map<number, { sequence: number; revisionId: string }>();
const cancelledRequests = new Set<number>();
let lastCompletedRequest = 0;
let activeRead: { id: number; controller: AbortController } | undefined;
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`Document history: ${message}`); }
const id = () => crypto.randomUUID();
const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), b => b.toString(16).padStart(2, "0")).join("");
const toBase64 = (bytes: Uint8Array) => { let text = ""; for (let start = 0; start < bytes.length; start += 8192) text += String.fromCharCode(...bytes.subarray(start, start + 8192)); return btoa(text); };
async function request(action: string, data: Record<string, unknown> = {}, keepalive = false, signal?: AbortSignal) {
  const response = await fetch(`/api/history/${action}`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location, epoch, ...data }), keepalive, signal: keepalive ? undefined :
      signal || activeRead && ["describe", "timeline", "path", "chunk"].includes(action) ? AbortSignal.any([signal ?? activeRead!.controller.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
  const body = await response.json();
  if (!response.ok || !body.Success) throw Object.assign(new Error(body.Error ?? `History ${action} failed (${response.status})`), { permanent: response.status >= 400 && response.status < 500 });
  return body.Data;
}
async function registry(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("codex-document-history-registry", 2);
    r.onupgradeneeded = () => {
      const store = r.result.objectStoreNames.contains("enrollments") ? r.transaction!.objectStore("enrollments") : r.result.createObjectStore("enrollments", { keyPath: "key" });
      if (!store.indexNames.contains("resourceId")) store.createIndex("resourceId", "enrollment.resourceId");
    };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("History registry is blocked"));
  });
}
async function registrations(save?: Registration): Promise<Registration[]> {
  const db = await registry();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("enrollments", save ? "readwrite" : "readonly", { durability: "strict" });
      if (save && tx.durability !== "strict") { tx.abort(); reject(new Error("Strict registry durability unavailable")); return; }
      const store = tx.objectStore("enrollments");
      if (save) store.put(save);
      const rows: Registration[] = [], r = store.index("resourceId").openCursor(IDBKeyRange.only(location.resourceId));
      r.onsuccess = () => {
        const cursor = r.result; if (!cursor) return;
        const entry = cursor.value as Registration;
        if (entry.enrollment.resourceId === location.resourceId) rows.push(entry);
        if (rows.length > 128) { tx.abort(); return; } cursor.continue();
      };
      tx.oncomplete = () => resolve(rows); tx.onabort = () => reject(tx.error ?? new Error("History registry bound exceeded"));
    });
  } finally { db.close(); }
}
async function publishStatus(phase: "recording" | "offline" | "stopped" = "recording", message = "History captured to the durable outbox.") {
  const counts = outbox ? await outbox.status() : {};
  postMessage({ status: { ...counts, phase: stopped ? "stopped" : phase, message: stopped ?? message, memoirId, segmentId } });
}
function pump(): Promise<void> {
  if (pumping) return pumping;
  pumping = (async () => {
    if (!outbox || closing || transportRejected) return;
    let status = await outbox.status();
    while (status.pendingCount) status = await outbox.deliverNext(packet => request("append", { packet }));
    await publishStatus();
  })().catch(async error => {
    if (error?.permanent) {
      transportRejected = true; stopped = `Durable append was rejected: ${String(error)}. Pending browser records were retained.`;
      postMessage({ fatal: stopped }); await publishStatus("stopped", stopped);
    }
    throw error;
  }).finally(() => { pumping = undefined; });
  return pumping;
}
async function uploadCheckpoint(snapshot: ResourceSnapshot): Promise<Checkpoint> {
  assertBoundedSnapshot(snapshot);
  const bytes = new TextEncoder().encode(encodeDurableWire(snapshot));
  const chunks: Checkpoint["chunks"] = [];
  for (let at = 0; at < bytes.length; at += DURABLE_LIMITS.chunkBytes) {
    const chunk = bytes.subarray(at, at + DURABLE_LIMITS.chunkBytes), hash = await digest(chunk);
    await request("chunkPut", { hash, dataBase64: toBase64(chunk) }); chunks.push({ hash, byteLength: chunk.length });
  }
  return { hash: await digest(bytes), byteLength: bytes.length, chunks };
}
async function segments(): Promise<DurableSegment[]> { return (await request("describe")).segments; }
async function initialize(data: any) {
  location = data.location; sourceRevision = data.baseline.revision;
  const projected = projectWholeDocument(data.baseline, location.resourceId);
  stateByteLength = assertBoundedSnapshot(projected); state = clone(projected) as ResourceSnapshot;
  capture = new WholeDocumentCapture(projected, sourceRevision);
  const opened = await request("open", { writable: true, ownerId: id() });
  epoch = opened.epoch; memoirId = opened.memoirId; location = { ...location, memoirId };
  postMessage({ grant: { location, epoch } });
  heartbeat = setInterval(() => { void request("heartbeat").catch(error => publishStatus("offline", `History writer lease: ${String(error)}`)); }, 5000);
  // Recover EVERY retained enrollment for this resource before creating a new
  // baseline. Original immutable enrollment epochs remain the packet identity;
  // the newly acquired transport epoch fences this recovery attempt.
  for (const entry of await registrations()) {
    check(entry.enrollment.memoirId === memoirId && entry.location.folder === location.folder && entry.location.filename === location.filename,
      "Existing browser history belongs to a different Document location or memoir");
    const prior = await PersistentHistoryOutbox.open(entry.databaseName, entry.enrollment);
    try { let status = await prior.status(); while (status.pendingCount) status = await prior.deliverNext(packet => request("append", { packet })); }
    finally { prior.close(); }
  }
  segmentId = id(); revisionId = id();
  sourceRevisions.set(sourceRevision, { sequence: 0, revisionId });
  const enrollment: HistoryEnrollment = { resourceId: location.resourceId, memoirId, segmentId, enrollmentId: id(), writerEpoch: epoch };
  const baseline = await uploadCheckpoint(state);
  await request("begin", { segmentId, revisionId, baseline, metadata: { enrollment, sourceRevision, timestamp: new Date().toISOString(), label: "Document opened" }, ...(opened.receipt?.hash ? { originReceipt: opened.receipt.hash } : {}) });
  const databaseName = `codex-document-history-${enrollment.enrollmentId}`;
  outbox = await PersistentHistoryOutbox.open(databaseName, enrollment);
  await registrations({ key: enrollment.enrollmentId, location, enrollment, databaseName });
  initialized = true; await publishStatus();
  timer = setInterval(() => { void pump().catch(error => publishStatus("offline", `${String(error)} Browser-committed history is pending upload.`)); }, 500);
  return { memoirId, segmentId };
}
async function handle(data: any): Promise<any> {
  if (data.kind === "init") return initialize(data);
  check(initialized, "Enrollment has not initialized");
  if (data.kind === "capture") {
    check(!stopped, stopped ?? "Capture stopped");
    const transition = capture.capture(data.event);
    stateByteLength = applyDurableTransitionSized(state, transition, stateByteLength);
    const wire = encodeDurableWire(transition);
    await outbox.enqueue({ sequence: transition.afterRevision, recordId: transition.commitId, wire });
    sourceRevision = data.event.afterRevision; revisionId = transition.commitId;
    sourceRevisions.set(sourceRevision, { sequence: transition.afterRevision, revisionId });
    postMessage({ captured: transition.commitId }); await publishStatus();
    void pump().catch(error => publishStatus("offline", `${String(error)} Browser-committed history is pending upload.`)); return;
  }
  if (data.kind === "sessions") return segments();
  if (data.kind === "save") {
    check(data.filename === location.filename && data.folder === location.folder && !data.createOnly, "This first persistent slice saves only the enrolled Document location; Save As requires separate admission");
    const revision = data.sourceRevision, target = sourceRevisions.get(revision);
    const current = projectWholeDocument(data.baseline, location.resourceId, target?.sequence ?? 0);
    let proof: Record<string, unknown> | undefined, historyWarning: string | undefined;
    try {
      check(!stopped && !data.captureFailure && target, "Current Document is beyond the verified capture prefix");
      await pump();
      const watermark = await outbox.status(); check(watermark.verified >= target.sequence, "Current history is pending durable verification");
      proof = { location, epoch, segmentId, sequence: target.sequence, revisionId: target.revisionId };
    } catch (error) { historyWarning = `Document saved without a history save receipt: ${String(error)}. Retained history and browser outbox records are unchanged.`; }
    let document = encodeHistoryDocument(current, memoirId, proof && target ? { segmentId, revisionId: target.revisionId } : undefined);
    const save = async () => {
      const response = await fetch("/api/saveDocumentJson", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: data.folder, filename: data.filename, document, ...(proof ? { historyProof: proof } : {}) }) });
      return { response, body: await response.json() };
    };
    let saved = await save();
    if ((!saved.response.ok || !saved.body.Success) && proof) {
      historyWarning = `Document saved without a history save receipt: ${saved.body.Error ?? "History proof was rejected"}.`;
      proof = undefined; document = encodeHistoryDocument(current, memoirId);
      saved = await save();
    }
    const { response, body } = saved; check(response.ok && body.Success, body.Error ?? "Document save failed");
    const warning = [historyWarning, body.Warning ?? body.Data?.warning].filter(Boolean).join(" ");
    return { document, revision, ...(warning ? { warning } : {}) };
  }
  if (data.kind === "openReader") {
    // Reading an already verified prefix does not wait for an outage backlog.
    void pump().catch(error => publishStatus("offline", `${String(error)} Browser-committed history is pending upload.`));
    const available = await segments();
    const segment = data.segmentId ? available.find(s => s.segmentId === data.segmentId) : [...available].reverse().find(s => s.headSequence > 0) ?? available.at(-1);
    check(segment, "No persistent history segment is available");
    const selection: HistorySelection = { ...data.selection };
    if (selection.placementId?.startsWith("session:")) { delete selection.placementId; delete selection.route; }
    if (selection.route?.some(value => value.startsWith("session:"))) delete selection.route;
    for (const prior of readers.values()) prior.reader.clear(); readers.clear();
    let derivedToken: string;
    const readerId = id(), reader = new PersistentHistoryReader({ resourceId: location.resourceId, memoirId, segmentId: segment.segmentId, headSequence: segment.headSequence, headRevisionId: segment.headRevisionId }, selection, {
      path: (sequence, signal) => request("path", { segmentId: segment.segmentId, sequence }, false, signal),
      chunk: async (hash, signal) => (await request("chunk", { hash }, false, signal)).dataBase64,
      digest,
    }, {
      digest,
      certificate: async (sequence, revisionId, signal) => {
        const value = await request("selectiveCertificate", { segmentId: segment.segmentId, sequence, revisionId }, false, signal);
        derivedToken = value.token; return value.certificate ?? undefined;
      },
      get: async (hash, signal) => {
        const value = await request("selectiveBlob", { segmentId: segment.segmentId, token: derivedToken, hash }, false, signal);
        const binary = atob(value.dataBase64), bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      },
    });
    readers.set(readerId, { segment, selection, reader, ids: new Map([[segment.revisionId, 0], [segment.headRevisionId, segment.headSequence]]) });
    return { readerId, segmentId: segment.segmentId, headRevisionId: segment.headRevisionId };
  }
  if (data.kind === "timeline") {
    const reader = readers.get(data.readerId); check(reader, "History view expired; reopen History");
    const limit = data.limit ?? 25; check(Number.isSafeInteger(limit) && limit > 0 && limit <= 25, "History page limit is 25");
    const afterSequence = data.cursor === undefined ? 0 : Number(data.cursor);
    check(Number.isSafeInteger(afterSequence) && afterSequence >= 0 && afterSequence <= reader.segment.headSequence, "Invalid history cursor");
    const entries: SessionTimelineEntry[] = [];
    if (data.cursor === undefined) entries.push({ revisionId: reader.segment.revisionId, timestamp: reader.segment.metadata.timestamp ?? "", label: "History started", cause: "baseline", kinds: [], baseline: true });
    if (entries.length === limit) return { entries, ...(reader.segment.headSequence ? { nextCursor: "0" } : {}), headRevisionId: reader.segment.headRevisionId };
    const page = await request("timeline", { segmentId: reader.segment.segmentId, afterSequence, limit: limit - entries.length });
    let last = afterSequence;
    for (const envelope of page.records) {
      const record = envelope.record; if (record.sequence > reader.segment.headSequence) break;
      check(record.sequence === last + 1, "Noncontiguous timeline page"); last = record.sequence;
      reader.ids.set(record.revisionId, record.sequence);
      const metadata = record.metadata;
      check(metadata.allBlocks === true || Array.isArray(metadata.affectedBlockIds), "Timeline lacks affected Block evidence");
      if (metadata.allBlocks === true || metadata.affectedBlockIds.includes(reader.selection.blockId)) entries.push({ revisionId: record.revisionId,
        timestamp: metadata.timestamp, label: metadata.label ?? "Edit", cause: typeof metadata.cause === "string" ? metadata.cause : metadata.cause?.kind ?? "command", kinds: ["content"] });
    }
    check(last > afterSequence || last === reader.segment.headSequence, "Timeline reader made no progress");
    return { entries, ...(last < reader.segment.headSequence ? { nextCursor: String(last) } : {}), headRevisionId: reader.segment.headRevisionId };
  }
  if (data.kind === "closeReader") { readers.get(data.readerId)?.reader.clear(); readers.delete(data.readerId); return; }
  if (data.kind === "select") {
    const reader = readers.get(data.readerId); check(reader, "History view expired; reopen History");
    const sequence = reader.ids.get(data.revisionId); check(sequence !== undefined, "Revision is outside this bounded timeline view");
    const start = performance.now();
    const result = await reader.reader.select(sequence, data.revisionId, activeRead?.controller.signal);
    result.timing!.queueMs = start - data.receivedAt;
    const projectionStart = performance.now();
    const display = displaySelection(result, { resourceId: location.resourceId, memoirId, segmentId: reader.segment.segmentId, headRevisionId: reader.segment.headRevisionId });
    result.timing!.stages.previewProjection = performance.now() - projectionStart;
    result.timing!.workerMs = performance.now() - start;
    return display;
  }
  if (data.kind === "close") {
    for (const reader of readers.values()) reader.reader.clear(); readers.clear();
    closing = true; clearInterval(timer); clearInterval(heartbeat); await pumping?.catch(() => {}); outbox.close();
    try { await request("release"); } finally { postMessage({ closed: true }); }
    return;
  }
  throw new Error(`Unknown history worker command: ${data.kind}`);
}
self.onmessage = ({ data }) => {
  data.receivedAt = performance.now();
  if (data.kind === "cancel") {
    if (!Number.isSafeInteger(data.requestId) || data.requestId <= lastCompletedRequest) return;
    cancelledRequests.add(data.requestId);
    if (activeRead && activeRead.id === data.requestId) activeRead.controller.abort();
    return;
  }
  if (data.kind === "release") { if (epoch) void request("release", {}, true).catch(() => {}); return; }
  queue = queue.then(async () => {
    try {
      if (cancelledRequests.has(data.id)) throw new DOMException("History request cancelled", "AbortError");
      if (["openReader", "sessions", "timeline", "select"].includes(data.kind)) activeRead = { id: data.id, controller: new AbortController() };
      const result = await handle(data); activeRead?.controller.signal.throwIfAborted();
      if (data.id) postMessage({ id: data.id, result });
    }
    catch (error) {
      if (data.kind === "capture" || data.kind === "init") { stopped = String(error); postMessage({ fatal: stopped }); }
      if (data.kind === "init") { clearInterval(heartbeat); if (epoch) await request("release").catch(() => {}); }
      if (data.id) postMessage({ id: data.id, error: String(error) });
    }
    finally { cancelledRequests.delete(data.id); if (Number.isSafeInteger(data.id)) lastCompletedRequest = Math.max(lastCompletedRequest, data.id); activeRead = undefined; }
  });
};
