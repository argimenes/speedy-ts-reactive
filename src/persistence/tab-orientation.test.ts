// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createEffect, createRoot } from 'solid-js';
import express from 'express';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from '../rendering/register-core-views';
import { nativeDocumentSession } from './native-session';
import { parseTabCommand } from '../runtime/tab-commands';
import { captureNative, nativeText } from './native-resource';
import { createNativeDocumentStoreRouter } from '../../server/native-document-store.mjs';

const cleanup:Array<()=>any>=[];
afterEach(async()=>{for(const stop of cleanup.splice(0).reverse())await stop();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('marks only the owning native Document dirty without snapshots or unrelated status updates, and saves/reloads undo states',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mutable-tab-orientation-'));cleanup.push(()=>fs.rm(directory,{recursive:true,force:true}));
  for(const id of ['primary','unrelated']) {
    const seed=new ReactiveEditor({id,type:'document-block',metadata:{documentId:id},children:[{id:id+'-row',type:'tab-row-block',children:[{id:id+'-tab',type:'tab-block',metadata:{active:true,name:'Tab'},children:[{id:id+'-text',type:'standoff-editor-block',text:'Preserved annotated text',standoffProperties:[{id:id+'-annotation',type:'style/bold',start:0,end:8}]}]}]}]});
    await fs.writeFile(path.join(directory,id+'.mutable.json'),nativeText(captureNative(seed.repository.readState(),id)));seed.dispose();
  }
  const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root:directory,readOnly:false}));
  const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});cleanup.push(()=>new Promise(r=>server.close(r)));
  const actual=globalThis.fetch;const fetch=vi.fn((input:any,options:any)=>actual(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,options));vi.stubGlobal('fetch',fetch);
  const make=()=>{const editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]});cleanup.push(()=>editor.dispose());registerCoreViews(editor);return {editor,service:nativeDocumentSession(editor)};};
  const {editor,service}=make();
  for(const id of ['primary','unrelated'])await service.open({folder:'.',filename:id+'.mutable.json'});
  const view=editor.createView('orientation'),row=Object.values(view.state.nodes).find(n=>n.payload.id==='primary-row')!;
  const unrelated=Object.values(view.state.nodes).find(n=>n.payload.id==='unrelated')!;
  const otherView=editor.createView('other',unrelated.placementKey);
  let statusReads=0;createRoot(dispose=>{cleanup.push(dispose);createEffect(()=>{service.status('unrelated');statusReads++;});});const beforeReads=statusReads;
  const snapshot=vi.spyOn(editor.repository,'snapshot'),build=vi.spyOn(view as any,'build'),otherUpdates=vi.spyOn(otherView as any,'setState');fetch.mockClear();
  const vertical=()=>editor.commandRegistry.execute('tabs.orientation.vertical',{targetKey:row.key,args:undefined});
  vertical();editor.repository.undo();editor.repository.redo();
  expect(service.isDirty('primary')).toBe(true);expect(service.isDirty('unrelated')).toBe(false);
  expect(service.status('primary')).toBe('Document changed — Save required');expect(statusReads).toBe(beforeReads);
  expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(otherUpdates).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  snapshot.mockRestore();
  // A failed manual Save can change the message while the dirty flag stays true.
  // Orientation history must still notify this Document's status subscriber only.
  let ownStatus='';createRoot(dispose=>{cleanup.push(dispose);createEffect(()=>{ownStatus=service.status('primary');});});
  fetch.mockImplementationOnce(async()=>new Response(JSON.stringify({Success:false,Error:'Qualification save failure',PublicationStarted:false}),{status:503,headers:{'Content-Type':'application/json'}}));
  expect(await service.save('primary')).toMatchObject({phase:'failed'});
  expect(ownStatus).toContain('Qualification save failure');
  const readsAfterFailure=statusReads, afterFailureSnapshot=vi.spyOn(editor.repository,'snapshot');
  editor.repository.undo();editor.repository.redo();
  expect(ownStatus).toBe('Document changed — Save required');expect(statusReads).toBe(readsAfterFailure);
  expect(afterFailureSnapshot).not.toHaveBeenCalled();afterFailureSnapshot.mockRestore();
  expect(await service.save('primary')).toMatchObject({phase:'saved',dirty:false});
  const fresh=make();await fresh.service.open({folder:'.',filename:'primary.mutable.json'});
  expect(nativeText(captureNative(fresh.editor.repository.readState(),'primary'))).toBe(nativeText(captureNative(editor.repository.readState(),'primary')));
  expect(Object.values(fresh.editor.repository.readState().contents).find(c=>c.payload.id==='primary-row')!.payload.metadata).toEqual({orientation:'vertical'});
  editor.repository.undo();expect(service.isDirty('primary')).toBe(true);
  expect(await service.save('primary')).toMatchObject({phase:'saved',dirty:false});
  const last=make();await last.service.open({folder:'.',filename:'primary.mutable.json'});
  expect(Object.values(last.editor.repository.readState().contents).find(c=>c.payload.id==='primary-row')!.payload.metadata).toBeUndefined();
  // Slash invocation removal and structural edits share a single local commit.
  for(const command of ['tabs create vertical','tabs orientation horizontal','tab rename Renamed','tab add','tab move after','tab delete']) {
    const source=Object.values(view.state.nodes).find(n=>n.payload.id==='primary-text')!,literal='/'+command;
    editor.commands.replaceInlineRange(source.key,0,0,literal);
    const invocation=editor.textRanges.snapshot(source.key,0,literal.length), parsed=parseTabCommand(command)!;
    const snapshots=vi.spyOn(editor.repository,'snapshot');build.mockClear();otherUpdates.mockClear();fetch.mockClear();const reads=statusReads;
    editor.commandRegistry.execute(parsed.id,{targetKey:source.key,args:{...parsed.args,invocation}});
    expect(snapshots,command).not.toHaveBeenCalled();expect(build,command).not.toHaveBeenCalled();expect(otherUpdates).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(statusReads).toBe(reads);
    editor.repository.undo();editor.repository.redo();expect(snapshots).not.toHaveBeenCalled();snapshots.mockRestore();
  }
  expect(await service.save('primary')).toMatchObject({phase:'saved',dirty:false});
  const added=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.payload.id!=='primary-text'&&n.payload.id!=='unrelated-text')!;
  expect(added).toBeTruthy();editor.commands.replaceInlineRange(added.key,0,0,'New Tab text');
  expect(service.isDirty('primary')).toBe(true);expect(service.isDirty('unrelated')).toBe(false);
  expect(await service.save('primary')).toMatchObject({phase:'saved',dirty:false});
  const reread=make();await reread.service.open({folder:'.',filename:'primary.mutable.json'});
  expect(nativeText(captureNative(reread.editor.repository.readState(),'primary'))).toBe(nativeText(captureNative(editor.repository.readState(),'primary')));

});
