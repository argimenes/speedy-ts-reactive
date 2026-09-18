/**
 * Bounded, opt-in browser outbox for one explicit history enrollment.
 * This module neither enrolls an editor nor promises native-server durability.
 * The transport must publish verified prerequisites and append with fencing and
 * exact retry/deduplication before returning a durable acknowledgement.
 * Verification is a separate watermark, asserted only by the native server.
 */
export interface HistoryEnrollment {
  readonly resourceId: string;
  readonly memoirId: string;
  readonly segmentId: string;
  readonly enrollmentId: string;
  readonly writerEpoch: string;
}

export interface HistoryOutboxBounds {
  readonly maxRecordBytes: number;
  readonly maxPendingBytes: number;
  readonly maxRecords: number;
}

export interface HistoryOutboxStatus {
  readonly browserCommitted: number;
  readonly serverDurable: number;
  readonly verified: number;
  readonly pendingCount: number;
  readonly pendingBytes: number;
}

export interface PendingHistoryRecord {
  readonly enrollment: HistoryEnrollment;
  readonly sequence: number;
  readonly recordId: string;
  readonly wire: string;
  readonly sha256: string;
}

export interface HistoryDurableAcknowledgement {
  readonly enrollment: HistoryEnrollment;
  readonly sequence: number;
  readonly recordId: string;
  readonly sha256: string;
  /** Exact, contiguous server-verified prefix; never greater than sequence. */
  readonly verifiedThrough: number;
}

export type HistoryOutboxTransport = (record: PendingHistoryRecord) => Promise<HistoryDurableAcknowledgement>;

interface Ledger extends HistoryOutboxStatus {
  version: 1;
  enrollment: HistoryEnrollment;
  bounds: HistoryOutboxBounds;
}
interface StoredRecord {
  sequence: number;
  recordId: string;
  sha256: string;
  bytes: number;
  // Acknowledged receipts retain identity/hash, but no content. The total
  // enrollment record limit also bounds these receipts; no history is pruned.
  wire?: string;
}

const defaults: HistoryOutboxBounds = { maxRecordBytes: 100 * 1024, maxPendingBytes: 16 * 1024 * 1024, maxRecords: 4096 };
const identityKeys = ["resourceId", "memoirId", "segmentId", "enrollmentId", "writerEpoch"] as const;
const boundsKeys = ["maxRecordBytes", "maxPendingBytes", "maxRecords"] as const;
function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`History outbox: ${message}`);
}
function sameEnrollment(a: HistoryEnrollment | undefined, b: HistoryEnrollment) {
  return !!a && identityKeys.every(key => a[key] === b[key]);
}
function watermark(value: number) { return Number.isSafeInteger(value) && value >= 0; }
function readStatus(ledger: Ledger): HistoryOutboxStatus {
  return Object.freeze({ browserCommitted: ledger.browserCommitted, serverDurable: ledger.serverDurable,
    verified: ledger.verified, pendingCount: ledger.pendingCount, pendingBytes: ledger.pendingBytes });
}
async function digest(wire: string) {
  const bytes = new TextEncoder().encode(wire);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return { bytes: bytes.length, sha256: Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("") };
}

export class PersistentHistoryOutbox {
  private delivery?: Promise<HistoryOutboxStatus>;

  private constructor(private readonly db: IDBDatabase, readonly enrollment: HistoryEnrollment, readonly bounds: HistoryOutboxBounds) {}

