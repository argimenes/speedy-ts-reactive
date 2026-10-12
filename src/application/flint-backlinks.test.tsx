// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import * as canonicalEntities from './entity-service';
import { mockResolver } from '../features/entity-references/resolver-test-support';
import { ReactiveEditor } from '../reactive-editor/editor';
import { materializeLocalWorkspace } from '../reactive-editor/workspace-manifest';
import { registerApplicationViews } from './features';
import { ReactiveTreeView } from '../rendering/reactive-tree-view';

const disposers: Array<() => void> = [];
afterEach(() => { disposers.splice(0).reverse().forEach(dispose => dispose()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture() {
  const { service } = mockResolver('Michelangelo', 'artist');
  vi.mocked(service.dbMentions).mockResolvedValue([{ id: 'artist', mentions: 42 }]);
  vi.spyOn(canonicalEntities, 'entityService').mockReturnValue(service);
  const editor = new ReactiveEditor(materializeLocalWorkspace({ type: 'workspace-block', children: [] }), { features: { flint: true, flintMaterialChrome: false, flintProbe: false } });
  registerApplicationViews(editor);
  const projection = editor.createView('workspace');
  editor.commandRegistry.execute('flint.open', { targetKey: projection.state.rootKey, args: undefined });
  const host = document.body.appendChild(document.createElement('div'));
  const unmount = render(() => <ReactiveTreeView editor={editor} projection={projection}/>, host);
  disposers.push(() => { unmount(); editor.dispose(); });
  const panel = () => host.querySelector<HTMLElement>('[aria-label="Document backlinks"]')!;
  const rows = () => [...panel().querySelectorAll<HTMLTableRowElement>('tbody tr')];
  const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const text = () => {
    const view = [...editor.projections.values()].find(view => view !== projection)!;
    return Object.values(view.state.nodes).find(node => node.viewType === 'standoff-editor-block')!;
  };
  const link = (start = 0, end = 3, type = 'codex/entity-reference') => editor.linkedAnnotations.createBatch([[editor.textRanges.snapshot(text().key, start, end)]], type, 'artist', { entityName: 'Cached artist' }, editor.repository.state.revision, 'Reference');
  const refresh = () => panel().querySelector<HTMLButtonElement>('[aria-label="Refresh backlinks"]')!.click();
  return { editor, service, host, panel, rows, tabs, text, link, refresh };
}
it('lists live entity references without a Vault scan; Refresh reloads names and DB counts', async () => {
  const f = fixture(); await tick(); f.link(); f.link(4, 7); await tick(); f.refresh();
  await vi.waitFor(() => expect(f.rows().map(row => [...row.cells].map(cell => cell.textContent))).toEqual([['Michelangelo', '42', '2']]));
  expect(f.service.names).toHaveBeenCalledWith(['artist'], expect.any(AbortSignal));
  expect(f.service.summaries).not.toHaveBeenCalled();
  expect(f.host.querySelector('[role="dialog"][aria-label="Entities in document"]')).toBeNull();
  const before = f.editor.repository.snapshot();
  vi.mocked(f.service.names).mockResolvedValue([{ id: 'artist', name: 'Michelangelo Buonarroti' }]);
  vi.mocked(f.service.dbMentions).mockResolvedValue([{ id: 'artist', mentions: 43 }]);
  f.refresh();
  await vi.waitFor(() => expect(f.rows()[0].cells[1].textContent).toBe('43'));
  expect(f.rows()[0].cells[0].textContent).toBe('Michelangelo Buonarroti');
  expect(f.editor.repository.snapshot()).toEqual(before);
});
it('updates counts on Undo, excludes block references and isolates previews and rows to the active tab', async () => {
  const f = fixture(); await tick(); f.link(); f.link(4, 7); await tick(); f.refresh();
  await vi.waitFor(() => expect(f.rows()[0].cells[0].textContent).toBe('Michelangelo'));
  f.editor.repository.undo(); await tick(); expect(f.rows()[0].cells[2].textContent).toBe('1');
  const oldKey = f.text().key;
  f.rows()[0].dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));
  expect(f.editor.decorations.nodes[oldKey]?.length).toBeGreaterThan(0);
  f.tabs()[1].click(); await tick();
  expect(f.rows()).toHaveLength(0);
  expect(f.editor.decorations.nodes[oldKey]?.length ?? 0).toBe(0);
  f.link(0, 3, 'codex/block-reference'); await tick(); f.refresh();
  expect(f.rows()).toHaveLength(0);
  expect(f.panel().textContent).toContain('No entity references');
  f.tabs()[0].click(); await tick();
  expect(f.rows()[0].cells[2].textContent).toBe('1');
});
it('discards a delayed result when its tab is closed and keeps local mentions if name lookup fails', async () => {
  const f = fixture(); await tick();
  let resolve!: (rows: Array<{id: string; name: string}>) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(f.service.names).mockImplementation((_ids, abort) => { signal = abort; return new Promise(done => { resolve = done; }); });
  f.link(); await tick(); f.refresh(); await tick();
  expect(f.rows()[0].cells[0].textContent).toBe('Cached artist');
  f.host.querySelector<HTMLButtonElement>(`[aria-label="Close Document: ${f.tabs()[0].textContent}"]`)!.click(); await tick();
  expect(signal?.aborted).toBe(true);
  resolve([{ id: 'artist', name: 'Stale result' }]); await tick();
  expect(f.rows()).toHaveLength(0);
  vi.mocked(f.service.names).mockRejectedValue(Error('Database unavailable'));
  f.link(); await tick(); f.refresh();
  await vi.waitFor(() => expect(f.panel().textContent).toContain('Database unavailable'));
  expect(f.rows()[0].cells[2].textContent).toBe('1');
});
