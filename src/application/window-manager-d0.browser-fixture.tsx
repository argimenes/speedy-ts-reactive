/** Finite browser checks. No filesystem/vault API is reachable from this fixture. */
import { render } from 'solid-js/web';
import { WorkspaceSession } from './workspace-session';
import { WorkspacePresentationView } from './workspace-presentation-view';
import { materializeLocalWorkspace, workspaceContentHash } from '../reactive-editor/workspace-manifest';
import { PersistenceService } from '../reactive-editor/persistence';
import { desktopOf } from '../persistence/managed-desktop';
import { saveJsonFile, openJsonFile, type BrowserFileHandle } from '../demo/browser-json-file';
import '../index.css';
import '../demo/workspace-demo.css';
const settle=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
const trusted=(action:Record<string,unknown>)=>new Promise<any>((resolve,reject)=>{(globalThis as any).__mwmResume=(v:any)=>v.error?reject(Error(v.error)):resolve(v.result);(globalThis as any).mwmInput(JSON.stringify(action));});
export async function qualifyWindowManager(){
  const checks:string[]=[];
  const check=(value:unknown,label:string)=>{if(!value)throw Error(label);checks.push(label);console.log(`D0 ${checks.length}: ${label}`);};
  let session:WorkspaceSession|undefined,unmount:(()=>void)|undefined,stopInput:(()=>void)|undefined;
  const originalFetch=window.fetch, savedRequests:any[]=[];
  let stored:any,hash:string|undefined;
  const savedDocument={id:'doc-block',type:'document-block',metadata:{documentId:'doc',folder:'research',filename:'Notes.json'},children:[{id:'text',type:'standoff-editor-block',text:'Saved content'}]};
  const legacy={id:'workspace',type:'workspace-block',children:[{type:'document-window-block',metadata:{title:'D0 Ink',position:{x:30,y:60},size:{w:700,h:550}},children:[structuredClone(savedDocument)]},{id:'other',type:'window-block',metadata:{title:'Other',position:{x:850,y:60},size:{w:300,h:300}},children:[{type:'plain-text-block',text:'Other view'}]}]};
  const response=(Data:any)=>new Response(JSON.stringify({Success:true,Data}),{headers:{'Content-Type':'application/json'}});
  window.fetch=(async(input:any,init?:RequestInit)=>{
    const url=String(input);
    if(url==='/api/saveWorkspaceBundle'){
      const request=JSON.parse(String(init?.body));savedRequests.push(request);stored=request.workspace;hash=await workspaceContentHash(stored);return response({contentHash:hash});
    }
    if(url.startsWith('/api/loadWorkspaceJson'))return response({workspace:stored,contentHash:hash});
    if(url.startsWith('/api/loadDocumentJson'))return response({document:structuredClone(savedDocument)});
    return new Response(JSON.stringify({Success:false,Error:'D0 fixture has no backend'}),{status:503});
  }) as typeof fetch;
  const host=document.body.appendChild(document.createElement('main'));host.className='workspace-demo workspace-demo--canonical';host.dataset.windowWorkArea='';
  const mount=(value:any)=>{
    stopInput?.();unmount?.();session?.dispose();host.replaceChildren();
    session=new WorkspaceSession(materializeLocalWorkspace(value),{features:{entityReferences:false}});
    const current=session;stopInput=current.editor.installGateway(document);unmount=render(()=><WorkspacePresentationView session={current}/>,host);return current;
  };
  let fileContents='',pending='',writeCount=0;
  const handle:BrowserFileHandle={name:'Workspace-managed.json',getFile:async()=>new File([fileContents],'Workspace-managed.json',{type:'application/json'}),createWritable:async()=>({write:async value=>{writeCount++;pending=String(value);},close:async()=>{fileContents=pending;},abort:async()=>{pending='';}})};
  const w=window as any;
  try{
    const s=mount(legacy);await settle();
    const node=Object.values(s.projection.state.nodes).find(n=>n.payload.id==='text')!;
    const owner=s.windowManager!.ownerForNode(node.key)!;
    check(!!owner&&!!host.querySelector('[data-mwm-window]'),'real retained Desktop windows are mounted');
    s.editor.mounts.get(node.key)!.focus();s.editor.mounts.get(node.key)!.restoreInlineSelection?.({anchor:0,head:0});await settle();
    await trusted({type:'text',text:'Browser edit '});await settle();
    check(s.editor.repository.state.revision>0,'trusted browser typing changes the open Ink Document');
    const snapshot=s.editor.persistence.captureWorkspace({upgrade:true});
    check(snapshot.localValue?.schemaVersion===2&&JSON.stringify(snapshot.localValue).includes('Browser edit'),'local capture includes current unsaved Document content');
    check(!s.editor.persistence.captureWorkspace().localValue,'preparing upgrade does not change the session format');
    w.showSaveFilePicker=async()=>{throw new DOMException('cancel','AbortError');};
    check(await saveJsonFile(snapshot.localValue,{suggestedName:'Workspace-managed.json',saveAs:true,workspace:{createOnly:true}})===undefined,'cancelled browser picker makes no write');
    check(writeCount===0&&!s.editor.persistence.captureWorkspace().localValue,'picker cancellation leaves format and dirty state unacknowledged');
    w.showSaveFilePicker=async()=>handle;
    await saveJsonFile(snapshot.localValue,{suggestedName:'Workspace-managed.json',saveAs:true,workspace:{createOnly:true}});
    s.editor.persistence.acknowledgeWorkspaceSave(snapshot);
    check(writeCount===1&&!s.dirty(),'successful local write acknowledges captured layout');
    const savedKeys=JSON.stringify(desktopOf(snapshot.document)!.views.map(v=>v.restoreKey));
    w.showOpenFilePicker=async()=>[handle];const opened=await openJsonFile();
    const reopened=mount(opened!.value);await settle();
    check(JSON.stringify(desktopOf(reopened.editor.persistence.captureWorkspace().document)!.views.map(v=>v.restoreKey))===savedKeys,'local Save/Open retains durable view identities across new runtime sessions');
    const ink=Object.values(reopened.projection.state.nodes).find(n=>n.payload.id==='text')!,inkOwner=reopened.windowManager!.ownerForNode(ink.key)!;
    reopened.windowManager!.lifecycle.minimize(inkOwner);await settle();
    const minimized=reopened.editor.persistence.captureWorkspace();
    check(desktopOf(minimized.document)!.windows.some(w=>w.state==='minimized'),'minimized intent is captured in the managed descriptor');
    const again=mount(minimized.localValue);await settle();
    check(host.querySelectorAll('[data-window-icon]').length>0,'reopened minimized managed view has its restore icon');
    const icon=host.querySelector<HTMLElement>('[data-window-icon]')!,rect=icon.getBoundingClientRect();
    await trusted({type:'click',x:rect.x+rect.width/2,y:rect.y+rect.height/2});await settle();
    check(desktopOf(again.editor.persistence.captureWorkspace().document)!.windows.every(w=>w.state!=='minimized'),'real icon click restores the reopened window');
    const current=again.editor.persistence.captureWorkspace();
    fileContents=JSON.stringify({...current.localValue,schemaVersion:99});let error='';
    try{await saveJsonFile(current.localValue,{suggestedName:handle.name,handle,workspace:{expected:opened!.value}});}catch(e){error=String(e);}
    check(/Unsupported/.test(error)&&writeCount===1,'future-version local file is protected before opening a write stream');
    const doc=Object.values(again.editor.repository.state.contents).find(c=>c.viewType==='document-block')!;
    again.editor.persistence.registerWorkspaceDocument(doc.key,'doc','research','Notes.json',undefined,await workspaceContentHash(savedDocument));
    check(await again.editor.persistence.saveWorkspace('Managed.json',{createOnly:true}),'managed server Save succeeds through the real persistence client');
    check(savedRequests.length===1&&savedRequests[0].documents.length===0,'server layout Save sends no Document writes');
    check(again.dirty()&&again.editor.persistence.state.unsavedWorkspaceContent,'server layout Save retains the unsaved external Document indication');
    check(!JSON.stringify(stored).includes('Browser edit'),'server manifest contains references rather than unsaved Document content');
    const serverLoaded=await PersistenceService.loadWorkspace('Managed.json');
    check(serverLoaded.manifest?.schemaVersion===2&&serverLoaded.references.length===1,'server manifest load resolves the separately saved Document');
    const controller=new AbortController();controller.abort();
    check(!await again.editor.persistence.saveWorkspace('Cancelled.json',{createOnly:true,signal:controller.signal})&&savedRequests.length===1,'cancelled server save dispatches no request');
    const future=structuredClone(current.localValue!);future.schemaVersion=99;let refused=false;try{materializeLocalWorkspace(future);}catch{refused=true;}
    check(refused&&!!host.querySelector('[data-mwm-window]'),'rejected future load leaves the mounted editing session intact');
    check(!/focusLease|modalStack|pendingReceipt|runtimeWindowId/.test(JSON.stringify(current.localValue)),'durable capture contains no modal, focus-lease or pending-receipt state');
    return {milestone:'D0',browser:navigator.userAgent,checks,limitations:['Native picker interaction is simulated with real File objects and in-memory file handles.','Server client responses are in memory; separate HTTP integration tests exercise the real server and temporary files.']};
  }finally{stopInput?.();unmount?.();session?.dispose();host.remove();window.fetch=originalFetch;delete w.showSaveFilePicker;delete w.showOpenFilePicker;}
}
