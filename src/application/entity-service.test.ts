// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import express from 'express';import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';import {webcrypto,randomUUID} from 'node:crypto';
import {SqliteKnowledgeHost} from '../../dist/server/sqlite-knowledge-host.js';
import {createNativeDocumentStoreRouter} from '../../server/native-document-store.mjs';
import {ReactiveEditor} from '../reactive-editor/editor';import {nativeDocumentSession} from '../persistence/native-session';
import {createDocumentVaults} from './document-vault';import {createNativeKnowledgeHost} from './native-knowledge-scope';import {FactsQueryProvider} from './facts-query-provider';import {DEFAULT_POLICY} from '../knowledge/policy';
import {entityService,registerEntityContext} from './entity-service';
const cleanup:Array<()=>any>=[],realFetch=globalThis.fetch;
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();vi.unstubAllGlobals();});
function bytes(id:string,entity:string,text='the city') {return JSON.stringify({format:'mutable-document',version:1,valueEncoding:'codex-authored-value-v1',resourceId:id,definitionOwnerBlockIds:[],document:{format:'codex-portable-resource-gate',version:1,resourceId:id,root:{kind:'owned',placementId:id+'-root',target:{kind:'local',blockId:id+'-doc'}},blocks:[{id:id+'-doc',type:'document-block',properties:{metadata:{documentId:id}},children:[{kind:'owned',placementId:id+'-child',target:{kind:'local',blockId:id+'-text'}}]},{id:id+'-text',type:'standoff-editor-block',properties:{standoffProperties:[{id:id+'-mention',type:'codex/entity-reference',value:entity,start:0,end:[...text].length-1}]},children:[],inline:[{kind:'text',text}]}]}});}
async function fixture(){
 vi.stubGlobal('crypto',webcrypto);const root=await fs.mkdtemp(path.join(os.tmpdir(),'p3d-service-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'vault'));const entityId=randomUUID();
 for(const id of ['a','b'])await fs.writeFile(path.join(root,`vault/${id}.mutable.json`),bytes(id,entityId,id==='a'?'the city':'Firenze'));
 const sql=new SqliteKnowledgeHost({root,debounceMs:60000});cleanup.push(()=>sql.close());const lease=await sql.acquire('vault');await sql.flush();
 const app=express();app.use('/api/sqlite/knowledge',sql.router());app.use('/api/native',createNativeDocumentStoreRouter({root,coordinate:(a:any)=>sql.foreground(a)}));const server:any=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});cleanup.push(()=>new Promise(r=>server.close(r)));vi.stubGlobal('fetch',(url:any,o:any)=>realFetch(typeof url==='string'&&url.startsWith('/')?`http://127.0.0.1:${server.address().port}${url}`:url,o));
 const editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]}),native=nativeDocumentSession(editor),vaults=createDocumentVaults(native),factory=createNativeKnowledgeHost(editor.repository,native,{read:()=>DEFAULT_POLICY,subscribe:()=>()=>{}},{progressiveSaved:true,sqliteSaved:true,debounceMs:60000,yieldControl:async()=>{}});
 cleanup.push(async()=>{await factory.dispose();vaults.dispose();editor.dispose();});const vault=await vaults.acquire('vault');await native.open({folder:'vault',filename:'a.mutable.json'});const view=editor.createView('entity-source'),node=Object.values(view.state.nodes).find(n=>n.payload.id==='a-text')!;expect(node).toBeTruthy();const facts=new FactsQueryProvider(factory);facts.use(vault);cleanup.push(()=>facts.dispose());let selected=vault;
 cleanup.push(registerEntityContext(editor,{accepts:key=>key===node.key,vault:()=>selected,facts}));const service=entityService(editor,node.key);cleanup.push(()=>service.dispose());const settle=async()=>{await vault.refresh(true);await factory.host.flush();};await settle();
 const query=(query:string,stream:'all'|'name'|'alias'|'mention'='all',scope:'document'|'vault'='vault',match:'exact'|'partial'='partial')=>service.search({query,stream,scope,match},new AbortController().signal);
 return {root,sql,lease,editor,native,vault,node,factory,service,query,settle,entityId,select:(v:any)=>selected=v};
}
it('real HTTP/worker resolves canonical names, curated aliases and live/saved mentions as independent evidence',async()=>{
 const f=await fixture(),before=await fs.readFile(path.join(f.root,'vault/a.mutable.json'));await f.service.create({id:f.entityId,operationId:randomUUID(),name:'Florence'});await f.settle();
 expect((await f.query('Florence','name')).candidates[0].id).toBe(f.entityId);
 expect(await f.service.summaries([f.entityId])).toMatchObject({complete:true,rows:[{id:f.entityId,name:'Florence',mentions:2}]});
 expect((await f.query('Firenze','alias')).candidates).toHaveLength(0);
 const mention=await f.query('Firenze','mention');expect(mention.candidates[0]).toMatchObject({id:f.entityId,evidence:[{kind:'mention',resourceId:'b',text:'Firenze'}]});expect(mention.candidates[0].evidence[0].ranges).toEqual([{blockId:'b-text',start:0,end:7}]);
 expect(Object.values(f.editor.repository.readState().contents).some(c=>c.payload.id==='b-doc')).toBe(false);
 expect((await f.query('Firenze','mention','document')).candidates).toHaveLength(0);expect((await f.query('city','mention','document','exact')).candidates).toHaveLength(0);expect((await f.query('the city','mention','document','exact')).candidates).toHaveLength(1);
 const alias=randomUUID();await f.service.alias({op:'alias-add',entityId:f.entityId,id:alias,name:'Firenze',operationId:randomUUID()});await f.settle();expect((await f.query('Firenze','alias')).candidates[0].evidence[0].kind).toBe('alias');
 const saved=await f.query('city','mention');f.editor.commands.replaceInlineRange(f.node.key,4,8,'town');expect(()=>saved.current()).toThrow();await f.factory.host.flush();expect((await f.query('city','mention','document')).candidates).toHaveLength(0);expect((await f.query('the ','mention','document','exact')).candidates[0]?.id).toBe(f.entityId);
 expect((await f.service.get(f.entityId))!.aliases.map(a=>a.name)).toEqual(['Firenze']);expect(await fs.readFile(path.join(f.root,'vault/a.mutable.json'))).toEqual(before);
 f.editor.repository.undo();await f.factory.host.flush();expect((await f.query('the city','mention','document','exact')).candidates).toHaveLength(1);
 f.select(undefined);await expect(f.service.get(f.entityId)).rejects.toThrow(/vault/);
},30000);
it('rejects duplicate/source disappearance, forged bindings, wrong vault, cancellation and stale live tokens',async()=>{
 const f=await fixture();await f.service.create({id:f.entityId,operationId:randomUUID(),name:'Florence'});await f.settle();const result=await f.query('city','mention','document');
 const signal=new AbortController();signal.abort();await expect(f.service.search({query:'x',scope:'vault',stream:'name',match:'partial'},signal.signal)).rejects.toThrow();
 const source={resourceId:'a',location:{folder:'vault',filename:'a.mutable.json'},byteHash:f.native.knowledgeEvidence('a').byteHash};
 await expect(f.sql.entities({lease:f.lease.lease,source:{...source,resourceId:'b'},request:{op:'get',id:f.entityId}})).rejects.toThrow(/evidence/);
 await fs.copyFile(path.join(f.root,'vault/a.mutable.json'),path.join(f.root,'vault/duplicate.mutable.json'));await expect(f.service.get(f.entityId)).rejects.toThrow(/evidence/);await fs.rm(path.join(f.root,'vault/duplicate.mutable.json'));
 await fs.rename(path.join(f.root,'vault/a.mutable.json'),path.join(f.root,'vault/moved.mutable.json'));await expect(f.service.get(f.entityId)).rejects.toThrow(/evidence/);
 f.editor.commands.replaceInlineRange(f.node.key,0,0,'x');expect(()=>result.current()).toThrow();
 const root=Object.values(f.editor.repository.readState().contents).find(c=>c.payload.id==='a-doc')!;f.editor.repository.commit('Disappear',[{kind:'put-content',record:{...root,payload:{...root.payload,metadata:{documentId:'elsewhere'}}}}]);await expect(f.service.get(f.entityId)).rejects.toThrow(/missing|ambiguous/);
},30000);
it('lost mutation response is explicitly unconfirmed and retrying the same attempt does not create another Entity',async()=>{
 const f=await fixture(),fetch=globalThis.fetch,input={id:randomUUID(),operationId:randomUUID(),name:'Leonardo da Vinci'};let lost=true;
 vi.stubGlobal('fetch',async(url:any,o:any)=>{const response=await fetch(url,o);if(lost&&String(url).endsWith('/entities')&&JSON.parse(o.body).request.op==='create'){lost=false;await response.arrayBuffer();throw Error('simulated response lost after commit');}return response;});
 await expect(f.service.create(input)).rejects.toThrow(/response lost/);expect((await f.service.get(input.id))?.name).toBe(input.name);
 const retry=await f.service.create(input);expect(retry.id).toBe(input.id);await f.settle();expect((await f.query('Leonardo da Vinci','name','vault','exact')).candidates.map(c=>c.id)).toEqual([input.id]);expect(f.editor.node(f.node.key)!.payload.standoffProperties).toHaveLength(1);
},30000);
it('read-only vault permits resolution but rejects canonical writes, and another vault cannot supply source authority',async()=>{
 const f=await fixture();await f.service.create({id:f.entityId,operationId:randomUUID(),name:'Florence'});await f.settle();await f.sql.close();
 const reader=new SqliteKnowledgeHost({root:f.root,readOnly:true});cleanup.push(()=>reader.close());const lease=await reader.acquire('vault'),source={resourceId:'a',location:{folder:'vault',filename:'a.mutable.json'},byteHash:f.native.knowledgeEvidence('a').byteHash};
 expect((await reader.entities({lease:lease.lease,source,request:{op:'get',id:f.entityId}})).entity.name).toBe('Florence');await expect(reader.entities({lease:lease.lease,source,request:{op:'create',id:randomUUID(),operationId:randomUUID(),name:'No write'}})).rejects.toThrow(/read-only/);
 await fs.mkdir(path.join(f.root,'other'));const other=new SqliteKnowledgeHost({root:f.root});cleanup.push(()=>other.close());const otherLease=await other.acquire('other');await other.flush();await expect(other.entities({lease:otherLease.lease,source,request:{op:'create',id:f.entityId,operationId:randomUUID(),name:'Wrong vault'}})).rejects.toThrow(/evidence/);
},30000);
it('unresolved saved definitions keep mention resolution and vault counts explicitly incomplete',async()=>{
 const f=await fixture();await f.service.create({id:f.entityId,operationId:randomUUID(),name:'Florence'});await f.settle();
 const file=path.join(f.root,'vault/b.mutable.json'),saved=JSON.parse(await fs.readFile(file,'utf8'));
 saved.document.blocks[1].properties.standoffProperties.push({id:'unresolved',annotationId:'missing-definition',start:0,end:1});await fs.writeFile(file,JSON.stringify(saved));await f.settle();
 await expect(f.query('Firenze','mention')).rejects.toThrow(/incomplete/i);
 await expect(f.service.summaries([f.entityId])).rejects.toThrow(/incomplete/i);
},30000);
