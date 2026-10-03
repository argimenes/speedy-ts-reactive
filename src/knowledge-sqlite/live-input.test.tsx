// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
import {createDocumentVaults} from '../application/document-vault';
import {sqliteIndexLifecycle} from '../application/sqlite-index-lifecycle';
it('typing, style, Entity annotation, structural editing and Undo stay live with an open SQLite lifecycle',async()=>{
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>new Response(JSON.stringify({Success:true,Data:String(url).endsWith('/open')?{lease:'lease',readOnly:false}:{session:'session',coverage:{complete:true}}})));
 const editor=new ReactiveEditor(materializeLocalWorkspace({id:'w',type:'workspace-block',children:[{id:'doc',type:'document-block',metadata:{documentId:'resource'},children:[{id:'text',type:'standoff-editor-block',text:'Edgar Allan Poe'}]}]}));
 const vaults=createDocumentVaults({establishVault:async()=>({}),discoverVault:async()=>({vault:'.',folders:[],documents:[],markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true})} as any,r=>sqliteIndexLifecycle(r,{version:1,opaqueTypes:[]}));
 try{const lease=await vaults.acquire('.');await vi.waitFor(()=>expect(network).toHaveBeenCalledTimes(2));const view=editor.createView('input'),node=Object.values(view.state.nodes).find(n=>n.payload.id==='text')!;
   editor.commands.replaceInlineRange(node.key,0,0,'The ');
   editor.rangeAnnotations.apply([editor.textRanges.snapshot(node.key,0,3)],'bold');
   editor.linkedAnnotations.createForSegments([{nodeKey:node.key,start:4,end:19}],'codex/entity-reference','poe');
   const parent=Object.values(view.state.nodes).find(n=>n.payload.id==='doc')!;editor.commands.insert({id:'new',type:'plain-text-block',text:'New'},{kind:'at',parentKey:parent.key,index:1});editor.repository.undo();editor.repository.redo();
   await new Promise(r=>setTimeout(r,120));expect(network).toHaveBeenCalledTimes(2);expect(network.mock.calls.every(([url])=>!String(url).includes('save'))).toBe(true);lease.release();
 }finally{vaults.dispose();editor.dispose();network.mockRestore();}
});
