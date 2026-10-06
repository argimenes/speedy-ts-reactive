import type { ReliefForm } from '../relief-defs';
export type FixtureNode = { id: string; label: string; form: ReliefForm; x: number; y: number; width: number; height: number; relation: string };
/** Deliberate composition for visual comparison, not semantic records or a force layout. */
export const REFERENCE_NODES: readonly FixtureNode[] = [
  { id: 'waste-land', label: 'The Waste Land', form: 'mask', x: 406, y: 290, width: 94, height: 135, relation: 'Document' },
  { id: 'modernism', label: 'Modernism', form: 'disc', x: 151, y: 81, width: 68, height: 68, relation: 'movement' },
  { id: 'war', label: 'War', form: 'stone', x: 288, y: 187, width: 62, height: 62, relation: 'context' },
  { id: 'london', label: 'London', form: 'pyramids', x: 561, y: 28, width: 88, height: 75, relation: 'place' },
  { id: 'thames', label: 'Thames', form: 'waves', x: 750, y: 135, width: 89, height: 64, relation: 'symbol' },
  { id: 'myth', label: 'Myth', form: 'pyramids', x: 107, y: 257, width: 78, height: 74, relation: 'theme' },
  { id: 'frazer', label: 'Frazer', form: 'disc', x: 174, y: 423, width: 67, height: 67, relation: 'influence' },
  { id: 'nature', label: 'Nature', form: 'leaf', x: 767, y: 307, width: 64, height: 88, relation: 'theme' },
  { id: 'time', label: 'Time', form: 'spiral', x: 666, y: 447, width: 76, height: 76, relation: 'theme' },
  { id: 'suffering', label: 'Suffering', form: 'star', x: 292, y: 511, width: 73, height: 73, relation: 'theme' },
  { id: 'death', label: 'Death', form: 'beads', x: 552, y: 544, width: 77, height: 77, relation: 'theme' },
  { id: 'rebirth', label: 'Rebirth', form: 'moon', x: 451, y: 626, width: 79, height: 79, relation: 'theme' },
  { id: 'hollow-men', label: 'The Hollow Men', form: 'diamond', x: 691, y: 594, width: 79, height: 86, relation: 'related' },
];
export function fixtureNodes(count: number): readonly FixtureNode[] {
  if (count === 13) return REFERENCE_NODES;
  const columns = Math.ceil(Math.sqrt(count * 1.3));
  return Array.from({ length: count }, (_, i) => ({ ...REFERENCE_NODES[i % REFERENCE_NODES.length], id: `sample-${i}`, label: `Relief ${i + 1}`, x: (i % columns) * 82, y: Math.floor(i / columns) * 105, width: 54, height: 63 }));
}
