import { expect, it, vi } from 'vitest';
import { decodeDocument, encodeDocument } from './codecs';
import { TreeCommands } from './commands';
import { CanonicalRepository } from './repository';
import { convertSource } from '../interchange/document-import';
import { UndoStorage } from './undo-storage';
import { materializeFragment } from '../interchange/materialize';

it('imports a large source as one bulk operation and one inverse, with exact Undo/Redo', () => {
  // This used to generate >180,000 operations. Assert that preparation, commit
  // and history now retain one bulk operation regardless of character count.
  const paragraph = 'An encyclopaedic article. '.repeat(40);
  const source = `<section><h2>Biography</h2>${`<p><b>${paragraph}</b></p>`.repeat(90)}</section>`;
  const original = { id: 'doc', type: 'document-block', children: [{
    id: 'article', type: 'mutable/web-article-block', text: source,
    metadata: { provenance: { snapshotId: 'immutable-snapshot', revision: 123 } },
  }] };
  const repository = new CanonicalRepository(decodeDocument(original).state);
  const commands = new TreeCommands(repository, key => key);
  const state = repository.readState();
  const article = state.contents[state.placements[state.rootPlacementKey].contentKey].children[0];
  const before = encodeDocument(state);
  const converted = convertSource(source, 'html').fragment;
  for (const block of converted.blocks) block.data.metadata = original.children[0].metadata;
  const native = materializeFragment(converted);
  expect(Object.keys(native.state.contents).length).toBeGreaterThan(90000);
  const commit = vi.spyOn(repository, 'commit'), snapshot = vi.spyOn(repository, 'snapshot');
  const history = vi.spyOn(UndoStorage.prototype, 'store');
  try {
  commands.replaceSourceWithFragment(native, article);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][1]).toHaveLength(1);
  expect(commit.mock.calls[0][1][0].kind).toBe('record-batch');
  expect(history.mock.calls[0][2]).toHaveLength(1);
  expect(history.mock.calls[0][3]).toHaveLength(1);
  expect(history.mock.calls[0][3][0].kind).toBe('record-batch');
  expect(snapshot).not.toHaveBeenCalled();
  const result = encodeDocument(repository.readState());
  expect(result.children).toHaveLength(91);
  expect(result.children![1].text).toBe(paragraph.trimEnd());
  expect(result.children![1].standoffProperties).toEqual([expect.objectContaining({ type: 'style/bold' })]);
  expect(result.children![1].metadata).toEqual(original.children[0].metadata);
  repository.undo();
  expect(encodeDocument(repository.readState())).toEqual(before);
  expect(repository.canUndo()).toBe(false);
  repository.redo();
  expect(encodeDocument(repository.readState())).toEqual(result);
  for (const call of commit.mock.calls) { expect(call[1]).toHaveLength(1); expect(call[1][0].kind).toBe('record-batch'); }
  } finally { history.mockRestore(); }
}, 120000);
