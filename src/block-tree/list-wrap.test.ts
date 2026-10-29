import { afterEach, expect, it, vi } from 'vitest';
import { ReactiveEditor } from '../reactive-editor/editor';
import { clone } from './clone';
import { deriveLocations, validateRepository, CanonicalRepository } from './repository';
import { listWrapChangeFor } from './list-wrap-plan';
import { decodeDocument } from './codecs';
import { normalizeDefinitionOwnership } from './definition-ownership';
import { TreeCommands } from './commands';
import { captureNative } from '../persistence/native-resource';
import type { RepositoryOperation } from './types';

afterEach(() => vi.restoreAllMocks());
const paragraph = (id: string, text = '- ') => ({ id, type: 'standoff-editor-block', text });

it.each([false, true])('wrap/undo/redo preserve routes and do no global scans or projection rebuilds (prefix=%s)', prefix => {
  const editor = new ReactiveEditor({ type: 'document-block', children: [
    { ...paragraph('p'), children: [paragraph('child', 'nested')], relation: { leftMargin: { type: 'left-margin-block', children: [paragraph('note', 'note')] } } },
    ...Array.from({ length: 50 }, (_, i) => paragraph(`other${i}`, 'x'.repeat(100))),
  ] });
  try {
    const views = [editor.createView('one'), editor.createView('two')];
    const key = views[0].state.nodes[views[0].state.rootKey].children[0];
    const item = views[0].state.nodes[key].placementKey;
    const before = editor.encodeDocument(), state = editor.repository.readState();
    const builds = views.map(v => vi.spyOn(v as any, 'build'));
    const snapshot = vi.spyOn(editor.repository, 'snapshot');
    const read = vi.spyOn(editor.repository, 'readState').mockReturnValue({ ...state,
      contents: new Proxy(state.contents, { ownKeys() { throw Error('Global content scan'); } }),
      placements: new Proxy(state.placements, { ownKeys() { throw Error('Global placement scan'); } }),
    });
    const wrapper = editor.commands.wrapTextBlockInList(key, prefix ? 2 : 0);
    for (const view of views) {
      const source = view.nodeForPlacement(item)!;
      expect(view.parentOf(source.key)?.placementKey).toBe(wrapper);
      expect(view.parentOf(source.children[0])?.key).toBe(source.key);
      expect(view.parentOf(source.ownedRelations.leftMargin)?.key).toBe(source.key);
    }
    editor.repository.undo(); editor.repository.redo(); editor.repository.undo();
    expect(snapshot).not.toHaveBeenCalled(); builds.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(views[0].nodeForPlacement(item)?.key).toBe(key);
    read.mockRestore();
    expect(editor.encodeDocument()).toEqual(before);
    validateRepository(state);
    for (const [pk, location] of deriveLocations(state)) expect(editor.repository.locationOf(pk)).toEqual(location);
  } finally { editor.dispose(); }
});

it('keeps admitted ownership and native capture valid through prefix conversion and history', () => {
  const raw = decodeDocument({ id: 'doc', type: 'document-block', children: [paragraph('p')] }).state;
  const root = raw.placements[raw.rootPlacementKey].contentKey;
  const state = normalizeDefinitionOwnership(raw, new Map(Object.keys(raw.contents).map(key => [key, root])));
  const repository = new CanonicalRepository(state, { enforceBlockIdentity: true, resourceBoundaryEvidence: true });
  const commands = new TreeCommands(repository, key => key), item = state.contents[root].children[0];
  const wrapper = commands.wrapTextBlockInList(item, 2), wrapperContent = repository.readState().placements[wrapper].contentKey;
  for (const action of [() => {}, () => repository.undo(), () => repository.redo()]) {
    action(); validateRepository(repository.readState());
    expect(repository.readCanonicalResourceBoundary('doc').status).toBe('ready');
    expect(() => captureNative(repository.readState(), 'doc')).not.toThrow();
  }
  expect(repository.readState().contents[wrapperContent].definitionOwnerKey).toBe(root);
});

it('rejects unrelated structural changes and invalid wrapper edges from the local proof', () => {
  const editor = new ReactiveEditor({ type: 'document-block', children: [paragraph('p'), paragraph('other')] });
  try {
    const view = editor.createView(), key = view.state.nodes[view.state.rootKey].children[0];
    let operations: RepositoryOperation[] = [];
    const commit = vi.spyOn(editor.repository, 'commit').mockImplementation((_label, ops) => { operations = clone(ops); });
    editor.commands.wrapTextBlockInList(key, 2); commit.mockRestore();
    const state = editor.repository.readState(), refs = { get: (key: string) => editor.repository.contentReferenceCount(key) };
    const check = (ops: RepositoryOperation[]) => listWrapChangeFor(state, ops, refs, key => editor.repository.locationOf(key));
    expect(check(operations)).toBeDefined();
    const invalid = clone(operations), wrapper = invalid.find(op => op.kind === 'put-content' && op.record.viewType === 'indented-list-block');
    if (wrapper?.kind !== 'put-content') throw Error('No list');
    wrapper.record.children.push(wrapper.record.children[0]);
    expect(check(invalid)).toBeUndefined();
    expect(() => editor.repository.commit('Invalid wrap', invalid)).toThrow();
    const other = state.contents[state.placements[state.contents[state.placements[state.rootPlacementKey].contentKey].children[1]].contentKey];
    expect(check([...operations, { kind: 'put-content', record: { ...other, children: ['missing'] } }])).toBeUndefined();
  } finally { editor.dispose(); }
});
