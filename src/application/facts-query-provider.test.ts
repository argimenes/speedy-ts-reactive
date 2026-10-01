// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {NativeKnowledgeHost} from '../knowledge/session';
import {FactsQueryProvider} from './facts-query-provider';
import {FactsBacklinks} from './facts-backlinks';
import {CanonicalBacklinks} from './canonical-backlinks';
import {VaultKnowledge} from './vault-knowledge';
import {matchSources} from '../runtime/search-matching';
import type {DocumentVaultLease, VaultDiscovery} from './document-vault';
import {featureFlags} from '../configuration';
const cleanup:Array<()=>unknown>=[];
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();vi.restoreAllMocks();});
const prop=(id='local',extra:any={})=>({id,type:'codex/block-reference',value:'b-root',metadata:{documentId:'b'},start:2,end:4,...extra});
const runner=async(s:any,q:string,o:any)=>matchSources(s,q,o);
function fixture(properties:any[]=[prop()]) {
 const editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[
  {id:'a-root',type:'document-block',metadata:{documentId:'a',title:'Source'},children:[
   {id:'a-text',type:'standoff-editor-block',text:'A🧭é needle passage with surrounding text',standoffProperties:properties},
   {id:'plain',type:'plain-text-block',text:'plain needle 🧭'}, {id:'text',type:'text-block',text:'text needle'},
  ],relation:{leftMargin:{id:'margin',type:'standoff-editor-block',text:'margin needle'}}},
  {id:'b-root',type:'document-block',metadata:{documentId:'b',title:'Target'},children:[{id:'b-text',type:'standoff-editor-block',text:'Destination'}]},
 ]});cleanup.push(()=>editor.dispose());const view=editor.createView('fixture');
 const node=(id:string)=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
 let scan:VaultDiscovery={vault:'vault',folders:['vault'],documents:['a','b'].map(id=>({resourceId:id,title:id,location:{folder:'vault',filename:id+'.mutable.json'},state:'paired'})),markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true};
 const listeners=new Set<()=>void>();let alive=true;
 const vault={root:'vault',snapshot:()=>scan,signature:()=>JSON.stringify(scan),refresh:vi.fn(async()=>{}),isAlive:()=>alive,subscribe:(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};}} as unknown as DocumentVaultLease;
 const locations=new Map(scan.documents.map(r=>[r.resourceId,r.location]));
 const bindings={location:(id:string)=>locations.get(id),pendingVaultRelocations:()=>[]};
 const verify=vi.fn(async()=>{throw Error('Saved reads forbidden in P4');});
 const host=new NativeKnowledgeHost(editor.repository,{loadedOnly:true,debounceMs:60000,yieldControl:async()=>{}});cleanup.push(()=>host.dispose());
 const shared={host,bindings:()=>[...locations].map(([resourceId,location])=>({resourceId,location})),acquire:()=>host.acquire({root:vault.root,snapshot:vault.snapshot,native:id=>({closed:false,admitting:false,pending:false,location:bindings.location(id)}),policy:()=>({version:1,opaqueTypes:editor.registry.typesWithCapability('opaque-widget')}),subscribe:vault.subscribe,verifySaved:verify})};
 const provider=new FactsQueryProvider(shared);provider.use(vault);cleanup.push(()=>provider.dispose());
 const facts=new FactsBacklinks(provider,()=>vault);cleanup.push(()=>facts.dispose());
 const legacy=new CanonicalBacklinks(editor.repository,bindings,()=>vault,type=>editor.registry.hasCapability(type,'opaque-widget'));cleanup.push(()=>legacy.dispose());
 const query={vault:'vault',target:{documentId:'b',blockId:'b-root'}};
 const navigation=vi.fn(async()=>{}),knowledgeHost={vault:()=>vault,guard:()=>{},active:()=>({documentId:'a',projection:view}),navigate:navigation};
 const search=new VaultKnowledge(editor,bindings as any,knowledgeHost,runner,provider),oldSearch=new VaultKnowledge(editor,bindings as any,knowledgeHost,runner);cleanup.push(()=>{search.dispose();oldSearch.dispose();});
 return {editor,view,node,host,provider,facts,legacy,query,vault,search,oldSearch,locations,verify,shared,navigation,
  setScan:(fn:(scan:VaultDiscovery)=>VaultDiscovery)=>{scan=fn(scan);listeners.forEach(l=>l());},close:()=>{alive=false;listeners.forEach(l=>l());}};
}
const searchShape=(r:any)=>({hits:r.hits.map(({id,...hit}:any)=>hit),available:r.available,discovered:r.discovered,complete:r.complete});
const backlinkShape=(r:any)=>({query:r.query,target:r.target,mentions:r.mentions,coverage:{available:r.coverage.available,discovered:r.coverage.discovered,complete:r.coverage.complete}});
async function backlinksParity(f:ReturnType<typeof fixture>) {const a=await f.facts.query(f.query),b=await f.legacy.query(f.query);expect(backlinkShape(a)).toEqual(backlinkShape(b));return a;}
it('defaults to the accepted loaded Facts provider with saved coverage separately gated',()=>{expect(featureFlags.nativeKnowledge).toBe(true);expect(featureFlags.nativeKnowledgeSaved).toBe(false);});
it.each(['needle','🧭','é','Source','margin','absent',''])('C2 exact identities/ranges/snippets/order/coverage: %s',async query=>{
 const f=fixture(),before=f.editor.repository.snapshot(),snapshot=vi.spyOn(f.editor.repository,'snapshot');
 expect(searchShape(await f.search.search(query))).toEqual(searchShape(await f.oldSearch.search(query)));
 expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();expect(f.editor.repository.snapshot()).toEqual(before);
});
it('C3 preserves logical linked mention identity, segment order/deduplication, context and Entity distinction',async()=>{
 const f=fixture([prop(),prop('entity',{type:'codex/entity-reference'}),prop('gone',{isDeleted:true}),prop('find',{clientOnly:true}),{id:'s1',annotationId:'linked',start:0,end:1},{id:'s2',annotationId:'linked',start:2,end:4}]);
 f.editor.commands.setPayloadField(f.node('a-root').key,'linkedAnnotations',{linked:{type:'codex/block-reference',value:'b-root',metadata:{documentId:'b'}}});
 f.editor.commands.setPayloadField(f.node('b-text').key,'standoffProperties',[prop('self',{start:0,end:1})]);
 const result=await backlinksParity(f);expect(result.mentions).toHaveLength(3);expect(result.mentions.find(m=>m.id.includes('linked'))?.ranges).toHaveLength(2);
 f.editor.commands.insertInlineImage(f.node('a-text').key,6,{assetId:'test',src:'image.png',alt:'inline',status:'ready'});await backlinksParity(f);
});
it('keeps unrelated Entity/style/tag diagnostics distinct from Document backlink coverage and preserves empty native titles',async()=>{
 const f=fixture([prop(),prop('entity',{type:'codex/entity-reference',start:-1}),prop('style',{type:'future/style',start:-1})]);
 f.editor.commands.setPayloadField(f.node('a-root').key,'metadata',{documentId:'a',title:'',tags:42});
 const result=await backlinksParity(f);expect(result.coverage.complete).toBe(true);expect(result.mentions[0].source.title).toBe('');
 expect(searchShape(await f.search.search('needle'))).toEqual(searchShape(await f.oldSearch.search('needle')));
});
it.each(['unresolved','invalid range','bad target','duplicate','opaque','nested'])('incomplete C3 coverage and C2 omission: %s',async kind=>{
 const f=fixture();
 if(kind==='unresolved')f.editor.commands.setPayloadField(f.node('a-text').key,'standoffProperties',[{id:'x',annotationId:'missing',start:0,end:1}]);
 if(kind==='invalid range')f.editor.commands.setPayloadField(f.node('a-text').key,'standoffProperties',[prop('bad',{start:-1})]);
 if(kind==='bad target')f.editor.commands.setPayloadField(f.node('a-text').key,'standoffProperties',[prop('bad',{value:'missing'})]);
 if(kind==='duplicate')f.editor.commands.setPayloadField(f.node('a-text').key,'standoffProperties',[prop(),prop(),prop()]);
 if(kind==='opaque'){f.editor.registry.register({type:'private-widget',capabilities:['opaque-widget'],view:()=>null});f.editor.commands.insert({id:'opaque',type:'private-widget',children:[{type:'standoff-editor-block',text:'hidden needle',standoffProperties:[prop()]}]},{kind:'at',parentKey:f.node('a-root').key,index:0});}
 if(kind==='nested')f.editor.commands.insert({id:'nested',type:'document-block',children:[{type:'standoff-editor-block',text:'hidden needle',standoffProperties:[prop()]}]},{kind:'at',parentKey:f.node('a-root').key,index:0});
 const result=await backlinksParity(f);expect(result.coverage.complete).toBe(false);
 expect(searchShape(await f.search.search('needle'))).toEqual(searchShape(await f.oldSearch.search('needle')));
});
it('shares observation and retained Facts across Window handles but expires each handle independently',async()=>{
 const f=fixture(),second=new FactsQueryProvider(f.shared);second.use(f.vault);cleanup.push(()=>second.dispose());
 const a=await f.provider.prepare(f.vault),before={...f.host.metrics},bytes=f.host.index.retainedBytes;
 const b=await second.prepare(f.vault);expect(f.host.metrics.observations).toBe(before.observations);expect(f.host.index.retainedBytes).toBe(bytes);expect(a.sources[0].facts).toBe(b.sources[0].facts);
 f.provider.dispose();expect(()=>a.current()).toThrow();b.current();second.dispose();await f.host.flush();expect(f.host.index.retainedBytes).toBe(0);
});
it('revalidates host navigation and preserves current source labels/identity after title and binding changes',async()=>{
 const f=fixture();let result=await backlinksParity(f);
 const resolved=await f.legacy.resolveDerived(result,result.mentions[0],()=>f.facts.current(result));expect(resolved.passage).toMatchObject({blockId:'a-text',start:2,end:5,coordinate:'cell'});
 f.editor.commands.setPayloadField(f.node('a-root').key,'metadata',{documentId:'a',title:'Renamed'});expect(f.facts.current(result)).toBe(false);
 f.locations.set('a',{folder:'vault',filename:'moved.mutable.json'});f.setScan(s=>({...s,documents:s.documents.map(d=>d.resourceId==='a'?{...d,location:f.locations.get('a')!}:d)}));
 result=await backlinksParity(f);expect(result.mentions[0].source).toMatchObject({documentId:'a',blockId:'a-root',title:'Renamed',location:'vault/moved.mutable.json'});
 const searched=await f.search.search('needle');f.vault.refresh=async()=>{f.setScan(s=>({...s,documents:s.documents.filter(d=>d.resourceId!=='a')}));};
 await expect(f.search.activate(searched.hits[0].id)).rejects.toThrow(/stale/i);expect(f.navigation).not.toHaveBeenCalled();
});
it('reports known missing bindings on a cold scope, without relying on previous Facts slots',async()=>{
 const f=fixture();f.setScan(s=>({...s,documents:s.documents.filter(d=>d.resourceId!=='a')}));
 const result=await f.search.search('needle');expect(result.hits).toHaveLength(0);expect(result.complete).toBe(false);expect(result.diagnostics.join(' ')).toContain('vault/a.mutable.json: missing loaded binding');
});
it('invalidates on edits and Undo branches, cancellation, source disappearance and vault close without saved fallback',async()=>{
 const f=fixture(),result=await backlinksParity(f);f.editor.commands.replaceInlineRange(f.node('a-text').key,0,0,'New ');expect(f.facts.current(result)).toBe(false);await backlinksParity(f);
 f.editor.repository.undo();await backlinksParity(f);f.editor.repository.redo();await backlinksParity(f);
 const controller=new AbortController();controller.abort();await expect(f.facts.query(f.query,controller.signal)).rejects.toThrow();
 f.editor.commands.remove(f.node('a-root').key);const remaining=await backlinksParity(f);expect(remaining.mentions).toHaveLength(0);expect(f.verify).not.toHaveBeenCalled();
 f.close();expect(f.facts.current(remaining)).toBe(false);await expect(f.facts.query(f.query)).rejects.toThrow();
});
it.each(['duplicate discovery','incomplete','pending','external location','ambiguous boundary','invalid boundary','unavailable boundary'])('never falls back for %s',async kind=>{
 const f=fixture();await backlinksParity(f);
 if(kind==='duplicate discovery')f.setScan(s=>({...s,documents:[...s.documents,s.documents[0]]}));
 if(kind==='incomplete')f.setScan(s=>({...s,complete:false}));
 if(kind==='pending')f.setScan(s=>({...s,operations:[{operationId:'move',phase:'pending'}]}));
 if(kind==='external location')f.setScan(s=>({...s,documents:s.documents.map(d=>({...d,location:{folder:'vault',filename:'external.mutable.json'}}))}));
 if(kind.endsWith('boundary')){vi.spyOn(f.editor.repository,'readCanonicalResourceBoundaryCooperative').mockResolvedValue({status:kind.split(' ')[0] as 'invalid',reason:'qualification'});f.setScan(s=>({...s}));}
 const result=await f.search.search('needle');expect(result.hits).toHaveLength(0);expect(result.complete).toBe(false);expect(f.verify).not.toHaveBeenCalled();
});
it('preserves the 1,000 mention and search passage budgets',async()=>{
 const f=fixture(Array.from({length:1001},(_,i)=>prop('mention-'+i)));
 const result=await backlinksParity(f);expect(result.mentions).toHaveLength(1000);expect(result.coverage.complete).toBe(false);
 f.editor.commands.replaceInlineRange(f.node('a-text').key,0,0,'needle '.repeat(1100));
 const search=await f.search.search('needle');expect(search.hits).toHaveLength(1000);expect(searchShape(search)).toEqual(searchShape(await f.oldSearch.search('needle')));
});
it('rejects a query spanning an edit/Undo branch and cancels one Window without cancelling shared refresh',async()=>{
 const f=fixture();await f.host.flush();
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
 const original=f.host.flush.bind(f.host);vi.spyOn(f.host,'flush').mockImplementationOnce(async()=>{entered();await gate;await original();});
 const pending=f.facts.query(f.query),rejected=expect(pending).rejects.toThrow(/stale/i);await started;
 f.editor.commands.replaceInlineRange(f.node('a-text').key,0,0,'X');f.editor.repository.undo();f.editor.commands.replaceInlineRange(f.node('a-text').key,0,0,'Y');release();await rejected;
 const second=new FactsQueryProvider(f.shared);second.use(f.vault);cleanup.push(()=>second.dispose());
 const controller=new AbortController(),first=f.provider.prepare(f.vault,controller.signal);const cancelled=expect(first).rejects.toThrow();controller.abort();await cancelled;
 expect((await second.prepare(f.vault)).sources).toHaveLength(2);expect(f.host.index.retainedBytes).toBeGreaterThan(0);
});
it.each(['resources','traversal','cells','units'])('enforces the existing C2 %s budget on derived inputs',async kind=>{
 // Adapter-only budget control; canonical eligibility is exercised independently above.
 const facts=Array.from({length:kind==='resources'?201:1},(_,i)=>({id:'r'+i,rootBlockId:'root'+i,title:'Document',hasTitle:true,tags:[],annotations:[],mentions:[],diagnostics:[],blocks:kind==='resources'?[]:[{id:'text'+i,type:'standoff-editor-block',ordinal:kind==='traversal'?5001:2,cellCount:kind==='cells'?250001:0,text:{coordinate:'cell',runs:[{text:kind==='units'?'x'.repeat(2000001):'x',boundaries:[0,1]}]}}]}));
 const scan={complete:true,diagnostics:[],documents:facts.map(f=>({resourceId:f.id,title:f.title,state:'paired',location:{folder:'vault',filename:f.id+'.mutable.json'}}))};
 const vault={root:'vault',snapshot:()=>scan,signature:()=>'',isAlive:()=>true} as unknown as DocumentVaultLease;
 const lease={generation:()=>()=>{},prepare:async()=>({facts,current:()=>{}}),coverage:()=>({resources:facts.map(f=>({id:f.id,state:'live-ready'}))}),release:()=>{}};
 const provider=new FactsQueryProvider({host:{flush:async()=>{}} as any,acquire:()=>lease as any});cleanup.push(()=>provider.dispose());
 const result=await provider.search(vault,'x',undefined,runner);
 expect(result.hits).toHaveLength(0);expect(result.diagnostics.join(' ')).toMatch({resources:/200 available/,traversal:/5,000 entries/,cells:/250,000 Cells/,units:/2,000,000-character/}[kind]!);
 if(kind==='resources'){expect(result.sources).toHaveLength(200);expect(result.discovered).toBe(201);}
});
