// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createRecentDocuments, RECENT_DOCUMENTS_KEY } from './recent-documents';
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
const document = (id: string) => ({ id, title: `Document ${id}`, location: { folder: 'letters', filename: `${id}.ink` } });
it('keeps ten unique most-recent-first entries and isolates logical Vaults across restart', () => {
  const history = createRecentDocuments();
  for (let i = 0; i < 12; i++) history.record(document(String(i)), 'vault-a');
  history.record(document('5'), 'vault-a');
  expect(history.items('vault-a').map(d => d.id)).toEqual(['5', '11', '10', '9', '8', '7', '6', '4', '3', '2']);
  history.record(document('other'), 'vault-b');
  const restored = createRecentDocuments();
  expect(restored.items('vault-a')).toEqual(history.items('vault-a'));
  expect(restored.items('vault-b').map(d => d.id)).toEqual(['other']);
  expect(restored.items('unseen')).toEqual([]);
});
it('keeps unsaved or unscoped documents session-local and only persists explicit opens', () => {
  const history = createRecentDocuments(), writes = vi.spyOn(Storage.prototype, 'setItem');
  history.record({ id: 'unsaved', title: 'Untitled' }, 'vault');
  history.record(document('local'));
  const restored = createRecentDocuments();
  expect(restored.items('vault')).toEqual([]); expect(restored.items()).toEqual([]);
  expect(history.items('vault')[0].id).toBe('unsaved'); expect(history.items()[0].id).toBe('local');
  writes.mockClear();
  for (let i = 0; i < 40; i++) history.items('vault');
  history.record({ id: 'unsaved', title: 'Untitled' }, 'vault');
  expect(writes).not.toHaveBeenCalled();
});
it('ignores corrupt storage and tolerates restricted storage', () => {
  localStorage.setItem(RECENT_DOCUMENTS_KEY + 'vault', JSON.stringify([null, document('ok'), document('ok'), {id:'bad'}]));
  expect(createRecentDocuments().items('vault').map(d => d.id)).toEqual(['ok']);
  localStorage.setItem(RECENT_DOCUMENTS_KEY + 'vault', '{bad');
  expect(createRecentDocuments().items('vault')).toEqual([]);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  const history = createRecentDocuments(); history.record(document('session'), 'vault');
  expect(history.items('vault')[0].id).toBe('session');
});
