import type { ContentRecord, RepositoryState } from "./types";
import type { ExternalTarget } from "./external-reference";

export type ResourceSource = Exclude<ExternalTarget["source"], { scope: "unknown" }>;
export function resourceSource(content: ContentRecord): ResourceSource | undefined {
  const scope = content.viewType === "document-block" ? "document" : content.viewType === "workspace-block" ? "workspace" : undefined;
  if (!scope) return;
  const metadata = content.payload.metadata as Record<string, unknown> | undefined;
  const resourceId = metadata?.[scope === "document" ? "documentId" : "workspaceId"] ?? content.payload.id;
  if (typeof resourceId !== "string" || !resourceId.trim()) throw new Error("Missing canonical resource identity");
  return { scope, resourceId };
}
export const sameResource = (a: ResourceSource, b: ResourceSource) => a.scope === b.scope && a.resourceId === b.resourceId;

/** Current loaded resources only. Never fetch, pick a first match, or adopt ownership. */
export function findResource(state: RepositoryState, source: ResourceSource): ContentRecord | undefined {
  const matches = Object.values(state.contents).filter(c => {
    if (c.viewType !== `${source.scope}-block`) return false;
    const metadata = c.payload.metadata as Record<string, unknown> | undefined;
    const id = metadata?.[source.scope === "document" ? "documentId" : "workspaceId"] ?? c.payload.id;
    return id === source.resourceId;
  });
  if (matches.length > 1) throw new Error("Ambiguous canonical resource identity");
  return matches[0];
}

// Structural ownership only; reference occurrences never become parents.
// Cache is revision-bound and weakly held. No observer or input dispatch hook.
const cache = new WeakMap<RepositoryState, { revision: number; owners: Map<string, Set<string>> }>();
export function resourceOwner(state: RepositoryState, contentKey: string): ContentRecord | undefined {
  let index = cache.get(state);
  if (!index || index.revision !== state.revision) {
    const owners = new Map<string, Set<string>>();
    for (const c of Object.values(state.contents)) for (const key of [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)]) {
      const p = state.placements[key]; if (!p || p.kind === "reference") continue;
      const parents = owners.get(p.contentKey) ?? new Set<string>(); parents.add(c.key); owners.set(p.contentKey, parents);
    }
    index = { revision: state.revision, owners }; cache.set(state, index);
  }
  const walk = (key: string, seen = new Set<string>()): ContentRecord | undefined => {
    if (seen.has(key)) throw new Error("Cyclic canonical ownership");
    seen.add(key);
    const c = state.contents[key]; if (!c) return;
    if (c.viewType === "document-block" || c.viewType === "workspace-block") {
      const metadata = c.payload.metadata as Record<string, unknown> | undefined;
      const id = metadata?.[c.viewType === "document-block" ? "documentId" : "workspaceId"] ?? c.payload.id;
      // Legacy identity-less roots still support local editing. Creating a
      // durable cross-resource descriptor requires resourceSource separately.
      if (typeof id === "string" && id.trim() && findResource(state, resourceSource(c)!)?.key !== key) throw new Error("Ambiguous canonical resource identity");
      return c;
    }
    const parents = index!.owners.get(key) ?? new Set<string>();
    if (parents.size > 1) throw new Error("Ambiguous canonical content ownership");
    const structural = parents.size ? walk([...parents][0], seen) : undefined;
    if (c.definitionOwnerKey) {
      const declared = state.contents[c.definitionOwnerKey];
      if (declared?.viewType !== "document-block" || structural && structural.key !== declared.key) throw new Error("Conflicting definition ownership");
      findResource(state, resourceSource(declared)!);
      return declared;
    }
    return structural;
  };
  return walk(contentKey);
}
