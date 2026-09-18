/** Isolated semantic verification. Every request is self-contained and bounded;
 * no mutable working state survives a request or authorizes a future append. */
import { parentPort } from 'node:worker_threads';
import { clone } from '../src/block-tree/clone';
import { equal } from '../src/block-tree/commit-capture';
import { DURABLE_LIMITS, affectedBlockIds, applyDurableTransitionSized, decodeDurableWire,
  decodeHistoryDocument, encodeDurableWire, encodeHistoryDocument } from '../src/history/durable-core';
import { validateResource, type ResourceSnapshot, type ResourceTransition } from '../src/history/stage-c-gates/resource';

function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`History verification: ${message}`); }
const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
function checkedBaseline(wire: string, resourceId?: string): { state: ResourceSnapshot; byteLength: number } {
  check(typeof wire === 'string' && bytes(wire) <= DURABLE_LIMITS.supportedStateBytes, 'checkpoint byte limit');
  const state = decodeDurableWire(wire) as ResourceSnapshot;
  validateResource(state);
  check(!resourceId || state.resourceId === resourceId, 'resource identity mismatch');
  check(Object.keys(state.contents).length + Object.keys(state.placements).length <= DURABLE_LIMITS.maxGraphRecords, 'checkpoint graph limit');
  return { state, byteLength: bytes(wire) };
}
function checkedEvent(wire: string, resourceId: string): ResourceTransition {
  check(typeof wire === 'string' && bytes(wire) <= DURABLE_LIMITS.recordBytes, 'record byte limit');
  const event = decodeDurableWire(wire) as ResourceTransition;
  check(event && event.format === 'codex-resource-transition-gate' && event.resourceId === resourceId &&
    typeof event.commitId === 'string' && !!event.commitId && typeof event.timestamp === 'string' &&
    typeof event.label === 'string' && event.cause && ['edit', 'undo', 'redo'].includes(event.cause.kind) &&
    Array.isArray(event.contents) && Array.isArray(event.placements) && Array.isArray(event.commands), 'invalid transition envelope');
  return event;
}
function applySized(working: { state: ResourceSnapshot; byteLength: number }, event: ResourceTransition): void {
  working.byteLength = applyDurableTransitionSized(working.state, event, working.byteLength);
}
function reconstruct(request: { checkpointWire: string; records: string[]; resourceId?: string }) {
  check(Array.isArray(request.records) && request.records.length <= DURABLE_LIMITS.maxReadPath, 'checkpoint path distance');
  const working = checkedBaseline(request.checkpointWire, request.resourceId);
  let last: ResourceTransition | undefined;
  for (const wire of request.records) {
    const event = checkedEvent(wire, working.state.resourceId);
    if (last) check(event.sourceCounters.before === last.sourceCounters.after, 'noncontiguous source counter');
    applySized(working, event); last = event;
  }
  return { ...working, last };
}
function verify(method: string, request: any): unknown {
  if (method === 'baseline') {
    const baseline = checkedBaseline(request.wire, request.resourceId);
    check(baseline.state.revision === 0, 'enrollment baseline must start at local revision zero'); return;
  }
  if (method === 'portable') { decodeHistoryDocument(request.document); return; }
  if (method === 'append') {
    check(request.records.length < DURABLE_LIMITS.maxReadPath, 'append requires nearer checkpoint');
    const working = reconstruct(request), event = checkedEvent(request.wire, request.resourceId);
    check(Number.isSafeInteger(request.expectedSourceRevision) && request.expectedSourceRevision >= 0 &&
      event.sourceCounters.before === request.expectedSourceRevision, 'source counter differs from verified parent');
    if (working.last) check(event.sourceCounters.before === working.last.sourceCounters.after, 'noncontiguous source counter');
    // Preserve only changed record preimages; all other records are immutable
    // for this application and can be shared with the short-lived before view.
    const before: ResourceSnapshot = { ...working.state, contents: { ...working.state.contents }, placements: { ...working.state.placements } };
    for (const change of event.contents) if (before.contents[change.key]) before.contents[change.key] = clone(before.contents[change.key]);
    applySized(working, event);
    const result: any = { revisionId: event.commitId, metadata: { timestamp: event.timestamp, label: event.label,
      cause: event.cause.kind, affectedBlockIds: affectedBlockIds(before, working.state, event), sourceRevision: event.sourceCounters.after } };
    if (working.state.revision % DURABLE_LIMITS.checkpointDistance === 0) {
      result.checkpointWire = encodeDurableWire(working.state);
      check(bytes(result.checkpointWire) === working.byteLength, 'incremental byte accounting mismatch');
    }
    return result;
  }
  if (method === 'artifact') {
    const working = reconstruct(request);
    if (working.last) check(working.last.commitId === request.revisionId, 'artifact revision mismatch');
    decodeHistoryDocument(request.document);
    const expected = encodeHistoryDocument(working.state, request.memoirId, { segmentId: request.segmentId, revisionId: request.revisionId });
    // Display metadata is not authored state. It never enters the semantic body.
    const actual = { ...request.document }; delete actual.metadata;
    check(equal(actual, expected), 'saved artifact does not equal exact historical state/receipt');
    return;
  }
  throw new Error('Unknown history verification operation');
}
parentPort!.on('message', ({ id, method, request }) => {
  try { parentPort!.postMessage({ id, ok: true, result: verify(method, request) }); }
  catch (error) { parentPort!.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) }); }
});
