import { render } from 'solid-js/web';
import { createEffect, createRoot } from 'solid-js';
import { WorkspaceSession } from './workspace-session';
import { WorkspacePresentationView } from './workspace-presentation-view';
import { materializeLocalWorkspace } from '../reactive-editor/workspace-manifest';
import { nativeDocumentSession } from '../persistence/native-session';
import { captureNative, nativeText } from '../persistence/native-resource';
import { createAutocompleteFeature } from '../features/autocomplete';
import type { CompletionSession } from '../features/autocomplete/session';
import { parseTabCommand, tabLocation } from '../runtime/tab-commands';
import { paragraph, resource } from './tab-orientation.browser-fixture';
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function until(predicate:()=>boolean,label:string){const end=performance.now()+10000;while(!predicate()){if(performance.now()>end)throw Error(label);await new Promise(r=>setTimeout(r,15));}}
async function trusted(action:Record<string,unknown>):Promise<any>{return new Promise((resolve,reject)=>{(globalThis as any).__tabsResume=(value:any)=>value.error?reject(Error(value.error)):resolve(value.result);(globalThis as any).tabsInput(JSON.stringify(action));});}
async function click(el:HTMLElement){el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();await trusted({type:'click',x:r.x+r.width/2,y:r.y+r.height/2});}
export async function qualifyTabCommands(){
 const checks:string[]=[],check=(value:unknown,label:string)=>{if(!value)throw Error(label);checks.push(label);};
 const resources=new Map([['commands-primary',resource('commands-primary',[paragraph('command-source',340)])],['commands-unrelated',resource('commands-unrelated',[paragraph('other-source')])]]);
 const originalFetch=window.fetch;let requests=0;
 window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{requests++;if(String(input)==='/api/native/open'){const id=JSON.parse(String(init?.body)).location.filename.replace('.mutable.json','');return new Response(JSON.stringify({Success:true,Data:{kind:'native',resourceId:id,native:resources.get(id),baseline:{nativeHash:'fixture-'+id,markdownHash:null,generation:null},readOnly:false}}),{headers:{'Content-Type':'application/json'}});}return new Response(JSON.stringify({Success:false,Error:'Isolated qualification'}),{status:503});}) as typeof fetch;
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'canvas-background-block',children:[]},{type:'workspace-object-bank-block',children:[]}]}),{features:{nativeKnowledge:false,entityReferences:false,desktopApplicationIcons:false,flintMaterialChrome:false,flintProbe:false}}),e=session.editor,native=nativeDocumentSession(e);
 const host=document.body.appendChild(document.createElement('main'));host.className='workspace-demo workspace-demo--canonical';host.dataset.windowWorkArea='';
 const dispose=render(()=><WorkspacePresentationView session={session}/>,host),input=e.installGateway(document),cleanups:(()=>void)[]=[];
 if(!e.completionInput)e.featureHost.activate(createAutocompleteFeature(e));
 const timings:any[]=[],events:any[]=[];let pending:((start:number)=>void)|undefined;
 const key=(event:KeyboardEvent)=>{if(event.key==='Enter'&&pending){const next=pending;pending=undefined;const start=event.timeStamp;requestAnimationFrame(()=>next(start));}};
 document.addEventListener('keydown',key,true);
 const observer=new PerformanceObserver(list=>{for(const event of list.getEntries())if(event.name==='keydown')events.push({start:event.startTime,duration:event.duration});});observer.observe({type:'event',buffered:true,durationThreshold:16} as PerformanceObserverInit);
 try{
  for(const id of resources.keys())await native.open({folder:'.',filename:id+'.mutable.json'});
  await e.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
  await until(()=>!!host.querySelector('[data-block-id="command-source"] .reactive-standoff-flow'),'Flint source');await frame();
  const flow=()=>host.querySelector<HTMLElement>('.reactive-tabs__panel:not([hidden]) .reactive-standoff-flow')!;
  const current=()=>e.node(e.mounts.resolveElement(document.activeElement)?.nodeKey??e.focus.state.focusedKey!)!;
  const completion=()=> (e.overlays.overlays.find(o=>o.viewType==='autocomplete')?.data as {session:CompletionSession}|undefined)?.session;
  const saved=()=>nativeText(captureNative(e.repository.readState(),'commands-primary'));
  const counters={snapshots:0,builds:0,unrelatedUpdates:0,statusUpdates:0};
  const patch=(object:any,method:string,count:keyof typeof counters)=>{const original=object[method];object[method]=function(...args:any[]){counters[count]++;return original.apply(this,args);};cleanups.push(()=>object[method]=original);};
  patch(e.repository,'snapshot','snapshots');const watched=new Set();const watch=()=>{for(const view of e.projections.values())if(!watched.has(view)){watched.add(view);patch(view,'build','builds');}};
  const unrelated=Object.values(session.projection.state.nodes).find(n=>n.payload.id==='commands-unrelated')!;
  const other=e.createView('tab-commands-unrelated',unrelated.placementKey);patch(other,'setState','unrelatedUpdates');
  createRoot(stop=>{cleanups.push(stop);createEffect(()=>{native.status('commands-unrelated');counters.statusUpdates++;});});
  const clear=()=>{watch();for(const k of Object.keys(counters) as (keyof typeof counters)[])counters[k]=0;};
  async function command(text:string,verify:()=>boolean,shared=false){
   const active=flow();await click(active);const source=current();e.mounts.get(source.key)!.restoreInlineSelection!({anchor:0,head:0});await trusted({type:'text',text:'/'});await trusted({type:'text',text});
   await until(()=>completion()?.state.selected===parseTabCommand(text)!.id,'Command candidate '+text);
   const literal=saved();if(text==='tabs create vertical'&&!timings.length)await trusted({type:'screenshot',name:'command-bar'});
   clear();const calls=requests,start=performance.now();let verified=false;
   timings.push({command:text,shared});const timing=timings.at(-1);pending=start=>{const inspect=()=>{if(verify()){verified=true;timing.enterToVerifiedLayoutMs=performance.now()-start;timing.start=start;}else requestAnimationFrame(inspect);};inspect();};
   await trusted({type:'key',key:'Enter'});await until(()=>!completion(),'Command closes '+text);await until(()=>verified,'Rendered command '+text);
   timings.at(-1).roundTripMs=performance.now()-start;
   check(Object.values(counters).every(n=>n===0)&&requests===calls,text+' has no snapshots, projection rebuilds, unrelated updates or requests'+(shared?' (shared)':'')+' '+JSON.stringify(counters));
   check(!flow().textContent?.includes('/'+text),text+' consumes its literal invocation');
   const result=saved();e.repository.undo();await frame();check(saved()===literal,text+' Undo restores literal and structure');e.repository.redo();await frame();check(saved()===result,text+' Redo restores result');
   check(Object.values(counters).every(n=>n===0),text+' history remains bounded');
  }
  await command('tabs create vertical',()=>host.querySelector('[data-block-type="tab-row-block"]')?.getAttribute('data-tab-orientation')==='vertical'||!!host.querySelector('.abstract-block.reactive-tabs[data-tab-orientation="vertical"]'));
  await command('tabs orientation horizontal',()=>!!host.querySelector('.abstract-block.reactive-tabs[data-tab-orientation="horizontal"]'));
  await command('tabs orientation vertical',()=>!!host.querySelector('.abstract-block.reactive-tabs[data-tab-orientation="vertical"]'));
  await command('tab rename Research : α',()=>[...host.querySelectorAll('[role=tab]')].some(el=>el.textContent==='Research : α'));
  await command('tab add',()=>host.querySelectorAll('.abstract-block.reactive-tabs > .reactive-tabs__labels > [role=tab]').length===2);
  await command('tab rename Second',()=>[...host.querySelectorAll('[role=tab]')].some(el=>el.textContent==='Second'));
  await command('tab move before',()=>host.querySelector('.abstract-block.reactive-tabs > .reactive-tabs__labels > [role=tab]')?.textContent==='Second');
  await command('tab move after',()=>host.querySelector('.abstract-block.reactive-tabs > .reactive-tabs__labels > [role=tab]:last-child')?.textContent==='Second');
  await command('tab delete',()=>host.querySelectorAll('.abstract-block.reactive-tabs > .reactive-tabs__labels > [role=tab]').length===1);
  await command('tabs create horizontal',()=>host.querySelectorAll('.abstract-block.reactive-tabs').length===2);
  await trusted({type:'screenshot',name:'nested-tabs'});
  const nestedSource=current(),innerScope=tabLocation(e,nestedSource.key)!.row,outerScope=tabLocation(e,nestedSource.key,true,'vertical')!.row,outerTab=tabLocation(e,nestedSource.key,true,'vertical')!.tab!;
  e.commands.structuralTransaction('Targeting fixture peer',()=>e.commands.insert({id:'target-peer',type:'tab-block',metadata:{name:'Peer'},children:[{id:'target-peer-text',type:'standoff-editor-block',text:''}]},{kind:'at',parentKey:outerScope.key,index:outerScope.children.length}));await frame();
  await command('tab rename Outer --in vertical',()=>(e.node(outerTab.key)?.payload.metadata as any)?.name==='Outer');
  check(e.node(innerScope.key)!.children.length===1,'Outer rename leaves the nested horizontal row unchanged');
  const labels=host.querySelector<HTMLElement>('.flint-application__editor > .reactive-tabs > .reactive-tabs__labels')!;
  const selected=labels.querySelector<HTMLElement>('[aria-selected=true]')!,inactive=labels.querySelector<HTMLElement>('[aria-selected=false]')!;
  check(getComputedStyle(selected).backgroundColor==='rgb(246, 243, 236)'&&getComputedStyle(inactive).backgroundColor==='rgb(250, 248, 243)','Flint active and inactive Tab fills are reversed');
  await command('tab move after --in vertical',()=>e.node(outerScope.key)!.children.at(-1)===outerTab.key);
  await command('tab move before --in vertical',()=>e.node(outerScope.key)!.children[0]===outerTab.key);
  await command('tab add --in vertical',()=>e.node(outerScope.key)!.children.length===3);
  check(e.node(innerScope.key)!.children.length===1,'Outer add creates a sibling vertical Tab without adding a horizontal Tab');
  await click([...host.querySelectorAll<HTMLElement>('[role=tab]')].find(label=>label.textContent==='Outer')!);await frame();
  await trusted({type:'screenshot',name:'ancestor-targeting'});
  await command('tab delete --in vertical',()=>e.node(outerScope.key)!.children.length===2&&!e.node(outerTab.key));

  // Restore a horizontal inner row so shared qualification measures a real orientation change.
  await command('tabs create horizontal',()=>host.querySelectorAll('.abstract-block.reactive-tabs').length===2);
  for(let i=0;i<13;i++){const id='tab-extra-'+i;resources.set(id,resource(id,i===12?Array.from({length:80},(_,j)=>paragraph('extra-'+i+'-'+j)): [paragraph('extra-'+i)]));await native.open({folder:'.',filename:id+'.mutable.json'});}
  const source=current(),at=tabLocation(e,source.key)!,owner=e.projections.get(at.row.viewId)!.parentOf(at.row.key)!;
  e.commands.transclude(at.row.key,{kind:'at',parentKey:owner.key,index:owner.children.length});await frame();
  await command('tabs orientation vertical',()=>[...host.querySelectorAll('.abstract-block.reactive-tabs')].every(el=>el.getAttribute('data-tab-orientation')==='vertical'),true);
  await command('tab rename Shared',()=>[...host.querySelectorAll('[role=tab]')].filter(el=>el.textContent==='Shared').length===2,true);
  await trusted({type:'screenshot',name:'shared-tabs'});
  // Separate media fixture: wrapping/reordering must preserve its browsing context.
  const doc=Object.values(session.projection.state.nodes).find(n=>n.payload.id==='commands-primary')!;
  const mediaPlacement=e.commands.insert({id:'tab-media-container',type:'container-block',children:[{id:'tab-media',type:'iframe-block',url:'about:blank'}]},{kind:'at',parentKey:doc.key,index:doc.children.length});await frame();await new Promise(r=>setTimeout(r,100));
  const iframe=host.querySelector<HTMLIFrameElement>('[data-block-id="tab-media"] iframe')!,windowBefore=iframe.contentWindow,documentBefore=iframe.contentDocument;(iframe.contentWindow as any).tabSentinel='retained';
  const mediaSource=e.node(e.mounts.resolveElement(iframe)!.nodeKey)!;
  const container=e.projections.get(mediaSource.viewId)!.parentOf(mediaSource.key)!;
  e.commandRegistry.execute('tabs.create.vertical',{targetKey:container.key,args:undefined});await frame();
  const intact=()=>iframe.isConnected&&iframe.contentWindow===windowBefore&&iframe.contentDocument===documentBefore&&(iframe.contentWindow as any).tabSentinel==='retained';
  check(intact(),'Creation preserves the live iframe Document');e.repository.undo();await frame();check(intact(),'Creation Undo preserves live iframe');e.repository.redo();await frame();check(intact(),'Creation Redo preserves live iframe');
  const mediaNode=e.nodeForPlacementInView(mediaPlacement,container.viewId)!,mediaRow=tabLocation(e,mediaNode.key)!.row;
  e.commands.insert({id:'media-peer',type:'tab-block',metadata:{name:'Peer'},children:[]},{kind:'at',parentKey:mediaRow.key,index:1});
  e.commandRegistry.execute('tab.move.after',{targetKey:mediaNode.key,args:undefined});await frame();check(intact(),'Reordering preserves live iframe');e.repository.undo();await frame();check(intact(),'Reordering Undo preserves live iframe');
  await new Promise(r=>setTimeout(r,120));
  return {passed:checks.length,checks,timings:timings.map(t=>({...t,enterToNextPaintMs:events.find(event=>Math.abs(event.start-t.start)<2)?.duration})),nativeDocuments:resources.size,note:'Trusted Chrome text input and Enter; layout checks run on the first animation callback after Enter. Event Timing has 8ms quantisation and a 16ms reporting threshold. No physical-display guarantee.'};
 }finally{observer.disconnect();document.removeEventListener('keydown',key,true);cleanups.reverse().forEach(f=>f());input();dispose();session.dispose();host.remove();window.fetch=originalFetch;}
}
