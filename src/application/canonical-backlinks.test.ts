// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {createSignal} from 'solid-js';
import {ReactiveEditor} from '../reactive-editor/editor';
import {CanonicalBacklinks} from './canonical-backlinks';
import type {VaultDiscovery} from './document-vault';
const stops: Array<()=>void> = [];
afterEach(()=>{for(const stop of stops.splice(0).reverse())stop();});
const prop=(id='mention',value='b-root',extra:Record<string,unknown>={})=>({id,type:'codex/block-reference',value,metadata:{documentId:'b'},start:0,end:2,...extra});
function setup(properties:any[]=[prop()]) {
 const editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[
  {id:'a-root',type:'document-block',metadata:{documentId:'a',title:'Source'},children:[{id:'a-text',type:'standoff-editor-block',text:'A🧭B source text',standoffProperties:properties}]},
  {id:'b-root',type:'document-block',metadata:{documentId:'b',title:'Target'},children:[{id:'b-text',type:'standoff-editor-block',text:'Target'}]},
 ]});const view=editor.createView('fixture');stops.push(()=>editor.dispose());
 const node=(id:string)=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
 const [scan,setScan]=createSignal<VaultDiscovery>({vault:'vault',folders:['vault'],documents:['a','b'].map(id=>({resourceId:id,title:id,location:{folder:'vault',filename:id+'.mutable.json'},state:'paired'})),markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true});
 const vault={root:'vault',snapshot:scan,signature:()=>JSON.stringify(scan()),refresh:vi.fn(async()=>{})};
 const bindings={location:(id:string)=>['a','b'].includes(id)?{folder:'vault',filename:id+'.mutable.json'}:undefined,pendingVaultRelocations:()=>[]};
 const service=new CanonicalBacklinks(editor.repository,bindings,()=>vault);stops.push(()=>service.dispose());
 const query={vault:'vault',target:{documentId:'b',blockId:'b-root'}};
 return {editor,view,node,service,query,vault,scan,setScan,bindings};
}
it('reads unmounted canonical resources without snapshots, mutations or occurrence counts',async()=>{
 const f=setup();f.editor.disposeView(f.view);const before=f.editor.repository.snapshot(),snapshot=vi.spyOn(f.editor.repository,'snapshot'),history=vi.fn();stops.push(f.editor.repository.subscribeHistoryChanges(history,()=>{}));
 const result=await f.service.query(f.query);expect(result.mentions).toHaveLength(1);expect(result.mentions[0]).toMatchObject({source:{documentId:'a',blockId:'a-root'},target:{documentId:'b',blockId:'b-root'},ranges:[{blockId:'a-text',start:0,end:3}]});expect(result.mentions[0].snippet).toContain('🧭');expect(result.coverage.complete).toBe(true);expect(snapshot).not.toHaveBeenCalled();expect(history).not.toHaveBeenCalled();snapshot.mockRestore();expect(f.editor.repository.snapshot()).toEqual(before);
 expect(await f.service.query(f.query)).toEqual(result);
});
it('counts linked segments once, separate mentions separately, and ignores deleted, Entity and Find annotations',async()=>{
 const f=setup([prop('local'),prop('gone','b-root',{isDeleted:true}),prop('entity','b-root',{type:'codex/entity-reference'}),prop('find','b-root',{clientOnly:true}),{id:'s1',annotationId:'linked',start:0,end:1},{id:'s2',annotationId:'linked',start:2,end:3}]);
 f.editor.commands.setPayloadField(f.node('a-root').key,'linkedAnnotations',{linked:{type:'codex/block-reference',value:'b-root',metadata:{documentId:'b'}}});
 const result=await f.service.query(f.query);expect(result.mentions).toHaveLength(2);expect(result.mentions.find(m=>m.id.includes('linked'))!.ranges).toHaveLength(2);
 f.editor.createView('second',f.node('a-root').placementKey);expect((await f.service.query(f.query)).mentions).toEqual(result.mentions);
});
it('rejects unsupported, unresolved and foreign definitions; diagnoses unopened and ambiguous coverage',async()=>{
 const f=setup([{id:'u',annotationId:'missing',start:0,end:1},prop('unknown','internal-block'),prop('bad','b-root',{start:-1}),{id:'foreign',annotationId:'foreign',externalDefinition:{format:'codex-external-definition-gate',version:1,target:{kind:'definition',targetId:'foreign',source:{scope:'document',resourceId:'b'},version:{kind:'unpinned'}}},start:0,end:1}]);
 f.editor.commands.setPayloadField(f.node('b-root').key,'linkedAnnotations',{foreign:{type:'codex/block-reference',value:'b-root',metadata:{documentId:'b'}}});
 f.setScan({...f.scan(),documents:[...f.scan().documents,{resourceId:'unopened',title:'Unopened',location:{folder:'vault',filename:'new.mutable.json'},state:'unenrolled'}]});
 const result=await f.service.query(f.query);expect(result.mentions).toHaveLength(0);expect(result.coverage.complete).toBe(false);expect(result.coverage.diagnostics.join(' ')).toMatch(/unopened/);expect(result.coverage.diagnostics.join(' ')).toMatch(/Foreign/);expect(result.coverage.diagnostics.join(' ')).toMatch(/Unresolved/);
 f.setScan({...f.scan(),documents:f.scan().documents.map(d=>d.resourceId==='a'?{...d,state:'ambiguous'}:d)});expect((await f.service.query(f.query)).coverage.diagnostics.join(' ')).toMatch(/ambiguous/);
});
it('does not traverse reference cycles and treats one self-reference as one mention',async()=>{
 const f=setup([prop(),prop('self','a-root',{metadata:{documentId:'a'}})]);f.editor.commands.setPayloadField(f.node('b-text').key,'standoffProperties',[prop('back','a-root',{metadata:{documentId:'a'}})]);
 expect((await f.service.query(f.query)).mentions).toHaveLength(1);expect((await f.service.query({vault:'vault',target:{documentId:'a',blockId:'a-root'}})).mentions).toHaveLength(2);
});
it('invalidates on edits, linked definition changes, deletion, Undo/Redo and source disappearance',async()=>{
 const f=setup(),changed=vi.fn(),subscription=f.service.subscribe(changed);stops.push(subscription);let result=await f.service.query(f.query);
 const snapshot=vi.spyOn(f.editor.repository,'snapshot');f.editor.commands.replaceInlineRange(f.node('a-text').key,0,0,'New ');expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();expect(changed).toHaveBeenCalled();expect(f.service.current(result)).toBe(false);expect((await f.service.query(f.query)).mentions[0].ranges[0].start).toBe(4);
 f.editor.repository.undo();result=await f.service.query(f.query);expect(result.mentions[0].ranges[0].start).toBe(0);f.editor.repository.redo();expect(f.service.current(result)).toBe(false);
 f.editor.commands.setPayloadField(f.node('a-text').key,'standoffProperties',[]);expect((await f.service.query(f.query)).mentions).toHaveLength(0);f.editor.repository.undo();expect((await f.service.query(f.query)).mentions).toHaveLength(1);
 f.editor.commands.remove(f.node('a-root').key);expect((await f.service.query(f.query)).mentions).toHaveLength(0);
});
it('rejects stale completion after Undo branch and independently cancels two consumers',async()=>{
 const f=setup();let complete!:()=>void;f.vault.refresh.mockImplementationOnce(()=>new Promise<void>(r=>{complete=r;}));const controller=new AbortController();const first=f.service.query(f.query,controller.signal);const rejected=expect(first).rejects.toThrow();controller.abort();complete();await rejected;
 const one=new AbortController(),two=new AbortController();const a=f.service.query(f.query,one.signal),b=f.service.query(f.query,two.signal);const stopped=expect(a).rejects.toThrow();one.abort();await stopped;expect((await b).mentions).toHaveLength(1);
 const pending=f.service.query(f.query);const stale=expect(pending).rejects.toThrow(/stale/);await new Promise(r=>setTimeout(r,0));f.editor.commands.replaceInlineRange(f.node('a-text').key,0,0,'X');f.editor.repository.undo();f.editor.commands.replaceInlineRange(f.node('a-text').key,0,0,'Y');await stale;
});
it('refreshes and rejects externally moved/removed sources before navigation, never rebinding',async()=>{
 const f=setup(),result=await f.service.query(f.query);f.vault.refresh.mockImplementationOnce(async()=>{f.setScan({...f.scan(),documents:f.scan().documents.filter(d=>d.resourceId!=='a')});});await expect(f.service.resolve(result,result.mentions[0])).rejects.toThrow(/stale/);expect(f.bindings.location('a')?.filename).toBe('a.mutable.json');
});
it('subscriptions and pending requests are disposable without affecting another subscriber',async()=>{
 const f=setup(),a=vi.fn(),b=vi.fn(),stopA=f.service.subscribe(a),stopB=f.service.subscribe(b);stopA();f.editor.commands.replaceInlineRange(f.node('a-text').key,0,0,'X');expect(a).not.toHaveBeenCalled();expect(b).toHaveBeenCalledTimes(1);stopB();const before=b.mock.calls.length;f.editor.repository.undo();expect(b).toHaveBeenCalledTimes(before);
 const controller=new AbortController();const pending=f.service.query(f.query,controller.signal);const rejected=expect(pending).rejects.toThrow();f.service.dispose();await rejected;
});
it('reuses unaffected resource entries while open and rebuilds local linked definitions after retarget/Undo',async()=>{
 const f=setup([{id:'segment',annotationId:'shared',start:0,end:2}]);f.editor.commands.setPayloadField(f.node('a-root').key,'linkedAnnotations',{shared:{type:'codex/block-reference',value:'b-root',metadata:{documentId:'b'}}});
 const stop=f.service.subscribe(()=>{});stops.push(stop);const scan=vi.spyOn(f.service as any,'scan');await f.service.query(f.query);expect(scan).toHaveBeenCalledTimes(2);await f.service.query(f.query);expect(scan).toHaveBeenCalledTimes(2);
 f.editor.commands.replaceInlineRange(f.node('a-text').key,0,0,'X');await f.service.query(f.query);expect(scan).toHaveBeenCalledTimes(3);
 f.editor.commands.setPayloadField(f.node('a-root').key,'linkedAnnotations',{shared:{type:'codex/block-reference',value:'a-root',metadata:{documentId:'a'}}});expect((await f.service.query(f.query)).mentions).toHaveLength(0);f.editor.repository.undo();expect((await f.service.query(f.query)).mentions).toHaveLength(1);
 stop();await f.service.query(f.query);expect(scan.mock.calls.slice(-2).map(args=>(args[0] as any).documentId)).toEqual(['a','b']);
});
it('rejects duplicate native mention IDs without merging separate mentions or reviving a third duplicate',async()=>{
 const f=setup([prop('duplicate'),prop('duplicate'),prop('duplicate')]);const result=await f.service.query(f.query);expect(result.mentions).toHaveLength(0);expect(result.coverage.diagnostics.join(' ')).toContain('Ambiguous mention');
});
