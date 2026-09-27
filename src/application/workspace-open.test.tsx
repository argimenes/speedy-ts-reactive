// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSession } from "./workspace-session";
import { createInitialWorkspace } from "./initial-workspace";
import { workspaceOpen } from "./workspace-open";
import { materializeLocalWorkspace, createWorkspaceSaveBundle, workspaceContentHash } from "../reactive-editor/workspace-manifest";

const sessions: WorkspaceSession[] = [];
afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const dto = { id: 'doc', type: 'main-list-block', future: { retained: true }, children: [{ id: 'text', type: 'plain-text-block', text: 'Server document' }] };
const location = { folder: '.', filename: 'Notes.json' };
function setup(canvas = false) {
  const session = new WorkspaceSession(materializeLocalWorkspace(createInitialWorkspace()), { features: { canvasWorkspace: true } });
  sessions.push(session); if (canvas) session.selectPresentation('canvas');
  return { session, editor: session.editor, actions: workspaceOpen(session), signal: new AbortController().signal };
}
function server(value = dto) {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ Success: true, Data: { document: value } }), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch); return fetch;
}
describe('open workspace content', () => {
  it.each([false, true])('opens a server Document into the existing empty session (Canvas=%s)', async canvas => {
    const fetch = server(), { session, editor, actions, signal } = setup(canvas);
    const projection = session.projection, placement = await actions.serverDocument(location, signal);
    const window = editor.repository.state.contents[editor.repository.state.placements[placement].contentKey];
    const document = editor.repository.state.contents[editor.repository.state.placements[window.children[0]].contentKey];
    expect(session.projection).toBe(projection); expect(window.viewType).toBe('document-window-block');
    expect(document.payload.metadata).toMatchObject({ documentId: 'doc', ...location });
    expect(document.payload.future).toEqual({ retained: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(session.presentation.active()).toBe(canvas ? 'canvas' : 'desktop');
    if (canvas) {
      expect(session.canvasRoots()).toHaveLength(1); expect(session.canvasRoots()[0].nodeKey).toBeDefined();
      const bank = Object.values(editor.repository.state.contents).find(c => c.viewType === 'workspace-object-bank-block')!;
      expect(bank.children).toEqual([placement]);
    }
    const registered = editor.persistence.workspaceReference('doc')!;
    expect(registered.contentHash).toBe(await workspaceContentHash(dto));
    const snapshot = editor.persistence.captureWorkspace();
    const bundle = await createWorkspaceSaveBundle(snapshot.repository, [registered], 'workspace', snapshot.presentation);
    expect(bundle.documents).toHaveLength(1); expect(bundle.documents[0].expectedContentHash).toBe(registered.contentHash);
    const reopened = new WorkspaceSession(materializeLocalWorkspace(snapshot.document), { features: { canvasWorkspace: true } }); sessions.push(reopened);
    expect(reopened.editor.persistence.captureWorkspace().document).toEqual(snapshot.document);
  });
  it('reopens the live edited copy, explicitly reveals a bank Window on Desktop, and preserves independent bounds', async () => {
    const fetch = server(), { session, editor, actions, signal } = setup(true);
    const placement = await actions.serverDocument(location, signal);
    const text = Object.values(session.projection.state.nodes).find(n => n.payload.id === 'text')!;
    editor.commands.setPayloadField(text.key, 'text', 'Unsaved edit');
    const canvas = session.presentation.read()!.presentations.canvas;
    session.selectPresentation('desktop');
    expect(await actions.serverDocument(location, signal)).toBe(placement);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(editor.repository.state.contents[text.contentKey].payload.text).toBe('Unsaved edit');
    expect(session.presentation.read()!.presentations.canvas).toEqual(canvas);
    expect(Object.values(editor.repository.state.contents).find(c => c.viewType === 'image-background-block')!.children).toContain(placement);
    session.selectPresentation('canvas');
    await actions.serverDocument(location, signal);
    expect(session.presentation.read()!.presentations.canvas!.placements).toHaveLength(1);
  });
  it('adds an already-open Desktop Document to an existing empty Canvas without cloning it', async () => {
    const fetch = server(), { session, editor, actions, signal } = setup(true);
    session.selectPresentation('desktop'); const placement = await actions.serverDocument(location, signal);
    const before = editor.repository.snapshot(); session.selectPresentation('canvas');
    expect(session.canvasRoots()).toHaveLength(0);
    expect(await actions.serverDocument(location, signal)).toBe(placement);
    expect(session.canvasRoots()).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(1);
    expect(editor.repository.snapshot()).toEqual(before);
  });
  it('does not mutate on fetch failure, cancelled loading or conflicting document identity', async () => {
    const { session, editor, actions, signal } = setup(), before = editor.repository.snapshot();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    await expect(actions.serverDocument(location, signal)).rejects.toThrow('Offline'); expect(editor.repository.snapshot()).toEqual(before);
    const aborted = new AbortController(); aborted.abort(); server();
    await expect(actions.serverDocument(location, aborted.signal)).rejects.toThrow(); expect(editor.repository.snapshot()).toEqual(before);
    await actions.serverDocument(location, signal); const opened = editor.repository.snapshot();
    await expect(actions.serverDocument({ ...location, filename: 'Other.json' }, signal)).rejects.toThrow('different server file');
    expect(editor.repository.snapshot()).toEqual(opened); expect(session.projection).toBeDefined();
  });
  it('rolls back bank and layout creation if insertion fails', () => {
    const { session, editor, actions } = setup(true), before = editor.repository.snapshot(), layout = session.presentation.capture();
    const insert = editor.commands.insert.bind(editor.commands); let calls = 0;
    vi.spyOn(editor.commands, 'insert').mockImplementation((...args) => { if (++calls === 2) throw new Error('Failed insertion'); return insert(...args); });
    expect(() => actions.newDocument()).toThrow('Failed insertion');
    expect(editor.repository.snapshot()).toEqual(before); expect(session.presentation.capture()).toEqual(layout);
  });
  it('ignores a late server response after its request lifetime is cancelled', async () => {
    const { editor, actions } = setup(), before = editor.repository.snapshot();
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    const controller = new AbortController(), loading = actions.serverDocument(location, controller.signal);
    controller.abort();
    respond(new Response(JSON.stringify({ Success: true, Data: { document: dto } }), { headers: { 'Content-Type': 'application/json' } }));
    await expect(loading).rejects.toThrow(); expect(editor.repository.snapshot()).toEqual(before);
  });
  it.each([false, true])('opens images and new Documents without a workspace file (Canvas=%s)', canvas => {
    const { session, editor, actions } = setup(canvas);
    actions.image('/image-backgrounds/green-aurora.jpg'); actions.newDocument();
    expect(Object.values(editor.repository.state.contents).filter(c => c.viewType === 'image-block')).toHaveLength(1);
    expect(Object.values(editor.repository.state.contents).filter(c => c.viewType === 'document-block')).toHaveLength(1);
    expect(() => actions.image('javascript:alert(1)')).toThrow('image URL');
    if (canvas) expect(session.canvasRoots()).toHaveLength(2);
  });
});
