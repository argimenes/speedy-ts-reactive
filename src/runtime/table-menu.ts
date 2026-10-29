import type { ReactiveEditor } from '../reactive-editor/editor';
import type { BlockMenuItem } from './block-menu-types';
import type { TableRequest } from './tables';
import { parseTableCommand, tableCommandCandidates, tableCommands, tableLocation } from './table-commands';

/** Built only on explicit opening. Receipts and captured selection cannot silently retarget. */
export function tableMenuItems(editor: ReactiveEditor, key: string): BlockMenuItem[] {
  const revision = editor.repository.state.revision, node = editor.node(key);
  if (!node || !editor.features.tableLayouts) return [];
  const selected = editor.blockSelection.state.items.map(i => i.nodeKey);
  const location = tableLocation(editor, key);
  const targets = selected.length && (selected.includes(key) || location?.cell?.key === key || location?.row?.key === key || location?.table.key === key) ? selected : [key];
  const check = () => {
    if (editor.repository.state.revision !== revision || editor.node(key)?.placementKey !== node.placementKey ||
      selected.join('\0') !== editor.blockSelection.state.items.map(i => i.nodeKey).join('\0')) throw Error('The table selection changed. Reopen the controls.');
  };
  const run = (request: TableRequest) => { check(); editor.tables.run(request); };
  const action = (label: string, request: TableRequest): BlockMenuItem => ({ label, restoreFocus: false, run: () => run(request) });
  const result: BlockMenuItem[] = [{ label: 'Table command…', restoreFocus: false, input: {
    label: 'Command for these Blocks (for example /c2 or /unc)',
    suggestions: value => tableCommandCandidates(editor, key, value).filter(c => !c.disabled).map(c => ({ value: `/${tableCommands.find(s => s.id === c.id)!.aliases[0]}`, label: c.name })),
    submit(value) { check(); const command = parseTableCommand(value); if (!command) throw Error('Unknown table command or argument.'); editor.commandRegistry.execute(command.id, { targetKey: key, args: { targets } }); },
  } }];
  if (!location) {
    result.push(...([2, 3, 4] as const).map(columns => action(`${columns} columns`, { kind: 'create', targets, columns })));
    return result;
  }
  const { table, row, cell } = location;
  const command = (id: string, label: string): BlockMenuItem => {
    const available = editor.commandRegistry.canExecute(id, { targetKey: key, args: undefined });
    return { label, restoreFocus: false, disabled: !available, reason: available ? undefined : 'Unavailable at this table boundary or in this Document.', run: () => { check(); return editor.commandRegistry.execute(id, { targetKey: key, args: undefined }); } };
  };
  result.push({ label: 'Go to cell…', loadChildren: () => { check(); return table.children.flatMap((r, ri) => editor.node(r)!.children.map((c, ci) => ({
    label: `Row ${ri + 1}, column ${ci + 1}`, restoreFocus: false,
    run: () => { check(); editor.commandRegistry.execute('table.focus-cell', { targetKey: c, args: undefined }); },
  }))); } });
  if (row) result.push(command('table.insert-row', 'Insert row below'), ...(['up', 'down'] as const).map(d => command(`table.row-${d}`, `Move row ${d}`)));
  if (cell) {
    result.push(command('table.insert-column', 'Insert column right'), { label: 'Swap entire cell', children: ['left', 'right', 'up', 'down'].map(d => command(`table.swap-${d}`, `Swap ${d}`)) });
    const contentTargets = targets.filter(k => editor.blockSelection.eligible(k) && k !== table.key);
    result.push({ label: selected.length ? 'Move selected Blocks to cell…' : 'Move this Block to cell…', disabled: !contentTargets.length,
      reason: !contentTargets.length ? 'Select content using its Block handles first.' : undefined,
      loadChildren: () => { check(); return table.children.flatMap((r, ri) => editor.node(r)!.children.filter(c => c !== cell.key).map(c => action(`Row ${ri + 1}, column ${editor.node(r)!.children.indexOf(c) + 1} (append)`, { kind: 'transfer', targets: contentTargets, destination: c }))); },
    });
    if (key !== cell.key) result.push({ label: 'Create nested table', children: ([2, 3, 4] as const).map(columns => action(`${columns} columns`, { kind: 'create', targets, columns, nested: true })) });
  }
  for (const kind of ['remove-row', 'remove-column'] as const) {
    if (!row || kind === 'remove-column' && !cell) continue;
    result.push({ label: kind === 'remove-row' ? 'Remove row…' : 'Remove column…', loadChildren: () => {
      check();
      try {
        const empty = editor.tables.prepare({ kind, target: key });
        return [{ label: `Remove empty ${kind === 'remove-row' ? 'row' : 'column'}`, restoreFocus: false, run: () => { check(); editor.tables.execute(empty); } }, { label: 'Cancel', run: () => {} }];
      } catch (error) { if (!(error instanceof Error) || !error.message.includes('Review extraction')) throw error; }
      const receipt = editor.tables.prepare({ kind, target: key, extract: true });
      return [{ label: `Extract ${receipt.extractedBlocks} Blocks after the table and remove ${kind === 'remove-row' ? 'row' : 'column'}`, restoreFocus: false, run: () => { check(); editor.tables.execute(receipt); } }, { label: 'Cancel', run: () => {} }];
    } });
  }
  result.push(command('table.dissolve', 'Dissolve table (row-major contents)'));
  return result;
}
export function openTableMenu(editor: ReactiveEditor, key: string, button: HTMLElement) {
  const rect = button.getBoundingClientRect();
  editor.overlays.open({ ownerKey: key, viewType: 'context-menu', title: 'Tables and columns', anchor: { x: rect.left, y: rect.bottom }, data: { items: tableMenuItems(editor, key) } });
}
