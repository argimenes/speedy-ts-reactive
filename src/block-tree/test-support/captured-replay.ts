import { expect } from "vitest";
import { clone } from "../clone";
import { decodeDocument } from "../codecs";
import { TreeCommands } from "../commands";
import type { DeepReadonly, RepositoryCommitResult } from "../commit-capture";
import { applyBlockIdentityNormalization, planBlockIdentityNormalization } from "../identity";
import { OccurrenceIndex } from "../occurrences";
import { BlockTreeProjection } from "../projection";
import { CanonicalRepository, validateRepository } from "../repository";
import type { ExistingBlockDto, RepositoryState } from "../types";

/** Test oracle: assign recorded values, never execute the source commands again. */
export function applyCapturedCommitForTest(source: RepositoryState, event: DeepReadonly<RepositoryCommitResult>): RepositoryState {
  expect(source.revision).toBe(event.beforeRevision);
  expect(source.rootPlacementKey).toBe(event.root.before);
  const next = clone(source);
  for (const delta of event.contents) {
    expect(next.contents[delta.key] ?? null).toEqual(delta.before);
    if (delta.after === null) delete next.contents[delta.key];
    else next.contents[delta.key] = clone(delta.after) as RepositoryState["contents"][string];
  }
  for (const delta of event.placements) {
    expect(next.placements[delta.key] ?? null).toEqual(delta.before);
    if (delta.after === null) delete next.placements[delta.key];
    else next.placements[delta.key] = clone(delta.after);
  }
  next.rootPlacementKey = event.root.after;
  next.revision = event.afterRevision;
  validateRepository(next);
  return next;
}

export function setupCaptureSpike(dto: ExistingBlockDto = { type: "document-block", children: [
  { id: "p", type: "standoff-editor-block", text: "abcdef", standoffProperties: [] },
  { id: "q", type: "standoff-editor-block", text: "other" },
] }) {
  const decoded = decodeDocument(dto).state;
  const normalization = planBlockIdentityNormalization(decoded);
  const baseline = applyBlockIdentityNormalization(decoded, normalization);
  const repository = new CanonicalRepository(baseline, { enforceBlockIdentity: true });
  const occurrences = new OccurrenceIndex();
  const commands = new TreeCommands(repository, key => occurrences.resolve(key));
  const view = new BlockTreeProjection(repository, "spike", occurrences);
  const events: DeepReadonly<RepositoryCommitResult>[] = [];
  const errors: unknown[] = [];
  const unsubscribe = repository.subscribeCommits(event => events.push(event), error => errors.push(error));
  const block = (id: string) => Object.values(view.state.nodes).find(node => node.payload.id === id)!;
  return { baseline, normalization, repository, commands, view, block, events, errors, unsubscribe };
}
