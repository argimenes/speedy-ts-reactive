import type { ExistingBlockDto } from '../../block-tree/types';

export function createFlintDocumentTabs(documents: readonly { id: string; title: string }[]): ExistingBlockDto {
  return { id: crypto.randomUUID(), type: 'flint-application-block', metadata: {}, children: [{
    id: crypto.randomUUID(), type: 'tab-row-block', children: documents.map(doc => ({
      id: crypto.randomUUID(), type: 'tab-block', metadata: { name: doc.title, documentTarget: { version: 1, documentId: doc.id } },
    })),
  }] };
}
