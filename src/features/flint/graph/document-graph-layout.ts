import type { ReliefNode } from './relief-node';

/** View-only layout: edges mean Document → entity reference, never inferred entity relationships. */
export function documentGraphNodes(document: {id: string; title: string}, entities: readonly {id: string; name: string; documentMentions: number}[]): ReliefNode[] {
  return [
    { id: `document:${document.id}`, label: document.title, relation: 'Document', form: 'mask', x: 388, y: 271, width: 124, height: 178 },
    ...entities.map((entity, index): ReliefNode => {
      const ring = Math.floor(index / 12), start = ring * 12, count = Math.min(12, entities.length - start);
      const angle = (index - start) / count * Math.PI * 2 - Math.PI / 2;
      const width = 86, height = 90;
      // Stable silhouettes distinguish objects visually without claiming an entity taxonomy.
      let hash = 0; for (const c of entity.id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
      const forms = ['disc', 'stone', 'diamond', 'pyramids', 'leaf', 'spiral', 'star', 'moon'] as const;
      return { id: entity.id, label: entity.name, relation: `${entity.documentMentions} Document mentions`, form: forms[hash % forms.length],
        x: 450 + Math.cos(angle) * (300 + ring * 180) - width / 2,
        y: 360 + Math.sin(angle) * (200 + ring * 155) - height / 2, width, height };
    }),
  ];
}
