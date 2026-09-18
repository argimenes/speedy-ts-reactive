/** Shared exact native verification; no mutable state or worker effects. */
import { DURABLE_LIMITS, affectedBlockIds, applyDurableTransitionSized, decodeDurableWire,
  decodeHistoryDocument, encodeDurableWire, encodeHistoryDocument } from '../src/history/durable-core';
import { validateResource, type ResourceSnapshot, type ResourceTransition } from '../src/history/stage-c-gates/resource';

export function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`History verification: ${message}`); }
export const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
export function checkedBaseline(wire: string, resourceId?: string): { state: ResourceSnapshot; byteLength: number } {
  check(typeof wire === 'string' && bytes(wire) <= DURABLE_LIMITS.supportedStateBytes, 'checkpoint byte limit');
  const state = decodeDurableWire(wire) as ResourceSnapshot;
  validateResource(state);
  check(!resourceId || state.resourceId === resourceId, 'resource identity mismatch');
  check(Object.keys(state.contents).length + Object.keys(state.placements).length <= DURABLE_LIMITS.maxGraphRecords, 'checkpoint graph limit');
  return { state, byteLength: bytes(wire) };
}
export function checkedEvent(wire: string, resourceId: string): ResourceTransition {
  check(typeof wire === 'string' && bytes(wire) <= DURABLE_LIMITS.recordBytes, 'record byte limit');
  const event = decodeDurableWire(wire) as ResourceTransition;
  check(event && event.format === 'codex-resource-transition-gate' && event.resourceId === resourceId &&
    typeof event.commitId === 'string' && !!event.commitId && typeof event.timestamp === 'string' &&
    typeof event.label === 'string' && event.cause && ['edit', 'undo', 'redo'].includes(event.cause.kind) &&
    Array.isArray(event.contents) && Array.isArray(event.placements) && Array.isArray(event.commands), 'invalid transition envelope');
  return event;
}
export function applySized(working: { state: ResourceSnapshot; byteLength: number }, event: ResourceTransition): void {
  working.byteLength = applyDurableTransitionSized(working.state, event, working.byteLength);
}
export function reconstruct(request: { checkpointWire: string; records: string[]; resourceId?: string }) {
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
