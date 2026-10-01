/** Isolated real application/server controls. Production modules have no test hooks. */
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {nativeDocumentSession} from '../../persistence/native-session';
export {observeHeartbeat} from './p3-browser';
const delay=(n:number)=>new Promise(r=>setTimeout(r,n));
export async function setup(root:string,count:number){
 const t=performance.now(),session=new WorkspaceSession(materializeLocalWorkspace({id:crypto.randomUUID(),type:'workspace-block',children:[]}),{features:{nativeKnowledgeSaved:true,publicHostedVersion:false}}),editor=session.editor;
 const launch=()=>editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});launch();launch();
 const host=document.body.appendChild(document.createElement('div'));host.className='workspace-demo workspace-demo--canonical';host.style.cssText='position:fixed;inset:0;background:#eee;overflow:auto';
 const dispose=render(()=><WorkspacePresentationView session={session}/>,host);editor.installGateway(document);
 const factory=(globalThis as any).__p5Hosts.at(-1),knowledge=factory.host,native=nativeDocumentSession(editor);
 const windows=()=>[...host.querySelectorAll<HTMLElement>('.flint-application')];let win=windows()[0];
 const wait=async(f:()=>boolean,budget=120000)=>{const until=performance.now()+budget;while(!f()){if(performance.now()>until)throw Error('UI wait: '+win.textContent?.slice(-1500));await delay(20);}};
 const click=(label:string)=>{const b=[...win.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label);if(!b||b.disabled)throw Error('Unavailable '+label);b.click();};
 const field=(label:string,value:string)=>{const e=win.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));};
 const id=()=>win.querySelector('[data-flint-property="id"]')?.textContent;
 const scoped=()=>[...knowledge.scopes.values()][0] as any;
 const state=()=>{const scope=scoped();return {resources:scope?[...scope.slots.values()].filter((s:any)=>s.entry&&knowledge.index.eligible(s.entry)).length:0,complete:!!scope&&scope.completedEpoch===knowledge.epoch,bytes:knowledge.index.retainedBytes,metrics:{...knowledge.metrics},saved:{...scope?.port.savedMetrics?.()},bindings:native.knowledgeBindings().length};};
 const search=async(q='mountains')=>{const start=performance.now();field('Search vault',q);click('Search vault');await wait(()=>{const m=win.textContent?.match(/(\d+) results ·/);return !!m&&win.querySelectorAll('.flint-search-hit').length===Number(m[1]);});return {elapsedMs:performance.now()-start,hits:win.querySelectorAll('.flint-search-hit').length,status:win.querySelector('.flint-knowledge [role="status"]')?.textContent};};
 const currentNode=()=>{const resource=id(),view=[...editor.projections.values()].find(p=>p!==session.projection&&(p.state.nodes[p.state.rootKey].payload.metadata as any)?.documentId===resource);return view&&Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block');};
 return {editor,session,host,get win(){return win;},state,search,constructionMs:performance.now()-t,
  async open(){const start=performance.now();field('Vault directory',root);click('Open Vault');await wait(()=>win.querySelector('[aria-label="Selected folder"]')?.textContent===root);return {discoveryMs:performance.now()-start,state:state()};},
  async partial(){const start=performance.now();await wait(()=>state().resources>0);return {elapsedMs:performance.now()-start,state:state(),query:await search()};},
  async complete(){const start=performance.now();await knowledge.flush();return {elapsedMs:performance.now()-start,state:state()};},
  async sharing(){const before=state();win=windows().at(-1)!;const open=performance.now();field('Vault directory',root);click('Open Vault');await wait(()=>win.querySelector('[aria-label="Selected folder"]')?.textContent===root);await delay(200);return {elapsedMs:performance.now()-open,before,after:state()};},
  async activate(){await search('mountains');const hit=win.querySelector<HTMLButtonElement>('[data-search-document="resource-0"]')!;if(!hit)throw Error('Saved selected source absent');const before=state(),other=windows().filter(w=>w!==win).map(w=>w.querySelector('[data-flint-property="id"]')?.textContent),start=performance.now();hit.click();await wait(()=>id()==='resource-0');await wait(()=>{const n=editor.node(editor.focus.state.focusedKey!);const range=n&&editor.mounts.get(n.key)?.captureInlineSelection?.();return n?.payload.id==='resource-0-p0'&&!!range&&range.head>range.anchor;},30000);
   return {elapsedMs:performance.now()-start,before,after:state(),id:id(),otherBefore:other,otherAfter:windows().filter(w=>w!==win).map(w=>w.querySelector('[data-flint-property="id"]')?.textContent),selection:editor.mounts.get(editor.focus.state.focusedKey!)?.captureInlineSelection?.(),message:win.querySelector('.flint-knowledge')?.textContent?.slice(-200)};},
  async input(){const node=currentNode()!;editor.focus.request(node.key);editor.mounts.get(node.key)?.restoreInlineSelection?.({anchor:0,head:0});const samples:number[]=[];for(let i=0;i<20;i++){const t=performance.now();editor.commands.replaceInlineRange(node.key,0,1,i%2?'L':'l');samples.push(performance.now()-t);await delay(20);}return {medianMs:[...samples].sort((a,b)=>a-b)[10],maxMs:Math.max(...samples),state:state()};},
  async refresh(){const t=performance.now();click('Refresh');await wait(()=>![...win.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Refresh')!.disabled);return {elapsedMs:performance.now()-t,state:state()};},
  async cancel(){field('Search vault','mountains');click('Search vault');field('Search vault','cancelled');await delay(100);return {published:win.querySelectorAll('.flint-search-hit').length};},
  async dispose(){const t=performance.now();dispose();session.dispose();await factory.dispose();host.remove();return {elapsedMs:performance.now()-t,bytes:knowledge.index.retainedBytes};},
 };
}
