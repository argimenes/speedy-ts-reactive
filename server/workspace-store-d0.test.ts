import express from 'express';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStoreRouter } from './workspace-store';
import { importLegacyDesktop } from '../src/persistence/managed-desktop';
import { workspaceContentHash } from '../src/reactive-editor/workspace-manifest';

describe('D0 server persistence boundaries',()=>{
  let root:string,docs:string,workspaces:string,server:Server,base:string;
  const document={id:'doc-block',type:'document-block',metadata:{documentId:'doc'},children:[{type:'plain-text-block',text:'Saved content'}]};
  const source={kind:'document-store',folder:'.',filename:'Notes.json'};
  const workspace=()=>({kind:'speedy-workspace',schemaVersion:2,workspaceId:'workspace',extra:{preserve:1},documents:{doc:{documentId:'doc',source}},root:importLegacyDesktop({type:'workspace-block',children:[{id:'window',type:'document-window-block',children:[{type:'document-reference-block',metadata:{documentId:'doc'}}]}]},()=>({anchor:'window',view:`view-${crypto.randomUUID()}`,window:`window-${crypto.randomUUID()}`}))});
  beforeEach(async()=>{
    root=await fs.mkdtemp(path.join(tmpdir(),'speedy-d0-'));docs=path.join(root,'documents');workspaces=path.join(root,'workspaces');await fs.mkdir(docs);await fs.mkdir(workspaces);
    await fs.writeFile(path.join(docs,'Notes.json'),JSON.stringify(document));
    const app=express();app.use(express.json());app.use('/api',createWorkspaceStoreRouter({documentRoot:docs,workspaceRoot:workspaces}));
    server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  });
  afterEach(async()=>{vi.restoreAllMocks();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(root,{recursive:true,force:true});});
  const post=(value:any,headers:Record<string,string>={},route='saveWorkspaceBundle')=>fetch(`${base}/${route}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});

  it('round trips layout-only saves, preserves unknown fields, and detects stale concurrent writers',async()=>{
    const value=workspace(),before=await fs.readFile(path.join(docs,'Notes.json'),'utf8');
    const initial=await post({filename:'Desk.json',workspace:value,documents:[]},{'If-None-Match':'*'});expect(initial.status).toBe(200);
    const first=await initial.json();const loaded=await (await fetch(`${base}/loadWorkspaceJson?filename=Desk.json`)).json();
    expect(loaded.Data.workspace).toEqual(value);expect(loaded.Data.contentHash).toBe(first.Data.contentHash);
    const next=structuredClone(value);next.extra.preserve=2;
    const responses=await Promise.all([next,{...value,extra:{preserve:3}}].map(workspace=>post({filename:'Desk.json',workspace,documents:[]},{'If-Match':first.Data.contentHash})));
    expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
    expect(await fs.readFile(path.join(docs,'Notes.json'),'utf8')).toBe(before);
    expect([2,3]).toContain(JSON.parse(await fs.readFile(path.join(workspaces,'Desk.json'),'utf8')).extra.preserve);
    expect(await fs.readdir(workspaces)).toEqual(['Desk.json']);
  });
  it('refuses embedded writes, missing files and identity mismatches without creating a Workspace',async()=>{
    const value=workspace();
    expect((await post({filename:'Desk.json',workspace:value,documents:[{documentId:'doc'}]})).status).toBe(400);
    await fs.writeFile(path.join(docs,'Notes.json'),JSON.stringify({...document,metadata:{documentId:'other'}}));
    expect((await post({filename:'Desk.json',workspace:value,documents:[]})).status).toBe(409);
    await fs.unlink(path.join(docs,'Notes.json'));
    expect((await post({filename:'Desk.json',workspace:value,documents:[]})).status).toBe(404);
    expect(await fs.readdir(workspaces)).toEqual([]);
  });
  it('protects future and managed files from both legacy writers and refuses in-place upgrades',async()=>{
    const value=workspace(),target=path.join(workspaces,'Desk.json');
    for(const old of [{...value,schemaVersion:99},{type:'workspace-block',schemaVersion:99},value]) {
      await fs.writeFile(target,JSON.stringify(old));const before=await fs.readFile(target,'utf8');
      expect((await post({filename:'Desk.json',workspace:{type:'workspace-block'}},{},'saveWorkspaceJson')).status).toBe(409);
      const legacy={...value,schemaVersion:1,root:{type:'workspace-block'}};
      expect((await post({filename:'Desk.json',workspace:legacy,documents:[]})).status).toBe(409);
      expect(await fs.readFile(target,'utf8')).toBe(before);
    }
    await fs.writeFile(target,JSON.stringify({type:'workspace-block'}));
    expect((await post({filename:'Desk.json',workspace:value,documents:[]})).status).toBe(409);
    expect((await post({filename:'New.json',workspace:value,documents:[]},{'If-None-Match':'*'})).status).toBe(200);
  });
  it('rejects malformed desktop graphs and unsupported descriptor versions before staging',async()=>{
    for(const mutate of [(d:any)=>d.windows[0].bounds.height=-1,(d:any)=>d.layout.normalOrder=[],(d:any)=>d.views[0].descriptorVersion=9]){
      const value=workspace();mutate(value.root.metadata.workspacePresentation.presentations.desktop);
      expect((await post({filename:'Bad.json',workspace:value,documents:[]})).status).toBe(400);
    }
    expect(await fs.readdir(workspaces)).toEqual([]);
  });
  it('rolls back a legacy Document write when the following Workspace rename fails',async()=>{
    const before=await fs.readFile(path.join(docs,'Notes.json'),'utf8'),target=path.join(workspaces,'Desk.json');
    await fs.writeFile(target,JSON.stringify({type:'workspace-block',old:true}));const original=await fs.readFile(target,'utf8');
    const next={...document,children:[{type:'plain-text-block',text:'Updated'}]},contentHash=await workspaceContentHash(next);
    const value={kind:'speedy-workspace',schemaVersion:1,workspaceId:'workspace',documents:{doc:{documentId:'doc',source,contentHash}},root:{type:'workspace-block',children:[{type:'document-reference-block',metadata:{documentId:'doc'}}]}};
    const rename=fs.rename.bind(fs);vi.spyOn(fs,'rename').mockImplementation(async(from,to)=>{if(path.basename(String(to))==='Desk.json')throw Error('injected I/O failure');return rename(from,to);});
    expect((await post({filename:'Desk.json',workspace:value,documents:[{documentId:'doc',source,document:next,contentHash}]})).status).toBe(500);
    expect(await fs.readFile(path.join(docs,'Notes.json'),'utf8')).toBe(before);expect(await fs.readFile(target,'utf8')).toBe(original);
    expect(await fs.readdir(workspaces)).toEqual(['Desk.json']);expect(await fs.readdir(docs)).toEqual(['Notes.json']);
  });
  it('reports partial failure explicitly when rollback itself cannot restore a Document',async()=>{
    const target=path.join(workspaces,'Desk.json');await fs.writeFile(target,JSON.stringify({type:'workspace-block'}));
    const next={...document,children:[{type:'plain-text-block',text:'Updated'}]},contentHash=await workspaceContentHash(next);
    const value={kind:'speedy-workspace',schemaVersion:1,workspaceId:'workspace',documents:{doc:{documentId:'doc',source,contentHash}},root:{type:'workspace-block'}};
    const rename=fs.rename.bind(fs);vi.spyOn(fs,'rename').mockImplementation(async(from,to)=>{
      if(path.basename(String(to))==='Desk.json'||path.basename(String(from)).startsWith('.speedy-rollback-'))throw Error('injected failure');
      return rename(from,to);
    });
    const response=await post({filename:'Desk.json',workspace:value,documents:[{documentId:'doc',source,document:next,contentHash}]});
    expect(response.status).toBe(500);const body=await response.json();
    expect(body.Code).toBe('partial-save');expect(body.Error).toContain('Notes.json');
    expect(JSON.parse(await fs.readFile(path.join(docs,'Notes.json'),'utf8'))).toEqual(next);
  });
  it('removes a partially written staging file when staging fails',async()=>{
    const write=fs.writeFile.bind(fs);vi.spyOn(fs,'writeFile').mockImplementation(async(file,data,options:any)=>{
      if(path.basename(String(file)).startsWith('.speedy-workspace-')) {await write(file,'partial',options);throw Error('disk full');}
      return write(file,data,options);
    });
    expect((await post({filename:'Desk.json',workspace:workspace(),documents:[]})).status).toBe(500);
    expect(await fs.readdir(workspaces)).toEqual([]);
  });

});
