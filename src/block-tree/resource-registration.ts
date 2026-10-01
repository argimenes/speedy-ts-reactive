import type { RepositoryState, PlacementRecord } from "./types";
import { resourceOwner, resourceSource, findResource } from "./resource-identity";
import type { ExternalTarget } from "./external-reference";

export function isOwnedResourceTarget(target: ExternalTarget): boolean {
  return target.kind === "block" && target.source.scope === "document" && target.version.kind === "unpinned" &&
    target.targetPlacementId === undefined && target.targetRoute === undefined;
}

/** A registration selects a canonical mount root, never a semantic owner. */
export function documentRootPlacements(state: RepositoryState, contentKey: string): PlacementRecord[] {
  return selectDocumentRootPlacements(Object.values(state.placements), contentKey);
}

/** Pure root precedence shared by enumeration and maintained incoming evidence.
 * Callers must supply complete candidates; registration never establishes ownership. */
export function selectDocumentRootPlacements(candidates: readonly PlacementRecord[], contentKey: string): PlacementRecord[] {
  const registered: PlacementRecord[] = [], owned: PlacementRecord[] = [];
  for (const p of candidates) {
    const role = documentRootRole(p, contentKey);
    if (role === 'registration') registered.push(p);
    else if (role === 'owned') owned.push(p);
  }
  return registered.length ? registered : owned;
}

/** Shared root predicate; precedence belongs to the complete candidate set. */
export function documentRootRole(p: PlacementRecord, contentKey: string): 'registration' | 'owned' | undefined {
  if (p.externalReference || p.contentKey !== contentKey) return;
  if (p.resourceRegistration) return 'registration';
  if (p.kind === 'owned') return 'owned';
}

/** Derived evidence only. An absent entry means owner UNKNOWN, not unowned. */
export function resourceOwnership(state: RepositoryState): Map<string, { owner: string; placement: string }> {
  const claims = new Map<string, { owner: string; placement: string }>();
  const claim = (target: string, owner: string, placement: string) => {
    if (claims.has(target)) throw new Error("Resource has multiple semantic owners");
    claims.set(target, { owner, placement });
  };
  for (const c of Object.values(state.contents)) for (const key of [...c.children, ...Object.values(c.ownedRelations)]) {
    const p = state.placements[key]; if (!p || p.kind !== "owned" || p.resourceRegistration) continue;
    const external = p.externalReference ?? p.resolvedReference;
    const child = state.contents[p.contentKey];
    if (!external && child?.viewType !== "document-block") continue;
    const owner = resourceOwner(state, c.key);
    if (owner?.viewType !== "document-block") {
      if (external) throw new Error("Owned resource edge requires a Document resource owner");
      continue; // Legacy storage/presentation containment grants no resource owner.
    }
    const source = resourceSource(owner)!;
    if (external) {
      if (!isOwnedResourceTarget(external) || external.source.scope !== "document") throw new Error("Invalid owned resource target");
      const loaded = findResource(state, external.source);
      if (loaded && loaded.payload.id !== external.targetId) throw new Error("Owned target is not the Document resource root");
      claim(external.source.resourceId, source.resourceId, key);
    } else claim(resourceSource(child)!.resourceId, source.resourceId, key);
  }
  for (const target of claims.keys()) {
    const seen = new Set<string>(); let current: string | undefined = target;
    while (current !== undefined) {
      if (seen.has(current)) throw new Error("Resource ownership cycle");
      seen.add(current); current = claims.get(current)?.owner;
    }
  }
  return claims;
}

export function validateResourceRegistrations(state: RepositoryState): void {
  const registrations = new Set<string>();
  for (const p of Object.values(state.placements)) {
    if (p.resourceRegistration === undefined) continue;
    const target = state.contents[p.contentKey];
    const bank = Object.values(state.contents).find(c => c.children.includes(p.key));
    if (p.resourceRegistration !== true || p.kind !== "reference" || p.externalReference || p.resolvedReference ||
        target?.viewType !== "document-block" || bank?.viewType !== "workspace-object-bank-block" || registrations.has(p.contentKey)) {
      throw new Error("Invalid or duplicate resource registration");
    }
    findResource(state, resourceSource(target)!); registrations.add(p.contentKey);
  }
  resourceOwnership(state);
}
