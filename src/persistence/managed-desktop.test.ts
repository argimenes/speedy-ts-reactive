import { afterEach, describe, expect, it, vi } from 'vitest';
import { importLegacyDesktop, validateManagedContainer, validateManagedDesktop, desktopOf } from './managed-desktop';
import { materializeLocalWorkspace, parseWorkspaceManifest, createWorkspaceSaveBundle, workspaceContentHash } from '../reactive-editor/workspace-manifest';
import { ReactiveEditor } from '../reactive-editor/editor';
import { PersistenceService } from '../reactive-editor/persistence';
import { WorkspaceSession } from '../application/workspace-session';
import { saveJsonFile, type BrowserFileHandle } from '../demo/browser-json-file';

const legacy = (): any => ({ id: 'workspace', type: 'workspace-block', metadata: { extension: { preserved: true } }, children: [
  { type: 'document-window-block', metadata: { position: { x: 35, y: 42 }, size: { w: 700, h: 500 }, state: 'minimized' }, children: [
    { id: 'document-block', type: 'document-block', metadata: { documentId: 'document-one', filename: 'Notes.json', folder: 'research' }, children: [{ id: 'text', type: 'standoff-editor-block', text: 'Unsaved local content' }] },
  ] },
] });
const keys = () => ({ anchor: crypto.randomUUID(), view: `view-${crypto.randomUUID()}`, window: `window-${crypto.randomUUID()}` });
const managed = () => ({ kind: 'speedy-local-workspace', schemaVersion: 2, workspaceId: 'workspace-id', extension: { opaque: [1,2] }, root: importLegacyDesktop(legacy(), keys) });
const editors: ReactiveEditor[] = [];
function editor(value: any = legacy()) { const e = new ReactiveEditor(materializeLocalWorkspace(value)); editors.push(e); return e; }
afterEach(() => { editors.splice(0).forEach(e => e.dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete (window as any).showSaveFilePicker; });

describe('D0 durable workspace contract', () => {
  it('upgrades a detached snapshot only, reuses identities, and acknowledges only successful saves', () => {
    const e = editor(), before = e.repository.snapshot();
    const first = e.persistence.captureWorkspace({ upgrade: true });
    expect(e.repository.snapshot()).toEqual(before);
    expect(e.persistence.captureWorkspace().localValue).toBeUndefined(); // abandoned picker
    const second = e.persistence.captureWorkspace({ upgrade: true });
    expect(desktopOf(second.document)).toEqual(desktopOf(first.document));
    e.persistence.acknowledgeWorkspaceSave(second);
    const saved = e.persistence.captureWorkspace();
    expect(saved.localValue?.schemaVersion).toBe(2);
    const reopened = editor(saved.localValue);
    expect(desktopOf(reopened.persistence.captureWorkspace().document)).toEqual(desktopOf(first.document));
    const d = desktopOf(saved.document)!;
    expect(new Set([d.views[0].restoreKey, d.windows[0].restoreKey, d.views[0].anchorBlockId, 'document-one']).size).toBe(4);
    expect(JSON.stringify(saved.localValue)).not.toContain(Object.keys(before.placements)[0]);
  });

  it('uses managed geometry and closed intent as the only load authority and preserves unknown JSON', () => {
    const value = managed(), d = desktopOf(value.root)!;
    d.windows[0].bounds.x = 912; d.windows[0].state = 'closed'; d.views[0].future = { retained: true };
    value.root.metadata.workspacePresentation.presentations.desktop = d;
    value.root.children[0].metadata.position.x = -500;
    const e = editor(value), root = e.persistence.captureWorkspace().localValue!;
    expect(root.extension).toEqual(value.extension);
    expect(root.root.metadata.extension).toEqual(value.root.metadata.extension);
    expect(desktopOf(root.root)!.windows[0].bounds.x).toBe(912);
    expect(desktopOf(root.root)!.windows[0].state).toBe('closed');
    expect(desktopOf(root.root)!.views[0].future).toEqual({ retained: true });
  });

  it.each([
    ['future container', (v:any) => { v.schemaVersion = 99; }],
    ['unversioned future tree', (v:any) => { const root=v.root; delete v.kind; Object.assign(v,root); v.schemaVersion=99; }],
    ['unsupported local version', (v:any) => { v.schemaVersion=1; }],
    ['future desktop', (v:any) => { v.root.metadata.workspacePresentation.presentations.desktop.version = 99; }],
    ['duplicate membership', (v:any) => { const d=v.root.metadata.workspacePresentation.presentations.desktop; d.layout.normalOrder.push(d.windows[0].restoreKey); }],
    ['missing membership', (v:any) => { v.root.metadata.workspacePresentation.presentations.desktop.layout.normalOrder=[]; }],
    ['invalid bounds', (v:any) => { v.root.metadata.workspacePresentation.presentations.desktop.windows[0].bounds.width=0; }],
    ['ambiguous anchor', (v:any) => { v.root.children.push(structuredClone(v.root.children[0])); }],
    ['missing resource', (v:any) => { v.root.metadata.workspacePresentation.presentations.desktop.views[0].resources[0].documentId='missing'; }],
    ['unknown app', (v:any) => { v.root.metadata.workspacePresentation.presentations.desktop.views[0].appId='future-app'; }],
    ['future descriptor', (v:any) => { v.root.metadata.workspacePresentation.presentations.desktop.views[0].descriptorVersion=99; }],
    ['runtime state', (v:any) => { v.root.metadata.workspacePresentation.presentations.desktop.views[0].pendingReceipt={}; }],
    ['later layout', (v:any) => { v.root.metadata.workspacePresentation.presentations.desktop.layout.kind='split'; }],
    ['Block identity collision', (v:any) => { v.root.id=v.root.metadata.workspacePresentation.presentations.desktop.views[0].restoreKey; }],
    ['ambiguous anchor outside shell', (v:any) => { v.root.children[0].children[0].children[0].id=v.root.children[0].id; }],
    ['cycle', (v:any) => { v.root.children.push(v.root); }],
  ])('refuses %s without mutating the supplied workspace', (_name, mutate) => {
    const value=managed(); mutate(value); const before=structuredClone(value);
    expect(()=>materializeLocalWorkspace(value)).toThrow(); expect(value).toEqual(before);
  });

  it('refuses managed data in a legacy container and keeps the exclusive flag fallback', () => {
    const value=managed();
    expect(()=>materializeLocalWorkspace(value.root)).toThrow(/version 2 container/);
    expect(()=>new ReactiveEditor(materializeLocalWorkspace(value), { features: { mutableWindowManager: false } })).toThrow(/Enable/);
    const e=new ReactiveEditor(materializeLocalWorkspace(legacy()), { features: { mutableWindowManager: false } }); editors.push(e);
    expect(e.persistence.captureWorkspace().localValue).toBeUndefined();
    expect(()=>e.persistence.captureWorkspace({upgrade:true})).toThrow(/Enable/);
  });

  it('captures local content but emits no Document writes in managed server bundles', async () => {
    const e=editor(), captured=e.persistence.captureWorkspace({upgrade:true});
    const registration={documentId:'document-one', source:{kind:'document-store' as const,folder:'research',filename:'Notes.json'}, contentHash:'sha256:saved', extension: { retain:true }};
    const bundle=await createWorkspaceSaveBundle(captured.repository,[registration],'workspace-id',undefined,{root:captured.document});
    expect(bundle.manifest.schemaVersion).toBe(2); expect(bundle.documents).toEqual([]);
    expect(JSON.stringify(bundle.manifest)).not.toContain('Unsaved local content');
    expect(JSON.stringify(captured.localValue)).toContain('Unsaved local content');
    expect(bundle.manifest.documents['document-one'].extension).toEqual({retain:true});
    expect(bundle.manifest.documents['document-one'].contentHash).toBe('sha256:saved');
    expect(parseWorkspaceManifest(bundle.manifest)).toEqual(bundle.manifest);
    await expect(createWorkspaceSaveBundle(captured.repository,[],'workspace-id',undefined,{root:captured.document})).rejects.toThrow(/Save Document/);
  });

  it('keeps changes made after capture dirty, and does no persistence work during editing', () => {
    const session=new WorkspaceSession(materializeLocalWorkspace(legacy()), { features: { entityReferences:false } });
    const e=session.editor, capture=e.persistence.captureWorkspace({upgrade:true});
    const paragraph=Object.values(session.projection.state.nodes).find(n=>n.payload.id==='text')!;
    const snapshot=vi.spyOn(e.repository,'snapshot'), fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
    e.commands.replaceInlineRange(paragraph.key,0,0,'New ');
    expect(snapshot).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    e.persistence.acknowledgeWorkspaceSave(capture); expect(session.dirty()).toBe(true);
    expect(JSON.stringify(capture.localValue)).not.toContain('New Unsaved');
    session.dispose();
  });

  it('acknowledges managed layout without clearing unsaved external Document content', async () => {
    const source=editor(),cap=source.persistence.captureWorkspace({upgrade:true});
    const registration={documentId:'document-one',source:{kind:'document-store' as const,folder:'research',filename:'Notes.json'}};
    const bundle=await createWorkspaceSaveBundle(cap.repository,[registration],'workspace-id',undefined,{root:cap.document});
    const {materializeWorkspace}=await import('../reactive-editor/workspace-manifest');
    const loaded=materializeWorkspace(bundle.manifest,new Map([['document-one',legacy().children[0].children[0]]]));
    const session=new WorkspaceSession(loaded,{features:{entityReferences:false}});
    const clean=session.editor.persistence.captureWorkspace();
    session.editor.persistence.acknowledgeWorkspaceSave(clean,true);
    expect(session.dirty()).toBe(false);
    const text=Object.values(session.projection.state.nodes).find(n=>n.payload.id==='text')!;
    session.editor.commands.replaceInlineRange(text.key,0,0,'Changed ');
    const edited=session.editor.persistence.captureWorkspace();
    session.editor.persistence.acknowledgeWorkspaceSave(edited,true);
    expect(session.editor.persistence.state.unsavedWorkspaceContent).toBe(true);
    expect(session.dirty()).toBe(true);
    session.editor.persistence.acknowledgeWorkspaceSave(session.editor.persistence.captureWorkspace());
    expect(session.dirty()).toBe(false); // self-contained local Save captured the content
    session.dispose();
  });

  it('rejects missing or anonymous server resources and propagates load cancellation', async () => {
    const e=editor(), cap=e.persistence.captureWorkspace({upgrade:true});
    const registration={documentId:'document-one',source:{kind:'document-store' as const,folder:'research',filename:'Notes.json'}};
    const bundle=await createWorkspaceSaveBundle(cap.repository,[registration],'workspace-id',undefined,{root:cap.document});
    const response=(Data:unknown)=>new Response(JSON.stringify({Success:true,Data}),{headers:{'Content-Type':'application/json'}});
    vi.stubGlobal('fetch',vi.fn(async(input:any)=>String(input).includes('loadWorkspace')?response({workspace:bundle.manifest,contentHash:'hash'}):new Response(JSON.stringify({Success:false,Error:'Missing'}),{status:404})));
    await expect(PersistenceService.loadWorkspace('Desk.json')).rejects.toThrow(/not opened/);
    const controller=new AbortController(); controller.abort();
    expect(await e.persistence.saveWorkspace('New.json',{upgrade:true,createOnly:true,signal:controller.signal})).toBe(false);
    expect(e.persistence.captureWorkspace().localValue).toBeUndefined();
    vi.stubGlobal('fetch',vi.fn(async(input:any)=>String(input).includes('loadWorkspace')?response({workspace:bundle.manifest}):response({document:{type:'document-block',children:[]}})));
    await expect(PersistenceService.loadWorkspace('Desk.json')).rejects.toThrow(/not opened/);
  });
});

function handle(initial: unknown) {
  let contents=initial===undefined?'':JSON.stringify(initial);
  const write=vi.fn(async(value:any)=>{pending=String(value);}),close=vi.fn(async()=>{contents=pending;}),abort=vi.fn(async()=>{}); let pending='';
  const file={name:'Workspace.json',getFile:async()=>({text:async()=>contents} as File),createWritable:vi.fn(async()=>({write,close,abort}))} satisfies BrowserFileHandle;
  return {file,write,close,abort,read:()=>contents};
}
describe('D0 local write protection',()=>{
  it('cancels the picker and aborts a partial stream without acknowledging a format upgrade',async()=>{
    const e=editor(),capture=e.persistence.captureWorkspace({upgrade:true});
    (window as any).showSaveFilePicker=async()=>{throw new DOMException('cancel','AbortError');};
    expect(await saveJsonFile(capture.localValue,{suggestedName:'New.json',saveAs:true,workspace:{createOnly:true}})).toBeUndefined();
    expect(e.persistence.captureWorkspace().localValue).toBeUndefined();
    const h=handle(undefined);h.write.mockRejectedValueOnce(Error('disk full'));
    (window as any).showSaveFilePicker=async()=>h.file;
    await expect(saveJsonFile(capture.localValue,{suggestedName:'New.json',saveAs:true,workspace:{createOnly:true}})).rejects.toThrow('disk full');
    expect(h.abort).toHaveBeenCalledOnce(); expect(h.read()).toBe(''); expect(h.close).not.toHaveBeenCalled();
  });
  it('blocks future files, stale managed files, downgrades and in-place upgrades before opening a write stream',async()=>{
    const value=managed();
    for(const [old,next,expected,createOnly] of [
      [{...value,schemaVersion:99},legacy(),undefined,false],
      [{...legacy(),schemaVersion:99},legacy(),undefined,false],
      [value,value,undefined,false],
      [value,legacy(),value,false],
      [legacy(),value,undefined,false],
      [legacy(),value,undefined,true],
    ] as any[]){const h=handle(old);await expect(saveJsonFile(next,{suggestedName:'Workspace.json',handle:h.file,workspace:{expected,createOnly}})).rejects.toThrow();expect(h.file.createWritable).not.toHaveBeenCalled();expect(JSON.parse(h.read())).toEqual(old);}
  });
  it('writes a new managed JSON file and then safely updates the same opened file',async()=>{
    const value=managed(),h=handle(undefined);(window as any).showSaveFilePicker=async()=>h.file;
    await saveJsonFile(value,{suggestedName:'Workspace-managed.json',saveAs:true,workspace:{createOnly:true}});
    expect(JSON.parse(h.read())).toEqual(value);
    const next=structuredClone(value);next.root.metadata.extension.changed=true;
    await saveJsonFile(next,{suggestedName:'Workspace.json',handle:h.file,workspace:{expected:value}});
    expect(JSON.parse(h.read())).toEqual(next);
  });
});
