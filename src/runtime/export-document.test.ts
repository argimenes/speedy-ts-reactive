// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {exportDocument} from './export-document';
import {captureNative,decodeNative,nativeBytes} from '../persistence/native-resource';
import {withDocumentContext,unavailableDocumentContext} from '../interchange/package/document-context';
import {resourceToRepository} from '../history/durable-core';
const editors:ReactiveEditor[]=[];
afterEach(()=>{editors.forEach(e=>e.dispose());editors.length=0;vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(features={}){
 const editor=new ReactiveEditor({id:'doc',type:'document-block',metadata:{title:'Semantic'},children:[{id:'text',type:'standoff-editor-block',text:'Dino',standoffProperties:[{id:'a',type:'codex/entity-reference',start:0,end:3,value:'entity'}]}]},{features});editors.push(editor);
 const downloads:Blob[]=[];vi.stubGlobal('URL',class extends URL{static createObjectURL=(blob:Blob)=>{downloads.push(blob);return 'blob:test';};static revokeObjectURL=()=>{};});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 const context=unavailableDocumentContext(captureNative(editor.repository.readState(),'doc'),'test');context.data.unresolved=[];context.data.tables=[{name:'Entity',classification:'canonical',columns:['guid','name'],rows:[[['text','entity'],['text','Dino Buzzetti']]]}];
 return {editor,downloads,context};
}
const read=async(blob:Blob)=>decodeNative(new TextEncoder().encode(await new Promise<string>(resolve=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.readAsText(blob);}))); 
it('exports through the read-only endpoint without commits, snapshots, history or Save changes',async()=>{
 const {editor,downloads,context}=fixture(),before=nativeBytes(captureNative(editor.repository.readState(),'doc')),revision=editor.repository.state.revision;
 const commit=vi.spyOn(editor.repository,'commit'),snapshot=vi.spyOn(editor.repository,'snapshot');
 const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(JSON.stringify({Success:true,Data:context})));vi.stubGlobal('fetch',fetcher);
 await exportDocument(editor,'doc',{vault:'source'});
 expect(downloads.length).toBe(1);const request=JSON.parse(String(fetcher.mock.calls[0][1]?.body));expect(request.request.documentContext.resourceId).toBe('doc');expect(request.request.entities).toEqual(['entity']);
 expect(Object.values((await read(downloads[0])).contents).some(c=>c.viewType==='mutable/package-data-block')).toBe(true);
 expect(commit).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(editor.repository.state.revision).toBe(revision);expect(nativeBytes(captureNative(editor.repository.readState(),'doc'))).toEqual(before);
});
it.each(['cancel','edit','close','cavern','failure','old-server'])('rejects %s during semantic extraction without downloading a partial success',async(reason)=>{
 const {editor,downloads,context}=fixture();let finish!:(value:Response)=>void,started!:(value?:unknown)=>void;const ready=new Promise(resolve=>started=resolve);
 vi.stubGlobal('fetch',vi.fn(()=>{started();return new Promise<Response>(resolve=>finish=resolve);}));
 let current=true;const pending=exportDocument(editor,'doc',{vault:'source',current:()=>current});await ready;
 if(reason==='cancel')editor.interchange.cancel();
 if(reason==='edit'){const view=editor.createView('edit');const node=Object.values(view.state.nodes).find(n=>n.payload.id==='text')!;editor.commands.replaceInlineRange(node.key,0,0,'changed');}
 if(reason==='close')current=false;
 if(reason==='cavern')editor.setAssetContext(()=>({cavernId:'changed',session:'other'}));
 if(reason==='old-server')context.data.selection={};
 finish(new Response(JSON.stringify(reason==='failure'?{Success:false,Error:'Reader failed'}:{Success:true,Data:context}),{status:reason==='failure'?500:200}));await pending;
 expect(downloads).toHaveLength(0);expect(editor.interchange.busy()).toBe(false);expect(editor.interchange.message()).not.toContain('Document exported');
});
it('keeps the legacy exporter available when interchange is disabled and blocks provisional Scry',async()=>{
 const {editor,downloads}=fixture({documentInterchange:false});await exportDocument(editor,'doc');expect(Object.values((await read(downloads[0])).contents).some(c=>c.viewType==='mutable/package-data-block')).toBe(false);
 editor.completionInput={beforeSave:()=>false} as any;expect(()=>exportDocument(editor,'doc')).toThrow(/Scry/);expect(downloads).toHaveLength(1);
});
it('reuses imported frozen context without resolving its identities against another Vault',async()=>{
 const {editor,context,downloads}=fixture();const native=withDocumentContext(captureNative(editor.repository.readState(),'doc'),context,{cavernId:'origin'});
 const frozen=new ReactiveEditor({state:resourceToRepository(native),references:[],issues:[],legacy:false});editors.push(frozen);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await exportDocument(frozen,'doc',{vault:'unrelated'});expect(fetcher).not.toHaveBeenCalled();expect(downloads).toHaveLength(1);
});
