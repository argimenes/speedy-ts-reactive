import {it,expect,vi} from 'vitest';
import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';
import {fixtureText} from './fixture';import {decode,extract} from './extract';import {KnowledgeIndex} from './index';import {rebuild,readNative} from './files';import {liveOverlay} from './overlay';
import {CanonicalRepository} from '../../block-tree/repository';import {resourceToRepository} from '../../history/durable-core';import * as native from '../../persistence/native-resource';
const bytes=(text:string)=>new TextEncoder().encode(text);
const facts=async(i=0,n=3)=>extract(decode(bytes(fixtureText(i,n))),`folder/${i}.ink`,`hash-${i}`);
async function temp(action:(root:string)=>Promise<void>){const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-index-test-'));try{await action(root);}finally{await fs.rm(root,{recursive:true,force:true,maxRetries:3});}}
it('extracts canonical identity, tags, text and typed facts with no editor/repository admission or native changes',async()=>{
 const text=fixtureText(0,3),resource=decode(bytes(text)),before=native.nativeText(resource),f=await extract(resource,'0.ink','hash');
 expect(f.id).toBe('resource-0');expect(f.rootBlockId).toBe('resource-0-root');expect(f.tags).toEqual(['research','topic-0']);expect(f.blocks).toHaveLength(7);expect(f.annotations).toHaveLength(17);expect(f.mentions).toHaveLength(7);expect(f.mentions.filter(m=>m.kind==='document')).toHaveLength(4);expect(f.diagnostics).toEqual([]);
 expect(f.mentions.find(m=>m.definition)?.ranges).toHaveLength(2);expect(f.mentions.find(m=>m.definition)?.definition).toMatchObject({resourceId:'resource-0',blockId:'resource-0-root'});expect(native.nativeText(resource)).toBe(before);
 const raw=Object.values(resource.contents).find(c=>c.viewType==='document-block')!.payload.futureFeature as any;expect(raw.undefinedValue).toBeUndefined();expect(Object.hasOwn(raw,'undefinedValue')).toBe(true);expect(Number.isNaN(raw.notFinite)).toBe(true);
 expect(f.blocks.some(b=>b.text?.runs.some(r=>r.text.includes('🧭')))).toBe(true);
});
it('derives inverse references, Entity mentions and sources without storing authored reverse edges',async()=>{
 const index=new KnowledgeIndex();for(let i=0;i<3;i++)index.putSaved(await facts(i));expect(index.backlinks('resource-0')).toHaveLength(4);expect(index.outgoing.get('resource-0')).toHaveLength(4);expect(index.entityMentions('entity-0')).toHaveLength(3);expect(index.entitySources('entity-0')).toEqual(['resource-0']);
 expect(index.backlinks('entity-0')).toEqual([]);expect(index.tags.get('research')?.size).toBe(3);const f=index.effective.get('resource-0')!;expect(f.mentions).toHaveLength(7);
 expect(index.traverse('resource-0',5,2,100).truncated).toBe(true);expect(index.traverse('resource-0',10,10,100).ids.sort()).toEqual(['resource-0','resource-1','resource-2']);
});
it('replaces one contribution without stale tags, incoming edges or entity aggregates',async()=>{
 const index=new KnowledgeIndex();for(let i=0;i<3;i++)index.putSaved(await facts(i));const changed=await facts(0);changed.tags=['changed'];changed.mentions=[];index.putSaved(changed);expect(index.tags.get('topic-0')).toBeUndefined();expect(index.tags.get('changed')).toEqual(new Set(['resource-0']));expect(index.backlinks('resource-1')).toHaveLength(0);expect(index.entityMentions('entity-0')).toEqual([]);
});
it('keeps unknown annotations typed, ignores deleted/client-only references, rejects unknown reserved native fields',async()=>{
 const wire=JSON.parse(fixtureText(0,3)),block=wire.document.blocks.find((b:any)=>b.id==='resource-0-p0');block.properties.standoffProperties.push({id:'unknown',type:'future/syntax',value:{opaque:true},start:0,end:3},{id:'deleted',type:'codex/entity-reference',value:'ghost',start:0,end:3,isDeleted:true},{id:'preview',type:'codex/entity-reference',value:'ghost',start:0,end:3,clientOnly:true});
 const f=await extract(decode(bytes(JSON.stringify(wire))),'0.ink','hash');expect(f.annotations.find(a=>a.type==='future/syntax')?.value).toEqual({opaque:true});expect(f.mentions.some(m=>m.targetId==='ghost')).toBe(false);wire.surprise=true;expect(()=>decode(bytes(JSON.stringify(wire)))).toThrow(/reserved/);
});
it('does not cross owned-external resource boundaries or resolve foreign definitions by guess',async()=>{
 const wire=JSON.parse(fixtureText(0,3));wire.document.version=2;wire.document.blocks.find((b:any)=>b.id==='resource-0-root').children.push({placementId:'external-owner',kind:'owned',target:{kind:'external',reference:{kind:'block',targetId:'outside-root',source:{scope:'document',resourceId:'outside'},version:{kind:'unpinned'}}}});
 wire.document.blocks.find((b:any)=>b.id==='resource-0-p0').properties.standoffProperties.push({id:'foreign',annotationId:'shared',type:'codex/entity-reference',start:0,end:2,externalDefinition:{format:'codex-external-definition-gate',version:1,target:{kind:'definition',targetId:'shared',source:{scope:'document',resourceId:'outside'},version:{kind:'unpinned'}}}});
 const f=await extract(decode(bytes(JSON.stringify(wire))),'0.ink','hash');expect(f.blocks).toHaveLength(7);expect(f.diagnostics.join(' ')).toMatch(/External resource/);expect(f.diagnostics.join(' ')).toMatch(/Foreign/);expect(f.mentions).toHaveLength(7);
});
it('uses native Cell boundaries across inline images and richer actual native producer fixtures',async()=>{
 const original=await fs.readFile('artifacts/flint-b1.2/rich.mutable.json'),resource=decode(original),before=native.nativeText(resource),f=await extract(resource,'rich.ink','hash');
 expect(f.blocks.some(b=>b.type==='three-d-object-block')).toBe(true);expect(f.blocks.some(b=>b.text&&b.text.runs.length>1)).toBe(true);expect(f.annotations.some(a=>a.type==='codex/entity-reference')).toBe(true);expect(native.nativeText(resource)).toBe(before);
});
it('reads mixed native suffixes but never Markdown; hides internal paths and diagnoses symlinks',async()=>temp(async root=>{
 await fs.mkdir(path.join(root,'nested'));await fs.mkdir(path.join(root,'.mutable'));await fs.mkdir(path.join(root,'.mutable-pair-old'));
 await fs.writeFile(path.join(root,'nested/one.ink'),fixtureText(0,3));await fs.writeFile(path.join(root,'two.mutable.json'),fixtureText(1,3));await fs.writeFile(path.join(root,'source.md'),'not native');await fs.writeFile(path.join(root,'.mutable/private.ink'),fixtureText(2,3));await fs.symlink(path.join(root,'two.mutable.json'),path.join(root,'linked.ink'));
 const before=await fs.readFile(path.join(root,'nested/one.ink'));const result=await rebuild(root);expect(result.index.effective.size).toBe(2);expect(result.metrics.files).toBe(2);expect(result.diagnostics.join(' ')).toContain('symlink');expect(await fs.readFile(path.join(root,'nested/one.ink'))).toEqual(before);await expect(readNative(root,'../outside.ink')).rejects.toThrow();await expect(readNative(root,'linked.ink')).rejects.toThrow();
}));
it('fails closed on duplicate identity and conventional stem-pair collision without picking a winner',async()=>temp(async root=>{
 await fs.writeFile(path.join(root,'a.ink'),fixtureText(0,3));await fs.writeFile(path.join(root,'duplicate.mutable.json'),fixtureText(0,3));await fs.writeFile(path.join(root,'Poe.ink'),fixtureText(1,3));await fs.writeFile(path.join(root,'Poe.mutable.json'),fixtureText(2,3));
 const result=await rebuild(root);expect(result.index.effective.size).toBe(0);expect(result.index.ambiguous.has('resource-0')).toBe(true);expect(result.diagnostics.join(' ')).toMatch(/Projection name collision/);expect(result.diagnostics.join(' ')).toMatch(/Duplicate resource/);
}));
it('cancels rebuild and reports corrupt files without admitting guessed facts',async()=>temp(async root=>{
 await fs.writeFile(path.join(root,'broken.ink'),'{}');const result=await rebuild(root);expect(result.index.effective.size).toBe(0);expect(result.diagnostics).toHaveLength(1);const c=new AbortController();c.abort();await expect(rebuild(root,c.signal)).rejects.toThrow();
}));
it('suppresses saved contribution immediately, defers capture, follows Undo/Redo and cannot resurrect stale disk on disposal',async()=>{
 const index=new KnowledgeIndex(),f=await facts(0);index.putSaved(f);const repository=new CanonicalRepository(resourceToRepository(decode(bytes(fixtureText(0,3)))));
 const before=repository.snapshot(),snap=vi.spyOn(repository,'snapshot'),capture=vi.spyOn(native,'captureNative');const overlay=liveOverlay(index,repository,f.id,f.location,1000);
 try{expect(index.effective.has(f.id)).toBe(false);await overlay.flush();capture.mockClear();const root=Object.values(repository.readState().contents).find(c=>c.viewType==='document-block')!;
  repository.commit('Title edit',[{kind:'put-content',record:{...root,payload:{...root.payload,metadata:{...(root.payload.metadata as any),title:'Unsaved live title'}}}}]);
  expect(index.effective.has(f.id)).toBe(false);expect(capture).not.toHaveBeenCalled();expect(snap).not.toHaveBeenCalled();await overlay.flush();expect(index.effective.get(f.id)?.title).toBe('Unsaved live title');expect(index.saved.get(f.id)?.title).toBe(f.title);
  repository.undo();await overlay.flush();expect(index.effective.get(f.id)?.title).toBe(f.title);repository.redo();await overlay.flush();expect(index.effective.get(f.id)?.title).toBe('Unsaved live title');
  repository.undo();await overlay.flush();snap.mockRestore();expect(repository.snapshot().contents).toEqual(before.contents);
 }finally{capture.mockRestore();snap.mockRestore();overlay.dispose();}expect(index.effective.has(f.id)).toBe(false);expect(index.coverage().suppressed).toContain(f.id);
});
it('drops stale overlay extraction and keeps disappeared/ambiguous loaded sources suppressed',async()=>{
 const index=new KnowledgeIndex(),f=await facts(0);index.putSaved(f);const repository=new CanonicalRepository(resourceToRepository(decode(bytes(fixtureText(0,3))))),overlay=liveOverlay(index,repository,f.id,f.location,1000);
 try{const old=overlay.flush();const root=Object.values(repository.readState().contents).find(c=>c.viewType==='document-block')!;repository.commit('Source identity no longer present',[{kind:'put-content',record:{...root,payload:{...root.payload,metadata:{documentId:'another'}}}}]);await old;await overlay.flush();expect(index.effective.has(f.id)).toBe(false);expect(overlay.error).toMatch(/missing or ambiguous/);repository.undo();await overlay.flush();expect(index.effective.has(f.id)).toBe(true);index.rejectIdentity(f.id);await overlay.flush();expect(index.effective.has(f.id)).toBe(false);
 }finally{overlay.dispose();}
});
