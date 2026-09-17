import type { ContentRecord, RepositoryOperation, RepositoryState } from "./types";

export function isTextLeaf(content: ContentRecord | undefined): content is ContentRecord {
  return !!content && content.viewType === "text-cell" && !content.children.length &&
    !content.inlineContent.length && !Object.keys(content.ownedRelations).length && content.definitionOwnerKey === undefined;
}

/** Prove that a batch only replaces leaf Cells in one existing inline owner.
 * Everything else uses the repository's full graph validator. No graph scan is
 * necessary: retained edges are unchanged, new placements are fresh, and removed
 * content is checked against the repository's placement reference counts.
 */
export function inlineOwnerFor(
  state: RepositoryState,
  operations: RepositoryOperation[],
  references: ReadonlyMap<string, number>,
): string | undefined {
  const contents = new Map<string, RepositoryOperation>();
  const placements = new Map<string, RepositoryOperation>();
  let owner: ContentRecord | undefined;
  for (const operation of operations) {
    if (operation.kind === "set-root") return;
    const key = "record" in operation ? operation.record.key : operation.key;
    const map = operation.kind.endsWith("content") ? contents : placements;
    if (map.has(key)) return;
    map.set(key, operation);
    if (operation.kind === "put-content" && state.contents[key]) {
      if (owner || operation.record.inlineKind !== "standoff") return;
      owner = operation.record;
    }
  }
  if (!owner) return;
  const previous = state.contents[owner.key];
  const structural = (record: ContentRecord) => {
    const { payload, inlineContent, inlineRevision, revision, ...rest } = record;
    return JSON.stringify(rest);
  };
  if (structural(previous) !== structural(owner)) return;
  const oldKeys = new Set(previous.inlineContent);
  const newKeys = new Set(owner.inlineContent);
  if (newKeys.size !== owner.inlineContent.length) return;
  const usedContents = new Set<string>([owner.key]);
  const deltas = new Map<string, number>();
  let edges = 0;
  for (const key of oldKeys) {
    if (newKeys.has(key)) continue;
    const placement = state.placements[key];
    if (placements.get(key)?.kind !== "remove-placement" || !placement ||
      !isTextLeaf(state.contents[placement.contentKey])) return;
    deltas.set(placement.contentKey, (deltas.get(placement.contentKey) ?? 0) - 1);
    edges++;
  }
  for (const key of newKeys) {
    if (oldKeys.has(key)) continue;
    const operation = placements.get(key);
    if (state.placements[key] || operation?.kind !== "put-placement" ||
      operation.record.kind !== "inline") return;
    const contentKey = operation.record.contentKey;
    const put = contents.get(contentKey);
    const content = put?.kind === "put-content" ? put.record : state.contents[contentKey];
    if (!isTextLeaf(content)) return;
    if (put) {
      if (put.kind !== "put-content" || state.contents[contentKey]) return;
      usedContents.add(contentKey);
    }
    deltas.set(contentKey, (deltas.get(contentKey) ?? 0) + 1);
    edges++;
  }
  if (edges !== placements.size) return;
  for (const [key, delta] of deltas) {
    const count = (references.get(key) ?? 0) + delta;
    if (count < 0) return;
    if (count === 0) {
      if (contents.get(key)?.kind !== "remove-content") return;
      usedContents.add(key);
    } else if (contents.get(key)?.kind === "remove-content") return;
  }
  if (usedContents.size !== contents.size) return;
  return owner.key;
}
