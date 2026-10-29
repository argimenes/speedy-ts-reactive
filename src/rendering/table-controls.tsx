import { createMemo, Show } from 'solid-js';
import { useReactiveView } from '../reactive-editor/context';
import { tableLocation } from '../runtime/table-commands';
import { openTableMenu } from '../runtime/table-menu';

export function TableControl(props: { nodeKey: string; label: string; kind?: 'row' | 'cell' }) {
  const { editor } = useReactiveView();
  return <button type="button" class="table-control" aria-label={props.label} title={props.label} aria-haspopup="menu" data-table-controls
    aria-expanded={editor.overlays.overlays.some(o => o.ownerKey === props.nodeKey && o.viewType === 'context-menu')}
    onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}
    onClick={event => { event.stopPropagation(); openTableMenu(editor, props.nodeKey, event.currentTarget); }}>{props.kind === 'row' ? 'Row ⋯' : props.kind === 'cell' ? 'Cell ⋯' : 'Table ⋯'}</button>;
}
export function CellControls(props: { nodeKey: string }) {
  const { editor } = useReactiveView();
  const location = createMemo(() => tableLocation(editor, props.nodeKey));
  const rowIndex = () => { const l = location(); return l?.row ? l.table.children.indexOf(l.row.key) + 1 : 0; };
  const columnIndex = () => { const l = location(); return l?.cell && l.row ? l.row.children.indexOf(l.cell.key) + 1 : 0; };
  return <div class="table-cell-controls" contentEditable={false}>
    <Show when={columnIndex() === 1 && location()?.row}><TableControl nodeKey={location()!.row!.key} kind="row" label={`Row ${rowIndex()} controls`} /></Show>
    <TableControl nodeKey={props.nodeKey} kind="cell" label={`Row ${rowIndex()}, column ${columnIndex()} controls`} />
  </div>;
}
