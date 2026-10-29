import { expect, it } from 'vitest';
import { decodeDocument } from './codecs';
import { clone } from './clone';
import { taskStateChangeFor } from './task-state-plan';
it.each(['standoff-editor-block', 'container-block', 'checkbox-block'])('admits only completion changes on %s', type => {
  const state = decodeDocument({ type: 'document-block', children: [{ type, text: 'Task', checked: false, children: [{ type: 'standoff-editor-block', text: 'Child' }] }] }).state;
  const parent = state.contents[state.placements[state.rootPlacementKey].contentKey];
  const original = state.contents[state.placements[parent.children[0]].contentKey];
  for (const checked of [true, false, undefined]) {
    const record = { ...clone(original), payload: { ...clone(original.payload), checked }, revision: original.revision + 1 };
    expect(taskStateChangeFor(state, [{ kind: 'put-content', record }])).toBe(original.key);
  }
  for (const edit of [
    (r: typeof original) => { r.children = []; },
    (r: typeof original) => { r.payload.metadata = { different: true }; },
    (r: typeof original) => { r.payload.standoffProperties = [{ type: 'codex/entity-reference', value: 'new' }]; },
    (r: typeof original) => { r.payload.checked = 'invalid'; },
    (r: typeof original) => { r.viewType = 'document-block'; },
    (r: typeof original) => { r.inlineRevision++; },
  ]) {
    const record = clone(original); edit(record);
    expect(taskStateChangeFor(state, [{ kind: 'put-content', record }])).toBeUndefined();
  }
  expect(taskStateChangeFor(state, [{ kind: 'put-content', record: original }, { kind: 'put-content', record: parent }])).toBeUndefined();
});
