import { applyHistoryChanges } from '../history/replay';
import type { HistoryChanges } from '../block-tree/compact-changes';
import { expect, it } from 'vitest';
import { ReactiveEditor } from '../reactive-editor/editor';

it.each(['[ ] ', '[x] ', '[X] '])('qualifies native restoration and repeated history for %s', suffix => {
  const source = { id: 'source', type: 'standoff-editor-block', text: '-', standoffProperties: [
    { id: 'bold', type: 'style/bold', start: 0, end: 0 },
    { id: 'point', type: 'note', start: 1, end: 1, isZeroWidth: true, affinity: 'after' },
  ] };
  const editor = new ReactiveEditor({ id: 'document', type: 'document-block', children: [source] });
  const reference = new ReactiveEditor({ id: 'document', type: 'document-block', children: [source] });
  try {
    const baseline = editor.repository.snapshot(), events: HistoryChanges[] = [];
    const stop = editor.repository.subscribeHistoryChanges(event => events.push(event as HistoryChanges), error => { throw error; });
    const key = editor.repository.readState().contents[editor.repository.readState().placements[editor.repository.state.rootPlacementKey].contentKey].children[0];
    const rk = reference.repository.readState().contents[reference.repository.readState().placements[reference.repository.state.rootPlacementKey].contentKey].children[0];
    editor.commands.replaceInlineRange(key, 1, 1, ' ');
    editor.commands.wrapTextBlockInList(key, 2);
    editor.repository.undo(); // Exact, guarded fresh conversion inverse.
    reference.commands.replaceInlineRange(rk, 1, 1, ' ');
    for (let i = 0; i < suffix.length; i++) {
      editor.commands.replaceInlineRange(key, 2 + i, 2 + i, suffix[i]);
      reference.commands.replaceInlineRange(rk, 2 + i, 2 + i, suffix[i]);
    }
    const literal = reference.encodeDocument().children![0];
    expect(editor.encodeDocument().children![0]).toEqual(literal);
    editor.commands.wrapTextBlockInList(key, 2 + suffix.length, { ordered: false }, suffix[1] !== ' ');
    editor.repository.undo();
    expect(editor.encodeDocument().children![0]).toEqual(literal);
    editor.repository.redo(); editor.repository.undo();
    expect(editor.encodeDocument().children![0]).toEqual(literal);
    // Every preceding native typing entry is still a valid inverse.
    for (let i = 0; i < suffix.length + 1; i++) editor.repository.undo();
    expect(editor.encodeDocument().children![0]).toMatchObject(source);
    stop();
    expect(events.reduce((state, event) => applyHistoryChanges(state, event), baseline)).toEqual(editor.repository.snapshot());
  } finally { editor.dispose(); reference.dispose(); }
});
