/** G1 bridge: use the actual repository/commands and undo, never a second editor. */
import { clone } from "../../block-tree/clone";
import type { DeepReadonly } from "../../block-tree/commit-capture";
import { createContentKey } from "../../block-tree/ids";
import { CanonicalRepository } from "../../block-tree/repository";
import type { RepositoryState } from "../../block-tree/types";
import { projectOwned, type ResourceSnapshot } from "./resource";

export function openGateEditor(snapshot: DeepReadonly<ResourceSnapshot>) {
  const state: RepositoryState = { rootPlacementKey: snapshot.rootPlacementKey, revision: snapshot.revision,
    contents: clone(snapshot.contents) as RepositoryState["contents"], placements: Object.create(null) };
  const owners = new Map(Object.keys(state.contents).map(key => [key, snapshot.resourceId]));
  const placementIds = new Map<string, string>();
  for (const [key, p] of Object.entries(snapshot.placements)) {
    placementIds.set(key, p.placementId);
    state.placements[key] = p.target.kind === "local" ? { key, kind: p.kind, contentKey: p.target.contentKey }
      : { key, kind: "reference", contentKey: createContentKey(), externalReference: clone(p.target.reference) };
  }
  const repository = new CanonicalRepository(state, { enforceBlockIdentity: true });
  const errors: unknown[] = [];
  const stop = repository.subscribeHistoryChanges(event => {
    for (const c of event.contents) owners.set(c.key, snapshot.resourceId);
    for (const p of event.placements) if (p.after && !placementIds.has(p.key)) {
      placementIds.set(p.key, p.after.kind === "inline" ? `private-cell:${p.key}` : crypto.randomUUID());
    }
  }, error => errors.push(error));
  const root = state.placements[state.rootPlacementKey];
  return { repository, errors, stop, placementIds,
    snapshot: () => projectOwned(repository.snapshot(), snapshot.resourceId,
      { contents: owners, placementIds, externalTargets: new Map(), root: { key: state.rootPlacementKey, contentKey: root.contentKey, placementId: placementIds.get(root.key)! } },
      repository.readState().revision),
  };
}
