import { clone } from "./clone";
import { isAuthoredBlock } from "./identity";
import type { ContentRecord, Location, RepositoryOperation, RepositoryState } from "./types";

/** Private normalization before enrollment. Evidence comes from the decoded
 * definition table or unambiguous legacy ownership, never foreign reachability.
 * The Document's self-membership marks a normalized definition table. */
export function normalizeDefinitionOwnership(state: RepositoryState, owners: ReadonlyMap<string, string>): RepositoryState {
  const next = clone(state);
  for (const [key, ownerKey] of owners) {
    const content = next.contents[key], owner = next.contents[ownerKey];
    if (!content || owner?.viewType !== "document-block") throw new Error("Invalid definition ownership evidence");
    if (!isAuthoredBlock(content)) continue;
    if (content.definitionOwnerKey !== undefined && content.definitionOwnerKey !== ownerKey) throw new Error("Conflicting definition ownership");
    content.definitionOwnerKey = ownerKey;
  }
  return next;
}

/** Assign fresh authored definitions at their explicit insertion destination.
 * Existing definitions keep ownership across moves. Returned metadata belongs to
 * the original command, so exact capture and ordinary undo see the same effects.
 * No repository scan is needed for ordinary inline edits. */
export function ownNewDefinitions(state: RepositoryState, operations: RepositoryOperation[], locationOf: (key: string) => Location | undefined): RepositoryOperation[] {
  const fresh = operations.filter((op): op is Extract<RepositoryOperation, {kind: "put-content"}> =>
    op.kind === "put-content" && !state.contents[op.record.key] && isAuthoredBlock(op.record));
  if (!fresh.length) return operations;
  const contents = new Map<string, ContentRecord>();
  const placements = new Map<string, string>();
  for (const op of operations) {
    if (op.kind === "put-content") contents.set(op.record.key, op.record);
    if (op.kind === "put-placement" && !op.record.externalReference) placements.set(op.record.key, op.record.contentKey);
  }
  const parents = new Map<string, Set<string>>();
  const addParent = (target: string, parent: string) => {
    const values = parents.get(target) ?? new Set<string>(); values.add(parent); parents.set(target, values);
  };
  for (const c of contents.values()) for (const pk of [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)]) {
    const target = placements.get(pk) ?? state.placements[pk]?.contentKey;
    if (target && !state.contents[target]) {
      addParent(target, c.key);
    }
  }
  for (const [pk, target] of placements) if (!state.contents[target]) {
    const location = locationOf(pk);
    if (location && !contents.has(location.ownerContentKey)) addParent(target, location.ownerContentKey);
  }
  const ownerFor = (key: string, seen = new Set<string>()): string | undefined => {
    if (seen.has(key)) return;
    seen.add(key);
    const c = contents.get(key) ?? state.contents[key];
    if (state.contents[key] || c?.viewType === "document-block" && c.definitionOwnerKey === key) return c?.definitionOwnerKey;
    const declaredOwner = c?.definitionOwnerKey && contents.get(c.definitionOwnerKey);
    if (declaredOwner && !state.contents[declaredOwner.key] && declaredOwner.viewType === "document-block" && declaredOwner.definitionOwnerKey === declaredOwner.key) {
      return declaredOwner.key; // whole-Document copy includes unplaced definitions
    }
    const candidates = new Set([...parents.get(key) ?? []].map(parent => ownerFor(parent, new Set(seen))));
    if (candidates.size > 1) throw new Error("Ambiguous ownership of new definition");
    return candidates.values().next().value;
  };
  const owners = new Map(fresh.map(op => [op.record.key, ownerFor(op.record.key)]));
  return operations.map(op => {
    if (op.kind !== "put-content" || !owners.has(op.record.key)) return op;
    const record = { ...op.record }, owner = owners.get(record.key);
    if (owner) record.definitionOwnerKey = owner;
    else delete record.definitionOwnerKey;
    return { ...op, record };
  });
}
