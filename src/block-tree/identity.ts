import { clone } from "./clone";
import { createBlockId } from "./ids";
import type { BlockId, ContentKey, ContentRecord, RepositoryOperation, RepositoryState } from "./types";

export interface IdentityIssue {
  kind: "duplicate-id" | "invalid-id";
  contentKeys: ContentKey[];
  originalId: unknown;
}

export type BlockIdentityNormalizationPlan =
  | { status: "ready"; assignments: Array<{ contentKey: ContentKey; blockId: BlockId }> }
  | { status: "ambiguous"; issues: IdentityIssue[] };

export function isAuthoredBlock(content: ContentRecord): boolean {
  return content.viewType !== "text-cell" && content.viewType !== "image-cell";
}

export function readBlockId(content: ContentRecord): BlockId | undefined {
  const id = content.payload.id;
  return typeof id === "string" && id.trim() ? id : undefined;
}

export function planBlockIdentityNormalization(
  state: RepositoryState,
  createId: () => BlockId = createBlockId,
): BlockIdentityNormalizationPlan {
  const owners = new Map<BlockId, ContentKey[]>();
  const missing: ContentKey[] = [];
  const issues: IdentityIssue[] = [];
  for (const content of Object.values(state.contents)) {
    if (!isAuthoredBlock(content)) continue;
    const id = readBlockId(content);
    if (id) owners.set(id, [...owners.get(id) ?? [], content.key]);
    else if (content.payload.id == null || typeof content.payload.id === "string") missing.push(content.key);
    else issues.push({ kind: "invalid-id", contentKeys: [content.key], originalId: clone(content.payload.id) });
  }
  for (const [id, keys] of owners) if (keys.length > 1) {
    issues.push({ kind: "duplicate-id", contentKeys: keys, originalId: id });
  }
  if (issues.length) return { status: "ambiguous", issues };
  const assignments = missing.map(contentKey => {
    const blockId = createId();
    if (typeof blockId !== "string" || !blockId.trim() || owners.has(blockId)) throw new Error("Identity allocator returned an invalid or duplicate Block ID");
    owners.set(blockId, [contentKey]);
    return { contentKey, blockId };
  });
  return { status: "ready", assignments };
}

export function applyBlockIdentityNormalization(state: RepositoryState, plan: BlockIdentityNormalizationPlan): RepositoryState {
  if (plan.status !== "ready") throw new Error("Ambiguous Block identities require an explicit resolution policy");
  const next = clone(state);
  const assigned = new Set<string>();
  for (const { contentKey, blockId } of plan.assignments) {
    const content = next.contents[contentKey];
    if (!content || !isAuthoredBlock(content) || readBlockId(content) || assigned.has(contentKey) ||
      (content.payload.id != null && typeof content.payload.id !== "string")) throw new Error("Stale Block identity normalization plan");
    if (typeof blockId !== "string" || !blockId.trim()) throw new Error("Invalid assigned Block ID");
    assigned.add(contentKey);
    content.payload.id = blockId;
  }
  // Recheck every final identity; never publish a partially applicable plan.
  new BlockIdentityIndex(next);
  return next;
}

/** Only for newly created, privately owned records, not a live repository. */
export function prepareNewBlockIdentities(records: Iterable<ContentRecord>): void {
  for (const content of records) {
    if (!isAuthoredBlock(content) || readBlockId(content)) continue;
    if (content.payload.id != null && typeof content.payload.id !== "string") throw new Error("Invalid new Block ID");
    content.payload.id = createBlockId();
  }
}

export type IdentityIndexDelta = Map<ContentKey, BlockId | undefined>;

/** Current identities only. There is deliberately no retired-ID/history catalogue. */
export class BlockIdentityIndex {
  private readonly byId = new Map<BlockId, ContentKey>();
  private readonly byContent = new Map<ContentKey, BlockId>();

  constructor(state: RepositoryState) {
    for (const content of Object.values(state.contents)) {
      if (!isAuthoredBlock(content)) continue;
      const id = readBlockId(content);
      if (!id || this.byId.has(id)) throw new Error("Missing or duplicate authored Block identity");
      this.byId.set(id, content.key);
      this.byContent.set(content.key, id);
    }
  }

  validateCommit(operations: readonly RepositoryOperation[]): IdentityIndexDelta {
    const final = new Map<ContentKey, ContentRecord | undefined>();
    for (const operation of operations) {
      if (operation.kind === "put-content") final.set(operation.record.key, operation.record);
      else if (operation.kind === "remove-content") final.set(operation.key, undefined);
    }
    const delta: IdentityIndexDelta = new Map();
    for (const [key, content] of final) {
      const id = content && isAuthoredBlock(content) ? readBlockId(content) : undefined;
      if (content && isAuthoredBlock(content) && !id) throw new Error("Missing authored Block identity");
      const previous = this.byContent.get(key);
      if (content && previous && id !== previous) throw new Error("An existing Block identity cannot be changed");
      delta.set(key, id);
    }
    const claimed = new Map<BlockId, ContentKey>();
    for (const [key, id] of delta) {
      if (!id) continue;
      const owner = this.byId.get(id);
      if (claimed.has(id) || (owner !== undefined && owner !== key && (!delta.has(owner) || delta.get(owner) === id))) {
        throw new Error("Duplicate authored Block identity");
      }
      claimed.set(id, key);
    }
    return delta;
  }

  acceptCommit(delta: IdentityIndexDelta): void {
    for (const key of delta.keys()) {
      const id = this.byContent.get(key);
      if (id) this.byId.delete(id);
      this.byContent.delete(key);
    }
    for (const [key, id] of delta) if (id) {
      this.byContent.set(key, id);
      this.byId.set(id, key);
    }
  }
}
