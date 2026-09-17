/** G1 bridge: use the actual repository/commands and undo, never a second editor. */
import { clone } from "../../block-tree/clone";
import type { DeepReadonly } from "../../block-tree/commit-capture";
import { createContentKey } from "../../block-tree/ids";
import { CanonicalRepository } from "../../block-tree/repository";
import { normalizeDefinitionOwnership } from "../../block-tree/definition-ownership";
import { deriveLocations } from "../../block-tree/repository";
import type { RepositoryOperation, RepositoryState } from "../../block-tree/types";
import { projectOwned, type OwnershipEvidence, type ResourceSnapshot } from "./resource";

export function openGateEditor(snapshot: DeepReadonly<ResourceSnapshot>) {
  const state: RepositoryState = { rootPlacementKey: snapshot.rootPlacementKey, revision: snapshot.revision,
    contents: clone(snapshot.contents) as RepositoryState["contents"], placements: Object.create(null) };
  const owners = new Map(Object.keys(state.contents).map(key => [key, snapshot.resourceId]));
  const resourceRoot = snapshot.placements[snapshot.rootPlacementKey];
  if (resourceRoot.target.kind !== "local") throw new Error("Document root must be local");
  for (const c of Object.values(state.contents)) {
    if (!["text-cell", "image-cell"].includes(c.viewType)) {
      c.definitionOwnerKey = resourceRoot.target.contentKey;
    }
  }
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

/** Bounded G1 Workspace admission with explicit evidence for each resource.
 * Cross-resource live pointers become terminal descriptors at normalization;
 * foreign incoming pointers therefore cannot decide an owner's edit policy. */
export function openGateWorkspace(initial: RepositoryState, resources: ReadonlyMap<string, OwnershipEvidence>) {
  const owners = new Map<string, string>();
  const resourceFor = new Map<string, string>();
  for (const [resourceId, evidence] of resources) for (const [key, owner] of evidence.contents) {
    if (owner !== resourceId) continue;
    if (resourceFor.has(key) && resourceFor.get(key) !== resourceId) throw new Error("Ambiguous resource ownership");
    resourceFor.set(key, resourceId); owners.set(key, evidence.root.contentKey);
  }
  const state = normalizeDefinitionOwnership(initial, owners);
  for (const [key, sourceId] of resourceFor) {
    const c = state.contents[key], evidence = resources.get(sourceId)!;
    for (const pk of [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)]) {
      const p = state.placements[pk];
      if (p.externalReference || resourceFor.get(p.contentKey) === sourceId) continue;
      const reference = evidence.externalTargets.get(pk);
      if (p.kind !== "reference" || !reference) throw new Error("Missing external ownership evidence");
      state.placements[pk] = { ...p, contentKey: createContentKey(), externalReference: clone(reference) };
    }
  }
  const repository = new CanonicalRepository(state, { enforceBlockIdentity: true });
  return { repository,
    snapshot: (resourceId: string, revision = 0) => projectOwned(repository.snapshot(), resourceId, resources.get(resourceId)!, revision),
    closeResource(resourceId: string) {
      const evidence = resources.get(resourceId);
      if (!evidence) throw new Error("Unknown resource");
      const current = repository.readState(), root = evidence.root.key;
      const location = deriveLocations(current).get(root);
      if (!location || location.slot.kind !== "children") throw new Error("Gate close requires a Workspace child Document");
      const owned = new Set<string>();
      for (const c of Object.values(current.contents)) if (c.definitionOwnerKey === evidence.root.contentKey) owned.add(c.key);
      // Cells follow their owned host, not a persistent Cell definition identity.
      for (const key of owned) for (const pk of current.contents[key].inlineContent) owned.add(current.placements[pk].contentKey);
      const placements = new Set([root]);
      for (const key of owned) for (const pk of [...current.contents[key].children, ...current.contents[key].inlineContent, ...Object.values(current.contents[key].ownedRelations)]) placements.add(pk);
      const parent = current.contents[location.ownerContentKey];
      const operations: RepositoryOperation[] = [{ kind: "put-content", record: { ...clone(parent), children: parent.children.filter(k => k !== root) } },
        ...[...placements].map(key => ({ kind: "remove-placement" as const, key })),
        ...[...owned].map(key => ({ kind: "remove-content" as const, key }))];
      // G1 tests ordinary inverse mechanics. Production P4 must end enrollment
      // before scope eviction and establish the specified reopen boundary.
      repository.commit("Close resource scope", operations);
    },
  };
}
