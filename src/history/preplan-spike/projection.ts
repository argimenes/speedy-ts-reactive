/** Whole-state oracle for resource projection. Intentionally not a live recorder. */
import { clone } from "../../block-tree/clone";
import { equal } from "../../block-tree/commit-capture";
import { diffContent, type HistoryChanges } from "../../block-tree/compact-changes";
import { BlockIdentityIndex } from "../../block-tree/identity";
import { validateRepository } from "../../block-tree/repository";
import type { RepositoryState } from "../../block-tree/types";

export interface ProjectionContext {
  /** Synthetic resource roots are local archive symbols, not semantic Placement IDs. */
  roots: Map<string, string>;
  /** Explicit prior ownership evidence for otherwise unplaced records. No ID guessing. */
  unplacedOwners: Map<string, string>;
  suspended: Set<string>;
}
export function context(): ProjectionContext { return { roots: new Map(), unplacedOwners: new Map(), suspended: new Set() }; }
export function partition(state: RepositoryState, ctx: ProjectionContext) {
  validateRepository(state);
  const documents = new Map<string, string>(), owners = new Map<string, Set<string>>();
  for (const c of Object.values(state.contents)) if (c.viewType === "document-block") {
    const resource = (c.payload.metadata as any)?.documentId;
    if (typeof resource !== "string" || !resource || documents.has(resource)) throw new Error("Missing/duplicate resource identity");
    documents.set(resource, c.key);
  }
  const graphs = new Map<string, RepositoryState>();
  for (const [resource, rootContent] of documents) {
    if (!ctx.roots.has(resource)) ctx.roots.set(resource, `projection-root:${crypto.randomUUID()}`);
    const root = ctx.roots.get(resource)!;
    const graph: RepositoryState = { rootPlacementKey: root, revision: 0, contents: {}, placements: { [root]: { key: root, contentKey: rootContent, kind: "owned" } } };
    const content = (key: string) => {
      if (graph.contents[key]) return;
      const c = state.contents[key]; if (!c) throw new Error("Missing canonical dependency");
      graph.contents[key] = clone(c);
      const set = owners.get(key) ?? new Set(); set.add(resource); owners.set(key, set);
      for (const p of [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)]) {
        graph.placements[p] = clone(state.placements[p]); content(state.placements[p].contentKey);
      }
    };
    content(rootContent);
    for (const [key, owner] of ctx.unplacedOwners) if (owner === resource && state.contents[key] && !owners.has(key)) content(key);
    graphs.set(resource, graph);
  }
  const unsupported = new Set<string>();
  for (const set of owners.values()) if (set.size > 1) set.forEach(resource => unsupported.add(resource));
  for (const [resource, graph] of graphs) {
    if (unsupported.has(resource)) continue;
    validateRepository(graph); new BlockIdentityIndex(graph);
  }
  return { graphs, owners, unsupported };
}
export interface ProjectedRevision {
  resourceId: string;
  sourceBeforeRevision: number;
  sourceAfterRevision: number;
  event: HistoryChanges;
}
export function projectTransition(before: RepositoryState, after: RepositoryState, event: HistoryChanges, ctx: ProjectionContext, local: Map<string, number>) {
  const a = partition(before, ctx), b = partition(after, ctx);
  const changed: ProjectedRevision[] = [], boundaries = new Set([...ctx.suspended, ...a.unsupported, ...b.unsupported]);
  const attributable = new Set([...a.owners.keys(), ...b.owners.keys()]);
  // Workspace-owned changes are excluded; completely unplaced, unattributed changes aren't silently dropped.
  const attached = new Set([...Object.values(before.placements), ...Object.values(after.placements)].map(p => p.contentKey));
  const unassigned = event.contents.filter(c => !attributable.has(c.key) && !attached.has(c.key)).map(c => c.key);
  for (const resource of new Set([...a.graphs.keys(), ...b.graphs.keys()])) {
    const left = a.graphs.get(resource), right = b.graphs.get(resource);
    if (!left || !right || boundaries.has(resource)) { boundaries.add(resource); continue; }
    const rootId = (g: RepositoryState) => g.contents[g.placements[g.rootPlacementKey].contentKey].payload.id;
    if (rootId(left) !== rootId(right)) { boundaries.add(resource); continue; }
    const contents = [...new Set([...Object.keys(left.contents), ...Object.keys(right.contents)])]
      .map(key => diffContent(left.contents[key] ?? null, right.contents[key] ?? null, key)).filter(c => c !== undefined);
    const placements = [...new Set([...Object.keys(left.placements), ...Object.keys(right.placements)])]
      .filter(key => !equal(left.placements[key], right.placements[key]))
      .map(key => ({ key, before: clone(left.placements[key] ?? null), after: clone(right.placements[key] ?? null) }));
    if (!contents.length && !placements.length) continue;
    const revision = local.get(resource) ?? 0;
    changed.push({ resourceId: resource, sourceBeforeRevision: event.beforeRevision, sourceAfterRevision: event.afterRevision,
      event: { ...clone(event), beforeRevision: revision, afterRevision: revision + 1, root: { before: left.rootPlacementKey, after: right.rootPlacementKey }, contents, placements } });
  }
  // No half-transfer: all affected resources become explicit boundaries.
  if (changed.length > 1) changed.forEach(c => boundaries.add(c.resourceId));
  if (unassigned.length) for (const resource of new Set([...a.graphs.keys(), ...b.graphs.keys()])) boundaries.add(resource);
  boundaries.forEach(resource => ctx.suspended.add(resource));
  const revisions = unassigned.length ? [] : changed.filter(c => !boundaries.has(c.resourceId));
  for (const r of revisions) local.set(r.resourceId, r.event.afterRevision);
  return { revisions, boundaries: [...boundaries], unassigned, before: a.graphs, after: b.graphs };
}
