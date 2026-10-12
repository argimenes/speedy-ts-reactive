import type { ReliefForm } from '../relief-vocabulary';
/** Presentation data supplied by a Document's live entity inventory. */
export type ReliefNode = { id: string; label: string; form: ReliefForm; x: number; y: number; width: number; height: number; relation: string };