  static async open(databaseName: string, enrollment: HistoryEnrollment, bounds: HistoryOutboxBounds = defaults) {
    requireCondition(databaseName.length > 0, "database name is required");
    requireCondition(identityKeys.every(key => typeof enrollment[key] === "string" && enrollment[key].length > 0 && enrollment[key].length <= 1024), "invalid enrollment identity");
    requireCondition(boundsKeys.every(key => Number.isSafeInteger(bounds[key]) && bounds[key] > 0 && bounds[key] <= defaults[key]), "bounds must be positive and within the supported finite range");
    requireCondition(bounds.maxRecordBytes <= bounds.maxPendingBytes, "record bound exceeds pending byte bound");
    const identity = Object.freeze(Object.fromEntries(identityKeys.map(key => [key, enrollment[key]]))) as unknown as HistoryEnrollment;
    const limits = Object.freeze({ ...bounds });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("meta");
        request.result.createObjectStore("records", { keyPath: "sequence" }).createIndex("recordId", "recordId", { unique: true });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("History outbox: database upgrade blocked"));
    });
    db.onversionchange = () => db.close();
    const outbox = new PersistentHistoryOutbox(db, identity, limits);
    try {
      await outbox.transaction("readwrite", (tx, guard) => {
        const meta = tx.objectStore("meta"), request = meta.get("ledger");
        request.onsuccess = guard(() => {
          if (request.result === undefined) {
            meta.add({ version: 1, enrollment: identity, bounds: limits, browserCommitted: 0, serverDurable: 0,
              verified: 0, pendingCount: 0, pendingBytes: 0 } satisfies Ledger, "ledger");
          } else outbox.validateLedger(request.result);
        });
      });
      await outbox.checkRecovery();
      return outbox;
    } catch (error) { db.close(); throw error; }
  }

  /** Resolves only after a strict transaction commits. A retry must be identical. */
  async enqueue(input: { sequence: number; recordId: string; wire: string }): Promise<HistoryOutboxStatus> {
    // Copy inputs before asynchronous hashing; caller mutation cannot change bytes.
    const { sequence, recordId, wire } = input;
    requireCondition(watermark(sequence) && sequence > 0, "invalid sequence");
    requireCondition(typeof recordId === "string" && recordId.length > 0 && recordId.length <= 1024, "invalid record identity");
    requireCondition(typeof wire === "string" && wire.length <= this.bounds.maxRecordBytes, "record exceeds byte bound");
    requireCondition(wire.isWellFormed(), "wire contains an unpaired Unicode surrogate");
    const hashed = await digest(wire);
    requireCondition(hashed.bytes <= this.bounds.maxRecordBytes, "record exceeds byte bound");
    let status!: HistoryOutboxStatus;
    await this.transaction("readwrite", (tx, guard) => {
      const meta = tx.objectStore("meta"), records = tx.objectStore("records"), request = meta.get("ledger");
      request.onsuccess = guard(() => {
        const ledger = this.validateLedger(request.result);
        const existing = records.get(sequence);
        existing.onsuccess = guard(() => {
          const previous: StoredRecord | undefined = existing.result;
          if (previous) {
            requireCondition(previous.recordId === recordId && previous.sha256 === hashed.sha256 && previous.bytes === hashed.bytes &&
              (previous.wire === undefined || previous.wire === wire), "retry identity or bytes differ");
          } else {
            requireCondition(sequence === ledger.browserCommitted + 1, "enqueue is not the next sequence");
            requireCondition(sequence <= this.bounds.maxRecords, "enrollment record bound reached");
            requireCondition(ledger.pendingBytes + hashed.bytes <= this.bounds.maxPendingBytes, "pending byte bound reached");
            records.add({ sequence, recordId, wire, ...hashed } satisfies StoredRecord);
            meta.put({ ...ledger, browserCommitted: sequence, pendingCount: ledger.pendingCount + 1, pendingBytes: ledger.pendingBytes + hashed.bytes }, "ledger");
            status = readStatus({ ...ledger, browserCommitted: sequence, pendingCount: ledger.pendingCount + 1, pendingBytes: ledger.pendingBytes + hashed.bytes });
          }
          status ??= readStatus(ledger);
        });
      });
    });
    return status;
  }

  /** One bounded attempt; a transport failure retains the exact pending bytes. */
  deliverNext(transport: HistoryOutboxTransport): Promise<HistoryOutboxStatus> {
    if (this.delivery) return this.delivery;
    this.delivery = this.deliver(transport).finally(() => { this.delivery = undefined; });
    return this.delivery;
  }

  async status(): Promise<HistoryOutboxStatus> {
    let status!: HistoryOutboxStatus;
    await this.transaction("readonly", (tx, guard) => {
      const request = tx.objectStore("meta").get("ledger");
      request.onsuccess = guard(() => { status = readStatus(this.validateLedger(request.result)); });
    });
    return status;
  }

  /** A later server verification response may advance verification after append. */
  async acknowledgeVerification(acknowledgement: HistoryDurableAcknowledgement): Promise<HistoryOutboxStatus> {
    return this.commitAcknowledgement(acknowledgement, false);
  }

  close() { this.db.close(); }

  private async deliver(transport: HistoryOutboxTransport) {
    let record: StoredRecord | undefined;
    await this.transaction("readonly", (tx, guard) => {
      const request = tx.objectStore("meta").get("ledger");
      request.onsuccess = guard(() => {
        const ledger = this.validateLedger(request.result);
        if (!ledger.pendingCount) return;
        const next = tx.objectStore("records").get(ledger.serverDurable + 1);
        next.onsuccess = guard(() => { record = next.result; requireCondition(record?.wire !== undefined, "missing pending bytes"); });
      });
    });
    if (!record) return this.status();
    const packet = Object.freeze({ enrollment: this.enrollment, sequence: record.sequence,
      recordId: record.recordId, wire: record.wire!, sha256: record.sha256 });
    const acknowledgement = await transport(packet);
    requireCondition(acknowledgement.sequence === packet.sequence && acknowledgement.recordId === packet.recordId &&
      acknowledgement.sha256 === packet.sha256, "acknowledgement does not match the submitted record");
    return this.commitAcknowledgement(acknowledgement, true);
  }

  private async commitAcknowledgement(input: HistoryDurableAcknowledgement, append: boolean) {
    const ack = { ...input, enrollment: { ...input.enrollment } };
    requireCondition(sameEnrollment(ack.enrollment, this.enrollment), "acknowledgement enrollment mismatch");
    requireCondition(watermark(ack.sequence) && ack.sequence > 0 && watermark(ack.verifiedThrough) && ack.verifiedThrough <= ack.sequence, "invalid acknowledgement watermarks");
    let status!: HistoryOutboxStatus;
    await this.transaction("readwrite", (tx, guard) => {
      const meta = tx.objectStore("meta"), records = tx.objectStore("records"), request = meta.get("ledger");
      request.onsuccess = guard(() => {
        const ledger = this.validateLedger(request.result);
        requireCondition(ack.verifiedThrough >= ledger.verified, "verification watermark regressed");
        requireCondition(append ? ack.sequence === ledger.serverDurable + 1 || ack.sequence === ledger.serverDurable : ack.sequence <= ledger.serverDurable,
          "acknowledgement is not the next durable sequence");
        const lookup = records.get(ack.sequence);
        lookup.onsuccess = guard(() => {
          const record: StoredRecord | undefined = lookup.result;
          requireCondition(record && record.recordId === ack.recordId && record.sha256 === ack.sha256, "acknowledgement identity mismatch");
          const fresh = append && ack.sequence > ledger.serverDurable;
          requireCondition(!fresh || record.wire !== undefined, "missing unacknowledged bytes");
          const next: Ledger = { ...ledger, serverDurable: fresh ? ack.sequence : ledger.serverDurable,
            verified: ack.verifiedThrough, pendingCount: ledger.pendingCount - (fresh ? 1 : 0), pendingBytes: ledger.pendingBytes - (fresh ? record.bytes : 0) };
          if (fresh) { const { wire: _wire, ...receipt } = record; records.put(receipt); }
          meta.put(next, "ledger");
          status = readStatus(next);
        });
      });
    });
    return status;
  }

  private validateLedger(value: Ledger): Ledger {
    requireCondition(value?.version === 1 && sameEnrollment(value.enrollment, this.enrollment), "stored enrollment or version mismatch");
    requireCondition(boundsKeys.every(key => value.bounds?.[key] === this.bounds[key]), "stored bounds mismatch");
    requireCondition([value.browserCommitted, value.serverDurable, value.verified, value.pendingCount, value.pendingBytes].every(watermark) &&
      value.verified <= value.serverDurable && value.serverDurable <= value.browserCommitted && value.browserCommitted <= this.bounds.maxRecords &&
      value.pendingCount === value.browserCommitted - value.serverDurable && value.pendingBytes <= this.bounds.maxPendingBytes, "invalid stored watermarks");
    return value;
  }

  private async checkRecovery() {
    let ledger!: Ledger;
    const records: StoredRecord[] = [];
    await this.transaction("readonly", (tx, guard) => {
      const meta = tx.objectStore("meta").get("ledger");
      meta.onsuccess = guard(() => { ledger = this.validateLedger(meta.result); });
      const cursor = tx.objectStore("records").openCursor();
      cursor.onsuccess = guard(() => {
        const row = cursor.result;
        if (!row) return;
        requireCondition(records.length < this.bounds.maxRecords, "stored record bound exceeded");
        requireCondition(row.key === row.value.sequence, "stored sequence mismatch");
        records.push(row.value); row.continue();
      });
    });
    requireCondition(records.length === ledger.browserCommitted, "stored record count mismatch");
    let bytes = 0;
    for (const [index, record] of records.entries()) {
      requireCondition(record.sequence === index + 1 && typeof record.recordId === "string" && record.recordId.length > 0 && record.recordId.length <= 1024 &&
        /^[a-f0-9]{64}$/.test(record.sha256) && watermark(record.bytes) && record.bytes <= this.bounds.maxRecordBytes, "invalid stored receipt");
      if (record.sequence <= ledger.serverDurable) requireCondition(record.wire === undefined, "acknowledged content was not released");
      else {
        requireCondition(typeof record.wire === "string" && record.wire.length <= this.bounds.maxRecordBytes, "missing or oversized recovery bytes");
        const hash = await digest(record.wire);
        requireCondition(hash.bytes === record.bytes && hash.sha256 === record.sha256, "recovery bytes differ from identity");
        bytes += record.bytes;
      }
    }
    requireCondition(bytes === ledger.pendingBytes, "stored byte ledger mismatch");
  }

  /** Guard request callbacks so validation exceptions always abort atomically. */
  private transaction(mode: IDBTransactionMode, work: (tx: IDBTransaction, guard: (callback: () => void) => () => void) => void) {
    return new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction(["meta", "records"], mode, { durability: "strict" });
      let failure: unknown;
      const guard = (callback: () => void) => () => {
        try { callback(); } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error("History outbox: transaction aborted"));
      guard(() => {
        requireCondition(mode !== "readwrite" || tx.durability === "strict", "strict IndexedDB durability is unavailable");
        work(tx, guard);
      })();
    });
  }
}
