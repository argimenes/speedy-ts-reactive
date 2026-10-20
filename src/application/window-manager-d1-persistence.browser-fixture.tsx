/** Finite actual-browser restoration and Save qualification. All backend requests
 * and file handles are isolated fixtures; nothing can reach the user's Vault. */
import { render } from 'solid-js/web';
import { WorkspaceSession } from './workspace-session';
import { WorkspacePresentationView } from './workspace-presentation-view';
import { materializeLocalWorkspace, materializeWorkspace, createWorkspaceSaveBundle } from '../reactive-editor/workspace-manifest';
import { PersistenceService } from '../reactive-editor/persistence';
import { desktopOf } from '../persistence/managed-desktop';
import { saveJsonFile, type BrowserFileHandle } from '../demo/browser-json-file';
import '../index.css';
import '../demo/workspace-demo.css';
const settle=()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));
const trusted=(action:Record<string,unknown>)=>new Promise<any>((resolve,reject)=>{(globalThis as any).__mwmResume=(v:any)=>v.error?reject(Error(v.error)):resolve(v.result);(globalThis as any).mwmInput(JSON.stringify(action));});
export async function qualifyWindowManager(){
 const checks:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);console.log(`D1 persistence ${checks.length}: ${label}`);};
 const oldFetch=window.fetch,w=window as any,oldSave=w.showSaveFilePicker,oldOpen=w.showOpenFilePicker;
 let session:WorkspaceSession|undefined,stop:(()=>void)|undefined,stopInput:(()=>void)|undefined;
 const host=document.body.appendChild(document.createElement('main'));host.className='workspace-demo workspace-demo--canonical';host.dataset.windowWorkArea='';
 const doc={id:'document',type:'document-block',metadata:{documentId:'document'},children:[{id:'text',type:'standoff-editor-block',text:'Saved text'}]};
 const proposition={id:'canonical-proposition',blockId:'canonical-proposition-block',name:'Saved proposition',text:'Canonical text',revision:1,modifiedUtc:'2026-10-20',annotations:[],attributes:{thesis:{version:1,archived:true}}};
 const success=(Data:any)=>new Response(JSON.stringify({Success:true,Data}));
 let missing=false,wrong=false,vaultGuid='fixture-vault',hold=false,release:((response:Response)=>void)|undefined,stored:any,saves:any[]=[];
 const reads:any[]=[];
 window.fetch=(async(input:any,init?:RequestInit)=>{
  const url=String(input);
  if(url==='/api/native/vault/default')return success({vault:'/fixture'});
  if(url==='/api/sqlite/knowledge/propositions'){
   const body=JSON.parse(String(init?.body)),request=body.request;reads.push(request);
   if(request.op==='context')return success({vaultGuid});
   if(request.op==='list')return success({rows:[],next:null});
   if(request.op==='get')return hold?new Promise<Response>(r=>release=r):missing?new Response(JSON.stringify({Success:false,Error:'Deleted Proposition'}),{status:404}):success({proposition:{...proposition,id:wrong?'wrong':proposition.id}});
   throw Error('Restoration attempted a domain mutation');
  }
  if(url.startsWith('/api/loadDocumentJson'))return missing?new Response(JSON.stringify({Success:false,Error:'Document missing'}),{status:404}):success({document:wrong?{...doc,metadata:{documentId:'wrong'}}:doc});
  if(url.startsWith('/api/loadWorkspaceJson'))return success({workspace:stored,contentHash:'fixture-hash'});
  if(url==='/api/saveWorkspaceBundle'){const body=JSON.parse(String(init?.body));saves.push(body);stored=body.workspace;return success({contentHash:'fixture-hash'});}
  return new Response(JSON.stringify({Success:false,Error:'No fixture backend'}),{status:503});
 }) as typeof fetch;
 const mount=(value:any,loaded=false)=>{stopInput?.();stop?.();session?.dispose();host.replaceChildren();session=new WorkspaceSession(loaded?value:materializeLocalWorkspace(value),{features:{entityReferences:false}});const s=session;stopInput=s.editor.installGateway(document);stop=render(()=><WorkspacePresentationView session={s}/>,host);return s;};
 let contents='',pending='',failWrite=false;
 const handle:BrowserFileHandle={name:'D1.json',getFile:async()=>new File([contents],'D1.json'),createWritable:async()=>({write:async value=>{pending=String(value);if(failWrite)throw Error('storage failure');},close:async()=>{contents=pending;},abort:async()=>{pending='';}})};
 try{
  let s=mount({id:'workspace',type:'workspace-block',children:[{id:'ink',type:'document-window-block',metadata:{title:'Ink',size:{w:700,h:500}},children:[doc]},{id:'thesis',type:'window-block',metadata:{title:'Thesis',position:{x:720,y:40},size:{w:700,h:650}},children:[{id:'thesis-app',type:'thesis-application-block'}]}]});await settle();await settle();
  const node=(id:string)=>Object.values(s.projection.state.nodes).find(n=>n.payload.id===id)!;
  s.windowManager!.named.save('Floating');s.windowManager!.layout.tile(node('thesis').key,node('ink').key,'tab');s.windowManager!.named.save('Tabs');
  const capture=s.editor.persistence.captureWorkspace({upgrade:true});
  check(desktopOf(capture.document)!.version===4&&capture.localValue?.schemaVersion===2,'D1 extends Desktop inside existing JSON container');
  w.showSaveFilePicker=async()=>{throw new DOMException('Canceled','AbortError');};
  check(await saveJsonFile(capture.localValue,{suggestedName:'D1.json',saveAs:true,workspace:{createOnly:true}})===undefined&&s.dirty(),'picker cancellation preserves dirty arrangement state');
  w.showSaveFilePicker=async()=>handle;failWrite=true;try{await saveJsonFile(capture.localValue,{suggestedName:'D1.json',saveAs:true,workspace:{createOnly:true}});}catch{}
  check(contents===''&&pending===''&&s.dirty(),'failed local write aborts without acknowledgement');failWrite=false;
  await saveJsonFile(capture.localValue,{suggestedName:'D1.json',saveAs:true,workspace:{createOnly:true}});s.editor.persistence.acknowledgeWorkspaceSave(capture);check(!s.dirty(),'successful local Save acknowledges the captured revision');
  s=mount(JSON.parse(contents));await settle();check(s.windowManager!.named.arrangements().length===2&&s.windowManager!.layout.solution().tabs.length===1,'local reopen restores both arrangements and shell tabs');
  const durable=desktopOf(s.editor.persistence.captureWorkspace().document)!;
  // Save only a canonical reference. Two independent application views share it.
  const value=JSON.parse(contents),d=value.root.metadata.workspacePresentation.presentations.desktop;
  const thesisView=d.views.find((v:any)=>v.appId==='thesis');thesisView.resources=[{kind:'proposition',scope:'vault',vaultGuid:'fixture-vault',vault:'/fixture',entityGuid:proposition.id}];
  s=mount(value);await settle();await settle();
  const draft=document.querySelector<HTMLElement>('[aria-label="Proposition text"]')!;
  check(draft?.textContent==='Canonical text','saved archived Proposition restores by exact Vault and Entity identity');
  check(document.querySelector('.thesis')?.textContent?.includes('Restore'),'archived Proposition remains resolvable');
  const owner=draft.closest<HTMLElement>('[data-mwm-window]')!.dataset.mwmWindow!;s.windowManager!.lifecycle.reveal(owner);await settle();draft.focus();await trusted({type:'text',text:'Unsaved '});await settle();
  const saved=s.editor.persistence.captureWorkspace();check(!JSON.stringify(saved.localValue).includes('Unsaved '),'unsaved Proposition edits are excluded from workspace persistence');
  check(desktopOf(saved.document)!.views.find(v=>v.appId==='thesis')!.resources[0].entityGuid===proposition.id,'Workspace Save retains the canonical Proposition identity');
  check(!reads.some(r=>['create','update','archive','restore'].includes(r.op)),'restoration and Workspace Save never mutate canonical propositions');
  const twins=structuredClone(value),td=twins.root.metadata.workspacePresentation.presentations.desktop,originalView=td.views.find((v:any)=>v.appId==='thesis'),originalWindow=td.windows.find((w:any)=>w.view===originalView.restoreKey);
  const secondView={...structuredClone(originalView),restoreKey:`view-${crypto.randomUUID()}`,anchorBlockId:'thesis-two'},secondWindow={...structuredClone(originalWindow),restoreKey:`window-${crypto.randomUUID()}`,view:secondView.restoreKey};
  const secondAnchor=structuredClone(twins.root.children[1]);secondAnchor.id='thesis-two';secondAnchor.children[0].id='thesis-app-two';twins.root.children.push(secondAnchor);td.views.push(secondView);td.windows.push(secondWindow);td.layout.normalOrder.push(secondWindow.restoreKey);td.layout.floating.push(secondWindow.restoreKey);
  s=mount(twins);await settle();await settle();const drafts=[...document.querySelectorAll<HTMLElement>('[aria-label="Proposition text"]')];check(drafts.length===2&&drafts.every(d=>d.textContent==='Canonical text'),'two saved views reopen the same canonical Proposition as independent editing sessions');
  s.windowManager!.lifecycle.reveal(drafts[1].closest<HTMLElement>('[data-mwm-window]')!.dataset.mwmWindow!);await settle();drafts[1].focus();await trusted({type:'text',text:'Independent '});await settle();check(drafts[0].textContent==='Canonical text'&&drafts[1].textContent?.includes('Independent'),'editing one restored Proposition view leaves the other draft unchanged');
  const foreign=structuredClone(value);foreign.root.metadata.workspacePresentation.presentations.desktop.views.find((v:any)=>v.appId==='thesis').resources[0].cavernId='other-cavern';s=mount(foreign);await settle();check(document.querySelector('[aria-label="Unavailable Proposition"]')?.textContent?.includes('different Cavern'),'cross-Cavern resource descriptor is refused without rebinding');
  missing=true;s=mount(value);await settle();await settle();check(!!document.querySelector('[aria-label="Unavailable Proposition"]'),'deleted Proposition leaves a recoverable placeholder');
  const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('[aria-label="Unavailable Proposition"] button')].find(b=>b.textContent===label)!;
  missing=false;wrong=true;button('Retry').click();await settle();await settle();check(document.querySelector('[aria-label="Unavailable Proposition"]')?.textContent?.includes('identity'),'Retry refuses a wrong Entity identity');
  wrong=false;vaultGuid='wrong-vault';button('Retry').click();await settle();await settle();check(document.querySelector('[aria-label="Unavailable Proposition"]')?.textContent?.includes('different identity'),'Retry refuses a different Vault');
  vaultGuid='fixture-vault';hold=true;button('Retry').click();await settle();button('Cancel restoration').click();release!(success({proposition}));await settle();check(!document.querySelector('[aria-label="Proposition text"]'),'canceled late resolution cannot replace the placeholder');hold=false;
  button('Retry').click();await settle();await settle();check(document.querySelector('[aria-label="Proposition text"]')?.textContent==='Canonical text','Retry recovers the original resource without duplication');
  const localMissing=structuredClone(value);localMissing.root.children[0].children=[];s=mount(localMissing);await settle();await settle();check(!!document.querySelector('[aria-label="Unavailable window"]'),'local missing embedded Document retains its window and exact resource descriptor');
  w.showOpenFilePicker=async()=>[{name:'Located.json',getFile:async()=>new File([JSON.stringify({...doc,metadata:{documentId:'wrong'}})],'Located.json')}];
  [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Unavailable window"] button')].find(b=>b.textContent==='Locate / Relink Document…')!.click();await settle();await settle();check(document.querySelector('[aria-label="Unavailable window"]')?.textContent?.includes('expected Document identity'),'local Locate refuses a wrong identity despite the chosen filename');
  w.showOpenFilePicker=async()=>[{name:'Different-name.json',getFile:async()=>new File([JSON.stringify(doc)],'Different-name.json')}];
  [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Unavailable window"] button')].find(b=>b.textContent==='Locate / Relink Document…')!.click();await settle();await settle();check(!!s.editor.mounts.get(node('text').key),'local Locate restores the exact Document identity regardless of filename');
  const cap=s.editor.persistence.captureWorkspace();s.editor.persistence.registerWorkspaceDocument(node('document').contentKey,'document','.','Original.json');
  check(await s.editor.persistence.saveWorkspace('Server.json',{createOnly:true}),'server Save succeeds with named arrangements');check(saves.at(-1).documents.length===0,'server managed Save writes no Document content');
  const manifest=structuredClone(stored);missing=true;
  const loaded=await PersistenceService.loadWorkspace('Server.json');s=mount(loaded,true);await settle();await settle();check(!!document.querySelector('.workspace-document-reference')&&!!document.querySelector('[aria-label="Unavailable Proposition"]'),'mixed missing Document and Proposition restore as independent placeholders');
  check(await s.editor.persistence.saveWorkspace('Server.json'),'partial-restoration server workspace remains explicitly saveable');check(stored.documents.document.unavailable===true,'server round trip retains unresolved identity and original source');
  missing=false;wrong=true;check(!await s.editor.persistence.resolveWorkspaceDocument('document',{kind:'document-store',folder:'.',filename:'Moved.json'}),'Document Locate/Relink rejects a wrong identity');
  wrong=false;check(await s.editor.persistence.resolveWorkspaceDocument('document',{kind:'document-store',folder:'.',filename:'Moved.json'}),'Document Locate/Relink accepts the exact original identity');await settle();
  check(!!s.editor.mounts.get(node('text').key),'recovered Document mounts in the original window');
  check(s.editor.persistence.workspaceReference('document')?.source.filename==='Moved.json','successful explicit Relink records the new source location');
  const unsupported=structuredClone(value);unsupported.root.metadata.workspacePresentation.presentations.desktop.views.find((v:any)=>v.appId==='thesis').descriptorVersion=99;s=mount(unsupported);await settle();check(!!document.querySelector('[aria-label="Unavailable window"]'),'unknown application descriptor becomes a placeholder');
  check(desktopOf(s.editor.persistence.captureWorkspace().document)!.views.some(v=>v.descriptorVersion===99),'unsupported descriptor round trips unchanged');
  const future=structuredClone(value);future.root.metadata.workspacePresentation.presentations.desktop.version=99;let rejected=false;try{materializeLocalWorkspace(future);}catch{rejected=true;}check(rejected,'unsupported future Desktop version rejects before replacing a live workspace');
  let disabled=false;try{new WorkspaceSession(materializeLocalWorkspace(value),{features:{mutableWindowManager:false}});}catch{disabled=true;}check(disabled,'flag-disabled path refuses D1 instead of entering both renderers');
  check(durable.windows.map(w=>w.restoreKey).join()===desktopOf(capture.document)!.windows.map(w=>w.restoreKey).join(),'D0 durable restore identities survive D1 Save/Open');
  return {checks,userAgent:navigator.userAgent,domainReads:reads.length,serverSaves:saves.length};
 }finally{stopInput?.();stop?.();session?.dispose();host.remove();window.fetch=oldFetch;w.showSaveFilePicker=oldSave;w.showOpenFilePicker=oldOpen;}
}
