/** Release qualification only. Reuses accepted real Entity/Thesis C interactions. */
import {qualifyWindowManager as qualifyTools} from './window-manager-c.browser-fixture';
import {render} from 'solid-js/web';
import {WorkspaceSession} from './workspace-session';
import {WorkspacePresentationView} from './workspace-presentation-view';
import {WorkspacePresentations} from '../demo/workspace-presentations';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
import '../index.css';
import '../demo/workspace-demo.css';
const settle=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
const trusted=(action:object)=>new Promise<void>((resolve,reject)=>{(globalThis as any).__mwmResume=(r:any)=>r.error?reject(Error(r.error)):resolve();(globalThis as any).mwmInput(JSON.stringify(action));});
const click=async(el:HTMLElement)=>{const r=el.getBoundingClientRect();await trusted({type:'click',x:r.x+r.width/2,y:r.y+r.height/2});await settle();};
export async function qualifyWindowManager(){
 const tools=await qualifyTools(),checks:string[]=[],requests:string[]=[];
 const check=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label);console.log('Phase E: '+label);};
 const originalFetch=window.fetch;
 window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{requests.push(String(input));const ok=(Data:unknown)=>new Response(JSON.stringify({Success:true,Data}),{headers:{'Content-Type':'application/json'}});
  if(String(input)==='/api/native/vault/default')return ok({vault:'/in-memory-fixture'});
  if(String(input)==='/api/sqlite/knowledge/propositions'){const request=JSON.parse(String(init?.body)).request;return ok(request.op==='context'?{vaultGuid:'fixture-vault'}:{rows:[],next:null});}
  return new Response(JSON.stringify({Success:false,Error:'isolated fixture'}),{status:503});
 }) as typeof fetch;
 const session=new WorkspaceSession(materializeLocalWorkspace({id:'phase-e',type:'workspace-block',children:[{id:'ink-window',type:'document-window-block',metadata:{title:'Phase E Ink',position:{x:25,y:40},size:{w:840,h:620}},children:[{id:'ink-doc',type:'document-block',metadata:{documentId:'ink-resource'},children:[{id:'ink-text',type:'standoff-editor-block',text:'Canonical Desktop Canvas text.',standoffProperties:[{id:'a',type:'style/bold',start:0,end:3,value:'original'}]}]}]}]}),{features:{canvasWorkspace:true,presentationProbe:false,entityReferences:false,nativeKnowledge:false}});
 const {editor,projection,windowManager:manager}=session;
 const host=document.body.appendChild(document.createElement('main'));host.className='workspace-demo workspace-demo--canonical';host.dataset.windowWorkArea='';
 const stop=render(()=><><div style={{position:'fixed',top:'0',left:'0','z-index':20000}}><WorkspacePresentations session={session}/></div><WorkspacePresentationView session={session}/></>,host),input=editor.installGateway(document);
 const button=(label:string,root:ParentNode=document)=>[...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!;
 try{
  await settle();const win=Object.values(projection.state.nodes).find(n=>n.payload.id==='ink-window')!,text=Object.values(projection.state.nodes).find(n=>n.payload.id==='ink-text')!;
  const mount=()=>editor.mounts.get(text.key)!;mount().focus();mount().restoreInlineSelection!({anchor:2,head:2});
  await trusted({type:'key',key:'.',code:'Period',modifiers:2});await settle();
  const monitor=document.querySelector<HTMLElement>('[aria-label="Annotations at caret"]')!;check(!!monitor,'actual Ink annotation command opens an application-owned inspector');
  const field=monitor.querySelector<HTMLTextAreaElement>('textarea')!;field.focus();field.select();await trusted({type:'text',text:'{"draft":true}'});
  await editor.commandRegistry.execute('thesis.open',{targetKey:projection.state.rootKey,args:undefined});await settle();await settle();
  const thesis=document.querySelector<HTMLElement>('.thesis-host')!,thesisId=thesis.closest<HTMLElement>('[data-mwm-window]')!.dataset.mwmWindow!;
  check(monitor.isConnected&&field.value==='{"draft":true}','inspector pending fields survive unrelated actual Thesis launch');
  const th=thesis.getBoundingClientRect();await trusted({type:'click',x:th.x+15,y:th.y+15});
  check(monitor.isConnected,'modeless inspector survives pointer activation of another application');
  manager!.lifecycle.reveal(win.key);await settle();const y=monitor.getBoundingClientRect().y;
  const metadata=JSON.parse(JSON.stringify(win.payload.metadata));editor.commands.setPayloadField(win.key,'metadata',{...metadata,position:{x:25,y:metadata.position.y+45}});await settle();
  check(monitor.isConnected&&monitor.getBoundingClientRect().y!==y,'anchored inspector follows owner geometry without losing its form');
  manager!.lifecycle.minimize(win.key);await settle();check(!!monitor.closest('[hidden]')&&field.value==='{"draft":true}','owner minimization hides and retains the same inspector fields');
  manager!.lifecycle.reveal(win.key);await settle();check(!monitor.closest('[hidden]')&&field.value==='{"draft":true}','restoration reveals the retained inspector');
  await click(monitor.querySelector<HTMLButtonElement>('[aria-label="Close annotation monitor"]')!);await editor.closeView(thesisId);await settle();
  const frame=manager!.groups.get(win.key)!;await click(frame.querySelector<HTMLButtonElement>('.compact-toolbar__more')!);
  check(!!document.querySelector('[aria-label="More editor tools"]'),'compact tools remain a lightweight application overlay');
  editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),position:{x:60,y:85}});await settle();
  check(!document.querySelector('[aria-label="More editor tools"]'),'owner movement safely dismisses the ephemeral toolbar anchor');
  const resource=projection.node(text.key)!.contentKey,doc=Object.values(projection.state.nodes).find(n=>n.payload.id==='ink-doc')!;
  const viewId=projection.viewId;
  mount().focus();mount().restoreInlineSelection!({anchor:0,head:0});await trusted({type:'text',text:'Desktop '});await settle();
  const edited=mount().captureText!(),revision=editor.repository.state.revision,ids=Object.keys(editor.repository.state.contents).sort();
  await click(button('Canvas',host));check(session.presentation.active()==='canvas','existing Presentations control opens the managed Ink Document on Canvas');
  check(mount().captureText!()===edited&&projection.node(text.key)!.contentKey===resource&&projection.node(doc.key)!.payload.id==='ink-doc','Canvas preserves canonical Document/Block identity and unsaved text');
  check(editor.repository.state.revision===revision&&JSON.stringify(Object.keys(editor.repository.state.contents).sort())===JSON.stringify(ids),'presentation switch creates no canonical resource or edit');
  check(projection.viewId===viewId&&manager!.count()===0,'Canvas reuses the workspace projection without a duplicate managed desktop window');
  mount().focus();mount().restoreInlineSelection!({anchor:0,head:0});await trusted({type:'text',text:'Canvas '});await settle();const canvasText=mount().captureText!();
  editor.repository.undo();await settle();check(mount().captureText!()===edited,'canonical undo works on Canvas');editor.repository.redo();await settle();
  await click(button('Desktop',host));check(session.presentation.active()==='desktop'&&manager!.count()===1&&mount().captureText!()===canvasText,'return to Desktop restores management of the same edited canonical Document');
  check(!requests.some(r=>r.includes('/save')),'Desktop/Canvas interaction triggers no native or workspace Save');
  await editor.closeView(win.key);await settle();check(Object.keys(manager!.registry.surfaces).length===0,'owner close releases remaining application surfaces');
  return {milestone:'Phase E current-release completion',tools,checks,requests,browser:navigator.userAgent,canvasGuarantee:'Canonical resource/history continuity through existing presentation switch; component DOM/session retention is not claimed.'};
 }finally{input();stop();session.dispose();host.remove();window.fetch=originalFetch;}
}
