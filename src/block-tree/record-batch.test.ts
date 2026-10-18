import { expect, it, vi } from 'vitest';
import { decodeDocument, encodeDocument } from './codecs';
import { TreeCommands } from './commands';
import { CanonicalRepository } from './repository';
import { convertSource } from '../interchange/document-import';
import { materializeFragment } from '../interchange/materialize';
import { applyHistoryChanges } from '../history/replay';
import { applyCapturedCommitForTest } from './test-support/captured-replay';
import { captureNative, nativeBytes, decodeNative } from '../persistence/native-resource';
import { WholeDocumentCapture, projectWholeDocument, replayDurablePath, encodeDurableWire, decodeDurableWire, resourceToRepository } from '../history/durable-core';
import type { ResourceTransition } from '../history/stage-c-gates/resource';
import { normalizeDefinitionOwnership } from './definition-ownership';

function setup(normalized = false) {
  let state = decodeDocument({ id: 'doc', type: 'document-block', children: [
    { id: 'left', type: 'standoff-editor-block', text: 'left' },
    { id: 'source', type: 'mutable/web-article-block', text: '<p>source</p>', metadata: {provenance: {revision: 123}} },
    { id: 'right', type: 'standoff-editor-block', text: 'right' },
  ] }).state;
  const root = state.placements[state.rootPlacementKey].contentKey;
  if (normalized) state = normalizeDefinitionOwnership(state, new Map(Object.values(state.contents).map(c => [c.key, root])));
  const repository = new CanonicalRepository(state, {enforceBlockIdentity:true});
  const commands = new TreeCommands(repository, key => key);
  return {repository, commands, root, source: state.contents[root].children[1]};
}
const fragment = () => materializeFragment(convertSource('<h2>Heading</h2><p>A <b>formatted</b> article.</p>', 'html').fragment);

it.each([false,true])('replays a bulk conversion, Undo and Redo through full and durable capture (normalized=%s)', normalized => {
  const s = setup(normalized), errors: unknown[] = [];
  let exact = s.repository.snapshot(), durable = s.repository.snapshot();
  const before = encodeDocument(exact);
  const baseline = projectWholeDocument(exact, 'doc'), journal = new WholeDocumentCapture(baseline, exact.revision);
  const transitions: ResourceTransition[] = [];
  s.repository.subscribeCommits(event => { exact = applyCapturedCommitForTest(exact,event); }, e => errors.push(e));
  s.repository.subscribeHistoryChanges(event => { durable = applyHistoryChanges(durable,event); transitions.push(decodeDurableWire(encodeDurableWire(journal.capture(event))) as ResourceTransition); }, e => errors.push(e));
  const imported = fragment();
  s.commands.replaceSourceWithFragment(imported,s.source);
  const result = encodeDocument(s.repository.readState());
  const reopened = resourceToRepository(decodeNative(nativeBytes(captureNative(s.repository.readState(), 'doc'))));
  expect(encodeDocument(reopened)).toEqual(result);
  expect(result.children?.map(c => c.text)).toEqual(['left','Heading','A formatted article.','right']);
  // The caller cannot mutate installed or history-owned records after commit.
  for (const c of Object.values(imported.state.contents)) c.payload.text = 'caller mutation';
  for (const move of ['undo','redo'] as const) {
    expect(exact).toEqual(s.repository.snapshot()); expect(durable).toEqual(exact);
    s.repository[move]();
    expect(encodeDocument(s.repository.readState())).toEqual(move === 'undo' ? before : result);
  }
  expect(durable).toEqual(s.repository.snapshot()); expect(exact).toEqual(durable); expect(errors).toEqual([]);
  expect(replayDurablePath(baseline, transitions)).toEqual(projectWholeDocument(s.repository.readState(), 'doc', journal.localRevision));
});

it('rolls back an interrupted transaction containing a bulk insertion', () => {
  const s = setup(), before = s.repository.snapshot();
  expect(() => s.commands.transaction('aborted import',()=>{
    s.commands.insertFragment(fragment(),{kind:'before',anchorKey:s.source});
    throw Error('cancelled before publication');
  })).toThrow('cancelled');
  expect(s.repository.snapshot()).toEqual(before); expect(s.repository.canUndo()).toBe(false);
});

it('rejects invalid bulk references and duplicate identities before publication or history', () => {
  const s = setup(), before = s.repository.snapshot();
  const root = before.contents[s.root];
  expect(() => s.repository.commit('invalid', [{kind:'record-batch', contents:{[root.key]:{...root,children:['missing']}},placements:{}}])).toThrow();
  const copy = {...root, key:'duplicate', children:[]};
  expect(() => s.repository.commit('duplicate', [{kind:'record-batch', contents:{duplicate:copy},placements:{}}])).toThrow();
  expect(() => s.repository.commit('wrong key', [{kind:'record-batch',contents:{wrong:root},placements:{}}])).toThrow();
  expect(s.repository.snapshot()).toEqual(before); expect(s.repository.canUndo()).toBe(false);
});

it('never treats a mixed bulk/inline transaction as a typing fast path', () => {
  const s = setup(), before = s.repository.snapshot(), root = before.contents[s.root];
  expect(() => s.repository.commit('invalid mixed', [
    {kind:'put-content',record:{...root}},
    {kind:'record-batch',contents:{},placements:{[s.source]:null}},
  ])).toThrow();
  expect(s.repository.snapshot()).toEqual(before);
});

it('uses the same bulk primitive for a clipboard fragment inserted at a text caret', () => {
  const s = setup(), before = s.repository.snapshot();
  const destination = before.contents[s.root].children[0];
  const source = convertSource('<p>Imported <i>text</i></p>', 'html').fragment;
  const commit = vi.spyOn(s.repository, 'commit');
  s.commands.insertMutableText([{segments:[{placementKey:destination,start:4,end:4}],fragment:materializeFragment(source),slices:source.roots}]);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][1]).toHaveLength(1);
  expect(commit.mock.calls[0][1][0].kind).toBe('record-batch');
  s.repository.undo();
  expect(encodeDocument(s.repository.readState())).toEqual(encodeDocument(before));
});
