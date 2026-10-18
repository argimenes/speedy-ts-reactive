import type { RepositoryOperation, RepositoryState, RecordBatch } from './types';

type RecordOperation = Exclude<RepositoryOperation, RecordBatch>;
/** Compatibility view for record-oriented validators and observers. This streams
 * records; it never allocates or retains a per-cell operation array. History and
 * repository application retain the original bulk operation. */
export function* recordOperations(operations: readonly RepositoryOperation[]): Generator<RecordOperation> {
  for (const op of operations) {
    if (op.kind !== 'record-batch') { yield op; continue; }
    for (const key in op.contents) {
      const record = op.contents[key];
      yield record ? { kind: 'put-content', record } : { kind: 'remove-content', key };
    }
    for (const key in op.placements) {
      const record = op.placements[key];
      yield record ? { kind: 'put-placement', record } : { kind: 'remove-placement', key };
    }
  }
}

export function diffRecordBatch(before: RepositoryState, after: RepositoryState): RecordBatch {
  const batch: RecordBatch = { kind: 'record-batch', contents: {}, placements: {} };
  if (before.rootPlacementKey !== after.rootPlacementKey) throw Error('A subtree edit cannot replace the repository root.');
  for (const table of ['contents', 'placements'] as const) {
    const changes = batch[table] as Record<string, unknown>;
    for (const key in before[table]) if (!after[table][key]) changes[key] = null;
    for (const key in after[table]) {
      const value = after[table][key], previous = before[table][key];
      if (previous !== value && (!previous || JSON.stringify(previous) !== JSON.stringify(value))) changes[key] = value;
    }
  }
  return batch;
}
