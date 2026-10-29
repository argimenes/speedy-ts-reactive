import type { RepositoryOperation, RepositoryState } from './types';

/** Prove a completion-only change locally. No structural or annotation changes. */
export function taskStateChangeFor(state: RepositoryState, operations: RepositoryOperation[]): string | undefined {
  if (operations.length !== 1 || operations[0].kind !== 'put-content') return;
  const next = operations[0].record, before = state.contents[next.key];
  if (!before || !['standoff-editor-block', 'container-block', 'checkbox-block'].includes(before.viewType)) return;
  if (next.payload.checked !== undefined && typeof next.payload.checked !== 'boolean') return;
  const withoutState = (record: typeof next) => {
    const { revision, payload: { checked, ...payload }, ...rest } = record;
    return JSON.stringify({ ...rest, payload });
  };
  return withoutState(before) === withoutState(next) ? next.key : undefined;
}
