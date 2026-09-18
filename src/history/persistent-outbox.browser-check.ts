import { PersistentHistoryOutbox, type PendingHistoryRecord, type HistoryDurableAcknowledgement } from "./persistent-outbox";

const enrollment = { resourceId: "resource", memoirId: "memoir", segmentId: "segment", enrollmentId: "enrollment", writerEpoch: "epoch" };
const bounds = { maxRecordBytes: 64, maxPendingBytes: 96, maxRecords: 3 };
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function same(actual: unknown, expected: unknown, message: string) { assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`); }
async function rejects(work: () => Promise<unknown>, message: string) {
  try { await work(); } catch { return; }
  throw new Error(`Expected rejection: ${message}`);
}
const ack = (record: PendingHistoryRecord, verifiedThrough = record.sequence): HistoryDurableAcknowledgement => ({
  enrollment: record.enrollment, sequence: record.sequence, recordId: record.recordId, sha256: record.sha256, verifiedThrough,
});

/** Browser checks use a real strict IndexedDB implementation, not a mock. */
export async function beforeReload() {
  const outbox = await PersistentHistoryOutbox.open("outbox-recovery", enrollment, bounds);
  const first = { sequence: 1, recordId: "first", wire: '{"unicode":"λ","ordered":[2,1]}' };
  const capture = outbox.enqueue(first);
  first.wire = "changed after enqueue";
  const status = await capture;
  assert(status.browserCommitted === 1 && status.serverDurable === 0 && status.verified === 0, "capture is only browser committed");
  let accepted!: PendingHistoryRecord;
  await rejects(() => outbox.deliverNext(async record => { accepted = record; throw new Error("server accepted, acknowledgement was lost"); }), "lost acknowledgement");
  assert(accepted.wire === '{"unicode":"λ","ordered":[2,1]}', "caller mutation changed stored bytes");
  assert(Object.isFrozen(accepted) && Object.isFrozen(accepted.enrollment), "transport packet is mutable");
  same(await outbox.status(), status, "lost acknowledgement removed bytes or advanced watermarks");
  await outbox.enqueue({ sequence: 2, recordId: "second", wire: "second bytes" });
  await rejects(() => outbox.enqueue({ sequence: 4, recordId: "gap", wire: "gap" }), "sequence gap");
  await rejects(() => outbox.enqueue({ sequence: 1, recordId: "first", wire: "different bytes" }), "different retry");
  outbox.close();
  return { accepted, expected: { browserCommitted: 2, serverDurable: 0, verified: 0, pendingCount: 2, pendingBytes: status.pendingBytes + 12 } };
}

export async function afterReload(previous: Awaited<ReturnType<typeof beforeReload>>) {
  await rejects(() => PersistentHistoryOutbox.open("outbox-recovery", { ...enrollment, enrollmentId: "wrong" }, bounds), "reopen wrong enrollment");
  const outbox = await PersistentHistoryOutbox.open("outbox-recovery", enrollment, bounds);
  same(await outbox.status(), previous.expected, "pending recovery after page reload");
  for (const invalid of [
    { ...ack(previous.accepted), sequence: 2 },
    { ...ack(previous.accepted), recordId: "wrong" },
    { ...ack(previous.accepted), sha256: "wrong" },
    { ...ack(previous.accepted), enrollment: { ...enrollment, writerEpoch: "stale" } },
    { ...ack(previous.accepted), verifiedThrough: 2 },
  ]) {
    await rejects(() => outbox.deliverNext(async () => invalid), "incorrect acknowledgement");
    same(await outbox.status(), previous.expected, "invalid acknowledgement changed state");
  }
  const unverified = await outbox.deliverNext(async record => {
    same(record, previous.accepted, "retry differs from packet accepted before reload");
    return ack(record, 0);
  });
  assert(unverified.serverDurable === 1 && unverified.verified === 0 && unverified.pendingCount === 1 && unverified.pendingBytes === 12, "durability/verification separation");
  await outbox.acknowledgeVerification(ack(previous.accepted));
  await rejects(() => outbox.acknowledgeVerification(ack(previous.accepted, 0)), "verification regression");
  await outbox.enqueue({ sequence: 1, recordId: "first", wire: previous.accepted.wire });
  let second: PendingHistoryRecord | undefined;
  const delivered = outbox.deliverNext(async record => { second = record; return ack(record); });
  assert(outbox.deliverNext(async () => { throw new Error("duplicate local delivery"); }) === delivered, "concurrent delivery was not coalesced");
  const empty = await delivered;
  same(empty, { browserCommitted: 2, serverDurable: 2, verified: 2, pendingCount: 0, pendingBytes: 0 }, "empty outbox");
  assert(second?.recordId === "second", "record order changed");
  await rejects(() => outbox.enqueue({ sequence: 3, recordId: "first", wire: "duplicate id" }), "duplicate record ID");
  same(await outbox.status(), empty, "unique identity failure was not atomic");
  await rejects(() => outbox.enqueue({ sequence: 3, recordId: "oversized", wire: "λ".repeat(40) }), "UTF-8 byte bound");
  await rejects(() => outbox.enqueue({ sequence: 3, recordId: "surrogate", wire: "\ud800" }), "ambiguous UTF-8 encoding");
  await outbox.enqueue({ sequence: 3, recordId: "third", wire: "x".repeat(64) });
  await rejects(() => outbox.enqueue({ sequence: 4, recordId: "fourth", wire: "x" }), "finite enrollment bound");
  outbox.close();
  const reopened = await PersistentHistoryOutbox.open("outbox-recovery", enrollment, bounds);
  same(await reopened.status(), { browserCommitted: 3, serverDurable: 2, verified: 2, pendingCount: 1, pendingBytes: 64 }, "ack receipt and pending bytes survived reopen");
  await reopened.deliverNext(async record => ack(record));
  reopened.close();
  const capacity = await PersistentHistoryOutbox.open("outbox-capacity", enrollment, bounds);
  await capacity.enqueue({ sequence: 1, recordId: "one", wire: "x".repeat(64) });
  const full = await capacity.status();
  await rejects(() => capacity.enqueue({ sequence: 2, recordId: "two", wire: "y".repeat(33) }), "pending byte capacity");
  same(await capacity.status(), full, "capacity failure pruned or changed history");
  capacity.close();
  return { passed: true, checks: ["strict browser commit", "immutable bytes", "page reload recovery", "lost ack exact retry", "identity/order/epoch rejection",
    "separate durable and verified watermarks", "atomic ack and byte release", "unique record identity", "coalesced delivery", "UTF-8 and finite capacity", "no pruning"] };
}
