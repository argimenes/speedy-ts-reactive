import type { NodeKey } from "../block-tree/types";
import type { TextRangeSnapshot } from "./text-ranges";

export interface CurrentTextOperation {
  active(): boolean;
  owns(key: NodeKey): boolean;
  annotationTargets(): readonly TextRangeSnapshot[] | undefined;
  apply(type: string, value?: string, attributes?: Readonly<Record<string, number | string>>): number;
  delete(key: NodeKey): boolean;
  cancel(): void;
  error(error: unknown): void;
}
/** One explicit current-operation provider; never inferred from painted highlights. */
export class CurrentTextOperations {
  private entry?: { owner: string; operation: CurrentTextOperation };
  register(owner: string, operation: CurrentTextOperation): () => void {
    if (this.entry) throw new Error(`Current text operation already belongs to ${this.entry.owner}`);
    const entry = this.entry = { owner, operation };
    return () => { if (this.entry === entry) { this.entry = undefined; operation.cancel(); } };
  }
  owner(): string | undefined { return this.entry?.owner; }
  active(): CurrentTextOperation | undefined { const op = this.entry?.operation; return op?.active() ? op : undefined; }
  annotationOperation(): CurrentTextOperation | undefined { const op = this.entry?.operation; return op?.annotationTargets() !== undefined ? op : undefined; }
}
