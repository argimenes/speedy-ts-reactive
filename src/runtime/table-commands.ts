import type { ReactiveEditor } from '../reactive-editor/editor';
import type { TextRangeSnapshot } from './text-ranges';
import type { TableRequest } from './tables';
import type { CompletionCandidate } from '../features/autocomplete/model';
import { revealTableCell } from './table-presentation';

type Spec = { id: string; name: string; aliases: string[]; request(target: string, targets: string[]): TableRequest };
/** One bounded catalogue for inline completion, menus and selection commands. */
export const tableCommands: Spec[] = [
  ...([2, 3, 4] as const).map(columns => ({ id: `table.columns-${columns}`, name: `${columns} columns`, aliases: columns === 2 ? ['c', 'c2'] : [`c${columns}`], request: (_: string, targets: string[]): TableRequest => ({ kind: 'create', targets, columns }) })),
  ...(['insert-row', 'insert-column', 'dissolve'] as const).map((kind, i) => ({ id: `table.${kind}`, name: ['Insert row below', 'Insert column right', 'Dissolve table'][i], aliases: [['row'], ['col'], ['unc']][i], request: (target: string): TableRequest => ({ kind, target }) })),
  ...(['left', 'right', 'up', 'down'] as const).map(direction => ({ id: `table.swap-${direction}`, name: `Swap cell ${direction}`, aliases: [`mc ${direction[0]}`, `move-cell ${direction}`], request: (target: string): TableRequest => ({ kind: 'swap-cell', target, direction }) })),
  ...(['up', 'down'] as const).map(direction => ({ id: `table.row-${direction}`, name: `Move row ${direction}`, aliases: [`mr ${direction[0]}`, `move-row ${direction}`], request: (target: string): TableRequest => ({ kind: 'move-row', target, direction }) })),
];
const normalize = (query: string) => query.length > 64 ? '\0' : query.trim().replace(/^\//, '').toLowerCase().replace(/ +/g, ' ');
export function parseTableCommand(query: string) { const q = normalize(query); return tableCommands.find(c => c.aliases.includes(q)); }

/** Hint only: ancestors and direct sibling indexes, no preflight, snapshots or subtree scans. */
export function tableLocation(editor: ReactiveEditor, key: string) {
  let node = editor.node(key), cell: typeof node, row: typeof node;
  while (node && node.viewType !== 'document-block') {
    if (['table-block', 'grid-block'].includes(node.viewType)) return { table: node, row, cell };
    if (['table-cell-block', 'grid-cell-block'].includes(node.viewType)) cell = node;
    if (['table-row-block', 'grid-row-block'].includes(node.viewType)) row = node;
    const parent = editor.projections.get(node.viewId)?.parentOf(node.key);
    if (!parent?.children.includes(node.key)) break;
    node = parent;
  }
}
export function tableCommandAvailable(editor: ReactiveEditor, id: string, key: string): boolean {
  const node = editor.node(key);
  if (!editor.features.tableLayouts || !node || editor.crossText.range()) return false;
  if (id.startsWith('table.columns-')) return editor.blockSelection.eligible(key);
  const location = tableLocation(editor, key);
  if (!location) return false;
  const { table, row, cell } = location;
  if (id === 'table.dissolve') return true;
  if (id === 'table.insert-row') return !!row;
  if (id === 'table.insert-column') return !!cell;
  const direction = id.split('-').at(-1), ri = row ? table.children.indexOf(row.key) : -1, ci = cell && row ? row.children.indexOf(cell.key) : -1;
  if (id.startsWith('table.row-')) return ri >= 0 && !!table.children[ri + (direction === 'up' ? -1 : 1)];
  if (id.startsWith('table.swap-')) return ci >= 0 && (direction === 'left' || direction === 'right' ? !!row?.children[ci + (direction === 'left' ? -1 : 1)] : !!table.children[ri + (direction === 'up' ? -1 : 1)]);
  return false;
}
export function tableCommandCandidates(editor: ReactiveEditor, key: string, query: string): CompletionCandidate[] {
  if (!editor.features.tableLayouts) return [];
  const q = normalize(query);
  const exact = tableCommands.find(c => c.aliases.includes(q));
  return (exact ? [exact] : tableCommands.filter(c => c.aliases.some(a => a.startsWith(q)))).map(c => {
    const available = editor.commandRegistry.canExecute(c.id, { targetKey: key, args: undefined });
    return { id: c.id, name: `/${c.aliases[0]} — ${c.name}`, reason: available ? c.name : 'Unavailable at this Block or table boundary', exact: c.aliases.includes(q), disabled: !available };
  });
}
export function registerTableCommands(editor: ReactiveEditor) {
  if (!editor.features.tableLayouts) return;
  editor.commandRegistry.register({
    id: 'table.focus-cell', label: 'Focus cell',
    canExecute: ({ targetKey }) => !!tableLocation(editor, targetKey)?.cell,
    execute: ({ targetKey }) => {
      const cell = tableLocation(editor, targetKey)!.cell!;
      // Focus is session state. Do not prepare or publish a structural transaction.
      const firstEditable = (key: string): string | undefined => {
        const node = editor.node(key);
        if (editor.mounts.get(key)?.restoreInlineSelection) return key;
        for (const child of node?.children ?? []) { const found = firstEditable(child); if (found) return found; }
      };
      editor.focus.request(firstEditable(cell.key) ?? cell.key, { reason: 'table-navigation' });
      const root = editor.mounts.get(cell.key)?.root;
      if (root) revealTableCell(root);
    },
  });
  for (const spec of tableCommands) editor.commandRegistry.register<{ targets?: string[]; invocation?: TextRangeSnapshot }>({
    id: spec.id, label: spec.name,
    canExecute: ({ targetKey }) => tableCommandAvailable(editor, spec.id, targetKey),
    execute: ({ targetKey, args }) => editor.tables.run(spec.request(targetKey, args?.targets ?? [targetKey]), args?.invocation),
  });
}
