import type { ContentRecord } from './types';

export type TabOrientation = 'horizontal' | 'vertical';
export const isTabRow = (type: string | undefined) => type === 'tab-row-block' || type === 'document-tab-row-block';
export function tabOrientation(metadata: unknown, enabled = true): TabOrientation {
  return enabled && metadata && typeof metadata === 'object' && (metadata as { orientation?: unknown }).orientation === 'vertical' ? 'vertical' : 'horizontal';
}

/** A narrowly scoped proof for an already validated commit, including Undo/Redo.
 * No new/deleted records, ownership, edges, identities or other payload may change.
 * Compare this row's records only; never walk the Tabs' content trees. */
export function tabOrientationRecordChange(before: ContentRecord | undefined, after: ContentRecord): boolean {
  if (!before || !isTabRow(before.viewType)) return false;
  const withoutOrientation = (record: ContentRecord) => {
    const metadata = record.payload.metadata;
    if (metadata !== undefined && (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))) return;
    const { orientation: _, ...rest } = (metadata ?? {}) as Record<string, unknown>;
    return { ...record, revision: 0, payload: { ...record.payload, metadata: rest } };
  };
  const a = withoutOrientation(before), b = withoutOrientation(after);
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

/** Tab names/active flags, or row orientation, may accompany removal of a slash
 * invocation. Every other field and every structural edge must stay identical. */
export function tabMetadataRecordChange(before: ContentRecord | undefined, after: ContentRecord): boolean {
  if (!before || !['tab-row-block','document-tab-row-block','tab-block','document-tab-block'].includes(before.viewType)) return false;
  const fields = isTabRow(before.viewType) ? ['orientation'] : ['name','active'];
  const strip = (record: ContentRecord) => {
    const metadata = record.payload.metadata;
    if (metadata !== undefined && (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))) return;
    const rest = { ...(metadata ?? {}) as Record<string,unknown> };
    for (const field of fields) delete rest[field];
    return { ...record, revision: 0, payload: { ...record.payload, metadata: rest } };
  };
  const a=strip(before),b=strip(after);
  return !!a && !!b && JSON.stringify(a)===JSON.stringify(b);
}
