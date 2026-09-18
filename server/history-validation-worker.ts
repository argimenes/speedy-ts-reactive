/** Isolated semantic verification. Every request is self-contained and bounded;
 * no mutable working state survives a request or authorizes a future append. */
import { parentPort } from 'node:worker_threads';
import { clone } from '../src/block-tree/clone';
import { equal } from '../src/block-tree/commit-capture';
import { DURABLE_LIMITS, affectedBlockIds, applyDurableTransitionSized, decodeDurableWire,
  decodeHistoryDocument, encodeDurableWire, encodeHistoryDocument } from '../src/history/durable-core';
import { validateResource, type ResourceSnapshot, type ResourceTransition } from '../src/history/stage-c-gates/resource';

import { check, bytes, checkedBaseline, checkedEvent, applySized, reconstruct } from "./history-verification";
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
    const result: any = { stateBytes: working.byteLength, revisionId: event.commitId, metadata: { timestamp: event.timestamp, label: event.label,
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
